import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useSearchParams, useNavigate} from '@remix-run/react';
import {json} from '@shopify/remix-oxygen';
import {useState, useEffect, useMemo} from 'react';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Sales by Market'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ── Constants ──────────────────────────────────────────────────────────────
const FOCUS_STATES = ['NJ', 'MA', 'NY', 'RI', 'MO'];
const STATE_LABELS: Record<string, string> = {
  NJ: 'New Jersey',
  MA: 'Massachusetts',
  NY: 'New York',
  RI: 'Rhode Island',
  MO: 'Missouri',
};

const STALE_DAYS = 60; // red — 60+ days no order
const WATCH_DAYS = 45; // yellow — 45–59 days (healthy = 0–44)

const SKU_CATEGORIES: Record<string, 'Hit Stick' | 'Pre-Rolls' | 'Ground Game' | 'Other'> = {
  // Hit Stick (0.5g disposables)
  HST: 'Hit Stick',
  HITSTICK: 'Hit Stick',
  // Pre-Rolls (1.2g)
  PR: 'Pre-Rolls',
  PREROLL: 'Pre-Rolls',
  // Ground Game (7g flower)
  GG: 'Ground Game',
  GROUNDGAME: 'Ground Game',
};

function categorizeSku(name: string, sku: string): 'Hit Stick' | 'Pre-Rolls' | 'Ground Game' | 'Other' {
  const haystack = `${name || ''} ${sku || ''}`.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (haystack.includes('HITSTICK') || haystack.startsWith('HST')) return 'Hit Stick';
  if (haystack.includes('PREROLL') || haystack.includes('PRE-ROLL') || haystack.includes('PR-') || haystack.startsWith('PR')) return 'Pre-Rolls';
  if (haystack.includes('GROUNDGAME') || haystack.includes('GG-') || haystack.startsWith('GG')) return 'Ground Game';
  return 'Other';
}

// ── Helpers ────────────────────────────────────────────────────────────────
function daysBetween(d1: Date, d2: Date): number {
  return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parseRange(range: string): {start: Date; end: Date; label: string} {
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  let start = new Date(end);
  let label = 'Month to Date';
  switch (range) {
    case 'week':
      start = new Date(end);
      start.setDate(end.getDate() - 6);
      label = 'This Week';
      break;
    case 'last30':
      start = new Date(end);
      start.setDate(end.getDate() - 29);
      label = 'Last 30 Days';
      break;
    case 'ytd':
      start = new Date(end.getFullYear(), 0, 1);
      label = 'Year to Date';
      break;
    case 'mtd':
    default:
      start = new Date(end.getFullYear(), end.getMonth(), 1);
      label = 'Month to Date';
      break;
  }
  start.setHours(0, 0, 0, 0);
  return {start, end, label};
}

function priorPeriod(start: Date, end: Date): {start: Date; end: Date} {
  const msDay = 1000 * 60 * 60 * 24;
  const span = Math.round((end.getTime() - start.getTime()) / msDay) + 1;
  const pEnd = new Date(start.getTime() - msDay);
  const pStart = new Date(pEnd.getTime() - (span - 1) * msDay);
  pStart.setHours(0, 0, 0, 0);
  pEnd.setHours(23, 59, 59, 999);
  return {start: pStart, end: pEnd};
}

function money(n: number): string {
  return n.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
}

// ── Zoho Inventory API ─────────────────────────────────────────────────────
// Module-scoped access-token cache. Zoho access tokens live ~60 min; we cache
// for 55 min to stay well under expiry. Without this cache, the /oauth/v2/token
// endpoint rate-limits with 400 "too many requests continuously" — each page
// load or period switch would otherwise force a fresh refresh round-trip.
let cachedAccessToken: {token: string; expiresAt: number} | null = null;
const TOKEN_TTL_MS = 55 * 60 * 1000;

async function getZohoAccessToken(env: any): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && cachedAccessToken.expiresAt > now + 30_000) {
    return cachedAccessToken.token;
  }

  // Prefer Inventory-scoped credentials; fall back to general Zoho creds
  const clientId = env.ZOHO_INVENTORY_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_INVENTORY_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_INVENTORY_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;
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
    throw new Error(`Zoho token refresh failed: ${res.status} — ${txt.slice(0, 200)}`);
  }
  const data: any = await res.json();
  if (!data.access_token) throw new Error('Zoho token refresh returned no access_token');
  cachedAccessToken = {token: data.access_token, expiresAt: now + TOKEN_TTL_MS};
  return data.access_token;
}

// ── Warehouse/location → state mapping ─────────────────────────────────────
// In Zoho Inventory, each warehouse/location represents a state market.
// A sales order carries `location_name` (or `warehouse_name` on older org setups)
// and we resolve it to a 2-letter state code.
//
// The resolver checks (in order):
//   1. Exact 2-letter state code anywhere in the location name
//   2. Full state name substring ("New Jersey", "Massachusetts", etc.)
//   3. Known city/market keywords mapped to their state
// If nothing matches, returns '' (order excluded from state cards).
const STATE_FULL_NAMES: Record<string, string> = {
  'NEW JERSEY': 'NJ',
  'MASSACHUSETTS': 'MA',
  'NEW YORK': 'NY',
  'RHODE ISLAND': 'RI',
  'MISSOURI': 'MO',
};
const CITY_STATE_HINTS: Record<string, string> = {
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

function resolveStateFromLocation(locationName: string): string {
  if (!locationName) return '';
  const upper = locationName.toUpperCase();
  // 1. Look for explicit 2-letter state code (surrounded by non-alpha or at boundaries)
  const codeMatch = upper.match(/\b(NJ|MA|NY|RI|MO)\b/);
  if (codeMatch) return codeMatch[1];
  // 2. Full state name
  for (const [fullName, code] of Object.entries(STATE_FULL_NAMES)) {
    if (upper.includes(fullName)) return code;
  }
  // 3. City hints — strip spaces for keywords like "KANSAS CITY"
  const squished = upper.replace(/[^A-Z]/g, '');
  for (const [city, code] of Object.entries(CITY_STATE_HINTS)) {
    if (squished.includes(city)) return code;
  }
  return '';
}


// Warehouse / location info: state code + isHeadOffice flag.
// State is read directly off each warehouse's address record (`state` /
// `state_code`, flat or nested under `address`). That's the authoritative
// source. Parsing the warehouse name is a last-resort fallback for the case
// where someone left the address blank in Zoho.
//
// isHeadOffice flags the corporate "Head Office" warehouse — orders attached
// to that warehouse are internal transfers, not customer revenue, and must be
// excluded from the dashboard entirely.
type WarehouseInfo = {state: string; isHeadOffice: boolean; name: string};

function isHeadOfficeName(name: string): boolean {
  if (!name) return false;
  const compact = name.toUpperCase().replace(/[^A-Z]/g, '');
  return compact === 'HEADOFFICE' || compact.startsWith('HEADOFFICE');
}

function normalizeStateField(raw: any): string {
  if (raw == null) return '';
  const trimmed = String(raw).trim().toUpperCase();
  if (!trimmed) return '';
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed; // already 2-letter
  return STATE_FULL_NAMES[trimmed] || ''; // full state name
}

// Build a warehouseId/locationId → {state, isHeadOffice} map. Zoho Inventory's
// /salesorders LIST endpoint omits `location_name`/`warehouse_name` (only IDs),
// so resolving state per-order requires this lookup. We hit /warehouses first
// (older API) and fall back to /locations (newer multi-location API).
async function fetchWarehouseInfoMap(env: any, accessToken: string): Promise<Map<string, WarehouseInfo>> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  const out = new Map<string, WarehouseInfo>();
  const endpoints = [
    `https://www.zohoapis.com/inventory/v1/warehouses?organization_id=${orgId}`,
    `https://www.zohoapis.com/inventory/v1/locations?organization_id=${orgId}`,
  ];
  for (const url of endpoints) {
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json'},
    });
    if (!res.ok) continue;
    const data: any = await res.json().catch(() => ({}));
    const items: any[] = data.warehouses || data.locations || [];
    for (const w of items) {
      const id = String(w.warehouse_id || w.location_id || w.id || '');
      const name: string = w.warehouse_name || w.location_name || w.name || '';
      if (!id) continue;
      // Read state directly off the warehouse's address record.
      const flat = normalizeStateField(w.state || w.state_code);
      const nested = normalizeStateField(w.address?.state || w.address?.state_code);
      let state = flat || nested;
      // Last-resort: parse the warehouse name.
      if (!state) state = resolveStateFromLocation(name);
      out.set(id, {state, isHeadOffice: isHeadOfficeName(name), name});
    }
    if (out.size > 0) break;
  }
  return out;
}

// Build a customer-name → Account_State map from Zoho CRM. Used as the final
// fallback when an order's warehouse has no state and inline location fields
// are missing. Per Highsman convention (memory:reference_zoho_account_state_field),
// the canonical state on a CRM Account is `Account_State` — billing/shipping
// state fields are often blank or wrong and must NOT be used.
//
// Soft-fails (returns empty map) if CRM creds aren't configured or the API
// errors. The dashboard will still render with whatever Inventory could resolve.
async function fetchCrmAccountStateMap(env: any): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return out;

  const tokenRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });
  if (!tokenRes.ok) return out;
  const tokenData: any = await tokenRes.json().catch(() => ({}));
  const accessToken = tokenData.access_token;
  if (!accessToken) return out;

  // COQL — Account_Name + Account_State, paginated 200/page.
  let offset = 0;
  const pageSize = 200;
  while (true) {
    const select_query =
      `select Account_Name, Account_State from Accounts where Account_State is not null limit ${offset}, ${pageSize}`;
    const r = await fetch('https://www.zohoapis.com/crm/v7/coql', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({select_query}),
    });
    if (!r.ok) break;
    const d: any = await r.json().catch(() => ({}));
    const rows: any[] = d.data || [];
    for (const row of rows) {
      const name = String(row.Account_Name || '').trim().toUpperCase();
      const state = normalizeStateField(row.Account_State);
      if (name && state) out.set(name, state);
    }
    if (!d.info?.more_records) break;
    offset += pageSize;
    if (offset > 5000) break; // safety
  }
  return out;
}

// Highsman Zoho Inventory Org ID — env var overrides if set
const DEFAULT_ZOHO_INVENTORY_ORG_ID = '882534504';

async function fetchSalesOrders(env: any, accessToken: string, startDate: Date, endDate: Date): Promise<any[]> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  if (!orgId) throw new Error('ZOHO_INVENTORY_ORG_ID not configured');

  const dateStart = ymd(startDate);
  const dateEnd = ymd(endDate);
  const perPage = 200;

  // We fetch only real, booked sales orders — excluding Draft / Void / Onhold.
  // Zoho Inventory's filter_by parameter takes a single status, so we do two
  // passes: Status.Confirmed (approved, not yet fully shipped) +
  // Status.Closed (approved AND fully invoiced & shipped). Both represent
  // confirmed revenue; together they're the right dataset for a sales
  // dashboard. Draft / Void / Onhold are intentionally excluded.
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
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`Zoho Inventory list error: ${res.status} — ${txt.slice(0, 200)}`);
      }
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
      if (page > 50) break; // safety cap (10k orders per status)
    }
  }

  return orders;
}

async function fetchSalesOrderDetail(env: any, accessToken: string, orderId: string): Promise<any | null> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  const url = `https://www.zohoapis.com/inventory/v1/salesorders/${orderId}?organization_id=${orgId}`;
  const res = await fetch(url, {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`, Accept: 'application/json'},
  });
  if (!res.ok) return null;
  const data: any = await res.json();
  return data.salesorder || null;
}

// ── Types ──────────────────────────────────────────────────────────────────
type StoreRow = {
  customerId: string;
  storeName: string;
  state: string;
  lastOrderDate: string;
  daysSinceLastOrder: number;
  orderCount: number;
  periodRevenue: number;
  ytdRevenue: number;
  topSku: string;
  status: 'healthy' | 'watch' | 'stale';
};

type StateMetric = {
  state: string;
  revenue: number;
  orders: number;
  stores: number;
  avgPerStore: number;
  mixHitStick: number;
  mixPreRolls: number;
  mixGroundGame: number;
  mixOther: number;
};

// ── Action (password gate) ─────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get('password') as string;
  const correct = (context.env as any).SALES_DASHBOARD_PASSWORD || 'highsman2026';
  if (password === correct) {
    return json(
      {authenticated: true, error: null},
      {
        headers: {
          'Set-Cookie': `sales_auth=1; Path=/sales; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      },
    );
  }
  return json({authenticated: false, error: 'Incorrect password'});
}

// ── Loader ─────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('sales_auth=1');
  if (!isAuth) {
    return json({authenticated: false, error: null, stores: [], metrics: null, range: null, stateBreakdown: []});
  }

  const url = new URL(request.url);
  const rangeKey = url.searchParams.get('range') || 'mtd';
  const {start, end, label} = parseRange(rangeKey);
  const ytdStart = new Date(end.getFullYear(), 0, 1);
  const prior = priorPeriod(start, end);

  const env = context.env as any;
  const missing: string[] = [];
  const hasClientId = env.ZOHO_INVENTORY_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const hasClientSecret = env.ZOHO_INVENTORY_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const hasRefreshToken = env.ZOHO_INVENTORY_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;
  if (!hasClientId) missing.push('ZOHO_INVENTORY_CLIENT_ID (or ZOHO_CLIENT_ID)');
  if (!hasClientSecret) missing.push('ZOHO_INVENTORY_CLIENT_SECRET (or ZOHO_CLIENT_SECRET)');
  if (!hasRefreshToken) missing.push('ZOHO_INVENTORY_REFRESH_TOKEN (or ZOHO_REFRESH_TOKEN)');
  // ZOHO_INVENTORY_ORG_ID has a hardcoded fallback (882534504), env var override only
  if (missing.length) {
    return json({
      authenticated: true,
      error: `Missing env vars: ${missing.join(', ')}. Add these to Oxygen environment variables.`,
      stores: [],
      metrics: null,
      range: {key: rangeKey, label, start: ymd(start), end: ymd(end)},
      stateBreakdown: [],
    });
  }

  try {
    const token = await getZohoAccessToken(env);
    // Pull YTD orders + warehouse info + CRM Account_State map in parallel.
    // - warehouseInfoMap: warehouse_id → {state, isHeadOffice}. Primary state source.
    // - crmAccountStateMap: customer_name → Account_State. Last-resort fallback.
    //   Per Highsman convention, Account_State is canonical; billing/shipping is not used.
    const [ytdOrders, warehouseInfoMap, crmAccountStateMap] = await Promise.all([
      fetchSalesOrders(env, token, ytdStart, end),
      fetchWarehouseInfoMap(env, token),
      fetchCrmAccountStateMap(env),
    ]);

    // Index helpers
    const inRange = (d: Date, s: Date, e: Date) => d >= s && d <= e;

    // Aggregate per-store (over YTD), and per-state (over selected period)
    const storeMap = new Map<string, StoreRow>();
    const stateAgg = new Map<string, StateMetric>();
    const priorStateRev = new Map<string, number>();
    let totalRevenue = 0;
    let priorRevenue = 0;
    let totalOrders = 0;

    for (const so of ytdOrders) {
      const orderDate = new Date(so.date);
      // State resolution — in priority order, never falling back to billing/shipping:
      //   1. Skip Head Office warehouse entirely (internal transfers, not customer revenue)
      //   2. warehouse_id → warehouseInfoMap.state (read off the warehouse's address)
      //   3. inline so.location_name / so.warehouse_name (occasionally populated)
      //   4. CRM Account_State, looked up by customer_name (Highsman canonical field)
      // We intentionally do NOT fall back to so.shipping_address / so.billing_address —
      // those fields are unreliable on Highsman's Zoho data.
      const whId = String(so.warehouse_id || so.location_id || '');
      const whInfo = whId ? warehouseInfoMap.get(whId) : undefined;
      if (whInfo?.isHeadOffice) continue; // skip Head Office orders entirely

      let state = whInfo?.state || '';
      if (!state) {
        const rawLocation: string = so.location_name || so.warehouse_name || '';
        state = resolveStateFromLocation(rawLocation);
      }
      if (!state) {
        // Last resort: CRM Account_State by customer name (case-insensitive).
        const lookup = String(so.customer_name || '').trim().toUpperCase();
        if (lookup) state = crmAccountStateMap.get(lookup) || '';
      }
      const total = Number(so.total || 0);
      const customerId = String(so.customer_id || so.contact_id || so.customer_name);
      const storeName = so.customer_name || 'Unknown';

      // Existing store row or init
      let row = storeMap.get(customerId);
      if (!row) {
        row = {
          customerId,
          storeName,
          state,
          lastOrderDate: so.date,
          daysSinceLastOrder: daysBetween(orderDate, end),
          orderCount: 0,
          periodRevenue: 0,
          ytdRevenue: 0,
          topSku: '',
          status: 'healthy',
        };
        storeMap.set(customerId, row);
      }
      row.ytdRevenue += total;
      if (new Date(row.lastOrderDate) < orderDate) {
        row.lastOrderDate = so.date;
        row.daysSinceLastOrder = daysBetween(orderDate, end);
        if (state) row.state = state;
      }

      // In selected period aggregations
      if (inRange(orderDate, start, end)) {
        row.periodRevenue += total;
        row.orderCount += 1;
        totalRevenue += total;
        totalOrders += 1;

        if (!stateAgg.has(state)) {
          stateAgg.set(state, {
            state,
            revenue: 0,
            orders: 0,
            stores: 0,
            avgPerStore: 0,
            mixHitStick: 0,
            mixPreRolls: 0,
            mixGroundGame: 0,
            mixOther: 0,
          });
        }
        const sa = stateAgg.get(state)!;
        sa.revenue += total;
        sa.orders += 1;

        // SKU mix from line_items (if present on list response; else skip silently)
        const lineItems = so.line_items || [];
        for (const li of lineItems) {
          const cat = categorizeSku(li.name || '', li.sku || '');
          const amt = Number(li.item_total || li.total || 0);
          if (cat === 'Hit Stick') sa.mixHitStick += amt;
          else if (cat === 'Pre-Rolls') sa.mixPreRolls += amt;
          else if (cat === 'Ground Game') sa.mixGroundGame += amt;
          else sa.mixOther += amt;
        }
      }

      // Prior-period revenue
      if (inRange(orderDate, prior.start, prior.end)) {
        priorRevenue += total;
        priorStateRev.set(state, (priorStateRev.get(state) || 0) + total);
      }
    }

    // Count distinct stores per state (in period)
    const storesPerState = new Map<string, Set<string>>();
    for (const r of storeMap.values()) {
      if (r.periodRevenue > 0) {
        if (!storesPerState.has(r.state)) storesPerState.set(r.state, new Set());
        storesPerState.get(r.state)!.add(r.customerId);
      }
    }
    for (const sa of stateAgg.values()) {
      sa.stores = storesPerState.get(sa.state)?.size || 0;
      sa.avgPerStore = sa.stores > 0 ? sa.revenue / sa.stores : 0;
    }

    // Finalize store rows (status + topSku placeholder)
    const stores: StoreRow[] = [];
    for (const r of storeMap.values()) {
      r.status = r.daysSinceLastOrder >= STALE_DAYS ? 'stale' : r.daysSinceLastOrder >= WATCH_DAYS ? 'watch' : 'healthy';
      stores.push(r);
    }
    // Sort by period revenue desc (top performers first)
    stores.sort((a, b) => b.periodRevenue - a.periodRevenue);

    // State breakdown (only focus states + any others with revenue)
    const knownStates = new Set(FOCUS_STATES);
    for (const s of stateAgg.keys()) knownStates.add(s);
    const stateBreakdown: (StateMetric & {priorRevenue: number; delta: number})[] = Array.from(knownStates)
      .filter((s) => !!s)
      .map((s) => {
        const sa = stateAgg.get(s) || {
          state: s,
          revenue: 0,
          orders: 0,
          stores: 0,
          avgPerStore: 0,
          mixHitStick: 0,
          mixPreRolls: 0,
          mixGroundGame: 0,
          mixOther: 0,
        };
        const p = priorStateRev.get(s) || 0;
        const delta = p > 0 ? ((sa.revenue - p) / p) * 100 : sa.revenue > 0 ? 100 : 0;
        return {...sa, priorRevenue: p, delta};
      })
      .sort((a, b) => b.revenue - a.revenue);

    const uniqueStores = Array.from(new Set(stores.filter((s) => s.periodRevenue > 0).map((s) => s.customerId))).length;
    const aov = totalOrders > 0 ? totalRevenue / totalOrders : 0;
    const periodDelta = priorRevenue > 0 ? ((totalRevenue - priorRevenue) / priorRevenue) * 100 : totalRevenue > 0 ? 100 : 0;

    return json({
      authenticated: true,
      error: null,
      stores,
      stateBreakdown,
      metrics: {
        totalRevenue,
        totalOrders,
        uniqueStores,
        aov,
        periodDelta,
        priorRevenue,
      },
      range: {key: rangeKey, label, start: ymd(start), end: ymd(end)},
    });
  } catch (err: any) {
    const msg = String(err?.message || '');
    // Detect Zoho's transient rate-limit block and surface a friendlier message
    const rateLimited =
      msg.includes('too many requests continuously') ||
      msg.includes('Access Denied') ||
      /token refresh failed:\s*400/.test(msg);
    const friendly = rateLimited
      ? 'Zoho is temporarily rate-limiting our API key (this clears itself in 15–30 minutes). The dashboard will come back automatically — refresh the page later. This won\'t recur because access tokens are now cached for 55 minutes per worker.'
      : `Failed to fetch Zoho Inventory data: ${msg}`;
    return json({
      authenticated: true,
      error: friendly,
      errorKind: rateLimited ? 'rate_limit' : 'other',
      stores: [],
      metrics: null,
      range: {key: rangeKey, label, start: ymd(start), end: ymd(end)},
      stateBreakdown: [],
    });
  }
}

// ── Component ──────────────────────────────────────────────────────────────
export default function SalesDashboard() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.authenticated) window.location.reload();
  }, [actionData]);

  const isAuth = loaderData.authenticated;

  // Load Teko font
  useEffect(() => {
    if (document.getElementById('teko-font-link')) return;
    const link = document.createElement('link');
    link.id = 'teko-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  if (!isAuth) return <LoginScreen error={actionData?.error} />;

  const err = (loaderData as any).error;
  const errorKind = (loaderData as any).errorKind;
  if (err) {
    const isRateLimit = errorKind === 'rate_limit';
    return (
      <Shell>
        <div
          className={
            isRateLimit
              ? 'bg-[#c8a84b]/10 border border-[#c8a84b]/40 rounded-lg p-6'
              : 'bg-red-500/10 border border-red-500/30 rounded-lg p-6'
          }
        >
          <p
            className={
              isRateLimit
                ? 'text-[#c8a84b] text-xl font-bold mb-2 tracking-wider'
                : 'text-red-400 text-xl font-bold mb-2 tracking-wider'
            }
            style={{fontFamily: 'Teko, sans-serif'}}
          >
            {isRateLimit ? 'ZOHO COOLING DOWN' : 'CONFIGURATION ERROR'}
          </p>
          <p className="text-[#A9ACAF] text-sm whitespace-pre-wrap leading-relaxed">{err}</p>
          {isRateLimit ? (
            <button
              onClick={() => window.location.reload()}
              className="mt-4 px-4 py-2 bg-[#c8a84b] text-black font-bold text-sm rounded hover:bg-[#b09338] transition-colors"
            >
              TRY AGAIN
            </button>
          ) : null}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <DashboardContent data={loaderData as any} />
    </Shell>
  );
}

// ── Login Screen ───────────────────────────────────────────────────────────
function LoginScreen({error}: {error?: string | null}) {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
            alt="Highsman"
            className="mx-auto mb-6"
            style={{width: 140}}
          />
          <h1
            className="text-white text-2xl uppercase tracking-wider mb-1"
            style={{fontFamily: 'Teko, sans-serif', fontWeight: 700}}
          >
            SALES BY MARKET
          </h1>
          <p className="text-[#A9ACAF] text-sm uppercase tracking-widest">Spark Team — Staff Only</p>
        </div>
        <Form method="post" className="space-y-4">
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider cursor-pointer"
            style={{
              fontFamily: 'Teko, sans-serif',
              background: '#c8a84b',
              color: '#000',
              fontSize: '1.1rem',
              border: 'none',
            }}
          >
            ENTER
          </button>
        </Form>
      </div>
    </div>
  );
}

// ── Shell ──────────────────────────────────────────────────────────────────
function Shell({children}: {children: React.ReactNode}) {
  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <img
              src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
              alt="Highsman"
              style={{width: 120}}
            />
            <div>
              <h1
                className="text-xl sm:text-2xl uppercase tracking-wider"
                style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, color: '#c8a84b'}}
              >
                SALES BY MARKET
              </h1>
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">Spark Team Dashboard</p>
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Status chip color ──────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, {bg: string; text: string; label: string}> = {
  healthy: {bg: 'rgba(34,197,94,0.15)', text: '#22C55E', label: 'HEALTHY'},
  watch: {bg: 'rgba(234,179,8,0.15)', text: '#EAB308', label: 'WATCH'},
  stale: {bg: 'rgba(239,68,68,0.15)', text: '#EF4444', label: 'STALE'},
};

// ── Dashboard Content ──────────────────────────────────────────────────────
function DashboardContent({data}: {data: any}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentRange = searchParams.get('range') || 'mtd';
  const [filterState, setFilterState] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'healthy' | 'watch' | 'stale'>('All');

  const metrics = data.metrics;
  const stores: StoreRow[] = data.stores || [];
  const stateBreakdown = data.stateBreakdown || [];

  const filtered = useMemo(
    () =>
      stores.filter((s) => {
        if (filterState !== 'All' && s.state !== filterState) return false;
        if (statusFilter !== 'All' && s.status !== statusFilter) return false;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          if (!s.storeName.toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    [stores, filterState, statusFilter, searchQuery],
  );

  const staleStores = stores.filter((s) => s.status === 'stale' && s.ytdRevenue > 0);
  const watchStores = stores.filter((s) => s.status === 'watch' && s.ytdRevenue > 0);

  const setRange = (key: string) => {
    const next = new URLSearchParams(searchParams);
    next.set('range', key);
    setSearchParams(next);
  };

  const deltaColor = metrics?.periodDelta >= 0 ? '#22C55E' : '#EF4444';
  const deltaArrow = metrics?.periodDelta >= 0 ? '▲' : '▼';

  return (
    <>
      {/* Time range selector */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <span className="text-[10px] uppercase tracking-widest text-[#666] font-bold mr-2">RANGE:</span>
        {[
          {k: 'week', l: 'This Week'},
          {k: 'mtd', l: 'MTD'},
          {k: 'last30', l: 'Last 30'},
          {k: 'ytd', l: 'YTD'},
        ].map((r) => (
          <button
            key={r.k}
            onClick={() => setRange(r.k)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            style={{
              fontFamily: 'Teko, sans-serif',
              fontSize: '0.9rem',
              background: currentRange === r.k ? '#c8a84b' : '#111',
              color: currentRange === r.k ? '#000' : '#A9ACAF',
              border: currentRange === r.k ? '1px solid #c8a84b' : '1px solid rgba(169,172,175,0.2)',
            }}
          >
            {r.l}
          </button>
        ))}
        <span className="text-[#666] text-xs ml-2">
          {data.range?.start} → {data.range?.end}
        </span>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        <KpiCard label="Revenue" value={money(metrics?.totalRevenue || 0)} sub={`vs ${money(metrics?.priorRevenue || 0)} prior`} accent="#c8a84b" />
        <KpiCard
          label="Period Δ"
          value={`${deltaArrow} ${Math.abs(metrics?.periodDelta || 0).toFixed(1)}%`}
          sub={data.range?.label}
          accent={deltaColor}
        />
        <KpiCard label="Orders" value={String(metrics?.totalOrders || 0)} sub="in period" accent="#FFFFFF" />
        <KpiCard label="Active Stores" value={String(metrics?.uniqueStores || 0)} sub="placed order" accent="#FFFFFF" />
        <KpiCard label="AOV" value={money(metrics?.aov || 0)} sub="avg order" accent="#FFFFFF" />
      </div>

      {/* State breakdown cards */}
      <div className="mb-8">
        <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-3">STATE BREAKDOWN</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
          {stateBreakdown.map((s: any) => (
            <StateCard
              key={s.state}
              data={s}
              active={filterState === s.state}
              onClick={() => setFilterState(filterState === s.state ? 'All' : s.state)}
            />
          ))}
        </div>
      </div>

      {/* Alerts */}
      {staleStores.length > 0 && (
        <AlertPanel
          tone="stale"
          title={`${staleStores.length} STALE STORES (${STALE_DAYS}+ DAYS NO ORDER)`}
          subtitle="Prioritize these for rep outreach this week."
          stores={staleStores}
          onStoreClick={(storeId) => {
            const store = stores.find((s) => s.customerId === storeId);
            if (store) {
              setFilterState(store.state);
              setStatusFilter('stale');
            }
          }}
        />
      )}

      {watchStores.length > 0 && (
        <AlertPanel
          tone="watch"
          title={`${watchStores.length} WATCH STORES (${WATCH_DAYS}-${STALE_DAYS - 1} DAYS)`}
          subtitle="Nudge now to prevent slip."
          stores={watchStores.slice(0, 20)}
          onStoreClick={(storeId) => {
            const store = stores.find((s) => s.customerId === storeId);
            if (store) {
              setFilterState(store.state);
              setStatusFilter('watch');
            }
          }}
        />
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-4 mt-8">
        <input
          type="text"
          placeholder="Search store..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 w-full sm:w-auto px-4 py-2 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
        />
        <select
          value={filterState}
          onChange={(e) => setFilterState(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm bg-[#111] text-[#A9ACAF] border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] cursor-pointer"
        >
          <option value="All">All States</option>
          {stateBreakdown.map((s: any) => (
            <option key={s.state} value={s.state}>
              {STATE_LABELS[s.state] || s.state}
            </option>
          ))}
        </select>
        <div className="flex gap-2">
          {(['All', 'healthy', 'watch', 'stale'] as const).map((st) => {
            const active = statusFilter === st;
            const sty = st === 'All' ? {bg: '#c8a84b', text: '#000'} : STATUS_STYLES[st];
            return (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer"
                style={{
                  fontFamily: 'Teko, sans-serif',
                  fontSize: '0.85rem',
                  background: active ? (st === 'All' ? '#c8a84b' : sty.text) : '#111',
                  color: active ? '#000' : st === 'All' ? '#A9ACAF' : (sty as any).text,
                  border: active ? `1px solid ${st === 'All' ? '#c8a84b' : (sty as any).text}` : '1px solid rgba(169,172,175,0.2)',
                }}
              >
                {st === 'All' ? 'All' : STATUS_STYLES[st].label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="text-[#666] text-xs mb-3 uppercase tracking-wider">
        Showing {filtered.length} of {stores.length} stores
        {(filterState !== 'All' || statusFilter !== 'All' || searchQuery) && (
          <button
            onClick={() => {
              setFilterState('All');
              setStatusFilter('All');
              setSearchQuery('');
            }}
            className="ml-2 text-red-400 hover:text-red-300 cursor-pointer"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Store table */}
      <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
              <Th>Store</Th>
              <Th className="hidden md:table-cell">State</Th>
              <Th className="text-center">Status</Th>
              <Th className="text-center">Days Since</Th>
              <Th className="text-right">Period $</Th>
              <Th className="text-right hidden sm:table-cell">YTD $</Th>
              <Th className="text-center hidden md:table-cell">Orders</Th>
              <Th className="hidden lg:table-cell">Last Order</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => {
              const ss = STATUS_STYLES[s.status];
              return (
                <tr key={s.customerId} className="border-b border-[#A9ACAF]/8 hover:bg-[#111] transition-colors">
                  <td className="px-4 py-3">
                    <div className="text-white font-semibold">{s.storeName}</div>
                    <div className="text-[#555] text-xs md:hidden">
                      {STATE_LABELS[s.state] || s.state}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#A9ACAF] hidden md:table-cell">{STATE_LABELS[s.state] || s.state || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span
                      className="inline-block px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider"
                      style={{background: ss.bg, color: ss.text}}
                    >
                      {ss.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-white font-bold" style={{fontFamily: 'Teko, sans-serif', fontSize: '1.2rem'}}>
                      {s.daysSinceLastOrder}d
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-[#c8a84b] font-bold">{money(s.periodRevenue)}</td>
                  <td className="px-4 py-3 text-right text-white hidden sm:table-cell">{money(s.ytdRevenue)}</td>
                  <td className="px-4 py-3 text-center text-[#A9ACAF] hidden md:table-cell">{s.orderCount}</td>
                  <td className="px-4 py-3 text-[#666] text-xs hidden lg:table-cell">
                    {s.lastOrderDate
                      ? new Date(s.lastOrderDate).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'})
                      : '—'}
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-[#666]">
                  No stores found matching your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Subcomponents ──────────────────────────────────────────────────────────
function Th({children, className = ''}: {children: React.ReactNode; className?: string}) {
  return (
    <th
      className={`text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold ${className}`}
    >
      {children}
    </th>
  );
}

function KpiCard({label, value, sub, accent}: {label: string; value: string; sub: string; accent: string}) {
  return (
    <div className="bg-[#111] border border-[#A9ACAF]/15 rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{fontFamily: 'Teko, sans-serif', color: accent, lineHeight: 1.1}}>
        {value}
      </div>
      <div className="text-[10px] text-[#666] uppercase tracking-wider mt-1">{sub}</div>
    </div>
  );
}

function StateCard({data, active, onClick}: {data: any; active: boolean; onClick: () => void}) {
  const totalMix = data.mixHitStick + data.mixPreRolls + data.mixGroundGame + data.mixOther;
  const pct = (n: number) => (totalMix > 0 ? Math.round((n / totalMix) * 100) : 0);
  const deltaColor = data.delta >= 0 ? '#22C55E' : '#EF4444';
  const deltaArrow = data.delta >= 0 ? '▲' : '▼';

  return (
    <button
      onClick={onClick}
      className="text-left rounded-xl p-4 cursor-pointer transition-all hover:scale-[1.02]"
      style={{
        background: active ? 'rgba(200,168,75,0.1)' : '#111',
        border: active ? '1px solid #c8a84b' : '1px solid rgba(169,172,175,0.15)',
      }}
    >
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="text-white text-lg font-bold uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif'}}>
            {STATE_LABELS[data.state] || data.state}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold">
            {data.stores} {data.stores === 1 ? 'store' : 'stores'} · {data.orders} orders
          </div>
        </div>
        {data.priorRevenue > 0 && (
          <span className="text-xs font-bold" style={{color: deltaColor}}>
            {deltaArrow} {Math.abs(data.delta).toFixed(0)}%
          </span>
        )}
      </div>
      <div className="text-3xl font-bold text-[#c8a84b] mb-1" style={{fontFamily: 'Teko, sans-serif', lineHeight: 1.1}}>
        {money(data.revenue)}
      </div>
      <div className="text-[10px] text-[#666] uppercase tracking-wider mb-3">
        {data.stores > 0 ? `${money(data.avgPerStore)} / store` : 'No orders in period'}
      </div>
      {/* SKU mix bar */}
      {totalMix > 0 && (
        <div className="space-y-1">
          <div className="flex h-1.5 rounded overflow-hidden">
            {data.mixHitStick > 0 && <div style={{width: `${pct(data.mixHitStick)}%`, background: '#c8a84b'}} />}
            {data.mixPreRolls > 0 && <div style={{width: `${pct(data.mixPreRolls)}%`, background: '#A855F7'}} />}
            {data.mixGroundGame > 0 && <div style={{width: `${pct(data.mixGroundGame)}%`, background: '#22C55E'}} />}
            {data.mixOther > 0 && <div style={{width: `${pct(data.mixOther)}%`, background: '#A9ACAF'}} />}
          </div>
          <div className="flex flex-wrap gap-x-2 text-[9px] text-[#666] uppercase tracking-wider">
            {data.mixHitStick > 0 && <span>HS {pct(data.mixHitStick)}%</span>}
            {data.mixPreRolls > 0 && <span>PR {pct(data.mixPreRolls)}%</span>}
            {data.mixGroundGame > 0 && <span>GG {pct(data.mixGroundGame)}%</span>}
          </div>
        </div>
      )}
    </button>
  );
}

function AlertPanel({
  tone,
  title,
  subtitle,
  stores,
  onStoreClick,
}: {
  tone: 'stale' | 'watch';
  title: string;
  subtitle: string;
  stores: StoreRow[];
  onStoreClick?: (customerId: string) => void;
}) {
  const isStale = tone === 'stale';
  const bg = isStale ? 'rgba(239,68,68,0.05)' : 'rgba(234,179,8,0.05)';
  const border = isStale ? 'rgba(239,68,68,0.2)' : 'rgba(234,179,8,0.2)';
  const color = isStale ? '#EF4444' : '#EAB308';
  return (
    <div className="mt-6 rounded-xl p-4" style={{background: bg, border: `1px solid ${border}`}}>
      <p className="text-sm font-bold mb-1" style={{color, fontFamily: 'Teko, sans-serif', fontSize: '1.1rem'}}>
        {title}
      </p>
      <p className="text-[#A9ACAF] text-xs mb-3">{subtitle}</p>
      <div className="flex flex-wrap gap-2">
        {stores.map((s) => (
          <button
            key={s.customerId}
            onClick={() => onStoreClick?.(s.customerId)}
            className="inline-block px-2.5 py-1.5 rounded text-xs cursor-pointer transition-all hover:scale-105"
            style={{background: `${color}1a`, color, border: `1px solid ${color}33`}}
          >
            {s.storeName} · {STATE_LABELS[s.state] || s.state} · {s.daysSinceLastOrder}d
          </button>
        ))}
      </div>
    </div>
  );
}
