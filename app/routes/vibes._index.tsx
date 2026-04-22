import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes — Highsman Vibes Team Dashboard (Brand Rep portal)
// ─────────────────────────────────────────────────────────────────────────────
// Mobile-first, dark, Klaviyo-suppressed. Reps see their:
//   • Today's Route — Tier 1 Onboarding / Tier 2 Training / Tier 3 Check-In
//   • Week View — next 2–3 weeks of scheduled work-days
//   • Quick tiles — Today's Route (/vibes/today), Decks, Store Search, Start Check-In, File Receipt
//   • Mini scoreboards — MTD goodie spend, store visits, trainings logged
//
// Data source: /api/vibes-route (Zoho + Supabase merged, cached 2 min).
// The internal `fresh / targets / rotation` keys are legacy — they now map
// to the new tier model: fresh → Onboarding, targets → Training, rotation
// → Check-In. Full-featured version of this page with map + AI briefs +
// voice-note capture lives at /vibes/today.
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

type RouteStop = {
  tier: 'FRESH' | 'TARGET' | 'ROTATION';
  accountId: string;
  name: string;
  street: string | null;
  city: string | null;
  state: string | null;
  phone: string | null;
  lastVibesVisit: string | null;
  daysSinceLast: number | null;
  daysSinceClosed?: number | null;
  leadId?: string | null;
};

type VibesRep = {
  id: string;
  full_name: string;
  email: string;
  home_zip: string;
  territory_label: string | null;
  schedule_days: number[];
  start_date: string;
  onboarding_through_date: string | null;
  daily_goodie_budget: number;
  ig_handle: string | null;
};

type GoodieBudget = {
  rep_id: string;
  rep_name: string;
  daily_goodie_budget: number;
  mtd_spent: number;
  today_spent: number;
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  const url = new URL(request.url);
  const repIdParam = url.searchParams.get('repId');

  const hasSupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);

  let rep: VibesRep | null = null;
  let reps: VibesRep[] = [];
  let goodie: GoodieBudget | null = null;
  let mtdVisits = 0;
  let mtdTrainings = 0;
  let route: {fresh: RouteStop[]; targets: RouteStop[]; rotation: RouteStop[]} = {
    fresh: [],
    targets: [],
    rotation: [],
  };

  if (hasSupabase) {
    try {
      // Active reps
      const repsRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/vibes_reps?active=eq.true&select=id,full_name,email,home_zip,territory_label,schedule_days,start_date,onboarding_through_date,daily_goodie_budget,ig_handle&order=start_date.asc`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY!,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
          },
        },
      );
      if (repsRes.ok) reps = await repsRes.json();
      rep =
        reps.find((r) => r.id === repIdParam) ||
        reps[0] ||
        null;

      if (rep) {
        // MTD goodie spend
        const gRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/rep_goodie_month_to_date?rep_id=eq.${rep.id}&select=*`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
            },
          },
        );
        if (gRes.ok) {
          const rows = await gRes.json();
          goodie = rows?.[0] || null;
        }

        // MTD visits
        const today = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1)
          .toISOString()
          .slice(0, 10);
        const vRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/brand_visits?rep_id=eq.${rep.id}&visit_date=gte.${firstOfMonth}&select=id`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
              prefer: 'count=exact',
            },
          },
        );
        if (vRes.ok) {
          const rows = await vRes.json();
          mtdVisits = Array.isArray(rows) ? rows.length : 0;
        }

        // MTD live trainings
        const tRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/budtender_training?trained_by_rep_id=eq.${rep.id}&method=eq.live&completed_at=gte.${firstOfMonth}&select=id`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY!,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
            },
          },
        );
        if (tRes.ok) {
          const rows = await tRes.json();
          mtdTrainings = Array.isArray(rows) ? rows.length : 0;
        }

        // Route — call our own /api/vibes-route endpoint
        try {
          const origin = new URL(request.url).origin;
          const rRes = await fetch(
            `${origin}/api/vibes-route?repId=${rep.id}`,
          );
          if (rRes.ok) {
            const rj = await rRes.json();
            if (rj.ok) {
              route = {
                fresh: rj.fresh || [],
                targets: rj.targets || [],
                rotation: rj.rotation || [],
              };
            }
          }
        } catch (err) {
          console.warn('[vibes] /api/vibes-route call failed', err);
        }
      }
    } catch (err) {
      console.warn('[vibes] Supabase bootstrap failed', err);
    }
  }

  return json({
    rep,
    reps,
    goodie,
    mtdVisits,
    mtdTrainings,
    route,
    hasSupabase,
  });
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Vibes Team · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'Highsman Vibes Team portal — daily route, store profiles, trainings, and goodie budget.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND
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
  purple: '#B884FF',
  surface: '#0B0B0B',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.22)',
  chip: 'rgba(255,255,255,0.06)',
} as const;

const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

const DAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function VibesDashboard() {
  const data = useLoaderData<typeof loader>();
  const {rep, reps, goodie, mtdVisits, mtdTrainings, route, hasSupabase} = data;

  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l1 = document.createElement('link');
    l1.id = 'vibes-font-link';
    l1.rel = 'stylesheet';
    l1.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l1);
  }, []);

  // Suppress Klaviyo popup per brand rules
  useEffect(() => {
    const id = 'vibes-klaviyo-suppress';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.innerHTML = `
      .klaviyo-form, [class*="needsclick"], [class*="kl-private"], div[class^="kl_"],
      iframe[id^="klaviyo"], div[id^="klaviyo"] { display:none !important; }
    `;
    document.head.appendChild(s);
  }, []);

  const [selectedDayIdx, setSelectedDayIdx] = useState(0); // 0 = today
  const weekDays = useMemo(() => buildWeek(rep), [rep]);
  const stops = useMemo(() => buildSequence(route), [route]);

  if (!rep) {
    return (
      <Shell>
        <EmptyRep reps={reps} hasSupabase={hasSupabase} />
      </Shell>
    );
  }

  const goodieBudgetPct = goodie
    ? Math.min(
        100,
        Math.round(
          ((goodie.mtd_spent || 0) / (monthlyBudget(rep) || 1)) * 100,
        ),
      )
    : 0;

  return (
    <Shell>
      {/* Top strip — rep identity + stats */}
      <div
        style={{
          padding: '20px 16px 8px',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            gap: 12,
          }}
        >
          <div>
            <div
              style={{
                color: BRAND.gold,
                fontSize: 22,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                fontFamily: TEKO,
                fontWeight: 600,
                lineHeight: 1,
              }}
            >
              Vibes Team · Rep
            </div>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 44,
                lineHeight: 1,
                color: BRAND.white,
                letterSpacing: '0.02em',
                textTransform: 'uppercase',
                marginTop: 6,
              }}
            >
              {rep.full_name}
            </div>
            <div
              style={{
                color: BRAND.gray,
                fontSize: 13,
                marginTop: 6,
                fontFamily: BODY,
              }}
            >
              {rep.territory_label || 'NJ'} · Home base {rep.home_zip}
              {rep.ig_handle ? (
                <span style={{marginLeft: 8, color: BRAND.gold}}>
                  @{rep.ig_handle}
                </span>
              ) : null}
            </div>
          </div>
          {reps.length > 1 ? (
            <select
              value={rep.id}
              onChange={(e) => {
                const url = new URL(window.location.href);
                url.searchParams.set('repId', e.target.value);
                window.location.href = url.toString();
              }}
              style={{
                background: BRAND.chip,
                color: BRAND.white,
                border: `1px solid ${BRAND.line}`,
                padding: '6px 10px',
                fontFamily: BODY,
                fontSize: 12,
                borderRadius: 6,
              }}
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {/* Stat pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 8,
            marginTop: 14,
          }}
        >
          <StatPill
            label="MTD Visits"
            value={String(mtdVisits)}
            sub="stops logged"
            accent={BRAND.gold}
          />
          <StatPill
            label="Live Trainings"
            value={String(mtdTrainings)}
            sub="budtenders"
            accent={BRAND.green}
          />
          <StatPill
            label="Goodie $"
            value={`$${Math.round(goodie?.mtd_spent || 0)}`}
            sub={`of $${Math.round(monthlyBudget(rep))}`}
            accent={goodieBudgetPct > 85 ? BRAND.red : BRAND.orange}
          />
        </div>
        {/* Goodie budget bar */}
        <div
          style={{
            marginTop: 10,
            height: 4,
            background: BRAND.chip,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${goodieBudgetPct}%`,
              height: '100%',
              background:
                goodieBudgetPct > 85
                  ? BRAND.red
                  : goodieBudgetPct > 60
                    ? BRAND.orange
                    : BRAND.gold,
              transition: 'width .3s ease',
            }}
          />
        </div>
      </div>

      {/* Quick actions */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          padding: '12px 16px 0',
        }}
      >
        <QuickTile
          href="/vibes/visit/new"
          label="Start Check-In"
          sub="GPS-gated"
          primary
        />
        <QuickTile
          href="/vibes/receipts"
          label="File Receipt"
          sub="→ Bill.com"
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 8,
          padding: '8px 16px 4px',
        }}
      >
        <QuickTile
          href="/vibes/today"
          label="Today's Route"
          sub="Full map + briefs"
        />
        <QuickTile
          href="/vibes/decks"
          label="Decks"
          sub="Train budtenders"
        />
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(1, 1fr)',
          gap: 8,
          padding: '4px 16px 12px',
        }}
      >
        <QuickTile
          href="/vibes/store"
          label="Store Search"
          sub="Pull profile"
        />
      </div>

      {/* Week view */}
      <Section title="This Week" index="Schedule">
        <WeekStrip
          days={weekDays}
          selectedIdx={selectedDayIdx}
          onSelect={setSelectedDayIdx}
        />
      </Section>

      {/* Today's route — Tier 1 Onboarding / Tier 2 Training / Tier 3 Check-In.
          Labels use the new 3-tier model. Data still comes from /api/vibes-route
          which maps: fresh → Tier 1 (Needs Onboarding deals), targets → Tier 2
          (Training deals), rotation → Tier 3 (30-day cadence check-ins). For the
          full route with map + per-stop briefs + voice-note capture, reps tap
          the "Today's Route" QuickTile above which opens /vibes/today. */}
      <Section title="Today's Route" index="Route">
        {stops.total === 0 ? (
          <EmptyState
            title="No route built yet"
            sub="Onboarding, Training, and Check-In stops will appear once Sky books them or the 30-day cadence fires."
          />
        ) : (
          <>
            <TierBlock
              tier="FRESH"
              label="Tier 1 — Onboarding (60 min)"
              color={BRAND.gold}
              stops={route.fresh}
            />
            <TierBlock
              tier="TARGET"
              label="Tier 2 — Budtender Training (60 min)"
              color={BRAND.purple}
              stops={route.targets}
            />
            <TierBlock
              tier="ROTATION"
              label="Tier 3 — Check-In (30 min)"
              color={BRAND.green}
              stops={route.rotation}
            />
          </>
        )}
      </Section>

      {/* Footer link back to /ops */}
      <div
        style={{
          padding: '24px 16px 40px',
          textAlign: 'center',
          color: BRAND.gray,
          fontSize: 12,
          fontFamily: BODY,
        }}
      >
        <Link to="/ops" style={{color: BRAND.gold, textDecoration: 'none'}}>
          ← Spark Team Ops
        </Link>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + primitives
// ─────────────────────────────────────────────────────────────────────────────
function Shell({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/ops"
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 18,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          ← OPS
        </Link>
        <img
          src={LOGO_WHITE}
          alt="Highsman"
          style={{height: 40, width: 'auto'}}
        />
        <div style={{width: 40}} />
      </header>
      {children}
    </div>
  );
}

function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{padding: '18px 16px 0'}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 30,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: BRAND.white,
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            letterSpacing: '0.2em',
            color: BRAND.gray,
          }}
        >
          {index}
        </div>
      </div>
      {children}
    </section>
  );
}

function StatPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        padding: '10px 12px',
        borderRadius: 8,
      }}
    >
      <div
        style={{
          color: BRAND.gray,
          fontSize: 10,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontFamily: TEKO,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 28,
          lineHeight: 1,
          color: accent,
          marginTop: 2,
        }}
      >
        {value}
      </div>
      {sub ? (
        <div
          style={{
            color: BRAND.gray,
            fontSize: 10,
            fontFamily: BODY,
            marginTop: 2,
          }}
        >
          {sub}
        </div>
      ) : null}
    </div>
  );
}

function QuickTile({
  href,
  label,
  sub,
  primary,
}: {
  href: string;
  label: string;
  sub?: string;
  primary?: boolean;
}) {
  return (
    <Link
      to={href}
      style={{
        display: 'block',
        padding: '14px 12px',
        background: primary ? BRAND.gold : BRAND.chip,
        color: primary ? BRAND.black : BRAND.white,
        border: `1px solid ${primary ? BRAND.gold : BRAND.line}`,
        borderRadius: 8,
        textDecoration: 'none',
        textAlign: 'left',
      }}
    >
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 22,
          lineHeight: 1,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
        }}
      >
        {label}
      </div>
      {sub ? (
        <div
          style={{
            fontFamily: BODY,
            fontSize: 11,
            marginTop: 4,
            opacity: primary ? 0.75 : 0.6,
          }}
        >
          {sub}
        </div>
      ) : null}
    </Link>
  );
}

function EmptyState({title, sub}: {title: string; sub: string}) {
  return (
    <div
      style={{
        padding: '20px 14px',
        border: `1px dashed ${BRAND.lineStrong}`,
        borderRadius: 8,
        textAlign: 'center',
        color: BRAND.gray,
      }}
    >
      <div style={{fontFamily: TEKO, fontSize: 22, color: BRAND.white}}>
        {title}
      </div>
      <div style={{fontSize: 12, marginTop: 6, fontFamily: BODY}}>{sub}</div>
    </div>
  );
}

function EmptyRep({
  reps,
  hasSupabase,
}: {
  reps: VibesRep[];
  hasSupabase: boolean;
}) {
  return (
    <div style={{padding: '40px 20px'}}>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 42,
          color: BRAND.gold,
          lineHeight: 1,
        }}
      >
        VIBES TEAM
      </div>
      <div style={{color: BRAND.white, fontSize: 16, marginTop: 12}}>
        No reps configured yet.
      </div>
      <div style={{color: BRAND.gray, fontSize: 13, marginTop: 6}}>
        {hasSupabase
          ? 'Run the vibes_schema.sql migration in Supabase to seed Serena as Rep #1.'
          : 'SUPABASE_URL / SERVICE key not set in Oxygen — wire those before loading this page.'}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Week strip
// ─────────────────────────────────────────────────────────────────────────────
type WeekDay = {
  dateIso: string;
  label: string;
  day: number;
  isWorkDay: boolean;
  isToday: boolean;
  isOnboardingWeek: boolean;
};

function buildWeek(rep: VibesRep | null): WeekDay[] {
  if (!rep) return [];
  const today = new Date();
  const days: WeekDay[] = [];
  const todayIso = today.toISOString().slice(0, 10);
  const scheduleDays = new Set(rep.schedule_days || [2, 3, 4]);
  const startDate = new Date(rep.start_date + 'T00:00:00');
  const onboardEnd = rep.onboarding_through_date
    ? new Date(rep.onboarding_through_date + 'T00:00:00')
    : null;

  for (let i = 0; i < 14; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const dow = d.getDay();
    const beforeStart = d < startDate;
    const inOnboarding =
      !beforeStart && onboardEnd ? d <= onboardEnd : false;
    // During onboarding, every weekday is a work day (1-5); otherwise use scheduleDays
    const isWorkDay = beforeStart
      ? false
      : inOnboarding
        ? dow >= 1 && dow <= 5
        : scheduleDays.has(dow);

    days.push({
      dateIso: iso,
      label: DAY_LABELS[dow],
      day: d.getDate(),
      isWorkDay,
      isToday: iso === todayIso,
      isOnboardingWeek: inOnboarding,
    });
  }
  return days;
}

function WeekStrip({
  days,
  selectedIdx,
  onSelect,
}: {
  days: WeekDay[];
  selectedIdx: number;
  onSelect: (i: number) => void;
}) {
  if (!days.length) return null;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${days.length}, minmax(44px, 1fr))`,
        gap: 4,
        overflowX: 'auto',
      }}
    >
      {days.map((d, i) => {
        const selected = i === selectedIdx;
        const work = d.isWorkDay;
        return (
          <button
            key={d.dateIso}
            type="button"
            onClick={() => onSelect(i)}
            style={{
              background: selected ? BRAND.gold : work ? BRAND.chip : 'transparent',
              color: selected ? BRAND.black : work ? BRAND.white : BRAND.gray,
              border: `1px solid ${
                d.isToday ? BRAND.gold : work ? BRAND.line : 'transparent'
              }`,
              padding: '8px 2px',
              borderRadius: 6,
              fontFamily: TEKO,
              cursor: 'pointer',
              position: 'relative',
            }}
          >
            <div style={{fontSize: 10, letterSpacing: '0.1em'}}>{d.label}</div>
            <div style={{fontSize: 20, lineHeight: 1}}>{d.day}</div>
            {d.isOnboardingWeek ? (
              <div
                style={{
                  position: 'absolute',
                  top: 2,
                  right: 4,
                  width: 4,
                  height: 4,
                  borderRadius: 4,
                  background: BRAND.green,
                }}
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tier block
// ─────────────────────────────────────────────────────────────────────────────
function TierBlock({
  tier,
  label,
  color,
  stops,
}: {
  tier: 'FRESH' | 'TARGET' | 'ROTATION';
  label: string;
  color: string;
  stops: RouteStop[];
}) {
  const capped = stops.slice(0, tier === 'ROTATION' ? 8 : 20);
  return (
    <div style={{marginBottom: 16}}>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          marginBottom: 6,
        }}
      >
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 14,
            letterSpacing: '0.18em',
            color,
            textTransform: 'uppercase',
          }}
        >
          {label}
        </div>
        <div style={{fontSize: 11, color: BRAND.gray, fontFamily: BODY}}>
          {stops.length} stop{stops.length === 1 ? '' : 's'}
        </div>
      </div>

      {capped.length === 0 ? (
        <div
          style={{
            fontSize: 12,
            color: BRAND.gray,
            padding: '8px 0',
            fontStyle: 'italic',
          }}
        >
          Nothing in this bucket right now.
        </div>
      ) : (
        <div style={{display: 'grid', gap: 6}}>
          {capped.map((s) => (
            <StopCard key={s.accountId} stop={s} tierColor={color} />
          ))}
          {stops.length > capped.length ? (
            <div
              style={{
                fontSize: 11,
                color: BRAND.gray,
                padding: '4px 2px',
                fontFamily: BODY,
              }}
            >
              +{stops.length - capped.length} more ·
              sort by distance in check-in flow
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

function StopCard({stop, tierColor}: {stop: RouteStop; tierColor: string}) {
  // Prospects (Zoho Leads) skip the full Account visit flow — they don't stock
  // Highsman yet, so the SKU/Merch/Menu audit fields on the store page don't
  // apply. These edge-case Lead stops still route to /vibes/lead-visit with
  // prospect context pre-filled. The vast majority of stops are Accounts
  // (Tier 1/2/3) and go to /vibes/store/$accountId.
  const isLead = stop.accountId.startsWith('lead-');
  const href = isLead
    ? `/vibes/lead-visit?leadId=${encodeURIComponent(stop.leadId || '')}&company=${encodeURIComponent(stop.name)}&city=${encodeURIComponent(stop.city || '')}&state=${encodeURIComponent(stop.state || 'NJ')}`
    : `/vibes/store/${stop.accountId}`;
  const daysLabel =
    stop.tier === 'FRESH' && stop.daysSinceClosed != null
      ? `${stop.daysSinceClosed}d since close`
      : stop.daysSinceLast != null
        ? `${stop.daysSinceLast}d since last visit`
        : 'Never visited';
  return (
    <Link
      to={href}
      style={{
        display: 'block',
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderLeft: `3px solid ${tierColor}`,
        borderRadius: 6,
        padding: '10px 12px',
        textDecoration: 'none',
        color: BRAND.white,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          gap: 8,
        }}
      >
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 20,
            lineHeight: 1.05,
            color: BRAND.white,
          }}
        >
          {stop.name}
        </div>
        <div
          style={{
            fontSize: 10,
            color: tierColor,
            fontFamily: TEKO,
            letterSpacing: '0.14em',
          }}
        >
          {stop.tier}
        </div>
      </div>
      <div
        style={{
          color: BRAND.gray,
          fontSize: 12,
          marginTop: 4,
          fontFamily: BODY,
        }}
      >
        {[stop.city, stop.state].filter(Boolean).join(', ') || '—'} · {daysLabel}
      </div>
    </Link>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function monthlyBudget(rep: VibesRep): number {
  const daysPerWeek = (rep.schedule_days || []).length || 3;
  // Approx 4.33 weeks/month
  return (rep.daily_goodie_budget || 60) * daysPerWeek * 4.33;
}

function buildSequence(route: {
  fresh: RouteStop[];
  targets: RouteStop[];
  rotation: RouteStop[];
}): {total: number} {
  return {
    total:
      (route.fresh?.length || 0) +
      (route.targets?.length || 0) +
      (route.rotation?.length || 0),
  };
}
