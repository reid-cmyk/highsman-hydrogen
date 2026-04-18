import {useEffect} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/store/:accountId — Vibes Team Store Profile
// ─────────────────────────────────────────────────────────────────────────────
// One-page briefing a rep pulls up on arrival at a dispensary.
// Panels:
//   • Store header (name, address, phone)
//   • Contacts by role (Owner / Buyer / Manager / Head Budtender / Budtender)
//   • Budtender training (Live sessions from brand_visits + Self-serve Klaviyo)
//   • Last visit summary
//   • Goodie / merch suggestions
//   • Recent visit history timeline
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({params, request, context}: LoaderFunctionArgs) {
  const accountId = params.accountId || '';
  if (!accountId) throw new Response('Missing accountId', {status: 400});

  const origin = new URL(request.url).origin;
  const res = await fetch(
    `${origin}/api/vibes-store?accountId=${encodeURIComponent(accountId)}`,
  );
  const data = await res.json();
  return json({...data, accountId});
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction<typeof loader> = ({data}) => {
  const name = (data as any)?.account?.name || 'Store Profile';
  return [
    {title: `${name} · Vibes · Highsman`},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// ─────────────────────────────────────────────────────────────────────────────
// BRAND
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  purple: '#B884FF',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

const ROLE_ORDER = [
  {key: 'owner', label: 'Owner'},
  {key: 'buyer', label: 'Buyer'},
  {key: 'manager', label: 'Manager / GM'},
  {key: 'head_budtender', label: 'Head Budtender'},
  {key: 'budtender', label: 'Budtender'},
  {key: 'other', label: 'Other Contact'},
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function VibesStoreProfile() {
  const data = useLoaderData<typeof loader>();

  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l = document.createElement('link');
    l.id = 'vibes-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);

    const s = document.createElement('style');
    s.id = 'vibes-klaviyo-suppress-store';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  if (!(data as any).ok) {
    return (
      <Shell>
        <div style={{padding: '40px 20px', color: BRAND.gray}}>
          <div style={{fontFamily: TEKO, fontSize: 36, color: BRAND.white}}>
            Store not found
          </div>
          <div style={{marginTop: 8, fontSize: 13}}>
            {(data as any).error || 'Zoho CRM did not return this account.'}
          </div>
          <Link
            to="/vibes"
            style={{
              display: 'inline-block',
              marginTop: 14,
              color: BRAND.gold,
              textDecoration: 'none',
              fontFamily: TEKO,
              fontSize: 18,
            }}
          >
            ← BACK TO ROUTE
          </Link>
        </div>
      </Shell>
    );
  }

  const {account, contactsByRole, training, recentVisits, lastVisit, daysSinceLastVisit} =
    data as any;

  return (
    <Shell>
      {/* Header */}
      <div
        style={{
          padding: '18px 16px 16px',
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      >
        <div
          style={{
            color: BRAND.gold,
            fontSize: 11,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            fontFamily: TEKO,
          }}
        >
          Store Profile
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 38,
            color: BRAND.white,
            textTransform: 'uppercase',
            letterSpacing: '0.01em',
            lineHeight: 1,
            marginTop: 2,
          }}
        >
          {account.name}
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 8,
            fontFamily: BODY,
          }}
        >
          {[account.street, account.city, account.state, account.zip]
            .filter(Boolean)
            .join(' · ')}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 14,
            flexWrap: 'wrap',
          }}
        >
          {account.phone ? (
            <a
              href={`tel:${account.phone}`}
              style={pill(BRAND.chip, BRAND.white)}
            >
              {account.phone}
            </a>
          ) : null}
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              [account.name, account.street, account.city, account.state]
                .filter(Boolean)
                .join(' '),
            )}`}
            target="_blank"
            rel="noopener noreferrer"
            style={pill(BRAND.gold, BRAND.black)}
          >
            Navigate →
          </a>
          <Link
            to={`/vibes/visit/new?accountId=${encodeURIComponent(account.id)}&accountName=${encodeURIComponent(account.name)}&accountCity=${encodeURIComponent(account.city || '')}&accountState=${encodeURIComponent(account.state || 'NJ')}`}
            style={pill(BRAND.green, BRAND.black)}
          >
            Check In
          </Link>
        </div>
      </div>

      {/* Last visit snapshot */}
      <Section title="Last Visit" index="Recap">
        {lastVisit ? (
          <div
            style={{
              background: BRAND.chip,
              border: `1px solid ${BRAND.line}`,
              borderRadius: 8,
              padding: '12px',
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
              }}
            >
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 22,
                  color: BRAND.white,
                }}
              >
                {formatDate(lastVisit.visit_date)}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color:
                    daysSinceLastVisit > 21
                      ? BRAND.red
                      : daysSinceLastVisit > 14
                        ? BRAND.orange
                        : BRAND.green,
                  fontFamily: TEKO,
                  letterSpacing: '0.1em',
                }}
              >
                {daysSinceLastVisit}d AGO
              </div>
            </div>
            <div
              style={{
                fontSize: 12,
                color: BRAND.gray,
                marginTop: 6,
                fontFamily: BODY,
              }}
            >
              by {lastVisit.rep_name} · {lastVisit.visit_type} ·{' '}
              {typeof lastVisit.vibes_score === 'number'
                ? `Vibes ${lastVisit.vibes_score}/10`
                : 'no vibes score'}
            </div>
            {lastVisit.notes_to_sales_team ? (
              <div
                style={{
                  fontSize: 13,
                  color: BRAND.white,
                  marginTop: 8,
                  padding: 8,
                  background: 'rgba(245,228,0,0.06)',
                  borderLeft: `2px solid ${BRAND.gold}`,
                  borderRadius: 4,
                  fontFamily: BODY,
                }}
              >
                {lastVisit.notes_to_sales_team}
              </div>
            ) : null}
          </div>
        ) : (
          <Empty line="No Vibes visits logged yet. You're the first." />
        )}
      </Section>

      {/* Contacts */}
      <Section title="Contacts" index="People">
        <div style={{display: 'grid', gap: 10}}>
          {ROLE_ORDER.map(({key, label}) => {
            const list: any[] = (contactsByRole?.[key] || []).filter(Boolean);
            if (!list.length) return null;
            return (
              <div key={key}>
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    letterSpacing: '0.18em',
                    color: BRAND.gold,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  {label}
                </div>
                <div style={{display: 'grid', gap: 6}}>
                  {list.map((c: any) => (
                    <ContactCard key={c.id} c={c} />
                  ))}
                </div>
              </div>
            );
          })}
          {Object.values(contactsByRole || {}).every(
            (a: any) => !a || !a.length,
          ) && (
            <Empty line="No contacts on the Zoho Account yet — log one at check-in." />
          )}
        </div>
      </Section>

      {/* Training */}
      <Section title="Budtender Training" index="Knowledge">
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
            marginBottom: 10,
          }}
        >
          <TrainStat
            label="Self"
            value={training?.summary?.self_serve_count || 0}
            icon="🎓"
          />
          <TrainStat
            label="Live"
            value={training?.summary?.live_count || 0}
            icon="👩"
          />
          <TrainStat
            label="Total"
            value={training?.summary?.total_trained_distinct || 0}
            icon="★"
          />
        </div>

        {/* Live trainings (most recent) */}
        {training?.live?.length ? (
          <TrainList
            title="Live Sessions"
            color={BRAND.green}
            rows={training.live.slice(0, 8).map((r: any) => ({
              who: r.budtender_name,
              module: r.module_title || r.module_slug,
              when: formatDate(r.completed_at),
              badge: 'LIVE',
            }))}
          />
        ) : null}

        {/* Self-serve */}
        {training?.selfServe?.length ? (
          <TrainList
            title="Training Camp (self-serve)"
            color={BRAND.gold}
            rows={training.selfServe.slice(0, 8).map((r: any) => ({
              who: [r.firstName, r.lastName].filter(Boolean).join(' ').trim(),
              module: `${r.courseCount} / 5 courses`,
              when: r.lastActivity ? formatDate(r.lastActivity) : '—',
              badge: 'SELF',
            }))}
          />
        ) : null}

        {!training?.live?.length && !training?.selfServe?.length && (
          <Empty line="No training records yet. Log a Live session on check-in." />
        )}
      </Section>

      {/* Recent visits timeline */}
      <Section title="Visit History" index="Timeline">
        {recentVisits?.length ? (
          <div style={{display: 'grid', gap: 6}}>
            {recentVisits.map((v: any) => (
              <div
                key={v.id}
                style={{
                  padding: 10,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 6,
                  background: BRAND.chip,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 18,
                      color: BRAND.white,
                    }}
                  >
                    {formatDate(v.visit_date)}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: BRAND.gold,
                      fontFamily: TEKO,
                      letterSpacing: '0.12em',
                    }}
                  >
                    {String(v.visit_type).toUpperCase()}
                  </div>
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: BRAND.gray,
                    fontFamily: BODY,
                    marginTop: 2,
                  }}
                >
                  {v.rep_name} ·{' '}
                  {typeof v.vibes_score === 'number'
                    ? `Vibes ${v.vibes_score}/10`
                    : 'no score'}{' '}
                  ·{' '}
                  {(v.budtenders_trained?.length || 0) > 0
                    ? `${v.budtenders_trained.length} trained`
                    : 'no training'}{' '}
                  · ${Number(v.goodie_total_spent || 0).toFixed(0)} goodies
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Empty line="No visit history yet." />
        )}
      </Section>

      <div
        style={{
          padding: '24px 16px 48px',
          textAlign: 'center',
        }}
      >
        <Link
          to="/vibes"
          style={{
            color: BRAND.gold,
            textDecoration: 'none',
            fontFamily: TEKO,
            fontSize: 18,
            letterSpacing: '0.1em',
          }}
        >
          ← BACK TO ROUTE
        </Link>
      </div>
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Primitives
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
          to="/vibes"
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 18,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          ← VIBES
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
            fontSize: 26,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            color: BRAND.white,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 11,
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

function ContactCard({c}: {c: any}) {
  return (
    <div
      style={{
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 6,
        padding: 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
        }}
      >
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 18,
            color: BRAND.white,
          }}
        >
          {c.name || c.email || '—'}
        </div>
        {c.title ? (
          <div
            style={{
              fontSize: 10,
              color: BRAND.gray,
              fontFamily: TEKO,
              letterSpacing: '0.1em',
            }}
          >
            {String(c.title).toUpperCase()}
          </div>
        ) : null}
      </div>
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 6,
          fontSize: 12,
          fontFamily: BODY,
        }}
      >
        {c.phone ? (
          <a href={`tel:${c.phone}`} style={{color: BRAND.gold, textDecoration: 'none'}}>
            {c.phone}
          </a>
        ) : null}
        {c.email ? (
          <a
            href={`mailto:${c.email}`}
            style={{color: BRAND.gray, textDecoration: 'none'}}
          >
            {c.email}
          </a>
        ) : null}
      </div>
    </div>
  );
}

function TrainStat({label, value, icon}: {label: string; value: number; icon: string}) {
  return (
    <div
      style={{
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 6,
        padding: '8px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{fontSize: 16}}>{icon}</div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 22,
          color: BRAND.white,
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: 10,
          color: BRAND.gray,
          fontFamily: TEKO,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
    </div>
  );
}

function TrainList({
  title,
  rows,
  color,
}: {
  title: string;
  rows: Array<{who: string; module: string; when: string; badge: string}>;
  color: string;
}) {
  return (
    <div style={{marginBottom: 12}}>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 12,
          letterSpacing: '0.2em',
          color,
          textTransform: 'uppercase',
          marginBottom: 4,
        }}
      >
        {title}
      </div>
      <div style={{display: 'grid', gap: 4}}>
        {rows.map((r, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '6px 10px',
              border: `1px solid ${BRAND.line}`,
              borderRadius: 4,
              fontSize: 12,
              background: BRAND.chip,
            }}
          >
            <div
              style={{
                display: 'flex',
                gap: 8,
                alignItems: 'center',
                fontFamily: BODY,
              }}
            >
              <span
                style={{
                  fontFamily: TEKO,
                  fontSize: 9,
                  letterSpacing: '0.1em',
                  color,
                  border: `1px solid ${color}`,
                  padding: '1px 4px',
                  borderRadius: 3,
                }}
              >
                {r.badge}
              </span>
              <span style={{color: BRAND.white}}>{r.who || '—'}</span>
            </div>
            <div
              style={{color: BRAND.gray, fontFamily: BODY, fontSize: 11}}
            >
              {r.module} · {r.when}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Empty({line}: {line: string}) {
  return (
    <div
      style={{
        padding: '14px 12px',
        border: `1px dashed ${BRAND.line}`,
        borderRadius: 6,
        color: BRAND.gray,
        fontSize: 12,
        textAlign: 'center',
        fontFamily: BODY,
      }}
    >
      {line}
    </div>
  );
}

function pill(bg: string, fg: string): React.CSSProperties {
  return {
    background: bg,
    color: fg,
    padding: '8px 12px',
    borderRadius: 6,
    fontFamily: TEKO,
    fontSize: 16,
    letterSpacing: '0.02em',
    textTransform: 'uppercase',
    textDecoration: 'none',
    border: `1px solid ${bg === BRAND.chip ? BRAND.line : bg}`,
  };
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year:
      d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
  });
}
