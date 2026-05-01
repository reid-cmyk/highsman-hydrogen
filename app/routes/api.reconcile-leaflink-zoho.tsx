import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getInventoryAccessToken} from '~/lib/zoho-inventory-auth';

// LeafLink ↔ Zoho Inventory Reconciliation (v3)
// - Dedup LL orders by short_id (LL ?page= param is ignored, must follow `next`)
// - Pull LL customer name + state in one detail call per unique customer
// - Match LL → Zoho across ALL Zoho SOs (no warehouse filter), but tag each
//   matched LL row with the Zoho warehouse so Reid sees where it landed
// - Filter LL to NJ via LeafLink customer state

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

const FUZZY_DATE_WINDOW_DAYS = 5;
const FUZZY_TOTAL_TOLERANCE = 10;
const LEAFLINK_MAX_PAGES = 25;
const ZOHO_MAX_PAGES_PER_STATUS = 50;
const FETCH_TIMEOUT_MS = 15000;
const CUSTOMER_DETAIL_CONCURRENCY = 6;

type LLOrder = {
  number?: string;
  short_id?: string;
  status?: string;
  customer?: {id?: number; name?: string; company_name?: string} | null;
  buyer?: {id?: number; name?: string; company_name?: string} | null;
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

type WarehouseInfo = {state: string; isHeadOffice: boolean; name: string};

async function fetchT(url: string, init: RequestInit = {}, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, {...init, signal: ctrl.signal});
  } finally {
    clearTimeout(t);
  }
}

async function mapLimit<T, U>(items: T[], limit: number, fn: (item: T, idx: number) => Promise<U>): Promise<U[]> {
  const out: U[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (cursor < items.length) {
      const i = cursor++;
      try {
        out[i] = await fn(items[i], i);
      } catch {
        // swallow
      }
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
  return o.actual_ship_date || o.created_on || o.modified || null;
}

function topSkus(o: LLOrder, limit = 3): string[] {
  const items = o.line_items || [];
  return items
    .filter((li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product))
    .slice(0, limit)
    .map((li) => li.sku || li.product_name || `#${li.product}`);
}

function leaflinkOrderTotal(o: LLOrder): number {
  if (o.total != null) {
    const n = parseFloat(String(o.total));
    if (!isNaN(n)) return n;
  }
  let sum = 0;
  for (const li of o.line_items || []) {
    sum += parseTotal(li.sale_total);
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

// ── LeafLink fetch with proper cursor pagination + dedup ───────────────────
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

    let allOlderInPage = true;
    let allDupesInPage = true;
    for (const order of results) {
      const idKey = String(order.short_id || order.number || '');
      if (idKey && seenIds.has(idKey)) continue;
      allDupesInPage = false;
      if (idKey) seenIds.add(idKey);

      const dateIso = bestOrderDate(order);
      const ms = dateIso ? new Date(dateIso).getTime() : 0;
      if (ms >= sinceMs) {
        allOlderInPage = false;
        const items = order.line_items || [];
        const isHighsman = items.some(
          (li) => typeof li.product === 'number' && HIGHSMAN_PRODUCT_IDS.has(li.product),
        );
        if (isHighsman) out.push(order);
      }
    }
    // If every order in this page is older than the floor, we're done.
    if (allOlderInPage) break;
    // If LL ignored pagination and just returned dupes, stop.
    if (allDupesInPage) break;

    // Use the next URL if provided, else stop.
    url = typeof data.next === 'string' && data.next.length > 0 ? data.next : null;
  }

  return out;
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
  const cands = [
    d.state,
    d.shipping_address?.state,
    d.shipping_address?.state_code,
    d.billing_address?.state,
    d.billing_address?.state_code,
  ];
  for (const c of cands) {
    const s = normalizeStateField(c);
    if (s) return s;
  }
  return '';
}

function customerNameFromDetail(d: LLCustomerDetail | null): string {
  if (!d) return '';
  return (d.display_name || d.company_name || d.name || '').trim();
}

// ── Zoho Inventory ─────────────────────────────────────────────────────────
async function fetchZohoSalesOrders(
  orgId: string,
  token: string,
  startDate: Date,
  endDate: Date,
): Promise<ZohoSO[]> {
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
        `?organization_id=${orgId}` +
        `&date_start=${dateStart}` +
        `&date_end=${dateEnd}` +
        `&filter_by=${statusFilter}` +
        `&per_page=${perPage}` +
        `&page=${page}`;
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

async function fetchWarehouseInfoMap(orgId: string, token: string): Promise<Map<string, WarehouseInfo>> {
  const out = new Map<string, WarehouseInfo>();
  const endpoints = [
    `https://www.zohoapis.com/inventory/v1/warehouses?organization_id=${orgId}`,
    `https://www.zohoapis.com/inventory/v1/locations?organization_id=${orgId}`,
  ];
  for (const url of endpoints) {
    const res = await fetchT(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json'},
    });
    if (!res.ok) continue;
    const data: any = await res.json().catch(() => ({}));
    const items: any[] = data.warehouses || data.locations || [];
    for (const w of items) {
      const id = String(w.warehouse_id || w.location_id || w.id || '');
      const name: string = w.warehouse_name || w.location_name || w.name || '';
      if (!id) continue;
      const state =
        normalizeStateField(w.state || w.state_code) ||
        normalizeStateField(w.address?.state || w.address?.state_code) ||
        '';
      let resolvedState = state;
      if (!resolvedState && /\bNJ\b|NEW JERSEY/i.test(name)) resolvedState = 'NJ';
      const isHeadOffice = name.toUpperCase().replace(/[^A-Z]/g, '').startsWith('HEADOFFICE');
      out.set(id, {state: resolvedState, isHeadOffice, name});
    }
    if (out.size > 0) break;
  }
  return out;
}

// ── Match logic ────────────────────────────────────────────────────────────
type ZohoIndex = {
  refMap: Map<string, ZohoSO>;
  byCustomerNorm: Map<string, ZohoSO[]>;
};

// Build index over ALL Zoho SOs (no warehouse filter)
function buildZohoIndex(zohoOrders: ZohoSO[]): ZohoIndex {
  const refMap = new Map<string, ZohoSO>();
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

type MatchResult = {matched: true; how: 'ref' | 'fuzzy'; zoho: ZohoSO} | {matched: false};

function matchLeafLinkOrder(ll: LLOrder, customerName: string, idx: ZohoIndex): MatchResult {
  const candidates = [ll.number, ll.short_id]
    .filter((v): v is string => !!v)
    .map((v) => v.toLowerCase().trim());
  for (const c of candidates) {
    if (idx.refMap.has(c)) return {matched: true, how: 'ref', zoho: idx.refMap.get(c)!};
  }
  const norm = normalizeAccountName(customerName);
  const candidatesByName = idx.byCustomerNorm.get(norm) || [];
  if (candidatesByName.length === 0) return {matched: false};

  const llDateIso = bestOrderDate(ll);
  const llMs = llDateIso ? new Date(llDateIso).getTime() : 0;
  const llTotal = leaflinkOrderTotal(ll);
  const windowMs = FUZZY_DATE_WINDOW_DAYS * 86400 * 1000;

  for (const so of candidatesByName) {
    if (!so.date) continue;
    const soMs = new Date(so.date).getTime();
    if (Math.abs(soMs - llMs) > windowMs) continue;
    const soTotal = parseTotal(so.total);
    if (Math.abs(soTotal - llTotal) > FUZZY_TOTAL_TOLERANCE) continue;
    return {matched: true, how: 'fuzzy', zoho: so};
  }
  return {matched: false};
}

// ── Loader ─────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const url = new URL(request.url);

  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('sales_auth=1') || cookie.includes('reconcile_auth=1');
  if (!isAuth) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const sinceParam = url.searchParams.get('since') || '2025-06-01';
  const stateFilter = (url.searchParams.get('state') || 'NJ').toUpperCase();
  const debug = url.searchParams.get('debug') === '1';
  const since = new Date(sinceParam + 'T00:00:00-04:00');
  const until = new Date();

  const apiKey = env.LEAFLINK_API_KEY;
  if (!apiKey) return json({ok: false, error: 'LEAFLINK_API_KEY not configured'}, {status: 500});

  const errors: string[] = [];
  const t0 = Date.now();

  // 1) LL: fetch + dedup
  let allLL: LLOrder[] = [];
  for (const sellerId of HIGHSMAN_SELLER_IDS) {
    try {
      const orders = await fetchHighsmanOrders(sellerId, apiKey, sinceParam);
      allLL = allLL.concat(orders);
    } catch (err: any) {
      errors.push(`leaflink_seller_${sellerId}_failed:${err?.message}`);
    }
  }
  const llDuration = Date.now() - t0;

  // 2) Zoho Inventory
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  let invToken: string;
  try {
    invToken = await getInventoryAccessToken(env);
  } catch (err: any) {
    return json({ok: false, error: `Zoho Inventory token: ${err?.message}`}, {status: 500});
  }
  const t1 = Date.now();
  const [warehouseInfoMap, zohoOrders] = await Promise.all([
    fetchWarehouseInfoMap(orgId, invToken).catch((err) => {
      errors.push(`warehouse_map_failed:${err?.message}`);
      return new Map<string, WarehouseInfo>();
    }),
    fetchZohoSalesOrders(orgId, invToken, since, until).catch((err) => {
      errors.push(`zoho_orders_failed:${err?.message}`);
      return [] as ZohoSO[];
    }),
  ]);
  const zohoDuration = Date.now() - t1;
  const idx = buildZohoIndex(zohoOrders);

  // 3) LL customer detail (name + state) for unique customer IDs
  const t2 = Date.now();
  const uniqueCustomerIds = Array.from(
    new Set(
      allLL
        .map((o) => (o.customer || o.buyer)?.id)
        .filter((v): v is number => typeof v === 'number'),
    ),
  );
  const customerInfo = new Map<number, {name: string; state: string}>();
  await mapLimit(uniqueCustomerIds, CUSTOMER_DETAIL_CONCURRENCY, async (id) => {
    const detail = await fetchLLCustomerDetail(id, apiKey);
    customerInfo.set(id, {
      name: customerNameFromDetail(detail),
      state: customerStateFromDetail(detail),
    });
  });
  const customerDuration = Date.now() - t2;

  // 4) Classify + match
  type Row = {
    leaflinkOrderNumber: string;
    leaflinkOrderId: string;
    customerId: number | null;
    customerName: string;
    state: string;
    orderDate: string | null;
    actualShipDate: string | null;
    status: string;
    total: number;
    skus: string[];
    matchedZohoId?: string;
    matchedZohoNumber?: string;
    matchedZohoDate?: string;
    matchedZohoWarehouse?: string;
    matchHow?: 'ref' | 'fuzzy';
  };

  const missing: Row[] = [];
  const matched: Row[] = [];
  const otherState: Row[] = [];
  const unknownState: Row[] = [];

  for (const o of allLL) {
    const cust = o.customer || o.buyer;
    const customerId = cust?.id ?? null;
    const info = customerId != null ? customerInfo.get(customerId) : undefined;
    const customerName =
      info?.name ||
      cust?.name ||
      cust?.company_name ||
      (customerId != null ? `Customer #${customerId}` : '');
    const state = info?.state || '';

    const row: Row = {
      leaflinkOrderNumber: o.number || o.short_id || '',
      leaflinkOrderId: o.short_id || o.number || '',
      customerId,
      customerName,
      state,
      orderDate: bestOrderDate(o),
      actualShipDate: o.actual_ship_date || null,
      status: o.status || '',
      total: leaflinkOrderTotal(o),
      skus: topSkus(o),
    };

    if (!state) {
      unknownState.push(row);
      continue;
    }
    if (state !== stateFilter) {
      otherState.push(row);
      continue;
    }

    const m = matchLeafLinkOrder(o, customerName, idx);
    if (m.matched) {
      row.matchedZohoId = m.zoho.salesorder_id;
      row.matchedZohoNumber = m.zoho.salesorder_number;
      row.matchedZohoDate = m.zoho.date;
      const whId = String(m.zoho.warehouse_id || m.zoho.location_id || '');
      row.matchedZohoWarehouse = warehouseInfoMap.get(whId)?.name || '';
      row.matchHow = m.how;
      matched.push(row);
    } else {
      missing.push(row);
    }
  }

  missing.sort((a, b) => {
    const ta = new Date(a.orderDate || 0).getTime();
    const tb = new Date(b.orderDate || 0).getTime();
    return ta - tb;
  });

  // Debug payload — surface the warehouse map so we can see why filtering failed
  const debugPayload = debug
    ? {
        warehouseInfoMap: Array.from(warehouseInfoMap.entries()).map(([id, info]) => ({id, ...info})),
        sampleLeaflinkOrder: allLL[0] || null,
        sampleZohoOrder: zohoOrders[0] || null,
        zohoStateBreakdown: (() => {
          const b: Record<string, number> = {};
          for (const so of zohoOrders) {
            const wh = warehouseInfoMap.get(String(so.warehouse_id || so.location_id || ''));
            const s = wh?.state || '(no warehouse mapping)';
            b[s] = (b[s] || 0) + 1;
          }
          return b;
        })(),
      }
    : undefined;

  return json({
    ok: true,
    summary: {
      sinceISO: sinceParam,
      stateFilter,
      leaflinkOrdersScanned: allLL.length,
      leaflinkOrdersInState: matched.length + missing.length,
      leaflinkOrdersOtherState: otherState.length,
      leaflinkOrdersUnknownState: unknownState.length,
      uniqueLeaflinkCustomers: uniqueCustomerIds.length,
      zohoOrdersScanned: zohoOrders.length,
      matchedCount: matched.length,
      missingCount: missing.length,
      missingTotalRevenue: missing.reduce((s, r) => s + r.total, 0),
    },
    missing,
    matched: matched.slice(0, 20), // small sample so Reid can verify match quality
    unknownState: unknownState.slice(0, 50),
    otherStateSample: otherState.slice(0, 30),
    debug: debugPayload,
    meta: {
      sellerIds: HIGHSMAN_SELLER_IDS,
      orgId,
      warehouseCount: warehouseInfoMap.size,
      llDurationMs: llDuration,
      zohoDurationMs: zohoDuration,
      customerDetailDurationMs: customerDuration,
      totalDurationMs: Date.now() - t0,
      fetchedAt: new Date().toISOString(),
      errors,
    },
  });
}
