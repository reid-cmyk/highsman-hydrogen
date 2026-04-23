import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/new-business-followups
// ─────────────────────────────────────────────────────────────────────────────
// GET → { ok, accounts: [...], count, syncedAt }
//
// Returns existing Zoho Accounts that Sky (or anyone on Sales Floor) flagged
// for Pete — accounts she can't close for reorders and wants Pete to chase.
//
// Source of truth: Zoho Tag `pete-followup` on the Account record. Sky adds
// the tag from her Sales Floor account card; Pete sees the tagged account
// in his Follow Up tab. Tag flow keeps the signal IN the CRM (not in some
// parallel database) so it survives reboots, migrations, and Pete's vacation.
// ─────────────────────────────────────────────────────────────────────────────

export const FOLLOWUP_TAG = 'pete-followup';

// Wraps the shared Zoho helper to preserve the "return null on missing creds or
// refresh failure" contract this loader already relies on for soft-degradation.
async function getZohoToken(env: Record<string, string | undefined>): Promise<string | null> {
  try {
    return await getZohoAccessToken(env);
  } catch {
    return null;
  }
}

// Fetch every Account that has the `pete-followup` tag. Zoho v7 tag search
// uses `criteria=(Tag.name:equals:<tag>)` on the module's /search endpoint.
async function fetchTaggedAccounts(accessToken: string): Promise<any[]> {
  const fields = [
    'Account_Name',
    'Phone',
    'Email',
    'Billing_City',
    'Billing_State',
    'Shipping_City',
    'Shipping_State',
    'Account_State',
    'Industry',
    'Description',
    'Last_Activity_Time',
    'Modified_Time',
    'Tag',
  ].join(',');

  const collected: any[] = [];
  let page = 1;
  while (page <= 5) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set('criteria', `(Tag.name:equals:${FOLLOWUP_TAG})`);
    url.searchParams.set('fields', fields);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', '200');
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
    });
    if (res.status === 204) break;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`Zoho Accounts tag search failed (${res.status}): ${text.slice(0, 200)}`);
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

// Pull the buyer contact for each account — this is what Pete will actually
// call/text/email. Parallelized 10-wide so we don't serialize ~40 requests.
async function fetchBuyers(
  accessToken: string,
  accountIds: string[],
): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const chunks: string[][] = [];
  for (let i = 0; i < accountIds.length; i += 10) chunks.push(accountIds.slice(i, i + 10));

  for (const chunk of chunks) {
    await Promise.all(
      chunk.map(async (accountId) => {
        const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
        url.searchParams.set('criteria', `(Account_Name.id:equals:${accountId})`);
        url.searchParams.set(
          'fields',
          ['Full_Name', 'First_Name', 'Last_Name', 'Email', 'Phone', 'Mobile', 'Job_Role'].join(','),
        );
        url.searchParams.set('per_page', '20');
        const res = await fetch(url.toString(), {
          headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => null);
        const contacts = data?.data || [];
        // Prefer the Buyer/Manager if Job_Role is set; otherwise first contact.
        const buyer =
          contacts.find((c: any) => {
            const role = String(c.Job_Role || '').toLowerCase();
            return role.includes('buyer') || role.includes('manager') || role.includes('purchas');
          }) || contacts[0];
        if (buyer) out.set(accountId, buyer);
      }),
    );
  }
  return out;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = context.env as Record<string, string | undefined>;
  const token = await getZohoToken(env);
  if (!token) {
    return json({
      ok: true,
      accounts: [],
      count: 0,
      syncedAt: new Date().toISOString(),
      warning: 'Zoho credentials missing.',
    });
  }

  try {
    const raw = await fetchTaggedAccounts(token);
    const accountIds = raw.map((a: any) => a.id).filter(Boolean);
    const buyersById = accountIds.length ? await fetchBuyers(token, accountIds) : new Map();

    const accounts = raw.map((a: any) => {
      const buyer = buyersById.get(a.id) || null;
      const state =
        (a.Account_State || '').toString().trim().toUpperCase() ||
        (a.Billing_State || '').toString().trim().toUpperCase() ||
        (a.Shipping_State || '').toString().trim().toUpperCase() ||
        '';
      return {
        id: a.id,
        Account_Name: a.Account_Name || 'Unknown',
        City: a.Billing_City || a.Shipping_City || '',
        _state: state,
        Phone: a.Phone || '',
        Email: a.Email || '',
        Industry: a.Industry || '',
        Description: a.Description || '',
        Last_Activity_Time: a.Last_Activity_Time || null,
        Modified_Time: a.Modified_Time || null,
        buyer: buyer
          ? {
              id: buyer.id,
              Full_Name:
                buyer.Full_Name ||
                [buyer.First_Name, buyer.Last_Name].filter(Boolean).join(' '),
              Email: buyer.Email || '',
              Phone: buyer.Phone || buyer.Mobile || '',
              Job_Role: buyer.Job_Role || '',
            }
          : null,
      };
    });

    // Stalest first — oldest Last_Activity_Time at the top because those are
    // the accounts with the coldest relationship, i.e. the ones that need
    // Pete's attention most.
    accounts.sort((a, b) => {
      const at = a.Last_Activity_Time ? Date.parse(a.Last_Activity_Time) : 0;
      const bt = b.Last_Activity_Time ? Date.parse(b.Last_Activity_Time) : 0;
      return at - bt;
    });

    return json(
      {
        ok: true,
        accounts,
        count: accounts.length,
        syncedAt: new Date().toISOString(),
        rep: {id: rep.id, displayName: rep.displayName},
      },
      {headers: {'Cache-Control': 'private, max-age=60'}},
    );
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'followup fetch failed'}, {status: 502});
  }
}
