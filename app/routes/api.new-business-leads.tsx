import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/new-business-leads
// ─────────────────────────────────────────────────────────────────────────────
// GET → { ok, leads: [...], count, syncedAt }
//
// Returns Zoho Leads with at least one contact method (phone, mobile, or
// email) — the set Pete can actually act on. Scoped to NJ by default because
// /new-business is an NJ dashboard today; ?state=ALL drops the filter for
// future markets.
//
// Stays out of `api.sales-floor-sync` because:
//   • Sky's sync is a big multi-module blob (accounts + deals + orders + …),
//     and Pete doesn't need any of that weight.
//   • Pete's Leads view has different sort semantics — Sky sorts by "hot",
//     Pete sorts by recency + untouched-first.
// ─────────────────────────────────────────────────────────────────────────────

type Lead = {
  id: string;
  _fullName: string;
  Company: string;
  Email: string;
  Phone: string;
  Mobile: string;
  Lead_Status: string;
  Lead_Source: string;
  Description: string;
  City: string;
  _state: string;
  Created_Time: string | null;
  Modified_Time: string | null;
  Last_Activity_Time: string | null;
};

// Wraps the shared Zoho helper to preserve the "return null on missing creds
// or refresh failure" contract this loader relies on for soft-degradation.
async function getZohoToken(env: Record<string, string | undefined>): Promise<string | null> {
  try {
    return await getZohoAccessToken(env);
  } catch {
    return null;
  }
}

function normalizeStateCode(raw: unknown): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const upper = s.toUpperCase();
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  if (upper === 'NEW JERSEY') return 'NJ';
  if (upper === 'NEW YORK') return 'NY';
  if (upper === 'MASSACHUSETTS') return 'MA';
  if (upper === 'RHODE ISLAND') return 'RI';
  if (upper === 'MISSOURI') return 'MO';
  return upper.slice(0, 2);
}

function isTestName(name: unknown): boolean {
  const s = String(name || '').trim().toLowerCase();
  return s.startsWith('test') || s === 'test' || s === 'demo';
}

// Pull ALL leads (paginated). Zoho returns max 200 per page; we keep reading
// until `info.more_records` is false. Server-side NJ filter is done in JS
// because Zoho's `criteria` + `word` query params can't be combined and we
// want partial matches on legacy records that stored "New Jersey" in State.
async function fetchAllLeads(accessToken: string, ownerId: string | null): Promise<any[]> {
  const fields = [
    'First_Name',
    'Last_Name',
    'Company',
    'Email',
    'Phone',
    'Mobile',
    'Lead_Status',
    'Lead_Source',
    'Description',
    'State',
    'States', // custom Market State picklist — authoritative for state filter
    'City',
    'Created_Time',
    'Modified_Time',
    'Last_Activity_Time',
  ].join(',');

  const collected: any[] = [];
  let page = 1;
  const perPage = 200;
  // Hard-cap 10 pages (2000 leads) — runaway protection, not a real limit.
  while (page <= 10) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Leads');
    url.searchParams.set('fields', fields);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));
    url.searchParams.set('sort_by', 'Modified_Time');
    url.searchParams.set('sort_order', 'desc');
    if (ownerId) {
      url.searchParams.set('criteria', `(Owner.id:equals:${ownerId})`);
    }
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
    });
    if (res.status === 204) break;
    if (!res.ok) {
      // Soft-fail: return what we have. Don't 500 the dashboard over a partial
      // page — an empty list is better than a red error screen.
      const text = await res.text().catch(() => '');
      console.warn(`Zoho Leads page ${page} failed (${res.status}): ${text.slice(0, 200)}`);
      break;
    }
    const data = await res.json();
    const rows = data?.data || [];
    collected.push(...rows);
    if (!data?.info?.more_records) break;
    page += 1;
  }
  return collected;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = context.env as Record<string, string | undefined>;
  const url = new URL(request.url);
  // Default to NJ because /new-business is Pete's NJ dashboard. Pass ?state=ALL
  // to see everything, or ?state=NY for a different market.
  const stateFilter = (url.searchParams.get('state') || 'NJ').toUpperCase();

  const token = await getZohoToken(env);
  if (!token) {
    return json({
      ok: true,
      leads: [],
      count: 0,
      syncedAt: new Date().toISOString(),
      rep: {id: rep.id, displayName: rep.displayName},
      warning: 'Zoho credentials missing — connect CRM to populate leads.',
    });
  }

  try {
    const raw = await fetchAllLeads(token, rep.zohoOwnerId);

    const leads: Lead[] = raw
      // Same hygiene filters Sky's sync uses.
      .filter((l: any) => !isTestName(l.Company))
      .filter((l: any) => {
        const email = String(l.Email || '').trim();
        const phone = String(l.Phone || '').trim();
        const mobile = String(l.Mobile || '').trim();
        return Boolean(email || phone || mobile);
      })
      .map((l: any) => {
        const first = (l.First_Name || '').trim();
        const last = (l.Last_Name || '').trim();
        const _fullName = [first, last].filter(Boolean).join(' ') || last || first || 'Unknown';
        return {
          id: l.id,
          _fullName,
          Company: l.Company || '',
          Email: l.Email || '',
          Phone: l.Phone || '',
          Mobile: l.Mobile || '',
          Lead_Status: l.Lead_Status || '',
          Lead_Source: l.Lead_Source || '',
          Description: l.Description || '',
          City: l.City || '',
          _state:
            normalizeStateCode(l.States) || normalizeStateCode(l.State) || '',
          Created_Time: l.Created_Time || null,
          Modified_Time: l.Modified_Time || null,
          Last_Activity_Time: l.Last_Activity_Time || null,
        };
      });

    const filtered = stateFilter === 'ALL' ? leads : leads.filter((l) => l._state === stateFilter);

    // Untouched-first sort: leads with no Last_Activity_Time rank ahead of
    // any that have been touched, because those are the ones Pete hasn't
    // worked yet. Secondary sort = most recently modified in Zoho.
    filtered.sort((a, b) => {
      const aTouched = a.Last_Activity_Time ? 1 : 0;
      const bTouched = b.Last_Activity_Time ? 1 : 0;
      if (aTouched !== bTouched) return aTouched - bTouched; // 0 (untouched) before 1 (touched)
      const am = a.Modified_Time ? Date.parse(a.Modified_Time) : 0;
      const bm = b.Modified_Time ? Date.parse(b.Modified_Time) : 0;
      return bm - am;
    });

    return json(
      {
        ok: true,
        leads: filtered,
        count: filtered.length,
        syncedAt: new Date().toISOString(),
        stateFilter,
        rep: {id: rep.id, displayName: rep.displayName},
      },
      {
        headers: {
          // 2-min private cache — Pete can click Sync to force refresh.
          'Cache-Control': 'private, max-age=120',
        },
      },
    );
  } catch (err: any) {
    return json(
      {ok: false, error: err?.message || 'Zoho Leads fetch failed'},
      {status: 502},
    );
  }
}
