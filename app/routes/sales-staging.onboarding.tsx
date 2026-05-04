/**
 * app/routes/sales-staging.onboarding.tsx
 * /sales-staging/onboarding — New account onboarding feed
 *
 * Shows all accounts with orders_count = 1 (first order placed, onboarding in progress).
 * Progress is tracked via the 12-step onboarding checklist (same as account detail).
 * Once an account reorders (orders_count > 1) it graduates to Reorders Due.
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';
import {useState, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';
import {CardActions} from '~/components/SalesFloorCardActions';
import {ONBOARDING_STEPS, stepsForMarket} from '~/lib/onboarding-steps';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Onboarding | Sales Floor'},
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
const STATES = ['ALL','NJ','MO','NY','RI','MA'];

function daysSince(d:string|null):number|null {
  if (!d) return null;
  return Math.floor((Date.now()-new Date(d).getTime())/86400000);
}
function fmt$(n:number|null):string {
  if (n==null) return '—';
  return '$'+n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0});
}
function useCountUp(target:number,duration=900){
  const [val,setVal]=useState(0);
  useEffect(()=>{
    const start=Date.now();
    const tick=()=>{const p=Math.min((Date.now()-start)/duration,1);setVal(Math.round(target*(1-Math.pow(1-p,3))));if(p<1)requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  },[target]);
  return val;
}
function StatCell({label,value,accent}:{label:string;value:number;accent:string}){
  const n=useCountUp(value);
  return (
    <div style={{background:T.bg,padding:'16px 18px'}}>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:10.5,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:4}}>{label}</div>
      <span style={{fontFamily:'Teko,sans-serif',fontSize:34,fontWeight:600,color:accent,lineHeight:0.9}}>{n}</span>
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────
type OnboardingOrg = {
  id: string;
  name: string;
  market_state: string|null;
  city: string|null;
  phone: string|null;
  website: string|null;
  tier: string|null;
  market_rank: number|null;
  market_total: number|null;
  zoho_account_id: string|null;
  tags: string[];
  last_order_date: string|null;
  last_order_amount: number|null;
  orders_count: number;
  onboarding_steps: Array<{step_key:string; status:string; completed_at:string|null}>;
  // computed
  doneCount: number;
  totalSteps: number;
  pct: number;
  nextStep: string|null;
  stage: 'not_started'|'in_progress'|'complete';
  primary_contact_name: string|null;
  primary_contact_phone: string|null;
  primary_contact_email: string|null;
};

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie')||''))
    return json({authenticated:false, orgs:[], completedCount:0});

  const h = {apikey:env.SUPABASE_SERVICE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const sbCountH = {...h, 'Prefer':'count=exact', 'Range':'0-0'};
  const base = env.SUPABASE_URL;

  // Fetch active onboarding accounts: has orders, not churned, onboarding not yet complete
  const select = [
    'id','name','market_state','city','phone','website','tier',
    'market_rank','market_total','zoho_account_id','tags',
    'last_order_date','last_order_amount','orders_count',
    'onboarding_steps(step_key,status,completed_at)',
    'contacts(id,first_name,last_name,full_name,email,phone,mobile,is_primary_buyer)',
  ].join(',');

  const [res, completedRes] = await Promise.all([
    fetch(
      `${base}/rest/v1/organizations?orders_count=gte.1&lifecycle_stage=not.in.(churned,untargeted)&onboarding_completed_at=is.null&select=${encodeURIComponent(select)}&order=last_order_date.desc&limit=500`,
      {headers: h},
    ),
    // Separate count of all-time completed onboarding (persisted regardless of orders_count)
    fetch(`${base}/rest/v1/organizations?onboarding_completed_at=not.is.null&select=id`, {headers:sbCountH}),
  ]);
  const raw: any[] = await res.json().catch(()=>[]);
  const completedCount = parseInt(completedRes.headers.get('Content-Range')?.split('/')[1]||'0',10)||0;
  if (!Array.isArray(raw)) return json({authenticated:true, orgs:[], completedCount});

  const orgs: OnboardingOrg[] = raw.map(org => {
    const relevantSteps = stepsForMarket(org.market_state);
    const totalSteps = relevantSteps.length;
    const stepsMap = new Map((org.onboarding_steps||[]).map((s:any)=>[s.step_key, s]));
    const doneCount = relevantSteps.filter(s => stepsMap.get(s.key)?.status === 'complete').length;
    const pct = totalSteps > 0 ? (doneCount / totalSteps) * 100 : 0;
    const nextStep = relevantSteps.find(s => stepsMap.get(s.key)?.status !== 'complete')?.label || null;
    const stage: 'not_started'|'in_progress'|'complete' =
      doneCount === 0 ? 'not_started' : doneCount === totalSteps ? 'complete' : 'in_progress';

    const contacts: any[] = Array.isArray(org.contacts) ? org.contacts : [];
    const primary = contacts.find((c:any)=>c.is_primary_buyer) || contacts[0] || null;

    return {
      id: org.id, name: org.name||'',
      market_state: org.market_state||null, city: org.city||null,
      phone: org.phone||null, website: org.website||null,
      tier: org.tier||null, market_rank: org.market_rank??null,
      market_total: org.market_total??null, zoho_account_id: org.zoho_account_id||null,
      tags: Array.isArray(org.tags)?org.tags:[],
      last_order_date: org.last_order_date||null,
      last_order_amount: org.last_order_amount!=null?parseFloat(String(org.last_order_amount)):null,
      orders_count: org.orders_count??0,
      onboarding_steps: org.onboarding_steps||[],
      doneCount, totalSteps, pct, nextStep, stage,
      primary_contact_name: primary?(primary.full_name||`${primary.first_name||''} ${primary.last_name||''}`.trim()||null):null,
      primary_contact_phone: primary?(primary.phone||primary.mobile||null):null,
      primary_contact_email: primary?.email||null,
    };
  });

  return json({authenticated:true, orgs, completedCount});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const {authenticated, orgs, completedCount} = useLoaderData<typeof loader>() as any;
  const [stateFilter, setStateFilter] = useState('ALL');
  const [stageFilter, setStageFilter] = useState<'all'|'not_started'|'in_progress'|'complete'>('all');
  const [sort, setSort] = useState<'newest'|'oldest'>('newest');
  const [search, setSearch] = useState('');

  if (!authenticated) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <a href="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</a>
    </div>
  );

  const allOrgs: OnboardingOrg[] = orgs || [];

  // State-filtered (for stat bar)
  const stateOrgs = stateFilter==='ALL' ? allOrgs : allOrgs.filter(o=>o.market_state===stateFilter);

  // Stat counts — reactive to state filter
  const statTotal = stateOrgs.length;
  const statNotStarted = stateOrgs.filter(o=>o.stage==='not_started').length;
  const statInProgress = stateOrgs.filter(o=>o.stage==='in_progress').length;
  const statComplete   = stateOrgs.filter(o=>o.stage==='complete').length;

  // State counts for tab badges
  const stateCounts: Record<string,number> = {ALL: allOrgs.length};
  for (const s of STATES.slice(1)) stateCounts[s] = allOrgs.filter(o=>o.market_state===s).length;

  // Filtered feed
  let filtered = stateOrgs;
  if (stageFilter !== 'all') filtered = filtered.filter(o=>o.stage===stageFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    filtered = filtered.filter(o=>o.name.toLowerCase().includes(q)||(o.city||'').toLowerCase().includes(q));
  }
  filtered = [...filtered].sort((a,b)=>{
    const ta = new Date(a.last_order_date||0).getTime();
    const tb = new Date(b.last_order_date||0).getTime();
    return sort==='newest' ? tb-ta : ta-tb;
  });

  return (
    <SalesFloorLayout current="Onboarding">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 0',borderBottom:`1px solid ${T.borderStrong}`,background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:36,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase',lineHeight:1}}>Onboarding</h1>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,marginTop:4,letterSpacing:'0.12em'}}>
              {filtered.length} account{filtered.length!==1?'s':''} · {stateFilter!=='ALL'?stateFilter:'all markets'}
            </div>
          </div>
        </div>

        {/* State tabs + search */}
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:1}}>
            {STATES.map(s=>{
              const active=stateFilter===s;
              const n=stateCounts[s]||0;
              return (
                <button key={s} onClick={()=>setStateFilter(s)}
                  style={{height:32,padding:'0 14px',background:active?`rgba(255,213,0,0.08)`:'transparent',border:'none',borderBottom:`2px solid ${active?T.yellow:'transparent'}`,color:active?T.yellow:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.14em',cursor:'pointer'}}>
                  {s}{n>0?' '+n:''}
                </button>
              );
            })}
          </div>
          <div style={{flex:1}}/>
          <div style={{display:'flex',alignItems:'center',gap:0}}>
            <input placeholder="Search by name or city…" value={search} onChange={e=>setSearch(e.target.value)}
              style={{height:32,padding:'0 12px',background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,borderRight:'none',color:T.text,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',width:220,letterSpacing:'0.02em'}}/>
            <button type="button" onClick={search?()=>setSearch(''):undefined}
              style={{height:32,padding:'0 10px',background:search?T.yellow:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:search?'#000':T.textFaint,cursor:'pointer',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'0.10em'}}>
              {search?'✕':'⌕'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat bar ──────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
        <StatCell label="Total"            value={statTotal}            accent={T.text}/>
        <StatCell label="Not Started"      value={statNotStarted}       accent={T.textSubtle}/>
        <StatCell label="In Progress"      value={statInProgress}       accent={T.yellow}/>
        <StatCell label="Active Complete"  value={statComplete}         accent={T.green}/>
        <StatCell label="All-Time Grads"   value={completedCount||0}    accent={T.cyan}/>
      </div>

      {/* ── Stage filter + Sort ────────────────────────────────────────── */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:'10px 28px',background:T.bg,display:'flex',alignItems:'center',gap:8}}>
        {(['all','not_started','in_progress','complete'] as const).map(s=>{
          const active=stageFilter===s;
          const labels={all:'All',not_started:'Not Started',in_progress:'In Progress',complete:'Complete'};
          const n=s==='all'?statTotal:s==='not_started'?statNotStarted:s==='in_progress'?statInProgress:statComplete;
          return (
            <button key={s} onClick={()=>setStageFilter(s)}
              style={{height:30,padding:'0 12px',border:`1px solid ${active?T.textMuted:T.borderStrong}`,color:active?T.text:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',background:'transparent',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
              <span>{labels[s]}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{n}</span>
            </button>
          );
        })}
        <div style={{marginLeft:'auto'}}>
          <select value={sort} onChange={e=>setSort(e.target.value as any)}
            style={{height:30,padding:'0 10px',background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:T.text,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.14em',cursor:'pointer',outline:'none'}}>
            <option value="newest">Sort: Newest First</option>
            <option value="oldest">Sort: Oldest First</option>
          </select>
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────── */}
      <div style={{background:T.bg,flex:1}}>
        {filtered.length===0&&(
          <div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>
            No accounts in onboarding
          </div>
        )}
        {filtered.map(org=><OnboardingCard key={org.id} org={org}/>)}
      </div>

      <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>
          END OF LIST · {filtered.length} ACCOUNT{filtered.length!==1?'S':''}
        </div>
      </div>
    </SalesFloorLayout>
  );
}

// ─── Onboarding Card ──────────────────────────────────────────────────────────
function OnboardingCard({org}: {org: OnboardingOrg}) {
  const [logoFailed, setLogoFailed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const tc = org.tier ? (TIER_COLOR[org.tier]||T.textFaint) : null;
  const days = daysSince(org.last_order_date);

  // Rail color by stage
  const railColor = org.stage==='complete' ? T.green : org.stage==='in_progress' ? T.yellow : T.textFaint;
  const railOpacity = org.stage==='not_started' ? 0.2 : 0.8;

  const domain = org.website ? (()=>{try{return new URL(org.website.startsWith('http')?org.website:`https://${org.website}`).hostname.replace(/^www\./,'');}catch{return null;}})():null;
  const initials = (org.name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');
  const phone = org.phone || org.primary_contact_phone;
  const email = org.primary_contact_email;
  const isFlagged = (org.tags||[]).includes('pete-followup');

  return (
    <div
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{background:hovered?T.surfaceElev:T.surface,borderTop:`1px solid ${T.border}`,transition:'background 120ms'}}>

      <div style={{display:'grid',gridTemplateColumns:'4px 56px 1fr 130px 200px',alignItems:'center',gap:0,minHeight:76}}>

        {/* Stage rail */}
        <div style={{alignSelf:'stretch',background:railColor,opacity:railOpacity}}/>

        {/* Logo */}
        <div style={{padding:'12px 0 12px 16px'}}>
          <div style={{width:40,height:40,background:'#000',border:`1px solid ${T.borderStrong}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
            {domain&&!logoFailed
              ?<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={org.name} onError={()=>setLogoFailed(true)} style={{width:26,height:26,objectFit:'contain'}}/>
              :<span style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,color:T.textSubtle,letterSpacing:'0.05em'}}>{initials}</span>}
          </div>
        </div>

        {/* Identity */}
        <div style={{padding:'12px 20px 12px 14px',minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <a href={`/sales-staging/account/${org.id}`}
              style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1,textDecoration:'none'}}>
              {org.name}
            </a>
            {isFlagged&&<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 6px',border:`1px solid ${T.magenta}`,color:T.magenta,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase'}}>PETE</span>}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textMuted,letterSpacing:'0.04em',flexWrap:'wrap'}}>
            <span>{org.market_state}{org.city?` · ${org.city}`:''}</span>
            {tc&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:tc}}>Tier {org.tier}</span></>}
            {org.market_rank&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:T.cyan}}>#{org.market_rank} {org.market_state}</span></>}
          </div>
          {/* Next step */}
          {org.nextStep&&org.stage!=='complete'&&(
            <div style={{marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.yellow,letterSpacing:'0.10em',display:'flex',alignItems:'center',gap:5}}>
              <span style={{color:T.borderStrong}}>→</span>
              <span>{org.nextStep}</span>
            </div>
          )}
          {org.stage==='complete'&&(
            <div style={{marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.green,letterSpacing:'0.10em'}}>✓ Onboarding complete</div>
          )}
          {/* Contact */}
          {(org.primary_contact_name||phone||email)&&(
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>
              {org.primary_contact_name&&<span style={{color:T.textSubtle}}>{org.primary_contact_name}</span>}
              {phone&&<span>{phone}</span>}
            </div>
          )}
        </div>

        {/* Order / days */}
        <div style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center'}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:2}}>First order</div>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.yellow,lineHeight:0.95}}>{fmt$(org.last_order_amount)}</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,marginTop:3}}>
            {days!==null?`${days}d ago`:org.last_order_date?new Date(org.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}):'—'}
          </div>
        </div>

        {/* Progress */}
        <div style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',gap:6}}>
          <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase'}}>Progress</div>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:org.stage==='complete'?T.green:T.textSubtle}}>
              {org.doneCount}/{org.totalSteps}
            </span>
          </div>
          {/* Progress bar */}
          <div style={{height:4,background:T.surfaceElev,position:'relative',borderRadius:2}}>
            <div style={{position:'absolute',left:0,top:0,bottom:0,width:`${org.pct}%`,background:org.stage==='complete'?T.green:T.yellow,borderRadius:2,transition:'width 300ms'}}/>
          </div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.08em'}}>
            {Math.round(org.pct)}% complete
          </div>
        </div>
      </div>

      {/* Action row */}
      <CardActions
        phone={phone}
        email={email}
        isFlagged={isFlagged}
        orgId={org.id}
      />
    </div>
  );
}
