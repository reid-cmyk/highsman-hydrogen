import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, type SalesRep} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor CRM Sync — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-sync
//   → { leads: [...], deals: [...], accounts: [...], meta: {...} }
//
// Single combined endpoint the /sales-floor dashboard calls instead of making
// 3 separate round-trips from the browser. Keeps Zoho creds server-side and
// folds 3 parallel Zoho requests into one worker response.
//
// Shapes preserved exactly to match what app.js renderers already expect:
//   Lead    → { id, _fullName, First_Name, Last_Name, Company, Email, Phone,
//               _status: 'hot'|'warm'|'new'|'cold', Lead_Status, Lead_Source,
//               Description, Modified_Time }
//   Deal    → { id, Deal_Name, Account_Name, Stage, Amount, Closing_Date }
//   Account → { Id, Account_Name, Industry, Billing_City, Billing_State,
//               Phone, contacts: Contact[], buyer: Contact|null }
//   Contact → { id, _fullName, Email, Phone, Mobile, Title, Job_Role,
//               _jobRole, _accountId, _accountName }
//
// MA accounts are hard-filtered out before the response is built (Reid's
// request — sales-floor doesn't surface Massachusetts for now).
//
// Buyer detection: per-account `buyer` is set by pickBuyer(), which prefers
// an exact case-insensitive match on "Purchasing & Inventory Management" and
// falls back to any role containing buyer / purchas / inventory.
//
// Per-rep scoping: the caller's rep is resolved from the sales_floor_rep
// cookie (see app/lib/sales-floor-reps.ts). If the rep has a zohoOwnerId set
// in the registry, every Zoho query is filtered by Owner.id so the dashboard
// only returns that rep's book. Sky currently runs unfiltered — flip his
// zohoOwnerId in the registry to enable scoping.
//
// Graceful degradation: if env vars are missing or Zoho fails, returns empty
// arrays (200) with { ok:false, error:'...' } so the client can fall back to
// demo data without breaking the UI.
// ─────────────────────────────────────────────────────────────────────────────

// Module-scope token cache (55-min TTL to stay under Zoho's aggressive
// rate-limit on /oauth/v2/token — see memory "Zoho Token Caching Required").
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(env: {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}): Promise<string> {
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

// ─── Zoho Lead_Status → hot / warm / new / cold ──────────────────────────────
function normalizeLeadStatus(raw: string | null | undefined): 'hot' | 'warm' | 'new' | 'cold' {
  const s = (raw || '').toLowerCase();
  if (['qualified', 'hot', 'ready to buy'].includes(s)) return 'hot';
  if (['working - contacted', 'contact in future', 'warm', 'nurturing'].includes(s)) return 'warm';
  if (['unqualified', 'junk lead', 'cold', 'lost lead'].includes(s)) return 'cold';
  // Default for "not contacted", "attempted to contact", "contacted", "pre-qualified",
  // anything custom, or empty.
  return 'new';
}

function fullName(l: any): string {
  return `${l.First_Name || ''} ${l.Last_Name || ''}`.trim() || l.Company || 'Unknown Lead';
}

// When a rep has a zohoOwnerId, we fetch records scoped to that owner via the
// /search endpoint with a COQL-style criteria string. Owner filtering through
// the generic list endpoint doesn't work — Zoho only honors criteria on
// /search or through `view_id`. We intentionally use /search here (no word
// query, just criteria) to keep per-rep scoping consistent across modules.
function ownerCriteria(ownerId: string): string {
  return `(Owner.id:equals:${ownerId})`;
}

// Decide list-vs-search URL + query params based on whether a rep filter is in
// play. Keeps the call sites below readable.
function zohoModuleUrl(
  module: string,
  ownerId: string | null,
  fields: string[],
  perPage: number,
): URL {
  const base = ownerId
    ? `https://www.zohoapis.com/crm/v7/${module}/search`
    : `https://www.zohoapis.com/crm/v7/${module}`;
  const url = new URL(base);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('sort_by', 'Modified_Time');
  url.searchParams.set('sort_order', 'desc');
  if (ownerId) url.searchParams.set('criteria', ownerCriteria(ownerId));
  return url;
}

// ─── Zoho fetchers ───────────────────────────────────────────────────────────
async function fetchLeads(accessToken: string, ownerId: string | null) {
  const url = zohoModuleUrl(
    'Leads',
    ownerId,
    [
      'First_Name',
      'Last_Name',
      'Email',
      'Phone',
      'Mobile',
      'Company',
      'Lead_Status',
      'Lead_Source',
      'Description',
      // State + City pulled in for the new state filter tabs on /sales-floor.
      // Reps want a one-click way to scope their list to a specific market
      // (NJ, NY, RI, etc.) so they can plan a route or call sweep for the day.
      'State',
      'City',
      'Modified_Time',
      'Created_Time',
    ],
    100,
  );

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho leads fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data || []).map((l: any) => ({
    id: l.id,
    First_Name: l.First_Name || '',
    Last_Name: l.Last_Name || '',
    _fullName: fullName(l),
    Email: l.Email || '',
    Phone: l.Phone || l.Mobile || '',
    Company: l.Company || '',
    Lead_Status: l.Lead_Status || '',
    _status: normalizeLeadStatus(l.Lead_Status),
    Lead_Source: l.Lead_Source || '',
    Description: l.Description || '',
    State: l.State || '',
    City: l.City || '',
    Modified_Time: l.Modified_Time || null,
  }));
}

async function fetchDeals(accessToken: string, ownerId: string | null) {
  const url = zohoModuleUrl(
    'Deals',
    ownerId,
    ['Deal_Name', 'Account_Name', 'Stage', 'Amount', 'Closing_Date', 'Contact_Name', 'Description'],
    200,
  );

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho deals fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data || []).map((d: any) => ({
    id: d.id,
    Deal_Name: d.Deal_Name || '',
    // Zoho returns lookup fields as objects {name, id}; flatten to the string app.js uses.
    Account_Name: typeof d.Account_Name === 'object' ? d.Account_Name?.name || '' : d.Account_Name || '',
    Stage: d.Stage || '',
    Amount: d.Amount || 0,
    Closing_Date: d.Closing_Date || '',
    Contact_Name: typeof d.Contact_Name === 'object' ? d.Contact_Name?.name || '' : d.Contact_Name || '',
    Description: d.Description || '',
  }));
}

// MA-state filter shared by the Accounts + Contacts fetchers. Reid asked us to
// hide MA from the sales-floor for now — easiest place to do it is right after
// the Zoho fetch so downstream views never see them. We check both 'MA' (the
// 2-letter code Highsman uses everywhere) and 'Massachusetts' just in case
// some legacy records have the long form.
const EXCLUDED_STATES = new Set(['MA', 'Massachusetts']);

function isExcludedState(state: string | null | undefined): boolean {
  return EXCLUDED_STATES.has(String(state || '').trim());
}

async function fetchAccounts(accessToken: string, ownerId: string | null) {
  const url = zohoModuleUrl(
    'Accounts',
    ownerId,
    [
      'Account_Name',
      'Phone',
      'Website',
      'Industry',
      'Annual_Revenue',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Account_Type',
      'Description',
      'Modified_Time',
    ],
    200,
  );

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho accounts fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data || [])
    // Drop MA accounts before we even shape them — keeps the response leaner
    // and prevents any downstream join from reintroducing them.
    .filter((a: any) => !isExcludedState(a.Billing_State))
    .map((a: any) => ({
      // app.js uses `Id` (capital I) in a couple spots; keep both for safety.
      Id: a.id,
      id: a.id,
      Account_Name: a.Account_Name || '',
      Industry: a.Industry || '',
      Billing_Street: a.Billing_Street || '',
      Billing_City: a.Billing_City || '',
      Billing_State: a.Billing_State || '',
      Phone: a.Phone || '',
      Website: a.Website || '',
      Account_Type: a.Account_Type || '',
      Annual_Revenue: a.Annual_Revenue || 0,
      Description: a.Description || '',
      Modified_Time: a.Modified_Time || null,
      // Populated by attachContactsToAccounts() after the contacts fetch
      // resolves. `buyer` is the chosen primary contact (if one exists),
      // `contacts` is the full list for the account.
      contacts: [] as any[],
      buyer: null as any,
    }));
}

// ─── Contacts ────────────────────────────────────────────────────────────────
// Pull every contact attached to an account so we can (a) surface the real
// buyer on the account card, (b) let the rep swap who the buyer is.
//
// "Job Role" in Highsman's Zoho instance might be the relabeled standard
// `Title` field OR a custom `Job_Role` picklist. We try Job_Role first and
// fall back to Title-only if Zoho rejects the field (INVALID_DATA / 400). Both
// fields are normalized into `_jobRole` on the returned object so the rest of
// the code stays simple.
const CONTACT_BASE_FIELDS = [
  'First_Name',
  'Last_Name',
  'Email',
  'Phone',
  'Mobile',
  'Title',
  'Account_Name',
  'Modified_Time',
];

async function fetchContacts(accessToken: string, ownerId: string | null) {
  // First attempt: include the custom Job_Role field. If Zoho's Contacts
  // module doesn't have it, the call fails with 400 + INVALID_DATA and we
  // retry without it.
  let hasJobRole = true;
  let url = zohoModuleUrl('Contacts', ownerId, [...CONTACT_BASE_FIELDS, 'Job_Role'], 200);

  let res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });

  if (res.status === 400) {
    // Most likely "invalid column name" because Job_Role doesn't exist on
    // this org's Contacts module. Retry without it.
    hasJobRole = false;
    url = zohoModuleUrl('Contacts', ownerId, CONTACT_BASE_FIELDS, 200);
    res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
    });
  }

  if (res.status === 204) return {contacts: [], hasJobRole};
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho contacts fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const contacts = (data.data || []).map((c: any) => {
    const accountId = c.Account_Name?.id || null;
    const accountName = c.Account_Name?.name || '';
    // Job_Role wins if present; otherwise fall back to standard Title.
    const jobRole = (hasJobRole ? c.Job_Role : null) || c.Title || '';
    const fn = c.First_Name || '';
    const ln = c.Last_Name || '';
    return {
      id: c.id,
      First_Name: fn,
      Last_Name: ln,
      _fullName: `${fn} ${ln}`.trim() || c.Email || 'Unknown Contact',
      Email: c.Email || '',
      Phone: c.Phone || '',
      Mobile: c.Mobile || '',
      Title: c.Title || '',
      Job_Role: hasJobRole ? c.Job_Role || '' : '',
      _jobRole: jobRole,
      _accountId: accountId,
      _accountName: accountName,
      Modified_Time: c.Modified_Time || null,
    };
  });
  return {contacts, hasJobRole};
}

// ─── Buyer detection ─────────────────────────────────────────────────────────
// We treat any contact whose Job_Role/Title contains "buyer", "purchas" (catches
// "Purchasing", "Purchaser"), or "inventory" (catches "Inventory Management")
// as a candidate buyer. Exact match on the canonical "Purchasing & Inventory
// Management" wins over loose matches when both exist.
const CANONICAL_BUYER_ROLE = 'Purchasing & Inventory Management';

function isBuyerRole(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase();
  if (!r) return false;
  return r.includes('buyer') || r.includes('purchas') || r.includes('inventory');
}

function pickBuyer(contacts: any[]): any | null {
  if (!contacts.length) return null;
  // 1. Exact canonical match first (case-insensitive).
  const exact = contacts.find(
    (c) => String(c._jobRole || '').toLowerCase() === CANONICAL_BUYER_ROLE.toLowerCase(),
  );
  if (exact) return exact;
  // 2. Any buyer-ish role.
  const fuzzy = contacts.find((c) => isBuyerRole(c._jobRole));
  if (fuzzy) return fuzzy;
  return null;
}

function attachContactsToAccounts(accounts: any[], contacts: any[]) {
  // Group contacts by account id once so we don't loop O(n*m).
  const byAccount = new Map<string, any[]>();
  for (const c of contacts) {
    if (!c._accountId) continue;
    if (!byAccount.has(c._accountId)) byAccount.set(c._accountId, []);
    byAccount.get(c._accountId)!.push(c);
  }
  for (const acc of accounts) {
    const list = byAccount.get(acc.id) || [];
    acc.contacts = list;
    acc.buyer = pickBuyer(list);
  }
  return accounts;
}

// ─── Loader ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  // Resolve the caller's rep from the cookie. If they're not logged in we
  // still serve an empty response (200) rather than 401 so the UI can fall
  // back to demo mode the same way it does for missing env vars.
  const rep: SalesRep | null = getRepFromRequest(request);

  if (!clientId || !clientSecret || !refreshToken) {
    return json(
      {
        ok: false,
        error: 'CRM not configured',
        leads: [],
        deals: [],
        accounts: [],
        meta: {
          configured: false,
          syncedAt: new Date().toISOString(),
          rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
        },
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  const ownerId = rep?.zohoOwnerId || null;

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const [leads, deals, accounts, contactsResult] = await Promise.all([
      fetchLeads(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] leads fetch failed:', e.message);
        return [];
      }),
      fetchDeals(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] deals fetch failed:', e.message);
        return [];
      }),
      fetchAccounts(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] accounts fetch failed:', e.message);
        return [];
      }),
      fetchContacts(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] contacts fetch failed:', e.message);
        return {contacts: [], hasJobRole: false};
      }),
    ]);

    // Filter MA contacts out before joining (their accounts are already gone)
    // so the picker doesn't show contacts that belong to hidden accounts.
    const accountIds = new Set(accounts.map((a: any) => a.id));
    const visibleContacts = contactsResult.contacts.filter((c: any) =>
      c._accountId ? accountIds.has(c._accountId) : true,
    );
    attachContactsToAccounts(accounts, visibleContacts);

    return json(
      {
        ok: true,
        leads,
        deals,
        accounts,
        meta: {
          configured: true,
          syncedAt: new Date().toISOString(),
          counts: {
            leads: leads.length,
            deals: deals.length,
            accounts: accounts.length,
            contacts: visibleContacts.length,
          },
          contactFieldMode: contactsResult.hasJobRole ? 'job_role' : 'title',
          rep: rep ? {id: rep.id, firstName: rep.firstName, scoped: !!ownerId} : null,
        },
      },
      {
        headers: {
          // 60s browser cache so rapid tab-switches don't refetch; worker-side
          // token cache handles the 55-min window. `private` because the
          // payload is rep-scoped.
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  } catch (err: any) {
    console.error('[sales-floor-sync] Sync error:', err.message);
    return json(
      {
        ok: false,
        error: err.message || 'Sync failed',
        leads: [],
        deals: [],
        accounts: [],
        meta: {
          configured: true,
          syncedAt: new Date().toISOString(),
          rep: rep ? {id: rep.id, firstName: rep.firstName, scoped: !!ownerId} : null,
        },
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
