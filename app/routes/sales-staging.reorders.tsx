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
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useFetcher} from '@remix-run/react';
import {useState, useEffect, useCallback} from 'react';
import {CardActions} from '~/components/SalesFloorCardActions';
import {SalesFloorNoteWidget} from '~/components/SalesFloorNoteWidget';
import type {NotePreview} from '~/components/SalesFloorNoteWidget';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';
import {SalesFloorMapView, MapViewToggle} from '~/components/SalesFloorMapView';

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

function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target]);
  return val;
}

function StatCell({label, value, accent}: {label:string; value:number; accent:string}) {
  const n = useCountUp(value);
  return (
    <div style={{background:T.bg, padding:'16px 18px'}}>
      <div style={{fontFamily:'Teko,sans-serif', fontSize:10.5, letterSpacing:'0.30em', color:T.textFaint, textTransform:'uppercase', marginBottom:4}}>{label}</div>
      <span style={{fontFamily:'Teko,sans-serif', fontSize:34, fontWeight:600, color:accent, lineHeight:0.9}}>{n}</span>
    </div>
  );
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
  tags: string[];
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
  lat: number | null;
  lng: number | null;
  latest_note: NotePreview | null;
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

  if (intent === 'flag_pete') {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}&select=tags`, {headers: h});
    const rows = await res.json().catch(() => []);
    const tags: string[] = rows?.[0]?.tags || [];
    const hasPete = tags.includes('pete-followup');
    const newTags = hasPete ? tags.filter((t: string) => t !== 'pete-followup') : [...tags, 'pete-followup'];
    await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({tags: newTags, updated_at: new Date().toISOString()}),
    });
    return json({ok: true, flagged: !hasPete});
  }

  if (intent === 'churn') {
    await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH', headers: h,
      body: JSON.stringify({
        lifecycle_stage: 'churned',
        reorder_status: null,
        reorder_flag_aging_at: null,
        reorder_flag_past_cadence_at: null,
        reorder_flag_low_inv_at: null,
        reorder_flag_out_of_stock_at: null,
        updated_at: new Date().toISOString(),
      }),
    });
    return json({ok: true, churned: true});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) {
    return redirect('/sales-staging/login');
  }

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const base = env.SUPABASE_URL;

  // ── Fetch orgs: has orders, not churned, not suppressed ─────────────────────
  const select = [
    'id','name','market_state','city','phone','website',
    'tier','market_rank','market_total','zoho_account_id',
    'orders_count','last_order_date','last_order_amount',
    'tags','reorder_cadence_days','reorder_status','reorder_suppressed',
    'reorder_flag_aging_at','reorder_flag_past_cadence_at',
    'reorder_flag_low_inv_at','reorder_flag_out_of_stock_at',
    'lat','lng',
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
    // Lit API returns bare numeric zohoAccountId (no "zcrm_" prefix) — strip prefix for matching
    const zohoId = org.zoho_account_id ? String(org.zoho_account_id).replace('zcrm_', '') : null;
    const currentStatus: string = org.reorder_status || 'healthy';

    const timeActive    = cadence === null && days >= 45;
    const cadenceActive = cadence !== null && days >= cadence;

    // Lit flags: skip if account placed an order within the last 10 days —
    // they've already reordered and delivery is likely pending.
    // recalcOrgAfterOrder clears flags on new order, but Lit may still show OOS
    // until the delivery resolves. 10 days covers typical fulfillment windows.
    const orderedWithin10Days = org.last_order_date
      ? daysSince(org.last_order_date) !== null && (daysSince(org.last_order_date) as number) <= 10
      : false;
    const lowInvActive  = !orderedWithin10Days && (zohoId ? litLowInvSet.has(zohoId) : false);
    const oosActive     = !orderedWithin10Days && (zohoId ? litOosSet.has(zohoId) : false);

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
      tags: Array.isArray(org.tags) ? org.tags : [],
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
      lat: org.lat ?? null,
      lng: org.lng ?? null,
      latest_note: null, // populated after notes fetch below
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

  // ── Batch fetch latest note per org in feed ──────────────────────────────────
  if (feed.length > 0) {
    try {
      const ids = feed.map(f => f.id).join(',');
      const notesRes = await fetch(
        `${base}/rest/v1/org_notes?organization_id=in.(${ids})&select=id,organization_id,body,author_name,created_at&order=created_at.desc&limit=1000`,
        {headers: h},
      );
      if (notesRes.ok) {
        const notes: any[] = await notesRes.json().catch(() => []);
        // First note per org = most recent (already sorted desc)
        const latestMap = new Map<string, NotePreview>();
        for (const n of notes) {
          if (!latestMap.has(n.organization_id)) {
            latestMap.set(n.organization_id, {
              id: n.id, body: n.body,
              author_name: n.author_name, created_at: n.created_at,
            });
          }
        }
        for (const item of feed) {
          item.latest_note = latestMap.get(item.id) || null;
        }
      }
    } catch { /* notes are best-effort — don't break the feed */ }
  }

  const googleMapsKey = (env.GOOGLE_PLACES_NEW_API_KEY || env.GOOGLE_PLACES_API_KEY || null) as string|null;
  return json({authenticated: true, sfUser, feed, stats, litError, googleMapsKey});
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function ReordersPage() {
  const {authenticated, sfUser, feed, stats, litError, googleMapsKey} = useLoaderData<typeof loader>() as any;
  const [stateFilter, setStateFilter] = useState('ALL');
  const [flagFilter,  setFlagFilter]  = useState<string>('all');
  const [sort, setSort] = useState<'flagged'|'orders_desc'|'orders_asc'>('flagged');
  const [search, setSearch] = useState('');
  const [suppressed, setSuppressed] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'list'|'map'>('list');

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

  const filtered = [...items.filter(item => {
    if (stateFilter !== 'ALL' && item.market_state !== stateFilter) return false;
    if (flagFilter  !== 'all' && item.active_flag  !== flagFilter)  return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!item.name.toLowerCase().includes(q) && !(item.city || '').toLowerCase().includes(q)) return false;
    }
    return true;
  })].sort((a, b) => {
    if (sort === 'orders_desc') return (b.orders_count||0) - (a.orders_count||0);
    if (sort === 'orders_asc')  return (a.orders_count||0) - (b.orders_count||0);
    // default: most recently flagged (already sorted from loader)
    if (a.last_flagged_at && b.last_flagged_at) return a.last_flagged_at > b.last_flagged_at ? -1 : 1;
    if (a.last_flagged_at) return -1;
    if (b.last_flagged_at) return 1;
    return 0;
  });

  // State counts for tab badges
  const stateCounts: Record<string, number> = {ALL: items.length};
  for (const s of STATES.slice(1)) stateCounts[s] = items.filter(i => i.market_state === s).length;

  // Stats reactive to state filter — compute client-side so stat bar updates when state tab changes
  const stateItems = stateFilter === 'ALL' ? items : items.filter(i => i.market_state === stateFilter);
  const liveStats = {
    total:       stateItems.length,
    out_of_stock: stateItems.filter(f => f.active_flag === 'out_of_stock').length,
    low_inv:      stateItems.filter(f => f.active_flag === 'low_inv').length,
    past_cadence: stateItems.filter(f => f.active_flag === 'past_cadence').length,
    aging:        stateItems.filter(f => f.active_flag === 'aging').length,
  };

  // Flag counts respect state filter
  const flagCounts: Record<string, number> = {all: stateItems.length};
  for (const f of FLAG_FILTERS.slice(1)) flagCounts[f] = stateItems.filter(i => i.active_flag === f).length;

  return (
    <SalesFloorLayout current="Reorders Due" sfUser={sfUser}>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16}}>
          <div>
            <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', lineHeight:1}}>Reorders Due</h1>
            <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
              {filtered.length} account{filtered.length !== 1 ? 's' : ''} · sorted by most recently flagged
              {litError && <span style={{marginLeft:12, color:T.statusWarn}}>· Lit: {litError === 'lit_not_configured' ? 'not configured' : 'unavailable'}</span>}
            </div>
          </div>
        </div>

        {/* State tabs + search — matches Sales Orders style */}
        <div style={{display:'flex', alignItems:'center', gap:12}}>
          <div style={{display:'flex', gap:1}}>
            {STATES.map(s => {
              const active = stateFilter === s;
              const n = stateCounts[s] || 0;
              return (
                <button key={s} onClick={() => setStateFilter(s)}
                  style={{height:32, padding:'0 14px', background:active?`rgba(255,213,0,0.08)`:'transparent', border:'none', borderBottom:`2px solid ${active?T.yellow:'transparent'}`, color:active?T.yellow:T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer'}}>
                  {s}{n > 0 ? ` ${n}` : ''}
                </button>
              );
            })}
          </div>
          <div style={{flex:1}} />
          {/* Search */}
          <div style={{display:'flex', alignItems:'center', gap:0}}>
            <input
              id="reorders-search"
              placeholder="Search by name or city…"
              value={search} onChange={e => setSearch(e.target.value)}
              style={{height:32, padding:'0 12px', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, borderRight:'none', color:T.text, fontFamily:'Inter,sans-serif', fontSize:12, outline:'none', width:220, letterSpacing:'0.02em'}}
            />
            <button type="button" onClick={search ? () => setSearch('') : undefined}
              style={{height:32, padding:'0 10px', background:search?T.yellow:T.surfaceElev, border:`1px solid ${T.borderStrong}`, color:search?'#000':T.textFaint, cursor:'pointer', fontFamily:'JetBrains Mono,monospace', fontSize:10, letterSpacing:'0.10em'}}>
              {search ? '✕' : '⌕'}
            </button>
          </div>
        </div>
      </div>

      {/* ── Stat bar — reactive to state filter, counts up from zero ─────── */}
      <div style={{display:'grid', gridTemplateColumns:'repeat(5,1fr)', background:T.border, gap:1, borderBottom:`1px solid ${T.border}`, flexShrink:0}}>
        <StatCell label="Total Flagged"   value={liveStats.total}       accent={T.text} />
        <StatCell label="Out of Stock"    value={liveStats.out_of_stock} accent={T.redSystems} />
        <StatCell label="Low Inventory"   value={liveStats.low_inv}      accent='#FF8A00' />
        <StatCell label="Past Cadence"    value={liveStats.past_cadence} accent={T.yellow} />
        <StatCell label="Aging (45d+)"    value={liveStats.aging}        accent={T.statusWarn} />
      </div>

      {/* ── Flag filter + sort ────────────────────────────────────────────── */}
      <div style={{borderBottom:`1px solid ${T.border}`, padding:'10px 28px', background:T.bg, display:'flex', alignItems:'center', gap:8, flexWrap:'wrap'}}>
        {FLAG_FILTERS.map(f => {
          const active = flagFilter === f;
          const meta   = f === 'all' ? {color: T.yellow, label: 'ALL'} : FLAG_META[f];
          const n      = flagCounts[f] || 0;
          return (
            <button key={f} onClick={() => setFlagFilter(f)}
              style={{height:30, padding:'0 12px', border:`1px solid ${active ? meta.color : T.borderStrong}`, color:active ? meta.color : T.textSubtle, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', background:active ? `${meta.color}18` : 'transparent', cursor:'pointer', display:'inline-flex', alignItems:'center', gap:8}}>
              <span>{meta.label}</span>
              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:10, color:T.textFaint}}>{n}</span>
            </button>
          );
        })}
        {/* Toggle + Sort — right-aligned */}
        <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
          <MapViewToggle viewMode={viewMode} setViewMode={setViewMode}/>
          <select value={sort} onChange={e => setSort(e.target.value as any)}
            style={{height:30, padding:'0 10px', background:T.surfaceElev, border:`1px solid ${T.borderStrong}`, color:T.text, fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.14em', cursor:'pointer', outline:'none'}}>
            <option value="flagged">Sort: Most Recently Flagged</option>
            <option value="orders_desc">Sort: Total Orders (High → Low)</option>
            <option value="orders_asc">Sort: Total Orders (Low → High)</option>
          </select>
        </div>
      </div>

      {/* ── Feed or Map ───────────────────────────────────────────────────── */}
      {viewMode === 'map' ? (
        <SalesFloorMapView
          orgs={filtered}
          googleMapsKey={googleMapsKey||''}
          stateFilter={stateFilter}
          getPinConfig={(org) => {
            const FLAG_COLORS: Record<string,string> = {
              out_of_stock: T.redSystems,
              low_inv: '#FF8A00',
              past_cadence: T.yellow,
              aging: T.statusWarn,
            };
            const FLAG_LABELS: Record<string,string> = {
              out_of_stock: '!', low_inv: '↓', past_cadence: 'C', aging: 'A',
            };
            return {
              color: FLAG_COLORS[org.active_flag] || '#6A6A6A',
              label: FLAG_LABELS[org.active_flag] || '',
            };
          }}
          getInfoHtml={(org) => {
            const fm = FLAG_META[org.active_flag] || {color:'#9C9C9C', label: org.active_flag};
            const days = org.days_since !== null ? `${org.days_since}d` : '—';
            const daysColor = org.days_since===null?'#00D4FF':org.days_since<=30?'#00E676':org.days_since<=60?'#FFB300':'#FF3355';
            const phone = org.phone||org.primary_contact_phone||'';
            return `<div style="background:#141414;padding:14px 16px;min-width:220px;font-family:Arial,sans-serif;color:#F5F5F5;border:1px solid #2F2F2F"><div style="font-size:14px;font-weight:700;letter-spacing:0.04em;margin-bottom:3px;line-height:1.2">${org.name}</div><div style="font-size:10px;color:#9C9C9C;margin-bottom:8px">${[org.market_state,org.city].filter(Boolean).join(' · ')}</div><div style="display:inline-block;padding:2px 7px;border:1px solid ${fm.color};color:${fm.color};font-size:9px;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:10px">${fm.label}</div><div style="display:flex;gap:14px;margin-bottom:12px"><div><div style="font-size:8px;color:#6A6A6A;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:2px">Last Order</div><div style="font-size:20px;font-weight:700;color:${daysColor};line-height:1">${days}</div></div><div style="flex:1"><div style="font-size:8px;color:#6A6A6A;letter-spacing:0.16em;text-transform:uppercase;margin-bottom:2px">Contact</div><div style="font-size:11px;color:#C8C8C8">${org.primary_contact_name||'—'}</div>${phone?`<div style="font-size:10px;color:#9C9C9C">${phone}</div>`:''}</div></div><a href="/sales-staging/account/${org.id}" style="display:block;text-align:center;padding:7px 12px;background:#FFD500;color:#000;font-weight:700;font-size:11px;letter-spacing:0.14em;text-decoration:none;text-transform:uppercase">Open Account →</a></div>`;
          }}
          legendItems={[
            {color: T.redSystems, label: 'Out of Stock'},
            {color: '#FF8A00',    label: 'Low Inventory'},
            {color: T.yellow,     label: 'Past Cadence'},
            {color: T.statusWarn, label: 'Aging'},
          ]}
        />
      ) : (
        <>
          <div style={{background:T.bg,flex:1}}>
            {filtered.length === 0 && (
              <div style={{padding:'64px 28px',textAlign:'center',fontFamily:'Teko,sans-serif',fontSize:20,letterSpacing:'0.20em',color:T.textFaint,textTransform:'uppercase'}}>
                {items.length === 0 ? 'All accounts are healthy — no reorders due' : 'No accounts match this filter'}
              </div>
            )}
            {filtered.map(item => (
              <ReorderCard key={item.id} item={item} onRemove={id => setSuppressed(prev => new Set([...prev, id]))} />
            ))}
          </div>
          <div style={{padding:'18px 28px',borderTop:`1px solid ${T.border}`,display:'flex',justifyContent:'space-between'}}>
            <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint,letterSpacing:'0.14em'}}>
              END OF LIST · {filtered.length} ACCOUNT{filtered.length !== 1 ? 'S' : ''}
            </div>
          </div>
        </>
      )}
    </SalesFloorLayout>
  );
}

// ─── Reorder Card ─────────────────────────────────────────────────────────────
function ReorderCard({item, onRemove}: {item: FeedItem; onRemove: (id: string) => void}) {
  const fetcher    = useFetcher();
  const [logoFailed, setLogoFailed] = useState(false);
  const [hovered,    setHovered]    = useState(false);

  const flagMeta  = FLAG_META[item.active_flag] || FLAG_META.healthy;
  const flagColor = flagMeta.color;
  const tc        = item.tier ? (TIER_COLOR[item.tier] || T.textFaint) : null;

  const daysColor = item.days_since === null ? T.cyan
    : item.days_since <= 30 ? T.green
    : item.days_since <= 60 ? T.statusWarn
    : T.redSystems;

  const domain = item.website ? (() => {
    try { return new URL(item.website.startsWith('http') ? item.website : `https://${item.website}`).hostname.replace(/^www\./, ''); }
    catch { return null; }
  })() : null;

  const initials = (item.name || '').split(/\s+/).slice(0, 2).map((w: string) => w[0]?.toUpperCase() || '').join('');
  const phone = item.phone || item.primary_contact_phone;
  const email = item.primary_contact_email;

  const lastFlagTime = item.last_flagged_at
    ? new Date(item.last_flagged_at).toLocaleDateString('en-US', {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'})
    : null;

  const isFlagged = (item.tags || []).includes('pete-followup');
  const zohoIdNumeric = (item.zoho_account_id || '').replace('zcrm_', '');

  const submitIntent = useCallback((intent: string) => {
    onRemove(item.id);
    const fd = new FormData();
    fd.set('intent', intent);
    fd.set('org_id', item.id);
    fetcher.submit(fd, {method: 'post'});
  }, [item.id, onRemove, fetcher]);

  const actionPost = useCallback(async (apiUrl: string, body: Record<string, any>) => {
    try { await fetch(apiUrl, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(body)}); } catch {}
  }, []);

  const flagFetcher = useFetcher();
  const toggleFlag = useCallback(() => {
    const fd = new FormData();
    fd.set('intent', 'flag_pete');
    fd.set('org_id', item.id);
    flagFetcher.submit(fd, {method: 'post'});
  }, [item.id, flagFetcher]);

  const openBrief = useCallback(() => {
    if (!phone && !email) { alert('No contact info on file.'); return; }
    const w = window.open('', '_brief', 'width=700,height=600');
    if (w) {
      w.document.write('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:24px"><h2>Loading brief…</h2></body></html>');
      actionPost('/api/brief', {lead: {First_Name: item.primary_contact_name?.split(' ')[0] || '', Last_Name: item.primary_contact_name?.split(' ').slice(1).join(' ') || '', _fullName: item.primary_contact_name || item.name, Company: item.name, Phone: phone || '', Email: email || '', _status: 'active'}}).then(() => { w.location.href = '/sales-floor/app?brief=1'; });
    }
  }, [phone, email, item, actionPost]);

  const onTraining   = useCallback(() => actionPost('/api/sales-floor-vibes-training', {zohoAccountId: zohoIdNumeric, customerName: item.name, trainingFocus: ''}), [zohoIdNumeric, item.name, actionPost]);
  const onNewProduct = useCallback(() => actionPost('/api/sales-floor-vibes-product-onboard', {zohoAccountId: zohoIdNumeric, customerName: item.name}), [zohoIdNumeric, item.name, actionPost]);
  const onSendMenu   = useCallback(() => {
    if (!email) { alert('No email on file.'); return; }
    const subject = 'Highsman Wholesale Menu';
    const body2   = `Hi there,\n\nHere's our wholesale menu:\n\nhttps://highsman.com/wholesale\n\nBest,\nSky Lima\nHighsman`;
    window.open(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body2)}`);
  }, [email]);

  return (
    <div
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{background: hovered ? T.surfaceElev : T.surface, borderTop:`1px solid ${T.border}`, transition:'background 120ms'}}>

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
          {/* Name + flag badge only — no tier/rank pills */}
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <a href={`/sales-staging/account/${item.id}?from=reorders`}
              style={{fontFamily:'Teko,sans-serif',fontSize:22,letterSpacing:'0.06em',fontWeight:500,color:T.text,textTransform:'uppercase',lineHeight:1,textDecoration:'none'}}>
              {item.name}
            </a>
            <span style={{display:'inline-flex',alignItems:'center',gap:5,padding:'2px 8px',border:`1px solid ${flagColor}`,color:flagColor,fontFamily:'JetBrains Mono,monospace',fontSize:9.5,letterSpacing:'0.16em',textTransform:'uppercase',background:`${flagColor}15`}}>
              <span style={{width:5,height:5,borderRadius:'50%',background:flagColor,flexShrink:0}} />
              {flagMeta.label}
            </span>
          </div>
          {/* Meta row: state · city · tier (text) · rank (text) · flagged time — no pill clutter */}
          <div style={{display:'flex',alignItems:'center',gap:8,marginTop:5,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textMuted,letterSpacing:'0.04em',flexWrap:'wrap'}}>
            <span>{item.market_state}{item.city ? ` · ${item.city}` : ''}</span>
            {tc && <><span style={{color:T.borderStrong}}>·</span><span style={{color:tc}}>Tier {item.tier}</span></>}
            {item.market_rank && <><span style={{color:T.borderStrong}}>·</span><span style={{color:T.cyan}}>#{item.market_rank} {item.market_state}</span></>}
            {lastFlagTime && <><span style={{color:T.borderStrong}}>|</span><span style={{color:T.textFaint}}>flagged {lastFlagTime}</span></>}
          </div>
          {/* Contact line */}
          {(item.primary_contact_name || phone || email) && (
            <div style={{display:'flex',alignItems:'center',gap:10,marginTop:3,fontFamily:'JetBrains Mono,monospace',fontSize:10.5,color:T.textFaint}}>
              {item.primary_contact_name && <span style={{color:T.textSubtle}}>{item.primary_contact_name}</span>}
              {phone && <span>{phone}</span>}
              {email && <span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{email}</span>}
            </div>
          )}
        </div>

        {/* Days since last order */}
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
          <div style={{display:'flex',alignItems:'baseline',gap:12}}>
            <div>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.yellow,lineHeight:0.95}}>{fmt$(item.last_order_amount)}</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textSubtle,letterSpacing:'0.08em',marginTop:2}}>last order</div>
            </div>
            <div style={{borderLeft:`1px solid ${T.border}`,paddingLeft:10}}>
              <div style={{fontFamily:'Teko,sans-serif',fontSize:22,fontWeight:600,color:T.text,lineHeight:0.95}}>{item.orders_count||0}</div>
              <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:9.5,color:T.textSubtle,letterSpacing:'0.08em',marginTop:2}}>total orders</div>
            </div>
          </div>
          <div style={{fontFamily:'JetBrains Mono,monospace',fontSize:10,color:item.reorder_cadence_days ? T.cyan : T.textFaint,marginTop:4}}>
            {item.reorder_cadence_days ? `${item.reorder_cadence_days}d avg cadence` : 'no cadence data'}
          </div>
        </div>
      </div>

      {/* Shared CardActions — exact same buttons as Accounts + Suppress + Churn */}
      {/* Inline note widget — above action buttons */}
      <SalesFloorNoteWidget orgId={item.id} latestNote={item.latest_note} from="reorders" />

      <CardActions
        phone={phone}
        email={email}
        isFlagged={isFlagged}
        orgId={item.id}
        onBrief={openBrief}
        onFlag={toggleFlag}
        onTraining={onTraining}
        onSendMenu={onSendMenu}
        onNewProduct={onNewProduct}
        onSuppress={() => submitIntent('suppress')}
        onChurn={() => submitIntent('churn')}
      />
    </div>
  );
}
