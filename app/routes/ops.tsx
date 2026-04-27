import {useEffect, useMemo} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /ops — Spark Team Ops Dashboard (field-staff only)
// ─────────────────────────────────────────────────────────────────────────────
// Mobile-first, dark, Klaviyo-suppressed. Four data-driven cards pulling from
// Zoho CRM (Events + Accounts) and Supabase (shift_reports views).
//
// Cards:
//   1. Today's Game Plan    — today's confirmed Zoho Events (Pop Ups)
//   2. This Week at a Glance — next 14 days, grouped by date
//   3. Coverage Pulse        — NJ Accounts colored by Visit_Date age
//   4. Scoreboard            — rolling 30-day rep stats from Supabase
//
// Each data source is fetched in parallel with its own try/catch so an outage
// in one system doesn't break the whole dashboard. "No data yet" empty states
// render when a fetch fails OR when the backing data doesn't exist (eg. no
// events booked today).
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — runs server-side on every page load
// ─────────────────────────────────────────────────────────────────────────────
type Env = {
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as Env;

  const hasZoho = Boolean(
    env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN,
  );
  const hasSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

  const now = new Date();
  const todayIso = dateKeyNJ(now);
  // Window extended Apr 2026 from 14 → 60 days so the new "Upcoming Pop-Ups"
  // card can show shifts more than two weeks out (especially around launch).
  const windowEnd = addDays(todayIso, 60);
  const weekHorizonIso = addDays(todayIso, 14);
  const startDateTime = `${todayIso}T00:00:00${njOffset(todayIso)}`;
  const endDateTime = `${windowEnd}T23:59:59${njOffset(windowEnd)}`;

  // Fetch in parallel, each in its own try/catch. A failing fetch returns null
  // (not []), so cards can render distinct "error" vs "empty" states.
  let accessToken: string | null = null;
  if (hasZoho) {
    try {
      accessToken = await getZohoAccessToken(env as Required<Pick<Env, 'ZOHO_CLIENT_ID' | 'ZOHO_CLIENT_SECRET' | 'ZOHO_REFRESH_TOKEN'>>);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[ops] Zoho token fetch failed', err);
    }
  }

  const [events, njAccounts, scoreboard] = await Promise.all([
    accessToken
      ? fetchEventsRange(accessToken, startDateTime, endDateTime).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[ops] events fetch failed', err);
          return null;
        })
      : Promise.resolve(null),
    accessToken
      ? fetchNJAccounts(accessToken).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn('[ops] NJ accounts fetch failed', err);
          return null;
        })
      : Promise.resolve(null),
    hasSupabase
      ? fetchScoreboard(env.SUPABASE_URL!, env.SUPABASE_SERVICE_KEY!).catch(
          (err) => {
            // eslint-disable-next-line no-console
            console.warn('[ops] scoreboard fetch failed', err);
            return null;
          },
        )
      : Promise.resolve(null),
  ]);

  // Enrich events with accountCity from the NJ accounts map so /shift-report
  // can prefill the city without a second round-trip. Keyed on Zoho account id.
  const cityById = new Map<string, string | null>();
  (njAccounts || []).forEach((a) => cityById.set(a.id, a.city));
  const allEvents: EventSummary[] = (events || []).map((e) => ({
    ...e,
    accountCity: e.accountId ? cityById.get(e.accountId) ?? null : null,
  }));
  const todayEvents = allEvents.filter((e) => e.date === todayIso);
  // Week glance = days 1..14. Upcoming = days 15..60. Today is its own bucket.
  const weekEvents = allEvents.filter(
    (e) => e.date !== todayIso && e.date <= weekHorizonIso,
  );
  const upcomingEvents = allEvents.filter((e) => e.date > weekHorizonIso);

  return json({
    nowIso: now.toISOString(),
    today: {ok: events !== null, events: todayEvents},
    week: {ok: events !== null, events: weekEvents},
    upcoming: {ok: events !== null, events: upcomingEvents},
    coverage: {
      ok: njAccounts !== null,
      accounts: rankCoverage(njAccounts || [], todayIso),
    },
    scoreboard: {ok: scoreboard !== null, reps: scoreboard || []},
    hasZoho,
    hasSupabase,
  });
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Spark Team Ops · Staff Only · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'Highsman Spark Team operational dashboard — daily game plan, weekly shifts, dispensary coverage, and end-of-shift reporting.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS FETCH — 14-day Events window, parsed into a simpler shape
// ─────────────────────────────────────────────────────────────────────────────
type EventSummary = {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  time: string; // "3:00 PM"
  accountId: string | null;
  accountName: string | null;
  accountCity: string | null; // enriched post-fetch from NJ accounts map
  territory: 'NJ-N' | 'NJ-S' | null;
  isOverride: boolean;
  startIso: string;
};

async function fetchEventsRange(
  accessToken: string,
  start: string,
  end: string,
): Promise<EventSummary[]> {
  // Zoho v7 criteria supports `between` with comma-separated range values.
  const criteria = `(Start_DateTime:between:${start},${end})`;
  const url = `https://www.zohoapis.com/crm/v7/Events/search?criteria=${encodeURIComponent(
    criteria,
  )}&fields=id,Event_Title,Start_DateTime,End_DateTime,What_Id&per_page=200&sort_by=Start_DateTime&sort_order=asc`;
  const res = await fetch(url, {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho Events search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows: any[] = data.data || [];
  return rows
    .map<EventSummary | null>((ev) => {
      const title = String(ev.Event_Title || '');
      // Only surface Spark Team events — tagged with [NJ-N] or [NJ-S] by /api/popups-book
      const nj = title.match(/^\[NJ-(N|S)\]/);
      if (!nj) return null;
      const territory: 'NJ-N' | 'NJ-S' = nj[1] === 'N' ? 'NJ-N' : 'NJ-S';
      const isOverride = title.includes('[OVR]');
      const startIso = String(ev.Start_DateTime || '');
      const date = startIso.slice(0, 10);
      const d = new Date(startIso);
      const time = Number.isFinite(d.getTime())
        ? d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
          })
        : '';
      const whatId = ev.What_Id?.id || null;
      const accountName = ev.What_Id?.name || parseAccountFromTitle(title);
      return {
        id: String(ev.id),
        title,
        date,
        time,
        accountId: whatId,
        accountName,
        accountCity: null, // enriched after njAccounts fetch resolves
        territory,
        isOverride,
        startIso,
      };
    })
    .filter((x): x is EventSummary => x !== null);
}

// Fallback account-name extractor for when What_Id isn't expanded.
// Title shape: "[NJ-N] Highsman Pop Up — <Dispensary Name> (Saturday matinee)"
function parseAccountFromTitle(title: string): string | null {
  const m = title.match(/—\s+(.+?)\s+\(/);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// NJ ACCOUNTS FETCH — for Coverage Pulse
// ─────────────────────────────────────────────────────────────────────────────
type NJAccount = {
  id: string;
  name: string;
  city: string | null;
  lastVisitDate: string | null;
};

async function fetchNJAccounts(accessToken: string): Promise<NJAccount[]> {
  // Zoho supports equals on Billing_State — fetch all NJ accounts in one shot.
  const criteria = `(Billing_State:equals:NJ)`;
  const url = `https://www.zohoapis.com/crm/v7/Accounts/search?criteria=${encodeURIComponent(
    criteria,
  )}&fields=id,Account_Name,Billing_City,Visit_Date&per_page=200`;
  const res = await fetch(url, {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho Accounts search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows: any[] = data.data || [];
  return rows.map<NJAccount>((a) => ({
    id: String(a.id),
    name: String(a.Account_Name || ''),
    city: a.Billing_City || null,
    lastVisitDate: a.Visit_Date || null, // yyyy-mm-dd or null
  }));
}

// Rank accounts by days-since-visit (oldest first), classify bucket for the pill.
type CoverageRow = NJAccount & {
  daysSince: number | null;
  bucket: 'fresh' | 'aging' | 'cold' | 'never';
};

function rankCoverage(accounts: NJAccount[], todayIso: string): CoverageRow[] {
  const today = new Date(`${todayIso}T12:00:00Z`);
  return accounts
    .map<CoverageRow>((a) => {
      if (!a.lastVisitDate) {
        return {...a, daysSince: null, bucket: 'never'};
      }
      const d = new Date(`${a.lastVisitDate}T12:00:00Z`);
      const diff = Math.max(
        0,
        Math.round((today.getTime() - d.getTime()) / 86400000),
      );
      const bucket: CoverageRow['bucket'] =
        diff < 30 ? 'fresh' : diff < 60 ? 'aging' : 'cold';
      return {...a, daysSince: diff, bucket};
    })
    .sort((a, b) => {
      // "never" first, then by days-since desc (oldest first).
      const av = a.daysSince === null ? 99999 : a.daysSince;
      const bv = b.daysSince === null ? 99999 : b.daysSince;
      return bv - av;
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE SCOREBOARD FETCH — rep_scoreboard_30d view
// ─────────────────────────────────────────────────────────────────────────────
type ScoreboardRep = {
  rep_name: string;
  reports: number;
  total_intercepts: number;
  total_closes: number;
  avg_close_rate: number;
  avg_aggression: number;
  avg_grade_score: number | null;
  mode_grade_letter: string | null;
  last_shift_date: string | null;
};

async function fetchScoreboard(
  supabaseUrl: string,
  serviceKey: string,
): Promise<ScoreboardRep[]> {
  const url = `${supabaseUrl}/rest/v1/rep_scoreboard_30d?order=avg_grade_score.desc.nullslast`;
  const res = await fetch(url, {
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase scoreboard failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return (await res.json()) as ScoreboardRep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// DATE UTILS (NJ-aware — matches /api/popups-book DST offset rules)
// ─────────────────────────────────────────────────────────────────────────────
function dateKeyNJ(d: Date): string {
  // Format the current moment as a NJ-local yyyy-mm-dd.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const dd = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${dd}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function njOffset(isoDate: string): '-04:00' | '-05:00' {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchFirstSunday = 1 + ((7 - marchFirst.getUTCDay()) % 7);
  const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 7, 7, 0, 0));
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novFirstSunday = 1 + ((7 - novFirst.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0));
  return d >= dstStart && d < dstEnd ? '-04:00' : '-05:00';
}

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  goldDark: '#D4C700',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  surface: '#0B0B0B',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.22)',
  chip: 'rgba(255,255,255,0.06)',
} as const;

const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CARD SHELL
// ─────────────────────────────────────────────────────────────────────────────
function Card({
  kicker,
  title,
  accent = BRAND.gold,
  children,
  action,
}: {
  kicker: string;
  title: string;
  accent?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section
      style={{
        border: `1px solid ${BRAND.line}`,
        background: BRAND.surface,
        marginBottom: 20,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          padding: '18px 20px 14px',
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: accent,
              marginBottom: 4,
            }}
          >
            {kicker}
          </div>
          <h2
            style={{
              fontFamily: TEKO,
              fontSize: 26,
              lineHeight: 1.1,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              margin: 0,
              color: BRAND.white,
            }}
          >
            {title}
          </h2>
        </div>
        {action && <div style={{flexShrink: 0}}>{action}</div>}
      </header>
      <div style={{padding: '18px 20px 20px'}}>{children}</div>
    </section>
  );
}

function EmptyState({message}: {message: string}) {
  return (
    <div
      style={{
        padding: '24px 20px',
        textAlign: 'center',
        fontFamily: BODY,
        fontSize: 13,
        color: BRAND.gray,
        background: BRAND.chip,
        border: `1px dashed ${BRAND.lineStrong}`,
        letterSpacing: '0.03em',
      }}
    >
      {message}
    </div>
  );
}

function ErrorState({message}: {message: string}) {
  return (
    <div
      style={{
        padding: '14px 16px',
        fontFamily: BODY,
        fontSize: 12,
        color: BRAND.red,
        background: 'rgba(255,59,48,0.08)',
        border: `1px solid ${BRAND.red}`,
        letterSpacing: '0.03em',
      }}
    >
      {message}
    </div>
  );
}

function Stat({label, value, caption}: {label: string; value: string; caption?: string}) {
  return (
    <div
      style={{
        padding: '18px 16px',
        borderRight: `1px solid ${BRAND.line}`,
        borderBottom: `1px solid ${BRAND.line}`,
      }}
    >
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 12,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: BRAND.gray,
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 40,
          lineHeight: 1,
          letterSpacing: '0.01em',
          color: BRAND.white,
        }}
      >
        {value}
      </div>
      {caption && (
        <div
          style={{
            fontFamily: BODY,
            fontSize: 12,
            color: BRAND.gray,
            marginTop: 6,
          }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function OpsDashboard() {
  const {nowIso, today, week, upcoming, coverage, scoreboard, hasZoho, hasSupabase} =
    useLoaderData<typeof loader>();

  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  useEffect(() => {
    if (document.getElementById('hs-ops-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hs-ops-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  const todayLabel = useMemo(() => {
    const d = new Date(nowIso);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  }, [nowIso]);

  // Week events grouped by date for the strip.
  const weekGroups = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const ev of week.events) {
      const arr = map.get(ev.date) || [];
      arr.push(ev);
      map.set(ev.date, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [week.events]);

  // Scoreboard aggregate (top-line stats) derived from rep rows.
  const agg = useMemo(() => aggregateScoreboard(scoreboard.reps), [scoreboard.reps]);
  const todayIso = nowIso.slice(0, 10);

  // Spark Team officially launches Fri May 15, 2026. Countdown banner stays
  // visible until then, then disappears automatically. Mirrors LAUNCH_DATE
  // in /njpopups so staff sees the same date everywhere.
  const LAUNCH_DATE = '2026-05-15';
  const daysUntilLaunch = (() => {
    if (todayIso >= LAUNCH_DATE) return 0;
    const [y1, m1, d1] = todayIso.split('-').map((n) => parseInt(n, 10));
    const [y2, m2, d2] = LAUNCH_DATE.split('-').map((n) => parseInt(n, 10));
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
  })();
  const showLaunchBanner = daysUntilLaunch > 0;

  // Upcoming events grouped by ISO week (Thu/Fri/Sat anchored, mirroring
  // /njpopups picker structure). Key = first Thu of that week.
  const upcomingWeekGroups = useMemo(() => {
    const map = new Map<string, EventSummary[]>();
    for (const ev of upcoming.events) {
      // Find Thursday of the event's week (or the event date itself if Thu)
      const [y, m, d] = ev.date.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dow = dt.getUTCDay(); // 0=Sun..4=Thu..6=Sat
      const thuOffset = (dow + 7 - 4) % 7; // days back to Thursday
      const thu = new Date(dt.getTime() - thuOffset * 24 * 60 * 60 * 1000);
      const key = thu.toISOString().slice(0, 10);
      const arr = map.get(key) || [];
      arr.push(ev);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
  }, [upcoming.events]);

  return (
    <div
      style={{
        background: BRAND.black,
        color: BRAND.white,
        minHeight: '100vh',
        fontFamily: BODY,
        paddingBottom: 96,
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
          position: 'sticky',
          top: 0,
          zIndex: 20,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 12}}>
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 30, width: 'auto', display: 'block'}}
          />
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 14,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: BRAND.gold,
            }}
          >
            Spark Team Ops
          </div>
        </div>
        <Link
          to="/shift-report"
          style={{
            background: BRAND.gold,
            color: BRAND.black,
            fontFamily: TEKO,
            fontSize: 14,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '8px 14px',
            textDecoration: 'none',
            border: `1px solid ${BRAND.gold}`,
          }}
        >
          End of Shift →
        </Link>
      </div>

      <main style={{maxWidth: 760, margin: '0 auto', padding: '20px 16px'}}>
        {showLaunchBanner && (
          <section
            style={{
              border: `1px solid ${BRAND.gold}`,
              background: `linear-gradient(135deg, ${BRAND.black} 0%, #1a1408 100%)`,
              padding: '20px 22px',
              marginBottom: 20,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: BRAND.gold,
                marginBottom: 6,
              }}
            >
              Pre-Launch · Spark Team
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 14,
                flexWrap: 'wrap',
              }}
            >
              <h2
                style={{
                  fontFamily: TEKO,
                  fontSize: 30,
                  lineHeight: 1.05,
                  textTransform: 'uppercase',
                  letterSpacing: '0.02em',
                  margin: 0,
                  color: BRAND.white,
                }}
              >
                Launches Fri May 15
              </h2>
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 22,
                  color: BRAND.gold,
                  letterSpacing: '0.04em',
                }}
              >
                {daysUntilLaunch} {daysUntilLaunch === 1 ? 'day' : 'days'} out
              </div>
            </div>
            <p
              style={{
                margin: '10px 0 14px 0',
                fontSize: 13,
                lineHeight: 1.5,
                color: BRAND.gray,
              }}
            >
              Spark Team officially kicks off Fri May 15, 2026. Bookings made
              now go live on/after the launch date — they'll start showing in
              "This Week at a Glance" 14 days out.
            </p>
            <Link
              to="/njpopups"
              style={{
                display: 'inline-block',
                background: BRAND.gold,
                color: BRAND.black,
                fontFamily: TEKO,
                fontSize: 13,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                padding: '8px 14px',
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
              }}
            >
              Book Pop-Ups →
            </Link>
          </section>
        )}
        {!hasZoho && (
          <ErrorState message="Zoho env vars missing — Today / This Week / Coverage cards can't hydrate until ZOHO_* vars land in Oxygen." />
        )}

        {/* ── Today's Game Plan ───────────────────────────────────────── */}
        <Card
          kicker={todayLabel}
          title="Today's Game Plan"
          accent={BRAND.gold}
          action={
            <Link
              to="/njpopups"
              style={{
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND.gold,
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
                padding: '6px 10px',
              }}
            >
              Book
            </Link>
          }
        >
          {!today.ok ? (
            <ErrorState message="Couldn't reach Zoho. Try a refresh — bookings are still safe." />
          ) : today.events.length === 0 ? (
            <EmptyState message="No confirmed shifts today. Time to book some pop-ups." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
              {today.events.map((ev) => (
                <EventRow key={ev.id} ev={ev} todayIso={todayIso} showReportLink />
              ))}
            </div>
          )}
        </Card>

        {/* ── This Week at a Glance ──────────────────────────────────── */}
        <Card
          kicker="Next 14 Days"
          title="This Week at a Glance"
          accent={BRAND.white}
        >
          {!week.ok ? (
            <ErrorState message="Couldn't reach Zoho Events." />
          ) : weekGroups.length === 0 ? (
            <EmptyState message="Nothing booked in the next 14 days. Pipeline empty — add visits in /njpopups." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>
              {weekGroups.map(([date, events]) => (
                <div key={date}>
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 14,
                      letterSpacing: '0.14em',
                      textTransform: 'uppercase',
                      color: BRAND.gray,
                      marginBottom: 6,
                    }}
                  >
                    {formatDateHeader(date)}
                  </div>
                  <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                    {events.map((ev) => (
                      <EventRow key={ev.id} ev={ev} todayIso={todayIso} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* ── Upcoming Pop-Ups (15+ days out) ────────────────────────── */}
        <Card
          kicker="2 Weeks Out & Beyond"
          title="Upcoming Pop-Ups"
          accent={BRAND.gold}
          action={
            <Link
              to="/njpopups"
              style={{
                color: BRAND.gold,
                fontFamily: TEKO,
                fontSize: 13,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
                padding: '6px 10px',
              }}
            >
              Add Booking →
            </Link>
          }
        >
          {!upcoming.ok ? (
            <ErrorState message="Couldn't reach Zoho Events." />
          ) : upcomingWeekGroups.length === 0 ? (
            <EmptyState message="No bookings scheduled past the next 14 days yet. Plan ahead in /njpopups — picker shows 9 weeks out." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
              {upcomingWeekGroups.map(([weekStart, events]) => {
                const [yy, mm, dd] = weekStart.split('-').map((n) => parseInt(n, 10));
                const thu = new Date(Date.UTC(yy, mm - 1, dd));
                const sun = new Date(thu.getTime() + 3 * 24 * 60 * 60 * 1000);
                const fmt = (d: Date) =>
                  d.toLocaleDateString('en-US', {month: 'short', day: 'numeric', timeZone: 'UTC'});
                const weekLabel = `${fmt(thu)} – ${fmt(sun)}`;
                return (
                  <div key={weekStart}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: 10,
                        marginBottom: 8,
                        paddingBottom: 4,
                        borderBottom: `1px dashed ${BRAND.line}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 15,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: BRAND.white,
                        }}
                      >
                        Week of {weekLabel}
                      </div>
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 12,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: BRAND.gold,
                        }}
                      >
                        {events.length} {events.length === 1 ? 'shift' : 'shifts'}
                      </div>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                      {events.map((ev) => (
                        <EventRow key={ev.id} ev={ev} todayIso={todayIso} />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Coverage Pulse ─────────────────────────────────────────── */}
        <Card
          kicker="NJ Accounts"
          title="Coverage Pulse"
          accent={BRAND.orange}
          action={
            <div
              style={{
                display: 'flex',
                gap: 8,
                fontFamily: TEKO,
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: BRAND.gray,
              }}
            >
              <span>
                <span style={{color: BRAND.green}}>●</span> &lt;30d
              </span>
              <span>
                <span style={{color: BRAND.gold}}>●</span> 30–60
              </span>
              <span>
                <span style={{color: BRAND.red}}>●</span> 60+ / Never
              </span>
            </div>
          }
        >
          {!coverage.ok ? (
            <ErrorState message="Couldn't reach Zoho Accounts." />
          ) : coverage.accounts.length === 0 ? (
            <EmptyState message="No NJ accounts in CRM yet." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column'}}>
              {coverage.accounts.slice(0, 24).map((row, i) => (
                <CoverageItem key={row.id} row={row} last={i === coverage.accounts.length - 1} />
              ))}
              {coverage.accounts.length > 24 && (
                <div
                  style={{
                    padding: '12px 0 2px',
                    fontSize: 11,
                    color: BRAND.gray,
                    textAlign: 'center',
                    letterSpacing: '0.06em',
                  }}
                >
                  Showing 24 of {coverage.accounts.length} — expand later
                </div>
              )}
            </div>
          )}
        </Card>

        {/* ── Scoreboard ─────────────────────────────────────────────── */}
        <Card
          kicker="Last 30 Days"
          title="Scoreboard"
          accent={BRAND.gold}
          action={
            <Link
              to="/grading-rubric"
              style={{
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: BRAND.gold,
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
                padding: '6px 10px',
              }}
            >
              Rubric
            </Link>
          }
        >
          {!hasSupabase ? (
            <ErrorState message="Supabase not configured yet — run the setup in supabase/SETUP.md to light this up." />
          ) : !scoreboard.ok ? (
            <ErrorState message="Couldn't reach Supabase. Check service key + URL in Oxygen env." />
          ) : scoreboard.reps.length === 0 ? (
            <EmptyState message="No shift reports filed yet. First one unlocks the scoreboard." />
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  borderTop: `1px solid ${BRAND.line}`,
                  borderLeft: `1px solid ${BRAND.line}`,
                  marginBottom: 16,
                }}
              >
                <Stat
                  label="Reports"
                  value={String(agg.totalReports)}
                  caption="Across all reps"
                />
                <Stat
                  label="Closes"
                  value={String(agg.totalCloses)}
                  caption={`${agg.totalIntercepts} intercepts`}
                />
                <Stat
                  label="Avg Close"
                  value={`${Math.round(agg.avgCloseRate * 100)}%`}
                  caption="Weighted"
                />
                <Stat
                  label="Top Rep"
                  value={agg.topRep?.initials || '—'}
                  caption={
                    agg.topRep
                      ? `${agg.topRep.mode_grade_letter || '—'} · ${
                          agg.topRep.rep_name
                        }`
                      : 'Tied'
                  }
                />
              </div>
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                {scoreboard.reps.map((r) => (
                  <ScoreboardRow key={r.rep_name} rep={r} />
                ))}
              </div>
            </>
          )}
        </Card>

        <div
          style={{
            padding: '18px 4px 8px',
            fontFamily: BODY,
            fontSize: 12,
            color: BRAND.gray,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          Staff tool · Highsman Spark Team · Pop-ups, reports, intel
        </div>
      </main>

      {/* Sticky mobile action bar */}
      <nav
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          background: BRAND.black,
          borderTop: `1px solid ${BRAND.lineStrong}`,
          padding: '10px 12px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr 1fr 1fr',
          gap: 6,
          zIndex: 30,
        }}
      >
        <Link
          to="/njpopups"
          style={{
            background: BRAND.gold,
            color: BRAND.black,
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '12px 4px',
            textAlign: 'center',
            textDecoration: 'none',
            border: `1px solid ${BRAND.gold}`,
          }}
        >
          Book Visit
        </Link>
        <Link
          to="/shift-report"
          style={{
            background: 'transparent',
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '12px 4px',
            textAlign: 'center',
            textDecoration: 'none',
            border: `1px solid ${BRAND.gold}`,
          }}
        >
          Shift Report
        </Link>
        <Link
          to="/vibes"
          style={{
            background: 'transparent',
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '12px 4px',
            textAlign: 'center',
            textDecoration: 'none',
            border: `1px solid ${BRAND.gold}`,
          }}
        >
          Vibes
        </Link>
        <Link
          to="/njmenu"
          style={{
            background: 'transparent',
            color: BRAND.white,
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            padding: '12px 4px',
            textAlign: 'center',
            textDecoration: 'none',
            border: `1px solid ${BRAND.lineStrong}`,
          }}
        >
          Menu
        </Link>
      </nav>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────
function EventRow({
  ev,
  todayIso,
  showReportLink,
}: {
  ev: EventSummary;
  todayIso: string;
  showReportLink?: boolean;
}) {
  const territoryColor =
    ev.territory === 'NJ-N' ? BRAND.gold : BRAND.orange;
  const params = new URLSearchParams();
  if (ev.accountId) params.set('accountId', ev.accountId);
  if (ev.accountName) params.set('accountName', ev.accountName);
  if (ev.accountCity) params.set('accountCity', ev.accountCity);
  params.set('date', ev.date);
  const reportHref = `/shift-report?${params.toString()}`;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 18,
          color: BRAND.white,
          letterSpacing: '0.04em',
          width: 70,
          flexShrink: 0,
        }}
      >
        {ev.time || '—'}
      </div>
      <div style={{flex: 1, minWidth: 0}}>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 18,
            color: BRAND.white,
            letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {ev.accountName || 'Unnamed'}
        </div>
        <div
          style={{
            fontSize: 11,
            color: BRAND.gray,
            letterSpacing: '0.1em',
            marginTop: 2,
          }}
        >
          <span style={{color: territoryColor}}>{ev.territory}</span>
          {ev.isOverride && (
            <span style={{color: BRAND.red, marginLeft: 8}}>• OVR</span>
          )}
        </div>
      </div>
      {showReportLink && ev.date === todayIso && (
        <Link
          to={reportHref}
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: BRAND.black,
            background: BRAND.gold,
            padding: '6px 10px',
            textDecoration: 'none',
            borderRadius: 6,
            flexShrink: 0,
          }}
        >
          Report →
        </Link>
      )}
    </div>
  );
}

function CoverageItem({row, last}: {row: CoverageRow; last: boolean}) {
  const dotColor =
    row.bucket === 'fresh'
      ? BRAND.green
      : row.bucket === 'aging'
        ? BRAND.gold
        : BRAND.red;
  const right =
    row.bucket === 'never'
      ? 'Never'
      : row.daysSince === 0
        ? 'Today'
        : `${row.daysSince}d`;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 0',
        borderBottom: last ? 'none' : `1px solid ${BRAND.line}`,
      }}
    >
      <span
        style={{
          color: dotColor,
          fontSize: 14,
          lineHeight: 1,
        }}
      >
        ●
      </span>
      <div style={{flex: 1, minWidth: 0}}>
        <div
          style={{
            fontFamily: BODY,
            fontSize: 14,
            color: BRAND.white,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {row.name}
        </div>
        {row.city && (
          <div style={{fontSize: 11, color: BRAND.gray, marginTop: 1}}>
            {row.city}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 16,
          color: dotColor,
          letterSpacing: '0.06em',
        }}
      >
        {right}
      </div>
    </div>
  );
}

function ScoreboardRow({rep}: {rep: ScoreboardRep}) {
  const cr = Math.round((rep.avg_close_rate || 0) * 100);
  const crColor = cr >= 35 ? BRAND.green : cr >= 20 ? BRAND.gold : BRAND.red;
  const gradeColor =
    rep.mode_grade_letter === 'A' || rep.mode_grade_letter === 'B'
      ? BRAND.green
      : rep.mode_grade_letter === 'C'
        ? BRAND.gold
        : BRAND.red;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 12px',
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 8,
      }}
    >
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 22,
          color: BRAND.white,
          letterSpacing: '0.04em',
          flex: 1,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {rep.rep_name}
      </div>
      <div style={{textAlign: 'right'}}>
        <div
          style={{
            fontSize: 10,
            color: BRAND.gray,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Close
        </div>
        <div style={{fontFamily: TEKO, fontSize: 18, color: crColor}}>
          {cr}%
        </div>
      </div>
      <div style={{textAlign: 'right', minWidth: 60}}>
        <div
          style={{
            fontSize: 10,
            color: BRAND.gray,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Grade
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 22,
            color: gradeColor,
            letterSpacing: '0.04em',
          }}
        >
          {rep.mode_grade_letter || '—'}
        </div>
      </div>
      <div style={{textAlign: 'right', minWidth: 60}}>
        <div
          style={{
            fontSize: 10,
            color: BRAND.gray,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
          }}
        >
          Shifts
        </div>
        <div style={{fontFamily: TEKO, fontSize: 18, color: BRAND.white}}>
          {rep.reports}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AGGREGATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function aggregateScoreboard(reps: ScoreboardRep[]) {
  const totalReports = reps.reduce((s, r) => s + r.reports, 0);
  const totalIntercepts = reps.reduce((s, r) => s + r.total_intercepts, 0);
  const totalCloses = reps.reduce((s, r) => s + r.total_closes, 0);
  const avgCloseRate =
    totalIntercepts > 0 ? totalCloses / totalIntercepts : 0;
  // Top rep by avg_grade_score (already sorted desc by the view).
  const topRep = reps.length
    ? {...reps[0], initials: initialsOf(reps[0].rep_name)}
    : null;
  return {totalReports, totalIntercepts, totalCloses, avgCloseRate, topRep};
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '')
    .join('');
}

function formatDateHeader(isoDate: string): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
