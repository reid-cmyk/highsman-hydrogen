import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Ready to Account Visit (Vibes onboard)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-vibes-onboard
//   body: {
//     zohoAccountId: string,
//     customerName: string,
//     customerId?: number,           // LeafLink customer id (for traceability)
//     firstOrderNumber?: string,     // LeafLink order short_id / number
//     actualShipDate: string,        // ISO date — gate: must be set
//     firstOrderStatus: string,      // gate: must be in READY_STATUSES
//   }
//   → { ok, dealId, checkInDueDate }
//
// What this does:
//   1. Validates the order is "ready" — accepted (or further) AND has a real
//      ship date. Reid's call: a Vibes visit can't go on the calendar before
//      we know when product hits the door.
//   2. Creates a Deal in the Needs Onboarding pipeline tied to the Zoho
//      Account. The /sales-floor New Customer card listens for this deal's
//      existence to flip into "Vibes Booked" state.
//   3. Returns the 12-day check-in date so the UI can show "Check in by …".
//
// Vibes coverage gating happens client-side via `vibesEligible` from
// /api/sales-floor-leaflink-orders — but we double-check here that the
// account's Billing_State (or Account_State) is NJ before creating the deal.
// Out-of-state accounts get a friendly 422 instead of a stray onboard deal.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const ONBOARDING_STAGE = 'Onboarding';
const VIBES_COVERED_STATES = new Set(['NJ', 'New Jersey']);
const READY_STATUSES = new Set([
  'Accepted',
  'Backorder',
  'Shipped',
  'Combined',
  'Fulfilled',
  'Complete',
]);
const CHECKIN_AFTER_DAYS = 12;

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
    throw new Error(`Zoho token (${res.status})`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

async function fetchAccountState(
  accountId: string,
  token: string,
): Promise<{name: string; state: string | null} | null> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Accounts/${accountId}?fields=Account_Name,Billing_State,Account_State`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json();
  const a = (data.data || [])[0];
  if (!a) return null;
  return {
    name: a.Account_Name || '',
    state: a.Billing_State || a.Account_State || null,
  };
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

  const zohoAccountId = String(body?.zohoAccountId || '').trim();
  const customerName = String(body?.customerName || '').trim();
  const firstOrderNumber = String(body?.firstOrderNumber || '').trim();
  const actualShipDate = String(body?.actualShipDate || '').trim();
  const firstOrderStatus = String(body?.firstOrderStatus || '').trim();

  if (!zohoAccountId || !/^\d{6,}$/.test(zohoAccountId)) {
    return json({ok: false, error: 'invalid zohoAccountId'}, {status: 400});
  }
  if (!customerName) {
    return json({ok: false, error: 'customerName required'}, {status: 400});
  }
  if (!actualShipDate || !READY_STATUSES.has(firstOrderStatus)) {
    return json(
      {
        ok: false,
        error:
          'Order is not ready — needs an Accepted (or further) status AND an actual ship date before booking the Vibes visit.',
      },
      {status: 422},
    );
  }

  try {
    const token = await getZohoToken(env);

    // Verify Vibes coverage (NJ only for v1).
    const acct = await fetchAccountState(zohoAccountId, token);
    if (!acct) {
      return json({ok: false, error: 'Zoho account not found'}, {status: 404});
    }
    if (!acct.state || !VIBES_COVERED_STATES.has(acct.state)) {
      return json(
        {
          ok: false,
          error: `Vibes coverage isn't live in ${acct.state || 'this state'} yet — call the buyer instead.`,
        },
        {status: 422},
      );
    }

    // Compute check-in due date (12 days post-ship).
    const ship = new Date(actualShipDate).getTime();
    if (isNaN(ship)) {
      return json({ok: false, error: 'invalid actualShipDate'}, {status: 400});
    }
    const checkInDueDate = new Date(ship + CHECKIN_AFTER_DAYS * 86400 * 1000)
      .toISOString()
      .slice(0, 10);

    // Closing date for the deal = the day Sky should have wrapped the visit
    // (ship + 7 days is a reasonable target).
    const closingDate = new Date(ship + 7 * 86400 * 1000).toISOString().slice(0, 10);

    const dealName = `Onboarding: ${customerName}`;
    const description = [
      `Auto-created from /sales-floor New Customers tab by ${rep.name || rep.email || 'rep'}.`,
      firstOrderNumber ? `LeafLink order: ${firstOrderNumber}` : '',
      `Ship date: ${actualShipDate.slice(0, 10)}`,
      `12-day check-in due: ${checkInDueDate}`,
    ]
      .filter(Boolean)
      .join('\n');

    const dealPayload = {
      data: [
        {
          Deal_Name: dealName,
          Account_Name: zohoAccountId,
          Pipeline: NEEDS_ONBOARDING_PIPELINE,
          Stage: ONBOARDING_STAGE,
          Closing_Date: closingDate,
          Description: description,
        },
      ],
      // Don't fire workflow rules — Vibes routing is read-driven.
      trigger: [],
    };

    const dealRes = await fetch(`https://www.zohoapis.com/crm/v7/Deals`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealPayload),
    });
    const dealText = await dealRes.text().catch(() => '');
    if (!dealRes.ok) {
      throw new Error(`Zoho Deals create (${dealRes.status}): ${dealText.slice(0, 300)}`);
    }
    let dealJson: any = {};
    try {
      dealJson = JSON.parse(dealText);
    } catch {
      // Empty body still counts as success on some Zoho 201s.
    }
    const dealId =
      dealJson?.data?.[0]?.details?.id ||
      dealJson?.data?.[0]?.id ||
      null;

    return json({
      ok: true,
      dealId,
      checkInDueDate,
      cardState: 'vibes_booked',
    });
  } catch (err: any) {
    console.error('[sf-vibes-onboard] failed', zohoAccountId, err.message);
    return json(
      {ok: false, error: err.message || 'Vibes onboard failed'},
      {status: 502},
    );
  }
}
