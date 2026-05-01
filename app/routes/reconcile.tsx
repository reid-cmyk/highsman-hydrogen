import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form} from '@remix-run/react';
import {json} from '@shopify/remix-oxygen';
import {useEffect, useMemo, useState} from 'react';

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | LeafLink ↔ Zoho Reconciliation'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ── Auth ─────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = formData.get('password') as string;
  const correct = (context.env as any).SALES_DASHBOARD_PASSWORD || 'highsman2026';
  if (password === correct) {
    return json(
      {authenticated: true, error: null},
      {
        headers: {
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

// ── Types ────────────────────────────────────────────────────────────────
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
type ZohoView = {
  salesorder_id: string;
  salesorder_number: string;
  reference_number: string;
  customer_id: string;
  customer_name: string;
  date: string;
  total: number;
  status: string;
  warehouse_name: string;
};
type CertainMatch = {llShortId: string; zohoSalesOrderId: string; zohoSalesOrderNumber: string; how: string};
type UnsureMatch = {
  llShortId: string;
  candidates: Array<{
    zohoSalesOrderId: string;
    zohoSalesOrderNumber: string;
    zohoDate: string;
    zohoTotal: number;
    zohoCustomerName: string;
    daysDiff: number;
    totalDiff: number;
  }>;
};
type ApiResponse = {
  ok: boolean;
  error?: string;
  summary?: any;
  leaflinkOrders?: LLView[];
  zohoOrders?: ZohoView[];
  certainMatches?: CertainMatch[];
  unsureMatches?: UnsureMatch[];
  unmatchedLL?: Array<{llShortId: string}>;
  unmatchedZohoIds?: string[];
  meta?: any;
};

const STORAGE_KEY = 'reconcileConfirmations.v1';
type Confirmations = Record<string, {zohoId: string; at: string} | 'rejected'>;

function loadConfirmations(): Confirmations {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveConfirmations(c: Confirmations) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
}

// ── Component ────────────────────────────────────────────────────────────
export default function Reconcile() {
  const loaderData = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  useEffect(() => {
    if (actionData?.authenticated) window.location.reload();
  }, [actionData]);

  useEffect(() => {
    if (document.getElementById('teko-font-link')) return;
    const link = document.createElement('link');
    link.id = 'teko-font-link';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  if (!loaderData.authenticated) return <LoginScreen error={actionData?.error} />;
  return <Shell />;
}

function LoginScreen({error}: {error?: string | null}) {
  return (
    <div className="min-h-screen bg-[#000000] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png" alt="Highsman" className="mx-auto mb-6" style={{width: 140}} />
          <h1 className="text-white text-2xl uppercase tracking-wider mb-1" style={{fontFamily: 'Teko, sans-serif', fontWeight: 700}}>RECONCILE — LEAFLINK · ZOHO</h1>
          <p className="text-[#A9ACAF] text-sm uppercase tracking-widest">Spark Team — Staff Only</p>
        </div>
        <Form method="post" className="space-y-4">
          <input type="password" name="password" placeholder="Password" autoFocus className="w-full px-4 py-3 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b]" />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button type="submit" className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider cursor-pointer" style={{fontFamily: 'Teko, sans-serif', background: '#c8a84b', color: '#000', fontSize: '1.1rem', border: 'none'}}>ENTER</button>
        </Form>
      </div>
    </div>
  );
}

function money(n: number) {
  return n.toLocaleString('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
}
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
  } catch {
    return iso;
  }
}

function Shell() {
  const [since, setSince] = useState('2025-06-01');
  const [stateFilter, setStateFilter] = useState('NJ');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [confirmations, setConfirmations] = useState<Confirmations>({});
  const [tab, setTab] = useState<'certain' | 'unsure' | 'unmatchedLL' | 'unmatchedZoho' | 'leaflink' | 'zoho'>('unsure');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setConfirmations(loadConfirmations());
  }, []);

  const runScan = async () => {
    setLoading(true);
    setData(null);
    try {
      const res = await fetch(`/api/reconcile-leaflink-zoho?since=${since}&state=${stateFilter}`);
      const j: ApiResponse = await res.json();
      setData(j);
    } catch (err: any) {
      setData({ok: false, error: err?.message || 'Network error'});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runScan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Build lookup maps
  const llById = useMemo(() => {
    const m = new Map<string, LLView>();
    for (const v of data?.leaflinkOrders || []) m.set(v.shortId, v);
    return m;
  }, [data]);
  const zohoById = useMemo(() => {
    const m = new Map<string, ZohoView>();
    for (const z of data?.zohoOrders || []) m.set(z.salesorder_id, z);
    return m;
  }, [data]);

  // Apply localStorage confirmations: any LL with a confirmation is treated as certain
  const effectiveCertain = useMemo(() => {
    const out: Array<{ll: LLView; zoho: ZohoView; how: string}> = [];
    for (const m of data?.certainMatches || []) {
      const ll = llById.get(m.llShortId);
      const zoho = zohoById.get(m.zohoSalesOrderId);
      if (ll && zoho) out.push({ll, zoho, how: m.how});
    }
    for (const [llShortId, c] of Object.entries(confirmations)) {
      if (c === 'rejected') continue;
      const ll = llById.get(llShortId);
      const zoho = zohoById.get(c.zohoId);
      if (ll && zoho && !out.find((x) => x.ll.shortId === llShortId)) {
        out.push({ll, zoho, how: 'manual'});
      }
    }
    return out;
  }, [data, confirmations, llById, zohoById]);

  const certainShortIds = useMemo(() => new Set(effectiveCertain.map((m) => m.ll.shortId)), [effectiveCertain]);

  const effectiveUnsure = useMemo(() => {
    return (data?.unsureMatches || []).filter((m) => !certainShortIds.has(m.llShortId) && confirmations[m.llShortId] !== 'rejected');
  }, [data, certainShortIds, confirmations]);

  const effectiveUnmatchedLL = useMemo(() => {
    const baseUnmatched = new Set((data?.unmatchedLL || []).map((r) => r.llShortId));
    // Any unsure that the user explicitly rejected becomes unmatched
    for (const [k, v] of Object.entries(confirmations)) {
      if (v === 'rejected') baseUnmatched.add(k);
    }
    // Remove any that are now certain
    for (const id of certainShortIds) baseUnmatched.delete(id);
    return Array.from(baseUnmatched).map((id) => llById.get(id)).filter(Boolean) as LLView[];
  }, [data, certainShortIds, confirmations, llById]);

  const effectiveUnmatchedZoho = useMemo(() => {
    const matchedZohoIds = new Set(effectiveCertain.map((m) => m.zoho.salesorder_id));
    return (data?.zohoOrders || []).filter((z) => !matchedZohoIds.has(z.salesorder_id));
  }, [data, effectiveCertain]);

  const confirmMatch = (llShortId: string, zohoId: string) => {
    const next = {...confirmations, [llShortId]: {zohoId, at: new Date().toISOString()}};
    setConfirmations(next);
    saveConfirmations(next);
  };
  const rejectMatch = (llShortId: string) => {
    const next = {...confirmations, [llShortId]: 'rejected' as const};
    setConfirmations(next);
    saveConfirmations(next);
  };
  const clearDecision = (llShortId: string) => {
    const next = {...confirmations};
    delete next[llShortId];
    setConfirmations(next);
    saveConfirmations(next);
  };

  const filterLL = (l: LLView) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return l.customerName.toLowerCase().includes(q) || l.shortId.toLowerCase().includes(q);
  };

  const tabs: Array<{key: typeof tab; label: string; count: number; color: string}> = [
    {key: 'unsure', label: 'UNSURE', count: effectiveUnsure.length, color: '#EAB308'},
    {key: 'certain', label: 'CERTAIN', count: effectiveCertain.length, color: '#22C55E'},
    {key: 'unmatchedLL', label: 'LL NO MATCH', count: effectiveUnmatchedLL.length, color: '#EF4444'},
    {key: 'unmatchedZoho', label: 'ZOHO ORPHAN', count: effectiveUnmatchedZoho.length, color: '#A855F7'},
    {key: 'leaflink', label: 'ALL LL', count: data?.leaflinkOrders?.length || 0, color: '#c8a84b'},
    {key: 'zoho', label: 'ALL ZOHO', count: data?.zohoOrders?.length || 0, color: '#c8a84b'},
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <img src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png" alt="Highsman" style={{width: 120}} />
            <div>
              <h1 className="text-xl sm:text-2xl uppercase tracking-wider" style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, color: '#c8a84b'}}>LEAFLINK · ZOHO RECONCILE</h1>
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">Confirm unsure pairs · system learns from your decisions</p>
            </div>
          </div>
          <a href="/sales" className="text-[#c8a84b] text-xs uppercase tracking-widest hover:underline">← Sales Dashboard</a>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-end gap-3 mb-6 p-4 rounded-xl border border-[#A9ACAF]/15 bg-[#111]">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">Since</div>
            <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="px-3 py-2 rounded-lg text-sm bg-[#000] text-white border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b]" />
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-1">State</div>
            <select value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} className="px-3 py-2 rounded-lg text-sm bg-[#000] text-[#A9ACAF] border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] cursor-pointer">
              {['NJ', 'MA', 'NY', 'RI', 'MO'].map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button onClick={runScan} disabled={loading} className="px-5 py-2 rounded-lg text-sm font-bold uppercase tracking-wider cursor-pointer disabled:opacity-50" style={{fontFamily: 'Teko, sans-serif', fontSize: '1rem', background: '#c8a84b', color: '#000', border: 'none'}}>
            {loading ? 'SCANNING…' : 'RUN SCAN'}
          </button>
          <div className="flex-1" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or order #..." className="px-3 py-2 rounded-lg text-sm bg-[#000] text-white border border-[#A9ACAF]/20 outline-none focus:border-[#c8a84b] min-w-[260px]" />
        </div>

        {loading && <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#A9ACAF]">Pulling LeafLink + Zoho Inventory… this can take 30–60 seconds.</div>}
        {data && !data.ok && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-6">
            <p className="text-red-400 font-bold uppercase tracking-wider mb-1" style={{fontFamily: 'Teko, sans-serif'}}>SCAN FAILED</p>
            <p className="text-[#A9ACAF] text-sm">{data.error}</p>
          </div>
        )}

        {data && data.ok && (
          <>
            {/* Tab nav */}
            <div className="flex flex-wrap gap-2 mb-4 border-b border-[#A9ACAF]/10 pb-2">
              {tabs.map((t) => {
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)} className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider cursor-pointer" style={{fontFamily: 'Teko, sans-serif', fontSize: '1rem', background: active ? t.color : '#111', color: active ? '#000' : t.color, border: `1px solid ${active ? t.color : 'rgba(169,172,175,0.2)'}`}}>
                    {t.label} ({t.count})
                  </button>
                );
              })}
            </div>

            {/* Tab content */}
            {tab === 'unsure' && (
              <UnsurePanel unsure={effectiveUnsure} llById={llById} search={search} onConfirm={confirmMatch} onReject={rejectMatch} />
            )}
            {tab === 'certain' && (
              <CertainPanel certain={effectiveCertain.filter((m) => filterLL(m.ll))} onClear={clearDecision} confirmations={confirmations} />
            )}
            {tab === 'unmatchedLL' && (
              <UnmatchedLLPanel rows={effectiveUnmatchedLL.filter(filterLL)} onClear={clearDecision} confirmations={confirmations} />
            )}
            {tab === 'unmatchedZoho' && (
              <UnmatchedZohoPanel rows={effectiveUnmatchedZoho.filter((z) => !search || z.customer_name.toLowerCase().includes(search.toLowerCase()) || z.salesorder_number.toLowerCase().includes(search.toLowerCase()))} />
            )}
            {tab === 'leaflink' && (
              <AllLLPanel rows={(data.leaflinkOrders || []).filter(filterLL)} certainShortIds={certainShortIds} confirmations={confirmations} />
            )}
            {tab === 'zoho' && (
              <AllZohoPanel rows={(data.zohoOrders || []).filter((z) => !search || z.customer_name.toLowerCase().includes(search.toLowerCase()) || z.salesorder_number.toLowerCase().includes(search.toLowerCase()))} matchedIds={new Set(effectiveCertain.map((m) => m.zoho.salesorder_id))} />
            )}

            {data.meta && (
              <div className="text-[#444] text-[10px] uppercase tracking-widest mt-8">
                Scanned in {Math.round(data.meta.totalMs / 1000)}s · LL list {Math.round(data.meta.llListMs / 1000)}s · LL detail {Math.round(data.meta.llDetailMs / 1000)}s · Zoho {Math.round(data.meta.zohoMs / 1000)}s
                {(data.meta.errors || []).length > 0 && <span className="text-red-400 ml-2">· errors: {data.meta.errors.join(', ')}</span>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Panels ───────────────────────────────────────────────────────────────
function UnsurePanel({unsure, llById, search, onConfirm, onReject}: {unsure: UnsureMatch[]; llById: Map<string, LLView>; search: string; onConfirm: (ll: string, z: string) => void; onReject: (ll: string) => void}) {
  const filtered = unsure.filter((m) => {
    const ll = llById.get(m.llShortId);
    if (!ll) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return ll.customerName.toLowerCase().includes(q) || ll.shortId.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    return <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#22C55E]">✓ Nothing unsure to review.</div>;
  }
  return (
    <div className="space-y-4">
      <p className="text-[#A9ACAF] text-sm">
        For each LeafLink order below, pick the matching Zoho Sales Order — or click <span className="text-red-400">No Match</span> if it's truly missing. Your decisions save locally and persist across sessions.
      </p>
      {filtered.map((m) => {
        const ll = llById.get(m.llShortId);
        if (!ll) return null;
        return (
          <div key={m.llShortId} className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-4">
            {/* LL header */}
            <div className="flex flex-wrap items-baseline justify-between gap-3 mb-3 pb-3 border-b border-[#A9ACAF]/10">
              <div>
                <div className="text-white font-bold text-base">{ll.customerName} <span className="text-[#666] font-normal">· {ll.state || '?'}</span></div>
                <div className="text-[#A9ACAF] text-xs mt-1">
                  LL <span className="font-mono text-[#c8a84b]">{ll.shortId}</span> · {fmtDate(ll.orderDate)} · {ll.status} · {money(ll.total)} · {ll.skus.join(', ')}
                </div>
              </div>
              <button onClick={() => onReject(ll.shortId)} className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider cursor-pointer" style={{background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.4)'}}>
                NO MATCH (truly missing)
              </button>
            </div>
            {/* Candidates */}
            <div className="text-[10px] uppercase tracking-widest text-[#666] font-bold mb-2">Zoho candidates for this customer (within ±30 days)</div>
            <div className="space-y-2">
              {m.candidates.map((c) => (
                <div key={c.zohoSalesOrderId} className="flex flex-wrap items-center justify-between gap-3 p-2 rounded bg-[#0a0a0a] border border-[#A9ACAF]/10">
                  <div className="text-sm flex-1">
                    <span className="font-mono text-[#22C55E] font-bold">{c.zohoSalesOrderNumber}</span>
                    <span className="text-[#A9ACAF] mx-2">·</span>
                    <span className="text-white">{c.zohoCustomerName}</span>
                    <span className="text-[#A9ACAF] mx-2">·</span>
                    <span className="text-[#A9ACAF]">{fmtDate(c.zohoDate)}</span>
                    <span className="text-[#A9ACAF] mx-2">·</span>
                    <span className="text-white font-bold">{money(c.zohoTotal)}</span>
                    <span className="text-[#666] ml-3 text-xs">
                      Δ {c.daysDiff}d · Δ ${c.totalDiff.toFixed(0)}
                    </span>
                  </div>
                  <button onClick={() => onConfirm(ll.shortId, c.zohoSalesOrderId)} className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider cursor-pointer" style={{background: '#22C55E', color: '#000', border: 'none'}}>
                    ✓ Confirm match
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CertainPanel({certain, onClear, confirmations}: {certain: Array<{ll: LLView; zoho: ZohoView; how: string}>; onClear: (id: string) => void; confirmations: Confirmations}) {
  if (certain.length === 0) return <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#A9ACAF]">No certain matches yet.</div>;
  return (
    <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
            <Th>LL Order</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th className="text-right">LL Total</Th>
            <Th>Zoho SO</Th>
            <Th className="text-right">Zoho Total</Th>
            <Th>Match Type</Th>
            <Th></Th>
          </tr>
        </thead>
        <tbody>
          {certain.map((m) => (
            <tr key={m.ll.shortId} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
              <td className="px-4 py-3 font-mono text-[#c8a84b]">{m.ll.shortId}</td>
              <td className="px-4 py-3 text-white">{m.ll.customerName}</td>
              <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(m.ll.orderDate)}</td>
              <td className="px-4 py-3 text-right text-white font-bold">{money(m.ll.total)}</td>
              <td className="px-4 py-3 font-mono text-[#22C55E]">{m.zoho.salesorder_number}</td>
              <td className="px-4 py-3 text-right text-white font-bold">{money(m.zoho.total)}</td>
              <td className="px-4 py-3 text-[10px] uppercase tracking-widest">
                <span className="px-2 py-0.5 rounded" style={{background: m.how === 'manual' ? 'rgba(34,197,94,0.15)' : 'rgba(200,168,75,0.15)', color: m.how === 'manual' ? '#22C55E' : '#c8a84b'}}>{m.how}</span>
              </td>
              <td className="px-4 py-3 text-xs">
                {confirmations[m.ll.shortId] && confirmations[m.ll.shortId] !== 'rejected' && (
                  <button onClick={() => onClear(m.ll.shortId)} className="text-[#666] hover:text-red-400">undo</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnmatchedLLPanel({rows, onClear, confirmations}: {rows: LLView[]; onClear: (id: string) => void; confirmations: Confirmations}) {
  if (rows.length === 0) return <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#22C55E]">✓ Every LeafLink order has been matched.</div>;
  const total = rows.reduce((s, r) => s + r.total, 0);
  return (
    <div>
      <div className="mb-3 text-[#A9ACAF] text-xs uppercase tracking-wider">
        {rows.length} LeafLink orders with no Zoho candidate · Total <span className="text-red-400 font-bold">{money(total)}</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
              <Th>LL Order</Th>
              <Th>Customer</Th>
              <Th>State</Th>
              <Th>Date Placed</Th>
              <Th>Status</Th>
              <Th className="text-right">Total</Th>
              <Th>SKUs</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.shortId} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
                <td className="px-4 py-3 font-mono text-[#c8a84b]">{r.shortId}</td>
                <td className="px-4 py-3 text-white">{r.customerName}</td>
                <td className="px-4 py-3 text-[#A9ACAF]">{r.state || '—'}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.orderDate)}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.status}</td>
                <td className="px-4 py-3 text-right text-white font-bold">{money(r.total)}</td>
                <td className="px-4 py-3 text-[#666] text-xs">{r.skus.join(', ')}</td>
                <td className="px-4 py-3 text-xs">
                  {confirmations[r.shortId] === 'rejected' && (
                    <button onClick={() => onClear(r.shortId)} className="text-[#666] hover:text-[#22C55E]">undo reject</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnmatchedZohoPanel({rows}: {rows: ZohoView[]}) {
  if (rows.length === 0) return <div className="rounded-xl border border-[#A9ACAF]/15 bg-[#111] p-8 text-center text-[#22C55E]">✓ Every NJ-related Zoho SO has a LeafLink twin.</div>;
  return (
    <div>
      <div className="mb-3 text-[#A9ACAF] text-xs uppercase tracking-wider">
        {rows.length} Zoho SOs from LeafLink-known customers with no matched LL order — likely manual entries or non-LeafLink sales.
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
              <Th>Zoho SO</Th>
              <Th>Customer</Th>
              <Th>Date</Th>
              <Th className="text-right">Total</Th>
              <Th>Status</Th>
              <Th>Warehouse</Th>
              <Th>Reference</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.salesorder_id} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
                <td className="px-4 py-3 font-mono text-[#A855F7]">{r.salesorder_number}</td>
                <td className="px-4 py-3 text-white">{r.customer_name}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 text-right text-white font-bold">{money(r.total)}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.status}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.warehouse_name || '—'}</td>
                <td className="px-4 py-3 text-[#666] text-xs font-mono">{r.reference_number || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AllLLPanel({rows, certainShortIds, confirmations}: {rows: LLView[]; certainShortIds: Set<string>; confirmations: Confirmations}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
            <Th>LL Order</Th>
            <Th>Customer</Th>
            <Th>State</Th>
            <Th>Date Placed</Th>
            <Th>Status</Th>
            <Th className="text-right">Total</Th>
            <Th>Match</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isCertain = certainShortIds.has(r.shortId);
            const c = confirmations[r.shortId];
            const tag = isCertain ? '✓ matched' : c === 'rejected' ? '✗ no match' : '? unsure';
            const color = isCertain ? '#22C55E' : c === 'rejected' ? '#EF4444' : '#EAB308';
            return (
              <tr key={r.shortId} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
                <td className="px-4 py-3 font-mono text-[#c8a84b]">{r.shortId}</td>
                <td className="px-4 py-3 text-white">{r.customerName}</td>
                <td className="px-4 py-3 text-[#A9ACAF]">{r.state || '—'}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.orderDate)}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.status}</td>
                <td className="px-4 py-3 text-right text-white font-bold">{money(r.total)}</td>
                <td className="px-4 py-3 text-[10px] uppercase tracking-widest" style={{color}}>{tag}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AllZohoPanel({rows, matchedIds}: {rows: ZohoView[]; matchedIds: Set<string>}) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#A9ACAF]/15">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#A9ACAF]/15" style={{background: '#0a0a0a'}}>
            <Th>Zoho SO</Th>
            <Th>Customer</Th>
            <Th>Date</Th>
            <Th>Status</Th>
            <Th className="text-right">Total</Th>
            <Th>Warehouse</Th>
            <Th>Reference</Th>
            <Th>Matched?</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const matched = matchedIds.has(r.salesorder_id);
            return (
              <tr key={r.salesorder_id} className="border-b border-[#A9ACAF]/8 hover:bg-[#111]">
                <td className="px-4 py-3 font-mono text-[#22C55E]">{r.salesorder_number}</td>
                <td className="px-4 py-3 text-white">{r.customer_name}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{fmtDate(r.date)}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.status}</td>
                <td className="px-4 py-3 text-right text-white font-bold">{money(r.total)}</td>
                <td className="px-4 py-3 text-[#A9ACAF] text-xs">{r.warehouse_name || '—'}</td>
                <td className="px-4 py-3 text-[#666] text-xs font-mono">{r.reference_number || '—'}</td>
                <td className="px-4 py-3 text-[10px] uppercase tracking-widest" style={{color: matched ? '#22C55E' : '#A855F7'}}>{matched ? '✓ yes' : 'orphan'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Th({children, className = ''}: {children: React.ReactNode; className?: string}) {
  return <th className={`text-left px-4 py-3 text-[10px] uppercase tracking-widest text-[#666] font-bold ${className}`}>{children}</th>;
}
