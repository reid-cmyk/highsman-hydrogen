/**
 * app/routes/sales-staging._index.tsx
 * /sales-staging — CRM Account List (Supabase-backed)
 * Round 2: stage counts fix, 8-button grid, Places autocomplete, Reid's buttons, mobile
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useFetcher, useSearchParams, useNavigate} from '@remix-run/react';
import {useMemo, useState, useEffect, useRef, useCallback} from 'react';
import {isStagingAuthed, buildStagingLoginCookie, buildStagingLogoutCookie, checkStagingPassword} from '~/lib/staging-auth';
import type {OrgRow} from '~/lib/supabase-orgs';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | Sales Floor'},
  {name: 'robots', content: 'noindex, nofollow, noarchive'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:'#0A0A0A', surface:'#141414', surfaceElev:'#1A1A1A',
  border:'#1F1F1F', borderStrong:'#2F2F2F',
  text:'#F5F5F5', textMuted:'#C8C8C8', textSubtle:'#9C9C9C', textFaint:'#6A6A6A',
  yellow:'#FFD500', yellowWarm:'#c8a84b', magenta:'#FF3B7F',
  cyan:'#00D4FF', green:'#00E676', redSystems:'#FF3355', redAlert:'#B80020',
  statusWarn:'#FFB300',
};

// ─── Status helpers ────────────────────────────────────────────────────────────
function getStatusKey(days: number | null): string {
  if (days === null) return 'new';
  if (days <= 14) return 'good';
  if (days <= 30) return 'warn';
  if (days <= 60) return 'slip';
  if (days <= 120) return 'risk';
  return 'cold';
}
const STATUS: Record<string, {color:string; label:string}> = {
  good:{color:T.green,      label:'ON CADENCE'},
  warn:{color:T.statusWarn, label:'APPROACHING'},
  slip:{color:'#FF8A00',    label:'SLIPPING'},
  risk:{color:T.redSystems, label:'AT RISK'},
  cold:{color:T.redAlert,   label:'COLD'},
  new: {color:T.cyan,       label:'ONBOARDING'},
};
function tierColor(_t: string|null) { return T.textSubtle; }
function daysSince(d: string|null): number|null {
  if (!d) return null;
  return Math.floor((Date.now()-new Date(d).getTime())/86400000);
}

// ─── Online menu options (from Zoho picklist) ─────────────────────────────────
const ONLINE_MENU_OPTIONS = ['AIQ','Blaze','Cova','Dispense','Dutchie','Jane','Leafly','Mosaic','Nabis','Self Administrator','Sweed','Treez','Weedmaps'];

// ─── Icons ────────────────────────────────────────────────────────────────────
const Ico = ({d,size=14}:{d:string;size?:number}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" style={{display:'block',flexShrink:0}}><path d={d}/></svg>;
const PhoneI  = ({s=14}:{s?:number}) => <Ico size={s} d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>;
const TextI   = ({s=14}:{s?:number}) => <Ico size={s} d="M3 5h18v12h-8l-5 4v-4H3z"/>;
const MailI   = ({s=14}:{s?:number}) => <Ico size={s} d="M3 6h18v12H3zM3 6l9 7 9-7"/>;
const FlagI   = ({s=14}:{s?:number}) => <Ico size={s} d="M5 3v18M5 4h12l-2 4 2 4H5"/>;
const BookI   = ({s=14}:{s?:number}) => <Ico size={s} d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4a1 1 0 0 1 1-1h15v18H6.5A2.5 2.5 0 0 1 4 19.5z"/>;
const StarI   = ({s=14}:{s?:number}) => <Ico size={s} d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>;
const SendI   = ({s=14}:{s?:number}) => <Ico size={s} d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>;
const BoxI    = ({s=14}:{s?:number}) => <Ico size={s} d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>;

// ─── Action ───────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const fd = await request.formData();
  const intent = String(fd.get('intent')||'login');

  if (intent==='login') {
    const pw = String(fd.get('password')||'');
    if (checkStagingPassword(pw, env)) return json({ok:true,error:null},{headers:{'Set-Cookie':buildStagingLoginCookie()}});
    return json({ok:false,error:'Incorrect password'});
  }
  if (!isStagingAuthed(request.headers.get('Cookie')||'')) return json({ok:false,error:'unauthorized'},{status:401});
  if (intent==='logout') return json({ok:true,error:null},{headers:{'Set-Cookie':buildStagingLogoutCookie()}});

  if (intent==='prospect'||intent==='flag_pete') {
    const org_id=String(fd.get('org_id')||'');
    if (!org_id) return json({ok:false,error:'missing org_id'},{status:400});
    const sbH={apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=minimal'};
    if (intent==='prospect') {
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`,{method:'PATCH',headers:sbH,body:JSON.stringify({lifecycle_stage:'prospect',updated_at:new Date().toISOString()})});
    } else {
      const res=await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}&select=tags`,{headers:{apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`}});
      const rows=await res.json(); const tags:string[]=(rows?.[0]?.tags||[]);
      const newTags=tags.includes('pete-followup')?tags.filter((t:string)=>t!=='pete-followup'):[...tags,'pete-followup'];
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`,{method:'PATCH',headers:sbH,body:JSON.stringify({tags:newTags})});
    }
    return json({ok:true,intent,org_id});
  }

  if (intent==='create_account') {
    const name=String(fd.get('name')||'').trim();
    const state=String(fd.get('state')||'NJ');
    const city=String(fd.get('city')||'');
    const street=String(fd.get('street')||'');
    const zip=String(fd.get('zip')||'');
    const phone=String(fd.get('phone')||'');
    const website=String(fd.get('website')||'');
    if (!name) return json({ok:false,error:'name required'},{status:400});
    const sbH={apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`,'Content-Type':'application/json',Prefer:'return=representation'};
    const body:any={name,market_state:state,source:'manual',lifecycle_stage:'untargeted',is_multi_state:false,do_not_contact:false,risk_of_loss:false,risk_of_loss_threshold_days:60,sparkplug_enabled:false,online_menus:[],tags:[],allow_split_promos:false,reorder_status:'ok'};
    if (city) body.city=city;
    if (street) body.street_address=street;
    if (zip) body.zip=zip;
    if (phone) body.phone=phone;
    if (website) body.website=website;
    const res=await fetch(`${env.SUPABASE_URL}/rest/v1/organizations`,{method:'POST',headers:sbH,body:JSON.stringify(body)});
    const created=await res.json();
    const newId=Array.isArray(created)?created[0]?.id:created?.id;
    return json({ok:true,intent:'create_account',newId,redirect:`/sales-staging/account/${newId}`});
  }

  return json({ok:false,error:'unknown intent'},{status:400});
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env=(context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie')||'')) {
    return json({authenticated:false,orgs:[],counts:null,stageCounts:null,stateFilter:'ALL',stageFilter:'active'});
  }
  const url=new URL(request.url);
  const stateFilter=url.searchParams.get('state')||'ALL';
  const stageFilter=url.searchParams.get('stage')||'active';
  const base=env.SUPABASE_URL;
  const headers={apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`};

  // Fetch the filtered account list
  const select=['id','name','market_state','city','phone','lifecycle_stage','tier','last_order_date','tags','online_menus','do_not_contact','risk_of_loss','reorder_status','zoho_account_id','website','contacts(id,email,phone,mobile,full_name,first_name,last_name,is_primary_buyer,job_role)'].join(',');
  const params=new URLSearchParams({select,order:'name.asc',limit:'2000'});
  if (stateFilter!=='ALL') params.set('market_state',`eq.${stateFilter}`);
  if (stageFilter!=='all') params.set('lifecycle_stage',`eq.${stageFilter}`);
  let orgs:OrgRow[]=[];
  try { const r=await fetch(`${base}/rest/v1/organizations?${params}`,{headers}); if (r.ok) orgs=await r.json(); } catch {}

  // Per-stage counts using Prefer: count=exact (avoids 1000-row limit)
  const stageList=['active','untargeted','churned','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due','dormant'];
  const sbCountH={...headers,'Prefer':'count=exact','Range':'0-0'};
  let stageCounts:Record<string,number>={};
  try {
    const countResults = await Promise.all(
      stageList.map(async (s) => {
        const cp=new URLSearchParams({select:'id',lifecycle_stage:`eq.${s}`});
        const r=await fetch(`${base}/rest/v1/organizations?${cp}`,{method:'GET',headers:sbCountH});
        const cr=r.headers.get('Content-Range')||'';
        const total=parseInt(cr.split('/')[1]||'0',10);
        return [s,isNaN(total)?0:total] as [string,number];
      })
    );
    stageCounts=Object.fromEntries(countResults.filter(([,n])=>n>0));
  } catch {}

  // State counts for current stage filter
  let counts:Record<string,number>={};
  try {
    const cp=new URLSearchParams({select:'market_state',limit:'2000'});
    if (stageFilter!=='all') cp.set('lifecycle_stage',`eq.${stageFilter}`);
    const r=await fetch(`${base}/rest/v1/organizations?${cp}`,{headers});
    const rows:any[]=await r.json();
    counts.ALL=rows.length;
    for (const row of rows){const s=row.market_state||'OTHER';counts[s]=(counts[s]||0)+1;}
  } catch {}

  return json({authenticated:true,orgs,counts,stageCounts,stateFilter,stageFilter});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SalesStaging() {
  const data=useLoaderData<typeof loader>() as any;
  const actionData=useActionData<typeof action>() as any;
  const navigate=useNavigate();

  // Redirect to new account after creation
  useEffect(()=>{
    if (actionData?.intent==='create_account'&&actionData?.redirect) {
      navigate(actionData.redirect);
    }
  },[actionData,navigate]);

  if (!data.authenticated) return <LoginScreen error={actionData?.error}/>;
  return <Dashboard data={data}/>;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({error}:{error?:string|null}) {
  return (
    <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{width:'100%',maxWidth:'360px'}}>
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px',marginBottom:'20px'}}/>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:'32px',fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase',lineHeight:1}}>SALES FLOOR</div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:'10px',color:T.textFaint,letterSpacing:'0.28em',marginTop:'8px',textTransform:'uppercase'}}>Internal · Restricted</div>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="login"/>
          <input type="password" name="password" placeholder="Access code" autoFocus
            style={{width:'100%',padding:'12px 14px',background:T.surface,border:`1px solid ${T.borderStrong}`,color:T.text,fontSize:'14px',outline:'none',marginBottom:'10px',boxSizing:'border-box',fontFamily:'JetBrains Mono,monospace'}}/>
          {error&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:'11px',color:T.redSystems,marginBottom:'10px',letterSpacing:'0.08em'}}>{error}</div>}
          <button type="submit" style={{width:'100%',padding:'12px',background:T.yellow,border:`1px solid ${T.yellow}`,color:'#000',fontFamily:'Teko,sans-serif',fontSize:'18px',fontWeight:600,letterSpacing:'0.20em',textTransform:'uppercase',cursor:'pointer'}}>ENTER</button>
        </Form>
      </div>
    </div>
  );
}

// ─── Stage labels ─────────────────────────────────────────────────────────────
const STATES=['ALL','NJ','MA','NY','RI','MO'];
const ALL_STAGES=['active','untargeted','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due','churned','all'];
const STAGE_LABELS:Record<string,string>={active:'Active',untargeted:'Untargeted',prospect:'Prospect',contacted:'Contacted',qualified:'Qualified',sample_sent:'Sample Sent',first_order_pending:'First Order',reorder_due:'Reorder Due',churned:'Churned',all:'All'};

// ─── CSV export ───────────────────────────────────────────────────────────────
function downloadCSV(orgs:OrgRow[],stateFilter:string) {
  const headers=['Name','State','City','Phone','Lifecycle','Tier','Last Order Date','License #','Website','Reorder Status','Tags'];
  const rows=orgs.map(o=>[`"${(o.name||'').replace(/"/g,'""')}"`,o.market_state||'',`"${(o.city||'').replace(/"/g,'""')}"`,o.phone||'',o.lifecycle_stage||'',o.tier||'',o.last_order_date||'',o.license_number||'',o.website||'',o.reorder_status||'',`"${((o.tags as any)||[]).join(', ')}"`].join(','));
  const csv=[headers.join(','),...rows].join('\n');
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
  a.download=`highsman-accounts-${stateFilter.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target:number,duration=900):number {
  const [value,setValue]=useState(0);
  useEffect(()=>{
    if (target===0){setValue(0);return;}
    const start=Date.now();
    const tick=()=>{
      const eased=1-Math.pow(1-Math.min((Date.now()-start)/duration,1),3);
      setValue(Math.round(eased*target));
      if (eased<1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  },[target,duration]);
  return value;
}
function AnimatedStat({target,accent,label,src}:{target:number;accent:string;label:string;src:string}) {
  const val=useCountUp(target);
  return (
    <div style={{background:T.bg,padding:'18px 24px'}}>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:6}}>{label}</div>
      <div style={{display:'flex',alignItems:'baseline',gap:8}}>
        <span style={{fontFamily:'Teko,sans-serif',fontSize:44,fontWeight:600,color:accent,lineHeight:0.9,textShadow:accent===T.yellow?'0 0 30px rgba(255,213,0,0.18)':'none'}}>{val}</span>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.14em'}}>{src}</span>
      </div>
    </div>
  );
}

// ─── New Account Modal — search-first, Places auto-fill, no manual state ─────
const STATE_ABBREVIATIONS: Record<string,string> = {
  'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
  'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
  'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA',
  'Kansas':'KS','Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD',
  'Massachusetts':'MA','Michigan':'MI','Minnesota':'MN','Mississippi':'MS',
  'Missouri':'MO','Montana':'MT','Nebraska':'NE','Nevada':'NV','New Hampshire':'NH',
  'New Jersey':'NJ','New Mexico':'NM','New York':'NY','North Carolina':'NC',
  'North Dakota':'ND','Ohio':'OH','Oklahoma':'OK','Oregon':'OR','Pennsylvania':'PA',
  'Rhode Island':'RI','South Carolina':'SC','South Dakota':'SD','Tennessee':'TN',
  'Texas':'TX','Utah':'UT','Vermont':'VT','Virginia':'VA','Washington':'WA',
  'West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
};

function normalizeState(raw: string): string {
  if (!raw) return '';
  const upper = raw.trim().toUpperCase();
  if (upper.length === 2) return upper;
  return STATE_ABBREVIATIONS[raw.trim()] || upper.slice(0, 2);
}

function NewAccountModal({onClose}:{onClose:()=>void}) {
  const fetcher = useFetcher();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [predictions, setPredictions] = useState<any[]>([]);
  const [status, setStatus] = useState<'idle'|'searching'|'resolving'|'creating'>('idle');
  const [manualMode, setManualMode] = useState(false);
  const [manualName, setManualName] = useState('');
  const debounceRef = useRef<any>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Redirect when org is created
  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok && d?.intent === 'create_account' && d?.newId) {
      navigate(`/sales-staging/account/${d.newId}`);
    }
  }, [fetcher.data, navigate]);

  // Debounced business search
  useEffect(() => {
    if (manualMode || query.length < 2) { setPredictions([]); setStatus('idle'); return; }
    setStatus('searching');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places?q=${encodeURIComponent(query)}&type=business`);
        const d = await r.json();
        setPredictions(d.predictions || []);
        setStatus(d.error ? 'idle' : 'idle');
      } catch { setPredictions([]); setStatus('idle'); }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, manualMode]);

  // When user selects a prediction: resolve place details → create org → redirect
  const selectPlace = async (p: any) => {
    setPredictions([]);
    setStatus('resolving');
    const displayName = p.description || p.mainText || p.text?.text || query;
    setQuery(`${displayName} — loading…`);

    try {
      const r = await fetch(`/api/places?placeId=${encodeURIComponent(p.placeId)}`);
      const d = await r.json();
      const addr = d.address || {};

      // Derive market_state from address (no separate input needed)
      const market_state = normalizeState(addr.state || '');

      setQuery(addr.name || displayName);
      setStatus('creating');

      const fd = new FormData();
      fd.set('intent', 'create_account');
      fd.set('name', addr.name || displayName);
      fd.set('state', market_state);
      fd.set('city', addr.city || '');
      fd.set('street', addr.street || '');
      fd.set('zip', addr.zip || '');
      fd.set('phone', addr.phone || '');
      fd.set('website', addr.website || '');
      fetcher.submit(fd, {method: 'post'});
    } catch {
      setStatus('idle');
      setQuery(displayName);
      setPredictions([]);
    }
  };

  // Manual fallback (no Places match)
  const createManual = () => {
    if (!manualName.trim()) return;
    setStatus('creating');
    const fd = new FormData();
    fd.set('intent', 'create_account');
    fd.set('name', manualName.trim());
    fd.set('state', '');
    fetcher.submit(fd, {method: 'post'});
  };

  const isLoading = status === 'resolving' || status === 'creating' || fetcher.state !== 'idle';

  return (
    <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.88)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:9999,padding:16}} onClick={onClose}>
      <div style={{background:T.surface,border:`1px solid ${T.borderStrong}`,padding:'28px',width:480,maxWidth:'100%',position:'relative'}} onClick={e=>e.stopPropagation()}>
        <div style={{fontFamily:'Teko,sans-serif',fontSize:26,letterSpacing:'0.20em',color:T.text,textTransform:'uppercase',marginBottom:4}}>New Account</div>
        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.12em',marginBottom:20}}>
          {isLoading ? 'Creating account…' : 'Type the dispensary name to search Google Places'}
        </div>

        {!manualMode ? (
          <div style={{position:'relative'}}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="e.g. Premo Dispensary New Jersey"
              autoFocus
              disabled={isLoading}
              style={{width:'100%',padding:'12px 14px',background:T.bg,border:`1px solid ${isLoading?T.border:T.borderStrong}`,color:T.text,fontSize:14,outline:'none',boxSizing:'border-box',fontFamily:'Inter,sans-serif'}}
            />
            {status==='searching'&&<div style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>searching…</div>}

            {/* Dropdown */}
            {predictions.length > 0 && !isLoading && (
              <div style={{position:'absolute',top:'100%',left:0,right:0,background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,zIndex:20,maxHeight:260,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
                {predictions.map((p:any, i:number) => (
                  <button key={i} type="button" onClick={() => selectPlace(p)}
                    style={{display:'block',width:'100%',padding:'12px 16px',background:'transparent',border:'none',borderBottom:`1px solid ${T.border}`,textAlign:'left',cursor:'pointer',color:T.text}}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.bg)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{fontFamily:'Inter,sans-serif',fontSize:14,color:T.text,marginBottom:2}}>{p.description||p.mainText||p.text?.text}</div>
                    {p.secondaryText&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textFaint,letterSpacing:'0.04em'}}>{p.secondaryText}</div>}
                  </button>
                ))}
              </div>
            )}

            {/* No results hint */}
            {query.length >= 3 && predictions.length === 0 && status === 'idle' && !isLoading && (
              <div style={{marginTop:10,fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textFaint,letterSpacing:'0.08em'}}>
                No results — try adding the state, e.g. "Premo NJ" ·{' '}
                <button type="button" onClick={()=>{setManualMode(true);setManualName(query);}} style={{background:'none',border:'none',color:T.yellow,cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',letterSpacing:'inherit',textDecoration:'underline',padding:0}}>
                  create manually
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Manual mode */
          <div>
            <input value={manualName} onChange={e=>setManualName(e.target.value)} autoFocus placeholder="Dispensary name"
              onKeyDown={e=>{if(e.key==='Enter')createManual();}}
              style={{width:'100%',padding:'12px 14px',background:T.bg,border:`1px solid ${T.borderStrong}`,color:T.text,fontSize:14,outline:'none',boxSizing:'border-box'}}/>
            <div style={{marginTop:8,fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.08em'}}>
              Address and state can be added on the account page.{' '}
              <button type="button" onClick={()=>setManualMode(false)} style={{background:'none',border:'none',color:T.cyan,cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',textDecoration:'underline',padding:0}}>
                back to search
              </button>
            </div>
          </div>
        )}

        {/* Status bar during creation */}
        {isLoading && (
          <div style={{marginTop:16,display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:T.yellow,animation:'pulse-ring 1.2s infinite'}}/>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textFaint,letterSpacing:'0.10em'}}>
              {status==='resolving'?'Looking up address…':'Creating account, redirecting…'}
            </span>
          </div>
        )}

        {/* Footer buttons */}
        {!isLoading && (
          <div style={{display:'flex',gap:10,justifyContent:'space-between',alignItems:'center',marginTop:20}}>
            <button onClick={onClose} style={{height:34,padding:'0 16px',background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textMuted,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>Cancel</button>
            {manualMode && (
              <button onClick={createManual} disabled={!manualName.trim()}
                style={{height:34,padding:'0 20px',background:manualName.trim()?T.yellow:'#333',border:'none',color:manualName.trim()?'#000':T.textFaint,fontFamily:'Teko,sans-serif',fontSize:13,fontWeight:600,letterSpacing:'0.18em',textTransform:'uppercase',cursor:'pointer'}}>
                Create
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Sweep animation ──────────────────────────────────────────────────────────
function SweepLine() {
  return (
    <>
      <style>{`@keyframes sweep{0%{left:-25%}100%{left:125%}} .hs-sweep{position:relative;overflow:hidden} .hs-sweep::after{content:'';position:absolute;bottom:0;left:-25%;height:2px;width:25%;background:linear-gradient(90deg,transparent,#FFD500,transparent);opacity:.75;animation:sweep 14s linear infinite;pointer-events:none}`}</style>
      <div className="hs-sweep" style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:T.border}}/>
    </>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({data}:{data:any}) {
  const [searchParams,setSearchParams]=useSearchParams();
  const [search,setSearch]=useState('');
  const [showNewAccount,setShowNewAccount]=useState(false);
  const searchRef=useRef<HTMLInputElement>(null);
  const stateFilter:string=data.stateFilter||'ALL';
  const stageFilter:string=data.stageFilter||'active';
  const orgs:OrgRow[]=data.orgs||[];
  const counts:Record<string,number>=data.counts||{};
  const stageCounts:Record<string,number>=data.stageCounts||{};

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{if((e.metaKey||e.ctrlKey)&&e.key==='k'){e.preventDefault();searchRef.current?.focus();}};
    window.addEventListener('keydown',h);return ()=>window.removeEventListener('keydown',h);
  },[]);

  function setFilter(k:string,v:string){const n=new URLSearchParams(searchParams);n.set(k,v);setSearchParams(n,{replace:true});}

  const filtered=useMemo(()=>{
    if (!search.trim()) return orgs;
    const q=search.toLowerCase();
    return orgs.filter(o=>o.name.toLowerCase().includes(q)||(o.city||'').toLowerCase().includes(q));
  },[orgs,search]);

  const activeCount=stageCounts['active']||0;
  const reorderDue=orgs.filter(o=>o.reorder_status==='due').length;
  const slipping=orgs.filter(o=>{const d=daysSince(o.last_order_date);return d!==null&&d>30&&d<=60;}).length;
  const atRisk=orgs.filter(o=>{const d=daysSince(o.last_order_date);return d!==null&&d>60;}).length;
  const flagged=orgs.filter(o=>(o.tags as any)?.includes('pete-followup')).length;

  return (
    <div style={{minHeight:'100vh',background:T.bg,color:T.text,fontFamily:'Inter,sans-serif',display:'flex',flexDirection:'column',backgroundImage:`radial-gradient(ellipse at top,rgba(255,213,0,0.04) 0%,transparent 55%),radial-gradient(ellipse at bottom right,rgba(255,51,85,0.025) 0%,transparent 55%)`}}>
      <style>{`
        @media(max-width:768px){
          .hs-topbar-right span,.hs-topbar-divider{display:none!important}
          .hs-sidenav{display:none!important}
          .hs-main{padding:0!important}
          .hs-page-header{padding:12px 16px!important}
          .hs-stats-strip{grid-template-columns:repeat(2,1fr)!important}
          .hs-filter-row{flex-wrap:wrap!important}
          .hs-state-pills{flex-wrap:wrap!important;border:none!important;gap:6px!important}
          .hs-state-pill{border:1px solid var(--bs,#2F2F2F)!important}
          .hs-search{width:100%!important;max-width:none!important}
          .hs-card-grid{grid-template-columns:4px 48px 1fr!important}
          .hs-card-days,.hs-card-contact{display:none!important}
          .hs-card-actions{grid-column:2/-1!important;padding:8px 12px 12px!important;border-left:none!important}
        }
      `}</style>

      <TopBar />
      <div style={{display:'flex',flex:1}}>
        <SideNav className="hs-sidenav" stageCounts={stageCounts} />
        <div className="hs-main" style={{flex:1,minWidth:0,display:'flex',flexDirection:'column'}}>
          {/* Page header */}
          <div className="hs-page-header" style={{padding:'24px 28px 20px',borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'flex-end',justifyContent:'space-between',position:'relative',overflow:'hidden'}}>
            <SweepLine/>
            <div>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.32em',color:T.textFaint,textTransform:'uppercase'}}>Sales Floor / Workspace</div>
              <div style={{display:'flex',alignItems:'baseline',gap:14,marginTop:4}}>
                <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:38,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>Accounts</h1>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:T.textSubtle,letterSpacing:'0.10em'}}>showing {filtered.length} · sorted by RISK ↓</span>
              </div>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <button onClick={()=>downloadCSV(filtered,stateFilter)} style={{height:36,padding:'0 14px',background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textMuted,fontFamily:'Teko,sans-serif',fontSize:14,letterSpacing:'0.20em',textTransform:'uppercase',cursor:'pointer'}}>Export CSV</button>
              <button onClick={()=>setShowNewAccount(true)} style={{height:36,padding:'0 16px',background:T.yellow,border:`1px solid ${T.yellow}`,color:'#000',fontFamily:'Teko,sans-serif',fontWeight:600,fontSize:14,letterSpacing:'0.20em',textTransform:'uppercase',cursor:'pointer'}}>+ New Account</button>
            </div>
            {showNewAccount&&<NewAccountModal onClose={()=>setShowNewAccount(false)}/>}
          </div>

          {/* Stats strip */}
          <div className="hs-stats-strip" style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
            <AnimatedStat target={activeCount} label="Active accounts"   src="live"        accent={T.text}/>
            <AnimatedStat target={reorderDue}  label="Reorders due ≤ 7d" src="ops/cadence" accent={T.yellow}/>
            <AnimatedStat target={slipping}    label="Slipping (30–60d)" src="/cadence"    accent={T.statusWarn}/>
            <AnimatedStat target={atRisk}      label="At risk (>60d)"    src="/cadence"    accent={T.redSystems}/>
            <AnimatedStat target={flagged}     label="Pete's desk"       src="flags"       accent={T.magenta}/>
          </div>

          {/* Filter bar */}
          <div style={{borderBottom:`1px solid ${T.border}`,padding:'20px 28px 18px',background:T.bg}}>
            <div className="hs-filter-row" style={{display:'flex',alignItems:'center',gap:22}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',minWidth:50}}>State</div>
              <div className="hs-state-pills" style={{display:'flex',gap:0,border:`1px solid ${T.borderStrong}`}}>
                {STATES.map(s=>{
                  const n=s==='ALL'?counts['ALL']:counts[s];
                  const active=stateFilter===s;
                  return (
                    <button key={s} onClick={()=>setFilter('state',s)}
                      className="hs-state-pill"
                      style={{padding:'7px 12px',background:active?T.yellow:'transparent',color:active?'#000':T.textMuted,fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'0.10em',cursor:'pointer',borderRight:`1px solid ${T.borderStrong}`,border:'none',borderRight:`1px solid ${T.borderStrong}`}}>
                      <span style={{fontWeight:active?700:500}}>{s}</span>
                      {n!=null&&<span style={{opacity:active?0.7:0.6,fontSize:10,marginLeft:4}}>{n}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{flex:1}}/>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em'}}>/api/accounts · live</div>
            </div>
            <div className="hs-filter-row" style={{display:'flex',alignItems:'center',gap:22,marginTop:14}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',minWidth:50}}>Stage</div>
              <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
                {ALL_STAGES.filter(s=>s==='all'||(stageCounts[s]??0)>0).map(s=>{
                  const active=stageFilter===s;
                  const n=s==='all'?(Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0):(stageCounts[s]??0);
                  return (
                    <button key={s} onClick={()=>setFilter('stage',s)}
                      style={{padding:'6px 11px',border:`1px solid ${active?T.textMuted:T.borderStrong}`,color:active?T.text:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:14,letterSpacing:'0.18em',textTransform:'uppercase',background:'transparent',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
                      <span>{STAGE_LABELS[s]||s}</span>
                      <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{flex:1}}/>
              <div className="hs-search" style={{display:'flex',alignItems:'center',border:`1px solid ${T.borderStrong}`,padding:'0 12px',height:36,width:320,background:T.surface,gap:10}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
                <input ref={searchRef} placeholder="Search by name or city" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1,background:'transparent',border:'none',outline:'none',color:T.text,fontSize:13,fontFamily:'inherit'}}/>
                {!search&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,border:`1px solid ${T.borderStrong}`,padding:'1px 5px',letterSpacing:'0.12em'}}>⌘K</span>}
                {search&&<button onClick={()=>setSearch('')} style={{background:'none',border:'none',color:T.textFaint,cursor:'pointer',fontSize:14,padding:0}}>✕</button>}
              </div>
            </div>
          </div>

          {/* Account list */}
          <div style={{background:T.bg,flex:1}}>
            {filtered.length===0&&<div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>No accounts match this filter</div>}
            {filtered.map(org=><AccountCard key={org.id} org={org} stageFilter={stageFilter}/>)}
          </div>

          <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>END OF LIST · {filtered.length} ACCOUNTS</div>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>↑↓ navigate · ↵ open</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar() {
  return (
    <div style={{height:64,background:T.bg,borderBottom:`1px solid ${T.border}`,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',flexShrink:0}}>
      <div style={{display:'flex',alignItems:'center',gap:20}}>
        <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px'}}/>
        <div className="hs-topbar-divider" style={{width:1,height:24,background:T.borderStrong}}/>
        <div style={{fontFamily:'Teko,sans-serif',fontSize:20,fontWeight:500,letterSpacing:'0.28em',color:T.textFaint,textTransform:'uppercase'}}>SALES FLOOR</div>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9,color:T.textFaint,letterSpacing:'0.18em',border:`1px solid ${T.border}`,padding:'2px 6px'}}>v2.4</span>
      </div>
      <div className="hs-topbar-right" style={{display:'flex',alignItems:'center',gap:16}}>
        <div style={{display:'flex',alignItems:'center',gap:6}}>
          <div style={{width:7,height:7,borderRadius:'50%',background:T.green,boxShadow:`0 0 6px ${T.green}`}}/>
          <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.14em'}}>LIVE</span>
        </div>
        <div className="hs-topbar-divider" style={{width:1,height:20,background:T.border}}/>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/sky-avatar.png" alt="Sky Lima" style={{width:28,height:28,borderRadius:'50%',objectFit:'cover'}}/>
          <span style={{fontFamily:'Teko,sans-serif',fontSize:14,letterSpacing:'0.14em',color:T.textMuted}}>SKY LIMA</span>
        </div>
        <div className="hs-topbar-divider" style={{width:1,height:20,background:T.border}}/>
        <a href="/sales" style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em',textDecoration:'none'}}>← Live /sales</a>
        <Form method="post"><input type="hidden" name="intent" value="logout"/><button type="submit" style={{background:'none',border:'none',fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.14em',cursor:'pointer',textDecoration:'underline'}}>sign out</button></Form>
      </div>
    </div>
  );
}

// ─── SideNav ──────────────────────────────────────────────────────────────────
function SideNav({className,stageCounts}:{className?:string;stageCounts:Record<string,number>}) {
  const items=[
    {label:'Accounts',count:(Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0),href:'/sales-staging',active:true},
    {label:'Dashboard',href:'/sales-staging?dash=1'},
    {label:'Leads',count:stageCounts['prospect'],href:'/sales-staging?stage=prospect'},
    {label:'Reorders Due',count:stageCounts['reorder_due'],dot:(stageCounts['reorder_due']||0)>0,href:'/sales-staging?stage=reorder_due'},
    {label:'New Customers',count:stageCounts['first_order_pending'],href:'/sales-staging?stage=first_order_pending'},
    {label:'Funnel',href:'/sales'},
    {label:'Email',href:'/sales-floor/app'},
    {label:'Text',href:'/sales-floor/app'},
    {label:'Issues',href:'/sales-floor/app'},
    {label:'Vibes',href:'/vibes'},
  ];
  return (
    <div className={className} style={{width:200,flexShrink:0,background:T.bg,borderRight:`1px solid ${T.border}`,paddingTop:8}}>
      <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.32em',color:T.textFaint,textTransform:'uppercase',padding:'8px 16px 4px'}}>Workspace</div>
      {items.map(item=>(
        <a key={item.label} href={item.href} style={{textDecoration:'none'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 16px',background:item.active?`rgba(255,213,0,0.05)`:'transparent',borderLeft:item.active?`2px solid ${T.yellow}`:'2px solid transparent'}}>
            <span style={{fontFamily:'Teko,sans-serif',fontSize:15,letterSpacing:'0.10em',color:item.active?T.yellow:T.textSubtle,textTransform:'uppercase',fontWeight:item.active?500:400}}>{item.label}</span>
            {item.count!=null&&item.count>0&&<span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:item.dot?T.yellow:T.textFaint,letterSpacing:'0.06em'}}>{item.count}{item.dot?'•':''}</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
const NJ_MENU_URL='https://highsman.com/njmenu';

function AccountCard({org,stageFilter}:{org:OrgRow;stageFilter:string}) {
  const fetcher=useFetcher();
  const [hovered,setHovered]=useState(false);
  const days=daysSince(org.last_order_date);
  const statusKey=getStatusKey(days);
  const status=STATUS[statusKey];
  const tc=tierColor(org.tier);
  const primaryContact=org.contacts?.find(c=>c.is_primary_buyer)||org.contacts?.[0];
  const phone=org.phone||primaryContact?.phone||primaryContact?.mobile;
  const email=primaryContact?.email;
  const isFlagged=(org.tags as any)?.includes('pete-followup');
  const isUntargeted=org.lifecycle_stage==='untargeted';
  const isProspecting=fetcher.state!=='idle'&&fetcher.formData?.get('intent')==='prospect';
  const nameInitials=(org.name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');
  const domain=org.website?(()=>{try{return new URL(org.website!.startsWith('http')?org.website!:`https://${org.website}`).hostname.replace(/^www\./,'');}catch{return null;}})():null;
  const [logoFailed,setLogoFailed]=useState(false);
  const zohoIdNumeric=(org.zoho_account_id||'').replace('zcrm_','');

  const flag=()=>{const fd=new FormData();fd.set('intent','flag_pete');fd.set('org_id',org.id);fetcher.submit(fd,{method:'post'});};
  const prospect=()=>{const fd=new FormData();fd.set('intent','prospect');fd.set('org_id',org.id);fetcher.submit(fd,{method:'post'});};

  // Actions that call existing sales-floor API routes
  const actionPost=useCallback(async(apiUrl:string,body:Record<string,string>)=>{
    try{await fetch(apiUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch{}
  },[]);

  const openBrief=()=>{
    if (!phone&&!email){alert('No contact info available for brief.');return;}
    const briefWindow=window.open('','_brief','width=700,height=600');
    if (briefWindow){
      briefWindow.document.write('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:24px"><h2>Loading brief…</h2></body></html>');
      actionPost('/api/brief',{lead:{First_Name:primaryContact?.first_name||'',Last_Name:primaryContact?.last_name||'',_fullName:primaryContact?.full_name||org.name,Company:org.name,Phone:phone||'',Email:email||'',_status:'active'} as any}).then(()=>{briefWindow.location.href='/sales-floor/app?brief=1';});
    }
  };

  const requestTraining=()=>actionPost('/api/sales-floor-vibes-training',{zohoAccountId:zohoIdNumeric,customerName:org.name,trainingFocus:''});
  const newProduct=()=>actionPost('/api/sales-floor-vibes-product-onboard',{zohoAccountId:zohoIdNumeric,customerName:org.name});
  const sendMenu=()=>{
    if (!email){alert('No email address on file.');return;}
    const subject=`Highsman NJ Wholesale Menu — Hit Sticks, Pre-Rolls & Ground Game`;
    const body=`Hi ${primaryContact?.first_name||'there'},\n\nHere's the link to our NJ wholesale menu — Hit Sticks, Pre-Rolls, and Ground Game:\n\n${NJ_MENU_URL}\n\nLet me know if you have any questions. You also earn credits toward our Highsman Apparel store when you order!\n\nBest,\nSky Lima\nHighsman`;
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const daysColor=days===null?T.cyan:days<=14?T.green:days<=30?T.statusWarn:T.redSystems;

  return (
    <a href={`/sales-staging/account/${org.id}`} style={{textDecoration:'none',display:'block'}} onClick={e=>{if((e.target as HTMLElement).closest('button,a[href^="tel"],a[href^="sms"],a[href^="mailto"]'))e.preventDefault();}}>
      <div
        onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
        style={{background:hovered?T.surfaceElev:T.surface,borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,opacity:isProspecting&&stageFilter!=='all'?0.35:1,transition:'background 120ms'}}>

        {/* Main info row */}
        <div className="hs-card-grid" style={{display:'grid',gridTemplateColumns:'4px 56px 1fr 200px 200px',alignItems:'center',gap:0,minHeight:72}}>
          {/* Status rail */}
          <div style={{alignSelf:'stretch',background:status.color,opacity:statusKey==='good'?0.5:0.85}}/>

          {/* Logo */}
          <div style={{padding:'12px 0 12px 16px'}}>
            <div style={{width:40,height:40,background:'#000',border:`1px solid ${T.borderStrong}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
              {domain&&!logoFailed
                ?<img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={org.name} onError={()=>setLogoFailed(true)} style={{width:26,height:26,objectFit:'contain'}}/>
                :<span style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,color:T.textSubtle,letterSpacing:'0.05em'}}>{nameInitials}</span>}
            </div>
          </div>

          {/* Identity */}
          <div style={{padding:'12px 20px 12px 14px',minWidth:0}}>
            <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
              <span style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1}}>{org.name}</span>
              {org.tier&&<span style={{padding:'2px 6px',border:`1px solid ${T.textSubtle}`,color:T.textSubtle,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase'}}>TIER {org.tier}</span>}
              {isFlagged&&<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 6px',border:`1px solid ${T.magenta}`,color:T.magenta,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase'}}><FlagI s={9}/> PETE</span>}
              {isProspecting&&<span style={{padding:'2px 6px',border:`1px solid ${T.cyan}`,color:T.cyan,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em'}}>→ PROSPECTING</span>}
            </div>
            <div style={{display:'flex',alignItems:'center',gap:12,marginTop:6,fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'0.04em'}}>
              <span style={{color:T.textMuted}}>{org.market_state}{org.city?` · ${org.city}`:''}</span>
              <span style={{color:T.textFaint}}>|</span>
              <span style={{color:status.color,letterSpacing:'0.16em'}}>● {status.label}</span>
            </div>
          </div>

          {/* Days */}
          <div className="hs-card-days" style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center'}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:3}}>Last order</div>
            {days===null
              ?<div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.cyan,lineHeight:0.9}}>—</div>
              :<div style={{display:'flex',alignItems:'baseline',gap:4}}><span style={{fontFamily:'Teko,sans-serif',fontSize:32,fontWeight:600,color:daysColor,lineHeight:0.9}}>{days}</span><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.12em'}}>DAYS</span></div>}
            {org.last_order_date&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,marginTop:3}}>{new Date(org.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>}
          </div>

          {/* Primary contact */}
          <div className="hs-card-contact" style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center'}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:3}}>Primary contact</div>
            {primaryContact
              ?<>
                <div style={{fontFamily:'Teko,sans-serif',fontSize:15,letterSpacing:'0.06em',color:T.text,fontWeight:500,lineHeight:1.1}}>{primaryContact.full_name||`${primaryContact.first_name||''} ${primaryContact.last_name||''}`.trim()}</div>
                {primaryContact.job_role&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textSubtle,marginTop:2,letterSpacing:'0.06em',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{primaryContact.job_role.toUpperCase()}</div>}
                {(primaryContact.phone||primaryContact.mobile)&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textMuted,marginTop:4}}>{primaryContact.phone||primaryContact.mobile}</div>}
              </>
              :phone
                ?<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textMuted}}>{phone}</div>
                :<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textFaint}}>—</div>}
          </div>
        </div>

        {/* 8-button action grid — always below the info row */}
        <div className="hs-card-actions" style={{padding:'0 56px 10px 70px',display:'grid',gridTemplateColumns:'1fr 1fr',gap:'4px 8px',borderTop:`1px solid ${T.border}`}}>
          {/* Row 1 */}
          <CardBtn href={phone?`tel:${phone}`:undefined} color={T.yellow} label="CALL" icon={<PhoneI s={12}/>} disabled={!phone}/>
          <CardBtn href={phone?`sms:${phone}`:undefined} color={T.textMuted} label="TEXT" icon={<TextI s={12}/>} disabled={!phone}/>
          {/* Row 2 */}
          <CardBtn href={email?`mailto:${email}`:undefined} color={T.textMuted} label="EMAIL" icon={<MailI s={12}/>} disabled={!email}/>
          <CardBtn onClick={openBrief} color={T.cyan} label="BRIEF" icon={<BookI s={12}/>}/>
          {/* Row 3 */}
          <CardBtn onClick={requestTraining} color={T.textMuted} label="TRAINING" icon={<StarI s={12}/>} disabled={!zohoIdNumeric}/>
          <CardBtn onClick={sendMenu} color={T.textMuted} label="SEND MENU" icon={<SendI s={12}/>} disabled={!email}/>
          {/* Row 4 */}
          {isUntargeted
            ?<CardBtn onClick={prospect} color={T.cyan} label="PROSPECT" icon={<BoxI s={12}/>}/>
            :<CardBtn onClick={newProduct} color={T.textMuted} label="NEW PRODUCT" icon={<BoxI s={12}/>} disabled={!zohoIdNumeric}/>}
          <CardBtn onClick={flag} color={isFlagged?T.magenta:T.redSystems} label="FLAG PETE" icon={<FlagI s={12}/>} filled={isFlagged}/>
        </div>
      </div>
    </a>
  );
}

// ─── Card action button ───────────────────────────────────────────────────────
function CardBtn({href,onClick,color,label,icon,disabled,filled}:{href?:string;onClick?:()=>void;color:string;label:string;icon:React.ReactNode;disabled?:boolean;filled?:boolean}) {
  const style:React.CSSProperties={height:32,padding:'0 10px',background:filled?`${color}22`:disabled?'transparent':'transparent',border:`1px solid ${disabled?T.border:filled?color:color+'66'}`,color:disabled?T.border:color,fontFamily:'Teko,sans-serif',fontSize:12,letterSpacing:'0.18em',textTransform:'uppercase' as const,textDecoration:'none',display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,cursor:disabled?'default':'pointer',width:'100%',opacity:disabled?0.35:1};
  if (href&&!disabled) return <a href={href} onClick={e=>e.stopPropagation()} style={style}>{icon}{label}</a>;
  return <button type="button" onClick={e=>{e.stopPropagation();onClick?.();}} disabled={disabled} style={style}>{icon}{label}</button>;
}
