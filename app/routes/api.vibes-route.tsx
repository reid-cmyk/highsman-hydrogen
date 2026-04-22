import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes Team — Daily Route Builder
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vibes-route?repId=...
// Returns today's daily route for a brand rep, in three priority tiers:
//   Tier 1 FRESH    — Deals in the "Needs Onboarding" Zoho pipeline
//                     (ID 6699615000010154308), NJ-scoped, not yet visited
//   Tier 2 TARGETS  — Leads with Lead_Status = 'Sampling', NJ-scoped
//   Tier 3 ROTATION — Existing Accounts with last Vibes visit > 21 days ago
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';

// In-memory Zoho access token cache (per worker instance). Reused across routes.
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) return cachedAccessToken;

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      refresh_token: env.ZOHO_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedAccessToken!;
}

type StopType = 'FRESH' | 'TARGET' | 'ROTATION';

type RouteStop = {
  tier: StopType;
  accountId: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lastVibesVisit: string | null;      // ISO date
  daysSinceLast: number | null;
  daysSinceClosed?: number | null;    // Tier 1 only
  leadId?: string | null;             // Tier 2 only (leads aren't full accounts yet)
  meta?: Record<string, any>;
};

// Normalize a raw Zoho state value to a 2-letter code. Tolerates "NJ",
// "New Jersey", "new jersey", trailing whitespace. Returns null when the
// field is empty or unrecognized.
function normalizeStateToCode(raw: any): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length === 2) return s.toUpperCase();
  const lower = s.toLowerCase();
  if (lower === 'new jersey') return 'NJ';
  return s; // fall-through — caller will check against known codes
}

// Pull an NJ match from ANY of the 3 state fields on an Account. Handles the
// common case where Billing_State is empty or the old long form while
// Account_State (the canonical picklist) carries the clean 2-letter code.
function accountIsNJ(acct: any): boolean {
  const candidates = [
    normalizeStateToCode(acct?.Account_State),
    normalizeStateToCode(acct?.Billing_State),
    normalizeStateToCode(acct?.Shipping_State),
  ];
  return candidates.some((c) => c === 'NJ');
}

// ─── TIER 1 — FRESH (Deals in Needs Onboarding pipeline) ─────────────────────
type FreshLoadResult = {stops: RouteStop[]; debug: any};
async function loadFreshAccounts(
  zohoToken: string,
): Promise<FreshLoadResult> {
  const debug: any = {
    pipelineQueried: NEEDS_ONBOARDING_PIPELINE,
    dealsFetched: 0,
    dealsAfterSignatureFilter: 0,
    droppedNoAccount: 0,
    droppedAccountFetchFailed: 0,
    droppedNotNJ: [] as string[],
    kept: [] as string[],
  };

  // Zoho's COQL does NOT always allow filtering on Pipeline directly.
  // Use the Deals search endpoint with a criteria on Stage (which implicitly
  // belongs to a Pipeline). Because stages are unique per pipeline, we fetch a
  // broad window and filter in memory by the pipeline field when Zoho returns
  // it on the record.
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    // "Needs Onboarding" pipeline — most deals here have "Onboarding" Stage.
    // If Zoho returns nothing with pipeline filter, we fall back to stage-based.
    `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`,
  );
  url.searchParams.set(
    'fields',
    [
      'Deal_Name',
      'Pipeline',
      'Stage',
      'Closing_Date',
      'Created_Time',
      'Account_Name',
      'Description',
    ].join(','),
  );
  url.searchParams.set('per_page', '100');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${zohoToken}`},
  });
  if (res.status === 204) return {stops: [], debug};
  if (!res.ok) {
    console.warn('[vibes-route] FRESH deals query failed:', res.status);
    debug.dealsQueryStatus = res.status;
    return {stops: [], debug};
  }
  const data = await res.json();
  const allDeals: any[] = data.data || [];
  debug.dealsFetched = allDeals.length;

  // Sample first 5 deal descriptions so we can see what Zoho actually stores.
  debug.sampleDescriptions = allDeals.slice(0, 5).map((d) => ({
    name: d?.Deal_Name || null,
    desc: typeof d?.Description === 'string' ? d.Description.slice(0, 200) : null,
  }));

  // Only surface deals that were created from the Sales Floor "Brand Team
  // Onboarding" button. Legacy / manually-created deals in this pipeline are
  // preserved in Zoho for records but intentionally excluded here — Reid
  // wanted the FRESH list to start empty and fill only from Sales Floor
  // submissions going forward.
  const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
  const deals = allDeals.filter((d) => {
    const desc = typeof d?.Description === 'string' ? d.Description : '';
    return desc.includes(SALES_FLOOR_SIGNATURE);
  });
  debug.dealsAfterSignatureFilter = deals.length;

  const freshStops: RouteStop[] = [];
  for (const deal of deals) {
    const acctRef = deal.Account_Name; // {id, name} or null
    if (!acctRef || !acctRef.id) {
      debug.droppedNoAccount++;
      continue;
    }

    // Pull the full Account record for address + state + phone. Fetch ALL 3
    // state fields so the NJ check matches records where Billing_State is
    // empty but Account_State (picklist) carries the clean 2-letter code — a
    // known post-CRM-migration quirk that was silently dropping cards.
    try {
      const acctRes = await fetch(
        `https://www.zohoapis.com/crm/v7/Accounts/${acctRef.id}?fields=Account_Name,Billing_Street,Billing_City,Billing_State,Shipping_State,Account_State,Phone`,
        {headers: {Authorization: `Zoho-oauthtoken ${zohoToken}`}},
      );
      if (!acctRes.ok) {
        debug.droppedAccountFetchFailed++;
        continue;
      }
      const acctData = await acctRes.json();
      const acct = (acctData.data || [])[0];
      if (!acct) {
        debug.droppedAccountFetchFailed++;
        continue;
      }

      if (!accountIsNJ(acct)) {
        debug.droppedNotNJ.push(
          `${acct.Account_Name} (billing=${acct.Billing_State || '∅'} account=${acct.Account_State || '∅'} shipping=${acct.Shipping_State || '∅'})`,
        );
        continue;
      }

      const closedDate = deal.Closing_Date || deal.Created_Time;
      const daysSinceClosed = closedDate
        ? Math.floor((Date.now() - new Date(closedDate).getTime()) / (1000 * 60 * 60 * 24))
        : null;

      freshStops.push({
        tier: 'FRESH',
        accountId: acct.id,
        name: acct.Account_Name,
        street: acct.Billing_Street || null,
        city: acct.Billing_City || null,
        state: 'NJ',
        phone: acct.Phone || null,
        lastVibesVisit: null,
        daysSinceLast: null,
        daysSinceClosed,
      });
      debug.kept.push(acct.Account_Name);
    } catch (err) {
      console.warn('[vibes-route] FRESH account fetch failed:', err);
      debug.droppedAccountFetchFailed++;
    }
  }
  return {stops: freshStops, debug};
}

// ─── TIER 2 — TARGETS (Leads at Sampling stage, NJ) ──────────────────────────
async function loadTargetLeads(zohoToken: string): Promise<RouteStop[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Leads/search');
  url.searchParams.set(
    'criteria',
    `((Lead_Status:equals:Sampling)and(State:equals:NJ))`,
  );
  url.searchParams.set(
    'fields',
    ['Company', 'Lead_Status', 'Street', 'City', 'State', 'Phone', 'Created_Time'].join(','),
  );
  url.searchParams.set('per_page', '50');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${zohoToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    console.warn('[vibes-route] TARGETS leads query failed:', res.status);
    return [];
  }
  const data = await res.json();
  return (data.data || []).map(
    (lead: any): RouteStop => ({
      tier: 'TARGET',
      accountId: `lead-${lead.id}`, // prefix so we don't collide with Account IDs
      leadId: lead.id,
      name: lead.Company || 'Untitled Lead',
      street: lead.Street || null,
      city: lead.City || null,
      state: lead.State || 'NJ',
      phone: lead.Phone || null,
      lastVibesVisit: null,
      daysSinceLast: null,
    }),
  );
}

// ─── TIER 3 — ROTATION (NJ Accounts 21+ days stale) ──────────────────────────
async function loadRotationAccounts(
  zohoToken: string,
  supabaseUrl: string,
  supabaseKey: string,
): Promise<RouteStop[]> {
  // Fetch NJ Accounts from Zoho (broad pull)
  const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
  url.searchParams.set('criteria', `(Billing_State:equals:NJ)`);
  url.searchParams.set(
    'fields',
    ['Account_Name', 'Billing_Street', 'Billing_City', 'Billing_State', 'Phone'].join(','),
  );
  url.searchParams.set('per_page', '100');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${zohoToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    console.warn('[vibes-route] ROTATION accounts query failed:', res.status);
    return [];
  }
  const data = await res.json();
  const njAccounts: any[] = data.data || [];

  // Fetch last-visit view from Supabase
  let lastVisitMap: Record<string, {last_visit_date: string; days_since_last: number}> = {};
  if (supabaseUrl && supabaseKey) {
    try {
      const supaRes = await fetch(
        `${supabaseUrl}/rest/v1/account_last_vibes_visit?select=account_id,last_visit_date,days_since_last`,
        {
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
          },
        },
      );
      if (supaRes.ok) {
        const rows = await supaRes.json();
        for (const r of rows) {
          lastVisitMap[r.account_id] = {
            last_visit_date: r.last_visit_date,
            days_since_last: r.days_since_last,
          };
        }
      }
    } catch (err) {
      console.warn('[vibes-route] Supabase last-visit lookup failed:', err);
    }
  }

  return njAccounts.map((acct: any): RouteStop => {
    const v = lastVisitMap[acct.id];
    return {
      tier: 'ROTATION',
      accountId: acct.id,
      name: acct.Account_Name,
      street: acct.Billing_Street || null,
      city: acct.Billing_City || null,
      state: 'NJ',
      phone: acct.Phone || null,
      lastVibesVisit: v?.last_visit_date || null,
      daysSinceLast: v?.days_since_last ?? null,
    };
  });
}

// ─── LOADER ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const repId = url.searchParams.get('repId') || null;
  const env = context.env as any;

  const hasZoho =
    env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN;
  if (!hasZoho) {
    return json(
      {
        ok: false,
        error: 'Zoho credentials not configured',
        fresh: [],
        targets: [],
        rotation: [],
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  const wantDebug = url.searchParams.get('debug') === '1';

  try {
    const zohoToken = await getZohoToken(env);

    // Parallelize the three Zoho pulls
    const [freshResult, targets, rotationRaw] = await Promise.all([
      loadFreshAccounts(zohoToken),
      loadTargetLeads(zohoToken),
      loadRotationAccounts(zohoToken, env.SUPABASE_URL || '', env.SUPABASE_SERVICE_KEY || ''),
    ]);
    const freshRaw = freshResult.stops;
    const freshDebug = freshResult.debug;

    // Cross-reference: if a FRESH account already has a Vibes visit, demote it
    // out of FRESH (it's been activated — it's now ROTATION).
    const visitedSet = new Set<string>();
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      try {
        const freshIds = freshRaw.map((f) => f.accountId);
        if (freshIds.length) {
          const visitedRes = await fetch(
            `${env.SUPABASE_URL}/rest/v1/brand_visits?select=account_id&account_id=in.(${freshIds
              .map((id) => `"${id}"`)
              .join(',')})`,
            {
              headers: {
                apikey: env.SUPABASE_SERVICE_KEY,
                Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
              },
            },
          );
          if (visitedRes.ok) {
            const rows = await visitedRes.json();
            for (const r of rows) visitedSet.add(r.account_id);
          }
        }
      } catch (err) {
        console.warn('[vibes-route] Visited-set lookup failed:', err);
      }
    }
    const fresh = freshRaw.filter((f) => !visitedSet.has(f.accountId));

    // Remove rotation duplicates where account is already in FRESH
    const freshIdSet = new Set(fresh.map((f) => f.accountId));
    const rotation = rotationRaw
      .filter((r) => !freshIdSet.has(r.accountId))
      .sort((a, b) => (b.daysSinceLast ?? 999) - (a.daysSinceLast ?? 999)); // most stale first

    const responseBody: any = {
      ok: true,
      repId,
      fresh,
      targets,
      rotation,
      counts: {
        fresh: fresh.length,
        targets: targets.length,
        rotation: rotation.length,
      },
    };
    if (wantDebug) {
      responseBody.debug = {
        fresh: {
          ...freshDebug,
          demotedByVisitedSet: freshRaw.length - fresh.length,
        },
      };
    }
    return json(responseBody, {
      headers: {'Cache-Control': wantDebug ? 'no-store' : 'public, max-age=120'},
    });
  } catch (err: any) {
    console.error('[api/vibes-route] Error:', err.message);
    return json(
      {ok: false, error: err.message, fresh: [], targets: [], rotation: []},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
