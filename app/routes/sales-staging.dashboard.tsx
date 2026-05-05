/**
 * app/routes/sales-staging.dashboard.tsx
 * /sales-staging/dashboard — Command center. Default landing page after login.
 *
 * Sections:
 *   greeting      — time-based (morning/afternoon/evening) + MTD revenue
 *   focus_of_day  — single highest-priority signal, colored by severity
 *   stat_bar      — 6 key numbers with count-up animation
 *   state_pulse   — MTD revenue by market (Accepted + Complete orders)
 *   action_queue  — top 15 prioritized tasks for today
 *   activity_feed — last 12 notes across all accounts
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, Link} from '@remix-run/react';
import {useState, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFUser, hasModule, allowedMarkets} from '~/lib/sf-auth.server';
import type {SFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Dashboard | Sales Floor'},
  {name: 'robots', content: 'noindex'},
];

const T = {
  bg:'#0A0A0A', surface:'#141414', surfaceElev:'#1A1A1A',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textMuted:'#C8C8C8', textSubtle:'#9C9C9C', textFaint:'#6A6A6A',
  yellow:'#FFD500', cyan:'#00D4FF', green:'#00E676',
  magenta:'#FF3B7F', redSystems:'#FF3355', statusWarn:'#FFB300',
};
const TIER_COLOR: Record<string,string> = {A:T.yellow, B:T.cyan, C:T.magenta};
const MARKETS = ['NJ','MO','NY','RI','MA'];

function useCountUp(target:number, duration=1000) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    setVal(0);
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now()-start)/duration, 1);
      setVal(Math.round(target*(1-Math.pow(1-p,3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return val;
}

function StatCell({label, value, sub, accent}: {label:string;value:number;sub?:string;accent:string}) {
  const n = useCountUp(value);
  return (
    <div style={{background:T.bg, padding:'18px 20px'}}>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:10.5,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:4}}>{label}</div>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:40,fontWeight:600,color:accent,lineHeight:0.9}}>{n}</div>
      {sub&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.12em',marginTop:5}}>{sub}</div>}
    </div>
  );
}

type QueueItem = {
  id:string; name:string; market_state:string|null; tier:string|null;
  reason:string; reasonCode:string; priority:number; phone:string|null; href:string;
};

const PRIORITY: Record<string,number> = {
  oos:100, low_inv:80, hot_lead:70,
  past_cadence_tier_a:65, past_cadence_tier_b:55,
  onboarding_stalled:40, new_lead_stale:25,
};

function buildFocus(queue:QueueItem[]):{label:string;cta:string;href:string;color:string}|null {
  if (!queue.length) return null;
  const rc = queue[0].reasonCode;
  const oosCount   = queue.filter(q=>q.reasonCode==='oos').length;
  const lowCount   = queue.filter(q=>q.reasonCode==='low_inv').length;
  const hotCount   = queue.filter(q=>q.reasonCode==='hot_lead').length;
  const pcCount    = queue.filter(q=>q.reasonCode.startsWith('past_cadence')).length;
  const map: Record<string,{label:string;cta:string;href:string;color:string}> = {
    oos:                {label:`${oosCount} account${oosCount!==1?'s':''} out of stock — call before competitors move in`,cta:'View Out of Stock →',href:'/sales-staging/reorders',color:T.redSystems},
    low_inv:            {label:`${lowCount} account${lowCount!==1?'s':''} running low — get a reorder in now`,cta:'View Low Inventory →',href:'/sales-staging/reorders',color:'#FF8A00'},
    hot_lead:           {label:`${hotCount} hot lead${hotCount!==1?'s':''} ready to close — follow up now`,cta:'View Hot Leads →',href:'/sales-staging/leads',color:'#FF6B00'},
    past_cadence_tier_a:{label:`${pcCount} Tier A/B account${pcCount!==1?'s':''} past their reorder cadence — highest value, call first`,cta:'View Reorders Due →',href:'/sales-staging/reorders',color:T.yellow},
    past_cadence_tier_b:{label:`${pcCount} account${pcCount!==1?'s':''} past their reorder cadence this week`,cta:'View Reorders Due →',href:'/sales-staging/reorders',color:T.statusWarn},
    onboarding_stalled: {label:`New accounts need onboarding attention — check their checklist progress`,cta:'View Onboarding →',href:'/sales-staging/onboarding',color:T.cyan},
    new_lead_stale:     {label:`${queue.filter(q=>q.reasonCode==='new_lead_stale').length} new lead${queue.filter(q=>q.reasonCode==='new_lead_stale').length!==1?'s':''} haven't been touched in 5+ days`,cta:'View Leads →',href:'/sales-staging/leads',color:T.textSubtle},
  };
  return map[rc]||null;
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie')||'';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');
  if (sfUser && !hasModule(sfUser, 'dashboard')) return redirect('/sales-staging');

  const h = {apikey:env.SUPABASE_SERVICE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const sbCountH = {...h, 'Prefer':'count=exact', 'Range':'0-0'};
  const base = env.SUPABASE_URL;
  const now = new Date();
  const mtdStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
  const weekStart = new Date(now); weekStart.setDate(now.getDate()-6);
  const weekStartStr = weekStart.toISOString().slice(0,10);
  const stalledDate = new Date(now.getTime()-7*86400000).toISOString().slice(0,10);

  const marketFilter = sfUser ? allowedMarkets(sfUser) : null;
  const mkQ = marketFilter ? `&market_state=in.(${marketFilter.join(',')})` : '';

  // All fetches in one round trip
  const [
    activeCountRes, reorderFlagRes, hotLeadRes, onboardingRes, newLeadRes, weekOrdersRes,
    mtdOrdersRes,
    oosQueueRes, lowInvQueueRes, hotLeadQueueRes, pastCadenceQueueRes, stalledRes,
    notesRes,
    tierAActiveRes, tierATotalRes,
  ] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.active${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?reorder_status=not.is.null&reorder_status=not.in.(healthy)&lifecycle_stage=not.in.(churned)${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect&lead_stage=eq.hot${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?orders_count=eq.1&onboarding_completed_at=is.null&lifecycle_stage=not.in.(churned)${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/sales_orders?order_date=gte.${weekStartStr}&is_sample_order=eq.false&status=in.(Submitted,Accepted,Fulfilled,Shipped,Complete)${mkQ}&select=id`,{headers:sbCountH}),
    // MTD revenue — Accepted + Complete (confirmed + closed) = "booked"
    fetch(`${base}/rest/v1/sales_orders?order_date=gte.${mtdStart}&is_sample_order=eq.false&status=in.(Accepted,Fulfilled,Shipped,Complete)${mkQ}&select=total_amount,market_state`,{headers:h}),
    // Action queue sources
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.out_of_stock&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=5`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.low_inv&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=5`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect&lead_stage=eq.hot${mkQ}&select=id,name,market_state,tier,phone,lead_stage_updated_at&order=lead_stage_updated_at.asc.nullslast&limit=4`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.past_cadence&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=6`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?orders_count=eq.1&onboarding_completed_at=is.null&last_order_date=lte.${stalledDate}&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&limit=3`,{headers:h}),
    // Notes — no join (prevents silent 400 errors); fetch org names separately
    fetch(`${base}/rest/v1/org_notes?select=id,body,channel,author_name,created_at,organization_id&order=created_at.desc&limit=12`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?tier=eq.A&lifecycle_stage=eq.active${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?tier=eq.A${mkQ}&select=id`,{headers:sbCountH}),
  ]);

  const count = (r:Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0;
  const parseArr = async (r:Response) => { try { const d = await r.json(); return Array.isArray(d)?d:[]; } catch { return []; } };

  const [mtdOrders, oosRaw, lowInvRaw, hotLeadRaw, pastCadenceRaw, stalledRaw, notesRaw] = await Promise.all([
    parseArr(mtdOrdersRes), parseArr(oosQueueRes), parseArr(lowInvQueueRes),
    parseArr(hotLeadQueueRes), parseArr(pastCadenceQueueRes), parseArr(stalledRes),
    parseArr(notesRes),
  ]);

  // Fetch org names for notes (batch, by unique org IDs)
  const noteOrgIds = [...new Set(notesRaw.map((n:any)=>n.organization_id).filter(Boolean))];
  let orgNameMap: Record<string,string> = {};
  if (noteOrgIds.length > 0) {
    const orgRes = await fetch(
      `${base}/rest/v1/organizations?id=in.(${noteOrgIds.join(',')})&select=id,name`,
      {headers:h}
    );
    const orgRows: any[] = await parseArr(orgRes);
    for (const o of orgRows) orgNameMap[o.id] = o.name;
  }

  const stats = {
    activeAccounts: count(activeCountRes),
    reordersFlagged: count(reorderFlagRes),
    hotLeads: count(hotLeadRes),
    onboardingActive: count(onboardingRes),
    leadsTotal: count(newLeadRes),
    ordersThisWeek: count(weekOrdersRes),
    tierAActive: count(tierAActiveRes),
    tierATotal: count(tierATotalRes),
  };

  // MTD revenue by state (Accepted + Complete only)
  const statePulse: Record<string,{revenue:number;orders:number}> = {};
  for (const m of MARKETS) statePulse[m] = {revenue:0, orders:0};
  let totalMtdRevenue = 0;
  for (const o of mtdOrders) {
    const s = o.market_state;
    const v = parseFloat(String(o.total_amount||0))||0;
    if (s && statePulse[s]) { statePulse[s].revenue += v; statePulse[s].orders += 1; }
    totalMtdRevenue += v;
  }

  // Build action queue
  const queue: QueueItem[] = [];
  const addQ = (items:any[], reasonCode:string, reason:string) => {
    for (const o of items) {
      const t = o.tier||'';
      const tBonus = t==='A'?30:t==='B'?20:t==='C'?10:0;
      queue.push({id:o.id,name:o.name||'',market_state:o.market_state||null,tier:o.tier||null,reason,reasonCode,priority:(PRIORITY[reasonCode]||50)+tBonus,phone:o.phone||null,href:`/sales-staging/account/${o.id}?from=dashboard`});
    }
  };
  addQ(oosRaw,'oos','Out of Stock');
  addQ(lowInvRaw,'low_inv','Low Inventory');
  for (const o of hotLeadRaw) {
    const daysStale = o.lead_stage_updated_at ? Math.floor((Date.now()-new Date(o.lead_stage_updated_at).getTime())/86400000) : 999;
    addQ([o],'hot_lead',`Hot lead${daysStale>=3?` · ${daysStale}d in stage`:''}`);
  }
  for (const o of pastCadenceRaw) {
    const rc = o.tier==='A'?'past_cadence_tier_a':'past_cadence_tier_b';
    addQ([o],rc,'Past reorder cadence');
  }
  addQ(stalledRaw,'onboarding_stalled','Onboarding stalled 7d+');
  queue.sort((a,b)=>b.priority-a.priority);
  const topQueue = queue.slice(0,15);
  const focus = buildFocus(topQueue);

  // Time-based greeting
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  // Activity
  const activity = notesRaw.map((n:any)=>({
    id:n.id, orgName:orgNameMap[n.organization_id]||'Unknown', orgId:n.organization_id,
    body:n.body?String(n.body).slice(0,130):'', channel:n.channel||'note',
    author:n.author_name||'System', createdAt:n.created_at,
  }));

  return json({authenticated:true,sfUser,stats,statePulse,totalMtdRevenue,topQueue,focus,activity,greeting});
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt$(n:number):string { return '$'+n.toLocaleString('en-US',{maximumFractionDigits:0}); }
function relTime(iso:string):string {
  const d = Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d/60)}h ago`;
  return `${Math.floor(d/1440)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const {authenticated,sfUser,stats,statePulse,totalMtdRevenue,topQueue,focus,activity,greeting} = useLoaderData<typeof loader>() as any;
  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging/login" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← LOG IN</Link></div>;

  const s = stats||{};
  const focusColor = (focus?.color)||T.yellow;
  const name = sfUser?.permissions?.display_name?.split(' ')[0] || '';

  return (
    <SalesFloorLayout current="Dashboard" sfUser={sfUser}>

      {/* ── Greeting + MTD revenue ────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 20px',borderBottom:`1px solid ${T.borderStrong}`,background:`linear-gradient(180deg,rgba(255,213,0,0.04) 0%,transparent 100%)`}}>
        <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}>
          <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:36,fontWeight:500,letterSpacing:'0.06em',color:T.text,textTransform:'uppercase',lineHeight:1}}>
            {greeting}{name?`, ${name}`:''}.
          </h1>
          <div style={{textAlign:'right'}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:3}}>MTD Revenue</div>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:28,fontWeight:600,color:T.yellow,lineHeight:0.9,letterSpacing:'0.06em'}}>{fmt$(totalMtdRevenue||0)}</div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint,marginTop:4}}>Accepted + Complete</div>
          </div>
        </div>
      </div>

      {/* ── Focus of the Day ─────────────────────────────────────────── */}
      {focus && (
        <div style={{padding:'14px 28px',borderBottom:`1px solid ${T.border}`,background:`${focusColor}08`,display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
          <style>{`@keyframes pulse-${focusColor.replace('#','')}{0%{box-shadow:0 0 0 0 ${focusColor}70}70%{box-shadow:0 0 0 8px ${focusColor}00}100%{box-shadow:0 0 0 0 ${focusColor}00}}`}</style>
          <div style={{width:8,height:8,borderRadius:'50%',background:focusColor,flexShrink:0,animation:`pulse-${focusColor.replace('#','')} 2.4s infinite`}}/>
          <div style={{flex:1,fontFamily:'Inter,sans-serif',fontSize:14,color:T.text,lineHeight:1.4}}>{focus.label}</div>
          <Link to={focus.href} style={{height:34,padding:'0 16px',background:focusColor,color:'#000',fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',textDecoration:'none',display:'inline-flex',alignItems:'center',flexShrink:0,whiteSpace:'nowrap'}}>
            {focus.cta}
          </Link>
        </div>
      )}

      {/* ── Stat bar ─────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
        <StatCell label="Active Accounts" value={s.activeAccounts||0} accent={T.text} sub="live accounts"/>
        <StatCell label="Orders This Week" value={s.ordersThisWeek||0} accent={T.green} sub="all statuses"/>
        <StatCell label="Reorders Flagged" value={s.reordersFlagged||0} accent={T.redSystems} sub="need follow-up"/>
        <StatCell label="Hot Leads" value={s.hotLeads||0} accent='#FF6B00' sub="ready to convert"/>
        <StatCell label="Onboarding" value={s.onboardingActive||0} accent={T.cyan} sub="in progress"/>
        <StatCell label="Tier A Active" value={s.tierAActive||0} sub={`of ${s.tierATotal||0} total`} accent={T.yellow}/>
      </div>

      {/* ── State Revenue Pulse ──────────────────────────────────────── */}
      <div style={{padding:'20px 28px',borderBottom:`1px solid ${T.border}`}}>
        <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>State Pulse</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>MTD · Accepted + Complete orders</div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:10}}>
          {MARKETS.map(m=>{
            const p=(statePulse||{})[m]||{revenue:0,orders:0};
            const pct=totalMtdRevenue>0?(p.revenue/totalMtdRevenue)*100:0;
            return (
              <Link key={m} to={`/sales-staging/orders?state=${m}`} style={{textDecoration:'none'}}>
                <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:'14px 12px',cursor:'pointer',transition:'border-color 120ms'}}
                  onMouseEnter={e=>(e.currentTarget.style.borderColor=T.borderStrong)}
                  onMouseLeave={e=>(e.currentTarget.style.borderColor=T.border)}>
                  <div style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,letterSpacing:'0.12em',color:T.yellow,lineHeight:1}}>{m}</div>
                  <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.text,marginTop:6,lineHeight:1}}>{fmt$(p.revenue)}</div>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,marginTop:4}}>{p.orders} order{p.orders!==1?'s':''}</div>
                  <div style={{height:2,background:T.borderStrong,marginTop:8,position:'relative'}}>
                    <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(pct,100)}%`,background:T.yellow}}/>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>

      {/* ── Two-column: Action Queue + Activity ──────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 320px',alignItems:'start'}}>

        {/* Action Queue */}
        <div style={{borderRight:`1px solid ${T.border}`,padding:'20px 28px'}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>Today's Action Queue</div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>{(topQueue||[]).length} task{(topQueue||[]).length!==1?'s':''} · ranked by priority</div>
          </div>
          {(topQueue||[]).length===0&&(
            <div style={{padding:'32px 0',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:16,letterSpacing:'0.20em',color:T.green,textTransform:'uppercase'}}>✓ All clear — no urgent actions today</div>
          )}
          {(topQueue||[]).map((item:any,i:number)=>{
            const rc=item.reasonCode||'';
            const color=rc==='oos'?T.redSystems:rc==='low_inv'?'#FF8A00':rc==='hot_lead'?'#FF6B00':rc.startsWith('past_cadence')?T.yellow:rc==='onboarding_stalled'?T.cyan:T.textSubtle;
            const tc=item.tier?(TIER_COLOR[item.tier]||T.textFaint):null;
            return (
              <div key={item.id} style={{display:'grid',gridTemplateColumns:'4px 1fr auto',borderBottom:`1px solid ${T.border}`,minHeight:52,alignItems:'center'}}>
                <div style={{alignSelf:'stretch',background:color,opacity:0.8}}/>
                <div style={{padding:'10px 14px',minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,minWidth:20}}>{i+1}.</span>
                    <Link to={item.href} style={{fontFamily:'Teko,sans-serif',fontSize:17,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',textDecoration:'none',lineHeight:1}}>
                      {item.name}
                    </Link>
                    {tc&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:tc,letterSpacing:'0.14em'}}>Tier {item.tier}</span>}
                    {item.market_state&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint}}>{item.market_state}</span>}
                  </div>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color,letterSpacing:'0.10em',marginTop:3}}>{item.reason}</div>
                </div>
                <div style={{padding:'10px 12px',display:'flex',gap:5}}>
                  {item.phone&&<a href={`tel:${item.phone}`} style={{height:28,padding:'0 10px',background:'rgba(255,213,0,0.08)',border:`1px solid ${T.yellow}88`,color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.14em',textDecoration:'none',display:'inline-flex',alignItems:'center'}}>CALL</a>}
                  <Link to={item.href} style={{height:28,padding:'0 10px',background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.14em',textDecoration:'none',display:'inline-flex',alignItems:'center'}}>→</Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Activity */}
        <div style={{padding:'20px 20px'}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase',marginBottom:14}}>Recent Activity</div>
          {(activity||[]).length===0&&(
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.10em',lineHeight:1.6}}>No recent notes yet.<br/>Notes added on accounts appear here.</div>
          )}
          {(activity||[]).map((a:any)=>(
            <div key={a.id} style={{borderBottom:`1px solid ${T.border}`,paddingBottom:10,marginBottom:10}}>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                <Link to={`/sales-staging/account/${a.orgId}?from=dashboard`} style={{fontFamily:'Teko,sans-serif',fontSize:13,fontWeight:500,letterSpacing:'0.06em',color:T.yellow,textTransform:'uppercase',textDecoration:'none',lineHeight:1}}>
                  {a.orgName}
                </Link>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.10em',flexShrink:0,marginLeft:8}}>{relTime(a.createdAt)}</span>
              </div>
              <div style={{fontFamily:'Inter,sans-serif',fontSize:11.5,color:T.textMuted,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as any}}>
                {a.body||'—'}
              </div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint,letterSpacing:'0.10em',marginTop:4}}>
                {a.author}
              </div>
            </div>
          ))}
        </div>
      </div>

    </SalesFloorLayout>
  );
}
