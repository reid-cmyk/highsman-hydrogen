/**
 * app/routes/sales-staging.order.$id.tsx
 * /sales-staging/order/:id — Sales Order detail
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link} from '@remix-run/react';
import {useState} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {SalesFloorNav} from '~/components/SalesFloorNav';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction<typeof loader> = ({data}) => {
  const d = data as any;
  const org = d?.org?.name || 'Order';
  return [{title: `${org} | Sales Order | Sales Floor`}, {name: 'robots', content: 'noindex'}];
};

const T = {
  bg:'#0A0A0A', surface:'#141414', surfaceElev:'#1A1A1A',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textMuted:'#C8C8C8', textSubtle:'#9C9C9C', textFaint:'#6A6A6A',
  yellow:'#FFD500', yellowWarm:'#c8a84b', cyan:'#00D4FF', green:'#00E676',
  magenta:'#FF3B7F', redSystems:'#FF3355', statusWarn:'#FFB300',
};

const STATUS_COLOR: Record<string,string> = {
  Submitted:T.cyan, Accepted:T.yellow, Fulfilled:T.statusWarn,
  Shipped:T.statusWarn, Complete:T.green, Cancelled:T.textFaint, Rejected:T.redSystems,
};
const STATUSES = ['Submitted','Accepted','Fulfilled','Shipped','Complete','Cancelled','Rejected'];

function fmt$(n: number) { return `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`; }
function parseMoney(s: any) { return parseFloat(String(s||0).replace(/[$,]/g,''))||0; }

// Clean duplicated product names from Zoho (e.g. "Hit Stick - ... - Hit Stick - ... - Blueberry Blitz" → "Blueberry Blitz")
function cleanProductName(name: string): {display: string; variant: string|null} {
  if (!name) return {display: '—', variant: null};
  const parts = name.split(' - ');
  if (parts.length >= 4) {
    const half = Math.floor(parts.length / 2);
    const firstHalf = parts.slice(0, half).join(' - ');
    const remainder = parts.slice(half).join(' - ');
    if (remainder.startsWith(firstHalf)) {
      const variant = remainder.slice(firstHalf.length).replace(/^\s*-\s*/, '');
      return variant ? {display: firstHalf, variant} : {display: name, variant: null};
    }
  }
  return {display: name, variant: null};
}

function isUuid(s: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

export async function loader({request, context, params}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({authenticated: false, order: null, org: null, lines: []});

  const id = params.id!;
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  const [orderRes, linesRes] = await Promise.all([
    fetch(`${base}/rest/v1/leaflink_orders?id=eq.${id}&select=*`, {headers: h}),
    fetch(`${base}/rest/v1/leaflink_order_lines?order_id=eq.${id}&order=product_name.asc`, {headers: h}),
  ]);

  const [orderRows, lines] = await Promise.all([orderRes.json(), linesRes.json()]);
  const order = Array.isArray(orderRows) ? (orderRows[0] || null) : null;

  // Fetch org separately to avoid PostgREST join issues
  let org = null;
  if (order?.organization_id) {
    const orgRes = await fetch(`${base}/rest/v1/organizations?id=eq.${order.organization_id}&select=id,name,market_state`, {headers: h});
    const orgRows = await orgRes.json().catch(() => []);
    org = Array.isArray(orgRows) ? (orgRows[0] || null) : null;
  }

  return json({authenticated: true, order, org, lines: Array.isArray(lines) ? lines : []});
}

export default function OrderDetail() {
  const {authenticated, order, org, lines} = useLoaderData<typeof loader>() as any;
  const fetcher = useFetcher();
  const [status, setStatus] = useState(order?.status || '');

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</Link></div>;
  if (!order) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:24,letterSpacing:'0.20em',textTransform:'uppercase'}}>Order not found</div>;

  const sc = STATUS_COLOR[status] || T.textFaint;
  const date = order.order_date
    ? new Date(order.order_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'})
    : '—';
  const lineTotal = lines.reduce((s:number,l:any)=>s+parseMoney(l.line_total),0);
  // Show human-readable order number only if it's not a UUID
  const orderId = order.leaflink_order_id || '';
  const displayOrderNum = isUuid(orderId) ? null : orderId;
  const isManual = order.source === 'manual';

  const saveStatus = (newStatus: string) => {
    setStatus(newStatus);
    const fd = new FormData();
    fd.set('intent','patch_status'); fd.set('order_id',order.id); fd.set('status',newStatus);
    fetcher.submit(fd, {method:'post', action:'/api/order-update'});
  };

  return (
    <div style={{minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif', display:'flex', flexDirection:'column',
      backgroundImage:`radial-gradient(ellipse at top, rgba(255,213,0,0.04) 0%, transparent 55%)`}}>

      <style>{`@keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(0,230,118,.7)}70%{box-shadow:0 0 0 8px rgba(0,230,118,0)}100%{box-shadow:0 0 0 0 rgba(0,230,118,0)}}`}</style>

      {/* Top bar */}
      <div style={{height:64, background:T.bg, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', flexShrink:0}}>
        <div style={{display:'flex', alignItems:'center', gap:20}}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px'}} />
          <div style={{width:1, height:24, background:T.borderStrong}} />
          <div style={{fontFamily:'Teko,sans-serif', fontSize:20, fontWeight:500, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase'}}>SALES FLOOR</div>
        </div>
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${T.yellow},${T.yellowWarm})`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontWeight:700, fontSize:11, fontFamily:'Teko,sans-serif'}}>SL</div>
          <span style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.14em', color:T.text}}>SKY LIMA</span>
        </div>
      </div>

      <div style={{display:'flex', flex:1}}>
        <SalesFloorNav current="Sales Orders" />

        <div style={{flex:1, minWidth:0}}>
          {/* Breadcrumb */}
          <div style={{padding:'16px 32px 0', display:'flex', alignItems:'center', gap:10}}>
            <Link to="/sales-staging/orders" style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textSubtle, textDecoration:'none', textTransform:'uppercase'}}>← Orders</Link>
            {org && <><span style={{color:T.textFaint}}>/</span><Link to={`/sales-staging/account/${org.id}`} style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textFaint, textDecoration:'none', textTransform:'uppercase'}}>{org.name}</Link></>}
          </div>

          {/* Hero */}
          <div style={{padding:'20px 32px 24px', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
            <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:24}}>
              <div style={{flex:1, minWidth:0}}>
                {/* Market + source badge */}
                <div style={{display:'flex', alignItems:'center', gap:8, marginBottom:10}}>
                  <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.16em', padding:'2px 8px', border:`1px solid ${T.borderStrong}`}}>{order.market_state}</span>
                  {isManual && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.statusWarn, letterSpacing:'0.14em', padding:'2px 8px', border:`1px solid ${T.statusWarn}`}}>MANUAL</span>}
                  {displayOrderNum && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, letterSpacing:'0.12em'}}>{displayOrderNum}</span>}
                </div>

                {/* Account name — the primary identifier */}
                {org
                  ? <Link to={`/sales-staging/account/${org.id}`} style={{textDecoration:'none'}}>
                      <h1 style={{margin:'0 0 8px', fontFamily:'Teko,sans-serif', fontSize:48, fontWeight:500, letterSpacing:'0.04em', color:T.text, textTransform:'uppercase', lineHeight:1}}>{org.name}</h1>
                    </Link>
                  : <h1 style={{margin:'0 0 8px', fontFamily:'Teko,sans-serif', fontSize:48, fontWeight:500, letterSpacing:'0.04em', color:T.text, textTransform:'uppercase', lineHeight:1}}>{order.leaflink_customer_name}</h1>
                }

                {/* Date prominently */}
                <div style={{fontFamily:'Teko,sans-serif', fontSize:22, color:T.textMuted, letterSpacing:'0.12em'}}>{date}</div>
                {order.payment_terms && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.12em', marginTop:4}}>{order.payment_terms}</div>}
              </div>

              {/* Total */}
              <div style={{textAlign:'right', flexShrink:0}}>
                <div style={{fontFamily:'Teko,sans-serif', fontSize:52, fontWeight:600, color:T.yellow, letterSpacing:'0.02em', lineHeight:1, textShadow:'0 0 32px rgba(255,213,0,0.20)'}}>
                  {fmt$(parseMoney(order.total_amount))}
                </div>
                <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, marginTop:4, letterSpacing:'0.10em'}}>total</div>
              </div>
            </div>

            {/* Status row */}
            <div style={{marginTop:20, display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
              <span style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginRight:4}}>Status</span>
              {STATUSES.map(s => {
                const col = STATUS_COLOR[s];
                const active = status === s;
                return (
                  <button key={s} onClick={()=>saveStatus(s)}
                    style={{height:30, padding:'0 14px', background:active?`${col}18`:'transparent', border:`1px solid ${active?col:T.borderStrong}`, color:active?col:T.textSubtle, fontFamily:'JetBrains Mono,monospace', fontSize:10.5, letterSpacing:'0.14em', cursor:'pointer', transition:'all 100ms'}}>
                    {s}
                  </button>
                );
              })}
              {fetcher.state === 'submitting' && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.10em'}}>saving…</span>}
            </div>
          </div>

          {/* Line items */}
          <div style={{padding:'0 32px 40px', marginTop:24}}>
            <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
              <div style={{padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
                <span style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.28em', textTransform:'uppercase', color:T.text}}>Line Items</span>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.12em'}}>{lines.length} items</span>
              </div>

              {lines.length === 0 ? (
                <div style={{padding:'24px 20px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>No line items on record</div>
              ) : (
                <table style={{width:'100%', borderCollapse:'collapse'}}>
                  <thead>
                    <tr style={{borderBottom:`1px solid ${T.borderStrong}`}}>
                      {['Product / SKU','Qty','Unit Price','Total'].map((h,i) => (
                        <th key={h} style={{padding:'10px 16px', fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', textAlign:i>=1?'right':'left', fontWeight:400, background:T.surfaceElev}}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((l:any) => {
                      const {display, variant} = cleanProductName(l.product_name);
                      return (
                        <tr key={l.id} style={{borderBottom:`1px solid ${T.border}`}}>
                          <td style={{padding:'14px 16px', maxWidth:400}}>
                            <div style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, lineHeight:1.4}}>
                              {variant
                                ? <><span style={{color:T.textSubtle}}>{display}</span> — <span style={{fontWeight:600}}>{variant}</span></>
                                : <span>{display}</span>
                              }
                            </div>
                            {l.leaflink_sku && (
                              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.06em', marginTop:4}}>{l.leaflink_sku}</div>
                            )}
                          </td>
                          <td style={{padding:'14px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textMuted, textAlign:'right'}}>{Number(l.quantity||0).toLocaleString()}</td>
                          <td style={{padding:'14px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textMuted, textAlign:'right'}}>{l.unit_price ? fmt$(parseMoney(l.unit_price)) : '—'}</td>
                          <td style={{padding:'14px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:13, color:T.text, textAlign:'right', fontWeight:600}}>{l.line_total ? fmt$(parseMoney(l.line_total)) : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{borderTop:`2px solid ${T.borderStrong}`}}>
                      <td colSpan={3} style={{padding:'14px 16px', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', color:T.textSubtle, textAlign:'right', textTransform:'uppercase'}}>Total</td>
                      <td style={{padding:'14px 16px', fontFamily:'Teko,sans-serif', fontSize:22, color:T.yellow, textAlign:'right', fontWeight:600}}>{fmt$(lineTotal || parseMoney(order.total_amount))}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
