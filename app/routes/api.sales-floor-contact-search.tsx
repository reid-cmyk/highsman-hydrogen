import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Contact Search (Zoho Contacts + Accounts)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-contact-search?q=green+leaf
//   → { ok, results: [{id, name, title, email, phone, accountName, accountId,
//                       city, state, isBuyer, source}] }
//
// Powers the autocomplete in the /sales-floor "Email Templates" tab.
// Lets a rep type either a contact name OR a dispensary name and pick the
// buyer contact for that store. Contacts and Accounts are searched in
// parallel; for top matching Accounts we also pull their related Contacts,
// then merge, dedupe, and rank buyers first.
//
// NB — Contact search is intentionally NOT scoped by rep Owner. Zoho's
// `/search` endpoint accepts one of `word|email|phone|criteria` at a time, so
// we can't combine "find buyers named X" with "where Owner=rep". More
// importantly, the compose flow benefits from a broad lookup: any rep should
// be able to email any known dispensary contact, whether or not they own the
// record. Rep scoping is still applied to the main dashboard sync (leads,
// deals, accounts) — see api.sales-floor-sync.tsx.
// ─────────────────────────────────────────────────────────────────────────────

// Module-scoped token cache — shares the 55-min TTL pattern used elsewhere.
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

type ContactResult = {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  accountName: string | null;
  accountId: string | null;
  city: string | null;
  state: string | null;
  isBuyer: boolean;
  source: 'contact' | 'account';
};

const BUYER_WORDS = [
  'buyer', 'buying', 'purchas', 'procurement', 'category manager',
  'gm', 'general manager', 'owner', 'operator', 'retail manager',
  'inventory', 'merchandis',
];

function isBuyerTitle(title: string | null | undefined): boolean {
  if (!title) return false;
  const t = title.toLowerCase();
  return BUYER_WORDS.some((w) => t.includes(w));
}

function fullName(c: any): string {
  const s = `${c.First_Name || ''} ${c.Last_Name || ''}`.trim();
  return s || c.Full_Name || 'Unknown Contact';
}

// Flatten Zoho lookup fields ({name, id}) to strings.
function lookupName(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'object') return v.name || null;
  return String(v);
}
function lookupId(v: any): string | null {
  if (!v) return null;
  if (typeof v === 'object') return v.id || null;
  return null;
}

// ─── Zoho fetchers ───────────────────────────────────────────────────────────

async function searchContacts(query: string, token: string): Promise<ContactResult[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('word', query);
  url.searchParams.set(
    'fields',
    [
      'First_Name', 'Last_Name', 'Full_Name', 'Email', 'Phone', 'Mobile',
      'Title', 'Account_Name', 'Mailing_City', 'Mailing_State',
    ].join(','),
  );
  url.searchParams.set('per_page', '30');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho contacts search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data || []).map((c: any): ContactResult => ({
    id: c.id,
    name: fullName(c),
    title: c.Title || null,
    email: c.Email || null,
    phone: c.Phone || c.Mobile || null,
    accountName: lookupName(c.Account_Name),
    accountId: lookupId(c.Account_Name),
    city: c.Mailing_City || null,
    state: c.Mailing_State || null,
    isBuyer: isBuyerTitle(c.Title),
    source: 'contact',
  }));
}

async function searchAccounts(query: string, token: string): Promise<Array<{
  id: string; name: string; city: string | null; state: string | null;
}>> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
  url.searchParams.set('word', query);
  url.searchParams.set(
    'fields',
    ['Account_Name', 'Billing_City', 'Billing_State'].join(','),
  );
  url.searchParams.set('per_page', '10');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho accounts search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return (data.data || []).map((a: any) => ({
    id: a.id,
    name: a.Account_Name || 'Unnamed Account',
    city: a.Billing_City || null,
    state: a.Billing_State || null,
  }));
}

async function fetchAccountContacts(
  account: {id: string; name: string; city: string | null; state: string | null},
  token: string,
): Promise<ContactResult[]> {
  // Related-records endpoint: /Accounts/{id}/Contacts
  const url = new URL(
    `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(account.id)}/Contacts`,
  );
  url.searchParams.set(
    'fields',
    [
      'First_Name', 'Last_Name', 'Full_Name', 'Email', 'Phone', 'Mobile',
      'Title', 'Mailing_City', 'Mailing_State',
    ].join(','),
  );
  url.searchParams.set('per_page', '20');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) return [];
  const data = await res.json();
  return (data.data || []).map((c: any): ContactResult => ({
    id: c.id,
    name: fullName(c),
    title: c.Title || null,
    email: c.Email || null,
    phone: c.Phone || c.Mobile || null,
    accountName: account.name,
    accountId: account.id,
    city: c.Mailing_City || account.city,
    state: c.Mailing_State || account.state,
    isBuyer: isBuyerTitle(c.Title),
    source: 'account',
  }));
}

// ─── Merge + rank ────────────────────────────────────────────────────────────

function dedupe(rows: ContactResult[]): ContactResult[] {
  const seen = new Set<string>();
  const out: ContactResult[] = [];
  for (const r of rows) {
    const key = r.id || (r.email ? `email:${r.email.toLowerCase()}` : `${r.name}|${r.accountName}`);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

function rank(rows: ContactResult[], query: string): ContactResult[] {
  const q = query.toLowerCase();
  return rows
    .map((r) => {
      const nameHit = r.name.toLowerCase().includes(q) ? 1 : 0;
      const acctHit = (r.accountName || '').toLowerCase().includes(q) ? 1 : 0;
      const emailHit = (r.email || '').toLowerCase().includes(q) ? 1 : 0;
      const buyerBoost = r.isBuyer ? 2 : 0;
      const hasEmail = r.email ? 1 : 0;
      const score = nameHit * 3 + acctHit * 2 + emailHit * 2 + buyerBoost + hasEmail;
      return {r, score};
    })
    .sort((a, b) => b.score - a.score)
    .map(({r}) => r);
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();

  if (q.length < 2) {
    return json({ok: true, results: []}, {headers: {'Cache-Control': 'no-store'}});
  }

  // Resolve rep (for logging/telemetry only — search stays unscoped, see
  // header comment). If no rep is logged in we still return results so the
  // compose flow works for anonymous-but-authed scenarios.
  const rep = getRepFromRequest(request);

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return json(
      {ok: false, error: 'CRM not configured', results: []},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const token = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const [contactHits, accountHits] = await Promise.all([
      searchContacts(q, token).catch((e) => {
        console.error('[contact-search] contacts fail:', e.message);
        return [] as ContactResult[];
      }),
      searchAccounts(q, token).catch((e) => {
        console.error('[contact-search] accounts fail:', e.message);
        return [];
      }),
    ]);

    // For top 3 matching accounts, pull their linked contacts and flag buyers.
    const topAccounts = accountHits.slice(0, 3);
    const accountContactGroups = await Promise.all(
      topAccounts.map((a) => fetchAccountContacts(a, token)),
    );
    const fromAccounts = accountContactGroups.flat();

    // Even if an account had no contacts (or all returned errored), we still
    // want to surface the account itself as a hit — so fabricate a placeholder
    // row with no email. The UI can show it and skip filling email.
    const accountStubs: ContactResult[] = topAccounts
      .filter((a) => !fromAccounts.some((c) => c.accountId === a.id))
      .map((a) => ({
        id: `account:${a.id}`,
        name: 'No buyer linked',
        title: null,
        email: null,
        phone: null,
        accountName: a.name,
        accountId: a.id,
        city: a.city,
        state: a.state,
        isBuyer: false,
        source: 'account',
      }));

    const merged = dedupe([...contactHits, ...fromAccounts, ...accountStubs]);
    const ranked = rank(merged, q).slice(0, 12);

    return json(
      {
        ok: true,
        results: ranked,
        meta: {
          query: q,
          total: ranked.length,
          rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
        },
      },
      {headers: {'Cache-Control': 'private, max-age=30'}},
    );
  } catch (err: any) {
    console.error('[contact-search] Search error:', err.message);
    return json(
      {ok: false, error: err.message || 'Search failed', results: []},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
