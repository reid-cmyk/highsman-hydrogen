import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes Team — Daily Route Builder (3-tier model, v2)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vibes-route?repId=...&debug=1
// Returns today's route for a brand rep, in three priority tiers:
//   Tier 1 ONBOARDING  — Open deals w/ [TIER:ONBOARDING] marker (or legacy
//                        sales-floor-signed deals in the Needs Onboarding
//                        pipeline without an explicit tier marker)
//   Tier 2 TRAINING    — Open deals w/ [TIER:TRAINING] marker
//   Tier 3 CHECK-IN    — NJ Accounts with Total_Orders_Count ≥ 1 AND
//                        Visit_Date is null OR ≥ 30 days stale
//
// Response shape is kept as `{fresh, targets, rotation}` so /vibes index
// doesn't need to re-wire — the semantic shift is server-side only. Reps
// looking at the index see:
//   fresh    → Tier 1 Onboarding (60 min dwell)
//   targets  → Tier 2 Training (60 min dwell)
//   rotation → Tier 3 Check-In (30 min dwell)
//
// For the richer route with Google Routes + per-stop briefs, /vibes/today
// pulls from /api/vibes-daily-route. This endpoint stays lightweight — no
// Google API spend — so the /vibes index can load fast on first paint.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';
const CHECKIN_CADENCE_DAYS = 30;

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

// RouteStop shape the /vibes index already consumes. Kept 1:1.
//   tier          : legacy label used by the client for color + sort
//   daysSinceClosed : only meaningful for FRESH (= days since deal opened)
//   daysSinceLast   : meaningful for ROTATION (= days since Vibes visit)
//   leadId          : never used in the new model (was Tier 2 Sampling Leads);
//                     left null so the client's Lead-stop branch falls through
type StopType = 'FRESH' | 'TARGET' | 'ROTATION';
type RouteStop = {
  tier: StopType;
  accountId: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lastVibesVisit: string | null;
  daysSinceLast: number | null;
  daysSinceClosed?: number | null;
  leadId?: string | null;
  meta?: Record<string, any>;
};

// Normalize a raw Zoho state value to a 2-letter code. Tolerates "NJ",
// "New Jersey", "new jersey", trailing whitespace. Returns null for empty.
function normalizeStateToCode(raw: any): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (s.length === 2) return s.toUpperCase();
  const lower = s.toLowerCase();
  if (lower === 'new jersey') return 'NJ';
  return s;
}

function accountIsNJ(acct: any): boolean {
  const candidates = [
    normalizeStateToCode(acct?.Account_State),
    normalizeStateToCode(acct?.Billing_State),
    normalizeStateToCode(acct?.Shipping_State),
  ];
  return candidates.some((c) => c === 'NJ');
}

// ─── Fetch all open Vibes deals (both tiers) ─────────────────────────────────
// Paginates the Needs Onboarding pipeline and keeps deals that were
// sales-floor-signed AND not closed. Returns raw deals with Description so the
// caller can bucket by tier marker.
async function fetchOpenVibesDeals(token: string): Promise<any[]> {
  const out: any[] = [];
  let page = 1;
  while (page <= 10) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
    url.searchParams.set('criteria', `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`);
    url.searchParams.set(
      'fields',
      'id,Deal_Name,Pipeline,Stage,Closing_Date,Created_Time,Account_Name,Description',
    );
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) break;
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    out.push(...rows);
    if (!data.info?.more_records) break;
    page++;
  }
  // Signature filter + skip closed.
  return out.filter((d) => {
    const desc = typeof d?.Description === 'string' ? d.Description : '';
    if (!desc.includes(SALES_FLOOR_SIGNATURE)) return false;
    const stage = (d.Stage || '').toLowerCase();
    if (stage.includes('closed')) return false;
    return true;
  });
}

// ─── Fetch a batch of Accounts by id ────────────────────────────────────────
// Used to enrich deal → account (address + state + phone + Visit_Date).
// Chunks by 10 to stay under Zoho's criteria-length ceiling.
async function fetchAccountsByIds(
  ids: string[],
  token: string,
): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (ids.length === 0) return result;
  const fields =
    'id,Account_Name,Billing_Street,Billing_City,Billing_State,Shipping_State,Account_State,Phone,Visit_Date,Total_Orders_Count';
  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const criteria = `(${chunk.map((id) => `(id:equals:${id})`).join('or')})`;
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set('criteria', criteria);
    url.searchParams.set('fields', fields);
    url.searchParams.set('per_page', '200');
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) continue;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const r of rows) result.set(r.id, r);
  }
  return result;
}

// ─── Fetch all NJ Accounts (for Tier 3 check-in pool) ───────────────────────
// Paginated broad pull. We keep accounts with Total_Orders_Count ≥ 1 so
// check-ins only rotate through shops that actually stock Highsman.
async function fetchNjAccounts(token: string): Promise<any[]> {
  const rows: any[] = [];
  let page = 1;
  while (page <= 20) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set(
      'criteria',
      `((Billing_State:equals:NJ)or(Billing_State:equals:New Jersey)or(Account_State:equals:NJ))`,
    );
    url.searchParams.set(
      'fields',
      'id,Account_Name,Billing_Street,Billing_City,Billing_State,Shipping_State,Account_State,Phone,Visit_Date,Total_Orders_Count',
    );
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) break;
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const batch = Array.isArray(data?.data) ? data.data : [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (!data.info?.more_records) break;
    page++;
  }
  return rows;
}

function daysBetween(earlier: Date, later: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86400000);
}

// ─── LOADER ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const repId = url.searchParams.get('repId') || null;
  const wantDebug = url.searchParams.get('debug') === '1';
  const env = (context as any).env || {};

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

  const debug: any = {
    dealsFetched: 0,
    dealsAfterFilter: 0,
    onboarding: [] as string[],
    training: [] as string[],
    rotationCandidates: 0,
    rotationKept: 0,
    droppedNotNJ: [] as string[],
  };

  try {
    const token = await getZohoToken(env);

    // 1) Pull open Vibes deals + NJ accounts in parallel.
    const [openDeals, njAccounts] = await Promise.all([
      fetchOpenVibesDeals(token),
      fetchNjAccounts(token),
    ]);
    debug.dealsFetched = openDeals.length;

    // 2) Resolve deal → account enrichment. Some deal accounts may live
    //    outside Billing_State='NJ' during data-cleanup — force-fetch those
    //    by id so a shop with a messy state field still renders.
    const dealAccountIds = Array.from(
      new Set(
        openDeals
          .map((d) => (d.Account_Name && d.Account_Name.id) || null)
          .filter(Boolean),
      ),
    ) as string[];

    const njById = new Map<string, any>();
    for (const a of njAccounts) njById.set(a.id, a);
    const missing = dealAccountIds.filter((id) => !njById.has(id));
    const missingMap = await fetchAccountsByIds(missing, token);
    const accountById = new Map<string, any>();
    for (const [id, a] of njById) accountById.set(id, a);
    for (const [id, a] of missingMap) accountById.set(id, a);

    // 3) Bucket open deals into ONBOARDING vs TRAINING by marker. Legacy
    //    sales-floor deals without a marker fall into ONBOARDING (pre-v2
    //    default).
    const onboardingDeals: any[] = [];
    const trainingDeals: any[] = [];
    for (const d of openDeals) {
      const desc = typeof d?.Description === 'string' ? d.Description : '';
      if (desc.includes(TIER_MARKER_TRAINING)) {
        trainingDeals.push(d);
      } else {
        // Explicit [TIER:ONBOARDING] OR legacy unmarked sales-floor deal.
        onboardingDeals.push(d);
      }
    }
    debug.dealsAfterFilter = onboardingDeals.length + trainingDeals.length;

    // Helper to turn a deal into a RouteStop in the "fresh" (onboarding) /
    // "targets" (training) shape the client expects.
    function dealToStop(d: any, tier: StopType): RouteStop | null {
      const acctRef = d.Account_Name;
      if (!acctRef?.id) return null;
      const acct = accountById.get(acctRef.id);
      if (!acct) return null;
      if (!accountIsNJ(acct)) {
        debug.droppedNotNJ.push(acct.Account_Name || acctRef.name || '—');
        return null;
      }
      const closedDate = d.Closing_Date || d.Created_Time;
      const daysSinceClosed = closedDate
        ? Math.floor(
            (Date.now() - new Date(closedDate).getTime()) / (1000 * 60 * 60 * 24),
          )
        : null;
      return {
        tier,
        accountId: acct.id,
        name: acct.Account_Name || acctRef.name || '—',
        street: acct.Billing_Street || null,
        city: acct.Billing_City || null,
        state: 'NJ',
        phone: acct.Phone || null,
        lastVibesVisit: acct.Visit_Date || null,
        daysSinceLast: null,
        daysSinceClosed,
      };
    }

    const freshRaw = onboardingDeals
      .map((d) => dealToStop(d, 'FRESH'))
      .filter(Boolean) as RouteStop[];
    const targetsRaw = trainingDeals
      .map((d) => dealToStop(d, 'TARGET'))
      .filter(Boolean) as RouteStop[];

    // Dedup within each tier (one deal per account wins; happens if Sky
    // accidentally booked two of the same tier before dedup was tightened).
    function dedupByAccount(stops: RouteStop[]): RouteStop[] {
      const seen = new Set<string>();
      return stops.filter((s) => {
        if (seen.has(s.accountId)) return false;
        seen.add(s.accountId);
        return true;
      });
    }
    const fresh = dedupByAccount(freshRaw);
    const targets = dedupByAccount(targetsRaw);
    for (const s of fresh) debug.onboarding.push(s.name);
    for (const s of targets) debug.training.push(s.name);

    // 4) Tier 3 CHECK-IN: NJ accounts with Total_Orders_Count ≥ 1 AND
    //    Visit_Date null-or-stale (≥ 30 days). Exclude any account that's
    //    already represented by an Onboarding or Training deal today (those
    //    are covered by a higher-priority tier and would double-book).
    const tier12Ids = new Set<string>();
    for (const s of fresh) tier12Ids.add(s.accountId);
    for (const s of targets) tier12Ids.add(s.accountId);

    const rotationRaw: RouteStop[] = [];
    const nowUtc = new Date();
    for (const a of njAccounts) {
      if (tier12Ids.has(a.id)) continue;
      const orderCount = Number(a.Total_Orders_Count || 0);
      if (orderCount < 1) continue;
      debug.rotationCandidates++;
      const lastVisit = a.Visit_Date
        ? new Date(`${a.Visit_Date}T12:00:00Z`)
        : null;
      let stale: number | null = null;
      if (lastVisit && !isNaN(lastVisit.getTime())) {
        stale = daysBetween(lastVisit, nowUtc);
        if (stale < CHECKIN_CADENCE_DAYS) continue; // not due yet
      } else {
        // Never visited — surface it; the rep's first in-store visit is the
        // biggest cadence win we've got.
        stale = null;
      }
      rotationRaw.push({
        tier: 'ROTATION',
        accountId: a.id,
        name: a.Account_Name,
        street: a.Billing_Street || null,
        city: a.Billing_City || null,
        state: 'NJ',
        phone: a.Phone || null,
        lastVibesVisit: a.Visit_Date || null,
        daysSinceLast: stale,
      });
    }
    // Sort: oldest first (nulls = never visited, highest priority).
    const rotation = rotationRaw.sort((a, b) => {
      const da = a.daysSinceLast ?? 9999;
      const db = b.daysSinceLast ?? 9999;
      return db - da;
    });
    debug.rotationKept = rotation.length;

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
    if (wantDebug) responseBody.debug = debug;
    return json(responseBody, {
      headers: {
        // Short cache — Sky books through the day, reps shouldn't sit on a
        // stale tile for long.
        'Cache-Control': wantDebug ? 'no-store' : 'public, max-age=120',
      },
    });
  } catch (err: any) {
    console.error('[api/vibes-route] Error:', err.message);
    return json(
      {ok: false, error: err.message, fresh: [], targets: [], rotation: []},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
