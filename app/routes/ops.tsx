import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /ops — Spark Team Ops Dashboard (field-staff only)
// ─────────────────────────────────────────────────────────────────────────────
// Mobile-first, dark, Klaviyo-suppressed. Built as modular card components so
// future panels (sales health, D2C marketing, command center) can be grided
// in without re-doing layout math. Pair with /shift-report for end-of-shift
// reports.
//
// Sections (Pop-Ups & Training Ops, v1):
//   1. Today's Game Plan          — today's confirmed visits + trainings
//   2. This Week at a Glance      — Fri/Sat shift strip for next 14 days
//   3. Dispensary Coverage Pulse  — NJ accounts colored by days-since-visit
//   4. Scoreboard                 — field KPIs this month/quarter
//   5. Sticky Quick Actions       — mobile bottom bar (book / report / call)
//
// (Intentionally DROPPED: "Ready to Book" section from the original proposal.)
//
// Data wiring is staged in after skeleton lands. All cards degrade gracefully
// with a "no data yet" empty state so the page ships usable day one.
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  // Future: hydrate today's Events, Accounts, scoreboards server-side.
  // For the skeleton we ship a static payload so the UI is testable.
  return json({
    nowIso: new Date().toISOString(),
    // Feature flags so we can light up cards as their data wires in.
    dataReady: {
      today: false,
      week: false,
      coverage: false,
      scoreboard: false,
    },
    // Sanity check — avoids rendering the dashboard if env is missing entirely.
    hasZoho: Boolean(
      env?.ZOHO_CLIENT_ID &&
        env?.ZOHO_CLIENT_SECRET &&
        env?.ZOHO_REFRESH_TOKEN,
    ),
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
// BRAND TOKENS — identical to /njpopups so the two pages feel like one app.
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
// Shared "Card" shell — every dashboard section uses the same chrome.
// Keeping this as a single component makes future merge into a Whole Business
// Command Center trivial: just drop each card into a grid cell.
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

// Empty-state stub — used by every card until its data wires in.
function EmptyState({message}: {message: string}) {
  return (
    <div
      style={{
        padding: '28px 20px',
        textAlign: 'center',
        fontFamily: BODY,
        fontSize: 14,
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

// Stat block for the scoreboard — Edo-SZ-style big numeric.
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

export default function OpsDashboard() {
  const {nowIso, dataReady} = useLoaderData<typeof loader>();

  // Suppress Klaviyo popup on this B2B/staff page (matches /njpopups, /njmenu).
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

  // Human-readable today string for the hero.
  const todayLabel = useMemo(() => {
    const d = new Date(nowIso);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, [nowIso]);

  return (
    <div
      style={{
        background: BRAND.black,
        color: BRAND.white,
        minHeight: '100vh',
        fontFamily: BODY,
        // Leave room for the sticky mobile action bar at the bottom.
        paddingBottom: 96,
      }}
    >
      {/* ── Top bar — logo + identity ────────────────────────────────────── */}
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
        {/* ── Hero: Today's Game Plan ─────────────────────────────────── */}
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
          {dataReady.today ? null : (
            <EmptyState message="Today's confirmed pop-ups + trainings will appear here once wired to Zoho Events." />
          )}
        </Card>

        {/* ── This Week at a Glance ──────────────────────────────────── */}
        <Card
          kicker="Next 14 Days"
          title="This Week at a Glance"
          accent={BRAND.white}
        >
          {dataReady.week ? null : (
            <EmptyState message="Fri/Sat shift strip — color-coded by confirmed / pending / open — lands here once hydrated." />
          )}
        </Card>

        {/* ── Dispensary Coverage Pulse ─────────────────────────────── */}
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
                <span style={{color: BRAND.red}}>●</span> 60+
              </span>
            </div>
          }
        >
          {dataReady.coverage ? null : (
            <EmptyState message="Dispensary grid colored by last-visit date lands here — this is the 'who are we ghosting' radar." />
          )}
        </Card>

        {/* ── Scoreboard ─────────────────────────────────────────────── */}
        <Card kicker="This Month" title="Scoreboard" accent={BRAND.gold}>
          {dataReady.scoreboard ? null : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                borderTop: `1px solid ${BRAND.line}`,
                borderLeft: `1px solid ${BRAND.line}`,
              }}
            >
              <Stat label="Pop-Ups" value="—" caption="Hydrated next" />
              <Stat label="Trainings" value="—" caption="Hydrated next" />
              <Stat label="Dispensaries Visited" value="—" caption="QTD" />
              <Stat
                label="Avg Days Between Visits"
                value="—"
                caption="Per account"
              />
            </div>
          )}
        </Card>

        {/* ── Footer note ─────────────────────────────────────────────── */}
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
          Staff tool · Highsman Spark Team · Data-wiring in progress
        </div>
      </main>

      {/* ── Sticky mobile quick-action bar ───────────────────────────── */}
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
          gridTemplateColumns: '1fr 1fr 1fr',
          gap: 8,
          zIndex: 30,
        }}
      >
        <Link
          to="/njpopups"
          style={{
            background: BRAND.gold,
            color: BRAND.black,
            fontFamily: TEKO,
            fontSize: 14,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '12px 8px',
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
            fontSize: 14,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '12px 8px',
            textAlign: 'center',
            textDecoration: 'none',
            border: `1px solid ${BRAND.gold}`,
          }}
        >
          Shift Report
        </Link>
        <Link
          to="/njmenu"
          style={{
            background: 'transparent',
            color: BRAND.white,
            fontFamily: TEKO,
            fontSize: 14,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            padding: '12px 8px',
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
