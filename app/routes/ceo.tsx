/**
 * app/routes/ceo.tsx
 *
 * Highsman /ceo Sentiment Dashboard — password-gated, unlisted.
 *
 * What it shows:
 *   • Three columns of flagged email threads, one per severity tier:
 *       3 = CRITICAL · 2 = WARNING · 1 = WATCH
 *   • Filterable by category (customer/internal/burnout) and mailbox
 *   • Click a card to see reasoning, evidence quote, and recommended action
 *   • "Mark resolved" / "Hide" actions write back to ceo_sentiment_flags
 *
 * Privacy/security:
 *   • robots: noindex, nofollow on the meta tag
 *   • Password gate via Cookie (Path=/ per memory reference_sales_floor_cookie_path
 *     so XHRs to /api/ceo-flag-action work)
 *   • Reads exclusively from Supabase. The dashboard NEVER hits Gmail directly.
 *   • Klaviyo popup auto-suppressed by URL pattern per memory
 *     feedback_klaviyo_popup_suppression — but we belt-and-braces it with a
 *     <script> override in case that helper hasn't been added to /ceo yet.
 *
 * Place in Hydrogen as: app/routes/ceo.tsx
 */

import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData, useActionData, Form, useFetcher, useSearchParams} from '@remix-run/react';
import {useMemo, useState, type ReactNode} from 'react';

import {
  readFlags,
  readLastScan,
  setFlagResolved,
  setFlagHidden,
  reopenFlag,
  type FlagRow,
} from '~/lib/ceo-sentiment';
import {getZohoAccessToken} from '~/lib/zoho-auth';

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | CEO Sentiment'},
  {name: 'robots', content: 'noindex, nofollow, noarchive'},
  {name: 'googlebot', content: 'noindex, nofollow'},
];

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const CATEGORY_LABEL: Record<string, string> = {
  customer_frustration: 'Customer',
  internal_tension: 'Internal',
  staff_burnout: 'Burnout',
};
const CATEGORY_COLOR: Record<string, string> = {
  customer_frustration: '#FF6B35',
  internal_tension: '#9D4EDD',
  staff_burnout: '#3DA5D9',
};

const SEVERITY_TIERS = [
  {level: 3, label: 'CRITICAL', sub: 'Handle today', color: '#EF4444', glow: 'rgba(239,68,68,0.18)'},
  {level: 2, label: 'WARNING',  sub: 'This week',   color: '#F59E0B', glow: 'rgba(245,158,11,0.18)'},
  {level: 1, label: 'WATCH',    sub: 'Monitor',     color: '#EAB308', glow: 'rgba(234,179,8,0.14)'},
];

// ─────────────────────────────────────────────────────────────────────────────
// Action — password gate + flag-row mutations
// ─────────────────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const formData = await request.formData();
  const intent = String(formData.get('intent') || 'login');

  if (intent === 'login') {
    const password = String(formData.get('password') || '');
    const correct = env.CEO_DASHBOARD_PASSWORD || 'Cristy2026$$';
    if (password === correct) {
      return json(
        {ok: true, error: null, intent},
        {
          headers: {
            // Path=/ so /api/ceo-flag-action XHR can read the cookie too
            // (memory: reference_sales_floor_cookie_path)
            'Set-Cookie': `ceo_auth=1; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`,
          },
        },
      );
    }
    return json({ok: false, error: 'Incorrect password', intent});
  }

  // Mutations require the auth cookie
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('ceo_auth=1')) {
    return json({ok: false, error: 'unauthorized', intent}, {status: 401});
  }

  if (intent === 'logout') {
    return redirect('/ceo', {
      headers: {'Set-Cookie': `ceo_auth=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`},
    });
  }

  const id = String(formData.get('id') || '');
  if (!id) return json({ok: false, error: 'missing id', intent}, {status: 400});

  if (intent === 'resolve') {
    const note = String(formData.get('note') || '').slice(0, 500);
    await setFlagResolved(env, id, note);
    return json({ok: true, error: null, intent, id});
  }
  if (intent === 'hide') {
    await setFlagHidden(env, id);
    return json({ok: true, error: null, intent, id});
  }
  if (intent === 'reopen') {
    await reopenFlag(env, id);
    return json({ok: true, error: null, intent, id});
  }

  return json({ok: false, error: 'unknown intent', intent}, {status: 400});
}

// ─────────────────────────────────────────────────────────────────────────────
// Loader — auth check + Supabase read
// ─────────────────────────────────────────────────────────────────────────────
type Flag = FlagRow;

type LoaderData = {
  authenticated: boolean;
  error: string | null;
  flags: Flag[];
  mailboxes: string[];
  totals: {critical: number; warning: number; watch: number; resolved7d: number};
  lastScan: {finished_at: string | null; status: string | null} | null;
  launchEnrollment: LaunchEnrollment | null;
};

type EnrolledStore = {
  id: string;
  name: string;
  city: string | null;
  redeemedAt: string | null;
  orderNumber: string | null;
};
type NotEnrolledStore = {id: string; name: string; city: string | null};
type LaunchEnrollment = {
  enrolled: EnrolledStore[];
  notEnrolled: NotEnrolledStore[];
  total: number;
  error: string | null;
};

// ── LAUNCH Promo Enrollment — pulled live from Zoho ──────────────────────────
// Lists every NJ Account and buckets by Launch_Promo_Used so the CEO can see,
// in real time, who has redeemed the wholesale stock-up code and who hasn't.
async function loadLaunchEnrollment(env: any): Promise<LaunchEnrollment> {
  const empty: LaunchEnrollment = {
    enrolled: [],
    notEnrolled: [],
    total: 0,
    error: null,
  };
  try {
    const token = await getZohoAccessToken(env);
    if (!token) return {...empty, error: 'Zoho token unavailable'};

    const fields = [
      'Account_Name',
      'Billing_City',
      'Launch_Promo_Used',
      'Launch_Promo_Redeemed_At',
      'Launch_Promo_Order_Number',
    ].join(',');
    // 2-arity OR is the only criteria shape Zoho's parser likes here — chained
    // `or` returns 502 SYNTAX_ERROR. Account_State picklist OR'd with
    // Billing_State free text catches both migrated and fresh records.
    const criteria = `((Account_State:equals:NJ)or(Billing_State:equals:NJ))`;

    const enrolled: EnrolledStore[] = [];
    const notEnrolled: NotEnrolledStore[] = [];
    let page = 1;
    let more = true;
    let total = 0;
    while (more && page <= 10 /* safety: 10 * 200 = 2000 NJ accounts */) {
      const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
      url.searchParams.set('criteria', criteria);
      url.searchParams.set('fields', fields);
      url.searchParams.set('per_page', '200');
      url.searchParams.set('page', String(page));
      const res = await fetch(url.toString(), {
        headers: {Authorization: `Zoho-oauthtoken ${token}`},
      });
      if (res.status === 204) break;
      if (!res.ok) {
        const body = await res.text();
        return {
          ...empty,
          error: `Zoho ${res.status}: ${body.slice(0, 160)}`,
        };
      }
      const data: any = await res.json();
      const rows: any[] = data?.data || [];
      total += rows.length;
      for (const a of rows) {
        const name = a.Account_Name || '(unnamed)';
        const city = a.Billing_City || null;
        if (a.Launch_Promo_Used === true) {
          enrolled.push({
            id: String(a.id),
            name,
            city,
            redeemedAt: a.Launch_Promo_Redeemed_At || null,
            orderNumber: a.Launch_Promo_Order_Number || null,
          });
        } else {
          notEnrolled.push({id: String(a.id), name, city});
        }
      }
      more = data?.info?.more_records === true;
      page++;
    }

    // Most recent redemptions first; not-enrolled alphabetical for scannability
    enrolled.sort((a, b) => {
      const ta = a.redeemedAt ? new Date(a.redeemedAt).getTime() : 0;
      const tb = b.redeemedAt ? new Date(b.redeemedAt).getTime() : 0;
      return tb - ta;
    });
    notEnrolled.sort((a, b) => a.name.localeCompare(b.name));

    return {enrolled, notEnrolled, total, error: null};
  } catch (err: any) {
    return {...empty, error: String(err?.message || err)};
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const cookie = request.headers.get('Cookie') || '';
  const isAuth = cookie.includes('ceo_auth=1');
  if (!isAuth) {
    return json<LoaderData>({
      authenticated: false,
      error: null,
      flags: [],
      mailboxes: [],
      totals: {critical: 0, warning: 0, watch: 0, resolved7d: 0},
      lastScan: null,
      launchEnrollment: null,
    });
  }

  const env = (context as any).env;
  const url = new URL(request.url);
  const showResolved = url.searchParams.get('show') === 'resolved';

  let flags: Flag[] = [];
  let lastScan: {finished_at: string | null; status: string | null} | null = null;
  let launchEnrollment: LaunchEnrollment | null = null;
  let errorMsg: string | null = null;
  try {
    // Run Supabase reads + Zoho enrollment fetch in parallel — Zoho is the
    // slowest leg (~600-1200ms cold) so parallelism shaves about that off
    // the dashboard's TTFB.
    const [flagsResult, scanResult, enrollResult] = await Promise.all([
      readFlags(env, showResolved),
      readLastScan(env),
      loadLaunchEnrollment(env),
    ]);
    flags = flagsResult;
    lastScan = scanResult;
    launchEnrollment = enrollResult;
  } catch (err: any) {
    errorMsg = String(err?.message || err);
  }

  const mailboxes = Array.from(new Set(flags.map((f) => f.mailbox_email))).sort();

  const sevenDaysAgo = Date.now() - 7 * 86400_000;
  const resolved7d = flags.filter(
    (f) => f.resolved && f.resolved_at && new Date(f.resolved_at).getTime() >= sevenDaysAgo,
  ).length;
  const open = flags.filter((f) => !f.resolved);
  const totals = {
    critical: open.filter((f) => f.severity === 3).length,
    warning: open.filter((f) => f.severity === 2).length,
    watch: open.filter((f) => f.severity === 1).length,
    resolved7d,
  };

  return json<LoaderData>({
    authenticated: true,
    error: errorMsg,
    flags,
    mailboxes,
    totals,
    lastScan,
    launchEnrollment,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// UI
// ─────────────────────────────────────────────────────────────────────────────
export default function CeoDashboard() {
  const data = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as any;

  if (!data.authenticated) {
    return <LoginScreen error={actionData?.intent === 'login' ? actionData?.error : null} />;
  }
  return <Dashboard data={data} actionData={actionData} />;
}

// ── Login ──────────────────────────────────────────────────────────────────
function LoginScreen({error}: {error: string | null}) {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <KlaviyoSuppressor />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <img
            src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
            alt="Highsman"
            className="mx-auto mb-6"
            style={{width: 140}}
          />
          <h1
            className="text-white text-2xl uppercase tracking-wider mb-1"
            style={{fontFamily: 'Teko, sans-serif', fontWeight: 700}}
          >
            CEO COMMAND CENTER
          </h1>
          <p className="text-[#A9ACAF] text-sm uppercase tracking-widest">
            Restricted access
          </p>
        </div>
        <Form method="post" className="space-y-4">
          <input type="hidden" name="intent" value="login" />
          <input
            type="password"
            name="password"
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-3 border border-[#A9ACAF]/20 rounded-lg text-white bg-[#111] text-sm outline-none focus:border-[#c8a84b] transition-colors"
          />
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
          <button
            type="submit"
            className="w-full py-3 rounded-lg font-bold text-sm uppercase tracking-wider cursor-pointer"
            style={{
              fontFamily: 'Teko, sans-serif',
              background: '#c8a84b',
              color: '#000',
              fontSize: '1.1rem',
              border: 'none',
            }}
          >
            ENTER
          </button>
        </Form>
        <p className="text-[#666] text-[10px] text-center mt-6 uppercase tracking-widest">
          Unlisted · Not in directory
        </p>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({data, actionData}: {data: LoaderData; actionData: any}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeFlag, setActiveFlag] = useState<Flag | null>(null);

  const categoryFilter = searchParams.get('category') || 'all';
  const mailboxFilter = searchParams.get('mailbox') || 'all';
  const showResolved = searchParams.get('show') === 'resolved';

  const visibleFlags = useMemo(() => {
    return data.flags.filter((f) => {
      if (categoryFilter !== 'all' && f.category !== categoryFilter) return false;
      if (mailboxFilter !== 'all' && f.mailbox_email !== mailboxFilter) return false;
      if (!showResolved && f.resolved) return false;
      return true;
    });
  }, [data.flags, categoryFilter, mailboxFilter, showResolved]);

  const byTier = useMemo(() => {
    const grouped: Record<number, Flag[]> = {1: [], 2: [], 3: []};
    for (const f of visibleFlags) grouped[f.severity]?.push(f);
    return grouped;
  }, [visibleFlags]);

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(searchParams);
    if (value === 'all' || value === '') next.delete(key);
    else next.set(key, value);
    setSearchParams(next, {replace: true});
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <KlaviyoSuppressor />
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-6">
        {/* Header */}
        <header className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-4">
            <img
              src="https://d3k81ch9hvuctc.cloudfront.net/company/XiTH4j/images/56982811-5ee5-41d7-ba35-b6dc317e2204.png"
              alt="Highsman"
              style={{width: 100}}
            />
            <div>
              <h1
                className="text-2xl sm:text-3xl uppercase tracking-wider"
                style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, color: '#c8a84b'}}
              >
                CEO COMMAND CENTER
              </h1>
              <p className="text-[#A9ACAF] text-xs uppercase tracking-widest">
                Sentiment radar · 90-day window · {data.flags.length} open signals
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 text-xs text-[#A9ACAF]">
            {data.lastScan?.finished_at && (
              <span>
                Last scan{' '}
                <span className="text-white">
                  {new Date(data.lastScan.finished_at).toLocaleString()}
                </span>{' '}
                · <span style={{color: data.lastScan.status === 'ok' ? '#22C55E' : '#F59E0B'}}>
                  {data.lastScan.status}
                </span>
              </span>
            )}
            <Form method="post">
              <input type="hidden" name="intent" value="logout" />
              <button type="submit" className="text-[#A9ACAF] hover:text-white text-xs uppercase tracking-wider underline">
                Sign out
              </button>
            </Form>
          </div>
        </header>

        {data.error && (
          <div className="mb-6 p-4 rounded-lg border border-red-900 bg-red-950/40 text-red-300 text-sm">
            {data.error}
          </div>
        )}

        {/* Top-line stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat label="Critical"  value={data.totals.critical}  color="#EF4444" />
          <Stat label="Warning"   value={data.totals.warning}   color="#F59E0B" />
          <Stat label="Watch"     value={data.totals.watch}     color="#EAB308" />
          <Stat label="Resolved (7d)" value={data.totals.resolved7d} color="#22C55E" />
        </div>

        {/* LAUNCH Promo enrollment */}
        {data.launchEnrollment && (
          <LaunchEnrollmentPanel data={data.launchEnrollment} />
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <FilterPill label="All categories"   value="all"                     active={categoryFilter} onClick={(v) => setFilter('category', v)} />
          <FilterPill label="Customer"         value="customer_frustration"    active={categoryFilter} onClick={(v) => setFilter('category', v)} dot={CATEGORY_COLOR.customer_frustration} />
          <FilterPill label="Internal"         value="internal_tension"        active={categoryFilter} onClick={(v) => setFilter('category', v)} dot={CATEGORY_COLOR.internal_tension} />
          <FilterPill label="Burnout"          value="staff_burnout"           active={categoryFilter} onClick={(v) => setFilter('category', v)} dot={CATEGORY_COLOR.staff_burnout} />
          <span className="mx-2 text-[#333]">|</span>
          <select
            value={mailboxFilter}
            onChange={(e) => setFilter('mailbox', e.target.value)}
            className="bg-[#111] border border-[#222] rounded-lg px-3 py-1.5 text-xs uppercase tracking-wider text-white"
          >
            <option value="all">All mailboxes ({data.mailboxes.length})</option>
            {data.mailboxes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
          <button
            onClick={() => setFilter('show', showResolved ? 'all' : 'resolved')}
            className="px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border"
            style={{
              borderColor: showResolved ? '#22C55E' : '#222',
              color: showResolved ? '#22C55E' : '#A9ACAF',
              background: showResolved ? 'rgba(34,197,94,0.1)' : 'transparent',
            }}
          >
            {showResolved ? '✓ showing resolved' : 'show resolved'}
          </button>
        </div>

        {/* 3-tier columns */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {SEVERITY_TIERS.map((tier) => (
            <SeverityColumn
              key={tier.level}
              tier={tier}
              flags={byTier[tier.level] || []}
              onCardClick={setActiveFlag}
            />
          ))}
        </div>

        <footer className="mt-12 text-[10px] text-[#444] text-center uppercase tracking-widest">
          Confidential · for CEO use only · do not screenshot or share
        </footer>
      </div>

      {activeFlag && (
        <FlagDetail
          flag={activeFlag}
          onClose={() => setActiveFlag(null)}
          actionData={actionData}
        />
      )}
    </div>
  );
}

// ── Components ─────────────────────────────────────────────────────────────
function Stat({label, value, color}: {label: string; value: number; color: string}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{borderColor: '#1a1a1a', background: '#0a0a0a'}}
    >
      <div className="text-[10px] uppercase tracking-widest text-[#A9ACAF] mb-1">{label}</div>
      <div className="text-3xl font-bold" style={{color, fontFamily: 'Teko, sans-serif'}}>
        {value}
      </div>
    </div>
  );
}

function FilterPill({
  label, value, active, onClick, dot,
}: {
  label: string; value: string; active: string;
  onClick: (v: string) => void; dot?: string;
}) {
  const isActive = active === value || (value === 'all' && active === 'all');
  return (
    <button
      onClick={() => onClick(value)}
      className="px-3 py-1.5 text-xs uppercase tracking-wider rounded-lg border flex items-center gap-2"
      style={{
        borderColor: isActive ? '#c8a84b' : '#222',
        color: isActive ? '#c8a84b' : '#A9ACAF',
        background: isActive ? 'rgba(200,168,75,0.08)' : 'transparent',
      }}
    >
      {dot && <span className="inline-block w-2 h-2 rounded-full" style={{background: dot}} />}
      {label}
    </button>
  );
}

function SeverityColumn({
  tier, flags, onCardClick,
}: {
  tier: typeof SEVERITY_TIERS[0]; flags: Flag[]; onCardClick: (f: Flag) => void;
}) {
  return (
    <div
      className="rounded-xl border p-4"
      style={{borderColor: '#1a1a1a', background: `linear-gradient(180deg, ${tier.glow}, transparent 200px)`}}
    >
      <div className="flex items-baseline justify-between mb-4 pb-3 border-b border-[#1a1a1a]">
        <div>
          <div
            className="text-xl font-bold uppercase tracking-wider"
            style={{color: tier.color, fontFamily: 'Teko, sans-serif'}}
          >
            {tier.label}
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[#A9ACAF]">{tier.sub}</div>
        </div>
        <div className="text-3xl font-bold" style={{color: tier.color, fontFamily: 'Teko, sans-serif'}}>
          {flags.length}
        </div>
      </div>
      <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-1">
        {flags.length === 0 && (
          <div className="text-[#666] text-xs italic py-8 text-center">
            Nothing here. Quiet is good.
          </div>
        )}
        {flags.map((f) => (
          <FlagCard key={f.id} flag={f} tierColor={tier.color} onClick={() => onCardClick(f)} />
        ))}
      </div>
    </div>
  );
}

function FlagCard({flag, tierColor, onClick}: {flag: Flag; tierColor: string; onClick: () => void}) {
  const catColor = CATEGORY_COLOR[flag.category];
  const externalParticipants = flag.participants.filter((p) => p.role === 'external');
  const headline = externalParticipants[0]?.email || flag.participants[0]?.email || flag.mailbox_email;
  const ageMs = Date.now() - new Date(flag.message_date).getTime();
  const ageDays = Math.floor(ageMs / 86400_000);
  const ageLabel = ageDays === 0 ? 'today' : ageDays === 1 ? '1d ago' : `${ageDays}d ago`;

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-lg border p-3 hover:border-[#c8a84b]/60 transition-colors"
      style={{borderColor: '#1f1f1f', background: '#0d0d0d'}}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span
          className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
          style={{background: `${catColor}22`, color: catColor}}
        >
          {CATEGORY_LABEL[flag.category]}
        </span>
        <span className="text-[10px] text-[#666] uppercase">{ageLabel}</span>
      </div>
      <div className="text-sm font-semibold text-white line-clamp-1 mb-1">
        {flag.subject || '(no subject)'}
      </div>
      <div className="text-[11px] text-[#A9ACAF] line-clamp-1 mb-2">{headline}</div>
      {flag.evidence_quote && (
        <div
          className="text-xs italic line-clamp-2 pl-2 border-l-2"
          style={{borderColor: tierColor, color: '#ddd'}}
        >
          "{flag.evidence_quote}"
        </div>
      )}
      {flag.resolved && (
        <div className="text-[10px] text-[#22C55E] mt-2 uppercase tracking-widest">✓ Resolved</div>
      )}
    </button>
  );
}

function FlagDetail({flag, onClose, actionData}: {flag: Flag; onClose: () => void; actionData: any}) {
  const fetcher = useFetcher();
  const catColor = CATEGORY_COLOR[flag.category];
  const sevColor = SEVERITY_TIERS.find((t) => t.level === flag.severity)?.color || '#FFF';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-[#0a0a0a] border border-[#1a1a1a] rounded-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-5 border-b border-[#1a1a1a] flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span
                className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
                style={{background: `${catColor}22`, color: catColor}}
              >
                {CATEGORY_LABEL[flag.category]}
              </span>
              <span
                className="text-[10px] uppercase tracking-widest font-bold px-2 py-0.5 rounded"
                style={{background: `${sevColor}22`, color: sevColor}}
              >
                {SEVERITY_TIERS.find((t) => t.level === flag.severity)?.label}
              </span>
              {flag.is_internal_only && (
                <span className="text-[10px] uppercase tracking-widest text-[#A9ACAF] border border-[#222] px-2 py-0.5 rounded">
                  Internal only
                </span>
              )}
            </div>
            <h2 className="text-lg font-semibold text-white">{flag.subject || '(no subject)'}</h2>
            <div className="text-xs text-[#A9ACAF] mt-1">
              {flag.mailbox_email} · {new Date(flag.message_date).toLocaleString()}
            </div>
          </div>
          <button onClick={onClose} className="text-[#A9ACAF] hover:text-white text-xl leading-none">
            ×
          </button>
        </div>

        <div className="p-5 space-y-5 text-sm">
          {flag.reasoning && (
            <Section label="Why it was flagged">{flag.reasoning}</Section>
          )}
          {flag.evidence_quote && (
            <Section label="Evidence">
              <div className="italic pl-3 border-l-2" style={{borderColor: sevColor}}>
                "{flag.evidence_quote}"
              </div>
            </Section>
          )}
          {flag.recommended_action && (
            <Section label="Recommended action">
              <div className="text-[#c8a84b]">{flag.recommended_action}</div>
            </Section>
          )}
          <Section label="Participants">
            <div className="flex flex-wrap gap-2">
              {flag.participants.map((p, i) => (
                <span
                  key={`${p.email}-${i}`}
                  className="text-xs px-2 py-1 rounded border"
                  style={{
                    borderColor: p.role === 'internal' ? '#c8a84b44' : '#FF6B3544',
                    color: p.role === 'internal' ? '#c8a84b' : '#FF6B35',
                  }}
                >
                  {p.email}
                </span>
              ))}
            </div>
          </Section>
          {flag.snippet && (
            <Section label="Snippet">
              <div className="text-[#ccc] whitespace-pre-wrap text-xs leading-relaxed">{flag.snippet}</div>
            </Section>
          )}
          {flag.thread_url && (
            <a
              href={flag.thread_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block text-xs uppercase tracking-widest text-[#c8a84b] hover:underline"
            >
              Open in Gmail →
            </a>
          )}
        </div>

        <div className="p-5 border-t border-[#1a1a1a] flex flex-wrap items-center gap-2">
          {!flag.resolved ? (
            <>
              <fetcher.Form method="post" className="flex items-center gap-2 flex-1 min-w-[200px]">
                <input type="hidden" name="intent" value="resolve" />
                <input type="hidden" name="id" value={flag.id} />
                <input
                  type="text"
                  name="note"
                  placeholder="Resolution note (optional)"
                  className="flex-1 bg-[#111] border border-[#222] rounded px-3 py-2 text-xs text-white"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded text-xs uppercase tracking-wider font-bold"
                  style={{background: '#22C55E', color: '#000'}}
                >
                  Mark resolved
                </button>
              </fetcher.Form>
              <fetcher.Form method="post">
                <input type="hidden" name="intent" value="hide" />
                <input type="hidden" name="id" value={flag.id} />
                <button
                  type="submit"
                  className="px-3 py-2 rounded text-xs uppercase tracking-wider text-[#A9ACAF] border border-[#222] hover:border-[#A9ACAF]"
                >
                  False positive
                </button>
              </fetcher.Form>
            </>
          ) : (
            <fetcher.Form method="post">
              <input type="hidden" name="intent" value="reopen" />
              <input type="hidden" name="id" value={flag.id} />
              <button
                type="submit"
                className="px-4 py-2 rounded text-xs uppercase tracking-wider text-[#F59E0B] border border-[#F59E0B]/40"
              >
                Reopen
              </button>
            </fetcher.Form>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({label, children}: {label: string; children: ReactNode}) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-[#A9ACAF] mb-1.5">{label}</div>
      <div>{children}</div>
    </div>
  );
}

// ── Klaviyo suppressor ─────────────────────────────────────────────────────
// Belt-and-braces. Per memory feedback_klaviyo_popup_suppression any non-consumer
// page should hide the popup. The site-wide helper does this by URL pattern,
// but in case the helper hasn't been updated to include /ceo we kill it locally.

function LaunchEnrollmentPanel({data}: {data: LaunchEnrollment}) {
  const [expanded, setExpanded] = useState(true);
  const enrolledCount = data.enrolled.length;
  const notEnrolledCount = data.notEnrolled.length;
  const total = data.total || enrolledCount + notEnrolledCount;
  const pct = total > 0 ? Math.round((enrolledCount / total) * 100) : 0;

  return (
    <section
      className="mb-6 rounded-lg border"
      style={{borderColor: '#222', background: 'linear-gradient(180deg, rgba(245,228,0,0.04), rgba(245,228,0,0.01))'}}
    >
      <header
        onClick={() => setExpanded((v) => !v)}
        className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 cursor-pointer"
        style={{borderBottom: expanded ? '1px solid #222' : 'none'}}
      >
        <div className="flex items-center gap-3 flex-wrap">
          <span
            className="text-xs uppercase tracking-[0.25em] font-700 px-2 py-0.5 rounded"
            style={{fontFamily: 'Teko, sans-serif', background: '#F5E400', color: '#000', letterSpacing: '0.2em'}}
          >
            LAUNCH
          </span>
          <h2
            className="uppercase tracking-wider text-lg sm:text-xl"
            style={{fontFamily: 'Teko, sans-serif', fontWeight: 700, color: '#c8a84b'}}
          >
            NJ Wholesale Enrollment
          </h2>
          <span className="text-[#A9ACAF] text-xs uppercase tracking-widest hidden sm:inline">
            Apr 28 - May 8 window
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span style={{color: '#22C55E'}}>
            <strong className="text-base" style={{fontFamily: 'Teko, sans-serif'}}>{enrolledCount}</strong> enrolled
          </span>
          <span className="text-[#A9ACAF]">
            <strong className="text-base text-white" style={{fontFamily: 'Teko, sans-serif'}}>{notEnrolledCount}</strong> not yet
          </span>
          <span className="text-[#A9ACAF] hidden sm:inline">
            <strong className="text-base text-white" style={{fontFamily: 'Teko, sans-serif'}}>{pct}%</strong> coverage
          </span>
          <span className="text-[#666] text-base ml-1">{expanded ? '−' : '+'}</span>
        </div>
      </header>

      {expanded && (
        <>
          {data.error ? (
            <div className="px-4 py-3 text-xs text-red-400">
              Could not load enrollment from Zoho: {data.error}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
              {/* Enrolled column */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-widest text-[#22C55E] font-semibold">
                    Enrolled ({enrolledCount})
                  </h3>
                  <span className="text-[10px] text-[#666] uppercase tracking-wider">
                    Most recent first
                  </span>
                </div>
                {enrolledCount === 0 ? (
                  <p className="text-xs text-[#666] italic">
                    No redemptions yet. First retailer to use the LAUNCH code will appear here.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-[420px] overflow-y-auto pr-2">
                    {data.enrolled.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-baseline justify-between gap-3 px-3 py-2 rounded border"
                        style={{borderColor: 'rgba(34,197,94,0.2)', background: 'rgba(34,197,94,0.04)'}}
                      >
                        <div className="min-w-0">
                          <div className="text-sm text-white truncate">{s.name}</div>
                          <div className="text-[10px] text-[#A9ACAF] uppercase tracking-wider">
                            {s.city || 'NJ'}
                            {s.orderNumber && <> &middot; #{s.orderNumber}</>}
                          </div>
                        </div>
                        <div className="text-[10px] text-[#22C55E] uppercase tracking-wider whitespace-nowrap">
                          {s.redeemedAt
                            ? new Date(s.redeemedAt).toLocaleDateString('en-US', {month: 'short', day: 'numeric'})
                            : ''}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Not enrolled column */}
              <div>
                <div className="flex items-baseline justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-widest text-[#A9ACAF] font-semibold">
                    Not yet enrolled ({notEnrolledCount})
                  </h3>
                  <span className="text-[10px] text-[#666] uppercase tracking-wider">
                    Outreach targets
                  </span>
                </div>
                {notEnrolledCount === 0 ? (
                  <p className="text-xs text-[#22C55E] italic">
                    Every NJ account is enrolled. Lock in.
                  </p>
                ) : (
                  <ul className="space-y-1 max-h-[420px] overflow-y-auto pr-2 grid grid-cols-1 sm:grid-cols-2 gap-x-3">
                    {data.notEnrolled.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-baseline justify-between gap-2 text-xs px-2 py-1 rounded"
                        style={{background: 'rgba(255,255,255,0.02)'}}
                      >
                        <span className="text-white truncate">{s.name}</span>
                        <span className="text-[10px] text-[#666] uppercase whitespace-nowrap">
                          {s.city || ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function KlaviyoSuppressor() {
  const js = `
    (function () {
      var hide = function () {
        document.querySelectorAll('.klaviyo-form, [class*="kl-private-reset"], [data-klaviyo-form]').forEach(function (el) {
          el.style.display = 'none';
        });
        if (window._klOnsite && Array.isArray(window._klOnsite)) {
          window._klOnsite.push(['hideForms']);
        }
      };
      hide();
      var t = setInterval(hide, 800);
      setTimeout(function () { clearInterval(t); }, 15000);
    })();
  `;
  return <script dangerouslySetInnerHTML={{__html: js}} />;
}
