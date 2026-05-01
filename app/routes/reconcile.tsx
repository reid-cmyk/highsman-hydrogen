import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form} from '@remix-run/react';
import {json} from '@shopify/remix-oxygen';
import {useEffect, useState} from 'react';

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | LeafLink ↔ Zoho Reconciliation'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ── Auth (shared password with /sales) ─────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get('password') as string;
  const correct = (context.env as any).SALES_DASHBOARD_PASSWORD || 'highsman2026';
  if (password === correct) {
    return json(
      {authenticated: true, error: null},
      {
        headers: {
          // Path=/ so the cookie reaches /api/reconcile-leaflink-zoho too.
          'Set-Cookie': `reconcile_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
        },
      },
    );
  }
  return json({authenticated: false, error: 'Incorrect password'});
}

export async function loader({request}: LoaderFunctionArgs) {
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('reconcile_auth=1') || cookie.includes('sales_auth=1');
  return json({authenticated: isAuth});
}

// ── Component ──────────────────────────────────────────────────────────────
export default function Reconcile() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.authenticated) window.location.reload();
  }, [actionData]);

  // Load Teko
  useEffect(() => {
    if (document.getElementById('teko-font-link')) return;
    const link = document.createElement('link');
    link.id = 'teko-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  if (!loaderData.authenticated) return <LoginScreen error={actionData?.error} />;
  return <ReconcileShell />;
}

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
            RECONCILE — LEAFLINK · ZOHO
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
  matchHow?: 'ref' | 'fuzzy';
};

type ApiResponse = {
  ok: boolean;
  error?: string;
  summary?: {
    sinceISO: string;
    stateFilter: string;
    leaflinkOrdersScanned: number;
    leaflinkOrdersInState: number;
    leaflinkOrdersUnknownState: number;
    zohoOrdersScanned: number;
    zohoOrdersInState: number;
    matchedCount: number;
    missingCount: number;
    missingTotalRevenue: number;
  };
  missing?: Row[];
  unknownState?: Row[];
  meta?: any;
};

function ReconcileShell() {
  const [since, setSince] = useState('2025-06-01');
  const [state, setState] = useState('NJ');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [showUnknown, setShowUnknown] = useState(false);

  const runScan = async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/reconcile-leaflink-zoho?since=${since}&state=${state}`);
      const j: ApiResponse = await res.json();
      setData(j);
    } catch (err: any) {
      setData({ok: false, error: err?.message || 'Network error'});
    } finally {
      setLoading(false);
    }
  };

  // Auto-run once on mount
  useEffect(() => {
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const money = (n: number) =>
    n.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
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
                LEAFLINK · ZOHO RECONCILE
              </h1>
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">
                LeafLink orders missing from Zoho Inventory Sales Orders
              </p>
            </div>
          </div>
          <a
            href="/sales"
            className="text-[#c8a84b] text-xs uppercase tracking-widest hover:underline"
          >
            ← Sales Dashboard
          </a>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl border border-[#A9ACAF]/15 bg-[#111]">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">
              Since (date floor)
            </div>
            <input
              type="date"
              value={since}
              onChange={(e) => setSince(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[#000] text-white border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b]"
            />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">State</div>
            <select
              value={state}
              onChange={(e) => setState(e.target.value)}
              className="px-3 py-2 rounded-lg text-sm bg-[#000] text-[#A9ACAF] border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] cursor-pointer"
            >
              {['NJ', 'MA', 'NY', 'RI', 'MO'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={runScan}
            disabled={loading}
            className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50"
            style={{
              fontFamily: 'Teko, sans-serif',
              fontSize: '1rem',
              background: '#c8a84b',
              color: '#000',
              border: 'none',
            }}
          >
            {loading ? 'SCANNING…' : 'RUN SCAN'}
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#A9ACAF]">
            Pulling LeafLink + Zoho Inventory… this can take 15–30 seconds for an 11-month window.
          </div>
        )}

        {/* Error */}
        {data && !data.ok && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="text-red-400 font-bold uppercase tracking-wider mb-1" style={{fontFamily: 'Teko, sans-serif'}}>
              SCAN FAILED
            </p>
            <p className="text-[#A9ACAF] text-sm">{data.error}</p>
          </div>
        )}

        {/* Summary + Results */}
        {data && data.ok && data.summary && (
          <>
            {/* KPIs */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
              <Kpi
                label="Missing Orders"
                value={String(data.summary.missingCount)}
                accent="#EF4444"
                sub={`out of ${data.summary.leaflinkOrdersInState} in ${data.summary.stateFilter}`}
              />
              <Kpi
                label="Missing Revenue"
                value={money(data.summary.missingTotalRevenue)}
                accent="#EF4444"
                sub="not in Zoho"
              />
              <Kpi
                label="LeafLink Highsman"
                value={String(data.summary.leaflinkOrdersScanned)}
                accent="#c8a84b"
                sub={`since ${data.summary.sinceISO}`}
              />
              <Kpi
                label="Matched in Zoho"
                value={String(data.summary.matchedCount)}
                accent="#22C55E"
                sub={`of ${data.summary.leaflinkOrdersInState} ${data.summary.stateFilter}`}
              />
              <Kpi
                label="Unknown State"
                value={String(data.summary.leaflinkOrdersUnknownState)}
                accent="#A9ACAF"
                sub="customer not in CRM"
              />
            </div>

            {/* Missing list */}
            <div className="mb-3 flex items-baseline justify-between">
              <h2
                className="text-xl uppercase tracking-wider"
                style={{fontFamily: 'Teko, sans-serif', color: '#EF4444'}}
              >
                MISSING FROM ZOHO INVENTORY ({data.summary.missingCount})
              </h2>
              <span className="text-[#666] text-xs uppercase tracking-wider">
                Total ${data.summary.missingTotalRevenue.toLocaleString()}
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15 mb-8">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
                    <Th>LL Order #</Th>
                    <Th>Customer</Th>
                    <Th>Order Date</Th>
                    <Th>Ship Date</Th>
                    <Th>Status</Th>
                    <Th className="text-right">Total</Th>
                    <Th>SKUs</Th>
                  </tr>
                </thead>
                <tbody>
                  {(data.missing || []).map((r) => (
                    <tr key={r.leaflinkOrderNumber + r.customerId} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
                      <td className="px-4 py-3 font-mono text-[#c8a84b]">{r.leaflinkOrderNumber}</td>
                      <td className="px-4 py-3 text-white">{r.customerName}</td>
                      <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.orderDate)}</td>
                      <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.actualShipDate)}</td>
                      <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.status}</td>
                      <td className="px-4 py-3 text-right text-white font-bold">{money(r.total)}</td>
                      <td className="px-4 py-3 text-[#666] text-xs">{r.skus.join(', ')}</td>
                    </tr>
                  ))}
                  {(data.missing || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-[#22C55E]">
                        ✓ Every LeafLink {data.summary.stateFilter} Highsman order matched a Zoho Sales Order. Nothing to reconcile.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Unknown state collapsible */}
            {(data.unknownState?.length || 0) > 0 && (
              <div className="mb-8">
                <button
                  onClick={() => setShowUnknown(!showUnknown)}
                  className="text-[#A9ACAF] text-xs uppercase tracking-widest hover:text-[#c8a84b] mb-2"
                >
                  {showUnknown ? '▾' : '▸'} {data.summary.leaflinkOrdersUnknownState} LeafLink orders with unknown state (sample)
                </button>
                {showUnknown && (
                  <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
                          <Th>LL Order #</Th>
                          <Th>Customer</Th>
                          <Th>Date</Th>
                          <Th className="text-right">Total</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data.unknownState || []).map((r) => (
                          <tr key={r.leaflinkOrderNumber} className="border-b border-[#A9ACAF]/8">
                            <td className="px-4 py-3 font-mono text-[#A9ACAF]">{r.leaflinkOrderNumber}</td>
                            <td className="px-4 py-3 text-white">{r.customerName}</td>
                            <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.orderDate)}</td>
                            <td className="px-4 py-3 text-right text-white">{money(r.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="text-[#666] text-xs px-4 py-2 italic">
                      These customers don't have Account_State set in Zoho CRM. Add them or flag as
                      out-of-state to remove them from this view.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Meta footer */}
            {data.meta && (
              <div className="text-[#444] text-[10px] uppercase tracking-widest">
                Scanned {data.summary.zohoOrdersScanned} Zoho orders · {data.meta.crmAccountStateRows} CRM rows ·
                LL {Math.round(data.meta.llDurationMs / 1000)}s · Zoho {Math.round(data.meta.zohoDurationMs / 1000)}s ·
                Total {Math.round(data.meta.totalDurationMs / 1000)}s
                {(data.meta.errors || []).length > 0 && (
                  <span className="text-red-400 ml-2">· errors: {data.meta.errors.join(', ')}</span>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Th({children, className = ''}: {children: React.ReactNode; className?: string}) {
  return (
    <th className={`text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold ${className}`}>
      {children}
    </th>
  );
}

function Kpi({label, value, accent, sub}: {label: string; value: string; accent: string; sub: string}) {
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

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  } catch {
    return iso;
  }
}
