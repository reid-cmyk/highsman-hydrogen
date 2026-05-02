/**
 * app/routes/sales-staging._index.tsx
 *
 * /sales-staging — CRM Account List (Supabase-backed)
 * Cookie-gated. Reads from public.organizations via Supabase REST.
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useFetcher, useSearchParams} from '@remix-run/react';
import {useMemo, useState} from 'react';
import {isStagingAuthed, buildStagingLoginCookie, buildStagingLogoutCookie, checkStagingPassword} from '~/lib/staging-auth';
import type {OrgRow} from '~/lib/supabase-orgs';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | Sales Staging'},
  {name: 'robots', content: 'noindex, nofollow, noarchive'},
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
}

// ─── Action ──────────────────────────────────────────────────────────────────

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

  // prospect / flag_pete — patch lifecycle or tags
  if (intent === 'prospect' || intent === 'flag_pete') {
    const org_id = String(fd.get('org_id') || '');
    if (!org_id) return json({ok: false, error: 'org_id required'}, {status: 400});

    const sbH = {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    };

    if (intent === 'prospect') {
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
        method: 'PATCH', headers: sbH,
        body: JSON.stringify({lifecycle_stage: 'prospect', updated_at: new Date().toISOString()}),
      });
    } else {
      // flag_pete: append tag
      const res = await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}&select=tags`, {
        headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`},
      });
      const rows = await res.json();
      const tags: string[] = rows?.[0]?.tags || [];
      const newTags = tags.includes('pete-followup') ? tags : [...tags, 'pete-followup'];
      await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
        method: 'PATCH', headers: sbH, body: JSON.stringify({tags: newTags}),
      });
    }
    return json({ok: true, intent, org_id});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

// ─── Loader ───────────────────────────────────────────────────────────────────

const ALL_STAGES = ['active','untargeted','churned','dormant','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due'];

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({authenticated: false, orgs: [], counts: null, stateFilter: 'ALL', stageFilter: 'active'});
  }

  const url = new URL(request.url);
  const stateFilter = url.searchParams.get('state') || 'ALL';
  const stageFilter = url.searchParams.get('stage') || 'active';

  const base = env.SUPABASE_URL;
  const headers = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};

  const select = [
    'id','name','market_state','city','phone','lifecycle_stage',
    'tier','last_order_date','tags','online_menus','do_not_contact',
    'risk_of_loss','reorder_status','zoho_account_id',
    'contacts(id,email,phone,mobile,full_name,first_name,is_primary_buyer)',
  ].join(',');

  // Build filters
  const params = new URLSearchParams({select, order: 'name.asc', limit: '2000'});
  if (stateFilter !== 'ALL') params.set('market_state', `eq.${stateFilter}`);
  if (stageFilter === 'all') {
    // no lifecycle filter — return everything
  } else {
    params.set('lifecycle_stage', `eq.${stageFilter}`);
  }

  let orgs: OrgRow[] = [];
  let fetchError: string | null = null;
  try {
    const res = await fetch(`${base}/rest/v1/organizations?${params}`, {headers});
    if (!res.ok) throw new Error(`${res.status}`);
    orgs = await res.json();
  } catch (e: any) {
    fetchError = String(e?.message || e);
  }

  // Counts per state for current stage filter (for state pill badges)
  let counts: Record<string, number> = {};
  try {
    const countParams = new URLSearchParams({select: 'market_state', limit: '2000'});
    if (stageFilter !== 'all') countParams.set('lifecycle_stage', `eq.${stageFilter}`);
    const cr = await fetch(`${base}/rest/v1/organizations?${countParams}`, {headers});
    const rows: any[] = await cr.json();
    counts.ALL = rows.length;
    for (const r of rows) {
      const s = r.market_state || 'OTHER';
      counts[s] = (counts[s] || 0) + 1;
    }
  } catch { /* non-critical */ }

  // Stage distribution (all states, for stage pill badges)
  let stageCounts: Record<string, number> = {};
  try {
    const sr = await fetch(`${base}/rest/v1/organizations?select=lifecycle_stage&limit=2000${stateFilter !== 'ALL' ? `&market_state=eq.${stateFilter}` : ''}`, {headers});
    const rows: any[] = await sr.json();
    for (const r of rows) {
      const s = r.lifecycle_stage || 'unknown';
      stageCounts[s] = (stageCounts[s] || 0) + 1;
    }
  } catch { /* non-critical */ }

  return json({authenticated: true, orgs, counts, stageCounts, stateFilter, stageFilter, fetchError});
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SalesStaging() {
  const data = useLoaderData<typeof loader>() as any;
  const actionData = useActionData<typeof action>() as any;
  if (!data.authenticated) return <LoginScreen error={actionData?.error} />;
  return <Dashboard data={data} />;
}

// ─── Login ────────────────────────────────────────────────────────────────────

function LoginScreen({error}: {error?: string | null}) {
  return (
    <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{width:'100%',maxWidth:'360px'}}>
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430" alt="Highsman" style={{height:'44px',marginBottom:'16px'}} />
          <h1 style={{fontFamily:"'Teko',sans-serif",fontWeight:700,fontSize:'28px',letterSpacing:'0.08em',textTransform:'uppercase',color:'#fff',margin:0}}>SALES STAGING</h1>
          <p style={{color:'#555',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.12em',marginTop:'4px'}}>Internal · Beta</p>
        </div>
        <Form method="post">
          <input type="hidden" name="intent" value="login" />
          <input type="password" name="password" placeholder="Password" autoFocus
            style={{width:'100%',padding:'12px 16px',background:'#111',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box',marginBottom:'8px'}} />
          {error && <p style={{color:'#f87171',fontSize:'13px',textAlign:'center',margin:'0 0 8px'}}>{error}</p>}
          <button type="submit"
            style={{width:'100%',padding:'12px',background:'#c8a84b',color:'#000',border:'none',borderRadius:'8px',fontFamily:"'Teko',sans-serif",fontSize:'18px',fontWeight:700,textTransform:'uppercase',cursor:'pointer'}}>
            ENTER
          </button>
        </Form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

const STATES = ['ALL','NJ','MA','NY','RI','MO'];
const STATE_LABELS: Record<string,string> = {NJ:'NJ',MA:'MA',NY:'NY',RI:'RI',MO:'MO'};

const STAGE_DISPLAY: Record<string,{label:string;color:string}> = {
  active:               {label:'Active',          color:'#22C55E'},
  untargeted:           {label:'Untargeted',       color:'#555'},
  churned:              {label:'Churned',          color:'#6b7280'},
  dormant:              {label:'Dormant',          color:'#f59e0b'},
  prospect:             {label:'Prospect',         color:'#60a5fa'},
  contacted:            {label:'Contacted',        color:'#a78bfa'},
  qualified:            {label:'Qualified',        color:'#fb923c'},
  sample_sent:          {label:'Sample Sent',      color:'#e879f9'},
  first_order_pending:  {label:'Onboarding',       color:'#38bdf8'},
  reorder_due:          {label:'Reorder Due',      color:'#f97316'},
  all:                  {label:'All',              color:'#c8a84b'},
};
const STAGE_FILTER_ORDER = ['active','untargeted','prospect','contacted','qualified','sample_sent','first_order_pending','reorder_due','churned','dormant','all'];

function Dashboard({data}: {data: any}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const stateFilter: string = data.stateFilter || 'ALL';
  const stageFilter: string = data.stageFilter || 'active';
  const orgs: OrgRow[] = data.orgs || [];
  const counts: Record<string,number> = data.counts || {};
  const stageCounts: Record<string,number> = data.stageCounts || {};

  function setFilter(key: string, val: string) {
    const next = new URLSearchParams(searchParams);
    next.set(key, val);
    setSearchParams(next, {replace: true});
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.toLowerCase();
    return orgs.filter(o =>
      o.name.toLowerCase().includes(q) ||
      (o.city||'').toLowerCase().includes(q) ||
      (o.phone||'').includes(q)
    );
  }, [orgs, search]);

  const totalInStage = stageCounts[stageFilter] ?? orgs.length;

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'#fff',fontFamily:"'Inter',sans-serif"}}>
      {/* Top bar */}
      <div style={{background:'#0a0a0a',borderBottom:'1px solid rgba(255,255,255,0.08)',padding:'10px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430" alt="Highsman" style={{height:'30px'}} />
          <span style={{fontFamily:"'Teko',sans-serif",fontSize:'20px',fontWeight:700,letterSpacing:'0.08em',color:'#c8a84b'}}>SALES STAGING</span>
          <span style={{background:'#111',border:'1px solid #222',borderRadius:'4px',padding:'1px 7px',fontSize:'10px',color:'#555',textTransform:'uppercase',letterSpacing:'0.1em'}}>BETA</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <a href="/sales" style={{color:'#555',fontSize:'12px',textDecoration:'none'}}>← Live /sales</a>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <button type="submit" style={{background:'none',border:'none',color:'#555',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}>Sign out</button>
          </Form>
        </div>
      </div>

      <div style={{display:'flex',height:'calc(100vh - 53px)'}}>
        {/* Side nav */}
        <div style={{width:'168px',flexShrink:0,background:'#080808',borderRight:'1px solid rgba(255,255,255,0.05)',padding:'12px 0',overflowY:'auto'}}>
          {[
            {label:'Accounts', href:'/sales-staging', active:true},
            {label:'Dashboard', href:'/sales'},
            {label:'Leads', href:'/sales-floor/app'},
            {label:'Reorders Due', href:'/sales-floor/app'},
            {label:'New Customers', href:'/sales-floor/app'},
            {label:'Funnel', href:'/sales'},
            {label:'Email', href:'/sales-floor/app'},
            {label:'Text', href:'/sales-floor/app'},
            {label:'Issues', href:'/sales-floor/app'},
            {label:'Vibes', href:'/vibes'},
          ].map(item => (
            <a key={item.label} href={item.href}
              style={{display:'block',padding:'8px 14px',fontSize:'13px',
                color: item.active ? '#c8a84b' : '#444',
                background: item.active ? 'rgba(200,168,75,0.07)' : 'transparent',
                borderLeft: item.active ? '2px solid #c8a84b' : '2px solid transparent',
                textDecoration:'none', fontWeight: item.active ? 600 : 400}}>
              {item.label}
            </a>
          ))}
        </div>

        {/* Main */}
        <div style={{flex:1,overflowY:'auto',padding:'14px 18px'}}>
          {data.fetchError && (
            <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',padding:'10px 14px',color:'#f87171',fontSize:'13px',marginBottom:'12px'}}>
              {data.fetchError}
            </div>
          )}

          {/* State filter row */}
          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'8px',flexWrap:'wrap'}}>
            <span style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.1em',color:'#444',fontWeight:700,marginRight:'2px'}}>STATE</span>
            {STATES.map(s => {
              const n = s === 'ALL' ? (counts['ALL'] ?? 0) : (counts[s] ?? 0);
              const active = stateFilter === s;
              return (
                <button key={s} onClick={() => setFilter('state', s)}
                  style={{padding:'5px 10px',borderRadius:'5px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1px solid',
                    background: active ? '#c8a84b' : 'transparent',
                    borderColor: active ? '#c8a84b' : '#2a2a2a',
                    color: active ? '#000' : '#666'}}>
                  {STATE_LABELS[s] || s}{n ? ` · ${n}` : ''}
                </button>
              );
            })}
          </div>

          {/* Stage filter dropdown */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px'}}>
            <span style={{fontSize:'10px',textTransform:'uppercase',letterSpacing:'0.1em',color:'#444',fontWeight:700,whiteSpace:'nowrap'}}>STAGE</span>
            <select
              value={stageFilter}
              onChange={e => setFilter('stage', e.target.value)}
              style={{background:'#111',border:'1px solid #2a2a2a',borderRadius:'6px',color:'#ddd',fontSize:'13px',padding:'6px 10px',outline:'none',cursor:'pointer',minWidth:'180px'}}
            >
              {STAGE_FILTER_ORDER.filter(s => s === 'all' || s === stageFilter || (stageCounts[s] ?? 0) > 0).map(s => {
                const {label} = STAGE_DISPLAY[s] || {label: s};
                const n = s === 'all' ? Object.values(stageCounts).reduce((a,b)=>a+b,0) : (stageCounts[s] ?? 0);
                return <option key={s} value={s}>{label}{n ? ` (${n})` : ''}</option>;
              })}
            </select>
            {stageFilter !== 'active' && (
              <button onClick={() => setFilter('stage','active')}
                style={{background:'none',border:'none',color:'#555',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}>
                Reset
              </button>
            )}
          </div>

          {/* Search + count */}
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
            <input type="text" placeholder="Search by name, city, phone…" value={search} onChange={e => setSearch(e.target.value)}
              style={{flex:1,maxWidth:'340px',padding:'7px 12px',background:'#0d0d0d',border:'1px solid #1f1f1f',borderRadius:'7px',color:'#fff',fontSize:'13px',outline:'none'}} />
            <span style={{color:'#444',fontSize:'12px'}}>{filtered.length} account{filtered.length !== 1 ? 's' : ''}</span>
            {search && <button onClick={() => setSearch('')} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'12px'}}>Clear</button>}
          </div>

          {/* Cards */}
          <div style={{display:'flex',flexDirection:'column',gap:'7px'}}>
            {filtered.map(org => (
              <OrgCard key={org.id} org={org} stageFilter={stageFilter} />
            ))}
            {filtered.length === 0 && (
              <div style={{textAlign:'center',color:'#333',padding:'48px',fontSize:'14px'}}>
                No accounts match this filter.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Org Card ─────────────────────────────────────────────────────────────────

function OrgCard({org, stageFilter}: {org: OrgRow; stageFilter: string}) {
  const fetcher = useFetcher();
  const primaryContact = org.contacts?.find(c => c.is_primary_buyer) || org.contacts?.[0];
  const phone = org.phone || primaryContact?.phone || primaryContact?.mobile;
  const email = primaryContact?.email;
  const days = daysSince(org.last_order_date);
  const lcInfo = STAGE_DISPLAY[org.lifecycle_stage] || {label: org.lifecycle_stage, color: '#666'};
  const isFlagged = (org.tags as any)?.includes('pete-followup');
  const isUntargeted = org.lifecycle_stage === 'untargeted';

  // Optimistic prospecting
  const isProspecting = fetcher.state !== 'idle' && fetcher.formData?.get('intent') === 'prospect';
  const isProspected = isProspecting || (fetcher.data as any)?.intent === 'prospect';

  const flagPete = () => {
    const fd = new FormData(); fd.set('intent','flag_pete'); fd.set('org_id', org.id);
    fetcher.submit(fd, {method:'post'});
  };
  const prospect = () => {
    const fd = new FormData(); fd.set('intent','prospect'); fd.set('org_id', org.id);
    fetcher.submit(fd, {method:'post'});
  };

  return (
    <div style={{
      background:'#0d0d0d',
      border:`1px solid ${org.risk_of_loss ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.055)'}`,
      borderRadius:'9px', padding:'12px 14px',
      opacity: isProspected && stageFilter !== 'all' ? 0.4 : 1,
      transition:'opacity 0.3s',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px',flexWrap:'wrap'}}>

        {/* Left */}
        <div style={{flex:1,minWidth:'200px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'6px',marginBottom:'5px',flexWrap:'wrap'}}>
            <a href={`/sales-staging/account/${org.id}`}
              style={{fontWeight:700,fontSize:'15px',color:'#fff',textDecoration:'none',lineHeight:1.2}}>
              {org.name}
            </a>
            {org.tier && (
              <span style={{background:'rgba(200,168,75,0.12)',color:'#c8a84b',borderRadius:'3px',padding:'1px 6px',fontSize:'10px',fontWeight:700}}>
                {org.tier}
              </span>
            )}
            <span style={{background:`${lcInfo.color}18`,color:lcInfo.color,borderRadius:'3px',padding:'1px 6px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.05em'}}>
              {lcInfo.label}
            </span>
            {org.risk_of_loss && <span style={{background:'rgba(220,38,38,0.12)',color:'#dc2626',borderRadius:'3px',padding:'1px 6px',fontSize:'10px',fontWeight:600}}>RISK</span>}
            {isFlagged && <span style={{background:'rgba(139,92,246,0.12)',color:'#a78bfa',borderRadius:'3px',padding:'1px 6px',fontSize:'10px',fontWeight:600}}>PETE ✓</span>}
            {isProspected && <span style={{background:'rgba(96,165,250,0.12)',color:'#60a5fa',borderRadius:'3px',padding:'1px 6px',fontSize:'10px',fontWeight:600}}>→ PROSPECTED</span>}
          </div>

          {/* Pills */}
          <div style={{display:'flex',gap:'5px',flexWrap:'wrap'}}>
            {org.market_state && <Pill>{org.market_state}{org.city ? ` · ${org.city}` : ''}</Pill>}
            {phone && <Pill>📞 {phone}</Pill>}
            {days !== null && (
              <Pill color={days > 90 ? '#dc2626' : days > 60 ? '#f59e0b' : undefined}>
                Last order {days}d ago
              </Pill>
            )}
            {!org.last_order_date && <Pill color="#555">No orders</Pill>}
            {(org.online_menus as any)?.length > 0 && <Pill>{(org.online_menus as any).join(' · ')}</Pill>}
          </div>
        </div>

        {/* Actions */}
        <div style={{display:'flex',gap:'5px',flexWrap:'wrap',alignItems:'center'}}>
          {isUntargeted && !isProspected && (
            <ActionBtn onClick={prospect} color="#60a5fa">PROSPECT</ActionBtn>
          )}
          {phone && <ActionBtn href={`tel:${phone}`} color="#22C55E">CALL</ActionBtn>}
          {phone && <ActionBtn href={`sms:${phone}`} color="#3b82f6">TEXT</ActionBtn>}
          {email && <ActionBtn href={`mailto:${email}`} color="#a78bfa">EMAIL</ActionBtn>}
          <ActionBtn href={`/sales-staging/account/${org.id}`} color="#888">VIEW</ActionBtn>
          <ActionBtn onClick={flagPete} color={isFlagged ? '#555' : '#f59e0b'}>
            {isFlagged ? 'PETE ✓' : 'FLAG PETE'}
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Pill({children, color}: {children: React.ReactNode; color?: string}) {
  return (
    <span style={{background:'rgba(255,255,255,0.04)',border:`1px solid ${color ? `${color}44` : 'rgba(255,255,255,0.07)'}`,
      borderRadius:'4px',padding:'2px 7px',fontSize:'11px',color: color || '#777'}}>
      {children}
    </span>
  );
}

function ActionBtn({href, onClick, color, children}: {href?:string; onClick?:()=>void; color:string; children:React.ReactNode}) {
  const style: React.CSSProperties = {
    display:'inline-block',padding:'5px 9px',borderRadius:'4px',fontSize:'11px',
    fontWeight:700,letterSpacing:'0.04em',cursor:'pointer',textDecoration:'none',
    border:`1px solid ${color}44`,background:`${color}12`,color, fontFamily:'inherit',
  };
  if (href) return <a href={href} style={style}>{children}</a>;
  return <button type="button" onClick={onClick} style={style}>{children}</button>;
}
