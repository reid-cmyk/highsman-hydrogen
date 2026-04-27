import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// /api/account-last-orders
// ─────────────────────────────────────────────────────────────────────────────
// GET → { ok, byAccountName: { [UPPER_NAME]: {date, total, orderNumber} }, count }
//
// Authoritative last-order summary for every Highsman customer, sourced from
// Zoho INVENTORY Sales Orders (org 882534504). CRM Deals are unreliable for
// real revenue (placeholder Sales-floor pushes carry $0, mismatched timing,
// etc.) — Inventory Sales Orders are the actual confirmed-revenue records.
//
// Map is keyed by uppercased + trimmed customer_name so the client can do
//   byAccountName[a.Account_Name.trim().toUpperCase()]
// without us having to maintain a CRM↔Inventory id bridge. Highsman's CRM /
// Inventory integration keeps customer names aligned, so a name match is
// reliable enough.
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_INVENTORY_ORG_ID = '882534504';

let cachedToken: {token: string; expiresAt: number} | null = null;
const TOKEN_TTL_MS = 55 * 60 * 1000;

async function getInventoryToken(env: any): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 30_000) return cachedToken.token;
  const clientId = env.ZOHO_INVENTORY_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_INVENTORY_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_INVENTORY_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho Inventory credentials missing');
  }
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: body.toString(),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Zoho Inventory token refresh failed: ${res.status} — ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Inventory token refresh: no access_token');
  cachedToken = {token: data.access_token, expiresAt: now + TOKEN_TTL_MS};
  return data.access_token;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function fetchRecentSalesOrders(
  env: any,
  token: string,
  startDate: Date,
  endDate: Date,
): Promise<any[]> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_INVENTORY_ORG_ID;
  const dateStart = ymd(startDate);
  const dateEnd = ymd(endDate);
  const perPage = 200;

  // Confirmed + Closed = all revenue-bearing states. Drafts / Voids excluded.
  const statusFilters = ['Status.Confirmed', 'Status.Closed'];
  const orders: any[] = [];
  const seen = new Set<string>();

  for (const statusFilter of statusFilters) {
    let page = 1;
    while (true) {
      const url =
        `https://www.zohoapis.com/inventory/v1/salesorders` +
        `?organization_id=${orgId}` +
        `&date_start=${dateStart}` +
        `&date_end=${dateEnd}` +
        `&filter_by=${statusFilter}` +
        `&per_page=${perPage}` +
        `&page=${page}`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) break;
      const data: any = await res.json();
      for (const so of data.salesorders || []) {
        const id = so.salesorder_id || so.id;
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        orders.push(so);
      }
      const hasMore = data.page_context?.has_more_page;
      if (!hasMore) break;
      page += 1;
      if (page > 25) break; // safety cap
    }
  }
  return orders;
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = (context.env as any) || {};
  let token: string;
  try {
    token = await getInventoryToken(env);
  } catch (err: any) {
    return json(
      {ok: false, error: err?.message || 'Inventory auth failed', byAccountName: {}, count: 0},
      {status: 503},
    );
  }

  // 180-day window keeps the page count bounded. Shops that haven't ordered
  // in 6 months don't need a "last order $" pill anyway — they show up in
  // the Reorder-Due card via Account.Last_Order_Date.
  const end = new Date();
  const start = new Date(end.getTime() - 180 * 86400 * 1000);

  let orders: any[];
  try {
    orders = await fetchRecentSalesOrders(env, token, start, end);
  } catch (err: any) {
    return json(
      {ok: false, error: err?.message || 'Inventory fetch failed', byAccountName: {}, count: 0},
      {status: 502},
    );
  }

  // Group by uppercase customer_name; keep the latest order for each.
  const byName = new Map<string, {date: string; total: number; orderNumber: string}>();
  for (const so of orders) {
    const rawName = String(so.customer_name || '').trim();
    if (!rawName) continue;
    const key = rawName.toUpperCase();
    const date = String(so.date || '');
    if (!date) continue;
    const total = Number(so.total || 0);
    if (!total || total <= 0) continue;
    const orderNumber = String(so.salesorder_number || so.reference_number || '');
    const cur = byName.get(key);
    if (!cur || date > cur.date) byName.set(key, {date, total, orderNumber});
  }

  const byAccountName: Record<string, {date: string; total: number; orderNumber: string}> = {};
  for (const [name, info] of byName.entries()) byAccountName[name] = info;

  return json({
    ok: true,
    byAccountName,
    count: byName.size,
    fetchedAt: new Date().toISOString(),
  });
}
