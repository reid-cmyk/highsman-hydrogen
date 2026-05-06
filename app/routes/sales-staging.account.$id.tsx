/**
 * app/routes/sales-staging.account.$id.tsx
 * /sales-staging/account/:id — Account detail
 * Redesigned per design handoff: Sales Floor Redesign v2
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher, Link, useNavigate} from '@remix-run/react';
import {useState, useRef, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';
import {ONBOARDING_STEPS, stepsForMarket} from '~/lib/onboarding-steps';

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
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) {
    return redirect('/sales-staging/login');
  }
  const fromParam = new URL(request.url).searchParams.get('from') || 'accounts';
  const id = params.id!;
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const patchH = {...h, 'Content-Type': 'application/json', Prefer: 'return=minimal'};
  const base = env.SUPABASE_URL;
  const [orgRes, notesRes, stepsRes, ordersRes, sampleRes] = await Promise.all([
    fetch(`${base}/rest/v1/organizations?id=eq.${id}&select=*,contacts(*)`, {headers: h}),
    fetch(`${base}/rest/v1/org_notes?organization_id=eq.${id}&order=created_at.desc&limit=100`, {headers: h}),
    fetch(`${base}/rest/v1/onboarding_steps?organization_id=eq.${id}&order=step_key.asc`, {headers: h}),
    fetch(`${base}/rest/v1/sales_orders?organization_id=eq.${id}&is_sample_order=eq.false&status=not.in.(Cancelled,Rejected)&select=total_amount,order_date&order=order_date.asc`, {headers: h}),
    fetch(`${base}/rest/v1/sales_orders?organization_id=eq.${id}&is_sample_order=eq.true&select=id&limit=1`, {headers: h}),
  ]);
  const [orgRows, notes, rawSteps, orderData, sampleData] = await Promise.all([orgRes.json(), notesRes.json(), stepsRes.json(), ordersRes.json(), sampleRes.json()]);
  const org = orgRows?.[0] || null;
  const orderRows = Array.isArray(orderData) ? orderData : [];
  const totalOrderRevenue = orderRows.reduce((s:number,o:any)=>s+(parseFloat(String(o.total_amount||0).replace(/[$,]/g,''))||0),0);
  const computedCadence: number | null = org?.reorder_cadence_days ?? null;

  // ── Auto-check onboarding steps ──────────────────────────────────────────
  let steps: any[] = Array.isArray(rawSteps) ? rawSteps : [];
  if (org) {
    const stepsMap = new Map(steps.map((s:any) => [s.step_key, s]));
    const now = new Date().toISOString();
    const autoComplete: string[] = [];

    // a) contacts_added — auto if any primary buyer contact exists
    const contacts: any[] = org.contacts || [];
    if (contacts.some((c:any) => c.is_primary_buyer) && stepsMap.get('contacts_added')?.status !== 'complete') {
      autoComplete.push('contacts_added');
    }
    // d) samples_sent — auto if any sample order exists for this org
    const hasSamples = Array.isArray(sampleData) && sampleData.length > 0;
    if (hasSamples && stepsMap.get('samples_sent')?.status !== 'complete') {
      autoComplete.push('samples_sent');
    }

    if (autoComplete.length > 0) {
      await Promise.all(autoComplete.map(async (step_key) => {
        const existing = stepsMap.get(step_key);
        if (existing?.id) {
          await fetch(`${base}/rest/v1/onboarding_steps?id=eq.${existing.id}`,
            {method:'PATCH', headers:patchH, body:JSON.stringify({status:'complete', completed_at:now, completed_by_name:'Auto'})}).catch(()=>{});
        } else {
          await fetch(`${base}/rest/v1/onboarding_steps`,
            {method:'POST', headers:{...patchH, Prefer:'return=minimal'}, body:JSON.stringify({organization_id:id, step_key, status:'complete', completed_at:now, completed_by_name:'Auto'})}).catch(()=>{});
        }
        stepsMap.set(step_key, {step_key, status:'complete', completed_at:now, completed_by_name:'Auto', id: existing?.id});
      }));
      steps = Array.from(stepsMap.values());
    }

    // Stamp onboarding_completed_at if all steps done and not yet stamped
    if (!org.onboarding_completed_at) {
      const relevant = stepsForMarket(org.market_state);
      if (relevant.every(s => stepsMap.get(s.key)?.status === 'complete')) {
        await fetch(`${base}/rest/v1/organizations?id=eq.${id}`,
          {method:'PATCH', headers:patchH, body:JSON.stringify({onboarding_completed_at:now, updated_at:now})}).catch(()=>{});
        org.onboarding_completed_at = now;
      }
    }
  }

  const googleMapsKey = env.GOOGLE_PLACES_NEW_API_KEY || env.GOOGLE_PLACES_API_KEY || null;
  return json({authenticated: true, sfUser, org, contacts: org?.contacts || [], notes: Array.isArray(notes)?notes:[], steps, totalOrderRevenue, computedCadence, googleMapsKey, fromParam});
}

// ─── Component ────────────────────────────────────────────────────────────────
// ─── Count-up hook ────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1400) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      const ease = 1 - Math.pow(1 - p, 3);
      setVal(target * ease);
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

// ─── Account stat bar ─────────────────────────────────────────────────────────
function AccountStatBar({days, daysColor, lastOrderDate, ordersCount, stateRank, marketState, totalRevenue, budtenders, reorderCadence}: any) {
  const animDays     = useCountUp(days ?? 0);
  const animOrders   = useCountUp(ordersCount);
  const animRevenue  = useCountUp(totalRevenue);
  const animBudts    = useCountUp(budtenders);
  const animCadence  = useCountUp(reorderCadence ?? 0);

  const fmt$ = (n: number) => `$${n.toLocaleString('en-US',{minimumFractionDigits:0,maximumFractionDigits:0})}`;
  const lastDate = lastOrderDate
    ? new Date(lastOrderDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})
    : '—';

  const cells = [
    {l:'Days since order', v:days===null?'—':String(Math.round(animDays)),  sub:days===null?'no orders':'d',   accent:daysColor},
    {l:'Last order date',  v:lastDate, sub:'',                                                                    accent:T.text},
    {l:'Orders (all time)',v:String(Math.round(animOrders)),               sub:ordersCount===1?'order':'orders', accent:ordersCount>0?T.text:T.textFaint},
    {l:'Total revenue',    v:fmt$(animRevenue),                            sub:'all time',                        accent:T.yellow},
    {l:'State rank',       v:stateRank.loading?'…':stateRank.rank?`#${stateRank.rank}`:'—', sub:stateRank.total?`of ${stateRank.total} in ${marketState}`:'vs. roster', accent:stateRank.rank?T.cyan:T.textFaint},
    {l:'Budtenders',       v:budtenders?String(Math.round(animBudts)):'—', sub:'on floor',                       accent:T.text},
    {l:'Reorder Cadence',  v:reorderCadence?String(Math.round(animCadence)):'—', sub:reorderCadence?'day avg':'not set', accent:reorderCadence?T.cyan:T.textFaint},
  ];

  return (
    <div style={{marginTop:26, display:'grid', gridTemplateColumns:'repeat(7,1fr)', background:T.border, gap:1, border:`1px solid ${T.border}`}}>
      {cells.map((s,i) => (
        <div key={i} style={{background:T.bg, padding:'16px 18px'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>{s.l}</div>
          <div style={{display:'flex', alignItems:'baseline', gap:6}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:s.l==='Last order date'?22:38, fontWeight:600, color:s.accent, lineHeight:0.9, textShadow:s.accent===T.yellow?'0 0 24px rgba(255,213,0,0.18)':'none'}}>{s.v}</span>
            {s.sub && <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.10em'}}>{s.sub}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AccountDetail() {
  const {authenticated, sfUser, org, contacts, notes, steps, totalOrderRevenue, computedCadence, googleMapsKey, fromParam} = useLoaderData<typeof loader>() as any;
  // Back nav is convention-based: ?from=<slug> → /sales-staging/<slug>
  // Label overrides for slugs that don't title-case cleanly
  const LABEL_OVERRIDES: Record<string,string> = {
    reorders: 'Reorders Due',
    orders: 'Sales Orders',
  };
  const slug = fromParam || 'accounts';
  const backLabel = '← ' + (LABEL_OVERRIDES[slug] || slug.charAt(0).toUpperCase() + slug.slice(1));
  const backHref = `/sales-staging/${slug}`;
  const backNav = {label: backLabel, href: backHref};
  const [, rerender] = useState(0);
  const refresh = () => rerender(n => n + 1);
  const [stateRank, setStateRank] = useState<{rank:number|null; total:number|null; revenue:number|null; litRetailerId:number|null; hsBrandRank:number|null; hsBrandTotal:number|null; hsSharePct:number|null; updatedAt:string|null; loading:boolean}>({rank:null, total:null, revenue:null, litRetailerId:null, hsBrandRank:null, hsBrandTotal:null, hsSharePct:null, updatedAt:null, loading:true});
  const [marketIntel, setMarketIntel] = useState<any>(null);

  useEffect(() => {
    if (!org?.market_state) { setStateRank({rank:null, total:null, revenue:null, litRetailerId:null, hsBrandRank:null, hsBrandTotal:null, hsSharePct:null, updatedAt:null, loading:false}); return; }
    fetch(`/api/state-rank?state=${encodeURIComponent(org.market_state)}&name=${encodeURIComponent(org.name||'')}&org_id=${org.id}`)
      .then(r => r.json())
      .then(d => {
        setStateRank({rank:d.rank||null, total:d.total||null, revenue:d.revenue||null, litRetailerId:d.litRetailerId||null, hsBrandRank:d.hsBrandRank||null, hsBrandTotal:d.hsBrandTotal||null, hsSharePct:d.hsSharePct||null, updatedAt:d.updatedAt||null, loading:false});
        // Once we have litRetailerId, fetch account-level market intelligence
        if (d.litRetailerId) {
          fetch(`/api/lit-retailer-analytics?lit_retailer_id=${d.litRetailerId}&state=${encodeURIComponent(org.market_state)}`)
            .then(r => r.json())
            .then(intel => { if (intel.ok) setMarketIntel(intel); })
            .catch(() => {});
        }
      })
      .catch(() => setStateRank({rank:null, total:null, revenue:null, litRetailerId:null, hsBrandRank:null, hsBrandTotal:null, hsSharePct:null, updatedAt:null, loading:false}));
    // Safety: clear loading after 12s regardless
    const t = setTimeout(() => setStateRank(s => s.loading ? {...s, hsBrandRank:null, hsBrandTotal:null, hsSharePct:null, updatedAt:null, loading:false} : s), 12000);
    return () => clearTimeout(t);
  }, [org?.id]);

  if (!authenticated) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><Link to="/sales-staging/login" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← SIGN IN</Link></div>;
  if (!org) return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center',flexDirection:'column',gap:16}}><div style={{fontFamily:'Teko,sans-serif',fontSize:24,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>Account not found</div><Link to="/sales-staging" style={{color:T.yellow,fontFamily:'JetBrains Mono,monospace',fontSize:12,textDecoration:'none'}}>← back to list</Link></div>;

  const days = daysSince(org.last_order_date);
  const primaryContact = contacts?.find((c:any) => c.is_primary_buyer) || contacts?.[0];
  const tc = tierColor(org.tier);
  const lcColor = LC_COLORS[org.lifecycle_stage] || T.textFaint;
  const isFlagged = (org.tags||[]).includes('pete-followup');

  // Compute reorder flag — use stored value, fall back to live compute so badge
  // shows correctly even before the fire-and-forget DB patch from Reorders page commits.
  const computedFlag: string | null = (() => {
    const rs = org.reorder_status;
    // Lit-based flags (low_inv, out_of_stock) only come from DB — can't compute client-side
    if (rs === 'low_inv' || rs === 'out_of_stock') return rs;
    // Time/cadence flags: compute live from available data as authoritative source
    if (days !== null) {
      const cadence: number | null = org.reorder_cadence_days ?? null;
      if (cadence !== null && days >= cadence) return 'past_cadence';
      if (cadence === null && days >= 45) return 'aging';
    }
    return rs && rs !== 'healthy' ? rs : null;
  })();
  const nameInitials = (org.name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('');
  const domain = org.website ? (() => { try { return new URL(org.website.startsWith('http')?org.website:`https://${org.website}`).hostname.replace(/^www\./,''); } catch { return null; } })() : null;

  return (
    <SalesFloorLayout current="Accounts" sfUser={sfUser}>
          {/* Hero */}
          <div style={{borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`, padding:'32px 32px 28px'}}>
            {/* Breadcrumb */}
            <div style={{display:'flex', alignItems:'center', gap:14, marginBottom:16}}>
              <Link to={backNav.href} className="teko" style={{fontFamily:'Teko,sans-serif', fontSize:12, letterSpacing:'0.24em', color:T.textSubtle, textTransform:'uppercase', textDecoration:'none'}}>{backNav.label}</Link>
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
                  {computedFlag&&(()=>{
                    const FC:Record<string,string>={out_of_stock:T.redSystems,low_inv:'#FF8A00',past_cadence:T.yellow,aging:T.statusWarn};
                    const FL:Record<string,string>={out_of_stock:'OUT OF STOCK',low_inv:'LOW INVENTORY',past_cadence:'PAST CADENCE',aging:'AGING'};
                    const fc=FC[computedFlag]||T.statusWarn; const fl=FL[computedFlag]||computedFlag.toUpperCase();
                    return <span style={{display:'inline-flex',alignItems:'center',gap:7,padding:'5px 10px',border:`1px solid ${fc}`,color:fc,fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'0.18em',textTransform:'uppercase',background:`${fc}12`}}><span style={{width:6,height:6,borderRadius:'50%',background:fc,flexShrink:0}}/>{fl}</span>;
                  })()}
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
              return <AccountStatBar
                days={days} daysColor={daysColor}
                lastOrderDate={org.last_order_date}
                ordersCount={org.orders_count||0}
                stateRank={stateRank} marketState={org.market_state}
                totalRevenue={totalOrderRevenue||0}
                budtenders={org.budtender_count||0}
                reorderCadence={computedCadence || org.reorder_cadence_days || 0}
              />;
            })()}
          </div>

          {/* Market Intelligence bar — full width, between stat bar and body */}
          <MarketIntelBar intel={marketIntel} stateRank={stateRank} />

          {/* Body grid */}
          <div style={{padding:'24px 32px 40px', display:'grid', gridTemplateColumns:'minmax(0,1.6fr) minmax(0,1fr)', gap:24}}>
            {/* Left: Fields panel */}
            <FieldsPanel org={org} computedFlag={computedFlag} googleMapsKey={googleMapsKey} />

            {/* Right: Onboarding + Contacts + Notes */}
            <div style={{display:'flex', flexDirection:'column', gap:24}}>
              <OnboardingPanel orgId={org.id} steps={steps} refresh={refresh} marketState={org.market_state} />
              <ContactsPanel orgId={org.id} contacts={contacts} refresh={refresh} />
              <NotesPanel orgId={org.id} notes={notes} refresh={refresh} sfUser={sfUser} />
            </div>
          </div>
    </SalesFloorLayout>
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
  const flagFetcher   = useFetcher();
  const assetsFetcher = useFetcher();
  const sendAssets = () => {
    // Mark digital_assets_sent step complete
    const fd = new FormData();
    fd.set('intent','toggle_onboarding'); fd.set('org_id', org.id);
    fd.set('step_key','digital_assets_sent'); fd.set('status','complete');
    assetsFetcher.submit(fd, {method:'post', action:'/api/org-update'});
    // TODO: trigger digital assets email template
    alert('Assets step marked complete. Email template will be wired in a future update.');
  };
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
      {/* SEND ASSETS */}
      <button type="button" onClick={sendAssets}
        style={{...btnBase, color:T.cyan, opacity:1}}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
        SEND ASSETS
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
function SelectField({label, field, value, orgId, options, labels}: {label:string; field:string; value:string; orgId:string; options:string[]; labels?: Record<string,string>}) {
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
        {options.map(o => <option key={o} value={o}>{(labels&&labels[o]) || o || '—'}</option>)}
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
// ─── Market Intelligence Bar ──────────────────────────────────────────────────
function MarketIntelBar({intel, stateRank}: {intel: any; stateRank: any}) {
  const fmt$ = (n: number) => `$${(n||0).toLocaleString('en-US',{maximumFractionDigits:0})}`;

  // Build a quick-display object from cached Supabase data.
  // Render the bar whenever we have a rank — even if brand intel is missing yet.
  // Highsman cell shows "not tracked here" when hsBrandRank is null.
  const cached = stateRank?.rank != null ? {
    highsman: stateRank.hsBrandRank ? {rank: stateRank.hsBrandRank, totalBrands: stateRank.hsBrandTotal, sharePercent: stateRank.hsSharePct, revenue: null} : null,
    totalRevenue: stateRank.revenue,
    brands: null,
    categories: null,
    period: null,
    updatedAt: stateRank.updatedAt,
  } : null;

  const display = intel || cached;

  // Show loading state while state rank is still fetching
  if (stateRank?.loading) {
    return (
      <div style={{borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'12px 32px', background:T.surfaceElev, display:'flex', alignItems:'center', gap:8}}>
        <div style={{width:8, height:8, borderRadius:'50%', background:T.textFaint, animation:'pulse-ring 1.4s infinite'}} />
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.12em'}}>Loading market intelligence…</span>
      </div>
    );
  }

  // No data (token not set, account not in Lit data, or API error)
  if (!display) {
    return (
      <div style={{borderTop:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:'10px 32px', background:T.surfaceElev}}>
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.10em'}}>
          {stateRank?.rank ? 'Market intelligence loading…' : 'Market intelligence unavailable — account not found in Lit Alerts data'}
        </span>
      </div>
    );
  }

  const hs = display.highsman;

  return (
    <div style={{borderTop:`1px solid ${T.borderStrong}`, borderBottom:`1px solid ${T.borderStrong}`, background:T.surfaceElev}}>
      {/* Header */}
      <div style={{padding:'10px 32px 0', display:'flex', alignItems:'center', justifyContent:'space-between'}}>
        <span style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.28em', color:T.textFaint, textTransform:'uppercase'}}>Market Intelligence · 90 days</span>
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, letterSpacing:'0.08em'}}>
          {display.period ? `Lit Alerts · ${display.period.beginDate} – ${display.period.endDate}` : display.updatedAt ? `Cached · ${new Date(display.updatedAt).toLocaleDateString('en-US',{month:'short',day:'numeric'})}` : 'Lit Alerts · 90 days'}
        </span>
      </div>

      {/* Metrics strip — 4 columns */}
      <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:1, background:T.border, margin:'10px 32px 14px'}}>

        {/* 1. Highsman brand rank AT THIS ACCOUNT */}
        <div style={{background:T.surfaceElev, padding:'12px 16px'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:3}}>Highsman Rank Here</div>
          {hs ? (
            <>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <span style={{fontFamily:'Teko,sans-serif', fontSize:30, fontWeight:600, color:T.yellow, lineHeight:1}}>#{hs.rank}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle}}>of {hs.totalBrands} brands</span>
              </div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, marginTop:3, letterSpacing:'0.08em'}}>{hs.sharePercent}% of their cannabis revenue</div>
            </>
          ) : (
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>not tracked here</span>
          )}
        </div>

        {/* 2. Account total cannabis revenue — 90 days */}
        <div style={{background:T.surfaceElev, padding:'12px 16px'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:3}}>Account Revenue · 90 Days</div>
          <div style={{display:'flex', alignItems:'baseline', gap:6}}>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:30, fontWeight:600, color:T.cyan, lineHeight:1}}>{fmt$(display.totalRevenue)}</span>
          </div>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, marginTop:3, letterSpacing:'0.08em'}}>est. all cannabis brands</div>
        </div>

        {/* 3. State market share — how important is this account */}
        <div style={{background:T.surfaceElev, padding:'12px 16px'}}>
          <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:3}}>NJ Market Share</div>
          {stateRank?.rank && stateRank?.total ? (
            <>
              <div style={{display:'flex', alignItems:'baseline', gap:6}}>
                <span style={{fontFamily:'Teko,sans-serif', fontSize:30, fontWeight:600, color:T.cyan, lineHeight:1}}>#{stateRank.rank}</span>
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle}}>of {stateRank.total}</span>
              </div>
              <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, marginTop:3, letterSpacing:'0.08em'}}>by revenue in NJ · 90 days</div>
            </>
          ) : (
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>—</span>
          )}
        </div>

        {/* 4. Market Tier — auto-assigned from revenue percentile */}
        {(() => {
          // Compute tier from stateRank (same logic as sync script)
          const rank = stateRank?.rank, total = stateRank?.total;
          const pct = rank && total ? rank / total : null;
          const tier = pct !== null ? (pct <= 0.20 ? 'A' : pct <= 0.50 ? 'B' : 'C') : null;
          const tierColor = tier === 'A' ? T.yellow : tier === 'B' ? T.cyan : T.textMuted;
          const tierLabel = tier === 'A' ? `top ${Math.round(pct!*100)}% of ${stateRank.total}` : tier === 'B' ? `top ${Math.round(pct!*100)}% of ${stateRank.total}` : `bottom 50% of ${stateRank?.total}`;
          const shelfNote = hs?.totalBrands ? `${hs.totalBrands} brands on shelf` : null;
          return (
            <div style={{background:T.surfaceElev, padding:'12px 16px'}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:3}}>Market Tier</div>
              {tier ? (
                <>
                  <div style={{display:'flex', alignItems:'baseline', gap:8}}>
                    <span style={{fontFamily:'Teko,sans-serif', fontSize:38, fontWeight:600, color:tierColor, lineHeight:1}}>Tier {tier}</span>
                  </div>
                  <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, color:T.textFaint, marginTop:3, letterSpacing:'0.08em'}}>{tierLabel}</div>
                  {shelfNote && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:9, color:T.textFaint, marginTop:2, letterSpacing:'0.06em'}}>{shelfNote}</div>}
                </>
              ) : (
                <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>—</span>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ─── Fields Panel ─────────────────────────────────────────────────────────────
function FieldsPanel({org, computedFlag, googleMapsKey}: {org: any; computedFlag: string | null; googleMapsKey?: string | null}) {
  return (
    <div style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Account Fields" source="click to edit" />

      <GroupLabel>Status</GroupLabel>
      <TwoCol>
        <SelectField label="Lifecycle" field="lifecycle_stage" value={org.lifecycle_stage} orgId={org.id}
          options={['untargeted','prospect','active','disqualified','churned']}
          labels={{untargeted:'Untargeted',prospect:'Prospect',active:'Active',disqualified:'Disqualified',churned:'Churned'}} />
        {/* Lead Stage — only shown when lifecycle is Prospect */}
        {org.lifecycle_stage==='prospect'&&(
          <SelectField label="Lead Stage" field="lead_stage" value={org.lead_stage||'new'} orgId={org.id}
            options={['new','working','warm','hot']}
            labels={{new:'New Lead',working:'Working',warm:'Warm',hot:'Hot'}} />
        )}
        <SelectField label="Tier" field="tier" value={org.tier||''} orgId={org.id} options={['','A','B','C']} />
        <SelectField label="Reorder Status" field="reorder_status" value={computedFlag||''} orgId={org.id}
          options={['','healthy','aging','past_cadence','low_inv','out_of_stock']}
          labels={{'':'—', healthy:'Healthy', aging:'Aging', past_cadence:'Past Cadence', low_inv:'Low Inventory', out_of_stock:'Out of Stock'}} />
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
        <SelectField label="State" field="market_state" value={org.market_state||''} orgId={org.id} options={['','AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','Multi-State']} />
        <EditableField label="ZIP" field="zip" value={org.zip} orgId={org.id} mono />
      </TwoCol>

      {/* Map — interactive Google Maps embed, renders inside the app */}
      {(()=>{
        // Build location query: prefer address fields, fall back to city+state
        const parts = [org.street_address, org.city, org.market_state, org.zip].filter(Boolean);
        const addressQuery = parts.join(', ');
        // For the embed: use lat/lng if available (most accurate), else address, else skip
        const embedQuery = org.lat && org.lng ? `${org.lat},${org.lng}` : addressQuery;
        if (!embedQuery || !googleMapsKey) {
          // No key or no location data — show a plain text address with no map
          if (!addressQuery) return null;
          return (
            <div style={{padding:'12px 16px',borderBottom:`1px solid ${T.border}`}}>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,letterSpacing:'0.10em'}}>
                {addressQuery} · <span style={{color:T.textFaint}}>map unavailable</span>
              </div>
            </div>
          );
        }
        // "Open in Google Maps" uses address for better business listing UX
        const mapsOpenUrl = addressQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressQuery)}`
          : `https://www.google.com/maps?q=${org.lat},${org.lng}`;
        // Embed src: place search by address or lat/lng — interactive, renders inside app
        const embedSrc = addressQuery
          ? `https://www.google.com/maps/embed/v1/place?key=${googleMapsKey}&q=${encodeURIComponent(addressQuery)}&zoom=15`
          : `https://www.google.com/maps/embed/v1/view?key=${googleMapsKey}&center=${org.lat},${org.lng}&zoom=15&maptype=roadmap`;
        return (
          <div style={{borderBottom:`1px solid ${T.border}`,position:'relative'}}>
            <iframe
              src={embedSrc}
              width="100%" height="220"
              style={{border:0,display:'block',filter:'grayscale(20%) brightness(0.9)'}}
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={`Map: ${org.name}`}
            />
            {/* Open in Google Maps — uses address so it finds the actual business listing */}
            <a href={mapsOpenUrl} target="_blank" rel="noopener noreferrer"
              style={{position:'absolute',bottom:10,right:10,fontFamily:'JetBrains Mono,monospace',fontSize:10,letterSpacing:'0.12em',color:'#000',background:T.yellow,padding:'5px 10px',textDecoration:'none',fontWeight:600}}>
              OPEN IN GOOGLE MAPS ↗
            </a>
          </div>
        );
      })()}

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

      <GroupLabel>Orders</GroupLabel>
      <OrgOrdersPanel orgId={org.id} orgName={org.name} marketState={org.market_state} />
    </div>
  );
}

// ─── Org Orders Panel ─────────────────────────────────────────────────────────
function OrgOrdersPanel({orgId, orgName, marketState}: {orgId:string; orgName:string; marketState:string}) {
  const [orders, setOrders] = useState<any[]|null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({status:'Submitted', order_date:new Date().toISOString().split('T')[0], total_amount:'', payment_terms:'Net 30'});
  const [saving, setSaving] = useState(false);
  const createFetcher = useFetcher();

  useEffect(() => {
    fetch(`/sales-staging/api/org-orders?org_id=${orgId}`)
      .then(r => r.json())
      .then(d => setOrders(d.orders || []))
      .catch(() => setOrders([]));
  }, [orgId]);

  useEffect(() => {
    const d = createFetcher.data as any;
    if (d?.ok) { setAdding(false); setForm({status:'Submitted', order_date:new Date().toISOString().split('T')[0], total_amount:'', payment_terms:'Net 30'}); setSaving(false);
      // Reload orders
      fetch(`/sales-staging/api/org-orders?org_id=${orgId}`).then(r=>r.json()).then(d=>setOrders(d.orders||[])).catch(()=>{});
    } else if (d && !d.ok) setSaving(false);
  }, [createFetcher.data]);

  const STATUS_COLOR_LOCAL: Record<string,string> = {Submitted:T.cyan,Accepted:T.yellow,Fulfilled:T.statusWarn,Shipped:T.statusWarn,Complete:T.green,Cancelled:T.textFaint,Rejected:T.redSystems};
  const fmt$ = (n:number) => `$${n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const parseMoney = (s:any) => parseFloat(String(s||0).replace(/[$,]/g,''))||0;

  const fieldStyle = {background:T.bg, border:`1px solid ${T.borderStrong}`, color:T.text, fontSize:12, fontFamily:'Inter,sans-serif', padding:'5px 8px', outline:'none', width:'100%', boxSizing:'border-box' as const};
  const labelStyle = {fontFamily:'Teko,sans-serif', fontSize:10, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase' as const, marginBottom:3};

  return (
    <div>
      {/* Header with + New Order */}
      <div style={{padding:'10px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:`1px solid ${T.border}`}}>
        <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.12em'}}>
          {orders === null ? 'loading…' : `${orders.length} order${orders.length!==1?'s':''}`}
        </span>
        <div style={{display:'flex', gap:8}}>
          <a href={`/sales-staging/orders?account=${orgId}`} style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textSubtle, letterSpacing:'0.12em', textDecoration:'none'}}>VIEW ALL →</a>
          <button type="button" onClick={()=>setAdding(a=>!a)}
            style={{background:'none', border:'none', color:adding?T.textFaint:T.yellow, fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.14em', cursor:'pointer', padding:0}}>
            {adding ? 'CANCEL' : '+ NEW ORDER'}
          </button>
        </div>
      </div>

      {/* New order form */}
      {adding && (
        <createFetcher.Form method="post" action="/api/order-create"
          onSubmit={()=>setSaving(true)}
          style={{padding:'12px 16px', background:T.surfaceElev, borderBottom:`1px solid ${T.border}`, display:'flex', flexDirection:'column', gap:10}}>
          <input type="hidden" name="org_id" value={orgId} />
          <input type="hidden" name="leaflink_customer_name" value={orgName} />
          <input type="hidden" name="market_state" value={marketState||'NJ'} />
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div>
              <div style={labelStyle}>Order Date</div>
              <input type="date" name="order_date" value={form.order_date} onChange={e=>setForm(f=>({...f,order_date:e.target.value}))} style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Status</div>
              <select name="status" value={form.status} onChange={e=>setForm(f=>({...f,status:e.target.value}))} style={fieldStyle}>
                {['Submitted','Accepted','Fulfilled','Shipped','Complete','Cancelled','Rejected'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:10}}>
            <div>
              <div style={labelStyle}>Total Amount ($)</div>
              <input type="number" name="total_amount" step="0.01" value={form.total_amount} onChange={e=>setForm(f=>({...f,total_amount:e.target.value}))} placeholder="0.00" style={fieldStyle} />
            </div>
            <div>
              <div style={labelStyle}>Payment Terms</div>
              <select name="payment_terms" value={form.payment_terms} onChange={e=>setForm(f=>({...f,payment_terms:e.target.value}))} style={fieldStyle}>
                {['Net 30','Net 15','Net 7','Due on receipt','COD','Prepaid'].map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{display:'flex', gap:8}}>
            <button type="submit" disabled={saving||!form.total_amount}
              style={{height:30, padding:'0 14px', background:T.yellow, border:'none', color:'#000', fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', cursor:saving?'not-allowed':'pointer', opacity:saving?0.6:1}}>
              {saving ? 'SAVING…' : 'CREATE'}
            </button>
          </div>
          {(createFetcher.data as any)?.error && <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.redSystems}}>{(createFetcher.data as any).error}</div>}
        </createFetcher.Form>
      )}

      {/* Orders list */}
      {orders === null && <div style={{padding:'16px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint}}>Loading orders…</div>}
      {orders !== null && orders.length === 0 && <div style={{padding:'16px', fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textFaint, letterSpacing:'0.10em'}}>No orders on record</div>}
      {orders !== null && orders.map((o:any, i:number) => {
        const sc = STATUS_COLOR_LOCAL[o.status] || T.textFaint;
        const date = o.order_date ? new Date(o.order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : '—';
        return (
          <a key={o.id} href={`/sales-staging/order/${o.id}`}
            style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderTop:`1px solid ${T.border}`, textDecoration:'none', gap:12, transition:'background 80ms'}}
            onMouseEnter={e=>(e.currentTarget.style.background=T.surfaceElev)}
            onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
            <div style={{flex:1, minWidth:0}}>
              <span style={{fontFamily:'Inter,sans-serif', fontSize:13, color:T.text, fontWeight:500}}>{date}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint, letterSpacing:'0.08em', marginLeft:10}}>{o.market_state}</span>
            </div>
            <span style={{fontFamily:'Teko,sans-serif', fontSize:20, color:T.text, flexShrink:0, marginRight:12}}>{fmt$(parseMoney(o.total_amount))}</span>
            <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:9.5, padding:'2px 8px', border:`1px solid ${sc}`, color:sc, letterSpacing:'0.12em', flexShrink:0, minWidth:70, textAlign:'center'}}>{o.status}</span>
          </a>
        );
      })}
    </div>
  );
}

// ─── Onboarding Panel ─────────────────────────────────────────────────────────
// ONBOARDING_STEPS and stepsForMarket imported at top of file from ~/lib/onboarding-steps

function OnboardingPanel({orgId, steps, refresh, marketState}: {orgId:string; steps:any[]; refresh:()=>void; marketState?:string}) {
  const fetcher = useFetcher();
  const stepsMap = new Map(steps.map((s:any) => [s.step_key, s]));
  const relevantSteps = stepsForMarket(marketState||null);
  const allKeys = relevantSteps.map(s => s.key);
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
    <div id="onboarding" style={{background:T.surface, border:`1px solid ${T.border}`}}>
      <SectionHead title="Onboarding" source={`${doneCount}/${allKeys.length} steps · ${Math.round(pct)}%`} />
      <div style={{padding:'14px 16px 6px'}}>
        <div style={{height:4, background:T.surfaceElev, position:'relative'}}>
          <div style={{position:'absolute', left:0, top:0, bottom:0, width:`${pct}%`, background:T.green, transition:'width 300ms'}} />
        </div>
      </div>
      {relevantSteps.map((stepDef) => {
        const step = stepsMap.get(stepDef.key);
        const done = step?.status === 'complete';
        return (
          <button key={stepDef.key} onClick={()=>toggle(stepDef.key)}
            style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'11px 16px', borderTop:`1px solid ${T.border}`, width:'100%', background:'transparent', cursor:'pointer', textAlign:'left', gap:12}}>
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <span style={{width:14, height:14, border:`1px solid ${done?T.green:T.textFaint}`, background:done?T.green:'transparent', display:'inline-flex', alignItems:'center', justifyContent:'center', flexShrink:0}}>
                {done && <CheckIcon />}
              </span>
              <span style={{color:done?T.textMuted:T.text, fontSize:13.5, textDecoration:done?'line-through':'none', textDecorationColor:T.textFaint}}>{stepDef.label}</span>
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
  const ROLES = ['purchasing','marketing','management','budtender','billing','owner'] as const;
  const [form, setForm] = useState({first_name:c.first_name||'', last_name:c.last_name||'', email:c.email||'', phone:c.phone||c.mobile||'', job_title:c.job_title||'', roles:(c.roles||[]) as string[], is_primary:c.is_primary_buyer||false});
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
    fd.set('job_title',form.job_title.trim());
    form.roles.forEach(r => fd.append('roles', r));
    if (form.roles.length === 0) fd.append('roles', ''); // send empty signal
    fd.set('is_primary',String(form.is_primary));
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
            <button type="button" onClick={()=>{setMode('view');setForm({first_name:c.first_name||'',last_name:c.last_name||'',email:c.email||'',phone:c.phone||c.mobile||'',job_title:c.job_title||'',roles:c.roles||[],is_primary:c.is_primary_buyer||false});}}
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
          <div><div style={labelStyle}>Title <span style={{color:T.textFaint, fontSize:9, letterSpacing:'0.10em'}}>(optional)</span></div><input value={form.job_title} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} placeholder="e.g. Director of Purchasing" style={fieldStyle} /></div>
          <div>
            <div style={{...labelStyle, marginBottom:6}}>Roles <span style={{color:T.redSystems, fontSize:9}}>*</span></div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {ROLES.map(r => {
                const on = form.roles.includes(r);
                return (
                  <button key={r} type="button" onClick={()=>setForm(f=>({...f,roles:on?f.roles.filter(x=>x!==r):[...f.roles,r]}))}
                    style={{padding:'4px 10px', background:on?`rgba(255,213,0,0.12)`:'transparent', border:`1px solid ${on?T.yellow:T.borderStrong}`, color:on?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer'}}>
                    {r}
                  </button>
                );
              })}
            </div>
          </div>
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
          {c.job_title && <div style={{fontFamily:'Inter,sans-serif', fontSize:11, color:T.textSubtle, marginTop:2}}>{c.job_title}</div>}
          {(c.roles||[]).length > 0 && (
            <div style={{display:'flex', flexWrap:'wrap', gap:4, marginTop:4}}>
              {(c.roles as string[]).map((r:string) => (
                <span key={r} style={{padding:'1px 6px', border:`1px solid ${T.borderStrong}`, color:T.textFaint, fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.14em', textTransform:'uppercase'}}>{r}</span>
              ))}
            </div>
          )}
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
  const ROLES = ['purchasing','marketing','management','budtender','billing','owner'] as const;
  const [form, setForm] = useState({first_name:'', last_name:'', email:'', phone:'', job_title:'', roles:[] as string[], is_primary:false});
  const [saving, setSaving] = useState(false);
  const fetcher = useFetcher();

  // Watch for successful create
  useEffect(() => {
    const d = fetcher.data as any;
    if (d?.ok) { setAdding(false); setForm({first_name:'', last_name:'', email:'', phone:'', job_title:'', roles:[], is_primary:false}); setSaving(false); refresh(); }
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
    fd.set('job_title', form.job_title.trim());
    form.roles.forEach(r => fd.append('roles', r));
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
            <div style={labelStyle}>Title <span style={{color:T.textFaint, fontSize:9, letterSpacing:'0.10em'}}>(optional)</span></div>
            <input value={form.job_title} onChange={e=>setForm(f=>({...f,job_title:e.target.value}))} placeholder="e.g. Director of Purchasing" style={fieldStyle} />
          </div>
          <div>
            <div style={{...labelStyle, marginBottom:6}}>Roles <span style={{color:T.redSystems, fontSize:9}}>*</span></div>
            <div style={{display:'flex', flexWrap:'wrap', gap:6}}>
              {ROLES.map(r => {
                const on = form.roles.includes(r);
                return (
                  <button key={r} type="button" onClick={()=>setForm(f=>({...f,roles:on?f.roles.filter(x=>x!==r):[...f.roles,r]}))}
                    style={{padding:'4px 10px', background:on?`rgba(255,213,0,0.12)`:'transparent', border:`1px solid ${on?T.yellow:T.borderStrong}`, color:on?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', textTransform:'uppercase', cursor:'pointer'}}>
                    {r}
                  </button>
                );
              })}
            </div>
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
            <button type="button" onClick={()=>{setAdding(false);setForm({first_name:'', last_name:'', email:'', phone:'', job_title:'', roles:[], is_primary:false});}}
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
function NotesPanel({orgId, notes, refresh, sfUser}: {orgId:string; notes:any[]; refresh:()=>void; sfUser?:any}) {
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
    <div id="notes" style={{background:T.surface, border:`1px solid ${T.border}`}}>
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
          {sfUser?.permissions?.avatar_url
            ? <img src={sfUser.permissions.avatar_url} alt={sfUser.permissions.display_name} style={{width:26,height:26,borderRadius:'50%',objectFit:'cover',flexShrink:0}} />
            : <div style={{width:26,height:26,borderRadius:'50%',background:`linear-gradient(135deg,${T.yellow},#FFB800)`,display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700,fontSize:11,fontFamily:'Teko,sans-serif',flexShrink:0}}>
                {(sfUser?.permissions?.display_name||'SL').split(' ').map((w:string)=>w[0]).slice(0,2).join('').toUpperCase()}
              </div>
          }
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
        const chColor = (channel ? CHANNEL_COLORS[channel] : null) ?? T.textSubtle;
        const initials = (n.author_name||'').split(/\s+/).slice(0,2).map((w:string)=>w[0]?.toUpperCase()||'').join('')||'?';
        const isCurrentUser = sfUser && (n.author_name||'').toLowerCase() === (sfUser.permissions?.display_name||'').toLowerCase();
        const noteAvatarUrl = isCurrentUser ? sfUser?.permissions?.avatar_url : null;
        return (
          <div key={n.id} style={{padding:'12px 16px', display:'flex', gap:10, borderTop:`1px solid ${T.border}`}}>
            {noteAvatarUrl
              ? <img src={noteAvatarUrl} alt={n.author_name} style={{width:26, height:26, borderRadius:'50%', objectFit:'cover', flexShrink:0, marginTop:1}} />
              : <div style={{width:26, height:26, borderRadius:'50%', background:`linear-gradient(135deg,${T.yellow},${T.yellowWarm})`, display:'flex', alignItems:'center', justifyContent:'center', color:'#000', fontFamily:'Teko,sans-serif', fontSize:12, fontWeight:600, flexShrink:0, marginTop:1}}>{initials}</div>
            }
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
