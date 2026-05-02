/**
 * app/routes/sales-staging.account.$id.tsx
 * /sales-staging/account/:id — Account detail
 * Redesigned per design handoff: Sales Floor Redesign v2
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link, useNavigate} from '@remix-run/react';
import {useState, useRef, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction<typeof loader> = ({data}) => [
  {title: `${(data as any)?.org?.name || 'Account'} | Sales Floor`},
  {name: 'robots', content: 'noindex, nofollow'},
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

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

const TIER_COLOR: Record<string, string> = {A:T.yellow, B:T.cyan, C:T.magenta};
function tierColor(t: string | null) { return (t && TIER_COLOR[t]) || T.textFaint; }

const LC_COLORS: Record<string, string> = {active:T.green, untargeted:T.textFaint, churned:T.textSubtle, dormant:T.statusWarn, prospect:T.cyan, first_order_pending:T.cyan};

// SVG icons
const PhoneIcon = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
const TextIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M3 5h18v12h-8l-5 4v-4H3z"/></svg>;
const MailIcon  = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M3 6h18v12H3zM3 6l9 7 9-7"/></svg>;
const CheckIcon = () => <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#000" strokeWidth="3" strokeLinecap="square"><path d="M5 12l4 4 10-10"/></svg>;
const DeleteIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 6L6 18M6 6l12 12"/></svg>;

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context, params}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({authenticated: false, org: null, contacts: [], notes: [], steps: []});
  }
  const id = params.id!;
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;
  const [orgRes, notesRes, stepsRes] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?id=eq.${id}&select=*,contacts(*)`, {headers: h}),
    fetch(`${base}/rest/v1/org_notes?organization_id=eq.${id}&order=created_at.desc&limit=100`, {headers: h}),
    fetch(`${base}/rest/v1/onboarding_steps?organization_id=eq.${id}&order=step_key.asc`, {headers: h}),
  ]);
  const [orgRows, notes, steps] = await Promise.all([orgRes.json(), notesRes.json(), stepsRes.json()]);
  const org = orgRows?.[0] || null;
  return json({authenticated: true, org, contacts: org?.contacts || [], notes: Array.isArray(notes)?notes:[], steps: Array.isArray(steps)?steps:[]});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function AccountDetail() {
  const {authenticated, org, contacts, notes, steps} = useLoaderData<typeof loader>() as any;
  const [, rerender] = useState(0);
  const refresh = () => rerender(n => n + 1);

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</Link></div>;
  if (!org) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}><div style={{fontFamily:'Teko,sans-serif',fontSize:24,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>Account not found</div><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'JetBrains Mono,monospace',fontSize:12,textDecoration:'none'}}>← back to list</Link></div>;

  const days = daysSince(org.last_order_date);
  const primaryContact = contacts?.find((c:any) => c.is_primary_buyer) || contacts?.[0];
  const tc = tierColor(org.tier);
  const lcColor = LC_COLORS[org.lifecycle_stage] || T.textFaint;
  const isFlagged = (org.tags||[]).includes('pete-followup');
  const nameInitials = (org.name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');
  const domain = org.website ? (() => { try { return new URL(org.website.startsWith('http')?org.website:`https://${org.website}`).hostname.replace(/^www\./,''); } catch { return null; } })() : null;

  return (
    <div style={{minHeight:'100vh', background:T.bg, color:T.text, fontFamily:'Inter,sans-serif', display:'flex', flexDirection:'column',
      backgroundImage:`radial-gradient(ellipse at top, rgba(255,213,0,0.04) 0%, transparent 55%), radial-gradient(ellipse at bottom right, rgba(255,51,85,0.025) 0%, transparent 55%)`}}>

      <style>{`
        @keyframes pulse-ring { 0%{box-shadow:0 0 0 0 rgba(0,230,118,.7),0 0 6px rgba(0,230,118,.5)} 70%{box-shadow:0 0 0 8px rgba(0,230,118,0),0 0 6px rgba(0,230,118,.5)} 100%{box-shadow:0 0 0 0 rgba(0,230,118,0),0 0 6px rgba(0,230,118,.5)} }
        @keyframes sweep { 0%{left:-25%} 100%{left:125%} }
        .hs-sweep { position:relative; overflow:hidden; }
        .hs-sweep::after { content:''; position:absolute; bottom:0; left:-25%; height:2px; width:25%; background:linear-gradient(90deg,transparent,#FFD500,transparent); opacity:.75; animation:sweep 14s linear infinite; pointer-events:none; }
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
        {/* Side nav stub */}
        <div style={{width:200, flexShrink:0, background:T.bg, borderRight:`1px solid ${T.border}`, paddingTop:8}}>
          {['Accounts','Dashboard','Leads','Reorders Due','New Customers','Funnel','Email','Text','Issues','Vibes'].map(item => (
            <a key={item} href={item==='Accounts'?'/sales-staging':'/sales-floor/app'}
              style={{display:'block', padding:'9px 16px', fontFamily:'Teko,sans-serif', fontSize:15, letterSpacing:'0.10em', color:item==='Accounts'?T.yellow:T.textSubtle, borderLeft:item==='Accounts'?`2px solid ${T.yellow}`:'2px solid transparent', textTransform:'uppercase', textDecoration:'none', background:item==='Accounts'?`rgba(255,213,0,0.05)`:'transparent'}}>
              {item}
            </a>
          ))}
        </div>

        <div style={{flex:1, minWidth:0}}>
          {/* Hero */}
          <div style={{borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`, padding:'32px 32px 28px'}}>
            {/* Breadcrumb */}
            <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:16}}>
              <Link to="/sales-staging" className="teko" style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textSubtle, textTransform:'uppercase', textDecoration:'none'}}>← Accounts</Link>
              <span style={{color:T.textFaint}}>/</span>
              {org.market_state && <span style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textFaint, textTransform:'uppercase'}}>{org.market_state}{org.city?` · ${org.city}`:''}</span>}
              <div style={{flex:1}} />
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, letterSpacing:'0.14em'}}>{org.zoho_account_id} · synced</span>
              <DeleteAccountBtn orgId={org.id}/>
            </div>

            {/* Main hero row */}
            <div style={{display:'flex', alignItems:'flex-start', gap:24}}>
              {/* Logo */}
              <HeroLogo name={org.name} initials={nameInitials} domain={domain} tc={tc} />

              {/* Identity */}
              <div style={{flex:1, minWidth:0}}>
                <div style={{display:'flex', alignItems:'center', gap:12, flexWrap:'wrap'}}>
                  <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:52, fontWeight:500, letterSpacing:'0.04em', color:T.text, textTransform:'uppercase', lineHeight:1}}>{org.name}</h1>
                  {/* lifecycle */}
                  <span style={{display:'inline-flex', alignItems:'center', gap:7, padding:'5px 10px', border:`1px solid ${lcColor}`, color:lcColor, fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase'}}>
                    {org.lifecycle_stage === 'active' && <span style={{width:7,height:7,borderRadius:'50%',background:T.green,animation:'pulse-ring 2.4s infinite',flexShrink:0}} />}
                    {org.lifecycle_stage}
                  </span>
                  {org.tier && <span style={{padding:'5px 10px', border:`1px solid ${tc}`, color:tc, fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'0.18em', textTransform:'uppercase'}}>Tier {org.tier}</span>}
                  {org.reorder_status && org.reorder_status !== 'ok' && <span style={{padding:'5px 10px', background:'#000', border:`1px solid ${T.borderStrong}`, color:T.statusWarn, fontFamily:'JetBrains Mono,monospace', fontSize:11, letterSpacing:'0.16em', textTransform:'uppercase'}}>Reorder {org.reorder_status}</span>}
                </div>
                <div style={{marginTop:10, fontSize:12, color:T.textSubtle, letterSpacing:'0.04em', display:'flex', gap:18, flexWrap:'wrap', fontFamily:'JetBrains Mono,monospace'}}>
                  {org.street_address && <span>{org.street_address}{org.city?`, ${org.city}`:''} {org.market_state||''} {org.zip||''}</span>}
                  {org.phone && <><span style={{color:T.textFaint}}>·</span><a href={`tel:${org.phone}`} style={{color:T.textMuted, textDecoration:'none'}}>{org.phone}</a></>}
                  {org.website && <><span style={{color:T.textFaint}}>·</span><a href={org.website} target="_blank" rel="noopener noreferrer" style={{color:T.cyan, textDecoration:'none'}}>{org.website.replace(/^https?:\/\//,'').replace(/\/$/,'')} ↗</a></>}
                  {org.license_number && <><span style={{color:T.textFaint}}>·</span><span>License {org.license_number}</span></>}
                </div>
              </div>

            </div>

            {/* Action strip — horizontal row of all 8 actions */}
            <ActionStrip org={org} primaryContact={primaryContact} isFlagged={isFlagged} />

            {/* Quick stats strip — data we actually have */}
            {(() => {
              const daysColor = days===null?T.cyan:days<=14?T.green:days<=30?T.statusWarn:T.redSystems;
              const onboardingDone = (steps||[]).filter((s:any)=>s.status==='complete').length;
              const onboardingTotal = 4;
              const onboardingPct = onboardingTotal > 0 ? Math.round((onboardingDone/onboardingTotal)*100) : 0;
              const statCells = [
                {l:'Days since order', v:days===null?'—':String(days), sub:days===null?'no orders':'d', accent:daysColor},
                {l:'Last order date',  v:org.last_order_date?new Date(org.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}):'—', sub:'', accent:T.text},
                {l:'Orders (all time)', v:'—', sub:'coming soon', accent:T.textFaint},
                {l:'State rank',        v:'—', sub:'vs. roster', accent:T.textFaint},
                {l:'Contacts',         v:String(contacts?.length||0), sub:contacts?.length===1?'contact':'contacts', accent:T.text},
                {l:'Budtenders',       v:org.budtender_count?String(org.budtender_count):'—', sub:'on floor', accent:T.text},
                {l:'Onboarding',       v:onboardingDone?`${onboardingDone}/${onboardingTotal}`:'—', sub:`${onboardingPct}%`, accent:onboardingPct===100?T.green:T.yellow},
              ];
              return (
                <div style={{marginTop:26, display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:T.border, gap:1, border:`1px solid ${T.border}`}}>
                  {statCells.map((s,i) => (
                    <div key={i} style={{background:T.bg, padding:'16px 18px'}}>
                      <div style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>{s.l}</div>
                      <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                        <span style={{fontFamily:'Teko,sans-serif', fontSize:38, fontWeight:600, color:s.accent, lineHeight:0.9, textShadow:s.accent===T.yellow?'0 0 24px rgba(255,213,0,0.18)':'none'}}>{s.v}</span>
                        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.10em'}}>{s.sub}</span>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>

          {/* Body grid */}
          <div style={{padding:'24px 32px 40px', display:'grid', gridTemplateColumns:'minmax(0,1.6fr) minmax(0,1fr)', gap:24}}>
            {/* Left: Fields panel */}
            <FieldsPanel org={org} />

            {/* Right: Onboarding + Contacts + Notes */}
            <div style={{display:'flex', flexDirection:'column', gap:24}}>
              <OnboardingPanel orgId={org.id} steps={steps} refresh={refresh} />
              <ContactsPanel orgId={org.id} contacts={contacts} refresh={refresh} />
              <NotesPanel orgId={org.id} notes={notes} refresh={refresh} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Hero Logo ────────────────────────────────────────────────────────────────
function HeroLogo({name, initials, domain, tc}: {name:string; initials:string; domain:string|null; tc:string}) {
  const [failed, setFailed] = useState(false);
  return (
    <div style={{width:96, height:96, background:'#000', border:`1px solid ${tc}`, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', flexShrink:0, boxShadow:`0 0 32px ${tc}1A`}}>
      {domain && !failed
        ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={name} onError={()=>setFailed(true)} style={{width:48, height:48, objectFit:'contain'}} />
        : <span style={{fontFamily:'Teko,sans-serif', fontSize:50, fontWeight:600, color:tc, letterSpacing:'0.04em', lineHeight:1}}>{initials}</span>
      }
      <div style={{position:'absolute', bottom:-1, left:-1, right:-1, height:3, background:tc}} />
    </div>
  );
}

// ─── Action Strip ─────────────────────────────────────────────────────────────
function ActionStrip({org, primaryContact, isFlagged}: {org:any; primaryContact:any; isFlagged:boolean}) {
  const flagFetcher = useFetcher();
  const flagPete = () => {
    const fd = new FormData(); fd.set('intent','flag_pete'); fd.set('org_id', org.id);
    flagFetcher.submit(fd, {method:'post', action:'/api/org-update'});
  };
  const sendBrief = () => {
    fetch('/api/brief',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({lead:{First_Name:primaryContact?.first_name||'',Last_Name:primaryContact?.last_name||'',_fullName:primaryContact?.full_name||org.name,Company:org.name,Phone:org.phone||primaryContact?.phone||'',Email:primaryContact?.email||'',_status:'active'}})}).catch(()=>{});
    window.open('/sales-floor/app?brief=1','_brief','width=720,height=620');
  };
  const sendMenu = () => {
    const e = primaryContact?.email;
    if (!e) { alert('No email on file.'); return; }
    const subj = `Highsman NJ Wholesale Menu`;
    const body = `Hi ${primaryContact?.first_name||'there'},\n\nHere's our NJ wholesale menu:\n\nhttps://highsman.com/njmenu\n\nBest,\nSky Lima\nHighsman`;
    window.open(`mailto:${e}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(body)}`);
  };

  const btnBase: React.CSSProperties = {height:40, padding:'0 16px', background:'transparent', border:'none', borderRight:`1px solid ${T.border}`, color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', cursor:'pointer', whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:7, flexShrink:0};

  return (
    <div style={{display:'flex', background:T.surfaceElev, borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, marginTop:20, overflow:'auto'}}>
      {/* CALL */}
      <a href={org.phone?`tel:${org.phone}`:'#'} onClick={!org.phone?e=>e.preventDefault():undefined}
        style={{...btnBase, borderLeft:`2px solid ${T.yellow}`, color:org.phone?T.yellow:T.textFaint, background:org.phone?'rgba(255,213,0,0.04)':'transparent', opacity:org.phone?1:0.4, textDecoration:'none'}}>
        <PhoneIcon/> CALL
      </a>
      {/* TEXT */}
      <a href={org.phone?`sms:${org.phone}`:'#'} onClick={!org.phone?e=>e.preventDefault():undefined}
        style={{...btnBase, opacity:org.phone?1:0.4, textDecoration:'none', color:T.textMuted}}>
        <TextIcon/> TEXT
      </a>
      {/* EMAIL */}
      <a href={primaryContact?.email?`mailto:${primaryContact.email}`:'#'} onClick={!primaryContact?.email?e=>e.preventDefault():undefined}
        style={{...btnBase, opacity:primaryContact?.email?1:0.4, textDecoration:'none', color:T.textMuted}}>
        <MailIcon/> EMAIL {primaryContact?.first_name?primaryContact.first_name.toUpperCase():''}
      </a>

      <div style={{width:1, background:T.borderStrong, margin:'8px 0', flexShrink:0}} />

      {/* BRIEF */}
      <button type="button" onClick={sendBrief} style={btnBase}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V4a1 1 0 0 1 1-1h15v18H6.5A2.5 2.5 0 0 1 4 19.5z"/></svg>
        BRIEF
      </button>
      {/* TRAINING */}
      <button type="button" disabled={!org.zoho_account_id} onClick={()=>{const id=(org.zoho_account_id||'').replace('zcrm_','');if(id)fetch('/api/sales-floor-vibes-training',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({zohoAccountId:id,customerName:org.name})}).catch(()=>{});}}
        style={{...btnBase, opacity:org.zoho_account_id?1:0.4}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
        TRAINING
      </button>
      {/* SEND MENU */}
      <button type="button" disabled={!primaryContact?.email} onClick={sendMenu}
        style={{...btnBase, opacity:primaryContact?.email?1:0.4}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
        SEND MENU
      </button>
      {/* NEW PRODUCT */}
      <button type="button" disabled={!org.zoho_account_id} onClick={()=>{const id=(org.zoho_account_id||'').replace('zcrm_','');if(id)fetch('/api/sales-floor-vibes-product-onboard',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({zohoAccountId:id,customerName:org.name})}).catch(()=>{});}}
        style={{...btnBase, opacity:org.zoho_account_id?1:0.4}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
        NEW PRODUCT
      </button>

      <div style={{flex:1}} />

      {/* FLAG PETE */}
      <button type="button" onClick={flagPete}
        style={{...btnBase, borderRight:'none', borderLeft:`1px solid ${T.border}`, color:isFlagged?T.redSystems:T.textSubtle, background:isFlagged?'rgba(255,51,85,0.08)':'transparent'}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M5 3v18M5 4h12l-2 4 2 4H5"/></svg>
        {isFlagged ? 'PETE FLAGGED' : 'FLAG PETE'}
      </button>
    </div>
  );
}

// ─── Delete Account Button ────────────────────────────────────────────────────
function DeleteAccountBtn({orgId}: {orgId: string}) {
  const [confirming, setConfirming] = useState(false);
  const fetcher = useFetcher();
  const navigate = useNavigate();

  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok && d?.intent === 'delete_account') navigate('/sales-staging');
  }, [fetcher.data, navigate]);

  if (!confirming) {
    return (
      <button type="button" onClick={() => setConfirming(true)}
        style={{marginLeft:8, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.12em', color:T.textFaint, background:'none', border:`1px solid ${T.borderStrong}`, padding:'3px 8px', cursor:'pointer'}}>
        DELETE
      </button>
    );
  }
  return (
    <div style={{display:'flex', alignItems:'center', gap:6, marginLeft:8}}>
      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.08em'}}>Delete this account?</span>
      <button type="button" onClick={() => {
        const fd = new FormData(); fd.set('intent','delete_account'); fd.set('org_id',orgId);
        fetcher.submit(fd, {method:'post', action:'/api/org-update'});
      }} style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:'#000', background:T.redSystems, border:'none', padding:'3px 10px', cursor:'pointer', letterSpacing:'0.10em'}}>CONFIRM</button>
      <button type="button" onClick={() => setConfirming(false)} style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, background:'none', border:`1px solid ${T.borderStrong}`, padding:'3px 8px', cursor:'pointer'}}>CANCEL</button>
    </div>
  );
}

// ─── Section Head ─────────────────────────────────────────────────────────────
function SectionHead({title, source, count}: {title:string; source?:React.ReactNode; count?:string|number}) {
  return (
    <div className="hs-sweep" style={{padding:'18px 16px 12px', borderBottom:`1px solid ${T.border}`, display:'flex', alignItems:'baseline', justifyContent:'space-between'}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.28em', fontWeight:500, color:T.text, textTransform:'uppercase'}}>
        {title}
        {count != null && <span style={{marginLeft:10, fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.12em'}}>{count}</span>}
      </div>
      {source && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.14em'}}>{source}</div>}
    </div>
  );
}

// ─── Sub-group label ──────────────────────────────────────────────────────────
function GroupLabel({children}: {children:React.ReactNode}) {
  return (
    <div style={{padding:'14px 16px 8px', fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.30em', color:T.yellow, textTransform:'uppercase', borderBottom:`1px solid ${T.border}`, borderTop:`1px solid ${T.borderStrong}`}}>
      {children}
    </div>
  );
}

// ─── Two-column field grid ────────────────────────────────────────────────────
function TwoCol({children}: {children:React.ReactNode}) {
  return (
    <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', background:T.border, gap:1}}>
      {(Array.isArray(children)?children:[children]).map((c:any,i:number) => (
        <div style={{background:T.bg}} key={i}>{c}</div>
      ))}
    </div>
  );
}

// ─── Editable Field ───────────────────────────────────────────────────────────
function EditableField({label, field, value, orgId, mono, link, locked, hint}: {label:string; field:string; value:any; orgId:string; mono?:boolean; link?:boolean; locked?:boolean; hint?:string}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value??''));
  const [hovered, setHovered] = useState(false);
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    setEditing(false);
    if (draft === String(value??'')) return;
    const fd = new FormData();
    fd.set('intent','patch_field'); fd.set('org_id',orgId); fd.set('field',field); fd.set('value',draft);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
  };

  const displayVal = String(value??'').trim();

  return (
    <div
      onMouseEnter={() => !locked && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{position:'relative', padding:'14px 16px', background:hovered&&!locked?T.surfaceElev:'transparent', borderBottom:`1px solid ${T.border}`, cursor:locked?'default':'text', transition:'background 100ms cubic-bezier(.22,.7,.2,1)'}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:5}}>
        {label}{locked && <span style={{marginLeft:6, color:T.textFaint}}>· locked</span>}
      </div>
      {editing ? (
        <div style={{display:'flex', gap:4}}>
          <input ref={inputRef} value={draft} onChange={e=>setDraft(e.target.value)} placeholder={hint||''}
            onKeyDown={e => { if(e.key==='Enter')save(); if(e.key==='Escape'){setEditing(false);setDraft(String(value??''));} }}
            style={{flex:1, background:T.surfaceElev, border:`1px solid ${T.yellow}`, color:T.text, fontSize:mono?13:14, fontFamily:mono?'JetBrains Mono,monospace':'Inter,sans-serif', padding:'4px 8px', outline:'none', letterSpacing:mono?'0.02em':0}} />
          <button onClick={save} style={{background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.14em', padding:'0 10px', cursor:'pointer'}}>✓</button>
          <button onClick={()=>{setEditing(false);setDraft(String(value??''));}} style={{background:'none', border:`1px solid ${T.borderStrong}`, color:T.textFaint, padding:'0 8px', cursor:'pointer', fontSize:12}}>✕</button>
        </div>
      ) : (
        <div onClick={() => !locked && setEditing(true)}
          style={{fontFamily:mono?'JetBrains Mono,monospace':'Inter,sans-serif', fontSize:mono?13:14, color:displayVal?(link?T.cyan:T.text):T.textFaint, lineHeight:1.3, letterSpacing:mono?'0.02em':0, textDecoration:link&&displayVal?'underline':'none', textDecorationColor:'rgba(0,212,255,0.4)', textUnderlineOffset:'3px'}}>
          {displayVal
            ? (link ? <a href={displayVal.startsWith('http')?displayVal:`https://${displayVal}`} target="_blank" rel="noopener noreferrer" onClick={e=>e.stopPropagation()} style={{color:T.cyan, textDecoration:'none'}}>{displayVal} ↗</a> : displayVal)
            : <span style={{color:T.textFaint}}>—</span>}
        </div>
      )}
      {hovered && !locked && !editing && (
        <div style={{position:'absolute', top:12, right:12, fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.20em', color:T.yellow, textTransform:'uppercase'}}>edit ↵</div>
      )}
    </div>
  );
}

// ─── SelectField ──────────────────────────────────────────────────────────────
function SelectField({label, field, value, orgId, options}: {label:string; field:string; value:string; orgId:string; options:string[]}) {
  const fetcher = useFetcher();
  const save = (v: string) => {
    if (v===value) return;
    const fd = new FormData(); fd.set('intent','patch_field'); fd.set('org_id',orgId); fd.set('field',field); fd.set('value',v);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
  };
  return (
    <div style={{padding:'14px 16px', borderBottom:`1px solid ${T.border}`}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:5}}>{label}</div>
      <select value={value||''} onChange={e=>save(e.target.value)}
        style={{width:'100%', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:13, fontFamily:'inherit', padding:'4px 6px', outline:'none', cursor:'pointer'}}>
        {options.map(o => <option key={o} value={o}>{o||'—'}</option>)}
      </select>
    </div>
  );
}

// ─── Read-only field ─────────────────────────────────────────────────────────
function ReadOnlyField({label, value, note}: {label:string; value:string; note?:string}) {
  return (
    <div style={{padding:'14px 16px', borderBottom:`1px solid ${T.border}`}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:5}}>
        {label}{note&&<span style={{marginLeft:8, fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.10em'}}>· {note}</span>}
      </div>
      <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:13, color:T.textSubtle, letterSpacing:'0.02em'}}>{value}</div>
    </div>
  );
}

// ─── Online menu constants ────────────────────────────────────────────────────
const MENU_OPTIONS = ['','AIQ','Blaze','Cova','Dispense','Dutchie','Jane','Leafly','Mosaic','Nabis','Self Administrator','Sweed','Treez','Weedmaps'];

// ─── Fields Panel ─────────────────────────────────────────────────────────────
function FieldsPanel({org}: {org: any}) {
  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Account Fields" source="click to edit" />

      <GroupLabel>Status</GroupLabel>
      <TwoCol>
        <SelectField label="Lifecycle" field="lifecycle_stage" value={org.lifecycle_stage} orgId={org.id} options={['active','untargeted','churned','dormant','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due']} />
        <SelectField label="Tier" field="tier" value={org.tier||''} orgId={org.id} options={['','A','B','C']} />
        <SelectField label="Reorder status" field="reorder_status" value={org.reorder_status||'ok'} orgId={org.id} options={['ok','due','overdue']} />
        <EditableField label="Last order date" field="last_order_date" value={org.last_order_date} orgId={org.id} mono hint="YYYY-MM-DD" />
      </TwoCol>

      <GroupLabel>Contact</GroupLabel>
      <TwoCol>
        <EditableField label="Phone" field="phone" value={org.phone} orgId={org.id} mono />
        <EditableField label="Website" field="website" value={org.website} orgId={org.id} link mono />
        <SelectField label="Payment Terms" field="payment_terms" value={org.payment_terms||''} orgId={org.id} options={['','Net 30','Net 15','Net 7','Due on receipt','COD','Prepaid']} />
        <EditableField label="Budtenders" field="budtender_count" value={org.budtender_count} orgId={org.id} mono />
      </TwoCol>

      <GroupLabel>Address</GroupLabel>
      <TwoCol>
        <EditableField label="Street Address" field="street_address" value={org.street_address} orgId={org.id} />
        <EditableField label="City" field="city" value={org.city} orgId={org.id} />
        <SelectField label="State" field="market_state" value={org.market_state||''} orgId={org.id} options={['','NJ','MA','NY','RI','MO','Multi-State']} />
        <EditableField label="ZIP" field="zip" value={org.zip} orgId={org.id} mono />
      </TwoCol>

      <GroupLabel>Compliance</GroupLabel>
      <TwoCol>
        <EditableField label="License #" field="license_number" value={org.license_number} orgId={org.id} mono />
        <EditableField label="EIN" field="ein" value={org.ein} orgId={org.id} mono />
        <EditableField label="Legal name" field="legal_name" value={org.legal_name} orgId={org.id} />
        <SelectField label="Preferred Contact" field="preferred_contact_channel" value={org.preferred_contact_channel||''} orgId={org.id} options={['','call','text','email']} />
      </TwoCol>

      <GroupLabel>Operations</GroupLabel>
      <TwoCol>
        <SelectField label="Online Menu" field="online_menus" value={(Array.isArray(org.online_menus)?org.online_menus[0]:org.online_menus)||''} orgId={org.id} options={MENU_OPTIONS} />
        <ReadOnlyField label="Reorder Cadence" value={org.reorder_cadence_days?`${org.reorder_cadence_days} days avg`:'—'} note="auto-calculated" />
        <EditableField label="Tags" field="tags" value={(org.tags||[]).join(', ')} orgId={org.id} hint="Comma-separated" />
        <SelectField label="Allow Split Promos" field="allow_split_promos" value={org.allow_split_promos?'Yes':'No'} orgId={org.id} options={['Yes','No']} />
        <SelectField label="Sparkplug" field="sparkplug_enabled" value={org.sparkplug_enabled?'Yes':'No'} orgId={org.id} options={['Yes','No']} />
      </TwoCol>

      <GroupLabel>Pop-ups & Training</GroupLabel>
      <TwoCol>
        <EditableField label="Pop-up email" field="pop_up_email" value={org.pop_up_email} orgId={org.id} mono />
        <EditableField label="Pop-up link" field="pop_up_link" value={org.pop_up_link} orgId={org.id} link mono />
        <EditableField label="Last pop-up date" field="last_pop_up_date" value={org.last_pop_up_date} orgId={org.id} mono hint="YYYY-MM-DD" />
        <EditableField label="Training email" field="staff_training_email" value={org.staff_training_email} orgId={org.id} mono />
        <EditableField label="Training link" field="staff_training_link" value={org.staff_training_link} orgId={org.id} link mono />
        <EditableField label="Last training date" field="last_staff_training_date" value={org.last_staff_training_date} orgId={org.id} mono hint="YYYY-MM-DD" />
      </TwoCol>
    </div>
  );
}

// ─── Onboarding Panel ─────────────────────────────────────────────────────────
const ONBOARDING_LABELS: Record<string, string> = {
  visual_merch_shipped: 'Visual merch shipped',
  menu_accuracy_confirmed: 'Menu accuracy confirmed',
  store_locator_confirmed: 'Store locator confirmed',
  digital_assets_sent: 'Digital assets sent',
};

function OnboardingPanel({orgId, steps, refresh}: {orgId:string; steps:any[]; refresh:()=>void}) {
  const fetcher = useFetcher();
  const stepsMap = new Map(steps.map((s:any) => [s.step_key, s]));
  const allKeys = Object.keys(ONBOARDING_LABELS);
  const doneCount = allKeys.filter(k => stepsMap.get(k)?.status === 'complete').length;
  const pct = allKeys.length > 0 ? (doneCount / allKeys.length) * 100 : 0;

  const toggle = (key: string) => {
    const current = stepsMap.get(key)?.status || 'not_started';
    const newStatus = current === 'complete' ? 'not_started' : 'complete';
    const fd = new FormData(); fd.set('intent','toggle_onboarding'); fd.set('org_id',orgId); fd.set('step_key',key); fd.set('status',newStatus);
    fetcher.submit(fd, {method:'post', action:'/api/org-update'});
    refresh();
  };

  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Onboarding" source={`${doneCount}/${allKeys.length} steps · ${Math.round(pct)}%`} />
      <div style={{padding:'14px 16px 6px'}}>
        <div style={{height:4, background:T.surfaceElev, position:'relative'}}>
          <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:T.green, transition:'width 300ms'}} />
        </div>
      </div>
      {allKeys.map((key, i) => {
        const step = stepsMap.get(key);
        const done = step?.status === 'complete';
        return (
          <button key={key} onClick={()=>toggle(key)}
            style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', borderTop:`1px solid ${T.border}`, width:'100%', background:'transparent', cursor:'pointer', textAlign:'left', gap:12}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <span style={{width:14, height:14, border:`1px solid ${done?T.green:T.textFaint}`, background:done?T.green:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {done && <CheckIcon />}
              </span>
              <span style={{color:done?T.textMuted:T.text, fontSize:13.5, textDecoration:done?'line-through':'none', textDecorationColor:T.textFaint}}>{ONBOARDING_LABELS[key]||key}</span>
            </div>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:done?T.textFaint:T.yellow, letterSpacing:'0.10em', flexShrink:0}}>
              {done&&step?.completed_at ? new Date(step.completed_at).toLocaleDateString('en-US',{month:'numeric',day:'numeric'}) : 'open'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Contact Card ─────────────────────────────────────────────────────────────
function ContactCard({contact: c, orgId, refresh, borderTop}: {contact:any; orgId:string; refresh:()=>void; borderTop:boolean}) {
  const [mode, setMode] = useState<'view'|'edit'|'confirm-delete'>('view');
  const [form, setForm] = useState({first_name:c.first_name||'', last_name:c.last_name||'', email:c.email||'', phone:c.phone||c.mobile||'', job_role:c.job_role||'', is_primary:c.is_primary_buyer||false});
  const [saving, setSaving] = useState(false);
  const editFetcher = useFetcher();
  const delFetcher = useFetcher();
  const initials = `${(c.first_name||'')[0]||''}${(c.last_name||'')[0]||''}`.toUpperCase() || '?';
  const name = c.full_name || `${c.first_name||''} ${c.last_name||''}`.trim() || 'Unknown';

  useEffect(() => {
    const d = editFetcher.data as any;
    if (d?.ok) { setSaving(false); setMode('view'); refresh(); }
    else if (d && !d.ok) { setSaving(false); }
  }, [editFetcher.data]);

  useEffect(() => {
    if ((delFetcher.data as any)?.contact_id) refresh();
  }, [delFetcher.data]);

  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set('intent','update_contact'); fd.set('org_id',orgId); fd.set('contact_id',c.id);
    fd.set('first_name',form.first_name.trim()); fd.set('last_name',form.last_name.trim());
    fd.set('email',form.email.trim()); fd.set('phone',form.phone.trim());
    fd.set('job_role',form.job_role.trim()); fd.set('is_primary',String(form.is_primary));
    editFetcher.submit(fd, {method:'post', action:'/api/org-update'});
  };

  const fieldStyle = {background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:12, fontFamily:'Inter,sans-serif', padding:'5px 8px', outline:'none', width:'100%', boxSizing:'border-box' as const};
  const labelStyle = {fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase' as const, marginBottom:3};

  if (mode === 'edit') {
    return (
      <div style={{borderTop:borderTop?`1px solid ${T.border}`:`1px solid ${T.border}`}}>
        <form onSubmit={saveEdit} style={{padding:'14px 16px', background:T.surfaceElev, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.20em', color:T.yellow}}>EDIT CONTACT</span>
            <button type="button" onClick={()=>{setMode('view');setForm({first_name:c.first_name||'',last_name:c.last_name||'',email:c.email||'',phone:c.phone||c.mobile||'',job_role:c.job_role||'',is_primary:c.is_primary_buyer||false});}}
              style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em'}}>CANCEL</button>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div><div style={labelStyle}>First name *</div><input value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))} style={fieldStyle} /></div>
            <div><div style={labelStyle}>Last name</div><input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))} style={fieldStyle} /></div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div><div style={labelStyle}>Email</div><input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} style={fieldStyle} /></div>
            <div><div style={labelStyle}>Phone</div><input type="tel" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} style={fieldStyle} /></div>
          </div>
          <div><div style={labelStyle}>Job role</div><input value={form.job_role} onChange={e=>setForm(f=>({...f,job_role:e.target.value}))} placeholder="e.g. Buyer, GM" style={fieldStyle} /></div>
          <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
            <input type="checkbox" checked={form.is_primary} onChange={e=>setForm(f=>({...f,is_primary:e.target.checked}))} style={{accentColor:T.yellow, width:14, height:14}} />
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textMuted, letterSpacing:'0.12em'}}>PRIMARY BUYER</span>
          </label>
          <div style={{display:'flex', gap:8}}>
            <button type="submit" disabled={saving||!form.first_name.trim()}
              style={{height:32, padding:'0 16px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1}}>
              {saving ? 'SAVING…' : 'SAVE'}
            </button>
          </div>
          {(editFetcher.data as any)?.error && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems}}>{(editFetcher.data as any).error}</div>}
        </form>
      </div>
    );
  }

  return (
    <div style={{padding:'14px 16px', borderTop:borderTop?`1px solid ${T.border}`:`1px solid ${T.border}`}}>
      <div style={{display:'flex', alignItems:'flex-start', gap:12}}>
        <div style={{width:40, height:40, borderRadius:'50%', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, display:'flex', alignItems:'center', justifyContent:'center', color:T.textMuted, fontFamily:'Teko,sans-serif', fontSize:18, fontWeight:500, flexShrink:0}}>{initials}</div>
        <div style={{flex:1, minWidth:0}}>
          <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'space-between'}}>
            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <span style={{fontFamily:'Teko,sans-serif', fontSize:18, letterSpacing:'0.06em', color:T.text, fontWeight:500}}>{name}</span>
              {c.is_primary_buyer && <span style={{padding:'1px 6px', background:'rgba(255,213,0,0.08)', border:`1px solid ${T.yellow}`, color:T.yellow, fontFamily:'JetBrains Mono,monospace', fontSize:9, letterSpacing:'0.16em'}}>PRIMARY</span>}
            </div>
            {/* Actions */}
            {mode === 'view' && (
              <div style={{display:'flex', gap:8, alignItems:'center'}}>
                <button type="button" onClick={()=>setMode('edit')} style={{background:'none', border:'none', color:T.yellow, cursor:'pointer', padding:'2px 4px', fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em'}}>EDIT</button>
                <button type="button" onClick={()=>setMode('confirm-delete')} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', padding:'2px 4px', fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em'}}>REMOVE</button>
              </div>
            )}
            {mode === 'confirm-delete' && (
              <div style={{display:'flex', gap:6, alignItems:'center'}}>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.08em'}}>Remove?</span>
                <button type="button" onClick={()=>{const fd=new FormData();fd.set('intent','delete_contact');fd.set('org_id',orgId);fd.set('contact_id',c.id);delFetcher.submit(fd,{method:'post',action:'/api/org-update'});}} style={{background:T.redSystems, border:'none', color:'#000', fontFamily:'JetBrains Mono,monospace', fontSize:10, padding:'2px 8px', cursor:'pointer', letterSpacing:'0.08em'}}>YES</button>
                <button type="button" onClick={()=>setMode('view')} style={{background:'none', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'JetBrains Mono,monospace', fontSize:10, padding:'2px 6px', cursor:'pointer'}}>NO</button>
              </div>
            )}
          </div>
          {c.job_role && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, marginTop:2, letterSpacing:'0.06em'}}>{c.job_role.toUpperCase()}</div>}
          <div style={{marginTop:6, display:'flex', flexDirection:'column', gap:2}}>
            {c.email && <a href={`mailto:${c.email}`} style={{fontFamily:'JetBrains Mono,monospace', color:T.cyan, fontSize:12, textDecoration:'none', letterSpacing:'0.02em'}}>{c.email}</a>}
            {(c.phone||c.mobile) && <a href={`tel:${c.phone||c.mobile}`} style={{fontFamily:'JetBrains Mono,monospace', color:T.textMuted, fontSize:12, textDecoration:'none', letterSpacing:'0.02em'}}>{c.phone||c.mobile}</a>}
          </div>
          <div style={{marginTop:8, display:'flex', gap:5}}>
            {(c.phone||c.mobile) && <MiniBtn href={`tel:${c.phone||c.mobile}`}><PhoneIcon/></MiniBtn>}
            {(c.phone||c.mobile) && <MiniBtn href={`sms:${c.phone||c.mobile}`}><TextIcon/></MiniBtn>}
            {c.email && <MiniBtn href={`mailto:${c.email}`}><MailIcon/></MiniBtn>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Contacts Panel ───────────────────────────────────────────────────────────
function ContactsPanel({orgId, contacts, refresh}: {orgId:string; contacts: any[]; refresh:()=>void}) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({first_name:'', last_name:'', email:'', phone:'', job_role:'', is_primary:false});
  const [saving, setSaving] = useState(false);
  const fetcher = useFetcher();

  // Watch for successful create
  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok) { setAdding(false); setForm({first_name:'', last_name:'', email:'', phone:'', job_role:'', is_primary:false}); setSaving(false); refresh(); }
    else if (d && !d.ok) { setSaving(false); }
  }, [fetcher.data]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.first_name.trim()) return;
    setSaving(true);
    const fd = new FormData();
    fd.set('org_id', orgId);
    fd.set('first_name', form.first_name.trim());
    fd.set('last_name', form.last_name.trim());
    fd.set('email', form.email.trim());
    fd.set('phone', form.phone.trim());
    fd.set('job_role', form.job_role.trim());
    fd.set('is_primary', String(form.is_primary));
    fetcher.submit(fd, {method:'post', action:'/api/contact-create'});
  };

  const fieldStyle = {background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:12, fontFamily:'Inter,sans-serif', padding:'5px 8px', outline:'none', width:'100%', boxSizing:'border-box' as const};
  const labelStyle = {fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase' as const, marginBottom:3};

  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Contacts" count={`(${contacts.length})`} source={
        <button type="button" onClick={()=>setAdding(a=>!a)}
          style={{background:'none', border:'none', color:adding?T.textFaint:T.yellow, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.14em', cursor:'pointer', padding:0}}>
          {adding ? 'CANCEL' : '+ ADD'}
        </button>
      } />

      {/* Add contact form */}
      {adding && (
        <form onSubmit={submit} style={{padding:'14px 16px', borderBottom:`1px solid ${T.border}`, background:T.surfaceElev, display:'flex', flexDirection:'column', gap:10}}>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div>
              <div style={labelStyle}>First name *</div>
              <input autoFocus value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))} placeholder="First" style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Last name</div>
              <input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))} placeholder="Last" style={fieldStyle} />
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div>
              <div style={labelStyle}>Email</div>
              <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} placeholder="email@..." style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Phone</div>
              <input type="tel" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} placeholder="555-555-5555" style={fieldStyle} />
            </div>
          </div>
          <div>
            <div style={labelStyle}>Job role</div>
            <input value={form.job_role} onChange={e=>setForm(f=>({...f,job_role:e.target.value}))} placeholder="e.g. Buyer, GM, Budtender" style={fieldStyle} />
          </div>
          <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer'}}>
            <input type="checkbox" checked={form.is_primary} onChange={e=>setForm(f=>({...f,is_primary:e.target.checked}))} style={{accentColor:T.yellow, width:14, height:14}} />
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textMuted, letterSpacing:'0.12em'}}>PRIMARY BUYER</span>
          </label>
          <div style={{display:'flex', gap:8}}>
            <button type="submit" disabled={saving||!form.first_name.trim()}
              style={{height:32, padding:'0 16px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1}}>
              {saving ? 'SAVING…' : 'SAVE CONTACT'}
            </button>
            <button type="button" onClick={()=>{setAdding(false);setForm({first_name:'', last_name:'', email:'', phone:'', job_role:'', is_primary:false});}}
              style={{height:32, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer'}}>
              CANCEL
            </button>
          </div>
          {(fetcher.data as any)?.error && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems, letterSpacing:'0.10em'}}>{(fetcher.data as any).error}</div>}
        </form>
      )}

      {contacts.length === 0 && !adding && <div style={{padding:'20px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.10em'}}>No contacts — click + ADD above</div>}
      {contacts.map((c:any, i:number) => (
        <ContactCard key={c.id} contact={c} orgId={orgId} refresh={refresh} borderTop={i > 0} />
      ))}
    </div>
  );
}


function MiniBtn({href, children}: {href:string; children:React.ReactNode}) {
  return (
    <a href={href} style={{width:32, height:32, background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textMuted, display:'inline-flex', alignItems:'center', justifyContent:'center', textDecoration:'none'}}>{children}</a>
  );
}

// ─── Note channel helpers ─────────────────────────────────────────────────────
const CHANNEL_COLORS: Record<string,string> = {CALL:T.green, TEXT:T.cyan, EMAIL:T.yellow, VISIT:T.magenta};
function parseNote(body: string): {channel:string|null; text:string} {
  const m = (body||'').match(/^\[(\w+)\]\s*([\s\S]*)/);
  if (m && ['CALL','TEXT','EMAIL','VISIT'].includes(m[1])) return {channel:m[1], text:m[2]};
  return {channel:null, text:body||''};
}

// ─── Notes Panel ──────────────────────────────────────────────────────────────
function NotesPanel({orgId, notes, refresh}: {orgId:string; notes:any[]; refresh:()=>void}) {
  const [draft, setDraft] = useState('');
  const [composing, setComposing] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string|null>(null);
  const [confirmingNoteId, setConfirmingNoteId] = useState<string|null>(null);
  const addFetcher = useFetcher();
  const delFetcher = useFetcher();

  const submit = () => {
    if (!draft.trim()) return;
    const body = selectedChannel ? `[${selectedChannel}] ${draft}` : draft;
    const fd = new FormData(); fd.set('org_id',orgId); fd.set('body',body);
    addFetcher.submit(fd, {method:'post', action:'/api/org-note-add'});
    setDraft(''); setComposing(false); setSelectedChannel(null); refresh();
  };

  const confirmDelete = (noteId: string) => setConfirmingNoteId(noteId);
  const cancelDelete = () => setConfirmingNoteId(null);
  const executeDelete = (noteId: string) => {
    const fd = new FormData(); fd.set('intent','delete_note'); fd.set('org_id',orgId); fd.set('note_id',noteId);
    delFetcher.submit(fd, {method:'post', action:'/api/org-update'});
    setConfirmingNoteId(null); refresh();
  };

  const CHANNELS = ['CALL','TEXT','EMAIL','VISIT'];

  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Notes" count={`(${notes.length})`} source={
        <button type="button" onClick={()=>setComposing(true)}
          style={{background:'none', border:'none', color:composing?T.textFaint:T.yellow, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.14em', cursor:'pointer', padding:0}}>
          {composing ? '' : '+ ADD ⌘N'}
        </button>
      } />

      {/* Compose area */}
      {composing && (
        <div style={{padding:'12px 16px', borderBottom:`1px solid ${T.border}`, background:T.surfaceElev, display:'flex', flexDirection:'column', gap:8}}>
          {/* Channel selector — always visible in compose */}
          <div style={{display:'flex', gap:6, alignItems:'center'}}>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, letterSpacing:'0.12em', marginRight:2}}>LOG AS:</span>
            {CHANNELS.map(ch => {
              const on = selectedChannel === ch;
              const col = CHANNEL_COLORS[ch];
              return (
                <button key={ch} type="button" onClick={()=>setSelectedChannel(on?null:ch)}
                  style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, padding:'3px 9px', border:`1px solid ${on?col:T.borderStrong}`, color:on?col:T.textSubtle, letterSpacing:'0.14em', background:on?`${col}14`:'transparent', cursor:'pointer', transition:'all 100ms'}}>
                  {ch}
                </button>
              );
            })}
            {selectedChannel && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:CHANNEL_COLORS[selectedChannel], letterSpacing:'0.12em', marginLeft:4}}>✓ {selectedChannel}</span>}
          </div>
          <textarea value={draft} onChange={e=>setDraft(e.target.value)} autoFocus rows={3} placeholder="Add a note about this account…"
            onKeyDown={e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')submit(); if(e.key==='Escape'){setComposing(false);setDraft('');setSelectedChannel(null);}}}
            style={{background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:13, padding:'10px 12px', resize:'vertical', outline:'none', fontFamily:'inherit', lineHeight:1.5}} />
          <div style={{display:'flex', gap:8, alignItems:'center'}}>
            <button onClick={submit} style={{height:32, padding:'0 14px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.18em', textTransform:'uppercase', cursor:'pointer'}}>Save</button>
            <button onClick={()=>{setComposing(false);setDraft('');setSelectedChannel(null);}} style={{height:32, padding:'0 12px', background:'transparent', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer'}}>Cancel</button>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>⌘↵ to save</span>
          </div>
        </div>
      )}

      {/* Click-to-compose placeholder when not open */}
      {!composing && (
        <div style={{padding:'10px 16px', borderBottom:`1px solid ${T.border}`, background:T.surfaceElev, display:'flex', gap:10, alignItems:'center', cursor:'text'}} onClick={()=>setComposing(true)}>
          <img src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/sky-avatar.png" alt="Sky Lima" style={{width:26,height:26,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
          <div style={{flex:1, fontSize:12, color:T.textFaint, fontStyle:'italic'}}>Add a note…</div>
          <div style={{display:'flex', gap:5}}>
            {CHANNELS.map(ch => (
              <button key={ch} type="button" onClick={e=>{e.stopPropagation();setSelectedChannel(ch);setComposing(true);}}
                style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, padding:'2px 6px', border:`1px solid ${T.borderStrong}`, color:T.textSubtle, letterSpacing:'0.12em', background:'transparent', cursor:'pointer'}}>
                {ch}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Note list */}
      {notes.length === 0 && <div style={{padding:'20px 16px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.10em'}}>No notes yet</div>}
      {notes.map((n:any, i:number) => {
        const {channel, text} = parseNote(n.body);
        const chColor = channel ? CHANNEL_COLORS[channel] : null;
        const initials = (n.author_name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('')||'?';
        const isSky = (n.author_name||'').toLowerCase().includes('sky');
        return (
          <div key={n.id} style={{padding:'12px 16px', display:'flex', gap:10, borderTop:`1px solid ${T.border}`}}>
            <div style={{width:26, height:26, borderRadius:'50%', background:isSky?`linear-gradient(135deg,${T.yellow},${T.yellowWarm})`:'#1A1A1A', border:isSky?'none':`1px solid ${T.borderStrong}`, display:'flex', alignItems:'center', justifyContent:'center', color:isSky?'#000':T.textMuted, fontFamily:'Teko,sans-serif', fontSize:12, fontWeight:500, flexShrink:0, marginTop:1}}>{initials}</div>
            <div style={{flex:1, minWidth:0}}>
              <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8, marginBottom:5}}>
                <div style={{display:'flex', alignItems:'center', gap:8}}>
                  <span style={{fontFamily:'Teko,sans-serif', fontSize:14, letterSpacing:'0.10em', color:T.text, fontWeight:500}}>{(n.author_name||'').toUpperCase()}</span>
                  {channel && (
                    <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, padding:'1px 6px', border:`1px solid ${chColor}`, color:chColor, letterSpacing:'0.16em'}}>
                      {channel}
                    </span>
                  )}
                  {n.pinned && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.yellow, letterSpacing:'0.12em'}}>📌</span>}
                </div>
                <div style={{display:'flex', alignItems:'center', gap:8, flexShrink:0}}>
                  <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>
                    {new Date(n.created_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'})}
                  </span>
                  {confirmingNoteId === n.id ? (
                    <div style={{display:'flex', alignItems:'center', gap:5}}>
                      <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.redSystems, letterSpacing:'0.08em'}}>Delete?</span>
                      <button onClick={()=>executeDelete(n.id)} style={{background:T.redSystems, border:'none', color:'#000', fontFamily:'JetBrains Mono,monospace', fontSize:9.5, padding:'2px 7px', cursor:'pointer', letterSpacing:'0.08em'}}>YES</button>
                      <button onClick={cancelDelete} style={{background:'none', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'JetBrains Mono,monospace', fontSize:9.5, padding:'2px 5px', cursor:'pointer'}}>NO</button>
                    </div>
                  ) : (
                    <button onClick={()=>confirmDelete(n.id)} style={{background:'none', border:'none', color:T.textFaint, cursor:'pointer', display:'flex', alignItems:'center', padding:2}}><DeleteIcon /></button>
                  )}
                </div>
              </div>
              <div style={{fontSize:13, color:T.textMuted, lineHeight:1.55, whiteSpace:'pre-wrap'}}>{text}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
