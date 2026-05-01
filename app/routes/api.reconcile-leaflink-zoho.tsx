import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getInventoryAccessToken} from '~/lib/zoho-inventory-auth';

// LeafLink ↔ Zoho Inventory Reconciliation (v4 — review tool)
// Returns: all LL Highsman orders (with detail-fetched totals + customer names),
// all Zoho SOs (filtered to NJ-relevant customers), plus 3 buckets:
//   - certainMatches  (ref# token from LL appears in Zoho ref/notes/salesorder_number)
//   - unsureMatches   (same customer + Zoho SO within ±30d — Reid confirms manually)
//   - unmatchedLL     (no candidates at all)
// Also includes unmatchedZoho (Zoho SOs with no LL pair) so Reid sees both sides.

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const DEFAULT_ZOHO_INVENTORY_ORG_ID = '882534504';
const HIGHSMAN_SELLER_IDS: number[] = [24087];

const HIGHSMAN_PRODUCT_IDS = new Set<number>([
  2554071, 2554859, 2554839, 2554077, 2554845,
  2642378, 2642379, 2642381, 2642380, 2642382,
  2644313, 2644314, 2644315, 2644316, 2644317,
  2816205, 2816206, 2816207, 2816208, 2816209,
  2816210, 2816211, 2816212, 2816213, 2816214,
]);

const UNSURE_DATE_WINDOW_DAYS = 30;
const LEAFLINK_MAX_PAGES = 25;
const ZOHO_MAX_PAGES_PER_STATUS = 50;
const FETCH_TIMEOUT_MS = 15000;
const DETAIL_CONCURRENCY = 8;

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
  }>;
  actual_ship_date?: string | null;
  requested_ship_date?: string | null;
  created_on?: string;
  modified?: string;
  total?: string | number;
};

type LLOrderDetail = LLOrder & {
  total?: string | number;
  total_value?: string | number;
  sub_total?: string | number;
  line_items?: any[];
};

type LLCustomerDetail = {
  id?: number;
  name?: string;
  display_name?: string;
  company_name?: string;
  state?: string | null;
  shipping_address?: {state?: string | null; state_code?: string | null} | null;
  billing_address?: {state?: string | null; state_code?: string | null} | null;
};

type ZohoSO = {
  salesorder_id?: string;
  salesorder_number?: string;
  reference_number?: string;
  customer_id?: string;
  customer_name?: string;
  date?: string;
  total?: number | string;
  status?: string;
  warehouse_id?: string;
  location_id?: string;
  location_name?: string;
  warehouse_name?: string;
  notes?: string;
};

async function fetchT(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctrl.signal});
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out[i] = await fn(items[i]);
      } catch {}
    }
  });
  await Promise.all(workers);
  return out;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function normalizeAccountName(raw: string): string {
  return String(raw || '')
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[‘’'`]/g, '')
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\b(LLC|L\.?L\.?C|INC|INC\.?|CO|CO\.?|CORP|CORP\.?|LTD|LTD\.?|LP|L\.?P|PLLC|GROUP|HOLDINGS|HOLDING|COMPANY|CANNABIS|DISPENSARY|DISPENSARIES|RECREATIONAL|MEDICAL|MED|REC|FARMS|FARM|THE|A|AN|OF|AT)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTotal(raw: any): number {
  if (raw == null) return 0;
  const n = parseFloat(String(raw));
  return isNaN(n) ? 0 : n;
}

function bestOrderDate(o: LLOrder): string | null {
  return o.created_on || o.modified || o.actual_ship_date || null;
}

function topSkus(o: LLOrder, limit = 3): string[] {
  const items = o.line_items || [];
  return items
    .filter((li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product))
    .slice(0, limit)
    .map((li) => li.sku || li.product_name || `#${li.product}`);
}

function llTotalFromAny(o: any): number {
  if (!o) return 0;
  for (const k of ['total', 'total_value', 'grand_total', 'sub_total']) {
    if (o[k] != null) {
      const n = parseFloat(String(o[k]));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  let sum = 0;
  for (const li of o.line_items || []) {
    sum += parseTotal(li.sale_total ?? li.line_total ?? li.unit_price);
  }
  return sum;
}

function normalizeStateField(raw: any): string {
  if (raw == null) return '';
  const trimmed = String(raw).trim().toUpperCase();
  if (!trimmed) return '';
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  if (trimmed.includes('NEW JERSEY')) return 'NJ';
  if (trimmed.includes('MASSACHUSETTS')) return 'MA';
  if (trimmed.includes('NEW YORK')) return 'NY';
  if (trimmed.includes('RHODE ISLAND')) return 'RI';
  if (trimmed.includes('MISSOURI')) return 'MO';
  return '';
}

// ── LeafLink fetches ──────────────────────────────────────────────────────
async function fetchHighsmanOrders(sellerId: number, apiKey: string, sinceISO: string): Promise<LLOrder[]> {
  const out: LLOrder[] = [];
  const seenIds = new Set<string>();
  const sinceMs = new Date(sinceISO).getTime();
  let url: string | null =
    `${LEAFLINK_API_BASE}/orders-received/?seller=${sellerId}&ordering=-created_on&page_size=100`;
  let pages = 0;
  while (url && pages < LEAFLINK_MAX_PAGES) {
    pages++;
    const res = await fetchT(url, {headers: {Authorization: `Token ${apiKey}`}});
    if (!res.ok) break;
    const data: any = await res.json();
    const results: LLOrder[] = data.results || [];
    if (!results.length) break;
    let allOlder = true;
    let allDupes = true;
    for (const order of results) {
      const idKey = String(order.short_id || order.number || '');
      if (idKey && seenIds.has(idKey)) continue;
      allDupes = false;
      if (idKey) seenIds.add(idKey);
      const dateIso = bestOrderDate(order);
      const ms = dateIso ? new Date(dateIso).getTime() : 0;
      if (ms >= sinceMs) {
        allOlder = false;
        const items = order.line_items || [];
        const isHighsman = items.some(
          (li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product),
        );
        if (isHighsman) out.push(order);
      }
    }
    if (allOlder) break;
    if (allDupes) break;
    url = typeof data.next === 'string' && data.next.length > 0 ? data.next : null;
  }
  return out;
}

async function fetchLLOrderDetail(orderNumber: string, apiKey: string): Promise<LLOrderDetail | null> {
  try {
    const url = `${LEAFLINK_API_BASE}/orders-received/${orderNumber}/`;
    const res = await fetchT(url, {headers: {Authorization: `Token ${apiKey}`}});
    if (!res.ok) return null;
    return (await res.json()) as LLOrderDetail;
  } catch {
    return null;
  }
}

async function fetchLLCustomerDetail(customerId: number, apiKey: string): Promise<LLCustomerDetail | null> {
  try {
    const url = `${LEAFLINK_API_BASE}/customers/${customerId}/`;
    const res = await fetchT(url, {headers: {Authorization: `Token ${apiKey}`}});
    if (!res.ok) return null;
    return (await res.json()) as LLCustomerDetail;
  } catch {
    return null;
  }
}

function customerStateFromDetail(d: LLCustomerDetail | null): string {
  if (!d) return '';
  for (const c of [d.state, d.shipping_address?.state, d.shipping_address?.state_code, d.billing_address?.state, d.billing_address?.state_code]) {
    const s = normalizeStateField(c);
    if (s) return s;
  }
  return '';
}

function customerNameFromDetail(d: LLCustomerDetail | null): string {
  if (!d) return '';
  return (d.display_name || d.company_name || d.name || '').trim();
}

// ── Zoho fetch ────────────────────────────────────────────────────────────
async function fetchZohoSalesOrders(orgId: string, token: string, startDate: Date, endDate: Date): Promise<ZohoSO[]> {
  const dateStart = ymd(startDate);
  const dateEnd = ymd(endDate);
  const perPage = 200;
  const statuses = ['Status.Confirmed', 'Status.Closed'];
  const orders: ZohoSO[] = [];
  const seen = new Set<string>();
  for (const statusFilter of statuses) {
    let page = 1;
    while (page <= ZOHO_MAX_PAGES_PER_STATUS) {
      const url =
        `https://www.zohoapis.com/inventory/v1/salesorders` +
        `?organization_id=${orgId}&date_start=${dateStart}&date_end=${dateEnd}` +
        `&filter_by=${statusFilter}&per_page=${perPage}&page=${page}`;
      const res = await fetchT(url, {
        headers: {Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json'},
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Zoho Inventory list ${res.status}: ${txt.slice(0, 200)}`);
      }
      const data: any = await res.json();
      for (const so of data.salesorders || []) {
        const id = String(so.salesorder_id || so.id || '');
        if (id && seen.has(id)) continue;
        if (id) seen.add(id);
        orders.push(so);
      }
      if (!data.page_context?.has_more_page) break;
      page++;
    }
  }
  return orders;
}

// ── Match logic ───────────────────────────────────────────────────────────
function buildZohoIndex(zohoOrders: ZohoSO[]) {
  const refMap = new Map<string, ZohoSO>(); // lowercased token → first match
  const byCustomerNorm = new Map<string, ZohoSO[]>();
  for (const so of zohoOrders) {
    const candidates = [so.salesorder_number, so.reference_number, so.notes].filter(Boolean) as string[];
    for (const c of candidates) {
      const tokens = c.toLowerCase().split(/[\s,;|]+/).filter(Boolean);
      for (const tok of tokens) if (tok.length >= 4) refMap.set(tok, so);
      refMap.set(c.toLowerCase().trim(), so);
    }
    const norm = normalizeAccountName(so.customer_name || '');
    if (norm) {
      const list = byCustomerNorm.get(norm) || [];
      list.push(so);
      byCustomerNorm.set(norm, list);
    }
  }
  return {refMap, byCustomerNorm};
}

// ── Loader ────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const url = new URL(request.url);
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('sales_auth=1') || cookie.includes('reconcile_auth=1');
  if (!isAuth) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const sinceParam = url.searchParams.get('since') || '2025-06-01';
  const stateFilter = (url.searchParams.get('state') || 'NJ').toUpperCase();
  const since = new Date(sinceParam + 'T00:00:00-04:00');
  const until = new Date();

  const apiKey = env.LEAFLINK_API_KEY;
  if (!apiKey) return json({ok: false, error: 'LEAFLINK_API_KEY not configured'}, {status: 500});

  const errors: string[] = [];
  const t0 = Date.now();

  // 1) LL list
  let allLL: LLOrder[] = [];
  for (const sellerId of HIGHSMAN_SELLER_IDS) {
    try {
      const orders = await fetchHighsmanOrders(sellerId, apiKey, sinceParam);
      allLL = allLL.concat(orders);
    } catch (err: any) {
      errors.push(`leaflink_seller_${sellerId}_failed:${err?.message}`);
    }
  }
  const llListMs = Date.now() - t0;

  // 2) Zoho SOs
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  let invToken: string;
  try {
    invToken = await getInventoryAccessToken(env);
  } catch (err: any) {
    return json({ok: false, error: `Zoho Inventory token: ${err?.message}`}, {status: 500});
  }
  const t1 = Date.now();
  const zohoOrders = await fetchZohoSalesOrders(orgId, invToken, since, until).catch((err) => {
    errors.push(`zoho_orders_failed:${err?.message}`);
    return [] as ZohoSO[];
  });
  const zohoMs = Date.now() - t1;

  // 3) LL detail per order (real totals + line items) — concurrency 8
  // Use short_id since that's the URL key for /orders-received/{id}/
  const t2 = Date.now();
  const llDetailMap = new Map<string, LLOrderDetail>();
  await mapLimit(allLL, DETAIL_CONCURRENCY, async (o) => {
    const key = o.short_id || o.number;
    if (!key) return;
    const d = await fetchLLOrderDetail(key, apiKey);
    if (d) llDetailMap.set(key, d);
  });
  const llDetailMs = Date.now() - t2;

  // 4) Customer detail per unique LL customer
  const t3 = Date.now();
  const uniqueCustomerIds = Array.from(
    new Set(
      allLL
        .map((o) => (o.customer || o.buyer)?.id)
        .filter((v): v is number => typeof v === 'number'),
    ),
  );
  const customerInfo = new Map<number, {name: string; state: string}>();
  await mapLimit(uniqueCustomerIds, DETAIL_CONCURRENCY, async (id) => {
    const detail = await fetchLLCustomerDetail(id, apiKey);
    customerInfo.set(id, {
      name: customerNameFromDetail(detail),
      state: customerStateFromDetail(detail),
    });
  });
  const customerMs = Date.now() - t3;

  // 5) Build flattened LL view with name + total
  type LLView = {
    shortId: string;
    number: string;
    customerId: number | null;
    customerName: string;
    state: string;
    orderDate: string | null;
    actualShipDate: string | null;
    status: string;
    total: number;
    skus: string[];
  };

  const llViews: LLView[] = allLL.map((o) => {
    const cust = o.customer || o.buyer;
    const customerId = cust?.id ?? null;
    const info = customerId != null ? customerInfo.get(customerId) : undefined;
    const customerName = info?.name || cust?.name || (customerId != null ? `Customer #${customerId}` : '');
    const state = info?.state || '';
    const detail = (o.short_id || o.number) ? llDetailMap.get(o.short_id || o.number || '') : null;
    const total = llTotalFromAny(detail || o);
    return {
      shortId: o.short_id || '',
      number: o.number || '',
      customerId,
      customerName,
      state,
      orderDate: bestOrderDate(o),
      actualShipDate: o.actual_ship_date || null,
      status: o.status || '',
      total,
      skus: topSkus(detail || o),
    };
  });

  // 6) Build Zoho index
  const idx = buildZohoIndex(zohoOrders);

  // 7) NJ-relevant Zoho SOs: customer name normalizes to any LL customer name
  const llCustomerNorms = new Set(llViews.map((v) => normalizeAccountName(v.customerName)).filter(Boolean));
  const zohoNjRelated: ZohoSO[] = zohoOrders.filter((so) => {
    const n = normalizeAccountName(so.customer_name || '');
    return n && llCustomerNorms.has(n);
  });

  // 8) Match each LL order
  type CertainMatch = {ll: LLView; zoho: ZohoSO; how: 'ref'};
  type UnsureMatch = {ll: LLView; candidates: Array<{zoho: ZohoSO; daysDiff: number; totalDiff: number}>};
  type UnmatchedLL = {ll: LLView};

  const certainMatches: CertainMatch[] = [];
  const unsureMatches: UnsureMatch[] = [];
  const unmatchedLL: UnmatchedLL[] = [];
  const matchedZohoIds = new Set<string>();

  for (const v of llViews) {
    // Try ref match first
    const refCandidates = [v.number, v.shortId]
      .filter(Boolean)
      .map((s) => s.toLowerCase().trim());
    let certain: ZohoSO | null = null;
    for (const c of refCandidates) {
      if (idx.refMap.has(c)) {
        certain = idx.refMap.get(c)!;
        break;
      }
    }
    if (certain) {
      const id = String(certain.salesorder_id || '');
      if (id) matchedZohoIds.add(id);
      certainMatches.push({ll: v, zoho: certain, how: 'ref'});
      continue;
    }

    // Unsure: same customer, Zoho SO within ±30 days. Top 3 by date proximity.
    const norm = normalizeAccountName(v.customerName);
    const sameCust = idx.byCustomerNorm.get(norm) || [];
    const llMs = v.orderDate ? new Date(v.orderDate).getTime() : 0;
    const win = UNSURE_DATE_WINDOW_DAYS * 86400 * 1000;
    const candidates = sameCust
      .filter((so) => so.date && Math.abs(new Date(so.date).getTime() - llMs) <= win)
      .map((so) => ({
        zoho: so,
        daysDiff: Math.round(Math.abs(new Date(so.date!).getTime() - llMs) / 86400000),
        totalDiff: Math.abs(parseTotal(so.total) - v.total),
      }))
      .sort((a, b) => a.daysDiff - b.daysDiff)
      .slice(0, 3);

    if (candidates.length > 0) {
      unsureMatches.push({ll: v, candidates});
    } else {
      unmatchedLL.push({ll: v});
    }
  }

  // 9) Zoho SOs without any LL pair (orphans within the NJ-related set)
  const unmatchedZoho: ZohoSO[] = zohoNjRelated.filter((so) => {
    const id = String(so.salesorder_id || '');
    return id && !matchedZohoIds.has(id);
  });

  return json({
    ok: true,
    summary: {
      sinceISO: sinceParam,
      stateFilter,
      leaflinkOrdersScanned: llViews.length,
      leaflinkOrdersInState: llViews.filter((v) => v.state === stateFilter).length,
      leaflinkOrdersOtherState: llViews.filter((v) => v.state && v.state !== stateFilter).length,
      leaflinkOrdersUnknownState: llViews.filter((v) => !v.state).length,
      zohoOrdersScanned: zohoOrders.length,
      zohoOrdersNjRelated: zohoNjRelated.length,
      certainCount: certainMatches.length,
      unsureCount: unsureMatches.length,
      unmatchedLLCount: unmatchedLL.length,
      unmatchedZohoCount: unmatchedZoho.length,
      llTotalRevenue: llViews.reduce((s, v) => s + v.total, 0),
      unmatchedLLTotalRevenue: unmatchedLL.reduce((s, r) => s + r.ll.total, 0),
    },
    leaflinkOrders: llViews,
    zohoOrders: zohoNjRelated.map((so) => ({
      salesorder_id: so.salesorder_id,
      salesorder_number: so.salesorder_number,
      reference_number: so.reference_number || '',
      customer_id: so.customer_id,
      customer_name: so.customer_name,
      date: so.date,
      total: parseTotal(so.total),
      status: so.status,
      warehouse_name: so.warehouse_name || so.location_name || '',
    })),
    certainMatches: certainMatches.map((m) => ({
      llShortId: m.ll.shortId,
      zohoSalesOrderId: m.zoho.salesorder_id,
      zohoSalesOrderNumber: m.zoho.salesorder_number,
      how: m.how,
    })),
    unsureMatches: unsureMatches.map((m) => ({
      llShortId: m.ll.shortId,
      candidates: m.candidates.map((c) => ({
        zohoSalesOrderId: c.zoho.salesorder_id,
        zohoSalesOrderNumber: c.zoho.salesorder_number,
        zohoDate: c.zoho.date,
        zohoTotal: parseTotal(c.zoho.total),
        zohoCustomerName: c.zoho.customer_name,
        daysDiff: c.daysDiff,
        totalDiff: c.totalDiff,
      })),
    })),
    unmatchedLL: unmatchedLL.map((r) => ({llShortId: r.ll.shortId})),
    unmatchedZohoIds: unmatchedZoho.map((so) => so.salesorder_id),
    meta: {
      sellerIds: HIGHSMAN_SELLER_IDS,
      orgId,
      llListMs,
      llDetailMs,
      customerMs,
      zohoMs,
      totalMs: Date.now() - t0,
      fetchedAt: new Date().toISOString(),
      errors,
    },
  });
}
