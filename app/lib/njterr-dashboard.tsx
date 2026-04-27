import {useEffect, useMemo} from 'react';
import {Link, useLoaderData} from '@remix-run/react';
import {REP_HUBS, type RepId} from '~/lib/reps';

// ─────────────────────────────────────────────────────────────────────────────
// /njnorth and /njsouth — Rep Territory Dashboard (shared component)
// ─────────────────────────────────────────────────────────────────────────────
// One implementation, two routes. Each route's loader sets `territory` on the
// data payload so the component can scope events, copy, and brand accents.
//
// Cards (in order):
//   1. Pre-launch banner       — visible until 2026-05-15
//   2. Today's Shift           — single confirmed [NJ-N] or [NJ-S] event today
//   3. Upcoming Shifts         — next 60 days, grouped by week (mirrors /ops)
//   4. Past Shifts + Reports   — past events with shift-report deep links
//   5. Sales & Commissions     — placeholder card; data wired up later
//
// Auth happens in the route loader (not here). If the loader passes
// `authed: false`, this component renders the login screen instead.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types matching the shared loader payload ───────────────────────────────
export type DashEvent = {
  id: string;
  title: string;
  date: string; // yyyy-mm-dd
  time: string;
  accountId: string | null;
  accountName: string | null;
  accountCity: string | null;
  isOverride: boolean;
  startIso: string;
};

export type NjTerrLoaderData = {
  authed: boolean;
  territory: RepId;
  loginError?: string | null;
  nowIso: string;
  today: {ok: boolean; events: DashEvent[]};
  upcoming: {ok: boolean; events: DashEvent[]};
  past: {ok: boolean; events: DashEvent[]};
  hasZoho: boolean;
};

// ─── Brand tokens (kept in sync with /ops) ──────────────────────────────────
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
  chip: 'rgba(255,255,255,0.06)',
} as const;

const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

const LAUNCH_DATE = '2026-05-15';

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export function NjTerrDashboard() {
  const data = useLoaderData<NjTerrLoaderData>();

  // Klaviyo popup suppression (per `feedback_klaviyo_popup_suppression.md`
  // — these are staff-only B2B pages, no consumer popup).
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => style.remove();
  }, []);

  // Inject brand fonts.
  useEffect(() => {
    if (document.getElementById('hs-njterr-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hs-njterr-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  if (!data.authed) {
    return <LoginScreen territory={data.territory} error={data.loginError} />;
  }
  return <AuthedDashboard data={data} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// LOGIN SCREEN
// ─────────────────────────────────────────────────────────────────────────────
function LoginScreen({territory, error}: {territory: RepId; error?: string | null}) {
  const hub = REP_HUBS[territory];
  return (
    <div
      style={{
        background: BRAND.black,
        color: BRAND.white,
        minHeight: '100vh',
        fontFamily: BODY,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 380,
          border: `1px solid ${BRAND.line}`,
          background: BRAND.surface,
          padding: 32,
        }}
      >
        <div style={{textAlign: 'center', marginBottom: 24}}>
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 36, width: 'auto', margin: '0 auto 16px'}}
          />
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: hub.color,
            }}
          >
            {hub.name}
          </div>
          <h1
            style={{
              fontFamily: TEKO,
              fontSize: 28,
              lineHeight: 1.05,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              margin: '4px 0 0',
              color: BRAND.white,
            }}
          >
            Spark Team Dashboard
          </h1>
        </div>

        {error && (
          <div
            style={{
              padding: '10px 12px',
              border: `1px solid ${BRAND.red}`,
              background: 'rgba(255,59,48,0.10)',
              color: BRAND.red,
              fontSize: 13,
              marginBottom: 16,
              fontFamily: TEKO,
              letterSpacing: '0.06em',
            }}
          >
            Wrong password — try again.
          </div>
        )}

        <form method="post" action="/api/njterr-login">
          <input type="hidden" name="intent" value="login" />
          <input type="hidden" name="territory" value={territory} />
          <label
            htmlFor="njterr-pw"
            style={{
              display: 'block',
              fontFamily: TEKO,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: BRAND.gray,
              marginBottom: 6,
            }}
          >
            Password
          </label>
          <input
            id="njterr-pw"
            type="password"
            name="password"
            autoComplete="current-password"
            required
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              background: BRAND.black,
              border: `1px solid ${BRAND.line}`,
              color: BRAND.white,
              fontSize: 16,
              fontFamily: BODY,
              boxSizing: 'border-box',
            }}
          />
          <button
            type="submit"
            style={{
              width: '100%',
              marginTop: 14,
              background: hub.color,
              color: BRAND.black,
              border: `1px solid ${hub.color}`,
              padding: '12px 16px',
              fontFamily: TEKO,
              fontSize: 16,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Log In →
          </button>
        </form>

        <p
          style={{
            margin: '20px 0 0',
            color: BRAND.gray,
            fontSize: 11,
            lineHeight: 1.5,
            textAlign: 'center',
          }}
        >
          Lost your password? Contact{' '}
          <a
            href="mailto:sky@highsman.com"
            style={{color: BRAND.gold, textDecoration: 'none'}}
          >
            sky@highsman.com
          </a>
        </p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AUTHED DASHBOARD
// ─────────────────────────────────────────────────────────────────────────────
function AuthedDashboard({data}: {data: NjTerrLoaderData}) {
  const {nowIso, today, upcoming, past, hasZoho, territory} = data;
  const hub = REP_HUBS[territory];

  const todayLabel = useMemo(() => {
    const d = new Date(nowIso);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      timeZone: 'America/New_York',
    });
  }, [nowIso]);
  const todayIso = nowIso.slice(0, 10);

  const daysUntilLaunch = useMemo(() => {
    if (todayIso >= LAUNCH_DATE) return 0;
    const [y1, m1, d1] = todayIso.split('-').map((n) => parseInt(n, 10));
    const [y2, m2, d2] = LAUNCH_DATE.split('-').map((n) => parseInt(n, 10));
    const t1 = Date.UTC(y1, m1 - 1, d1);
    const t2 = Date.UTC(y2, m2 - 1, d2);
    return Math.round((t2 - t1) / (24 * 60 * 60 * 1000));
  }, [todayIso]);

  // Group upcoming events by ISO week (Thu-anchored — matches /njpopups picker).
  const upcomingWeekGroups = useMemo(() => {
    const map = new Map<string, DashEvent[]>();
    for (const ev of upcoming.events) {
      const [y, m, d] = ev.date.split('-').map((n) => parseInt(n, 10));
      const dt = new Date(Date.UTC(y, m - 1, d));
      const dow = dt.getUTCDay();
      const thuOffset = (dow + 7 - 4) % 7;
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
        <div style={{display: 'flex', alignItems: 'center', gap: 12, minWidth: 0}}>
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 28, width: 'auto', display: 'block', flexShrink: 0}}
          />
          <div style={{minWidth: 0}}>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: hub.color,
              }}
            >
              {hub.name}
            </div>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 16,
                letterSpacing: '0.06em',
                color: BRAND.white,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {todayLabel}
            </div>
          </div>
        </div>
        <form method="post" action="/api/njterr-login" style={{margin: 0}}>
          <input type="hidden" name="intent" value="logout" />
          <input type="hidden" name="territory" value={territory} />
          <button
            type="submit"
            style={{
              background: 'transparent',
              color: BRAND.gray,
              border: `1px solid ${BRAND.line}`,
              padding: '6px 12px',
              fontFamily: TEKO,
              fontSize: 12,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Log Out
          </button>
        </form>
      </div>

      <main style={{maxWidth: 760, margin: '0 auto', padding: '20px 16px'}}>
        {/* ── Pre-launch banner ───────────────────────────────────────── */}
        {daysUntilLaunch > 0 && (
          <section
            style={{
              border: `1px solid ${hub.color}`,
              background: `linear-gradient(135deg, ${BRAND.black} 0%, #1a1408 100%)`,
              padding: '20px 22px',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: hub.color,
                marginBottom: 6,
              }}
            >
              Pre-Launch · Spark Team
            </div>
            <div style={{display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap'}}>
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
              <div style={{fontFamily: TEKO, fontSize: 22, color: hub.color, letterSpacing: '0.04em'}}>
                {daysUntilLaunch} {daysUntilLaunch === 1 ? 'day' : 'days'} out
              </div>
            </div>
            <p style={{margin: '10px 0 0', fontSize: 13, lineHeight: 1.5, color: BRAND.gray}}>
              Spark Team officially kicks off Fri May 15, 2026. Your shifts are auto-confirmed
              when /njpopups books a pop-up at a {hub.hubLabel.toLowerCase()} dispensary.
            </p>
          </section>
        )}

        {!hasZoho && <ErrorState message="Zoho env vars missing — shifts can't hydrate." />}

        {/* ── Today's Shift ───────────────────────────────────────────── */}
        <Card kicker={todayLabel} title="Today's Shift" accent={hub.color}>
          {!today.ok ? (
            <ErrorState message="Couldn't reach Zoho Events." />
          ) : today.events.length === 0 ? (
            <EmptyState message="No shifts on the schedule today. Take care of your fundamentals." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {today.events.map((ev) => (
                <ShiftRow
                  key={ev.id}
                  ev={ev}
                  hubColor={hub.color}
                  showReport
                  rep={hub.name}
                />
              ))}
            </div>
          )}
        </Card>

        {/* ── Upcoming Shifts ─────────────────────────────────────────── */}
        <Card
          kicker="Next 60 Days"
          title="Upcoming Shifts"
          accent={hub.color}
          action={
            <Link
              to="/njpopups"
              style={{
                color: hub.color,
                fontFamily: TEKO,
                fontSize: 12,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                border: `1px solid ${hub.color}`,
                padding: '6px 10px',
              }}
            >
              View Pop-Ups →
            </Link>
          }
        >
          {!upcoming.ok ? (
            <ErrorState message="Couldn't reach Zoho Events." />
          ) : upcomingWeekGroups.length === 0 ? (
            <EmptyState message="No upcoming shifts in your territory yet. Bookings appear here automatically as they confirm in /njpopups." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 18}}>
              {upcomingWeekGroups.map(([weekStart, events]) => {
                const [yy, mm, dd] = weekStart.split('-').map((n) => parseInt(n, 10));
                const thu = new Date(Date.UTC(yy, mm - 1, dd));
                const sun = new Date(thu.getTime() + 3 * 24 * 60 * 60 * 1000);
                const fmt = (d: Date) =>
                  d.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    timeZone: 'UTC',
                  });
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
                        Week of {fmt(thu)} – {fmt(sun)}
                      </div>
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 12,
                          letterSpacing: '0.16em',
                          textTransform: 'uppercase',
                          color: hub.color,
                        }}
                      >
                        {events.length} {events.length === 1 ? 'shift' : 'shifts'}
                      </div>
                    </div>
                    <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
                      {events.map((ev) => (
                        <ShiftRow
                          key={ev.id}
                          ev={ev}
                          hubColor={hub.color}
                          rep={hub.name}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* ── Past Shifts + Reports ───────────────────────────────────── */}
        <Card
          kicker="History"
          title="Past Shifts & Reports"
          accent={BRAND.white}
        >
          {!past.ok ? (
            <ErrorState message="Couldn't reach Zoho Events." />
          ) : past.events.length === 0 ? (
            <EmptyState message="No shift history yet. Your first completed shift report will land here." />
          ) : (
            <div style={{display: 'flex', flexDirection: 'column', gap: 6}}>
              {past.events.map((ev) => (
                <ShiftRow
                  key={ev.id}
                  ev={ev}
                  hubColor={hub.color}
                  rep={hub.name}
                  showReport
                  past
                />
              ))}
            </div>
          )}
        </Card>

        {/* ── Sales & Commissions (placeholder) ───────────────────────── */}
        <Card kicker="Coming Soon" title="Sales & Commissions" accent={BRAND.gold}>
          <div
            style={{
              padding: '20px 4px',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 22,
                letterSpacing: '0.06em',
                color: BRAND.white,
                marginBottom: 8,
              }}
            >
              Earnings live here once dispensary settlement reports hit our books.
            </div>
            <p
              style={{
                margin: '0 auto',
                maxWidth: 460,
                fontSize: 13,
                lineHeight: 1.55,
                color: BRAND.gray,
              }}
            >
              You'll see per-shift sales, sell-through, and commissions per pop-up
              once the data pipeline is wired. Until then: focus on running clean
              shifts, log your reports, and the numbers will follow.
            </p>
            <div
              style={{
                marginTop: 16,
                display: 'inline-block',
                padding: '6px 12px',
                border: `1px solid ${BRAND.line}`,
                fontFamily: TEKO,
                fontSize: 11,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: BRAND.gray,
              }}
            >
              Data pipeline: Pending
            </div>
          </div>
        </Card>

        {/* Footer */}
        <p
          style={{
            margin: '32px 0 0',
            textAlign: 'center',
            color: BRAND.gray,
            fontSize: 11,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          Highsman · Spark Greatness™
        </p>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CARD + ROW PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function Card({
  kicker,
  title,
  accent = BRAND.gold,
  action,
  children,
}: {
  kicker: string;
  title: string;
  accent?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
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
        padding: '20px 4px',
        textAlign: 'center',
        color: BRAND.gray,
        fontSize: 13,
        lineHeight: 1.5,
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
        border: `1px solid ${BRAND.red}`,
        background: 'rgba(255,59,48,0.08)',
        color: BRAND.red,
        fontSize: 13,
        marginBottom: 20,
      }}
    >
      {message}
    </div>
  );
}

function ShiftRow({
  ev,
  hubColor,
  rep,
  showReport,
  past,
}: {
  ev: DashEvent;
  hubColor: string;
  rep: string;
  showReport?: boolean;
  past?: boolean;
}) {
  const params = new URLSearchParams();
  if (ev.accountId) params.set('accountId', ev.accountId);
  if (ev.accountName) params.set('accountName', ev.accountName);
  if (ev.accountCity) params.set('accountCity', ev.accountCity);
  params.set('date', ev.date);
  params.set('rep', rep);
  const reportHref = `/shift-report?${params.toString()}`;

  const dateLabel = (() => {
    const [y, m, d] = ev.date.split('-').map((n) => parseInt(n, 10));
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  })();

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 8,
      }}
    >
      <div style={{width: 84, flexShrink: 0}}>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            color: hubColor,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {dateLabel}
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 16,
            color: BRAND.white,
            letterSpacing: '0.04em',
          }}
        >
          {ev.time || '—'}
        </div>
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
          {ev.accountName || 'Unnamed dispensary'}
        </div>
        <div style={{fontSize: 11, color: BRAND.gray, letterSpacing: '0.1em', marginTop: 2}}>
          {ev.accountCity ? `${ev.accountCity}, NJ` : 'Location TBD'}
          {ev.isOverride && (
            <span style={{color: BRAND.red, marginLeft: 8}}>• OVERRIDE</span>
          )}
        </div>
      </div>
      {showReport && (
        <Link
          to={reportHref}
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: BRAND.black,
            background: hubColor,
            padding: '8px 12px',
            border: `1px solid ${hubColor}`,
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          {past ? 'View Report' : 'End of Shift →'}
        </Link>
      )}
    </div>
  );
}
