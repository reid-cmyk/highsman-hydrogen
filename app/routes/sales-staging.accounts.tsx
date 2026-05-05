/**
 * app/routes/sales-staging._index.tsx
 * /sales-staging — CRM Account List (Supabase-backed)
 * Round 2: stage counts fix, 8-button grid, Places autocomplete, Reid's buttons, mobile
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useFetcher, useSearchParams, useNavigate} from '@remix-run/react';
import {useMemo, useState, useEffect, useRef, useCallback} from 'react';
import {isStagingAuthed, buildStagingLoginCookie, checkStagingPassword, buildFullLogoutHeaders} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import type {SFUser} from '~/lib/sf-auth.server';
import type {OrgRow} from '~/lib/supabase-orgs';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';
import {CardActions, CardBtn, PhoneI, TextI, MailI, FlagI, BookI, StarI, SendI, BoxI} from '~/components/SalesFloorCardActions';

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
const TIER_COLOR: Record<string,string> = {A: T.yellow, B: T.cyan, C: T.magenta};
function tierColor(t: string|null) { return (t && TIER_COLOR[t]) || T.textFaint; }
function daysSince(d: string|null): number|null {
  if (!d) return null;
  return Math.floor((Date.now()-new Date(d).getTime())/86400000);
}

// ─── Online menu options (from Zoho picklist) ─────────────────────────────────
const ONLINE_MENU_OPTIONS = ['AIQ','Blaze','Cova','Dispense','Dutchie','Jane','Leafly','Mosaic','Nabis','Self Administrator','Sweed','Treez','Weedmaps'];

// Icons imported from SalesFloorCardActions

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
  const cookie = request.headers.get('Cookie')||'';
  if (!isStagingAuthed(cookie) && !getSFToken(cookie)) return json({ok:false,error:'unauthorized'},{status:401});
  if (intent==='logout') {
    return redirect('/sales-staging/login', {headers: buildFullLogoutHeaders()});
  }

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
    const body:any={name,market_state:state,source:'manual',lifecycle_stage:'untargeted',is_multi_state:false,do_not_contact:false,risk_of_loss:false,risk_of_loss_threshold_days:60,sparkplug_enabled:false,online_menus:[],tags:[],allow_split_promos:false};
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
  const cookie = request.headers.get('Cookie')||'';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) {
    return redirect('/sales-staging/login');
  }
  const url=new URL(request.url);
  const stateFilter=url.searchParams.get('state')||'ALL';
  const stageFilter=url.searchParams.get('stage')||'active';
  const sortBy=url.searchParams.get('sort')||'rank'; // rank | last_order | name
  const base=env.SUPABASE_URL;
  const headers={apikey:env.SUPABASE_SERVICE_KEY,Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`};

  // Fetch the filtered account list
  const select=['id','name','market_state','city','phone','lifecycle_stage','tier','last_order_date','tags','online_menus','do_not_contact','risk_of_loss','reorder_status','zoho_account_id','website','market_rank','market_total','market_revenue_90d','lat','lng','contacts(id,email,phone,mobile,full_name,first_name,last_name,is_primary_buyer,job_role)'].join(',');
  // Sort order: rank sorts by market_rank asc (best = lowest number), others client-side
  const supabaseOrder = sortBy==='rank' ? 'market_rank.asc.nullslast' : 'name.asc';
  const params=new URLSearchParams({select,order:supabaseOrder,limit:'2000'});
  if (stateFilter!=='ALL') params.set('market_state',`eq.${stateFilter}`);
  if (stageFilter!=='all') params.set('lifecycle_stage',`eq.${stageFilter}`);
  let orgs:OrgRow[]=[];
  try { const r=await fetch(`${base}/rest/v1/organizations?${params}`,{headers}); if (r.ok) orgs=await r.json(); } catch {}

  // Per-stage counts using Prefer: count=exact (avoids 1000-row limit)
  const stageList=['active','untargeted','churned','prospect','disqualified'];
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

  // State-filtered stage counts + Tier A — used for the stat bar, reactive to state filter
  const stateQ = stateFilter!=='ALL' ? `&market_state=eq.${stateFilter}` : '';
  let filteredStageCounts:Record<string,number>={};
  let tierAActive=0, tierATotal=0;
  try {
    const statStages=['active','churned','prospect','untargeted'];
    const statResults = await Promise.all([
      ...statStages.map(s =>
        fetch(`${base}/rest/v1/organizations?lifecycle_stage=eq.${s}${stateQ}&select=id`,{method:'GET',headers:sbCountH})
          .then(r=>[s, parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0] as [string,number])
          .catch(()=>[s,0] as [string,number])
      ),
      // all orgs in state (any stage)
      fetch(`${base}/rest/v1/organizations?select=id${stateQ}`,{method:'GET',headers:sbCountH})
        .then(r=>['all', parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0] as [string,number])
        .catch(()=>['all',0] as [string,number]),
      // Tier A active in state
      fetch(`${base}/rest/v1/organizations?tier=eq.A&lifecycle_stage=eq.active${stateQ}&select=id`,{method:'GET',headers:sbCountH})
        .then(r=>['_tierAActive', parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0] as [string,number])
        .catch(()=>['_tierAActive',0] as [string,number]),
      // Tier A total in state
      fetch(`${base}/rest/v1/organizations?tier=eq.A${stateQ}&select=id`,{method:'GET',headers:sbCountH})
        .then(r=>['_tierATotal', parseInt(r.headers.get('Content-Range')?.split('/')[1]||'0',10)||0] as [string,number])
        .catch(()=>['_tierATotal',0] as [string,number]),
    ]);
    filteredStageCounts = Object.fromEntries(statResults.map(([k,v])=>[k,isNaN(v as number)?0:v]));
    tierAActive = (filteredStageCounts['_tierAActive'] as number)||0;
    tierATotal  = (filteredStageCounts['_tierATotal']  as number)||0;
  } catch {}

  const googleMapsKey = (env.GOOGLE_PLACES_NEW_API_KEY || env.GOOGLE_PLACES_API_KEY || null) as string|null;
  return json({authenticated:true,sfUser,orgs,counts,stageCounts,filteredStageCounts,stateFilter,stageFilter,sortBy,tierAActive,tierATotal,googleMapsKey});
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
const ALL_STAGES=['active','untargeted','prospect','churned','disqualified','all'];
const STAGE_LABELS:Record<string,string>={active:'Active',untargeted:'Untargeted',prospect:'Prospect',churned:'Churned',disqualified:'Disqualified',all:'All'};

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
  const [existingMatches, setExistingMatches] = useState<any[]>([]);
  const [apiError, setApiError] = useState<string|null>(null);
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
    if (manualMode || query.length < 2) { setPredictions([]); setExistingMatches([]); setStatus('idle'); return; }
    setStatus('searching');
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      // Search both Places AND existing Supabase accounts in parallel
      const [placesResult, sbResult] = await Promise.allSettled([
        fetch(`/api/places?q=${encodeURIComponent(query)}&type=business`).then(r=>r.json()),
        fetch(`/api/org-search?q=${encodeURIComponent(query)}`).then(r=>r.json()),
      ]);

      if (placesResult.status==='fulfilled') {
        const d = placesResult.value;
        if (d.error?.includes('not set') || d.error?.includes('not configured')) {
          setApiError('Google Places API key not set — add GOOGLE_PLACES_API_KEY to Oxygen env vars.');
        } else if (d.error) {
          setApiError('Google Places unavailable — check API key and billing in Google Cloud Console.');
        } else { setApiError(null); }
        setPredictions(d.predictions||[]);
      }
      if (sbResult.status==='fulfilled' && Array.isArray(sbResult.value?.results)) {
        setExistingMatches(sbResult.value.results);
      }
      setStatus('idle');
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

            {/* Dropdown — existing accounts first, then Places results */}
            {(existingMatches.length > 0 || predictions.length > 0) && !isLoading && (
              <div style={{position:'absolute',top:'100%',left:0,right:0,background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,zIndex:20,maxHeight:300,overflowY:'auto',boxShadow:'0 8px 24px rgba(0,0,0,0.4)'}}>
                {existingMatches.length > 0 && (
                  <>
                    <div style={{padding:'6px 16px 4px',fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.yellow,letterSpacing:'0.18em',textTransform:'uppercase',borderBottom:`1px solid ${T.border}`}}>Already in your database</div>
                    {existingMatches.map((m:any)=>(
                      <a key={m.id} href={`/sales-staging/account/${m.id}`} onClick={onClose}
                        style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 16px',background:'rgba(255,213,0,0.04)',borderBottom:`1px solid ${T.border}`,textDecoration:'none',cursor:'pointer'}}
                        onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,213,0,0.08)')}
                        onMouseLeave={e=>(e.currentTarget.style.background='rgba(255,213,0,0.04)')}>
                        <div>
                          <div style={{fontFamily:'Inter,sans-serif',fontSize:13,color:T.text}}>{m.name}</div>
                          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,marginTop:2,letterSpacing:'0.04em'}}>{[m.market_state,m.city].filter(Boolean).join(' · ')}</div>
                        </div>
                        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.yellow,letterSpacing:'0.14em',border:`1px solid ${T.yellow}44`,padding:'2px 6px'}}>OPEN →</span>
                      </a>
                    ))}
                    {predictions.length > 0 && <div style={{padding:'6px 16px 4px',fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.18em',textTransform:'uppercase',borderBottom:`1px solid ${T.border}`}}>Google Places results</div>}
                    {apiError && predictions.length === 0 && <div style={{padding:'8px 16px',background:'rgba(255,51,85,0.06)',borderTop:`1px solid ${T.border}`}}><span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:'#ff6b6b',letterSpacing:'0.08em'}}>⚠ {apiError}</span></div>}
                  </>
                )}
                {predictions.map((p:any, i:number) => (
                  <button key={i} type="button" onClick={() => selectPlace(p)}
                    style={{display:'block',width:'100%',padding:'12px 16px',background:'transparent',border:'none',borderBottom:`1px solid ${T.border}`,textAlign:'left',cursor:'pointer'}}
                    onMouseEnter={e=>(e.currentTarget.style.background=T.bg)}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                    <div style={{fontFamily:'Inter,sans-serif',fontSize:14,color:T.text,marginBottom:2}}>{p.description||p.mainText||p.text?.text}</div>
                    {p.secondaryText&&<div style={{fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.textFaint,letterSpacing:'0.04em'}}>{p.secondaryText}</div>}
                  </button>
                ))}
              </div>
            )}

            {/* API key error */}
            {apiError && <div style={{marginTop:8,fontFamily:'JetBrains Mono,monospace',fontSize:11,color:T.redSystems,letterSpacing:'0.08em'}}>{apiError} — <button type="button" onClick={()=>setManualMode(true)} style={{background:'none',border:'none',color:T.yellow,cursor:'pointer',fontFamily:'inherit',fontSize:'inherit',textDecoration:'underline',padding:0}}>create manually instead</button></div>}

            {/* No results hint */}
            {!apiError && query.length >= 3 && predictions.length === 0 && status === 'idle' && !isLoading && (
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
  const [viewMode,setViewMode]=useState<'list'|'map'>('list');
  const searchRef=useRef<HTMLInputElement>(null);
  const stateFilter:string=data.stateFilter||'ALL';
  const googleMapsKey:string=data.googleMapsKey||'';
  const stageFilter:string=data.stageFilter||'active';
  const sortBy:string=data.sortBy||'rank';
  const orgs:OrgRow[]=data.orgs||[];
  const counts:Record<string,number>=data.counts||{};
  const stageCounts:Record<string,number>=data.stageCounts||{};
  const tierAActive:number=data.tierAActive||0;
  const tierATotal:number=data.tierATotal||0;
  const tierAPct:number=tierATotal>0?Math.round((tierAActive/tierATotal)*100):0;
  const fsc:Record<string,number>=data.filteredStageCounts||{};

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

  // Stat bar counts — state-filtered (reactive to state tab selection)
  const statAll=(fsc['all'] as number)||0;
  const statActive=(fsc['active'] as number)||0;
  const statChurned=(fsc['churned'] as number)||0;
  const statProspects=(fsc['prospect'] as number)||0;
  const statUntargeted=(fsc['untargeted'] as number)||0;
  const retentionPct=(statActive+statChurned)>0?Math.round((statActive/(statActive+statChurned))*100):0;

  return (
    <SalesFloorLayout current="Accounts" stageCounts={stageCounts} sfUser={data.sfUser}>

          {/* ── Page header — sweep + title + state tabs + search ────────── */}
          <div className="hs-sweep" style={{padding:'20px 28px 0',borderBottom:`1px solid ${T.borderStrong}`,background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
              <div>
                <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:36,fontWeight:500,letterSpacing:'0.06em',textTransform:'uppercase',lineHeight:1}}>Accounts</h1>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,marginTop:4,letterSpacing:'0.12em'}}>
                  showing {filtered.length} · {stateFilter!=='ALL'?stateFilter:'all markets'} · {STAGE_LABELS[stageFilter]||stageFilter}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                {/* LIST / MAP toggle */}
                <div style={{display:'flex',border:`1px solid ${T.borderStrong}`,height:36}}>
                  {(['list','map'] as const).map(mode=>(
                    <button key={mode} onClick={()=>setViewMode(mode)}
                      style={{width:52,border:'none',borderRight:mode==='list'?`1px solid ${T.borderStrong}`:'none',background:viewMode===mode?`rgba(255,213,0,0.10)`:'transparent',color:viewMode===mode?T.yellow:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',cursor:'pointer',textTransform:'uppercase'}}>
                      {mode}
                    </button>
                  ))}
                </div>
                <button onClick={()=>downloadCSV(filtered,stateFilter)} style={{height:36,padding:'0 14px',background:'transparent',border:`1px solid ${T.borderStrong}`,color:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',cursor:'pointer'}}>EXPORT CSV</button>
                <button onClick={()=>setShowNewAccount(true)} style={{height:36,padding:'0 18px',background:T.yellow,border:'none',color:'#000',fontFamily:'Teko,sans-serif',fontWeight:600,fontSize:14,letterSpacing:'0.20em',cursor:'pointer'}}>+ NEW ACCOUNT</button>
              </div>
            </div>

            {/* State tabs (underline style) + search */}
            <div style={{display:'flex',alignItems:'center',gap:12}}>
              <div style={{display:'flex',gap:1}}>
                {STATES.map(s=>{
                  const n=s==='ALL'?counts['ALL']:counts[s];
                  const active=stateFilter===s;
                  return (
                    <button key={s} onClick={()=>setFilter('state',s)}
                      style={{height:32,padding:'0 14px',background:active?`rgba(255,213,0,0.08)`:'transparent',border:'none',borderBottom:`2px solid ${active?T.yellow:'transparent'}`,color:active?T.yellow:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.14em',cursor:'pointer'}}>
                      {s}{n!=null?' '+n:''}
                    </button>
                  );
                })}
              </div>
              <div style={{flex:1}}/>
              {/* Search */}
              <div style={{display:'flex',alignItems:'center',gap:0}}>
                <input ref={searchRef} placeholder="Search by name or city…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{height:32,padding:'0 12px',background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,borderRight:'none',color:T.text,fontFamily:'Inter,sans-serif',fontSize:12,outline:'none',width:240,letterSpacing:'0.02em'}}/>
                <button type="button" onClick={search?()=>setSearch(''):undefined}
                  style={{height:32,padding:'0 10px',background:search?T.yellow:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:search?'#000':T.textFaint,cursor:'pointer',fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'0.10em'}}>
                  {search?'✕':'⌕'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Stat bar — reacts to state filter ───────────────────────── */}
          <div className="hs-stats-strip" style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
            <AnimatedStat target={statAll}        label="All"        src="accounts"  accent={T.text}/>
            <AnimatedStat target={statActive}     label="Active"     src="live"       accent={T.green}/>
            <AnimatedStat target={statChurned}    label="Churned"    src="inactive"   accent={T.textFaint}/>
            <AnimatedStat target={statProspects}  label="Prospects"  src="pipeline"   accent={T.cyan}/>
            <AnimatedStat target={statUntargeted} label="Untargeted" src="cold"       accent={T.textSubtle}/>
            {/* Retention rate: active / (active + churned) */}
            <div style={{background:T.bg,padding:'18px 24px'}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:6}}>Retention</div>
              <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                <span style={{fontFamily:'Teko,sans-serif',fontSize:44,fontWeight:600,color:T.green,lineHeight:0.9}}>{retentionPct}%</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.14em'}}>active/total</span>
              </div>
            </div>
            {/* Tier A penetration: active Tier A / total Tier A (state-filtered) */}
            <div style={{background:T.bg,padding:'18px 24px'}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:6}}>Tier A</div>
              <div style={{display:'flex',alignItems:'baseline',gap:8}}>
                <span style={{fontFamily:'Teko,sans-serif',fontSize:44,fontWeight:600,color:T.yellow,lineHeight:0.9,textShadow:'0 0 30px rgba(255,213,0,0.18)'}}>{tierAPct}%</span>
                <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,letterSpacing:'0.14em'}}>{tierAActive}/{tierATotal}</span>
              </div>
            </div>
          </div>

          {/* ── Stage filter + sort — below stat bar ─────────────────────── */}
          <div style={{borderBottom:`1px solid ${T.border}`,padding:'10px 28px',background:T.bg,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            {ALL_STAGES.filter(s=>s==='all'||(stageCounts[s]??0)>0).map(s=>{
              const active=stageFilter===s;
              const n=s==='all'?(Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0):(stageCounts[s]??0);
              return (
                <button key={s} onClick={()=>setFilter('stage',s)}
                  style={{height:30,padding:'0 12px',border:`1px solid ${active?T.textMuted:T.borderStrong}`,color:active?T.text:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.18em',textTransform:'uppercase',background:'transparent',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
                  <span>{STAGE_LABELS[s]||s}</span>
                  <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{n}</span>
                </button>
              );
            })}
            {/* Sort dropdown — right-aligned in stage row */}
            <div style={{marginLeft:'auto'}}>
              <select value={sortBy} onChange={e=>setFilter('sort',e.target.value)}
                style={{height:30,padding:'0 10px',background:T.surfaceElev,border:`1px solid ${T.borderStrong}`,color:T.text,fontFamily:'Teko,sans-serif',fontSize:13,letterSpacing:'0.14em',cursor:'pointer',outline:'none'}}>
                <option value="rank">Sort: Market Rank</option>
                <option value="last_order">Sort: Last Order</option>
                <option value="name">Sort: Name</option>
              </select>
            </div>
          </div>
          {showNewAccount&&<NewAccountModal onClose={()=>setShowNewAccount(false)}/>}

          {viewMode==='map' ? (
            <MapView orgs={filtered} googleMapsKey={googleMapsKey} stateFilter={stateFilter}/>
          ) : (
            <>
              {/* Account list */}
              <div style={{background:T.bg,flex:1}}>
                {filtered.length===0&&<div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>No accounts match this filter</div>}
                {filtered.map(org=><AccountCard key={org.id} org={org} stageFilter={stageFilter}/>)}
              </div>
              <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>END OF LIST · {filtered.length} ACCOUNTS</div>
                <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>↑↓ navigate · ↵ open</div>
              </div>
            </>
          )}
    </SalesFloorLayout>
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
    {label:'Dashboard',href:'/sales-staging?dash=1'},
    {label:'New Customers',count:stageCounts['first_order_pending'],href:'/sales-staging?stage=first_order_pending'},
    {label:'Reorders Due',count:stageCounts['reorder_due'],dot:(stageCounts['reorder_due']||0)>0,href:'/sales-staging?stage=reorder_due'},
    {label:'Leads',count:stageCounts['prospect'],href:'/sales-staging?stage=prospect'},
    {label:'Sales Orders',href:'/sales-staging/orders'},
    {label:'Accounts',count:(Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0),href:'/sales-staging',active:true},
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

// ─── Map view ─────────────────────────────────────────────────────────────────
const STATE_MAP_CENTER: Record<string,{lat:number;lng:number;zoom:number}> = {
  ALL: {lat:39.8, lng:-79.0, zoom:6},
  NJ:  {lat:40.1, lng:-74.5, zoom:9},
  MA:  {lat:42.2, lng:-71.8, zoom:9},
  NY:  {lat:40.9, lng:-75.5, zoom:8},
  RI:  {lat:41.7, lng:-71.5, zoom:10},
  MO:  {lat:38.5, lng:-92.5, zoom:7},
};
const TIER_PIN_COLOR: Record<string,string> = {A:'#FFD500', B:'#00D4FF', C:'#FF3B7F'};

function makePinSvg(fill:string, letter:string):string {
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><path d="M14 0C6.268 0 0 6.268 0 14c0 7.732 14 22 14 22s14-14.268 14-22C28 6.268 21.732 0 14 0z" fill="${fill}"/><circle cx="14" cy="13" r="6" fill="rgba(0,0,0,0.22)"/><text x="14" y="13" font-family="Arial" font-size="9" font-weight="bold" text-anchor="middle" dominant-baseline="middle" fill="#000">${letter||'·'}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DARK_MAP_STYLE=[
  {elementType:'geometry',stylers:[{color:'#1a1a1a'}]},
  {elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#757575'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#1a1a1a'}]},
  {featureType:'administrative',elementType:'geometry',stylers:[{color:'#3a3a3a'}]},
  {featureType:'administrative.locality',elementType:'labels.text.fill',stylers:[{color:'#aaaaaa'}]},
  {featureType:'poi',stylers:[{visibility:'off'}]},
  {featureType:'road',elementType:'geometry.fill',stylers:[{color:'#2c2c2c'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#212121'}]},
  {featureType:'road',elementType:'labels.text.fill',stylers:[{color:'#757575'}]},
  {featureType:'road.arterial',elementType:'geometry',stylers:[{color:'#373737'}]},
  {featureType:'road.highway',elementType:'geometry',stylers:[{color:'#3c3c3c'}]},
  {featureType:'transit',stylers:[{visibility:'off'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#000000'}]},
];

function MapView({orgs,googleMapsKey,stateFilter}:{orgs:OrgRow[];googleMapsKey:string;stateFilter:string}) {
  const containerRef=useRef<HTMLDivElement>(null);
  const mapRef=useRef<any>(null);
  const markersRef=useRef<any[]>([]);
  const infoWinRef=useRef<any>(null);
  const [mapReady,setMapReady]=useState(false);
  const [loading,setLoading]=useState(true);
  const initStateRef=useRef(stateFilter);

  const geocodedOrgs=useMemo(()=>orgs.filter(o=>(o as any).lat!=null&&(o as any).lng!=null),[orgs]);

  // Rebuild markers whenever map is ready or orgs change
  useEffect(()=>{
    if (!mapReady||!mapRef.current) return;
    const map=mapRef.current;
    const g=(window as any).google.maps;
    markersRef.current.forEach(m=>m.setMap(null));
    markersRef.current=[];
    if (infoWinRef.current) infoWinRef.current.close();

    const iw=new g.InfoWindow({maxWidth:300});
    infoWinRef.current=iw;
    const bounds=new g.LatLngBounds();
    let hasAny=false;

    geocodedOrgs.forEach(org=>{
      const lat=(org as any).lat as number;
      const lng=(org as any).lng as number;
      const pc=org.contacts?.find((c:any)=>c.is_primary_buyer)||org.contacts?.[0];
      const days=daysSince(org.last_order_date);
      const pinFill=TIER_PIN_COLOR[org.tier||'']||'#6A6A6A';

      const marker=new g.Marker({
        position:{lat,lng},map,title:org.name,
        icon:{url:makePinSvg(pinFill,org.tier||''),scaledSize:new g.Size(28,36),anchor:new g.Point(14,36)},
        zIndex:org.tier==='A'?3:org.tier==='B'?2:1,
      });

      const daysColor=days===null?'#00D4FF':days<=30?'#00E676':days<=60?'#FFB300':'#FF3355';
      const daysStr=days===null?'—':`${days}d`;
      const contactName=pc?.full_name||[pc?.first_name,pc?.last_name].filter(Boolean).join(' ')||'—';
      const contactPhone=org.phone||pc?.phone||pc?.mobile||'';
      const tierBadge=TIER_PIN_COLOR[org.tier||'']||'#9C9C9C';
      const iwHtml=`<div style="background:#141414;padding:14px 16px;min-width:220px;font-family:Arial,sans-serif;color:#F5F5F5;border:1px solid #2F2F2F"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;margin-bottom:3px;line-height:1.2">${org.name}</div><div style="font-size:10px;color:#9C9C9C;margin-bottom:10px">${[org.market_state,org.city].filter(Boolean).join(' · ')}${org.tier?` &nbsp;·&nbsp; <span style="color:${tierBadge}">Tier ${org.tier}</span>`:''}</div><div style="display:flex;gap:14px;margin-bottom:12px"><div><div style="font-size:8px;color:#6A6A6A;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:2px">Last Order</div><div style="font-size:20px;font-weight:700;color:${daysColor};line-height:1">${daysStr}</div></div><div style="flex:1"><div style="font-size:8px;color:#6A6A6A;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:2px">Contact</div><div style="font-size:11px;color:#C8C8C8">${contactName}</div>${contactPhone?`<div style="font-size:10px;color:#9C9C9C">${contactPhone}</div>`:''}</div></div><a href="/sales-staging/account/${org.id}" style="display:block;text-align:center;padding:7px 12px;background:#FFD500;color:#000;font-weight:700;font-size:11px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase">Open Account →</a></div>`;

      marker.addListener('click',()=>{iw.setContent(iwHtml);iw.open(map,marker);});
      markersRef.current.push(marker);
      bounds.extend({lat,lng});
      hasAny=true;
    });

    if (hasAny) {
      if (geocodedOrgs.length===1) {
        map.setCenter({lat:(geocodedOrgs[0] as any).lat,lng:(geocodedOrgs[0] as any).lng});
        map.setZoom(13);
      } else {
        map.fitBounds(bounds,{top:60,bottom:60,left:60,right:60});
      }
    }
  },[mapReady,geocodedOrgs]);

  // Init map once
  useEffect(()=>{
    if (!containerRef.current||!googleMapsKey) return;
    const doInit=()=>{
      const c=STATE_MAP_CENTER[initStateRef.current]||STATE_MAP_CENTER['ALL'];
      const map=new (window as any).google.maps.Map(containerRef.current,{
        center:{lat:c.lat,lng:c.lng},zoom:c.zoom,
        styles:DARK_MAP_STYLE,
        mapTypeControl:false,streetViewControl:false,fullscreenControl:false,
        zoomControlOptions:{position:(window as any).google.maps.ControlPosition.RIGHT_CENTER},
      });
      mapRef.current=map;
      setLoading(false);
      setMapReady(true);
    };
    if ((window as any).google?.maps) {
      doInit();
    } else {
      const cb=`__initHSAccMap_${Date.now()}`;
      (window as any)[cb]=()=>{doInit();delete (window as any)[cb];};
      if (!document.querySelector('script[data-hs-maps]')) {
        const s=document.createElement('script');
        s.setAttribute('data-hs-maps','1');
        s.src=`https://maps.googleapis.com/maps/api/js?key=${googleMapsKey}&callback=${cb}`;
        s.async=true;
        document.head.appendChild(s);
      } else {
        // script already loading — add listener
        const existing=document.querySelector('script[data-hs-maps]');
        if (existing) existing.addEventListener('load',doInit);
      }
    }
    return ()=>{
      markersRef.current.forEach(m=>m.setMap(null));
      markersRef.current=[];
      if (infoWinRef.current) infoWinRef.current.close();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);

  return (
    <div style={{flex:1,position:'relative',minHeight:0,display:'flex',flexDirection:'column'}}>
      {loading&&(
        <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:T.bg,zIndex:2}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.24em',color:T.textFaint,textTransform:'uppercase'}}>LOADING MAP…</div>
        </div>
      )}
      <div ref={containerRef} style={{flex:1,width:'100%',minHeight:500}}/>
      {/* Bottom-left stats */}
      <div style={{position:'absolute',bottom:24,left:12,background:'rgba(10,10,10,0.85)',border:`1px solid ${T.borderStrong}`,padding:'5px 12px',pointerEvents:'none'}}>
        <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.12em'}}>
          {geocodedOrgs.length} MAPPED · {orgs.length-geocodedOrgs.length} NO COORDS
        </span>
      </div>
      {/* Top-right legend */}
      <div style={{position:'absolute',top:12,right:12,background:'rgba(10,10,10,0.85)',border:`1px solid ${T.borderStrong}`,padding:'10px 14px'}}>
        {([['A','#FFD500'],['B','#00D4FF'],['C','#FF3B7F'],['—','#6A6A6A']] as [string,string][]).map(([l,c])=>(
          <div key={l} style={{display:'flex',alignItems:'center',gap:8,marginBottom:l==='—'?0:5}}>
            <div style={{width:10,height:10,borderRadius:'50%',background:c,flexShrink:0}}/>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.10em'}}>Tier {l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
const NJ_MENU_URL='https://highsman.com/njmenu';

function AccountCard({org,stageFilter}:{org:OrgRow;stageFilter:string}) {
  const fetcher=useFetcher();
  const [hovered,setHovered]=useState(false);
  const days=daysSince(org.last_order_date);
  // statusKey / STATUS removed — reorder flag system replaces time-based status labels
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

  // Compute reorder flag live (same fallback logic as account detail)
  const computedFlag: string|null = (() => {
    const rs = org.reorder_status;
    if (rs==='low_inv'||rs==='out_of_stock') return rs;
    if (days!==null) {
      const cadence: number|null = (org as any).reorder_cadence_days ?? null;
      if (cadence!==null && days>=cadence) return 'past_cadence';
      if (cadence===null && days>=45) return 'aging';
    }
    return rs&&rs!=='healthy' ? rs : null;
  })();

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
    <div
      onMouseEnter={()=>setHovered(true)} onMouseLeave={()=>setHovered(false)}
      style={{background:hovered?T.surfaceElev:T.surface,borderTop:`1px solid ${T.border}`,borderBottom:`1px solid ${T.border}`,opacity:isProspecting&&stageFilter!=='all'?0.35:1,transition:'background 120ms'}}>
      <div /* wrapper so actions don't get the block click */>

        {/* Main info row */}
        <div className="hs-card-grid" style={{display:'grid',gridTemplateColumns:'4px 56px 1fr 200px 200px',alignItems:'center',gap:0,minHeight:72}}>
          {/* Flag rail — color reflects reorder flag; subtle green when healthy */}
          {(()=>{const FC:Record<string,string>={out_of_stock:T.redSystems,low_inv:'#FF8A00',past_cadence:T.yellow,aging:T.statusWarn};const railColor=computedFlag?FC[computedFlag]||T.yellow:T.green;return <div style={{alignSelf:'stretch',background:railColor,opacity:computedFlag?0.85:0.2}}/>;})()}

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
              <a href={`/sales-staging/account/${org.id}?from=accounts`} style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1,textDecoration:'none'}}>{org.name}</a>
              {/* Reorder flag — computed live so it shows even before DB is stamped */}
              {computedFlag&&(()=>{
                const FC:Record<string,string>={out_of_stock:T.redSystems,low_inv:'#FF8A00',past_cadence:T.yellow,aging:T.statusWarn};
                const FL:Record<string,string>={out_of_stock:'OUT OF STOCK',low_inv:'LOW INV',past_cadence:'PAST CADENCE',aging:'AGING'};
                const fc=FC[computedFlag]||T.textFaint; const fl=FL[computedFlag]||computedFlag.toUpperCase();
                return <span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 7px',border:`1px solid ${fc}`,color:fc,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase',background:`${fc}15`}}><span style={{width:4,height:4,borderRadius:'50%',background:fc,flexShrink:0}}/>{fl}</span>;
              })()}
              {isFlagged&&<span style={{display:'inline-flex',alignItems:'center',gap:4,padding:'2px 6px',border:`1px solid ${T.magenta}`,color:T.magenta,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em',textTransform:'uppercase'}}><FlagI s={9}/> PETE</span>}
              {isProspecting&&<span style={{padding:'2px 6px',border:`1px solid ${T.cyan}`,color:T.cyan,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em'}}>→ PROSPECTING</span>}
            </div>
            {/* Meta row: State · City · Tier · Rank · Status — all inline text, no pill clutter */}
            <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.04em',flexWrap:'wrap'}}>
              <span style={{color:T.textMuted}}>{org.market_state}{org.city?` · ${org.city}`:''}</span>
              {org.tier&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:tierColor(org.tier),letterSpacing:'0.12em'}}>Tier {org.tier}</span></>}
              {org.market_rank&&<><span style={{color:T.borderStrong}}>·</span><span style={{color:T.cyan,letterSpacing:'0.10em'}}>#{org.market_rank} {org.market_state}</span></>}
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

        {/* Action row — primary actions + ··· more menu */}
        <CardActions
          phone={phone} email={email}
          isFlagged={isFlagged} isUntargeted={isUntargeted} zohoId={zohoIdNumeric}
          orgId={org.id}
          onBrief={openBrief} onProspect={prospect} onFlag={flag}
          onTraining={requestTraining} onSendMenu={sendMenu} onNewProduct={newProduct}
        />
      </div>
    </div>
  );
}

// CardActions and CardBtn are imported from ~/components/SalesFloorCardActions
