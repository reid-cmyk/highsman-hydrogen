import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';
import {buildQrDataUrl, buildSignupUrl, makeSignupToken} from '~/lib/qr';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes Team — Store Profile bundle
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vibes-store?accountId=<zoho-account-id>
// Returns the full store-profile payload consumed by /vibes/store/:accountId:
//   • Zoho Account (name, address, phone, custom fields)
//   • Zoho Contacts grouped by role (Buyer / Manager / Owner / Head Budtender)
//   • Klaviyo budtender training (self-serve) matched to the store by dispensary
//   • Supabase live-training log + brand_visits for this account
//   • Vibes Training Panel payload — roster + % enrolled + per-store QR token
// ─────────────────────────────────────────────────────────────────────────────

const KLAVIYO_LIST_ID = 'WBSrLZ';
const COURSE_COMPLETED_METRIC_ID = 'UwTaBd';

// ─── Helpers ─────────────────────────────────────────────────────────────────
function normalizeStoreName(s: string): string {
  return (s || '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

type ContactRole =
  | 'buyer'
  | 'manager'
  | 'owner'
  | 'head_budtender'
  | 'budtender'
  | 'other';

function roleForTitle(title: string | null | undefined): ContactRole {
  const t = (title || '').toLowerCase();
  if (!t) return 'other';
  if (t.includes('owner')) return 'owner';
  if (t.includes('buyer') || t.includes('purchasing') || t.includes('procurement'))
    return 'buyer';
  if (t.includes('head') && t.includes('budtender')) return 'head_budtender';
  if (t.includes('manager') || t.includes('gm') || t.includes('director'))
    return 'manager';
  if (t.includes('budtender') || t.includes('associate')) return 'budtender';
  return 'other';
}

// ─── Zoho ────────────────────────────────────────────────────────────────────
async function fetchAccount(accountId: string, token: string) {
  const url = new URL(
    `https://www.zohoapis.com/crm/v7/Accounts/${accountId}`,
  );
  url.searchParams.set(
    'fields',
    [
      'Account_Name',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Billing_Code',
      'Phone',
      'Description',
      'Account_Type',
      'Visit_Date',
      'Email_to_book_pop_ups',
      'Link_for_Pop_Ups',
      'Email_for_Staff_Trainings',
      'Link_for_Staff_Training',
      'Number_of_Budtenders',
    ].join(','),
  );
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return null;
  const data = await res.json();
  return (data.data || [])[0] || null;
}

async function fetchContactsForAccount(accountId: string, token: string) {
  // Use the Related Lists endpoint: /Accounts/{id}/Contacts
  const url = new URL(
    `https://www.zohoapis.com/crm/v7/Accounts/${accountId}/Contacts`,
  );
  url.searchParams.set(
    'fields',
    ['First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile', 'Title'].join(','),
  );
  url.searchParams.set('per_page', '50');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    console.warn('[vibes-store] Contacts fetch failed:', res.status);
    return [];
  }
  const data = await res.json();
  const rows = data.data || [];
  return rows.map((c: any) => ({
    id: c.id,
    firstName: c.First_Name || '',
    lastName: c.Last_Name || '',
    name: [c.First_Name, c.Last_Name].filter(Boolean).join(' ').trim(),
    email: c.Email || null,
    phone: c.Phone || c.Mobile || null,
    title: c.Title || null,
    role: roleForTitle(c.Title),
  }));
}

// ─── Klaviyo ─────────────────────────────────────────────────────────────────
async function klaviyoFetch(url: string, apiKey: string) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${apiKey}`,
      Accept: 'application/json',
      revision: '2024-10-15',
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Klaviyo error ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchAllPages(url: string, apiKey: string) {
  const out: any[] = [];
  let next: string | null = url;
  while (next) {
    const data = await klaviyoFetch(next, apiKey);
    out.push(...(data.data || []));
    next = data.links?.next || null;
  }
  return out;
}

async function fetchKlaviyoBudtendersForStore(
  storeName: string,
  apiKey: string,
) {
  if (!apiKey || !storeName) return [];
  try {
    // Pull the full Budtender Education list (reuses existing list behavior).
    const idsUrl = `https://a.klaviyo.com/api/lists/${KLAVIYO_LIST_ID}/relationships/profiles/?page[size]=100`;
    const idRecords = await fetchAllPages(idsUrl, apiKey);
    const profileIds: string[] = idRecords.map((r: any) => r.id).filter(Boolean);
    if (!profileIds.length) return [];

    const target = normalizeStoreName(storeName);

    const profiles: any[] = [];
    const BATCH = 50;
    for (let i = 0; i < profileIds.length; i += BATCH) {
      const batch = profileIds.slice(i, i + BATCH);
      const idFilter = batch.map((id) => `"${id}"`).join(',');
      const url = `https://a.klaviyo.com/api/profiles/?filter=any(id,[${idFilter}])&fields[profile]=email,first_name,last_name,organization,properties,location,created&page[size]=100`;
      const chunk = await fetchAllPages(url, apiKey);
      profiles.push(...chunk);
    }

    // Keep only profiles whose dispensary / organization matches the store name.
    const matched = profiles.filter((p: any) => {
      const props = p.attributes?.properties || {};
      const disp = props.dispensary_name || p.attributes?.organization || '';
      return normalizeStoreName(String(disp)) === target;
    });
    if (!matched.length) return [];

    const matchedIds = new Set(matched.map((p: any) => p.id));

    // Pull all course-complete events, then keep the ones for our matched profiles.
    const eventsUrl = `https://a.klaviyo.com/api/events/?filter=equals(metric_id,"${COURSE_COMPLETED_METRIC_ID}")&include=profile&fields[event]=event_properties,datetime&page[size]=100&sort=-datetime`;
    let events: any[] = [];
    try {
      events = await fetchAllPages(eventsUrl, apiKey);
    } catch {
      events = [];
    }

    const eventsByProfile = new Map<string, any[]>();
    for (const ev of events) {
      const pid =
        ev.relationships?.profile?.data?.id ||
        ev.relationships?.profiles?.data?.[0]?.id ||
        ev.attributes?.profile_id;
      if (!pid || !matchedIds.has(pid)) continue;
      if (!eventsByProfile.has(pid)) eventsByProfile.set(pid, []);
      eventsByProfile.get(pid)!.push(ev);
    }

    return matched.map((p: any) => {
      const attrs = p.attributes || {};
      const props = attrs.properties || {};
      const evs = eventsByProfile.get(p.id) || [];
      const courseIds = new Set<string>();
      let lastActivity = attrs.created || '';
      for (const ev of evs) {
        const ep = ev.attributes?.event_properties || {};
        if (ep.course_id) courseIds.add(String(ep.course_id));
        const dt = ev.attributes?.datetime;
        if (dt && dt > lastActivity) lastActivity = dt;
      }
      return {
        profileId: p.id,
        firstName: attrs.first_name || '',
        lastName: attrs.last_name || '',
        email: attrs.email || '',
        method: 'self_serve' as const,
        coursesCompleted: Array.from(courseIds),
        courseCount: courseIds.size,
        lastActivity,
      };
    });
  } catch (err: any) {
    console.warn('[vibes-store] Klaviyo lookup failed:', err?.message || err);
    return [];
  }
}

// ─── Supabase ────────────────────────────────────────────────────────────────
async function supaGet(
  env: any,
  path: string,
): Promise<any[]> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return [];
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// ─── Training signup token helpers ──────────────────────────────────────────
// Each store gets exactly one active opaque QR token. It's minted lazily the
// first time Serena opens the store profile — she never has to "set up" the
// QR code. Rotating a token means revoking the old row (future feature);
// until then, the token is stable for the life of the store.
async function getOrMintSignupToken(
  env: any,
  accountId: string,
): Promise<string | null> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY || !accountId) return null;

  const existing = await supaGet(
    env,
    `training_signup_tokens?account_id=eq.${encodeURIComponent(accountId)}&revoked_at=is.null&select=token&limit=1`,
  );
  if (existing?.[0]?.token) return existing[0].token;

  const token = makeSignupToken();
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/training_signup_tokens`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          prefer: 'return=minimal',
        },
        body: JSON.stringify({token, account_id: accountId}),
      },
    );
    if (!res.ok) {
      console.warn('[vibes-store] mint token failed', res.status);
      return null;
    }
    return token;
  } catch (err) {
    console.warn('[vibes-store] mint token threw', err);
    return null;
  }
}

// Derive the per-store training status chip.
// Thresholds mirror the spec so the UI chip stays readable at a glance:
//   complete   — ≥100% of roster enrolled
//   needs_attn — roster known but 0 enrolled
//   stale      — has enrollments but none in the last 30 days
//   in_progress — any enrollment in the last 30 days
//   not_started — roster set, no one enrolled yet
//   no_roster  — Serena hasn't entered the headcount yet
function computeTrainingStatus(args: {
  enrolled: number;
  roster: number | null;
  lastSignupAt: string | null;
}):
  | 'no_roster'
  | 'not_started'
  | 'in_progress'
  | 'complete'
  | 'needs_attention'
  | 'stale' {
  const {enrolled, roster, lastSignupAt} = args;
  if (roster == null) return 'no_roster';
  if (enrolled === 0) return roster > 0 ? 'needs_attention' : 'not_started';
  if (enrolled >= roster) return 'complete';

  const ageMs = lastSignupAt
    ? Date.now() - new Date(lastSignupAt).getTime()
    : null;
  if (ageMs != null && ageMs > 30 * 24 * 60 * 60 * 1000) return 'stale';
  return 'in_progress';
}

// ─── Loader ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const accountId = (url.searchParams.get('accountId') || '').trim();
  if (!accountId) {
    return json({ok: false, error: 'accountId required'}, {status: 400});
  }

  const env = context.env as any;

  const hasZoho =
    env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN;
  if (!hasZoho) {
    return json(
      {
        ok: false,
        error: 'Zoho credentials not configured',
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const token = await getZohoToken(env);

    // Pull Zoho account + contacts in parallel
    const [account, contacts] = await Promise.all([
      fetchAccount(accountId, token),
      fetchContactsForAccount(accountId, token),
    ]);

    if (!account) {
      return json(
        {ok: false, error: 'Account not found in Zoho'},
        {status: 404},
      );
    }

    const storeName = account.Account_Name || '';

    // Kick off Klaviyo + Supabase lookups in parallel
    const [
      selfServeTraining,
      liveTraining,
      recentVisits,
      goodieRecent,
      trainingSummaryRows,
      rosterProfileRows,
      signupToken,
    ] = await Promise.all([
      fetchKlaviyoBudtendersForStore(storeName, env.KLAVIYO_PRIVATE_KEY),
      supaGet(
        env,
        `budtender_training?store_account_id=eq.${encodeURIComponent(accountId)}&method=eq.live&select=id,budtender_name,budtender_email,module_slug,module_title,completed_at,rep_id,visit_id,quiz_score&order=completed_at.desc&limit=50`,
      ),
      supaGet(
        env,
        `brand_visits?account_id=eq.${encodeURIComponent(accountId)}&select=id,rep_name,visit_date,visit_type,vibes_score,skus_on_shelf,decks_taught,budtenders_trained,goodie_total_spent,notes_to_sales_team,shelf_photo_url,before_photo_url,after_photo_url,selfie_url&order=visit_date.desc&limit=12`,
      ),
      supaGet(
        env,
        `goodie_log?store_account_id=eq.${encodeURIComponent(accountId)}&select=id,item,cost,spent_on,rep_id&order=spent_on.desc&limit=10`,
      ),
      supaGet(
        env,
        `store_training_summary?store_account_id=eq.${encodeURIComponent(accountId)}&select=*`,
      ),
      supaGet(
        env,
        `vibes_store_profiles?account_id=eq.${encodeURIComponent(accountId)}&select=account_id,account_name,budtender_headcount,headcount_updated_at&limit=1`,
      ),
      getOrMintSignupToken(env, accountId),
    ]);

    // Group contacts by role
    const contactsByRole: Record<ContactRole, any[]> = {
      owner: [],
      buyer: [],
      manager: [],
      head_budtender: [],
      budtender: [],
      other: [],
    };
    for (const c of contacts) {
      contactsByRole[c.role as ContactRole].push(c);
    }

    const lastVisit = recentVisits?.[0] || null;
    const daysSinceLastVisit = lastVisit
      ? Math.floor(
          (Date.now() - new Date(lastVisit.visit_date).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : null;

    // ── VibesTrainingPanel payload ───────────────────────────────────────────
    // Build the numbers the store-card panel renders at a glance. Roster lives
    // in Supabase (Serena-edited), enrollment comes from Klaviyo via the
    // `selfServeTraining` array above. We derive tier1 completion and last
    // activity from the same rows so enrolled/tier1/% all tell one story.
    const enrolled = Array.isArray(selfServeTraining)
      ? selfServeTraining.length
      : 0;
    const tier1Completed = Array.isArray(selfServeTraining)
      ? selfServeTraining.filter((b: any) =>
          Array.isArray(b.coursesCompleted)
            ? b.coursesCompleted.includes('meet-ricky')
            : false,
        ).length
      : 0;
    const lastSignupAt = Array.isArray(selfServeTraining)
      ? selfServeTraining.reduce<string | null>((max, b: any) => {
          const d = b.lastActivity || '';
          if (!d) return max;
          return !max || d > max ? d : max;
        }, null)
      : null;

    // Roster: prefer the Serena-edited Supabase value. Fall back to the Zoho
    // `Number_of_Budtenders` field so stores we haven't formally onboarded yet
    // still show a denominator when one exists upstream.
    const rosterProfile = rosterProfileRows?.[0] || null;
    const rosterFromSupabase =
      rosterProfile?.budtender_headcount != null
        ? Number(rosterProfile.budtender_headcount)
        : null;
    const rosterFromZoho =
      account.Number_of_Budtenders != null &&
      account.Number_of_Budtenders !== ''
        ? Number(account.Number_of_Budtenders)
        : null;
    const roster =
      rosterFromSupabase != null && !Number.isNaN(rosterFromSupabase)
        ? rosterFromSupabase
        : rosterFromZoho != null && !Number.isNaN(rosterFromZoho)
          ? rosterFromZoho
          : null;

    const pctEnrolled =
      roster && roster > 0
        ? Math.min(100, Math.round((enrolled / roster) * 100))
        : null;

    const status = computeTrainingStatus({enrolled, roster, lastSignupAt});

    const requestOrigin = new URL(request.url).origin;
    const signupUrl = signupToken
      ? buildSignupUrl(requestOrigin, signupToken)
      : null;
    const qrDataUrl = signupUrl ? buildQrDataUrl(signupUrl) : null;

    const vibesPanel = {
      account_id: accountId,
      account_name: storeName || null,
      roster,
      enrolled,
      self_serve_count: enrolled,
      live_count: Array.isArray(liveTraining) ? liveTraining.length : 0,
      tier1_completed: tier1Completed,
      last_signup_at: lastSignupAt,
      pct_enrolled: pctEnrolled,
      status,
      signup_token: signupToken,
      signup_url: signupUrl,
      qr_data_url: qrDataUrl,
      roster_updated_at: rosterProfile?.headcount_updated_at || null,
    };

    return json(
      {
        ok: true,
        account: {
          id: account.id || accountId,
          name: storeName,
          street: account.Billing_Street || null,
          city: account.Billing_City || null,
          state: account.Billing_State || null,
          zip: account.Billing_Code || null,
          phone: account.Phone || null,
          description: account.Description || null,
          type: account.Account_Type || null,
          lastPopUpVisit: account.Visit_Date || null,
          popUpEmail: account.Email_to_book_pop_ups || null,
          popUpLink: account.Link_for_Pop_Ups || null,
          trainingEmail: account.Email_for_Staff_Trainings || null,
          trainingLink: account.Link_for_Staff_Training || null,
          numberOfBudtenders:
            account.Number_of_Budtenders != null && account.Number_of_Budtenders !== ''
              ? Number(account.Number_of_Budtenders)
              : null,
        },
        contacts,
        contactsByRole,
        training: {
          selfServe: selfServeTraining,
          live: liveTraining,
          summary: trainingSummaryRows?.[0] || null,
          vibesPanel,
        },
        recentVisits,
        goodieRecent,
        lastVisit,
        daysSinceLastVisit,
      },
      {headers: {'Cache-Control': 'public, max-age=60'}},
    );
  } catch (err: any) {
    console.error('[api/vibes-store] Error:', err?.message || err);
    return json(
      {ok: false, error: err?.message || 'Unknown error'},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
