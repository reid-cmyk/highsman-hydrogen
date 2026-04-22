import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Assign Account Buyer
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-set-account-buyer
//   body: { contactId: string, accountId?: string }
//   → { ok, contactId, jobRole, fieldUsed: 'Job_Role'|'Title' }
//
// Stamps the chosen Contact as the buyer for their account by writing the
// canonical role string into Zoho. Highsman uses "Job Role" — which on most
// orgs is the standard `Title` field with a custom display label, but on
// some it's a custom picklist `Job_Role`. We try Job_Role first; if Zoho
// rejects it (INVALID_DATA), we fall back to writing Title.
//
// We don't clear any other contact's role — multiple people can carry buyer
// duties at the same account, and we don't want to wipe a legitimate Title
// out from under a contact just because the rep is naming a primary.
//
// Auth: same /sales-floor cookie as the rest of the dashboard. Returns 401
// for unauthenticated callers, 400 for malformed input, 502 if Zoho rejects.
// ─────────────────────────────────────────────────────────────────────────────

const CANONICAL_BUYER_ROLE = 'Purchasing & Inventory Management';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho not configured');
  }
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
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
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho token (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

// PUT a single field on a Contact. Returns true on 2xx, false on 400 (caller
// can decide whether to fall back to a different field).
async function putContactField(
  contactId: string,
  field: 'Job_Role' | 'Title',
  value: string,
  token: string,
): Promise<{ok: boolean; status: number; body: string}> {
  const res = await fetch(`https://www.zohoapis.com/crm/v7/Contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [{[field]: value}],
      // Don't fire workflow on every buyer reassignment — these get noisy
      // when a rep is reorganizing a few accounts in one sitting.
      trigger: [],
    }),
  });
  const body = await res.text().catch(() => '');
  return {ok: res.ok, status: res.status, body};
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const contactId = String(body?.contactId || '').trim();
  if (!contactId || !/^\d{6,}$/.test(contactId)) {
    return json({ok: false, error: 'invalid contactId'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);

    // Try Job_Role first (likely the custom picklist if Highsman's set up
    // that way). On INVALID_DATA / 400, fall back to Title.
    let result = await putContactField(contactId, 'Job_Role', CANONICAL_BUYER_ROLE, token);
    let fieldUsed: 'Job_Role' | 'Title' = 'Job_Role';
    if (!result.ok && result.status === 400) {
      result = await putContactField(contactId, 'Title', CANONICAL_BUYER_ROLE, token);
      fieldUsed = 'Title';
    }
    if (!result.ok) {
      throw new Error(
        `Zoho update Contact (${result.status}): ${result.body.slice(0, 300)}`,
      );
    }

    return json({
      ok: true,
      contactId,
      jobRole: CANONICAL_BUYER_ROLE,
      fieldUsed,
    });
  } catch (err: any) {
    console.error('[set-account-buyer] failed', contactId, err.message);
    return json(
      {ok: false, error: err.message || 'Zoho update failed'},
      {status: 502},
    );
  }
}
