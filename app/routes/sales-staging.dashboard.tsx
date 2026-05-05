/**
 * app/routes/sales-staging.dashboard.tsx
 * /sales-staging/dashboard — Command center dashboard
 *
 * Sections (permission-gated via hasModule):
 *   focus_of_day  — priority engine: most urgent thing right now
 *   stat_bar      — 6 key numbers, count-up animation
 *   state_pulse   — MTD revenue by market
 *   action_queue  — top 15 prioritized tasks for today
 *   activity_feed — last 15 notes/events across all accounts
 *   market_intel  — Tier A penetration + opportunity callout
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

// ─── Design tokens ────────────────────────────────────────────────────────────
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
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now()-start)/duration, 1);
      setVal(Math.round(target*(1-Math.pow(1-p,3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

function StatCell({label, value, sub, accent}: {label:string;value:number;sub?:string;accent:string}) {
  const n = useCountUp(value);
  return (
    <div style={{background:T.bg, padding:'18px 20px'}}>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:10.5,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:4}}>{label}</div>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:40,fontWeight:600,color:accent,lineHeight:0.9,textShadow:accent===T.yellow?'0 0 30px rgba(255,213,0,0.15)':'none'}}>{n}</div>
      {sub&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.12em',marginTop:5}}>{sub}</div>}
    </div>
  );
}

// ─── Priority engine ──────────────────────────────────────────────────────────
type QueueItem = {
  id: string;
  name: string;
  market_state: string|null;
  tier: string|null;
  reason: string;
  reasonCode: string;
  priority: number;
  phone: string|null;
  href: string;
};

const PRIORITY: Record<string,number> = {
  oos:                100,
  low_inv:             80,
  hot_lead:            70,
  past_cadence_tier_a: 65,
  past_cadence_tier_b: 55,
  onboarding_stalled:  40,
  new_lead_stale:      25,
};

function buildFocus(queue: QueueItem[]): {label:string; cta:string; href:string; color:string} | null {
  if (!queue.length) return null;
  const top = queue[0];
  const map: Record<string,{label:string;cta:string;href:string;color:string}> = {
    oos:                {label:`${queue.filter(q=>q.reasonCode==='oos').length} account${queue.filter(q=>q.reasonCode==='oos').length!==1?'s':''} ran out of stock — call before competitors move in`,cta:'View Out of Stock',href:'/sales-staging/reorders?flag=out_of_stock',color:T.redSystems},
    low_inv:            {label:`${queue.filter(q=>q.reasonCode==='low_inv').length} account${queue.filter(q=>q.reasonCode==='low_inv').length!==1?'s':''} running low — get a reorder in before they go dark`,cta:'View Low Inventory',href:'/sales-staging/reorders?flag=low_inv',color:'#FF8A00'},
    hot_lead:           {label:`Hot lead${queue.filter(q=>q.reasonCode==='hot_lead').length!==1?'s':''} going cold — follow up now before momentum dies`,cta:'View Hot Leads',href:'/sales-staging/leads?stage=hot',color:'#FF6B00'},
    past_cadence_tier_a:{label:`${queue.filter(q=>q.reasonCode==='past_cadence_tier_a').length} Tier A account${queue.filter(q=>q.reasonCode==='past_cadence_tier_a').length!==1?'s':''} overdue for a reorder — highest value, call first`,cta:'View Reorders Due',href:'/sales-staging/reorders?flag=past_cadence',color:T.yellow},
    past_cadence_tier_b:{label:`${queue.filter(q=>q.reasonCode.startsWith('past_cadence')).length} accounts past their reorder cadence this week`,cta:'View Reorders Due',href:'/sales-staging/reorders',color:T.statusWarn},
    onboarding_stalled: {label:`New accounts need onboarding attention — check their checklist progress`,cta:'View Onboarding',href:'/sales-staging/onboarding',color:T.cyan},
    new_lead_stale:     {label:`${queue.filter(q=>q.reasonCode==='new_lead_stale').length} new lead${queue.filter(q=>q.reasonCode==='new_lead_stale').length!==1?'s':''} haven't been touched in 5+ days`,cta:'View Leads',href:'/sales-staging/leads',color:T.textSubtle},
  };
  return map[top.reasonCode] || null;
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
  const weekStart = new Date(now); weekStart.setDate(now.getDate()-6); const weekStartStr = weekStart.toISOString().slice(0,10);

  // Market filter for multi-market reps
  const marketFilter = sfUser ? allowedMarkets(sfUser) : null;
  const mkQ = marketFilter ? `&market_state=in.(${marketFilter.join(',')})` : '';

  const [
    activeCountRes, reorderFlagRes, hotLeadRes, onboardingRes, newLeadRes,
    mtdOrdersRes, weekOrdersRes,
    oosQueueRes, lowInvQueueRes, hotLeadQueueRes, pastCadenceQueueRes, onboardingStalledRes,
    activityRes,
    tierAActiveRes, tierATotalRes,
  ] = await Promise.all([
    // Counts
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.active${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?reorder_status=not.in.(healthy)&reorder_status=not.is.null&lifecycle_stage=not.in.(churned)${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect&lead_stage=eq.hot${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?orders_count=eq.1&onboarding_completed_at=is.null&lifecycle_stage=not.in.(churned)${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect${mkQ}&select=id`,{headers:sbCountH}),
    // Revenue
    fetch(`${base}/rest/v1/sales_orders?order_date=gte.${mtdStart}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)${mkQ}&select=total_amount,market_state`,{headers:h}),
    fetch(`${base}/rest/v1/sales_orders?order_date=gte.${weekStartStr}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)${mkQ}&select=id`,{headers:sbCountH}),
    // Action queue
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.out_of_stock&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=5`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.low_inv&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=5`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect&lead_stage=eq.hot${mkQ}&select=id,name,market_state,tier,phone,lead_stage_updated_at&order=lead_stage_updated_at.asc.nullslast&limit=3`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?reorder_status=eq.past_cadence&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&order=tier.asc.nullslast&limit=5`,{headers:h}),
    fetch(`${base}/rest/v1/organizations?orders_count=eq.1&onboarding_completed_at=is.null&last_order_date=lte.${new Date(now.getTime()-7*86400000).toISOString().slice(0,10)}&lifecycle_stage=not.in.(churned)${mkQ}&select=id,name,market_state,tier,phone&limit=3`,{headers:h}),
    // Activity feed
    fetch(`${base}/rest/v1/org_notes?select=id,body,channel,author_name,created_at,organization_id,organizations(name)&order=created_at.desc&limit=12`,{headers:h}),
    // Tier A penetration
    fetch(`${base}/rest/v1/organizations?tier=eq.A&lifecycle_stage=eq.active${mkQ}&select=id`,{headers:sbCountH}),
    fetch(`${base}/rest/v1/organizations?tier=eq.A${mkQ}&select=id`,{headers:sbCountH}),
  ]);

  const count = (r:Response) => parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0;
  const parseArr = async (r:Response) => { const d = await r.json().catch(()=>[]); return Array.isArray(d)?d:[]; };

  const [
    mtdOrders, weekOrders,
    oosRaw, lowInvRaw, hotLeadRaw, pastCadenceRaw, stalledRaw,
    activityRaw,
  ] = await Promise.all([
    parseArr(mtdOrdersRes), parseArr(weekOrdersRes),
    parseArr(oosQueueRes), parseArr(lowInvQueueRes), parseArr(hotLeadQueueRes), parseArr(pastCadenceQueueRes), parseArr(onboardingStalledRes),
    parseArr(activityRes),
  ]);

  // Counts
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

  // MTD revenue by state
  const statePulse: Record<string,{revenue:number;orders:number}> = {};
  for (const m of MARKETS) statePulse[m] = {revenue:0, orders:0};
  let totalMtdRevenue = 0;
  for (const o of mtdOrders) {
    const s = o.market_state; const v = parseFloat(String(o.total_amount||0))||0;
    if (s && statePulse[s]) { statePulse[s].revenue += v; statePulse[s].orders += 1; }
    totalMtdRevenue += v;
  }

  // Build action queue
  const queue: QueueItem[] = [];
  const addQ = (items:any[], reasonCode:string, reason:string, tierBonus=0) => {
    for (const o of items) {
      const t = o.tier||'';
      const tBonus = t==='A'?30:t==='B'?20:t==='C'?10:0;
      queue.push({
        id:o.id, name:o.name||'', market_state:o.market_state||null,
        tier:o.tier||null, reason, reasonCode,
        priority: (PRIORITY[reasonCode]||50)+tBonus+tierBonus,
        phone:o.phone||null,
        href:`/sales-staging/account/${o.id}`,
      });
    }
  };

  addQ(oosRaw, 'oos', 'Out of Stock');
  addQ(lowInvRaw, 'low_inv', 'Low Inventory');
  for (const o of hotLeadRaw) {
    const daysStale = o.lead_stage_updated_at ? Math.floor((Date.now()-new Date(o.lead_stage_updated_at).getTime())/86400000) : 999;
    const rc = daysStale >= 3 ? 'hot_lead' : 'hot_lead';
    addQ([o], rc, `Hot lead${daysStale>=3?` · ${daysStale}d in stage`:''}`, 0);
  }
  for (const o of pastCadenceRaw) {
    const rc = o.tier==='A'?'past_cadence_tier_a':o.tier==='B'?'past_cadence_tier_b':'past_cadence_tier_b';
    addQ([o], rc, 'Past reorder cadence', 0);
  }
  addQ(stalledRaw, 'onboarding_stalled', 'Onboarding stalled 7d+');

  queue.sort((a,b) => b.priority - a.priority);
  const topQueue = queue.slice(0, 15);
  const focus = buildFocus(topQueue);

  // Activity feed
  const activity = activityRaw.map((n:any) => ({
    id: n.id,
    orgName: (n.organizations as any)?.name || 'Unknown',
    orgId: n.organization_id,
    body: n.body ? String(n.body).slice(0,120) : '',
    channel: n.channel||'note',
    author: n.author_name||'System',
    createdAt: n.created_at,
  }));

  return json({authenticated:true, sfUser, stats, statePulse, totalMtdRevenue, topQueue, focus, activity});
}

// ─── Component ────────────────────────────────────────────────────────────────
function fmt$(n:number):string { return '$'+n.toLocaleString('en-US',{maximumFractionDigits:0}); }
function relTime(iso:string):string {
  const d = Math.floor((Date.now()-new Date(iso).getTime())/60000);
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d/60)}h ago`;
  return `${Math.floor(d/1440)}d ago`;
}

export default function DashboardPage() {
  const {authenticated, sfUser, stats, statePulse, totalMtdRevenue, topQueue, focus, activity} = useLoaderData<typeof loader>() as any;

  if (!authenticated) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <Link to="/sales-staging/login" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← LOG IN</Link>
    </div>
  );

  const s = stats||{};
  const tierAPct = s.tierATotal>0?Math.round((s.tierAActive/s.tierATotal)*100):0;
  const today = new Date().toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'});

  return (
    <SalesFloorLayout current="Dashboard" sfUser={sfUser}>
      <div style={{padding:'0'}}>

        {/* ── Page header ──────────────────────────────────────────────── */}
        <div className="hs-sweep" style={{padding:'20px 28px 20px',borderBottom:`1px solid ${T.borderStrong}`,background:`linear-gradient(180deg,rgba(255,213,0,0.04) 0%,transparent 100%)`}}>
          <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between'}}>
            <div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.24em',color:T.textFaint,textTransform:'uppercase',marginBottom:6}}>{today}</div>
              <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:36,fontWeight:500,letterSpacing:'0.06em',color:T.text,textTransform:'uppercase',lineHeight:1}}>
                Good morning{sfUser?.permissions?.display_name ? `, ${sfUser.permissions.display_name.split(' ')[0]}` : ''}.
              </h1>
            </div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em',textAlign:'right'}}>
              <div>MTD Revenue</div>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.yellow,letterSpacing:'0.08em'}}>{fmt$(totalMtdRevenue||0)}</div>
            </div>
          </div>
        </div>

        {/* ── Focus of the Day ─────────────────────────────────────────── */}
        {focus && (
          <div style={{padding:'16px 28px',borderBottom:`1px solid ${T.border}`,background:`${focus.color}08`}}>
            <div style={{display:'flex',alignItems:'center',gap:16,flexWrap:'wrap'}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:focus.color,boxShadow:`0 0 10px ${focus.color}`,flexShrink:0,animation:'pulse-ring 2.4s infinite'}}/>
              <div style={{flex:1,fontFamily:'Inter,sans-serif',fontSize:14,color:T.text,lineHeight:1.4}}>{focus.label}</div>
              <Link to={focus.href}
                style={{height:34,padding:'0 16px',background:focus.color,color:'#000',fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',textDecoration:'none',display:'inline-flex',alignItems:'center',flexShrink:0}}>
                {focus.cta} →
              </Link>
            </div>
          </div>
        )}

        {/* ── Stat bar ─────────────────────────────────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
          <StatCell label="Active Accounts" value={s.activeAccounts||0} accent={T.text} sub="live accounts"/>
          <StatCell label="Orders This Week" value={s.ordersThisWeek||0} accent={T.green} sub="confirmed+closed"/>
          <StatCell label="Reorders Flagged" value={s.reordersFlagged||0} accent={T.redSystems} sub="need follow-up"/>
          <StatCell label="Hot Leads" value={s.hotLeads||0} accent='#FF6B00' sub="ready to convert"/>
          <StatCell label="Onboarding" value={s.onboardingActive||0} accent={T.cyan} sub="in progress"/>
          <StatCell label="Tier A Coverage" value={tierAPct} sub={`${s.tierAActive||0}/${s.tierATotal||0} accounts`} accent={T.yellow}/>
        </div>

        {/* ── Two-column body ──────────────────────────────────────────── */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 340px',gap:0,alignItems:'start'}}>

          {/* LEFT: State Pulse + Action Queue */}
          <div style={{borderRight:`1px solid ${T.border}`}}>

            {/* State Revenue Pulse */}
            <div style={{borderBottom:`1px solid ${T.border}`,padding:'20px 28px'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>State Pulse</div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>MTD · Confirmed+Closed</div>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:8}}>
                {MARKETS.map(m => {
                  const p = (statePulse||{})[m] || {revenue:0,orders:0};
                  const pct = totalMtdRevenue>0 ? (p.revenue/totalMtdRevenue)*100 : 0;
                  return (
                    <Link key={m} to={`/sales-staging/orders?state=${m}`} style={{textDecoration:'none'}}>
                      <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:'14px 12px',cursor:'pointer'}}>
                        <div style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,letterSpacing:'0.12em',color:T.yellow,lineHeight:1}}>{m}</div>
                        <div style={{fontFamily:'Teko,sans-serif',fontSize:20,fontWeight:600,color:T.text,marginTop:6,lineHeight:1}}>{fmt$(p.revenue)}</div>
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

            {/* Prioritized Action Queue */}
            <div style={{padding:'20px 28px'}}>
              <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',marginBottom:14}}>
                <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>Today's Action Queue</div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>{(topQueue||[]).length} tasks · ranked by priority</div>
              </div>

              {(topQueue||[]).length === 0 && (
                <div style={{padding:'32px 0',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:16,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>
                  ✓ All clear — no urgent actions
                </div>
              )}

              {(topQueue||[]).map((item:any, i:number) => {
                const rc = item.reasonCode||'';
                const color = rc==='oos'?T.redSystems:rc==='low_inv'?'#FF8A00':rc==='hot_lead'?'#FF6B00':rc.startsWith('past_cadence')?T.yellow:rc==='onboarding_stalled'?T.cyan:T.textSubtle;
                const tc = item.tier ? (TIER_COLOR[item.tier]||T.textFaint) : null;
                return (
                  <div key={item.id} style={{display:'grid',gridTemplateColumns:'4px 1fr auto',gap:0,borderBottom:`1px solid ${T.border}`,minHeight:52,alignItems:'center'}}>
                    <div style={{alignSelf:'stretch',background:color,opacity:0.8}}/>
                    <div style={{padding:'10px 14px',minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.10em',minWidth:18}}>{i+1}.</span>
                        <Link to={item.href} style={{fontFamily:'Teko,sans-serif',fontSize:17,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',textDecoration:'none',lineHeight:1}}>
                          {item.name}
                        </Link>
                        {tc&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:tc,letterSpacing:'0.14em'}}>Tier {item.tier}</span>}
                        {item.market_state&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint,letterSpacing:'0.10em'}}>{item.market_state}</span>}
                      </div>
                      <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color,letterSpacing:'0.10em',marginTop:3}}>{item.reason}</div>
                    </div>
                    <div style={{padding:'10px 14px',display:'flex',gap:6}}>
                      {item.phone&&<a href={`tel:${item.phone}`} style={{height:28,padding:'0 10px',background:'rgba(255,213,0,0.08)',border:`1px solid ${T.yellow}88`,color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.16em',textDecoration:'none',display:'inline-flex',alignItems:'center'}}>CALL</a>}
                      <Link to={item.href} style={{height:28,padding:'0 10px',background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.16em',textDecoration:'none',display:'inline-flex',alignItems:'center'}}>→</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT: Activity Feed */}
          <div>
            <div style={{padding:'20px 24px',borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase',marginBottom:14}}>Recent Activity</div>

              {(activity||[]).length === 0 && (
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.10em',padding:'16px 0'}}>No recent activity</div>
              )}

              {(activity||[]).map((a:any) => (
                <div key={a.id} style={{borderBottom:`1px solid ${T.border}`,padding:'10px 0'}}>
                  <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:3}}>
                    <Link to={`/sales-staging/account/${a.orgId}`}
                      style={{fontFamily:'Teko,sans-serif',fontSize:13,fontWeight:500,letterSpacing:'0.06em',color:T.yellow,textTransform:'uppercase',textDecoration:'none',lineHeight:1}}>
                      {a.orgName}
                    </Link>
                    <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.10em',flexShrink:0,marginLeft:8}}>
                      {relTime(a.createdAt)}
                    </span>
                  </div>
                  <div style={{fontFamily:'Inter,sans-serif',fontSize:11.5,color:T.textMuted,lineHeight:1.4,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' as any}}>
                    {a.body||'—'}
                  </div>
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint,letterSpacing:'0.10em',marginTop:4}}>
                    {a.author} · {a.channel?.toUpperCase()||'NOTE'}
                  </div>
                </div>
              ))}
            </div>

            {/* Market Intel Callout */}
            <div style={{padding:'20px 24px'}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:16,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase',marginBottom:14}}>Market Intel</div>
              <div style={{background:T.surface,border:`1px solid ${T.border}`,padding:'14px 16px',marginBottom:10}}>
                <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:6}}>Tier A Coverage</div>
                <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                  <span style={{fontFamily:'Teko,sans-serif',fontSize:32,fontWeight:600,color:T.yellow,lineHeight:0.9}}>{tierAPct}%</span>
                  <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{s.tierAActive}/{s.tierATotal} active</span>
                </div>
                <div style={{height:3,background:T.borderStrong,marginTop:10,position:'relative'}}>
                  <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${Math.min(tierAPct,100)}%`,background:T.yellow}}/>
                </div>
                {s.tierATotal-s.tierAActive > 0 && (
                  <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,marginTop:8,letterSpacing:'0.08em'}}>
                    {s.tierATotal-s.tierAActive} Tier A accounts not yet active
                  </div>
                )}
              </div>
              <Link to="/sales-staging?stage=untargeted" style={{fontFamily:'Teko,sans-serif',fontSize:12,letterSpacing:'0.16em',color:T.cyan,textTransform:'uppercase',textDecoration:'none',display:'inline-flex',alignItems:'center',gap:5}}>
                View untargeted Tier A accounts →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </SalesFloorLayout>
  );
}
