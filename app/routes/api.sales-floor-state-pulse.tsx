import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getInventoryAccessToken} from '../lib/zoho-inventory-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/sales-floor-state-pulse  (GET, rep-auth)
// ─────────────────────────────────────────────────────────────────────────────
// Powers the compact "State Pulse" KPI strip on the /sales-floor dashboard.
// Returns month-to-date booked revenue per focus state (NJ / MA / NY / RI / MO).
//
// Source of truth: Zoho Inventory salesorders, filtered to Status.Confirmed
// + Status.Closed (real revenue, no Drafts / Voided / Onhold). We resolve
// each order's state from `location_name` / `warehouse_name` — same logic
// /sales already uses, so the dashboard strip and the full /sales report
// can never disagree.
//
// "Head Office" warehouse is NOT a focus state code, so resolveStateFromLocation
// returns '' and the order silently drops out — exactly the rule documented
// in `feedback_head_office_orders_excluded`. No special-case needed.
//
// Caching: 5 minutes at the worker edge. Revenue numbers are slow-moving
// dashboard context, not anything a rep clicks; refreshing every page load
// would just waste Zoho quota.
//
// Response shape (always this shape, even on error / empty):
//   {
//     ok: boolean,
//     monthLabel: 'Apr 2026',
//     monthStart: '2026-04-01',
//     monthEnd:   '2026-04-30',
//     byState: { NJ: 12345.67, MA: 0, NY: 0, RI: 0, MO: 0 },
//     orderCounts: { NJ: 14, MA: 0, NY: 0, RI: 0, MO: 0 },
//     lastUpdated: ISO timestamp,
//     reason?: 'not-configured' | 'zoho-error' | 'no-data',  // when ok=false
//   }
// ─────────────────────────────────────────────────────────────────────────────

const FOCUS_STATES = ['NJ', 'MA', 'NY', 'RI', 'MO'] as const;
type StateCode = (typeof FOCUS_STATES)[number];

const STATE_FULL_NAMES: Record<string, StateCode> = {
  'NEW JERSEY': 'NJ',
  'MASSACHUSETTS': 'MA',
  'NEW YORK': 'NY',
  'RHODE ISLAND': 'RI',
  'MISSOURI': 'MO',
};

const CITY_STATE_HINTS: Record<string, StateCode> = {
  NEWARK: 'NJ',
  JERSEY: 'NJ',
  COLLINGSWOOD: 'NJ',
  TRENTON: 'NJ',
  BOSTON: 'MA',
  WORCESTER: 'MA',
  SPRINGFIELD: 'MA',
  BROOKLYN: 'NY',
  MANHATTAN: 'NY',
  PROVIDENCE: 'RI',
  CRANSTON: 'RI',
  STLOUIS: 'MO',
  KANSASCITY: 'MO',
  KIRKSVILLE: 'MO',
  JOPLIN: 'MO',
};

// Mirrors resolveStateFromLocation() in app/routes/sales.tsx. Kept as a copy
// (not an import) on purpose — sales.tsx is a Remix route module, not a lib,
// and we don't want this endpoint to start pulling in route-level concerns.
// If the rules diverge, that's a bug to fix in BOTH spots; the test for
// sameness is "do /sales and /sales-floor agree on state totals".
function resolveStateFromLocation(locationName: string): StateCode | '' {
  if (!locationName) return '';
  const upper = locationName.toUpperCase();
  const codeMatch = upper.match(/\b(NJ|MA|NY|RI|MO)\b/);
  if (codeMatch) return codeMatch[1] as StateCode;
  for (const [fullName, code] of Object.entries(STATE_FULL_NAMES)) {
    if (upper.includes(fullName)) return code;
  }
  const squished = upper.replace(/[^A-Z]/g, '');
  for (const [city, code] of Object.entries(CITY_STATE_HINTS)) {
    if (squished.includes(city)) return code;
  }
  return '';
}

const DEFAULT_ZOHO_INVENTORY_ORG_ID = '882534504';

// Inventory uses a separate Self Client. Token fetched via the shared cached
// helper at app/lib/zoho-inventory-auth.ts so cold workers don't fan out
// concurrent /oauth/v2/token POSTs and trip Zoho's 'too many requests'
// rate limit (which is what we hit on 2026-04-28 — three Inventory routes
// each owned an inline cache, all refreshed together, blocked the org).

function ymd(d: Date): string {
  const yy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

function nyParts(): {year: number; month: number} {
  // Anchor "this month" to America/New_York so a late-night UTC tick doesn't
  // flip the dashboard to next month before NJ does.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  return {
    year: Number(parts.find((p) => p.type === 'year')?.value || new Date().getFullYear()),
    month: Number(parts.find((p) => p.type === 'month')?.value || new Date().getMonth() + 1),
  };
}

function monthBounds(): {start: Date; end: Date; label: string} {
  const {year, month} = nyParts();
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // last day of the month
  const monthName = new Date(year, month - 1, 1).toLocaleString('en-US', {month: 'short'});
  return {start, end, label: `${monthName} ${year}`};
}

async function fetchSalesOrders(
  env: any,
  token: string,
  start: Date,
  end: Date,
): Promise<any[]> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  const dateStart = ymd(start);
  const dateEnd = ymd(end);
  const perPage = 200;
  // Real revenue only — same filter set /sales uses.
  const statusFilters = ['Status.Confirmed', 'Status.Closed'];
  const orders: any[] = [];
  const seen = new Set<string>();

  for (const status of statusFilters) {
    let page = 1;
    while (true) {
      const url =
        `https://www.zohoapis.com/inventory/v1/salesorders` +
        `?organization_id=${orgId}` +
        `&date_start=${dateStart}` +
        `&date_end=${dateEnd}` +
        `&filter_by=${status}` +
        `&per_page=${perPage}` +
        `&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        // Don't throw — partial data is still useful for a dashboard pulse.
        const txt = await res.text().catch(() => '');
        console.warn(
          `[state-pulse] Zoho list ${res.status} on ${status} p${page}: ${txt.slice(0, 200)}`,
        );
        break;
      }
      const data: any = await res.json();
      for (const so of data.salesorders || []) {
        const id = so.salesorder_id || so.id;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        orders.push(so);
      }
      if (!data.page_context?.has_more_page) break;
      page += 1;
      if (page > 25) break; // safety cap (5k orders per status — well above MTD volume)
    }
  }

  return orders;
}

function emptyByState(): Record<StateCode, number> {
  return {NJ: 0, MA: 0, NY: 0, RI: 0, MO: 0};
}

export async function loader({request, context}: LoaderFunctionArgs) {
  // Auth gate — same rep-cookie pattern every other /api/sales-floor-* uses.
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, reason: 'unauthenticated'}, {status: 401});
  }

  const env = (context as any).env;
  const {start, end, label} = monthBounds();
  const monthStart = ymd(start);
  const monthEnd = ymd(end);

  // Configured? If not, return a structured zero-state instead of a 500
  // — the dashboard panel just renders dashes and a "not configured" hint.
  const hasClientId = env.ZOHO_INVENTORY_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const hasClientSecret = env.ZOHO_INVENTORY_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const hasRefreshToken = env.ZOHO_INVENTORY_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;
  if (!hasClientId || !hasClientSecret || !hasRefreshToken) {
    return json(
      {
        ok: false,
        reason: 'not-configured',
        monthLabel: label,
        monthStart,
        monthEnd,
        byState: emptyByState(),
        orderCounts: emptyByState(),
        lastUpdated: new Date().toISOString(),
      },
      {headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const token = await getInventoryAccessToken(env);
    const orders = await fetchSalesOrders(env, token, start, end);

    const byState: Record<StateCode, number> = emptyByState();
    const orderCounts: Record<StateCode, number> = emptyByState();

    // Debug bucket — captured only when ?debug=1. Lets us see, per raw
    // warehouse name, how many orders + dollars contributed and what they
    // look like (5-order sample). Built unconditionally so toggling debug
    // doesn't change the hot path; serialized only when asked.
    type DebugBucket = {
      stateCode: string;
      total: number;
      count: number;
      sample: Array<{
        salesorder_number: string;
        customer_name: string;
        total: number;
        status: string;
        date: string;
      }>;
    };
    const byWarehouse = new Map<string, DebugBucket>();
    let droppedNoState = 0;
    let droppedNoStateDollars = 0;

    for (const so of orders) {
      const rawLocation: string = so.location_name || so.warehouse_name || '';
      const code = resolveStateFromLocation(rawLocation);
      const total = Number(so.total || 0) || 0;
      const whKey = rawLocation || '(blank)';
      let b = byWarehouse.get(whKey);
      if (!b) {
        b = {stateCode: code || '', total: 0, count: 0, sample: []};
        byWarehouse.set(whKey, b);
      }
      b.total += total;
      b.count += 1;
      if (b.sample.length < 5) {
        b.sample.push({
          salesorder_number: so.salesorder_number || so.reference_number || '',
          customer_name: so.customer_name || '',
          total,
          status: so.status || '',
          date: so.date || so.created_time || '',
        });
      }
      if (!code) {
        droppedNoState += 1;
        droppedNoStateDollars += total;
        continue; // silently drops Head Office + any unmapped warehouse
      }
      byState[code] += total;
      orderCounts[code] += 1;
    }

    const url = new URL(request.url);
    if (url.searchParams.get('debug') === '1') {
      const warehouseBreakdown = Array.from(byWarehouse.entries())
        .map(([name, b]) => ({
          warehouse: name,
          stateCode: b.stateCode,
          total: Math.round(b.total * 100) / 100,
          count: b.count,
          avg: b.count ? Math.round((b.total / b.count) * 100) / 100 : 0,
          sample: b.sample,
        }))
        .sort((a, b) => b.count - a.count);
      return json({
        ok: true,
        debug: true,
        monthLabel: label,
        monthStart,
        monthEnd,
        totalOrdersScanned: orders.length,
        droppedNoState,
        droppedNoStateDollars: Math.round(droppedNoStateDollars * 100) / 100,
        byState,
        orderCounts,
        warehouseBreakdown,
      }, {headers: {'Cache-Control': 'no-store'}});
    }

    return json(
      {
        ok: true,
        monthLabel: label,
        monthStart,
        monthEnd,
        byState,
        orderCounts,
        lastUpdated: new Date().toISOString(),
      },
      {
        headers: {
          // 5 minute edge cache. Revenue isn't a click target, this is
          // ambient context — no need to refetch on every page load.
          'Cache-Control': 'public, max-age=60, s-maxage=300',
        },
      },
    );
  } catch (err: any) {
    console.error('[state-pulse] failed:', err?.message || err);
    return json(
      {
        ok: false,
        reason: 'zoho-error',
        monthLabel: label,
        monthStart,
        monthEnd,
        byState: emptyByState(),
        orderCounts: emptyByState(),
        lastUpdated: new Date().toISOString(),
        error: String(err?.message || err).slice(0, 200),
      },
      {status: 502, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
