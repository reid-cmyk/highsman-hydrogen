/**
 * app/routes/sales-staging.orders.tsx
 * /sales-staging/orders — Sales Orders feed
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link, useSearchParams, useNavigate} from '@remix-run/react';
import {useState, useEffect, useRef} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {SalesFloorNav} from '~/components/SalesFloorNav';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [{title: 'Sales Orders | Sales Floor'}, {name: 'robots', content: 'noindex'}];

const T = {
  bg:'#0A0A0A', surface:'#141414', surfaceElev:'#1A1A1A',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textMuted:'#C8C8C8', textSubtle:'#9C9C9C', textFaint:'#6A6A6A',
  yellow:'#FFD500', yellowWarm:'#c8a84b', cyan:'#00D4FF', green:'#00E676',
  magenta:'#FF3B7F', redSystems:'#FF3355', statusWarn:'#FFB300',
};

const STATES = ['ALL','NJ','MO','NY','RI','MA'];
const STATUSES = ['All','Submitted','Accepted','Fulfilled','Shipped','Complete','Cancelled','Rejected'];

const STATUS_COLOR: Record<string,string> = {
  Submitted: T.cyan, Accepted: T.yellow, Fulfilled: T.statusWarn,
  Shipped: T.statusWarn, Complete: T.green, Cancelled: T.textFaint, Rejected: T.redSystems,
};

function parseMoney(s: any) { return parseFloat(String(s||0).replace(/[$,]/g,''))||0; }
function fmt$(n: number) { return `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }

// ── Loader ────────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({authenticated: false, orders:[], stats:null});

  const url = new URL(request.url);
  const state        = url.searchParams.get('state')  || 'ALL';
  const statusFilter = url.searchParams.get('status') || 'All';
  const period       = url.searchParams.get('period') || 'mtd'; // all | ytd | mtd — defaults to This Month
  const search       = (url.searchParams.get('search') || '').trim();

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  const now = new Date();
  const ytdStart = `${now.getFullYear()}-01-01`;
  const mtdStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

  const stateQ  = state !== 'ALL' ? `&market_state=eq.${state}` : '';
  const statusQ = statusFilter !== 'All' ? `&status=eq.${statusFilter}` : '';
  const periodQ = period === 'ytd' ? `&order_date=gte.${ytdStart}`
                : period === 'mtd' ? `&order_date=gte.${mtdStart}`
                : '';

  // When search is active, override all other filters and search full DB by customer name
  const searchQ = search ? `&leaflink_customer_name=ilike.*${encodeURIComponent(search)}*` : '';
  const ordersUrl = search
    ? `${base}/rest/v1/leaflink_orders?select=*,organizations(name)${searchQ}&is_sample_order=eq.false&order=order_date.desc.nullslast&limit=500`
    : `${base}/rest/v1/leaflink_orders?select=*,organizations(name)${stateQ}${statusQ}${periodQ}&is_sample_order=eq.false&order=order_date.desc.nullslast&limit=500`;

  const [ordersRes, periodStatsRes, ytdStatsRes, pendingRes, completeRes] = await Promise.all([
    fetch(ordersUrl, {headers: h}),
    // Stats for the selected period + state
    fetch(`${base}/rest/v1/leaflink_orders?select=total_amount,order_date${stateQ}${periodQ}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)`, {headers: h}),
    // YTD always — never filtered by period, only by state
    fetch(`${base}/rest/v1/leaflink_orders?select=total_amount${stateQ}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)&order_date=gte.${ytdStart}`, {headers: h}),
    // Pending (not period-filtered)
    fetch(`${base}/rest/v1/leaflink_orders?select=id${stateQ}&is_sample_order=eq.false&status=in.(Submitted,Accepted,Fulfilled,Shipped)`, {headers: {...h, Prefer: 'count=exact'}}),
    // Complete (not period-filtered)
    fetch(`${base}/rest/v1/leaflink_orders?select=id${stateQ}&is_sample_order=eq.false&status=eq.Complete`, {headers: {...h, Prefer: 'count=exact'}}),
  ]);

  const [orders, periodRows, ytdRows] = await Promise.all([ordersRes.json(), periodStatsRes.json(), ytdStatsRes.json()]);
  const pendingCount  = parseInt(pendingRes.headers.get('content-range')?.split('/')[1] || '0');
  const completeCount = parseInt(completeRes.headers.get('content-range')?.split('/')[1] || '0');

  const rows = Array.isArray(periodRows) ? periodRows : [];
  const ytdRevenue    = Array.isArray(ytdRows) ? ytdRows.reduce((s:number,r:any)=>s+parseMoney(r.total_amount),0) : 0;
  const periodRevenue = rows.reduce((s:number,r:any)=>s+parseMoney(r.total_amount),0);
  const periodCount   = rows.length;
  const periodAov     = periodCount > 0 ? periodRevenue / periodCount : 0;

  return json({
    authenticated: true,
    orders: Array.isArray(orders) ? orders : [],
    stats: {ytdRevenue, periodRevenue, periodCount, periodAov, pendingCount, completeCount},
    state, statusFilter, period, search,
  });
}

// ── Count-up hook ─────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    prev.current = 0;
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setVal(target * ease);
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

// ── Stat cell with count-up ───────────────────────────────────────────────────
function StatCell({label, value, format, accent}: {label:string; value:number; format:'money'|'number'; accent:string}) {
  const animated = useCountUp(value);
  const display = format === 'money' ? fmt$(animated) : String(Math.round(animated));
  return (
    <div style={{background:T.bg, padding:'16px 18px'}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>{label}</div>
      <span style={{fontFamily:'Teko,sans-serif', fontSize:34, fontWeight:600, color:accent, lineHeight:0.9, textShadow:accent===T.yellow?'0 0 24px rgba(255,213,0,0.18)':'none'}}>{display}</span>
    </div>
  );
}

// ── New Order Modal ───────────────────────────────────────────────────────────
// ── Line item row with product search ────────────────────────────────────────
function LineItemRow({item, index, onUpdate, onRemove, fieldStyle}: {item:any; index:number; onUpdate:(i:number,f:string,v:string)=>void; onRemove:(i:number)=>void; fieldStyle:any}) {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  const search = async (q: string) => {
    onUpdate(index, 'product_name', q);
    if (q.length < 2) { setSuggestions([]); setOpen(false); return; }
    const res = await fetch(`/api/product-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    const prods = data.products || [];
    setSuggestions(prods);
    setOpen(prods.length > 0);
  };

  const select = (p: any) => {
    onUpdate(index, 'product_name', p.name);
    onUpdate(index, 'leaflink_sku', p.leaflink_sku || '');
    if (p.wholesale_price) onUpdate(index, 'unit_price', String(parseFloat(p.wholesale_price)||0));
    setSuggestions([]); setOpen(false);
  };

  return (
    <div style={{marginBottom:8}}>
      <div style={{display:'grid', gridTemplateColumns:'1fr 70px 90px 24px', gap:6, alignItems:'start'}}>
        <div style={{position:'relative'}}>
          <input value={item.product_name} onChange={e=>search(e.target.value)}
            onBlur={()=>setTimeout(()=>setOpen(false),150)}
            onFocus={()=>item.product_name.length>=2&&setSuggestions(s=>s)}
            placeholder="Search products…" style={fieldStyle} />
          {open && suggestions.length > 0 && (
            <div style={{position:'absolute', top:'100%', left:0, right:0, background:'#1A1A1A', border:`1px solid #2F2F2F`, zIndex:20, maxHeight:140, overflowY:'auto'}}>
              {suggestions.map((p:any,si:number) => (
                <div key={si} onMouseDown={()=>select(p)}
                  style={{padding:'7px 10px', cursor:'pointer', borderBottom:`1px solid #1F1F1F`}}>
                  <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:'#F5F5F5', lineHeight:1.3}}>{p.name}</div>
                  <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:'#6A6A6A', marginTop:2}}>{p.leaflink_sku} · ${parseFloat(p.wholesale_price||'0').toFixed(2)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
        <input type="number" value={item.quantity} onChange={e=>onUpdate(index,'quantity',e.target.value)} placeholder="Qty" style={fieldStyle} min="0" />
        <input type="number" value={item.unit_price} onChange={e=>onUpdate(index,'unit_price',e.target.value)} placeholder="Unit $" style={fieldStyle} step="0.01" min="0" />
        <button type="button" onClick={()=>onRemove(index)} style={{background:'none',border:'none',color:'#6A6A6A',cursor:'pointer',fontSize:14,lineHeight:1,paddingTop:6}}>✕</button>
      </div>
    </div>
  );
}

function NewOrderModal({onClose}: {onClose:()=>void}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    org_id:'', leaflink_customer_name:'', status:'Submitted',
    order_date: new Date().toISOString().split('T')[0],
    total_amount:'', market_state:'NJ', payment_terms:'Net 30',
  });
  const [lineItems, setLineItems] = useState<{product_name:string; quantity:string; unit_price:string; leaflink_sku?:string}[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<any[]>([]);

  const addLineItem = () => setLineItems(l=>[...l,{product_name:'',quantity:'1',unit_price:'',leaflink_sku:''}]);
  const removeLineItem = (i:number) => setLineItems(l=>l.filter((_,idx)=>idx!==i));
  const updateLineItem = (i:number, field:string, val:string) => setLineItems(l=>l.map((item,idx)=>idx===i?{...item,[field]:val}:item));
  const computedTotal = lineItems.length > 0
    ? lineItems.reduce((s,l)=>s+(parseFloat(l.quantity||'0')||0)*(parseFloat(l.unit_price||'0')||0),0).toFixed(2)
    : form.total_amount;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok) { onClose(); navigate('/sales-staging/orders'); }
    else if (d && !d.ok) setSaving(false);
  }, [fetcher.data]);

  const searchOrgs = async (q: string) => {
    if (q.length < 2) { setOrgResults([]); return; }
    const res = await fetch(`/api/org-search?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    setOrgResults(data.results || []);
  };

  const fieldStyle = {background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:12, fontFamily:'Inter,sans-serif', padding:'6px 8px', outline:'none', width:'100%', boxSizing:'border-box' as const};
  const labelStyle = {fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase' as const, marginBottom:3};

  return (
    <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center'}}>
      <div style={{background:T.surface, border:`1px solid ${T.borderStrong}`, width:480, maxHeight:'85vh', overflowY:'auto', padding:24}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20}}>
          <span style={{fontFamily:'Teko,sans-serif', fontSize:20, letterSpacing:'0.24em', color:T.text}}>NEW SALES ORDER</span>
          <button onClick={onClose} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:20}}>✕</button>
        </div>
        <fetcher.Form method="post" action="/api/order-create" onSubmit={()=>setSaving(true)} style={{display:'flex', flexDirection:'column', gap:12}}>
          {/* Account search */}
          <div style={{position:'relative'}}>
            <div style={labelStyle}>Account</div>
            <input value={orgSearch} onChange={e=>{setOrgSearch(e.target.value);searchOrgs(e.target.value);}} placeholder="Search accounts…" style={fieldStyle} autoFocus />
            {orgResults.length > 0 && (
              <div style={{position:'absolute', top:'100%', left:0, right:0, background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, zIndex:10, maxHeight:160, overflowY:'auto'}}>
                {orgResults.map((o:any) => (
                  <div key={o.id} onClick={()=>{ setForm(f=>({...f, org_id:o.id, leaflink_customer_name:o.name})); setOrgSearch(o.name); setOrgResults([]); }}
                    style={{padding:'8px 12px', cursor:'pointer', fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, borderBottom:`1px solid ${T.border}`}}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceElev)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    {o.name} <span style={{color:T.textFaint, fontSize:11}}>{o.market_state}</span>
                  </div>
                ))}
              </div>
            )}
            <input type="hidden" name="org_id" value={form.org_id} />
            <input type="hidden" name="leaflink_customer_name" value={form.leaflink_customer_name || orgSearch} />
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <div style={labelStyle}>Order Date</div>
              <input type="date" name="order_date" value={form.order_date} onChange={e=>setForm(f=>({...f,order_date:e.target.value}))} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Status</div>
              <select name="status" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={fieldStyle}>
                {['Submitted','Accepted','Fulfilled','Shipped','Complete','Cancelled','Rejected'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:12}}>
            <div>
              <div style={labelStyle}>Total Amount ($)</div>
              <input type="number" step="0.01" value={form.total_amount} onChange={e=>setForm(f=>({...f,total_amount:e.target.value}))} placeholder="0.00 (or add SKUs below)" style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Market State</div>
              <select name="market_state" value={form.market_state} onChange={e=>setForm(f=>({...f,market_state:e.target.value}))} style={fieldStyle}>
                {['NJ','MO','NY','RI','MA'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <div style={labelStyle}>Payment Terms</div>
            <select name="payment_terms" value={form.payment_terms} onChange={e=>setForm(f=>({...f,payment_terms:e.target.value}))} style={fieldStyle}>
              {['Net 30','Net 15','Net 7','Due on receipt','COD','Prepaid'].map(s=><option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Line items */}
          <div>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8}}>
              <div style={labelStyle}>Line Items (optional)</div>
              <button type="button" onClick={addLineItem} style={{background:'none', border:'none', color:T.yellow, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.14em', cursor:'pointer', padding:0}}>+ ADD SKU</button>
            </div>
            {lineItems.map((l,i)=>(
              <LineItemRow key={i} item={l} index={i} onUpdate={updateLineItem} onRemove={removeLineItem} fieldStyle={fieldStyle} />
            ))}
            {lineItems.length > 0 && (
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, textAlign:'right', letterSpacing:'0.10em'}}>
                Computed total: ${computedTotal}
              </div>
            )}
            <input type="hidden" name="line_items_json" value={JSON.stringify(lineItems)} />
            <input type="hidden" name="total_amount" value={computedTotal || form.total_amount} />
          </div>

          {(fetcher.data as any)?.error && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems}}>{(fetcher.data as any).error}</div>}

          <div style={{display:'flex', gap:8, marginTop:4}}>
            <button type="submit" disabled={saving} style={{height:36, padding:'0 20px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.18em', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1}}>
              {saving ? 'SAVING…' : 'CREATE ORDER'}
            </button>
            <button type="button" onClick={onClose} style={{height:36, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.14em', cursor:'pointer'}}>CANCEL</button>
          </div>
        </fetcher.Form>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SalesOrders() {
  const {authenticated, orders, stats, state, statusFilter, period, search} = useLoaderData<typeof loader>() as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [showModal, setShowModal] = useState(false);
  const [searchDraft, setSearchDraft] = useState(search || '');

  const submitSearch = (q: string) => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('search', q.trim());
    setSearchParams(p);
  };

  // Debounced live search — fires 350ms after user stops typing
  useEffect(() => {
    const t = setTimeout(() => { submitSearch(searchDraft); }, 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</Link></div>;

  const setFilter = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams);
    if ((key === 'state' && val === 'ALL') || (key === 'status' && val === 'All') || (key === 'period' && val === 'mtd')) p.delete(key);
    else p.set(key, val);
    p.delete('search'); // clear search when changing filters
    setSearchDraft('');
    setSearchParams(p);
  };

  // Orders are already server-filtered; no client-side filter needed
  const filteredOrders = orders;

  // Stat bar labels based on period
  const periodLabel = period === 'mtd' ? 'This Month' : period === 'ytd' ? 'YTD' : 'All Time';

  return (
    <div style={{minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif', display:'flex', flexDirection:'column',
      backgroundImage:`radial-gradient(ellipse at top, rgba(255,213,0,0.04) 0%, transparent 55%)`}}>

      <style>{`
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(0,230,118,.7)}70%{box-shadow:0 0 0 8px rgba(0,230,118,0)}100%{box-shadow:0 0 0 0 rgba(0,230,118,0)}}
        @keyframes sweep{0%{left:-25%}100%{left:125%}}
        .hs-sweep{position:relative;overflow:hidden}
        .hs-sweep::after{content:'';position:absolute;bottom:0;left:-25%;height:2px;width:25%;background:linear-gradient(90deg,transparent,#FFD500,transparent);opacity:.75;animation:sweep 14s linear infinite;pointer-events:none}
        .order-row:hover{background:#141414 !important}
      `}</style>

      {/* Top bar */}
      <div style={{height:64, background:T.bg, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:20}}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px'}} />
          <div style={{width:1, height:24, background:T.borderStrong}} />
          <div style={{fontFamily:'Teko,sans-serif', fontSize:20, fontWeight:500, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase'}}>SALES FLOOR</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:16}}>
          <div style={{display:'flex', alignItems:'center', gap:6}}>
            <div style={{width:7, height:7, borderRadius:'50%', background:T.green, animation:'pulse-ring 2.4s infinite'}} />
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.14em'}}>LIVE</span>
          </div>
          <div style={{width:1, height:20, background:T.border}} />
          <div style={{display:'flex', alignItems:'center', gap:8}}>
            <div style={{width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${T.yellow},${T.yellowWarm})`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontWeight:700, fontSize:11, fontFamily:'Teko,sans-serif'}}>SL</div>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.14em', color:T.textMuted}}>SKY LIMA</span>
          </div>
        </div>
      </div>

      <div style={{display:'flex', flex:1}}>
        <SalesFloorNav current="Sales Orders" />

        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
          {/* Header row */}
          <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
              <div>
                <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', lineHeight:1}}>Sales Orders</h1>
                <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
                  {filteredOrders.length} orders{search ? ` matching "${search}"` : ` · ${state !== 'ALL' ? state : 'all markets'} · ${periodLabel}`}
                </div>
              </div>
              <div style={{display:'flex', gap:8}}>
                <button onClick={()=>{
                  const rows = [['Account','Date','Status','Amount','State','Source'],...orders.map((o:any)=>[
                    o.organizations?.name||o.leaflink_customer_name,
                    o.order_date?new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'',
                    o.status, parseMoney(o.total_amount).toFixed(2), o.market_state, o.source
                  ])];
                  const csv = rows.map(r=>r.map((c:any)=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
                  const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv);
                  a.download = `sales-orders-${new Date().toISOString().split('T')[0]}.csv`; a.click();
                }}
                  style={{height:38, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:'pointer'}}>
                  EXPORT CSV
                </button>
                <button onClick={()=>setShowModal(true)}
                  style={{height:38, padding:'0 18px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', cursor:'pointer'}}>
                  + NEW ORDER
                </button>
              </div>
            </div>

            {/* Filters row: period dropdown + state pills + search */}
            <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
              {/* Period dropdown */}
              <select value={period} onChange={e=>setFilter('period',e.target.value)}
                style={{height:32, padding:'0 10px', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer', outline:'none'}}>
                <option value="mtd">This Month</option>
                <option value="ytd">YTD</option>
                <option value="all">All Time</option>
              </select>
              <div style={{width:1, height:20, background:T.borderStrong}} />
              {/* State */}
              <div style={{display:'flex', gap:1}}>
                {STATES.map(s => (
                <button key={s} onClick={()=>setFilter('state',s)}
                  style={{height:32, padding:'0 14px', background:state===s?`rgba(255,213,0,0.08)`:'transparent', border:'none', borderBottom:`2px solid ${state===s?T.yellow:'transparent'}`, color:state===s?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer'}}>
                  {s}
                </button>
              ))}
              </div>
              <div style={{flex:1}} />
              {/* Search — server-side, overrides all filters */}
              <form onSubmit={e=>{e.preventDefault();submitSearch(searchDraft);}} style={{display:'flex', alignItems:'center', gap:0}}>
                <input
                  value={searchDraft}
                  onChange={e=>setSearchDraft(e.target.value)}
                  onKeyDown={e=>e.key==='Escape'&&(setSearchDraft(''),submitSearch(''))}
                  placeholder="Search by dispensary…"
                  style={{height:32, padding:'0 12px', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, borderRight:'none', color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', width:220, letterSpacing:'0.02em'}}
                />
                <button type={search?'button':'submit'} onClick={search?()=>{setSearchDraft('');submitSearch('');}:undefined}
                  style={{height:32, padding:'0 10px', background:search?T.yellow:T.surfaceElev, border:`1px solid ${T.borderStrong}`, color:search?'#000':T.textFaint, cursor:'pointer', fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em'}}>
                  {search ? '✕' : '⌕'}
                </button>
              </form>
            </div>
          </div>

          {/* Stat bar — reflects selected period + state */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(6,1fr)', background:T.border, gap:1, borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
            <StatCell label="YTD Revenue"                    value={stats?.ytdRevenue||0}     format="money"  accent={T.yellow} />
            <StatCell label={`${periodLabel} Revenue`}       value={stats?.periodRevenue||0}  format="money"  accent={T.text} />
            <StatCell label={`${periodLabel} Avg Order`}     value={stats?.periodAov||0}      format="money"  accent={T.text} />
            <StatCell label={`${periodLabel} Orders`}        value={stats?.periodCount||0}    format="number" accent={T.text} />
            <StatCell label="Pending"                        value={stats?.pendingCount||0}   format="number" accent={T.statusWarn} />
            <StatCell label="Complete"                       value={stats?.completeCount||0}  format="number" accent={T.green} />
          </div>

          {/* Status filter */}
          <div style={{padding:'12px 28px', borderBottom:`1px solid ${T.border}`, display:'flex', gap:6, flexWrap:'wrap', background:T.surface, flexShrink:0}}>
            {STATUSES.map(s => {
              const active = statusFilter === s || (s==='All' && statusFilter==='All');
              const col = s === 'All' ? T.textMuted : (STATUS_COLOR[s] || T.textMuted);
              return (
                <button key={s} onClick={()=>setFilter('status',s)}
                  style={{height:26, padding:'0 12px', background:active?`${col}18`:'transparent', border:`1px solid ${active?col:T.borderStrong}`, color:active?col:T.textSubtle, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.12em', cursor:'pointer'}}>
                  {s}
                </button>
              );
            })}
          </div>

          {/* Orders table */}
          <div style={{flex:1, overflowY:'auto'}}>
            {filteredOrders.length === 0 ? (
              <div style={{padding:'48px 28px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textFaint, textAlign:'center'}}>No orders found</div>
            ) : (
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${T.borderStrong}`}}>
                    {['Account','Date','Status','Amount','State','Source'].map(h => (
                      <th key={h} style={{padding:'10px 16px', fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', textAlign:'left', fontWeight:400, background:T.surface}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((o:any) => {
                    const orgName = o.organizations?.name || o.leaflink_customer_name;
                    const sc = STATUS_COLOR[o.status] || T.textFaint;
                    const date = o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
                    const isManual = o.source === 'manual';
                    return (
                      <tr key={o.id} className="order-row"
                        style={{borderBottom:`1px solid ${T.border}`, cursor:'pointer', transition:'background 80ms'}}
                        onClick={()=>navigate(`/sales-staging/order/${o.id}`)}>
                        <td style={{padding:'12px 16px', fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, maxWidth:220}}>
                          {o.organization_id
                            ? <a href={`/sales-staging/account/${o.organization_id}`} onClick={e=>e.stopPropagation()} style={{color:T.text, textDecoration:'none', fontWeight:500}}>{orgName}</a>
                            : <span style={{color:T.textSubtle}}>{orgName}</span>}
                        </td>
                        <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, whiteSpace:'nowrap'}}>{o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—'}</td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, padding:'2px 8px', border:`1px solid ${sc}`, color:sc, letterSpacing:'0.14em', whiteSpace:'nowrap'}}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.text, textAlign:'right', whiteSpace:'nowrap'}}>
                          {fmt$(parseMoney(o.total_amount))}
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.12em'}}>{o.market_state}</span>
                        </td>
                        <td style={{padding:'12px 16px'}}>
                          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:isManual?T.statusWarn:T.textFaint, letterSpacing:'0.10em'}}>
                            {isManual ? 'manual' : o.source === 'zoho_inventory' ? 'zoho' : 'leaflink'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {showModal && <NewOrderModal onClose={()=>setShowModal(false)} />}
    </div>
  );
}
