/**
 * app/routes/sales-staging.orders.$id.tsx
 * /sales-staging/orders/:id — Sales Order detail
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link} from '@remix-run/react';
import {useState} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction<typeof loader> = ({data}) => [
  {title: `Order ${(data as any)?.order?.leaflink_order_id || ''} | Sales Floor`},
  {name: 'robots', content: 'noindex'},
];

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

export async function loader({request, context, params}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({authenticated: false, order: null, org: null, lines: []});

  const id = params.id!;
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  const [orderRes, linesRes] = await Promise.all([
    fetch(`${base}/rest/v1/leaflink_orders?id=eq.${id}&select=*,organizations(id,name,market_state)`, {headers: h}),
    fetch(`${base}/rest/v1/leaflink_order_lines?order_id=eq.${id}&order=created_at.asc`, {headers: h}),
  ]);

  const [orderRows, lines] = await Promise.all([orderRes.json(), linesRes.json()]);
  const order = orderRows?.[0] || null;
  const org = order?.organizations || null;

  return json({authenticated: true, order, org, lines: Array.isArray(lines) ? lines : []});
}

export default function OrderDetail() {
  const {authenticated, order, org, lines} = useLoaderData<typeof loader>() as any;
  const fetcher = useFetcher();
  const [status, setStatus] = useState(order?.status || '');

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</Link></div>;
  if (!order) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:24,letterSpacing:'0.20em',textTransform:'uppercase'}}>Order not found</div>;

  const sc = STATUS_COLOR[status] || T.textFaint;
  const date = order.order_date ? new Date(order.order_date).toLocaleDateString('en-US',{month:'long',day:'numeric',year:'numeric'}) : '—';
  const lineTotal = lines.reduce((s:number,l:any)=>s+parseMoney(l.line_total),0);

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
          <span style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.14em', color:T.textMuted}}>SKY LIMA</span>
        </div>
      </div>

      <div style={{flex:1, padding:'28px 32px', maxWidth:900, width:'100%', margin:'0 auto'}}>
        {/* Breadcrumb */}
        <div style={{display:'flex', alignItems:'center', gap:10, marginBottom:20}}>
          <Link to="/sales-staging/orders" style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textSubtle, textDecoration:'none', textTransform:'uppercase'}}>← Orders</Link>
          {org && <><span style={{color:T.textFaint}}>/</span><Link to={`/sales-staging/account/${org.id}`} style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textFaint, textDecoration:'none', textTransform:'uppercase'}}>{org.name}</Link></>}
        </div>

        {/* Order header */}
        <div style={{background:T.surface, border:`1px solid ${T.border}`, padding:'24px 28px', marginBottom:20}}>
          <div style={{display:'flex', alignItems:'flex-start', justifyContent:'space-between', gap:20, flexWrap:'wrap'}}>
            <div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.14em', marginBottom:6}}>{order.source?.toUpperCase()} · {order.market_state}</div>
              <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:40, fontWeight:500, letterSpacing:'0.04em', textTransform:'uppercase', lineHeight:1}}>
                {order.leaflink_order_id}
              </h1>
              {org && <div style={{marginTop:8, fontFamily:'Inter,sans-serif', fontSize:14, color:T.textMuted}}><Link to={`/sales-staging/account/${org.id}`} style={{color:T.cyan, textDecoration:'none'}}>{org.name} ↗</Link></div>}
              <div style={{marginTop:6, fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle}}>{date}</div>
            </div>

            <div style={{textAlign:'right'}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:42, fontWeight:600, color:T.yellow, letterSpacing:'0.02em', lineHeight:1}}>{fmt$(parseMoney(order.total_amount))}</div>
              {order.payment_terms && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textSubtle, marginTop:4, letterSpacing:'0.10em'}}>{order.payment_terms}</div>}
            </div>
          </div>

          {/* Status editor */}
          <div style={{marginTop:20, paddingTop:20, borderTop:`1px solid ${T.border}`, display:'flex', alignItems:'center', gap:12}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase'}}>Status</span>
            <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
              {STATUSES.map(s => {
                const col = STATUS_COLOR[s];
                const active = status === s;
                return (
                  <button key={s} onClick={()=>saveStatus(s)}
                    style={{height:28, padding:'0 12px', background:active?`${col}18`:'transparent', border:`1px solid ${active?col:T.borderStrong}`, color:active?col:T.textSubtle, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.14em', cursor:'pointer', transition:'all 100ms'}}>
                    {s}
                  </button>
                );
              })}
            </div>
            {fetcher.state === 'submitting' && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.10em'}}>saving…</span>}
          </div>
        </div>

        {/* Line items */}
        <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
          <div style={{padding:'16px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:16, letterSpacing:'0.28em', textTransform:'uppercase'}}>Line Items</span>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.12em'}}>{lines.length} items</span>
          </div>

          {lines.length === 0 ? (
            <div style={{padding:'24px 20px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.10em'}}>No line items on record</div>
          ) : (
            <>
              <table style={{width:'100%', borderCollapse:'collapse'}}>
                <thead>
                  <tr style={{borderBottom:`1px solid ${T.borderStrong}`}}>
                    {['Product','SKU','Qty','Unit Price','Total'].map((h,i) => (
                      <th key={h} style={{padding:'10px 16px', fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', textAlign:i>=2?'right':'left', fontWeight:400, background:T.surfaceElev}}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l:any) => (
                    <tr key={l.id} style={{borderBottom:`1px solid ${T.border}`}}>
                      <td style={{padding:'12px 16px', fontFamily:'Inter,sans-serif', fontSize:13, color:T.text}}>{l.product_name || '—'}</td>
                      <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.06em'}}>{l.leaflink_sku ? l.leaflink_sku.slice(0,12)+'…' : '—'}</td>
                      <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textMuted, textAlign:'right'}}>{Number(l.quantity||0).toLocaleString()}</td>
                      <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textMuted, textAlign:'right'}}>{l.unit_price ? fmt$(parseMoney(l.unit_price)) : '—'}</td>
                      <td style={{padding:'12px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.text, textAlign:'right', fontWeight:600}}>{l.line_total ? fmt$(parseMoney(l.line_total)) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{borderTop:`2px solid ${T.borderStrong}`}}>
                    <td colSpan={4} style={{padding:'12px 16px', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.20em', color:T.textSubtle, textAlign:'right', textTransform:'uppercase'}}>Total</td>
                    <td style={{padding:'12px 16px', fontFamily:'Teko,sans-serif', fontSize:20, color:T.yellow, textAlign:'right', fontWeight:600}}>{fmt$(lineTotal || parseMoney(order.total_amount))}</td>
                  </tr>
                </tfoot>
              </table>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
