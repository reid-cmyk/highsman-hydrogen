/**
 * app/routes/sales-staging._index.tsx
 * /sales-staging — CRM Account List (Supabase-backed)
 * Redesigned per design handoff: Sales Floor Redesign v2
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useFetcher, useSearchParams} from '@remix-run/react';
import {useMemo, useState, useEffect, useRef} from 'react';
import {isStagingAuthed, buildStagingLoginCookie, buildStagingLogoutCookie, checkStagingPassword} from '~/lib/staging-auth';
import type {OrgRow} from '~/lib/supabase-orgs';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | Sales Floor'},
  {name: 'robots', content: 'noindex, nofollow, noarchive'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#0A0A0A', surface: '#141414', surfaceElev: '#1A1A1A',
  border: '#1F1F1F', borderStrong: '#2F2F2F',
  text: '#F5F5F5', textMuted: '#C8C8C8', textSubtle: '#9C9C9C', textFaint: '#6A6A6A',
  yellow: '#FFD500', yellowWarm: '#c8a84b', magenta: '#FF3B7F',
  cyan: '#00D4FF', green: '#00E676', redSystems: '#FF3355', redAlert: '#B80020',
  statusWarn: '#FFB300',
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

const STATUS: Record<string, {color: string; label: string}> = {
  good: {color: T.green,      label: 'ON CADENCE'},
  warn: {color: T.statusWarn, label: 'APPROACHING'},
  slip: {color: '#FF8A00',    label: 'SLIPPING'},
  risk: {color: T.redSystems, label: 'AT RISK'},
  cold: {color: T.redAlert,   label: 'COLD'},
  new:  {color: T.cyan,       label: 'ONBOARDING'},
};

const TIER_COLOR: Record<string, string> = {
  A: T.yellow, B: T.cyan, C: T.magenta,
};

function tierColor(tier: string | null): string {
  return (tier && TIER_COLOR[tier]) || T.textFaint;
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── SVG Icons ────────────────────────────────────────────────────────────────
const Icon = ({d, size = 14}: {d: string; size?: number}) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="1.8" strokeLinecap="square" strokeLinejoin="miter"
    style={{display: 'block', flexShrink: 0}}>
    <path d={d} />
  </svg>
);
const PhoneI = ({size}: {size?: number}) => <Icon size={size} d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>;
const TextI  = ({size}: {size?: number}) => <Icon size={size} d="M3 5h18v12h-8l-5 4v-4H3z"/>;
const MailI  = ({size}: {size?: number}) => <Icon size={size} d="M3 6h18v12H3zM3 6l9 7 9-7"/>;
const FlagI  = ({size}: {size?: number}) => <Icon size={size} d="M5 3v18M5 4h12l-2 4 2 4H5"/>;
const SearchI = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="1.8">
    <circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>
  </svg>
);

// ─── Action ───────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const fd = await request.formData();
  const intent = String(fd.get('intent') || 'login');

  if (intent === 'login') {
    const password = String(fd.get('password') || '');
    if (checkStagingPassword(password, env)) {
      return json({ok: true, error: null}, {headers: {'Set-Cookie': buildStagingLoginCookie()}});
    }
    return json({ok: false, error: 'Incorrect password'});
  }

  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
  if (intent === 'logout') {
    return json({ok: true, error: null}, {headers: {'Set-Cookie': buildStagingLogoutCookie()}});
  }
  if (intent === 'prospect' || intent === 'flag_pete') {
    const org_id = String(fd.get('org_id') || '');
    if (!org_id) return json({ok: false, error: 'missing org_id'}, {status: 400});
    const sbH = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal'};
    if (intent === 'prospect') {
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {method:'PATCH', headers:sbH, body:JSON.stringify({lifecycle_stage:'prospect', updated_at:new Date().toISOString()})});
    } else {
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}&select=tags`, {headers:{apikey:env.SUPABASE_SERVICE_KEY, Authorization:`Bearer ${env.SUPABASE_SERVICE_KEY}`}});
      const rows = await res.json();
      const tags: string[] = rows?.[0]?.tags || [];
      const newTags = tags.includes('pete-followup') ? tags.filter((t:string)=>t!=='pete-followup') : [...tags, 'pete-followup'];
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {method:'PATCH', headers:sbH, body:JSON.stringify({tags:newTags})});
    }
    return json({ok: true, intent, org_id});
  }
  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({authenticated: false, orgs: [], counts: null, stageCounts: null, stateFilter: 'ALL', stageFilter: 'active'});
  }
  const url = new URL(request.url);
  const stateFilter = url.searchParams.get('state') || 'ALL';
  const stageFilter = url.searchParams.get('stage') || 'active';
  const base = env.SUPABASE_URL;
  const headers = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const select = ['id','name','market_state','city','phone','lifecycle_stage','tier','last_order_date','tags','online_menus','do_not_contact','risk_of_loss','reorder_status','zoho_account_id','website','contacts(id,email,phone,mobile,full_name,first_name,last_name,is_primary_buyer,job_role)'].join(',');
  const params = new URLSearchParams({select, order: 'name.asc', limit: '2000'});
  if (stateFilter !== 'ALL') params.set('market_state', `eq.${stateFilter}`);
  if (stageFilter !== 'all') params.set('lifecycle_stage', `eq.${stageFilter}`);
  let orgs: OrgRow[] = [];
  try {
    const res = await fetch(`${base}/rest/v1/organizations?${params}`, {headers});
    if (res.ok) orgs = await res.json();
  } catch {}

  // Stage counts (current state filter)
  let stageCounts: Record<string, number> = {};
  try {
    const sp = new URLSearchParams({select: 'lifecycle_stage', limit: '2000'});
    if (stateFilter !== 'ALL') sp.set('market_state', `eq.${stateFilter}`);
    const sr = await fetch(`${base}/rest/v1/organizations?${sp}`, {headers});
    const rows: any[] = await sr.json();
    for (const r of rows) { const s = r.lifecycle_stage || 'unknown'; stageCounts[s] = (stageCounts[s] || 0) + 1; }
  } catch {}

  // State counts (current stage filter)
  let counts: Record<string, number> = {};
  try {
    const cp = new URLSearchParams({select: 'market_state', limit: '2000'});
    if (stageFilter !== 'all') cp.set('lifecycle_stage', `eq.${stageFilter}`);
    const cr = await fetch(`${base}/rest/v1/organizations?${cp}`, {headers});
    const rows: any[] = await cr.json();
    counts.ALL = rows.length;
    for (const r of rows) { const s = r.market_state || 'OTHER'; counts[s] = (counts[s] || 0) + 1; }
  } catch {}

  return json({authenticated: true, orgs, counts, stageCounts, stateFilter, stageFilter});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function SalesStaging() {
  const data = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  if (!data.authenticated) return <LoginScreen error={actionData?.error} />;
  return <Dashboard data={data} />;
}

// ─── Login ────────────────────────────────────────────────────────────────────
function LoginScreen({error}: {error?: string | null}) {
  return (
    <div style={{minHeight:'100vh', background:T.bg, display:'flex', alignItems:'center', justifyContent:'center', padding:'24px',
      backgroundImage:`radial-gradient(ellipse at top, rgba(255,213,0,0.04) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(255,51,85,0.025) 0%, transparent 55%)`}}>
      <div style={{width:'100%', maxWidth:'360px'}}>
        <div style={{textAlign:'center', marginBottom:'32px'}}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px', marginBottom:'20px'}} />
          <div style={{fontFamily:'Teko,sans-serif', fontSize:'32px', fontWeight:500, letterSpacing:'0.18em', color:T.text, textTransform:'uppercase', lineHeight:1}}>SALES FLOOR</div>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:'10px', color:T.textFaint, letterSpacing:'0.28em', marginTop:'8px', textTransform:'uppercase'}}>Internal · Restricted</div>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="login" />
          <input type="password" name="password" placeholder="Access code" autoFocus
            style={{width:'100%', padding:'12px 14px', background:T.surface, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:'14px', outline:'none', marginBottom:'10px', boxSizing:'border-box', fontFamily:'JetBrains Mono,monospace'}} />
          {error && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:'11px', color:T.redSystems, marginBottom:'10px', letterSpacing:'0.08em'}}>{error}</div>}
          <button type="submit"
            style={{width:'100%', padding:'12px', background:T.yellow, border:`1px solid ${T.yellow}`, color:'#000', fontFamily:'Teko,sans-serif', fontSize:'18px', fontWeight:600, letterSpacing:'0.20em', textTransform:'uppercase', cursor:'pointer'}}>
            ENTER
          </button>
        </Form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const STATES = ['ALL','NJ','MA','NY','RI','MO'];
const ALL_STAGES = ['active','untargeted','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due','churned','all'];
const STAGE_LABELS: Record<string, string> = {active:'Active', untargeted:'Untargeted', prospect:'Prospect', contacted:'Contacted', qualified:'Qualified', sample_sent:'Sample Sent', first_order_pending:'Onboarding', reorder_due:'Reorder Due', churned:'Churned', all:'All'};

function Dashboard({data}: {data: any}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const stateFilter: string = data.stateFilter || 'ALL';
  const stageFilter: string = data.stageFilter || 'active';
  const orgs: OrgRow[] = data.orgs || [];
  const counts: Record<string, number> = data.counts || {};
  const stageCounts: Record<string, number> = data.stageCounts || {};

  // ⌘K global search focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  function setFilter(key: string, val: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, val);
    setSearchParams(next, {replace: true});
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter(o => o.name.toLowerCase().includes(q) || (o.city||'').toLowerCase().includes(q) || (o.phone||'').includes(q));
  }, [orgs, search]);

  // Stats for strip
  const activeCount = stageCounts['active'] || 0;
  const reorderDue = orgs.filter(o => o.reorder_status === 'due').length;
  const slipping = orgs.filter(o => { const d = daysSince(o.last_order_date); return d !== null && d > 30 && d <= 60; }).length;
  const atRisk = orgs.filter(o => { const d = daysSince(o.last_order_date); return d !== null && d > 60; }).length;
  const flagged = orgs.filter(o => (o.tags as any)?.includes('pete-followup')).length;

  return (
    <div style={{minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif', display:'flex', flexDirection:'column',
      backgroundImage:`radial-gradient(ellipse at top, rgba(255,213,0,0.04) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(255,51,85,0.025) 0%, transparent 55%)`}}>
      <TopBar />
      <div style={{display:'flex', flex:1}}>
        <SideNav activeItem="Accounts" stageCounts={stageCounts} onStageChange={(s) => setFilter('stage', s)} activeStage={stageFilter} />
        <div style={{flex:1, minWidth:0, display:'flex', flexDirection:'column'}}>
          {/* Page header */}
          <div style={{padding:'24px 28px 20px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'flex-end', justifyContent:'space-between', position:'relative', overflow:'hidden'}}>
            <SweepLine />
            <div>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.32em', color:T.textFaint, textTransform:'uppercase'}}>Sales Floor / Workspace</div>
              <div style={{display:'flex', alignItems:'baseline', gap:14, marginTop:4}}>
                <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:38, fontWeight:500, letterSpacing:'0.18em', color:T.text, textTransform:'uppercase'}}>Accounts</h1>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textSubtle, letterSpacing:'0.10em'}}>
                  showing {filtered.length} of {(Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0)} · sorted by RISK ↓
                </span>
              </div>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:10}}>
              <button style={{height:36, padding:'0 14px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', cursor:'pointer'}}>Export CSV</button>
              <button style={{height:36, padding:'0 16px', background:T.yellow, border:`1px solid ${T.yellow}`, color:'#000', fontFamily:'Teko,sans-serif', fontWeight:600, fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', cursor:'pointer'}}>+ New Account</button>
            </div>
          </div>

          {/* Stats strip — numbers count up from 0 on load */}
          <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', background:T.border, gap:1, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`}}>
            <AnimatedStat target={activeCount} label="Active accounts"   src="live"        accent={T.text} />
            <AnimatedStat target={reorderDue}  label="Reorders due ≤ 7d" src="ops/cadence" accent={T.yellow} />
            <AnimatedStat target={slipping}    label="Slipping (30–60d)" src="/cadence"    accent={T.statusWarn} />
            <AnimatedStat target={atRisk}      label="At risk (>60d)"    src="/cadence"    accent={T.redSystems} />
            <AnimatedStat target={flagged}     label="Pete's desk"       src="flags"       accent={T.magenta} />
          </div>

          {/* Filter bar */}
          <div style={{borderBottom:`1px solid ${T.border}`, padding:'20px 28px 18px', background:T.bg}}>
            {/* STATE row */}
            <div style={{display:'flex', alignItems:'center', gap:22}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', minWidth:50}}>State</div>
              <div style={{display:'flex', gap:0, border:`1px solid ${T.borderStrong}`}}>
                {STATES.map(s => {
                  const n = s==='ALL' ? counts['ALL'] : counts[s];
                  const active = stateFilter===s;
                  return (
                    <button key={s} onClick={() => setFilter('state',s)}
                      style={{padding:'7px 12px', background:active?T.yellow:'transparent', color:active?'#000':T.textMuted, fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'0.10em', cursor:'pointer', borderRight:`1px solid ${T.borderStrong}`, display:'flex', alignItems:'center', gap:6, border:'none', borderRight:`1px solid ${T.borderStrong}`}}>
                      <span style={{fontWeight:active?700:500}}>{s}</span>
                      {n != null && <span style={{opacity:active?0.7:0.6, fontSize:10}}>{n}</span>}
                    </button>
                  );
                })}
              </div>
              <div style={{flex:1}}/>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.14em'}}>/api/accounts · live</div>
            </div>

            {/* STAGE + SEARCH row */}
            <div style={{display:'flex', alignItems:'center', gap:22, marginTop:14}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', minWidth:50}}>Stage</div>
              <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
                {ALL_STAGES.filter(s => s==='all' || s===stageFilter || (stageCounts[s]??0)>0).map(s => {
                  const active = stageFilter===s;
                  const n = s==='all' ? (Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0) : (stageCounts[s]??0);
                  return (
                    <button key={s} onClick={() => setFilter('stage',s)}
                      style={{padding:'6px 11px', border:`1px solid ${active?T.textMuted:T.borderStrong}`, color:active?T.text:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', textTransform:'uppercase', background:'transparent', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7}}>
                      <span>{STAGE_LABELS[s]||s}</span>
                      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint}}>{n}</span>
                    </button>
                  );
                })}
              </div>
              <div style={{flex:1}}/>
              <div style={{display:'flex', alignItems:'center', border:`1px solid ${T.borderStrong}`, padding:'0 12px', height:36, width:360, background:T.surface, gap:10}}>
                <SearchI />
                <input ref={searchRef} placeholder="Search by name, city, phone, contact…" value={search} onChange={e=>setSearch(e.target.value)}
                  style={{flex:1, background:'transparent', border:'none', outline:'none', color:T.text, fontSize:13, letterSpacing:'0.02em', fontFamily:'inherit'}} />
                {!search && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.12em', border:`1px solid ${T.borderStrong}`, padding:'1px 5px'}}>⌘K</span>}
                {search && <button onClick={()=>setSearch('')} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontSize:'14px', padding:0}}>✕</button>}
              </div>
            </div>
          </div>

          {/* Account list */}
          <div style={{background:T.bg, flex:1}}>
            {filtered.length === 0 && (
              <div style={{padding:'64px 28px', textAlign:'center', fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.20em', color:T.textFaint, textTransform:'uppercase'}}>
                No accounts match this filter
              </div>
            )}
            {filtered.map(org => <AccountCard key={org.id} org={org} stageFilter={stageFilter} />)}
          </div>

          {/* Footer */}
          <div style={{padding:'18px 28px', borderTop:`1px solid ${T.border}`, display:'flex', justifyContent:'space-between'}}>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.14em'}}>END OF LIST · {filtered.length} ACCOUNTS</div>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.14em'}}>↑↓ navigate · ↵ open</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TopBar ───────────────────────────────────────────────────────────────────
function TopBar() {
  return (
    <div style={{height:64, background:T.bg, borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 28px', flexShrink:0}}>
      <div style={{display:'flex', alignItems:'center', gap:20}}>
        <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png" alt="Highsman" style={{height:'28px'}} />
        <div style={{width:1, height:24, background:T.borderStrong}} />
        <div style={{fontFamily:'Teko,sans-serif', fontSize:20, fontWeight:500, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase'}}>SALES FLOOR</div>
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.18em', border:`1px solid ${T.border}`, padding:'2px 6px'}}>v2.4</span>
      </div>
      <div style={{display:'flex', alignItems:'center', gap:16}}>
        <div style={{display:'flex', alignItems:'center', gap:6}}>
          <div style={{width:7, height:7, borderRadius:'50%', background:T.green, boxShadow:`0 0 6px ${T.green}`}} />
          <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.14em'}}>LIVE</span>
        </div>
        <div style={{width:1, height:20, background:T.border}} />
        <div style={{display:'flex', alignItems:'center', gap:8}}>
          <div style={{width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg, ${T.yellow}, ${T.yellowWarm})`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontWeight:700, fontSize:11, fontFamily:'Teko,sans-serif'}}>SL</div>
          <span style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.14em', color:T.textMuted}}>SKY LIMA</span>
        </div>
        <div style={{width:1, height:20, background:T.border}} />
        <a href="/sales" style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.14em', textDecoration:'none'}}>← Live /sales</a>
        <Form method="post" style={{margin:0}}>
          <input type="hidden" name="intent" value="logout" />
          <button type="submit" style={{background:'none', border:'none', fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.14em', cursor:'pointer', textDecoration:'underline'}}>sign out</button>
        </Form>
      </div>
    </div>
  );
}

// ─── SideNav ──────────────────────────────────────────────────────────────────
function SideNav({activeItem, stageCounts, onStageChange, activeStage}: {activeItem: string; stageCounts: Record<string,number>; onStageChange: (s:string)=>void; activeStage: string}) {
  const items = [
    {label:'Accounts', count: (Object.values(stageCounts) as number[]).reduce((a,b)=>a+b,0)},
    {label:'Dashboard'},
    {label:'Leads', count: stageCounts['prospect']},
    {label:'Reorders Due', count: stageCounts['reorder_due'], dot: (stageCounts['reorder_due']||0)>0},
    {label:'New Customers', count: stageCounts['first_order_pending']},
    {label:'Funnel'},
    {label:'Email'},
    {label:'Text'},
    {label:'Issues'},
    {label:'Vibes'},
  ];
  return (
    <div style={{width:200, flexShrink:0, background:T.bg, borderRight:`1px solid ${T.border}`, display:'flex', flexDirection:'column', paddingTop:8}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.32em', color:T.textFaint, textTransform:'uppercase', padding:'8px 16px 4px'}}>Workspace</div>
      {items.map(item => {
        const active = item.label === activeItem;
        return (
          <a key={item.label} href={item.label==='Accounts'?'/sales-staging':'/sales-floor/app'} style={{textDecoration:'none'}}>
            <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'9px 16px', background:active?`rgba(255,213,0,0.05)`:'transparent', borderLeft:active?`2px solid ${T.yellow}`:`2px solid transparent`, cursor:'pointer'}}>
              <span style={{fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.10em', color:active?T.yellow:T.textSubtle, textTransform:'uppercase', fontWeight:active?500:400}}>{item.label}</span>
              {item.count != null && item.count > 0 && (
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:item.dot?T.yellow:T.textFaint, letterSpacing:'0.06em'}}>
                  {item.count}{item.dot?'•':''}
                </span>
              )}
            </div>
          </a>
        );
      })}
      <div style={{flex:1}} />
      <div style={{padding:'12px 16px', borderTop:`1px solid ${T.border}`}}>
        <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em', marginBottom:4}}>14/25 calls today</div>
        <div style={{height:3, background:T.borderStrong, position:'relative'}}>
          <div style={{position:'absolute', left:0, top:0, bottom:0, width:'56%', background:T.yellow}} />
        </div>
      </div>
    </div>
  );
}

// ─── Account Card ─────────────────────────────────────────────────────────────
function AccountCard({org, stageFilter}: {org: OrgRow; stageFilter: string}) {
  const fetcher = useFetcher();
  const [hovered, setHovered] = useState(false);
  const days = daysSince(org.last_order_date);
  const statusKey = getStatusKey(days);
  const status = STATUS[statusKey];
  const tc = tierColor(org.tier);
  const primaryContact = org.contacts?.find(c => c.is_primary_buyer) || org.contacts?.[0];
  const phone = org.phone || primaryContact?.phone || primaryContact?.mobile;
  const email = primaryContact?.email;
  const isFlagged = (org.tags as any)?.includes('pete-followup');
  const isUntargeted = org.lifecycle_stage === 'untargeted';
  const isProspecting = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'prospect';

  const nameInitials = (org.name || '').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');
  // Try Google favicon from website, fall back to initials block
  const domain = org.website ? (() => { try { return new URL(org.website.startsWith('http')?org.website:`https://${org.website}`).hostname.replace(/^www\./,''); } catch { return null; } })() : null;
  const [logoFailed, setLogoFailed] = useState(false);

  const flagPete = () => {
    const fd = new FormData(); fd.set('intent','flag_pete'); fd.set('org_id',org.id);
    fetcher.submit(fd, {method:'post'});
  };
  const prospect = () => {
    const fd = new FormData(); fd.set('intent','prospect'); fd.set('org_id',org.id);
    fetcher.submit(fd, {method:'post'});
  };

  return (
    <a href={`/sales-staging/account/${org.id}`} style={{textDecoration:'none', display:'block'}} onClick={e=>{if((e.target as HTMLElement).closest('button,a[href^="tel"],a[href^="sms"],a[href^="mailto"]'))e.preventDefault();}}>
      <div
        onMouseEnter={()=>setHovered(true)}
        onMouseLeave={()=>setHovered(false)}
        style={{
          position:'relative', background:hovered?T.surfaceElev:T.surface,
          borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`,
          display:'grid', gridTemplateColumns:'4px 56px 1fr 220px 220px 240px',
          alignItems:'center', gap:0, minHeight:92,
          transition:'background 120ms cubic-bezier(.22,.7,.2,1)',
          opacity: isProspecting&&stageFilter!=='all'?0.35:1,
        }}>
        {/* Status rail */}
        <div style={{alignSelf:'stretch', background:status.color, opacity:statusKey==='good'?0.5:0.85, transition:'opacity 120ms'}} />

        {/* Logo */}
        <div style={{padding:'16px 0 16px 18px'}}>
          <div style={{width:44, height:44, background:'#000', border:`1px solid ${tc===T.textFaint?T.borderStrong:tc}`, color:tc, display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden', flexShrink:0}}>
            {domain && !logoFailed
              ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={org.name} onError={()=>setLogoFailed(true)} style={{width:28, height:28, objectFit:'contain'}} />
              : <span style={{fontFamily:'Teko,sans-serif', fontSize:22, fontWeight:600, letterSpacing:'0.05em', lineHeight:1}}>{nameInitials}</span>
            }
          </div>
        </div>

        {/* Identity */}
        <div style={{padding:'14px 28px 14px 18px', minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:10, flexWrap:'wrap'}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:24, letterSpacing:'0.06em', fontWeight:500, color:T.text, textTransform:'uppercase', lineHeight:1}}>{org.name}</span>
            {org.tier && <span style={{padding:'2px 7px', border:`1px solid ${tc}`, color:tc, fontFamily:'JetBrains Mono,monospace', fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase'}}>TIER {org.tier}</span>}
            {isFlagged && (
              <span style={{display:'inline-flex', alignItems:'center', gap:5, padding:'2px 7px', border:`1px solid ${T.magenta}`, color:T.magenta, fontFamily:'JetBrains Mono,monospace', fontSize:9.5, letterSpacing:'0.16em', textTransform:'uppercase'}}>
                <FlagI size={10}/> FLAGGED PETE
              </span>
            )}
            {isProspecting && <span style={{padding:'2px 7px', border:`1px solid ${T.cyan}`, color:T.cyan, fontFamily:'JetBrains Mono,monospace', fontSize:9.5, letterSpacing:'0.16em'}}>→ PROSPECTING</span>}
          </div>
          <div style={{display:'flex', alignItems:'center', gap:14, marginTop:8, fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, letterSpacing:'0.04em'}}>
            <span style={{color:T.textMuted}}>{org.market_state}{org.city?` · ${org.city}`:''}</span>
            <span style={{color:T.textFaint}}>|</span>
            <span style={{color:status.color, letterSpacing:'0.18em'}}>● {status.label}</span>
          </div>
        </div>

        {/* Days since last order */}
        <div style={{padding:'14px 20px', borderLeft:`1px solid ${T.border}`, height:'100%', display:'flex', flexDirection:'column', justifyContent:'center'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>Last order</div>
          {days === null ? (
            <div style={{display:'flex', alignItems:'baseline', gap:6}}>
              <span style={{fontFamily:'Teko,sans-serif', fontSize:28, fontWeight:500, color:T.cyan, lineHeight:1}}>—</span>
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle}}>NO ORDERS YET</span>
            </div>
          ) : (
            <div style={{display:'flex', alignItems:'baseline', gap:6}}>
              <span style={{fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:600, color:status.color, lineHeight:0.9}}>{days}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.12em'}}>DAYS AGO</span>
            </div>
          )}
          {org.last_order_date && (
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, marginTop:4, letterSpacing:'0.04em'}}>{new Date(org.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</div>
          )}
        </div>

        {/* Primary contact */}
        <div style={{padding:'14px 20px', borderLeft:`1px solid ${T.border}`, height:'100%', display:'flex', flexDirection:'column', justifyContent:'center'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>Primary contact</div>
          {primaryContact ? (
            <>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:17, letterSpacing:'0.06em', color:T.text, fontWeight:500, lineHeight:1.1}}>{primaryContact.full_name||`${primaryContact.first_name||''} ${primaryContact.last_name||''}`.trim()}</div>
              {primaryContact.job_role && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, marginTop:2, letterSpacing:'0.06em'}}>{primaryContact.job_role.toUpperCase()}</div>}
              {(primaryContact.phone||primaryContact.mobile) && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textMuted, marginTop:6, letterSpacing:'0.02em'}}>{primaryContact.phone||primaryContact.mobile}</div>}
            </>
          ) : phone ? (
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:12, color:T.textMuted, letterSpacing:'0.02em'}}>{phone}</div>
          ) : (
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>—</div>
          )}
        </div>

        {/* Actions */}
        <div style={{padding:'14px 20px 14px 16px', borderLeft:`1px solid ${T.border}`, height:'100%', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8}}>
          {isUntargeted && (
            <button type="button" onClick={(e)=>{e.stopPropagation();prospect();}}
              style={{height:36, minWidth:64, padding:'0 12px', background:'transparent', border:`1px solid ${T.cyan}`, color:T.cyan, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:7}}>
              PROSPECT
            </button>
          )}
          {phone && (
            <a href={`tel:${phone}`} onClick={e=>e.stopPropagation()}
              style={{height:36, minWidth:64, padding:'0 12px', background:'transparent', border:`1px solid ${T.yellow}`, color:T.yellow, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:7}}>
              <PhoneI size={13}/> CALL
            </a>
          )}
          {phone && (
            <a href={`sms:${phone}`} onClick={e=>e.stopPropagation()}
              style={{height:36, minWidth:52, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:7}}>
              <TextI size={13}/> TEXT
            </a>
          )}
          {email && (
            <a href={`mailto:${email}`} onClick={e=>e.stopPropagation()}
              style={{height:36, minWidth:64, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.20em', textTransform:'uppercase', textDecoration:'none', display:'inline-flex', alignItems:'center', gap:7}}>
              <MailI size={13}/> EMAIL
            </a>
          )}
          <button type="button" onClick={(e)=>{e.stopPropagation();flagPete();}} title="Flag for Pete"
            style={{height:36, width:36, background:isFlagged?'rgba(255,59,127,0.08)':'transparent', border:`1px solid ${isFlagged?T.magenta:T.borderStrong}`, color:isFlagged?T.magenta:T.textFaint, display:'inline-flex', alignItems:'center', justifyContent:'center', cursor:'pointer'}}>
            <FlagI size={14}/>
          </button>
        </div>
      </div>
    </a>
  );
}

// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    const start = Date.now();
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

function AnimatedStat({target, accent, label, src}: {target: number; accent: string; label: string; src: string}) {
  const val = useCountUp(target);
  return (
    <div style={{background:T.bg, padding:'18px 24px'}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:6}}>{label}</div>
      <div style={{display:'flex', alignItems:'baseline', gap:8}}>
        <span style={{fontFamily:'Teko,sans-serif', fontSize:44, fontWeight:600, color:accent, lineHeight:0.9, textShadow:accent===T.yellow?'0 0 30px rgba(255,213,0,0.18)':'none'}}>{val}</span>
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.14em'}}>{src}</span>
      </div>
    </div>
  );
}

// ─── Sweep line animation ─────────────────────────────────────────────────────
function SweepLine() {
  return (
    <>
      <style>{`
        @keyframes sweep { 0% { left: -25%; } 100% { left: 125%; } }
        .hs-sweep::after { content:''; position:absolute; bottom:0; left:-25%; height:2px; width:25%; background:linear-gradient(90deg,transparent,#FFD500,transparent); opacity:.75; animation:sweep 14s linear infinite; pointer-events:none; }
      `}</style>
      <div className="hs-sweep" style={{position:'absolute', bottom:0, left:0, right:0, height:1, background:T.border}} />
    </>
  );
}
