/**
 * app/routes/sales-staging._index.tsx
 *
 * /sales-staging — CRM Account List (Supabase-backed parallel to /sales)
 *
 * Cookie-gated (sales_staging_auth=1). Password: SALES_STAGING_PASSWORD env var.
 * Reads from public.organizations + public.contacts via Supabase REST.
 * Does NOT touch any existing Zoho-backed routes.
 */

import type {
  LoaderFunctionArgs,
  ActionFunctionArgs,
  MetaFunction,
} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {
  useLoaderData,
  useActionData,
  Form,
  useFetcher,
  useSearchParams,
} from '@remix-run/react';
import {useMemo, useState} from 'react';
import {
  isStagingAuthed,
  buildStagingLoginCookie,
  buildStagingLogoutCookie,
  checkStagingPassword,
} from '~/lib/staging-auth';
import {fetchOrgs, updateOrg, type OrgRow} from '~/lib/supabase-orgs';

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | Sales Staging'},
  {name: 'robots', content: 'noindex, nofollow, noarchive'},
];

// ─── Action (login / logout / flag-pete) ────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'login');

  if (intent === 'login') {
    const password = String(formData.get('password') || '');
    if (checkStagingPassword(password, env)) {
      return json(
        {ok: true, error: null},
        {headers: {'Set-Cookie': buildStagingLoginCookie()}},
      );
    }
    return json({ok: false, error: 'Incorrect password'});
  }

  // All other intents require auth
  const cookie = request.headers.get('Cookie') || '';
  if (!isStagingAuthed(cookie)) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  if (intent === 'logout') {
    return json({ok: true, error: null}, {
      headers: {'Set-Cookie': buildStagingLogoutCookie()},
    });
  }

  if (intent === 'flag_pete') {
    const orgId = String(formData.get('org_id') || '');
    if (!orgId) return json({ok: false, error: 'missing org_id'}, {status: 400});
    // Add 'pete-followup' tag via Supabase
    // Fetch current tags first
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${orgId}&select=tags`,
      {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      },
    );
    const rows = await res.json();
    const currentTags: string[] = rows?.[0]?.tags || [];
    const newTags = currentTags.includes('pete-followup')
      ? currentTags
      : [...currentTags, 'pete-followup'];
    await updateOrg(env, orgId, {tags: newTags} as any);
    return json({ok: true, error: null, intent, org_id: orgId});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = isStagingAuthed(cookie);

  if (!isAuth) {
    return json({authenticated: false, orgs: [], error: null, counts: null});
  }

  const url = new URL(request.url);
  const stateFilter = url.searchParams.get('state') || 'ALL';
  const lifecycleFilter = url.searchParams.get('lc') || 'active';

  let orgs: OrgRow[] = [];
  let error: string | null = null;

  try {
    const lifecycle =
      lifecycleFilter === 'all'
        ? ['active', 'churned', 'untargeted']
        : lifecycleFilter === 'churned'
        ? ['churned']
        : ['active'];

    orgs = await fetchOrgs(env, {
      state: stateFilter !== 'ALL' ? stateFilter : undefined,
      lifecycle,
      limit: 1000,
    });
  } catch (err: any) {
    error = String(err?.message || err);
  }

  // Count active orgs per state for badges
  let counts: Record<string, number> | null = null;
  try {
    const allActive = await fetchOrgs(env, {lifecycle: ['active'], limit: 1000});
    counts = {ALL: allActive.length};
    for (const o of allActive) {
      const s = o.market_state || 'OTHER';
      counts[s] = (counts[s] || 0) + 1;
    }
  } catch {
    // non-critical
  }

  return json({authenticated: true, orgs, error, counts, stateFilter, lifecycleFilter});
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function SalesStaging() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;

  if (!data.authenticated) {
    return <LoginScreen error={actionData?.intent === 'login' || !actionData ? actionData?.error : null} />;
  }

  return <Dashboard data={data as any} />;
}

// ─── Login ───────────────────────────────────────────────────────────────────

function LoginScreen({error}: {error?: string | null}) {
  return (
    <div style={{minHeight:'100vh',background:'#000',display:'flex',alignItems:'center',justifyContent:'center',padding:'24px'}}>
      <div style={{width:'100%',maxWidth:'360px'}}>
        <div style={{textAlign:'center',marginBottom:'32px'}}>
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
            alt="Highsman"
            style={{height:'44px',marginBottom:'16px'}}
          />
          <h1 style={{fontFamily:"'Teko',sans-serif",fontWeight:700,fontSize:'28px',letterSpacing:'0.08em',textTransform:'uppercase',color:'#fff',margin:0}}>
            SALES STAGING
          </h1>
          <p style={{color:'#666',fontSize:'11px',textTransform:'uppercase',letterSpacing:'0.12em',marginTop:'4px'}}>
            Internal · Beta
          </p>
        </div>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="login" />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            style={{width:'100%',padding:'12px 16px',background:'#111',border:'1px solid rgba(255,255,255,0.12)',borderRadius:'8px',color:'#fff',fontSize:'14px',outline:'none',boxSizing:'border-box'}}
          />
          {error && <p style={{color:'#f87171',fontSize:'13px',textAlign:'center',margin:'8px 0'}}>{error}</p>}
          <button
            type="submit"
            style={{width:'100%',padding:'12px',background:'#c8a84b',color:'#000',border:'none',borderRadius:'8px',fontFamily:"'Teko',sans-serif",fontSize:'18px',fontWeight:700,letterSpacing:'0.08em',textTransform:'uppercase',cursor:'pointer'}}
          >
            ENTER
          </button>
        </Form>
      </div>
    </div>
  );
}

// ─── Dashboard ───────────────────────────────────────────────────────────────

const STATES = ['ALL','NJ','MA','NY','RI','MO'];
const STATE_LABELS: Record<string,string> = {NJ:'New Jersey',MA:'Massachusetts',NY:'New York',RI:'Rhode Island',MO:'Missouri'};

function Dashboard({data}: {data: any}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const stateFilter: string = data.stateFilter || 'ALL';
  const lcFilter: string = data.lifecycleFilter || 'active';
  const orgs: OrgRow[] = data.orgs || [];
  const counts: Record<string,number> = data.counts || {};
  const fetcher = useFetcher();

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
      (o.license_number||'').toLowerCase().includes(q)
    );
  }, [orgs, search]);

  const flagPete = (orgId: string) => {
    const fd = new FormData();
    fd.set('intent','flag_pete');
    fd.set('org_id', orgId);
    fetcher.submit(fd, {method:'post'});
  };

  return (
    <div style={{minHeight:'100vh',background:'#000',color:'#fff',fontFamily:"'Inter',sans-serif"}}>
      {/* Top bar */}
      <div style={{background:'#0a0a0a',borderBottom:'1px solid rgba(255,255,255,0.08)',padding:'12px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
          <img src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430" alt="Highsman" style={{height:'32px'}} />
          <span style={{fontFamily:"'Teko',sans-serif",fontSize:'20px',fontWeight:700,letterSpacing:'0.08em',color:'#c8a84b'}}>SALES STAGING</span>
          <span style={{background:'#1a1a1a',border:'1px solid #333',borderRadius:'4px',padding:'2px 8px',fontSize:'10px',color:'#666',textTransform:'uppercase',letterSpacing:'0.1em'}}>BETA</span>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <a href="/sales" style={{color:'#666',fontSize:'12px',textDecoration:'none'}}>← Live /sales</a>
          <Form method="post">
            <input type="hidden" name="intent" value="logout" />
            <button type="submit" style={{background:'none',border:'none',color:'#666',fontSize:'12px',cursor:'pointer',textDecoration:'underline'}}>Sign out</button>
          </Form>
        </div>
      </div>

      <div style={{display:'flex',height:'calc(100vh - 57px)'}}>
        {/* Side nav */}
        <div style={{width:'180px',flexShrink:0,background:'#080808',borderRight:'1px solid rgba(255,255,255,0.06)',padding:'16px 0',overflowY:'auto'}}>
          {[
            {label:'Accounts',href:'/sales-staging',active:true},
            {label:'Dashboard',href:'/sales'},
            {label:'Leads',href:'/sales-floor/app'},
            {label:'Reorders Due',href:'/sales-floor/app'},
            {label:'New Customers',href:'/sales-floor/app'},
            {label:'Funnel',href:'/sales'},
            {label:'Email',href:'/sales-floor/app'},
            {label:'Text',href:'/sales-floor/app'},
            {label:'Issues',href:'/sales-floor/app'},
            {label:'Vibes',href:'/vibes'},
          ].map(item => (
            <a
              key={item.label}
              href={item.href}
              style={{
                display:'block',padding:'9px 16px',fontSize:'13px',
                color: item.active ? '#c8a84b' : '#555',
                background: item.active ? 'rgba(200,168,75,0.08)' : 'transparent',
                borderLeft: item.active ? '2px solid #c8a84b' : '2px solid transparent',
                textDecoration:'none',fontWeight: item.active ? 600 : 400,
              }}
            >
              {item.label}
            </a>
          ))}
        </div>

        {/* Main content */}
        <div style={{flex:1,overflowY:'auto',padding:'16px 20px'}}>
          {data.error && (
            <div style={{background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',borderRadius:'8px',padding:'12px 16px',color:'#f87171',fontSize:'13px',marginBottom:'16px'}}>
              {data.error}
            </div>
          )}

          {/* Filters row */}
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',flexWrap:'wrap'}}>
            {/* State pills */}
            {STATES.map(s => (
              <button
                key={s}
                onClick={() => setFilter('state', s)}
                style={{
                  padding:'6px 12px',borderRadius:'6px',fontSize:'12px',fontWeight:600,
                  letterSpacing:'0.06em',cursor:'pointer',border:'1px solid',
                  background: stateFilter===s ? '#c8a84b' : 'transparent',
                  borderColor: stateFilter===s ? '#c8a84b' : '#333',
                  color: stateFilter===s ? '#000' : '#888',
                }}
              >
                {s}{counts[s] ? ` (${counts[s]})` : ''}
              </button>
            ))}
            <div style={{flex:1}}/>
            {/* Lifecycle pills */}
            {[{k:'active',l:'Active'},{k:'churned',l:'Churned'},{k:'all',l:'All'}].map(({k,l}) => (
              <button
                key={k}
                onClick={() => setFilter('lc', k)}
                style={{
                  padding:'6px 12px',borderRadius:'6px',fontSize:'11px',cursor:'pointer',border:'1px solid',
                  background: lcFilter===k ? '#1a1a1a' : 'transparent',
                  borderColor: lcFilter===k ? '#555' : '#222',
                  color: lcFilter===k ? '#ddd' : '#555',
                }}
              >
                {l}
              </button>
            ))}
          </div>

          {/* Search + count */}
          <div style={{display:'flex',alignItems:'center',gap:'12px',marginBottom:'16px'}}>
            <input
              type="text"
              placeholder="Search accounts…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{flex:1,maxWidth:'360px',padding:'8px 14px',background:'#111',border:'1px solid #222',borderRadius:'8px',color:'#fff',fontSize:'13px',outline:'none'}}
            />
            <span style={{color:'#555',fontSize:'12px'}}>{filtered.length} accounts</span>
          </div>

          {/* Account cards */}
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {filtered.map(org => (
              <OrgCard key={org.id} org={org} onFlagPete={() => flagPete(org.id)} />
            ))}
            {filtered.length === 0 && (
              <div style={{textAlign:'center',color:'#444',padding:'48px',fontSize:'14px'}}>
                No accounts found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Org Card ────────────────────────────────────────────────────────────────

const LC_COLORS: Record<string,string> = {
  active:'#22C55E', churned:'#6b7280', untargeted:'#444',
};

function OrgCard({org, onFlagPete}: {org: OrgRow; onFlagPete: () => void}) {
  const primaryContact = org.contacts?.find(c => c.is_primary_buyer) || org.contacts?.[0];
  const phone = org.phone || primaryContact?.phone || primaryContact?.mobile;
  const email = primaryContact?.email;
  const lcColor = LC_COLORS[org.lifecycle_stage] || '#666';
  const isFlagged = org.tags?.includes('pete-followup');
  const isRisk = org.risk_of_loss;

  return (
    <div style={{
      background:'#0d0d0d',
      border:`1px solid ${isRisk ? 'rgba(220,38,38,0.3)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius:'10px',padding:'14px 16px',
    }}>
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
        {/* Left: name + meta */}
        <div style={{flex:1,minWidth:'180px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px',flexWrap:'wrap'}}>
            <a
              href={`/sales-staging/account/${org.id}`}
              style={{fontWeight:700,fontSize:'15px',color:'#fff',textDecoration:'none'}}
            >
              {org.name}
            </a>
            {org.tier && (
              <span style={{background:'rgba(200,168,75,0.15)',color:'#c8a84b',borderRadius:'4px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>
                TIER {org.tier}
              </span>
            )}
            <span style={{background:`${lcColor}18`,color:lcColor,borderRadius:'4px',padding:'1px 7px',fontSize:'10px',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.06em'}}>
              {org.lifecycle_stage}
            </span>
            {isRisk && (
              <span style={{background:'rgba(220,38,38,0.15)',color:'#dc2626',borderRadius:'4px',padding:'1px 7px',fontSize:'10px',fontWeight:600}}>
                RISK
              </span>
            )}
            {isFlagged && (
              <span style={{background:'rgba(139,92,246,0.15)',color:'#a78bfa',borderRadius:'4px',padding:'1px 7px',fontSize:'10px',fontWeight:600}}>
                PETE ✓
              </span>
            )}
          </div>

          {/* Pills row */}
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
            {org.market_state && (
              <Pill>{org.market_state}{org.city ? ` · ${org.city}` : ''}</Pill>
            )}
            {phone && <Pill>📞 {phone}</Pill>}
            {org.last_order_date && (
              <Pill>Last order {new Date(org.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</Pill>
            )}
            {org.online_menus?.length > 0 && (
              <Pill>{org.online_menus.join(' · ')}</Pill>
            )}
          </div>
        </div>

        {/* Right: action buttons */}
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap',alignItems:'center'}}>
          {phone && (
            <>
              <ActionBtn href={`tel:${phone}`} color="#22C55E">CALL</ActionBtn>
              <ActionBtn href={`sms:${phone}`} color="#3b82f6">TEXT</ActionBtn>
            </>
          )}
          {email && (
            <ActionBtn href={`mailto:${email}`} color="#a78bfa">EMAIL</ActionBtn>
          )}
          <ActionBtn href={`/sales-floor/app`} color="#888">BRIEF</ActionBtn>
          <ActionBtn href={`/sales-floor/app`} color="#888">TRAINING</ActionBtn>
          <ActionBtn href={`/sales-floor/app`} color="#888">MENU</ActionBtn>
          <ActionBtn
            onClick={onFlagPete}
            color={isFlagged ? '#6b7280' : '#f59e0b'}
          >
            {isFlagged ? 'PETE ✓' : 'FLAG PETE'}
          </ActionBtn>
        </div>
      </div>
    </div>
  );
}

function Pill({children}: {children: React.ReactNode}) {
  return (
    <span style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)',borderRadius:'4px',padding:'2px 8px',fontSize:'11px',color:'#888'}}>
      {children}
    </span>
  );
}

function ActionBtn({
  href, onClick, color, children,
}: {
  href?: string; onClick?: () => void; color: string; children: React.ReactNode;
}) {
  const style: React.CSSProperties = {
    display:'inline-block',padding:'5px 10px',borderRadius:'5px',fontSize:'11px',
    fontWeight:700,letterSpacing:'0.05em',cursor:'pointer',textDecoration:'none',
    border:`1px solid ${color}44`,background:`${color}14`,color,
    fontFamily:"inherit",
  };
  if (href) return <a href={href} style={style}>{children}</a>;
  return <button type="button" onClick={onClick} style={style}>{children}</button>;
}
