/**
 * app/routes/sales-staging.leads.tsx
 * /sales-staging/leads — Sales leads pipeline
 *
 * Shows all accounts with lifecycle_stage = 'prospect'.
 * Lead stage (sub-stage): new → working → warm → hot
 * Sorted by lead_stage_updated_at DESC — stage changes bump account to top.
 *
 * Conversion: prospect + first order → lifecycle becomes 'active' + 'closed-lead' tag (via recalcOrgAfterOrder)
 * Disqualified: lifecycle → 'disqualified', removed from feed
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {useState, useEffect, useCallback, useRef} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';
import {CardActions, PhoneI, MailI} from '~/components/SalesFloorCardActions';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Leads | Sales Floor'},
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

// Lead stage config — sub-stages within lifecycle = 'prospect'
const LEAD_STAGES: Record<string,{label:string; color:string}> = {
  new:    {label:'New Lead', color:T.textSubtle},
  working:{label:'Working',  color:T.cyan},
  warm:   {label:'Warm',     color:T.statusWarn},
  hot:    {label:'Hot',      color:'#FF6B00'},
};
const LEAD_STAGE_ORDER = ['new','working','warm','hot'];

function daysSince(d:string|null):number|null {
  if (!d) return null;
  return Math.floor((Date.now()-new Date(d).getTime())/86400000);
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

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie')||'';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) {
    const {redirect: redir} = await import('@shopify/remix-oxygen');
    return redir('/sales-staging/login');
  }

  const h = {apikey:env.SUPABASE_SERVICE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const sbCountH = {...h, 'Prefer':'count=exact', 'Range':'0-0'};
  const base = env.SUPABASE_URL;

  const select = [
    'id','name','market_state','city','phone','website','tier','market_rank','market_total',
    'zoho_account_id','tags','last_order_date','orders_count','lead_stage','lead_stage_updated_at','updated_at',
    'contacts(id,first_name,last_name,full_name,email,phone,mobile,is_primary_buyer)',
  ].join(',');

  const [leadsRes, closedRes] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.prospect&select=${encodeURIComponent(select)}&order=lead_stage_updated_at.desc.nullslast,updated_at.desc&limit=500`, {headers:h}),
    // Closed = accounts tagged 'closed-lead' (converted from leads pipeline)
    fetch(`${base}/rest/v1/organizations?tags=cs.{closed-lead}&select=id`, {headers:sbCountH}),
  ]);

  const raw: any[] = await leadsRes.json().catch(()=>[]);
  const closedCount = parseInt(closedRes.headers.get('Content-Range')?.split('/')[1]||'0',10)||0;
  if (!Array.isArray(raw)) return json({authenticated:true, leads:[], closedCount});

  const leads = raw.map(org => {
    const contacts: any[] = Array.isArray(org.contacts) ? org.contacts : [];
    const primary = contacts.find((c:any)=>c.is_primary_buyer)||contacts[0]||null;
    return {
      id: org.id, name: org.name||'',
      market_state: org.market_state||null, city: org.city||null,
      phone: org.phone||null, website: org.website||null,
      tier: org.tier||null, market_rank: org.market_rank??null,
      market_total: org.market_total??null,
      zoho_account_id: org.zoho_account_id||null,
      tags: Array.isArray(org.tags)?org.tags:[],
      lead_stage: org.lead_stage||'new',
      lead_stage_updated_at: org.lead_stage_updated_at||org.updated_at||null,
      last_order_date: org.last_order_date||null,
      orders_count: org.orders_count??0,
      primary_contact_name: primary?(primary.full_name||`${primary.first_name||''} ${primary.last_name||''}`.trim()||null):null,
      primary_contact_phone: primary?(primary.phone||primary.mobile||null):null,
      primary_contact_email: primary?.email||null,
    };
  });

  return json({authenticated:true, sfUser, leads, closedCount});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const {authenticated, sfUser, leads, closedCount} = useLoaderData<typeof loader>() as any;
  const [stateFilter, setStateFilter] = useState('ALL');
  const [stageFilter, setStageFilter] = useState('all');
  const [search, setSearch] = useState('');

  if (!authenticated) return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}>
      <a href="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</a>
    </div>
  );

  const allLeads: any[] = leads||[];

  // State-filtered for stat bar
  const stateLeads = stateFilter==='ALL' ? allLeads : allLeads.filter((l:any)=>l.market_state===stateFilter);

  const statTotal   = stateLeads.length;
  const statNew     = stateLeads.filter((l:any)=>l.lead_stage==='new').length;
  const statWorking = stateLeads.filter((l:any)=>l.lead_stage==='working').length;
  const statWarm    = stateLeads.filter((l:any)=>l.lead_stage==='warm').length;
  const statHot     = stateLeads.filter((l:any)=>l.lead_stage==='hot').length;

  const stateCounts: Record<string,number> = {ALL:allLeads.length};
  for (const s of STATES.slice(1)) stateCounts[s]=allLeads.filter((l:any)=>l.market_state===s).length;

  let filtered = stateLeads;
  if (stageFilter!=='all') filtered=filtered.filter((l:any)=>l.lead_stage===stageFilter);
  if (search.trim()) {
    const q=search.toLowerCase();
    filtered=filtered.filter((l:any)=>l.name.toLowerCase().includes(q)||(l.city||'').toLowerCase().includes(q));
  }

  return (
    <SalesFloorLayout current="Leads" sfUser={sfUser}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 0',borderBottom:`1px solid ${T.borderStrong}`,background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
          <div>
            <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:36,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase',lineHeight:1}}>Leads</h1>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,marginTop:4,letterSpacing:'0.12em'}}>
              {filtered.length} prospect{filtered.length!==1?'s':''} · sorted by most recently updated
            </div>
          </div>
        </div>
        {/* State tabs + search */}
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{display:'flex',gap:1}}>
            {STATES.map(s=>{
              const active=stateFilter===s; const n=stateCounts[s]||0;
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
              style={{height:32,padding:'0 10px',background:search?T.yellow:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:search?'#000':T.textFaint,cursor:'pointer',fontFamily:'JetBrains Mono,monospace',fontSize:10}}>
              {search?'✕':'⌕'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat bar ────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
        <StatCell label="Total Prospects" value={statTotal}   accent={T.text}/>
        <StatCell label="New Lead"         value={statNew}    accent={T.textSubtle}/>
        <StatCell label="Working"          value={statWorking} accent={T.cyan}/>
        <StatCell label="Warm"             value={statWarm}   accent={T.statusWarn}/>
        <StatCell label="Hot"              value={statHot}    accent='#FF6B00'/>
        <StatCell label="Disqualified"     value={stateLeads.filter((l:any)=>false).length} accent={T.textFaint}/>
        <StatCell label="Closed (all-time)" value={closedCount||0} accent={T.green}/>
      </div>

      {/* ── Stage filter ────────────────────────────────────────────── */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:'10px 28px',background:T.bg,display:'flex',alignItems:'center',gap:8}}>
        {[
          {k:'all',   label:'All',      n:stateLeads.length, color:T.yellow},
          {k:'new',   label:'New Lead', n:statNew,     color:T.textSubtle},
          {k:'working',label:'Working', n:statWorking, color:T.cyan},
          {k:'warm',  label:'Warm',     n:statWarm,    color:T.statusWarn},
          {k:'hot',   label:'Hot',      n:statHot,     color:'#FF6B00'},
        ].map(f=>{
          const active=stageFilter===f.k;
          return (
            <button key={f.k} onClick={()=>setStageFilter(f.k)}
              style={{height:30,padding:'0 12px',border:`1px solid ${active?f.color:T.borderStrong}`,color:active?f.color:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',background:active?`${f.color}18`:'transparent',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
              <span>{f.label}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{f.n}</span>
            </button>
          );
        })}
      </div>

      {/* ── Feed ────────────────────────────────────────────────────── */}
      <div style={{background:T.bg,flex:1}}>
        {filtered.length===0&&(
          <div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>
            No leads match this filter
          </div>
        )}
        {filtered.map((lead:any)=><LeadCard key={lead.id} lead={lead}/>)}
      </div>

      <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>
          END OF LIST · {filtered.length} LEAD{filtered.length!==1?'S':''}
        </div>
      </div>
    </SalesFloorLayout>
  );
}

// ─── Lead Card ────────────────────────────────────────────────────────────────
function LeadCard({lead}: {lead: any}) {
  const stageFetcher = useFetcher();
  const disqualFetcher = useFetcher();
  const [logoFailed, setLogoFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [disqualConfirm, setDisqualConfirm] = useState(false);

  const stageInfo = LEAD_STAGES[lead.lead_stage] || LEAD_STAGES.new;
  const tc = lead.tier ? (TIER_COLOR[lead.tier]||T.textFaint) : null;
  const days = daysSince(lead.lead_stage_updated_at || null);
  const isFlagged = (lead.tags||[]).includes('pete-followup');
  const phone = lead.phone || lead.primary_contact_phone;
  const email = lead.primary_contact_email;
  const zohoIdNumeric = (lead.zoho_account_id||'').replace('zcrm_','');

  const domain = lead.website ? (()=>{try{return new URL(lead.website.startsWith('http')?lead.website:`https://${lead.website}`).hostname.replace(/^www\./,'');}catch{return null;}})():null;
  const initials = (lead.name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');

  const changeStage = (stage: string) => {
    const fd = new FormData();
    fd.set('intent','patch_field'); fd.set('org_id',lead.id);
    fd.set('field','lead_stage'); fd.set('value',stage);
    stageFetcher.submit(fd,{method:'post',action:'/api/org-update'});
  };

  const disqualify = () => {
    const fd = new FormData();
    fd.set('intent','patch_field'); fd.set('org_id',lead.id);
    fd.set('field','lifecycle_stage'); fd.set('value','disqualified');
    disqualFetcher.submit(fd,{method:'post',action:'/api/org-update'});
    setDisqualConfirm(false);
  };

  // Optimistic lead_stage display
  const currentStage = stageFetcher.formData?.get('field')==='lead_stage'
    ? String(stageFetcher.formData.get('value'))
    : lead.lead_stage;
  const currentStageInfo = LEAD_STAGES[currentStage] || LEAD_STAGES.new;

  const actionPost = useCallback(async (apiUrl:string, body:Record<string,any>) => {
    try{await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{}
  },[]);

  const openBrief = useCallback(()=>{
    if (!phone&&!email){alert('No contact info on file.');return;}
    const w=window.open('','_brief','width=700,height=600');
    if(w){
      w.document.write('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:24px"><h2>Loading brief…</h2></body></html>');
      actionPost('/api/brief',{lead:{_fullName:lead.primary_contact_name||lead.name,Company:lead.name,Phone:phone||'',Email:email||'',_status:'prospect'}})
        .then(()=>{w.location.href='/sales-floor/app?brief=1';});
    }
  },[phone,email,lead,actionPost]);

  const flagFetcher2 = useFetcher();
  const toggleFlag = useCallback(()=>{
    const fd=new FormData(); fd.set('intent','flag_pete'); fd.set('org_id',lead.id);
    flagFetcher2.submit(fd,{method:'post',action:'/sales-staging'});
  },[lead.id,flagFetcher2]);

  const onTraining = useCallback(()=>actionPost('/api/sales-floor-vibes-training',{zohoAccountId:zohoIdNumeric,customerName:lead.name,trainingFocus:''}),[zohoIdNumeric,lead.name,actionPost]);

  // If disqualify submitted, don't render (optimistic removal)
  if (disqualFetcher.state!=='idle'||disqualFetcher.data) return null;

  return (
    <div onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{background:hovered?T.surfaceElev:T.surface,borderTop:`1px solid ${T.border}`,transition:'background 120ms'}}>

      <div style={{display:'grid',gridTemplateColumns:'4px 56px 1fr 140px',alignItems:'center',gap:0,minHeight:72}}>

        {/* Stage rail */}
        <div style={{alignSelf:'stretch',background:currentStageInfo.color,opacity:0.8}}/>

        {/* Logo */}
        <div style={{padding:'12px 0 12px 16px'}}>
          <div style={{width:40,height:40,background:'#000',border:`1px solid ${T.borderStrong}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
            {domain&&!logoFailed
              ?<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={lead.name} onError={()=>setLogoFailed(true)} style={{width:26,height:26,objectFit:'contain'}}/>
              :<span style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,color:T.textSubtle,letterSpacing:'0.05em'}}>{initials}</span>}
          </div>
        </div>

        {/* Identity */}
        <div style={{padding:'12px 20px 12px 14px',minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <a href={`/sales-staging/account/${lead.id}`}
              style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1,textDecoration:'none'}}>
              {lead.name}
            </a>
            {/* Lead stage badge */}
            <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 8px',border:`1px solid ${currentStageInfo.color}`,color:currentStageInfo.color,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',background:`${currentStageInfo.color}15`}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:currentStageInfo.color,flexShrink:0}}/>
              {currentStageInfo.label}
            </span>
            {isFlagged&&<span style={{padding:'2px 6px',border:`1px solid ${T.magenta}`,color:T.magenta,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase'}}>PETE</span>}
          </div>
          {/* Meta: state · city · tier · rank */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textMuted,letterSpacing:'0.04em',flexWrap:'wrap'}}>
            <span>{lead.market_state}{lead.city?` · ${lead.city}`:''}</span>
            {tc&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:tc}}>Tier {lead.tier}</span></>}
            {lead.market_rank&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:T.cyan}}>#{lead.market_rank} {lead.market_state}</span></>}
            {days!==null&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:T.textFaint}}>{days}d in stage</span></>}
          </div>
          {/* Contact */}
          {(lead.primary_contact_name||phone||email)&&(
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>
              {lead.primary_contact_name&&<span style={{color:T.textSubtle}}>{lead.primary_contact_name}</span>}
              {phone&&<span>{phone}</span>}
            </div>
          )}
        </div>

        {/* Stage advance + disqualify */}
        <div style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',gap:8}}>
          {/* Stage dropdown */}
          <div>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:9.5,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:4}}>Stage</div>
            <select
              value={currentStage}
              onChange={e=>changeStage(e.target.value)}
              disabled={stageFetcher.state!=='idle'}
              style={{width:'100%',background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:currentStageInfo.color,fontFamily:'Teko,sans-serif',fontSize:12,letterSpacing:'0.12em',padding:'4px 6px',cursor:'pointer',outline:'none'}}>
              {LEAD_STAGE_ORDER.map(s=>(
                <option key={s} value={s} style={{color:T.text}}>{LEAD_STAGES[s].label}</option>
              ))}
            </select>
          </div>
          {/* Disqualify */}
          {disqualConfirm ? (
            <div style={{display:'flex',flexDirection:'column',gap:4}}>
              <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.redSystems,letterSpacing:'0.08em'}}>Disqualify?</span>
              <div style={{display:'flex',gap:4}}>
                <button type="button" onClick={disqualify}
                  style={{flex:1,height:24,background:'rgba(255,51,85,0.15)',border:`1px solid ${T.redSystems}`,color:T.redSystems,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.12em',cursor:'pointer'}}>
                  YES
                </button>
                <button type="button" onClick={()=>setDisqualConfirm(false)}
                  style={{flex:1,height:24,background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.12em',cursor:'pointer'}}>
                  NO
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={()=>setDisqualConfirm(true)}
              style={{width:'100%',height:26,background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textFaint,fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.14em',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:5}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
              DISQUALIFY
            </button>
          )}
        </div>
      </div>

      {/* Action row */}
      <CardActions
        phone={phone}
        email={email}
        isFlagged={isFlagged}
        orgId={lead.id}
        onBrief={openBrief}
        onFlag={toggleFlag}
        onTraining={onTraining}
      />
    </div>
  );
}
