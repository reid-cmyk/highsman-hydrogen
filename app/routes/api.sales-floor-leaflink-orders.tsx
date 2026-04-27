import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — LeafLink Orders Backbone
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-leaflink-orders
//   → { ok, reorderDue: [...], newCustomers: [...], meta: {...} }
//
// Powers two tabs on /sales-floor:
//   • Orders Due  (Reorder Due column) — shops with no Highsman LeafLink order
//                  in the last 30 days
//   • New Customers — shops whose first-ever Highsman LeafLink order is the
//                     only one on file (state-machine card: pending → ready →
//                     vibes_booked → checkin_due → done)
//
// Source of truth: LeafLink /orders-received/ for every Canfections seller we
// know about. The "is this a Highsman order?" filter is line-item-based: we
// keep an order if at least one line item references a known Highsman product
// ID (regular SKU map + sample SKU map). This matches Reid's "any order for
// Highsman that links into LeafLink should be counted" — does NOT depend on
// the order coming from our NJ menu.
//
// Cross-reference Zoho once per customer to resolve the Account ID and the
// state (for Vibes coverage gating), then check for an open Needs Onboarding
// deal (signals "vibes_booked") and a [CHECKIN-12D] note (signals "done").
//
// Auth: same /sales-floor cookie as the rest of the dashboard. Rep is not yet
// used to scope results — Orders Due / New Customers are company-wide for v1
// (every rep sees the same list, like Alerts).
//
// Failure mode: any sub-failure (LeafLink down, Zoho down) returns the partial
// data with a non-fatal error in `meta.errors`. Never 500s the dashboard.
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';

// Canfections seller accounts that carry Highsman product. NJ today; add
// MA/NY/RI/MO IDs here as we onboard those state-level sellers in LeafLink.
const HIGHSMAN_SELLER_IDS: number[] = [
  24087, // Canfections NJ, INC
];

// LeafLink product IDs known to be Highsman product. Mirrors the maps in
// app/routes/api.leaflink-order.tsx (the source-of-truth for SKU→Product on
// the order-creation side). If a line item's `product` field is in this set,
// the order counts as a Highsman order.
const HIGHSMAN_PRODUCT_IDS = new Set<number>([
  // Hit Stick Singles
  2554071, 2554859, 2554839, 2554077, 2554845,
  // Black Tin 5-Packs
  2642378, 2642379, 2642381, 2642380, 2642382,
  // Fly High 5-Packs
  2644313, 2644314, 2644315, 2644316, 2644317,
  // Triple Threat Pre-Rolls (1.2g case 12)
  2816205, 2816206, 2816207, 2816208, 2816209,
  // Ground Game Milled Flower (7g case 6)
  2816210, 2816211, 2816212, 2816213, 2816214,
]);

// Reorder window: a shop is "Reorder Due" if their most recent Highsman order
// is older than this many days.
const REORDER_DUE_DAYS = 30;

// Vibes coverage states. Reid's call: NJ-only for v1. Out-of-state new
// customers get a greyed-out "no Vibes coverage in [state] yet" note.
const VIBES_COVERED_STATES = new Set(['NJ', 'New Jersey']);

// "Order is far enough along that we can book a Vibes visit" gate. The
// Account Visit shouldn't go on Sky's calendar until the seller has accepted
// AND committed an actual ship date.
const READY_STATUSES = new Set([
  'Accepted',
  'Backorder',
  'Shipped',
  'Combined',
  'Fulfilled',
  'Complete',
]);

// Needs Onboarding pipeline (per memory `project_zoho_popup_poc_strategy.md`
// and confirmed in api.vibes-route.tsx). When we create an onboarding deal
// here, that's the signal the Vibes visit is booked.
const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';

// Note subjects we treat as the "graduate this account from New Customers"
// signal. Either marker drops the card off the tab on the next sync:
//   • [CHECKIN-12D] — Sky's 12-day post-ship check-in call (api.sales-floor-
//     checkin-done writes this).
//   • [ONBOARDED]   — Serena's completed brand-team first_visit (api.vibes-
//     visit-submit writes this immediately on visit submit, so the card
//     drops the same day she walks out of the store rather than waiting
//     12 more days for the Sky check-in).
const CHECKIN_NOTE_SUBJECT = '[CHECKIN-12D]';
const ONBOARDED_NOTE_SUBJECT = '[ONBOARDED]';

// Days from actual_ship_date to the 12-day check-in.
const CHECKIN_AFTER_DAYS = 12;

// 4/20 drop cutoff. Any shop whose FIRST Highsman LeafLink order is on or after
// this timestamp gets flagged as part of the 4/20 cohort — gold "4/20 DROP"
// pill on the card + sorted to the top of New Customers so Sky can lock in the
// freshest first-time buyers immediately.
const POST_420_CUTOFF_ISO = '2026-04-20T00:00:00Z';
const POST_420_CUTOFF_MS = new Date(POST_420_CUTOFF_ISO).getTime();

// New Customers tab reset floor. Any first-time order placed BEFORE this
// timestamp is suppressed from the Sales Floor New Customers tab so Sky's
// view starts empty going into Vibes go-live. Older accounts continue to be
// handled through the existing manual flow in Zoho — we deliberately do NOT
// touch any Zoho status when we suppress them; this is purely a UI filter.
//
// Bumped to 2026-04-28 so the tab is empty when Reid trains Sky tomorrow
// morning; only first-time orders placed Tue Apr 28 onwards populate.
const NEW_CUSTOMERS_FLOOR_ISO = '2026-04-28T00:00:00-04:00';
const NEW_CUSTOMERS_FLOOR_MS = new Date(NEW_CUSTOMERS_FLOOR_ISO).getTime();

// ─── Zoho OAuth (shared cache; null on missing creds / refresh failure) ─────
// Wraps the shared Zoho helper so callers below can still soft-degrade when
// credentials are missing or the refresh fails.
async function getZohoToken(env: any): Promise<string | null> {
  try {
    return await getZohoAccessToken(env);
  } catch {
    return null;
  }
}

// ─── LeafLink helpers ────────────────────────────────────────────────────────

type LLOrder = {
  number?: string;
  short_id?: string;
  status?: string;
  customer?: {id?: number; name?: string} | null;
  buyer?: {id?: number; name?: string} | null;
  line_items?: Array<{
    product?: number;
    product_name?: string;
    sku?: string;
    quantity?: number | string;
    sale_total?: string | number;
    ordered_unit_price?: {amount?: string | number} | string | number;
  }>;
  actual_ship_date?: string | null;
  requested_ship_date?: string | null;
  created_on?: string;
  modified?: string;
  total?: string | number;
  external_id_seller?: string;
};

/**
 * Pull all orders-received for a given seller, paged through. Filters in
 * memory to orders that contain at least one Highsman product line.
 */
async function fetchHighsmanOrdersForSeller(
  sellerId: number,
  apiKey: string,
): Promise<LLOrder[]> {
  const out: LLOrder[] = [];
  let page = 1;
  const maxPages = 10; // safety: 10 pages * 100 = 1000 orders per seller cap

  while (page <= maxPages) {
    const url =
      `${LEAFLINK_API_BASE}/orders-received/` +
      `?seller=${sellerId}` +
      `&ordering=-created_on` +
      `&page_size=100` +
      `&page=${page}`;

    const res = await fetch(url, {
      headers: {Authorization: `Token ${apiKey}`},
    });
    if (!res.ok) {
      console.warn(
        `[sf-leaflink-orders] seller ${sellerId} page ${page} → ${res.status}`,
      );
      break;
    }
    const data = await res.json();
    const results: LLOrder[] = data.results || [];
    if (!results.length) break;

    for (const order of results) {
      const items = order.line_items || [];
      const isHighsman = items.some(
        (li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product),
      );
      if (isHighsman) out.push(order);
    }

    if (!data.next) break;
    page++;
  }

  return out;
}

/** Pick a usable line-item display string. */
function topSkus(order: LLOrder, limit = 3): string[] {
  const items = order.line_items || [];
  return items
    .filter((li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product))
    .slice(0, limit)
    .map((li) => li.sku || li.product_name || `#${li.product}`);
}

function orderTotal(order: LLOrder): number {
  if (order.total) {
    const n = parseFloat(String(order.total));
    if (!isNaN(n)) return n;
  }
  // Fall back to summing sale_total on Highsman lines
  let sum = 0;
  for (const li of order.line_items || []) {
    if (typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product)) {
      const t = parseFloat(String(li.sale_total || 0));
      if (!isNaN(t)) sum += t;
    }
  }
  return sum;
}

function bestOrderDate(order: LLOrder): string | null {
  return order.actual_ship_date || order.created_on || order.modified || null;
}

function daysBetween(iso: string, now: number): number {
  const t = new Date(iso).getTime();
  if (isNaN(t)) return 0;
  return Math.floor((now - t) / (1000 * 60 * 60 * 24));
}

// ─── Zoho lookups (best-effort, never throws) ───────────────────────────────

type ZohoAccountLite = {
  id: string;
  name: string;
  state: string | null;
  phone: string | null;
};

/** Find a Zoho Account by exact name. Cached per request inside the loader. */
async function findZohoAccountByName(
  name: string,
  token: string,
): Promise<ZohoAccountLite | null> {
  try {
    const url =
      `https://www.zohoapis.com/crm/v7/Accounts/search` +
      `?criteria=(Account_Name:equals:${encodeURIComponent(name)})` +
      `&fields=Account_Name,Billing_State,Account_State,Phone`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204 || !res.ok) return null;
    const data = await res.json();
    const a = (data.data || [])[0];
    if (!a) return null;
    return {
      id: a.id,
      name: a.Account_Name || name,
      state: a.Billing_State || a.Account_State || null,
      phone: a.Phone || null,
    };
  } catch {
    return null;
  }
}

/** Check if an open Needs Onboarding deal already exists for this account. */
async function findOnboardingDealForAccount(
  accountId: string,
  token: string,
): Promise<string | null> {
  try {
    const url =
      `https://www.zohoapis.com/crm/v7/Deals/search` +
      `?criteria=((Account_Name:equals:${accountId})and(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE}))` +
      `&fields=Deal_Name,Stage,Pipeline`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204 || !res.ok) return null;
    const data = await res.json();
    const d = (data.data || [])[0];
    return d?.id || null;
  } catch {
    return null;
  }
}

/**
 * Check whether this account has been graduated from the New Customers tab
 * — either by Sky's 12-day check-in note ([CHECKIN-12D]) or by Serena's
 * onboarding visit completion note ([ONBOARDED]). Either marker is enough
 * to drop the card.
 */
async function findCheckinNoteForAccount(
  accountId: string,
  token: string,
): Promise<string | null> {
  try {
    const url =
      `https://www.zohoapis.com/crm/v7/Accounts/${accountId}/Notes` +
      `?fields=Note_Title,Created_Time&per_page=20`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204 || !res.ok) return null;
    const data = await res.json();
    const notes: any[] = data.data || [];
    const hit = notes.find((n) => {
      const title = String(n.Note_Title || '');
      return (
        title.includes(CHECKIN_NOTE_SUBJECT) ||
        title.includes(ONBOARDED_NOTE_SUBJECT)
      );
    });
    return hit?.id || null;
  } catch {
    return null;
  }
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  const apiKey = env.LEAFLINK_API_KEY;
  if (!apiKey) {
    return json({
      ok: false,
      error: 'LEAFLINK_API_KEY not configured',
      reorderDue: [],
      newCustomers: [],
      meta: {sellerIds: HIGHSMAN_SELLER_IDS, fetchedAt: new Date().toISOString(), ordersScanned: 0, errors: ['no_leaflink_key']},
    });
  }

  const errors: string[] = [];
  const now = Date.now();

  // 1) Pull every Highsman order across every Canfections seller we know.
  let allOrders: LLOrder[] = [];
  for (const sellerId of HIGHSMAN_SELLER_IDS) {
    try {
      const orders = await fetchHighsmanOrdersForSeller(sellerId, apiKey);
      allOrders = allOrders.concat(orders);
    } catch (err: any) {
      console.error(`[sf-leaflink-orders] seller ${sellerId} fetch failed:`, err.message);
      errors.push(`seller_${sellerId}_fetch_failed`);
    }
  }

  // 2) Group by customer.
  type CustomerBucket = {
    customerId: number;
    customerName: string;
    orders: LLOrder[];
  };
  const byCustomer = new Map<number, CustomerBucket>();
  // Same whole-word prefix rule we use in api.sales-floor-sync.tsx — drop
  // "Test", "Test Dispensary", "TEST-2", but not "Testament" or "Tester".
  const isTestCustomerName = (name: string | null | undefined) =>
    /^test(?![a-z])/i.test(String(name || '').trim());
  for (const order of allOrders) {
    const cust = order.customer || order.buyer;
    if (!cust || typeof cust.id !== 'number') continue;
    // Skip throwaway test customers before they ever enter the bucket.
    if (isTestCustomerName(cust.name)) continue;
    let bucket = byCustomer.get(cust.id);
    if (!bucket) {
      bucket = {
        customerId: cust.id,
        customerName: cust.name || `Customer #${cust.id}`,
        orders: [],
      };
      byCustomer.set(cust.id, bucket);
    }
    bucket.orders.push(order);
  }

  // Sort each customer's orders newest → oldest using best available date.
  for (const bucket of byCustomer.values()) {
    bucket.orders.sort((a, b) => {
      const ta = new Date(bestOrderDate(a) || 0).getTime();
      const tb = new Date(bestOrderDate(b) || 0).getTime();
      return tb - ta;
    });
  }

  // 3) Segment into Reorder Due vs. New Customers.
  type ReorderDueRow = {
    customerId: number;
    customerName: string;
    lastOrderDate: string | null;
    daysSinceLastOrder: number;
    lastOrderTotal: number;
    lastOrderSkus: string[];
    lastOrderNumber: string;
    zohoAccountId?: string;
    state?: string | null;
    phone?: string | null;
  };
  type NewCustomerRow = {
    customerId: number;
    customerName: string;
    firstOrderId: string;
    firstOrderNumber: string;
    firstOrderDate: string | null;
    firstOrderStatus: string;
    firstOrderTotal: number;
    firstOrderSkus: string[];
    actualShipDate: string | null;
    state: string | null;
    vibesEligible: boolean;
    zohoAccountId?: string;
    phone?: string | null;
    onboardBookedDealId?: string | null;
    checkInDoneNoteId?: string | null;
    checkInDueDate?: string | null;
    cardState: 'pending' | 'ready' | 'vibes_booked' | 'checkin_due' | 'done';
    is420Cohort: boolean;
  };

  const reorderDue: ReorderDueRow[] = [];
  const newCustomers: NewCustomerRow[] = [];

  for (const bucket of byCustomer.values()) {
    const orderCount = bucket.orders.length;
    const newest = bucket.orders[0];
    const oldest = bucket.orders[bucket.orders.length - 1];

    if (orderCount === 1) {
      // First-ever Highsman order on this account.
      const status = String(newest.status || '').trim();
      const ship = newest.actual_ship_date || null;
      const firstDateIso = bestOrderDate(oldest);
      const firstDateMs = firstDateIso ? new Date(firstDateIso).getTime() : 0;
      // Reset floor: suppress everything older than NEW_CUSTOMERS_FLOOR_ISO
      // so the tab starts empty going into Vibes go-live. Older first-timers
      // stay in Zoho and are worked manually through the legacy flow — we
      // never write to Zoho here, this is purely a UI suppression.
      if (firstDateMs && firstDateMs < NEW_CUSTOMERS_FLOOR_MS) continue;
      const is420Cohort = firstDateMs >= POST_420_CUTOFF_MS;
      newCustomers.push({
        customerId: bucket.customerId,
        customerName: bucket.customerName,
        firstOrderId: newest.short_id || newest.number || '',
        firstOrderNumber: newest.number || newest.short_id || '',
        firstOrderDate: firstDateIso,
        firstOrderStatus: status,
        firstOrderTotal: orderTotal(newest),
        firstOrderSkus: topSkus(newest),
        actualShipDate: ship,
        state: null, // filled in by Zoho lookup below
        vibesEligible: false, // filled in below
        cardState: READY_STATUSES.has(status) && ship ? 'ready' : 'pending',
        is420Cohort,
      });
    } else {
      // Returning customer — segment by recency on most recent order.
      const lastDate = bestOrderDate(newest);
      if (!lastDate) continue;
      const days = daysBetween(lastDate, now);
      if (days >= REORDER_DUE_DAYS) {
        reorderDue.push({
          customerId: bucket.customerId,
          customerName: bucket.customerName,
          lastOrderDate: lastDate,
          daysSinceLastOrder: days,
          lastOrderTotal: orderTotal(newest),
          lastOrderSkus: topSkus(newest),
          lastOrderNumber: newest.number || newest.short_id || '',
        });
      }
    }
  }

  // Sort: most-overdue reorders first; oldest new customers first.
  reorderDue.sort((a, b) => b.daysSinceLastOrder - a.daysSinceLastOrder);
  newCustomers.sort((a, b) => {
    const ta = new Date(a.firstOrderDate || 0).getTime();
    const tb = new Date(b.firstOrderDate || 0).getTime();
    return ta - tb;
  });

  // 4) Cross-reference Zoho — best-effort, capped to keep latency sane.
  const zohoToken = await getZohoToken(env);
  if (zohoToken) {
    // Cap Zoho lookups to top 50 reorder-due + ALL new customers (small set).
    const REORDER_LOOKUP_CAP = 50;
    const reorderToHydrate = reorderDue.slice(0, REORDER_LOOKUP_CAP);

    for (const row of reorderToHydrate) {
      const acct = await findZohoAccountByName(row.customerName, zohoToken);
      if (acct) {
        row.zohoAccountId = acct.id;
        row.state = acct.state;
        row.phone = acct.phone;
      }
    }

    for (const row of newCustomers) {
      const acct = await findZohoAccountByName(row.customerName, zohoToken);
      if (acct) {
        row.zohoAccountId = acct.id;
        row.state = acct.state;
        row.phone = acct.phone;
        row.vibesEligible = !!acct.state && VIBES_COVERED_STATES.has(acct.state);

        // Only check Needs Onboarding deal + checkin note if there's an
        // account to check against. Cheap parallel fan-out per row.
        const [dealId, noteId] = await Promise.all([
          findOnboardingDealForAccount(acct.id, zohoToken),
          findCheckinNoteForAccount(acct.id, zohoToken),
        ]);
        row.onboardBookedDealId = dealId;
        row.checkInDoneNoteId = noteId;
      } else {
        row.vibesEligible = false;
      }

      // Re-derive card state with the full picture.
      if (row.checkInDoneNoteId) {
        row.cardState = 'done';
      } else if (row.onboardBookedDealId && row.actualShipDate) {
        const ship = new Date(row.actualShipDate).getTime();
        const checkInDue = ship + CHECKIN_AFTER_DAYS * 86400 * 1000;
        row.checkInDueDate = new Date(checkInDue).toISOString();
        row.cardState = now >= checkInDue ? 'checkin_due' : 'vibes_booked';
      } else if (row.onboardBookedDealId) {
        row.cardState = 'vibes_booked';
      } else if (READY_STATUSES.has(row.firstOrderStatus) && row.actualShipDate) {
        row.cardState = 'ready';
      } else {
        row.cardState = 'pending';
      }
    }
  } else {
    errors.push('zoho_unavailable');
  }

  // Filter out "done" cards from the New Customers tab — once Sky's logged
  // the 12-day check-in, the shop graduates to the regular Accounts list.
  const visibleNewCustomers = newCustomers.filter((r) => r.cardState !== 'done');
  const cohort420Count = visibleNewCustomers.filter((r) => r.is420Cohort).length;

  return json({
    ok: true,
    reorderDue,
    newCustomers: visibleNewCustomers,
    meta: {
      sellerIds: HIGHSMAN_SELLER_IDS,
      fetchedAt: new Date().toISOString(),
      ordersScanned: allOrders.length,
      uniqueCustomers: byCustomer.size,
      cohort420Count,
      cohort420CutoffIso: POST_420_CUTOFF_ISO,
      errors,
    },
  });
}
