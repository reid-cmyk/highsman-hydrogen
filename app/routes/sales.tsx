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

const STALE_DAYS = 30; // red
const WATCH_DAYS = 14; // yellow

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
async function getZohoAccessToken(env: any): Promise<string> {
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
  return data.access_token;
}

// Highsman Zoho Inventory Org ID — env var overrides if set
const DEFAULT_ZOHO_INVENTORY_ORG_ID = '882534504';

async function fetchSalesOrders(env: any, accessToken: string, startDate: Date, endDate: Date): Promise<any[]> {
  const orgId = env.ZOHO_INVENTORY_ORG_ID || DEFAULT_ZOHO_INVENTORY_ORG_ID;
  if (!orgId) throw new Error('ZOHO_INVENTORY_ORG_ID not configured');

  const orders: any[] = [];
  let page = 1;
  const perPage = 200;
  const dateStart = ymd(startDate);
  const dateEnd = ymd(endDate);

  while (true) {
    const url =
      `https://www.zohoapis.com/inventory/v1/salesorders` +
      `?organization_id=${orgId}` +
      `&date_start=${dateStart}` +
      `&date_end=${dateEnd}` +
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
    orders.push(...(data.salesorders || []));
    const hasMore = data.page_context?.has_more_page;
    if (!hasMore) break;
    page += 1;
    if (page > 50) break; // safety cap (10k orders)
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
    // Pull YTD once (covers current period + prior + ytd context)
    const ytdOrders = await fetchSalesOrders(env, token, ytdStart, end);

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
      // State: prefer shipping, fallback billing
      const rawState: string =
        so.shipping_address?.state || so.billing_address?.state || so.billing_state || '';
      const state = (rawState || '').trim().toUpperCase().slice(0, 2);
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
    return json({
      authenticated: true,
      error: `Failed to fetch Zoho Inventory data: ${err.message}`,
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
  if (err) {
    return (
      <Shell>
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6">
          <p className="text-red-400 text-lg font-bold mb-2" style={{fontFamily: 'Teko, sans-serif'}}>
            CONFIGURATION ERROR
          </p>
          <p className="text-[#A9ACAF] text-sm whitespace-pre-wrap">{err}</p>
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
