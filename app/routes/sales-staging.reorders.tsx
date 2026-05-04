/**
 * app/routes/sales-staging.reorders.tsx
 * /sales-staging/reorders — Unified Reorders Due feed
 *
 * Flags (single per account):
 *   healthy      — no flag (excluded from feed)
 *   aging        — 45+ days, no cadence data
 *   past_cadence — days since >= avg cadence
 *   low_inv      — Lit Alerts low inventory
 *   out_of_stock — Lit Alerts OOS (terminal, only new order clears)
 *
 * Excludes: churned accounts, suppressed accounts (reorder_suppressed=true), no-order accounts.
 * Suppress button lets Sky hide an account until their next order resets it.
 * Sort: most recently flagged first.
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {useState, useEffect} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: 'Reorders Due | Sales Floor'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg: '#0A0A0A', surface: '#141414', surfaceElev: '#1A1A1A',
  border: '#1F1F1F', borderStrong: '#2F2F2F',
  text: '#F5F5F5', textMuted: '#C8C8C8', textSubtle: '#9C9C9C', textFaint: '#6A6A6A',
  yellow: '#FFD500', cyan: '#00D4FF', green: '#00E676',
  magenta: '#FF3B7F', redSystems: '#FF3355', statusWarn: '#FFB300',
};

const TIER_COLOR: Record<string, string> = {A: T.yellow, B: T.cyan, C: T.magenta};

const FLAG_META: Record<string, {color: string; label: string}> = {
  out_of_stock: {color: T.redSystems,  label: 'OUT OF STOCK'},
  low_inv:      {color: '#FF8A00',     label: 'LOW INV'},
  past_cadence: {color: T.yellow,      label: 'PAST CADENCE'},
  aging:        {color: T.statusWarn,  label: 'AGING'},
  healthy:      {color: T.green,       label: 'HEALTHY'},
};

const STATES = ['ALL', 'NJ', 'MO', 'NY', 'RI', 'MA'];
const FLAG_FILTERS = ['all', 'out_of_stock', 'low_inv', 'past_cadence', 'aging'] as const;

function daysSince(d: string | null): number | null {
  if (!d) return null;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

function fmt$(n: number | null): string {
  if (n == null) return '—';
  return '$' + n.toLocaleString('en-US', {minimumFractionDigits: 0, maximumFractionDigits: 0});
}

// ─── Types ────────────────────────────────────────────────────────────────────
type FeedItem = {
  id: string;
  name: string;
  market_state: string | null;
  city: string | null;
  phone: string | null;
  website: string | null;
  tier: string | null;
  market_rank: number | null;
  market_total: number | null;
  zoho_account_id: string | null;
  orders_count: number;
  last_order_date: string | null;
  last_order_amount: number | null;
  reorder_cadence_days: number | null;
  reorder_status: string;
  reorder_flag_aging_at: string | null;
  reorder_flag_past_cadence_at: string | null;
  reorder_flag_low_inv_at: string | null;
  reorder_flag_out_of_stock_at: string | null;
  days_since: number | null;
  last_flagged_at: string | null;
  active_flag: string;
  primary_contact_name: string | null;
  primary_contact_phone: string | null;
  primary_contact_email: string | null;
};

// ─── Action — suppress / unsuppress ──────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd = await request.formData();
  const intent = String(fd.get('intent') || '');
  const org_id = String(fd.get('org_id') || '').trim();
  if (!org_id) return json({ok: false, error: 'org_id required'}, {status: 400});

  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };

  if (intent === 'suppress') {
    await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({reorder_suppressed: true, updated_at: new Date().toISOString()}),
    });
    return json({ok: true, suppressed: true});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({authenticated: false, feed: [], stats: null, litError: null});

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  // ── Fetch orgs: has orders, not churned, not suppressed ─────────────────────
  const select = [
    'id','name','market_state','city','phone','website',
    'tier','market_rank','market_total','zoho_account_id',
    'orders_count','last_order_date','last_order_amount',
    'reorder_cadence_days','reorder_status','reorder_suppressed',
    'reorder_flag_aging_at','reorder_flag_past_cadence_at',
    'reorder_flag_low_inv_at','reorder_flag_out_of_stock_at',
    'contacts(id,first_name,last_name,full_name,email,phone,mobile,is_primary_buyer)',
  ].join(',');

  const orgsRes = await fetch(
    `${base}/rest/v1/organizations` +
    `?last_order_date=not.is.null` +
    `&lifecycle_stage=not.in.(churned)` +
    `&reorder_suppressed=eq.false` +
    `&select=${encodeURIComponent(select)}` +
    `&order=name.asc&limit=2000`,
    {headers: h},
  );
  const orgsRaw: any[] = await orgsRes.json().catch(() => []);
  if (!Array.isArray(orgsRaw)) return json({authenticated: true, feed: [], stats: null, litError: 'supabase_error'});

  // ── Lit Alerts ───────────────────────────────────────────────────────────────
  const litUrl = env.LIT_ALERTS_API_URL;
  const litToken = env.LIT_ALERTS_API_TOKEN;
  let litLowInvSet = new Set<string>();
  let litOosSet    = new Set<string>();
  let litError: string | null = null;

  if (litUrl && litToken) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const litRes = await fetch(
        `${litUrl.replace(/\/$/, '')}/alerts/snapshot`,
        {headers: {Authorization: `Bearer ${litToken}`, Accept: 'application/json'}, signal: ctrl.signal},
      );
      clearTimeout(t);
      if (litRes.ok) {
        const litData: any = await litRes.json();
        for (const row of litData?.lowInventory || []) { if (row.zohoAccountId) litLowInvSet.add(String(row.zohoAccountId)); }
        for (const row of litData?.offMenu || [])       { if (row.zohoAccountId) litOosSet.add(String(row.zohoAccountId)); }
      }
    } catch { litError = 'lit_unavailable'; }
  } else { litError = 'lit_not_configured'; }

  // ── Compute flags + build feed ───────────────────────────────────────────────
  const now = new Date().toISOString();
  const flagPatches: Array<{org_id: string; patch: Record<string, any>}> = [];
  const feed: FeedItem[] = [];

  for (const org of orgsRaw) {
    const days  = daysSince(org.last_order_date);
    if (days === null) continue;

    const cadence: number | null = org.reorder_cadence_days ?? null;
    const zohoId = org.zoho_account_id ? String(org.zoho_account_id) : null;
    const currentStatus: string = org.reorder_status || 'healthy';

    const timeActive    = cadence === null && days >= 45;
    const cadenceActive = cadence !== null && days >= cadence;
    const lowInvActive  = zohoId ? litLowInvSet.has(zohoId) : false;
    const oosActive     = zohoId ? litOosSet.has(zohoId) : false;

    if (!timeActive && !cadenceActive && !lowInvActive && !oosActive) continue;

    // Stamp new flag if needed
    const patch: Record<string, any> = {};
    if (oosActive && !org.reorder_flag_out_of_stock_at) {
      patch.reorder_flag_out_of_stock_at = now;
      patch.reorder_status = 'out_of_stock';
    } else if (lowInvActive && !org.reorder_flag_low_inv_at && currentStatus !== 'out_of_stock') {
      patch.reorder_flag_low_inv_at = now;
      patch.reorder_status = 'low_inv';
    } else if (cadenceActive && !org.reorder_flag_past_cadence_at && currentStatus === 'healthy') {
      patch.reorder_flag_past_cadence_at = now;
      patch.reorder_status = 'past_cadence';
    } else if (timeActive && !org.reorder_flag_aging_at && currentStatus === 'healthy') {
      patch.reorder_flag_aging_at = now;
      patch.reorder_status = 'aging';
    }

    if (Object.keys(patch).length > 0) {
      flagPatches.push({org_id: org.id, patch});
      Object.assign(org, patch);
    }

    const timestamps = [
      org.reorder_flag_aging_at,
      org.reorder_flag_past_cadence_at,
      org.reorder_flag_low_inv_at,
      org.reorder_flag_out_of_stock_at,
    ].filter(Boolean) as string[];
    const lastFlaggedAt = timestamps.length > 0 ? timestamps.sort().reverse()[0] : null;

    let activeFlag = 'healthy';
    if (oosActive)         activeFlag = 'out_of_stock';
    else if (lowInvActive) activeFlag = 'low_inv';
    else if (cadenceActive) activeFlag = 'past_cadence';
    else if (timeActive)   activeFlag = 'aging';

    const contacts: any[] = Array.isArray(org.contacts) ? org.contacts : [];
    const primary = contacts.find((c: any) => c.is_primary_buyer) || contacts[0] || null;

    feed.push({
      id: org.id, name: org.name || '',
      market_state: org.market_state || null, city: org.city || null,
      phone: org.phone || null, website: org.website || null,
      tier: org.tier || null, market_rank: org.market_rank ?? null,
      market_total: org.market_total ?? null, zoho_account_id: zohoId,
      orders_count: org.orders_count ?? 0,
      last_order_date: org.last_order_date || null,
      last_order_amount: org.last_order_amount != null ? parseFloat(String(org.last_order_amount)) : null,
      reorder_cadence_days: cadence, reorder_status: org.reorder_status || 'healthy',
      reorder_flag_aging_at: org.reorder_flag_aging_at || null,
      reorder_flag_past_cadence_at: org.reorder_flag_past_cadence_at || null,
      reorder_flag_low_inv_at: org.reorder_flag_low_inv_at || null,
      reorder_flag_out_of_stock_at: org.reorder_flag_out_of_stock_at || null,
      days_since: days, last_flagged_at: lastFlaggedAt, active_flag: activeFlag,
      primary_contact_name: primary ? (primary.full_name || `${primary.first_name || ''} ${primary.last_name || ''}`.trim() || null) : null,
      primary_contact_phone: primary ? (primary.phone || primary.mobile || null) : null,
      primary_contact_email: primary?.email || null,
    });
  }

  feed.sort((a, b) => {
    if (a.last_flagged_at && b.last_flagged_at) return a.last_flagged_at > b.last_flagged_at ? -1 : 1;
    if (a.last_flagged_at) return -1;
    if (b.last_flagged_at) return 1;
    return (b.days_since ?? 0) - (a.days_since ?? 0);
  });

  // Fire-and-forget flag patches
  if (flagPatches.length > 0) {
    const pH = {...h, 'Content-Type': 'application/json', Prefer: 'return=minimal'};
    let cursor = 0;
    const workers = Array.from({length: Math.min(8, flagPatches.length)}, async () => {
      while (cursor < flagPatches.length) {
        const {org_id, patch} = flagPatches[cursor++];
        await fetch(`${base}/rest/v1/organizations?id=eq.${org_id}`,
          {method: 'PATCH', headers: pH, body: JSON.stringify({...patch, updated_at: now})}).catch(() => {});
      }
    });
    Promise.all(workers).catch(() => {});
  }

  // Stat counts
  const stats = {
    total: feed.length,
    out_of_stock: feed.filter(f => f.active_flag === 'out_of_stock').length,
    low_inv:      feed.filter(f => f.active_flag === 'low_inv').length,
    past_cadence: feed.filter(f => f.active_flag === 'past_cadence').length,
    aging:        feed.filter(f => f.active_flag === 'aging').length,
  };

  return json({authenticated: true, feed, stats, litError});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReordersPage() {
  const {authenticated, feed, stats, litError} = useLoaderData<typeof loader>() as any;
  const [stateFilter, setStateFilter] = useState('ALL');
  const [flagFilter,  setFlagFilter]  = useState<string>('all');
  const [search, setSearch] = useState('');
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        (document.getElementById('reorders-search') as HTMLInputElement)?.focus();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  if (!authenticated) {
    return <div style={{minHeight:'100vh',background:T.bg,display:'flex',alignItems:'center',justifyContent:'center'}}><a href="/sales-staging" style={{color:T.yellow,fontFamily:'Teko,sans-serif',fontSize:18,letterSpacing:'0.18em',textDecoration:'none'}}>← BACK TO LOGIN</a></div>;
  }

  const items: FeedItem[] = (feed || []).filter((f: FeedItem) => !suppressed.has(f.id));

  const filtered = items.filter(item => {
    if (stateFilter !== 'ALL' && item.market_state !== stateFilter) return false;
    if (flagFilter  !== 'all' && item.active_flag  !== flagFilter)  return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.city || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const stateCounts: Record<string, number> = {ALL: items.length};
  for (const s of STATES.slice(1)) stateCounts[s] = items.filter(i => i.market_state === s).length;

  const flagCounts: Record<string, number> = {all: items.length};
  for (const f of FLAG_FILTERS.slice(1)) flagCounts[f] = items.filter(i => i.active_flag === f).length;

  const s: any = stats || {};

  return (
    <SalesFloorLayout current="Reorders Due">

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div style={{padding:'24px 28px 20px', borderBottom:`1px solid ${T.border}`, position:'relative', overflow:'hidden', display:'flex', alignItems:'flex-end', justifyContent:'space-between'}}>
        <div style={{position:'absolute',bottom:0,left:0,right:0,height:1,background:T.border}} className="hs-sweep" />
        <div>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.32em',color:T.textFaint,textTransform:'uppercase'}}>Sales Floor / Workspace</div>
          <div style={{display:'flex',alignItems:'baseline',gap:14,marginTop:4}}>
            <h1 style={{margin:0,fontFamily:'Teko,sans-serif',fontSize:38,fontWeight:500,letterSpacing:'0.18em',color:T.text,textTransform:'uppercase'}}>Reorders Due</h1>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:12,color:T.textSubtle,letterSpacing:'0.10em'}}>
              {filtered.length} account{filtered.length !== 1 ? 's' : ''} · sorted by most recently flagged
            </span>
          </div>
        </div>
        {litError && (
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.statusWarn,letterSpacing:'0.12em',padding:'4px 8px',border:`1px solid ${T.statusWarn}33`}}>
            LIT ALERTS: {litError === 'lit_not_configured' ? 'NOT CONFIGURED' : 'UNAVAILABLE'}
          </div>
        )}
      </div>

      {/* ── Stat bar ─────────────────────────────────────────────────────── */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',background:T.border,gap:1,borderBottom:`1px solid ${T.border}`}}>
        {[
          {label:'Total flagged',   val:s.total         || 0, accent:T.text},
          {label:'Out of stock',    val:s.out_of_stock  || 0, accent:T.redSystems},
          {label:'Low inventory',   val:s.low_inv       || 0, accent:'#FF8A00'},
          {label:'Past cadence',    val:s.past_cadence  || 0, accent:T.yellow},
          {label:'Aging (45d+)',    val:s.aging         || 0, accent:T.statusWarn},
        ].map(cell => (
          <div key={cell.label} style={{background:T.bg,padding:'16px 18px'}}>
            <div style={{fontFamily:'Teko,sans-serif',fontSize:10.5,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',marginBottom:4}}>{cell.label}</div>
            <span style={{fontFamily:'Teko,sans-serif',fontSize:34,fontWeight:600,color:cell.accent,lineHeight:0.9}}>{cell.val}</span>
          </div>
        ))}
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div style={{borderBottom:`1px solid ${T.border}`,padding:'14px 28px',background:T.bg}}>

        {/* Row 1: State + Search */}
        <div style={{display:'flex',alignItems:'center',gap:22,marginBottom:12}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',minWidth:50}}>State</div>
          <div style={{display:'flex',gap:0,border:`1px solid ${T.borderStrong}`}}>
            {STATES.map(s => {
              const active = stateFilter === s;
              const n = stateCounts[s] || 0;
              return (
                <button key={s} onClick={() => setStateFilter(s)}
                  style={{padding:'7px 12px',background:active?T.yellow:'transparent',color:active?'#000':T.textMuted,fontFamily:'JetBrains Mono,monospace',fontSize:11,letterSpacing:'0.10em',cursor:'pointer',border:'none',borderRight:`1px solid ${T.borderStrong}`}}>
                  <span style={{fontWeight:active?700:500}}>{s}</span>
                  {n > 0 && <span style={{opacity:active?0.7:0.6,fontSize:10,marginLeft:4}}>{n}</span>}
                </button>
              );
            })}
          </div>
          <div style={{flex:1}} />
          <div style={{display:'flex',alignItems:'center',border:`1px solid ${T.borderStrong}`,padding:'0 12px',height:36,width:280,background:T.surface,gap:10}}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.textFaint} strokeWidth="1.8"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>
            <input id="reorders-search" placeholder="Search by name or city" value={search} onChange={e => setSearch(e.target.value)}
              style={{flex:1,background:'transparent',border:'none',outline:'none',color:T.text,fontSize:13,fontFamily:'inherit'}} />
            {search && <button onClick={() => setSearch('')} style={{background:'none',border:'none',color:T.textFaint,cursor:'pointer',padding:0}}>✕</button>}
            {!search && <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textFaint,border:`1px solid ${T.borderStrong}`,padding:'1px 5px',letterSpacing:'0.12em'}}>⌘K</span>}
          </div>
        </div>

        {/* Row 2: Flag type filter */}
        <div style={{display:'flex',alignItems:'center',gap:22}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:11,letterSpacing:'0.30em',color:T.textFaint,textTransform:'uppercase',minWidth:50}}>Flag</div>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            {FLAG_FILTERS.map(f => {
              const active = flagFilter === f;
              const meta   = f === 'all' ? {color:T.yellow, label:'ALL'} : FLAG_META[f];
              const n      = flagCounts[f] || 0;
              return (
                <button key={f} onClick={() => setFlagFilter(f)}
                  style={{padding:'6px 11px',border:`1px solid ${active?meta.color:T.borderStrong}`,color:active?meta.color:T.textSubtle,fontFamily:'Teko,sans-serif',fontSize:14,letterSpacing:'0.18em',textTransform:'uppercase',background:active?`${meta.color}18`:'transparent',cursor:'pointer',display:'inline-flex',alignItems:'center',gap:7}}>
                  <span>{meta.label}</span>
                  <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>{n}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Feed ─────────────────────────────────────────────────────────── */}
      <div style={{background:T.bg,flex:1}}>
        {filtered.length === 0 && (
          <div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:20,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>
            {items.length === 0 ? 'All accounts are healthy — no reorders due' : 'No accounts match this filter'}
          </div>
        )}
        {filtered.map(item => (
          <ReorderCard key={item.id} item={item} onSuppress={id => setSuppressed(prev => new Set([...prev, id]))} />
        ))}
      </div>

      <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
        <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>
          END OF LIST · {filtered.length} ACCOUNT{filtered.length !== 1 ? 'S' : ''}
        </div>
      </div>
    </SalesFloorLayout>
  );
}

// ─── Reorder Card ─────────────────────────────────────────────────────────────
function ReorderCard({item, onSuppress}: {item: FeedItem; onSuppress: (id: string) => void}) {
  const fetcher = useFetcher();
  const [logoFailed, setLogoFailed] = useState(false);
  const [hovered, setHovered]       = useState(false);

  const flagMeta  = FLAG_META[item.active_flag] || FLAG_META.healthy;
  const flagColor = flagMeta.color;
  const tc        = item.tier ? (TIER_COLOR[item.tier] || T.textFaint) : null;

  const daysColor = item.days_since === null ? T.cyan
                  : item.days_since <= 30  ? T.green
                  : item.days_since <= 60  ? T.statusWarn
                  : T.redSystems;

  const domain = item.website ? (() => {
    try { return new URL(item.website.startsWith('http') ? item.website : `https://${item.website}`).hostname.replace(/^www\./, ''); }
    catch { return null; }
  })() : null;

  const initials = (item.name || '').split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('');
  const phone = item.phone || item.primary_contact_phone;
  const email = item.primary_contact_email;

  const lastFlagTime = item.last_flagged_at
    ? new Date(item.last_flagged_at).toLocaleDateString('en-US', {month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'})
    : null;

  const handleSuppress = () => {
    onSuppress(item.id);
    const fd = new FormData();
    fd.set('intent', 'suppress');
    fd.set('org_id', item.id);
    fetcher.submit(fd, {method: 'post'});
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{background: hovered ? T.surfaceElev : T.surface, borderTop: `1px solid ${T.border}`, transition: 'background 120ms'}}>

      {/* Main grid */}
      <div style={{display:'grid', gridTemplateColumns:'4px 56px 1fr 130px 160px', alignItems:'center', gap:0, minHeight:72}}>

        {/* Flag rail */}
        <div style={{alignSelf:'stretch', background:flagColor, opacity:0.85}} />

        {/* Logo */}
        <div style={{padding:'12px 0 12px 16px'}}>
          <div style={{width:40,height:40,background:'#000',border:`1px solid ${T.borderStrong}`,display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
            {domain && !logoFailed
              ? <img src={`https://www.google.com/s2/favicons?domain=${domain}&sz=64`} alt={item.name} onError={() => setLogoFailed(true)} style={{width:26,height:26,objectFit:'contain'}} />
              : <span style={{fontFamily:'Teko,sans-serif',fontSize:18,fontWeight:600,color:T.textSubtle,letterSpacing:'0.05em'}}>{initials}</span>}
          </div>
        </div>

        {/* Identity */}
        <div style={{padding:'12px 20px 12px 14px', minWidth:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <a href={`/sales-staging/account/${item.id}`}
              style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1,textDecoration:'none'}}>
              {item.name}
            </a>
            {/* Flag badge */}
            <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',border:`1px solid ${flagColor}`,color:flagColor,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',background:`${flagColor}15`}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:flagColor,flexShrink:0}} />
              {flagMeta.label}
            </span>
            {/* Tier */}
            {tc && <span style={{padding:'2px 6px',border:`1px solid ${tc}`,color:tc,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.16em',background:`${tc}12`}}>TIER {item.tier}</span>}
            {/* Market rank */}
            {item.market_rank && (
              <span style={{padding:'2px 6px',border:`1px solid ${T.cyan}33`,color:T.cyan,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.14em'}}>
                #{item.market_rank} {item.market_state}
              </span>
            )}
          </div>
          {/* Location + flagged time */}
          <div style={{display:'flex',alignItems:'center',gap:10,marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textMuted,letterSpacing:'0.04em'}}>
            <span>{item.market_state}{item.city ? ` · ${item.city}` : ''}</span>
            {lastFlagTime && (
              <>
                <span style={{color:T.borderStrong}}>|</span>
                <span style={{color:T.textFaint}}>flagged {lastFlagTime}</span>
              </>
            )}
          </div>
          {/* Contact */}
          {(item.primary_contact_name || phone || email) && (
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint}}>
              {item.primary_contact_name && <span style={{color:T.textSubtle}}>{item.primary_contact_name}</span>}
              {phone && <span>{phone}</span>}
              {email && <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{email}</span>}
            </div>
          )}
        </div>

        {/* Days since */}
        <div style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center'}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:2}}>Last order</div>
          <div style={{display:'flex',alignItems:'baseline',gap:4}}>
            <span style={{fontFamily:'Teko,sans-serif',fontSize:34,fontWeight:600,color:daysColor,lineHeight:0.9}}>
              {item.days_since ?? '—'}
            </span>
            {item.days_since !== null && <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textSubtle,letterSpacing:'0.12em'}}>DAYS</span>}
          </div>
          {item.last_order_date && (
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint,marginTop:3}}>
              {new Date(item.last_order_date).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
            </div>
          )}
        </div>

        {/* Order stats */}
        <div style={{padding:'12px 16px',borderLeft:`1px solid ${T.border}`,height:'100%',display:'flex',flexDirection:'column',justifyContent:'center',gap:3}}>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:10,letterSpacing:'0.26em',color:T.textFaint,textTransform:'uppercase',marginBottom:1}}>Order stats</div>
          <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.yellow,lineHeight:0.95}}>
            {fmt$(item.last_order_amount)}
          </div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textSubtle,letterSpacing:'0.08em'}}>last order</div>
          <div style={{display:'flex',gap:8,marginTop:1}}>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:T.textFaint}}>
              {item.orders_count} order{item.orders_count !== 1 ? 's' : ''}
            </span>
            <span style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:item.reorder_cadence_days ? T.cyan : T.textFaint}}>
              {item.reorder_cadence_days ? `${item.reorder_cadence_days}d avg` : 'no cadence'}
            </span>
          </div>
        </div>
      </div>

      {/* Action row — matches Account List style */}
      <div style={{display:'flex',gap:0,borderTop:`1px solid ${T.border}88`,padding:'0 16px 0 76px',alignItems:'center'}}>
        {phone && (
          <a href={`tel:${phone}`} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',color:T.textFaint,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.10em',textDecoration:'none',borderRight:`1px solid ${T.border}88`}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>
            CALL
          </a>
        )}
        {phone && (
          <a href={`sms:${phone}`} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',color:T.textFaint,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.10em',textDecoration:'none',borderRight:`1px solid ${T.border}88`}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M3 5h18v12h-8l-5 4v-4H3z"/></svg>
            TEXT
          </a>
        )}
        {email && (
          <a href={`mailto:${email}`} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',color:T.textFaint,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.10em',textDecoration:'none',borderRight:`1px solid ${T.border}88`}}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><path d="M3 6h18v12H3zM3 6l9 7 9-7"/></svg>
            EMAIL
          </a>
        )}
        <a href={`/sales-staging/account/${item.id}`} style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',color:T.textFaint,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.10em',textDecoration:'none',borderRight:`1px solid ${T.border}88`}}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"><rect x="3" y="1" width="10" height="14" rx="1"/><path d="M6 5h4M6 8h4M6 11h2"/></svg>
          VIEW ACCOUNT
        </a>
        {/* Suppress — removes from feed until next order */}
        <button
          onClick={handleSuppress}
          disabled={fetcher.state !== 'idle'}
          style={{display:'flex',alignItems:'center',gap:6,padding:'8px 14px',color:T.textFaint,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,letterSpacing:'0.10em',background:'none',border:'none',cursor:'pointer',marginLeft:'auto',opacity:fetcher.state !== 'idle' ? 0.5 : 1}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><path d="M4.93 4.93l14.14 14.14"/></svg>
          SUPPRESS
        </button>
      </div>
    </div>
  );
}
