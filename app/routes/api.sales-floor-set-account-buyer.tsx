import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Assign Account Buyer
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-set-account-buyer
//   body: { contactId: string, accountId?: string }
//   → { ok, contactId, jobRole }
//
// Stamps the chosen Contact as the buyer for their account by writing the
// canonical role string into the contact's "Job Role" picklist in Zoho.
//
// Highsman's Zoho org labels the picklist "Job Role" in the UI but its real
// api_name is `Role_Title` — we write to `Role_Title`. `Title` and `Job_Title`
// are separate generic text fields that frequently hold noisy values (e.g.
// "Owner", "Manager") and must NEVER be used as the buyer-role signal —
// never read them, never write to them.
//
// ⚠️  PICKLIST actual_value vs display_value ⚠️
// The Role_Title picklist option the shop-buyer role maps to has:
//   actual_value  = 'Buyer / Manager'
//   display_value = 'Purchasing & Inventory Management (Buyer, Procurement, Inventory Manager)'
// Zoho's PUT endpoint requires the `actual_value`. Writing the display
// string used to silently fail with PICKLIST_VALUE_NOT_CONFIGURED (502 to
// the caller) — which is why the picker appeared to "do nothing" on
// HudHaus in Apr 2026. Always write the actual_value.
//
// We don't clear any other contact's role — multiple people can carry buyer
// duties at the same account.
//
// Auth: same /sales-floor cookie as the rest of the dashboard. Returns 401
// for unauthenticated callers, 400 for malformed input, 502 if Zoho rejects.
// ─────────────────────────────────────────────────────────────────────────────

// Zoho picklist `actual_value` — NOT the display label. See header note.
const CANONICAL_BUYER_ROLE = 'Buyer / Manager';

// PUT the Role_Title picklist (labelled "Job Role" in Zoho UI) on a Contact.
async function putContactJobRole(
  contactId: string,
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
      data: [{Role_Title: value}],
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

    // Role_Title (labelled "Job Role" in the Zoho UI) is the canonical
    // buyer-role field on Highsman's Zoho org. No fallback to Title /
    // Job_Title — those are separate generic text fields that are never
    // the buyer-role signal.
    const result = await putContactJobRole(contactId, CANONICAL_BUYER_ROLE, token);
    if (!result.ok) {
      throw new Error(
        `Zoho update Contact (${result.status}): ${result.body.slice(0, 300)}`,
      );
    }

    return json({
      ok: true,
      contactId,
      jobRole: CANONICAL_BUYER_ROLE,
    });
  } catch (err: any) {
    console.error('[set-account-buyer] failed', contactId, err.message);
    return json(
      {ok: false, error: err.message || 'Zoho update failed'},
      {status: 502},
    );
  }
}
