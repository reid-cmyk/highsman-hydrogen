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
  const state = url.searchParams.get('state') || 'ALL';
  const statusFilter = url.searchParams.get('status') || 'All';

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  const stateQ = state !== 'ALL' ? `&market_state=eq.${state}` : '';
  const statusQ = statusFilter !== 'All' ? `&status=eq.${statusFilter}` : '';

  const now = new Date();
  const ytdStart = `${now.getFullYear()}-01-01`;
  const mtdStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;

  const [ordersRes, ytdRes, mtdRes, pendingRes, completeRes] = await Promise.all([
    // Orders list (most recent first, limit 200)
    fetch(`${base}/rest/v1/leaflink_orders?select=*,organizations(name)${stateQ}${statusQ}&is_sample_order=eq.false&order=order_date.desc.nullslast&limit=200`, {headers: h}),
    // YTD revenue
    fetch(`${base}/rest/v1/leaflink_orders?select=total_amount${stateQ}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)&order_date=gte.${ytdStart}`, {headers: h}),
    // MTD orders + revenue
    fetch(`${base}/rest/v1/leaflink_orders?select=total_amount${stateQ}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)&order_date=gte.${mtdStart}`, {headers: h}),
    // Pending count
    fetch(`${base}/rest/v1/leaflink_orders?select=id${stateQ}&is_sample_order=eq.false&status=in.(Submitted,Accepted,Fulfilled,Shipped)`, {headers: h, ...{headers: {...h, Prefer: 'count=exact'}} as any}),
    // Complete count
    fetch(`${base}/rest/v1/leaflink_orders?select=id${stateQ}&is_sample_order=eq.false&status=eq.Complete`, {headers: {...h, Prefer: 'count=exact'}}),
  ]);

  const [orders, ytdRows, mtdRows] = await Promise.all([
    ordersRes.json(), ytdRes.json(), mtdRes.json(),
  ]);

  const pendingCount = parseInt(pendingRes.headers.get('content-range')?.split('/')[1] || '0');
  const completeCount = parseInt(completeRes.headers.get('content-range')?.split('/')[1] || '0');

  const ytdRevenue = Array.isArray(ytdRows) ? ytdRows.reduce((s:number,r:any)=>s+parseMoney(r.total_amount),0) : 0;
  const mtdRows2 = Array.isArray(mtdRows) ? mtdRows : [];
  const mtdRevenue = mtdRows2.reduce((s:number,r:any)=>s+parseMoney(r.total_amount),0);
  const mtdOrders = mtdRows2.length;
  const mtdAov = mtdOrders > 0 ? mtdRevenue / mtdOrders : 0;

  return json({
    authenticated: true,
    orders: Array.isArray(orders) ? orders : [],
    stats: {ytdRevenue, mtdRevenue, mtdOrders, mtdAov, pendingCount, completeCount},
    state, statusFilter,
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
function NewOrderModal({onClose}: {onClose:()=>void}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    org_id:'', leaflink_customer_name:'', status:'Submitted',
    order_date: new Date().toISOString().split('T')[0],
    total_amount:'', market_state:'NJ', payment_terms:'Net 30',
  });
  const [lineItems, setLineItems] = useState<{product_name:string; quantity:string; unit_price:string}[]>([]);
  const [orgSearch, setOrgSearch] = useState('');
  const [orgResults, setOrgResults] = useState<any[]>([]);

  const addLineItem = () => setLineItems(l=>[...l,{product_name:'',quantity:'1',unit_price:''}]);
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
              <div key={i} style={{display:'grid', gridTemplateColumns:'1fr 80px 100px 24px', gap:6, marginBottom:6, alignItems:'center'}}>
                <input value={l.product_name} onChange={e=>updateLineItem(i,'product_name',e.target.value)} placeholder="Product name" style={{...fieldStyle}} />
                <input type="number" value={l.quantity} onChange={e=>updateLineItem(i,'quantity',e.target.value)} placeholder="Qty" style={{...fieldStyle}} min="0" />
                <input type="number" value={l.unit_price} onChange={e=>updateLineItem(i,'unit_price',e.target.value)} placeholder="Unit $" style={{...fieldStyle}} step="0.01" min="0" />
                <button type="button" onClick={()=>removeLineItem(i)} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:14, lineHeight:1}}>✕</button>
              </div>
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
  const {authenticated, orders, stats, state, statusFilter} = useLoaderData<typeof loader>() as any;
  const [searchParams, setSearchParams] = useSearchParams();
  const [showModal, setShowModal] = useState(false);

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</Link></div>;

  const setFilter = (key: string, val: string) => {
    const p = new URLSearchParams(searchParams);
    if ((key === 'state' && val === 'ALL') || (key === 'status' && val === 'All')) p.delete(key);
    else p.set(key, val);
    setSearchParams(p);
  };

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
                  {orders.length} orders{state !== 'ALL' ? ` · ${state}` : ' · all markets'}
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

            {/* State filter */}
            <div style={{display:'flex', gap:1, marginBottom:0}}>
              {STATES.map(s => (
                <button key={s} onClick={()=>setFilter('state',s)}
                  style={{height:32, padding:'0 14px', background:state===s?`rgba(255,213,0,0.08)`:'transparent', border:'none', borderBottom:`2px solid ${state===s?T.yellow:'transparent'}`, color:state===s?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer'}}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Stat bar */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(6,1fr)', background:T.border, gap:1, borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
            <StatCell label="YTD Revenue"   value={stats?.ytdRevenue||0}  format="money"  accent={T.yellow} />
            <StatCell label="MTD Revenue"   value={stats?.mtdRevenue||0}  format="money"  accent={T.text} />
            <StatCell label="MTD Avg Order" value={stats?.mtdAov||0}      format="money"  accent={T.text} />
            <StatCell label="MTD Orders"    value={stats?.mtdOrders||0}   format="number" accent={T.text} />
            <StatCell label="Pending"       value={stats?.pendingCount||0} format="number" accent={T.statusWarn} />
            <StatCell label="Complete"      value={stats?.completeCount||0} format="number" accent={T.green} />
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
            {orders.length === 0 ? (
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
                  {orders.map((o:any) => {
                    const orgName = o.organizations?.name || o.leaflink_customer_name;
                    const sc = STATUS_COLOR[o.status] || T.textFaint;
                    const date = o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}) : '—';
                    const isManual = o.source === 'manual';
                    return (
                      <tr key={o.id} className="order-row"
                        style={{borderBottom:`1px solid ${T.border}`, cursor:'pointer', transition:'background 80ms'}}
                        onClick={()=>window.location.href=`/sales-staging/order/${o.id}`}>
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
