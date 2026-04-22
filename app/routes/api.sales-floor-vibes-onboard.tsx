import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Brand Team Onboarding (Vibes onboard)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-vibes-onboard
//   body: {
//     zohoAccountId: string,
//     customerName: string,
//     customerId?: number,           // LeafLink customer id (for traceability)
//     firstOrderNumber?: string,     // LeafLink order short_id / number
//     actualShipDate?: string,       // ISO date — preferred gate basis
//     firstOrderStatus?: string,     // LeafLink status — gates when supplied
//     firstOrderDate?: string,       // Zoho fallback — used when actualShipDate missing
//   }
//   → { ok, dealId, checkInDueDate }
//
// What this does:
//   1. Validates the order is far enough along to route a brand-team visit.
//      LeafLink path: must have Accepted-or-further status AND a real ship
//      date. Zoho-sourced path: we only have First_Order_Date on the Account,
//      which implies the order has already incremented Total_Orders_Count
//      (the integration only increments on fulfillment) — that's our proxy
//      for "ready to onboard".
//   2. Creates a Deal in the Needs Onboarding pipeline tied to the Zoho
//      Account. The /sales-floor New Customer card listens for this deal's
//      existence to flip into "Vibes Booked" state.
//   3. Duplicate check: if the account already has an open Deal in the
//      Needs Onboarding pipeline, we return that deal rather than creating a
//      second one. Keeps NJ Zoho-card re-clicks idempotent.
//   4. Returns the 12-day check-in date so the UI can show "Check in by …".
//
// Vibes coverage gating happens client-side via `vibesEligible` from
// /api/sales-floor-leaflink-orders — but we double-check here that the
// account's Billing_State (or Account_State) is NJ before creating the deal.
// Out-of-state accounts get a friendly 422 instead of a stray onboard deal.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const ONBOARDING_STAGE = 'Onboarding';
const VIBES_COVERED_STATES = new Set(['NJ', 'New Jersey']);
// Shared signature between this route and /api/vibes-route. Only deals
// whose Description contains this string are treated as "real" Brand
// Team Onboarding deals. Keeps us in sync with the Zoho automation that
// auto-creates Needs Onboarding deals on order placement — those don't
// carry the signature and are transparent to both the dedup check here
// and the Vibes board filter.
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
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

// Look for an existing open Deal in the Needs Onboarding pipeline for this
// account that was **created by the Sales Floor button** (not by the Zoho
// order-placement automation). Used to prevent duplicate onboarding Deals
// when a rep clicks Brand Team Onboarding twice.
//
// Important: we deliberately ignore automation-created deals here. Zoho
// auto-creates a Needs Onboarding deal on order placement, but Vibes only
// routes deals with the SALES_FLOOR_SIGNATURE Description marker. If we
// treated automation deals as duplicates, the rep would see "Already
// booked" while Vibes stayed empty — the exact collision bug this guards
// against. Filtering by signature here aligns the dedup check with the
// Vibes read predicate.
async function findExistingOnboardingDeal(
  accountId: string,
  token: string,
): Promise<string | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `((Account_Name.id:equals:${accountId})and(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE}))`,
  );
  // Description is required to check for the sales-floor signature.
  url.searchParams.set('fields', 'id,Deal_Name,Stage,Pipeline,Description');
  url.searchParams.set('per_page', '10');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  // 204 = no matches; treat any non-2xx as "no duplicate" so we don't block
  // on a transient Zoho hiccup.
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.data) ? data.data : [];
  // Only sales-floor-signed deals count as duplicates. Automation deals
  // coexist in the pipeline but are transparent to this button.
  const signed = rows.find((r: any) => {
    const desc = typeof r?.Description === 'string' ? r.Description : '';
    return desc.includes(SALES_FLOOR_SIGNATURE);
  });
  return signed?.id || null;
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
  const firstOrderDate = String(body?.firstOrderDate || '').trim();

  if (!zohoAccountId || !/^\d{6,}$/.test(zohoAccountId)) {
    return json({ok: false, error: 'invalid zohoAccountId'}, {status: 400});
  }
  if (!customerName) {
    return json({ok: false, error: 'customerName required'}, {status: 400});
  }
  // Dual-path gate:
  //   • LeafLink path — caller sends actualShipDate + firstOrderStatus. Must
  //     be Accepted-or-further, otherwise block (that's the ship-date-safety
  //     rule Reid asked for when the flow was designed).
  //   • Zoho-sourced fallback — caller sends firstOrderDate only. The order
  //     already incremented Total_Orders_Count in Zoho (the LeafLink→Zoho
  //     integration only increments on fulfillment), so we accept the order
  //     as "ready" without a LeafLink status.
  //
  // `baseDate` is the date we key the 12-day check-in timer off of.
  let baseDate = '';
  if (actualShipDate) {
    if (firstOrderStatus && !READY_STATUSES.has(firstOrderStatus)) {
      return json(
        {
          ok: false,
          error:
            'Order is not ready — needs an Accepted (or further) status before booking the Brand Team visit.',
        },
        {status: 422},
      );
    }
    baseDate = actualShipDate;
  } else if (firstOrderDate) {
    baseDate = firstOrderDate;
  } else {
    return json(
      {
        ok: false,
        error:
          'Missing ship date. Provide actualShipDate (LeafLink) or firstOrderDate (Zoho).',
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

    // Compute check-in due date (12 days post base-date).
    const base = new Date(baseDate).getTime();
    if (isNaN(base)) {
      return json({ok: false, error: 'invalid date'}, {status: 400});
    }
    const checkInDueDate = new Date(base + CHECKIN_AFTER_DAYS * 86400 * 1000)
      .toISOString()
      .slice(0, 10);

    // Closing date for the deal = the day the brand team should have wrapped
    // the visit (base + 7 days is a reasonable target).
    const closingDate = new Date(base + 7 * 86400 * 1000).toISOString().slice(0, 10);

    // Duplicate check — if this Account already has an open Needs Onboarding
    // deal, return it rather than creating a second. Makes the NJ Zoho-card
    // button idempotent across accidental double-clicks and cross-session
    // re-clicks.
    const existingDealId = await findExistingOnboardingDeal(
      zohoAccountId,
      token,
    );
    if (existingDealId) {
      return json({
        ok: true,
        dealId: existingDealId,
        checkInDueDate,
        cardState: 'vibes_booked',
        alreadyBooked: true,
      });
    }

    const dealName = `Onboarding: ${customerName}`;
    const dateLabel = actualShipDate
      ? `Ship date: ${actualShipDate.slice(0, 10)}`
      : `First order date: ${baseDate.slice(0, 10)}`;
    const description = [
      `${SALES_FLOOR_SIGNATURE} New Customers tab by ${rep.displayName || rep.email || 'rep'}.`,
      firstOrderNumber ? `LeafLink order: ${firstOrderNumber}` : '',
      dateLabel,
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
