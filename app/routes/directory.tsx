import {useMemo, useState} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /directory — Highsman Staff Directory (site map)
// ─────────────────────────────────────────────────────────────────────────────
// One page that lists every page on highsman.com outside the homepage, so
// Spark Team and the Exec/Ops side know exactly where to go for what.
// Built for screen + print. noindex — staff-only, not a consumer page.
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Highsman Staff Directory · Site Map'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'The Highsman staff directory — every page on the site, organized by team. Spark Team tools, dashboards, wholesale, budtender training, brand pages.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS (matches /ops, /grading-rubric, /shift-report)
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
// DIRECTORY CONTENT — single source of truth for every non-home page
// ─────────────────────────────────────────────────────────────────────────────
type PageEntry = {
  path: string;
  name: string;
  description: string;
  audience?: string;
  access?: 'staff' | 'b2b' | 'public';
};

type Section = {
  kicker: string;
  title: string;
  accent: string;
  blurb: string;
  pages: PageEntry[];
};

const SECTIONS: Section[] = [
  {
    kicker: 'Section 01',
    title: 'Spark Team · Field Ops',
    accent: BRAND.gold,
    blurb:
      'Everything a rep needs on the floor. Booking, reporting, and how you get graded.',
    pages: [
      {
        path: '/njpopups',
        name: 'NJ Pop-Up Booking',
        description:
          'Book your weekend pop-ups at NJ dispensaries. Auto-assigns North/South Jersey rep, enforces the 5-day lead time, checks drive-time between stores.',
        audience: 'Spark Team · NJ',
        access: 'staff',
      },
      {
        path: '/shift-report',
        name: 'Shift Report',
        description:
          'End-of-shift report form. Mirrors the CloserShiftReport Zoho module — 21 fields across close rate, volume, aggression, job completion, retail intel.',
        audience: 'Spark Team',
        access: 'staff',
      },
      {
        path: '/grading-rubric',
        name: 'How You Get Graded',
        description:
          'The exact formula behind your letter grade. Close 35 · Volume 20 · Aggression 15 · Job 15 · Intel 15. Includes a live scorer to test any shift.',
        audience: 'Spark Team',
        access: 'staff',
      },
    ],
  },
  {
    kicker: 'Section 02',
    title: 'Dashboards · Leadership',
    accent: BRAND.orange,
    blurb:
      'Executive and ops views. Sales by state and SKU, team ops hub, staff landing.',
    pages: [
      {
        path: '/ops',
        name: 'Spark Team Ops',
        description:
          'Ops dashboard for managing pop-ups, reviewing shifts, rep coverage, and the route planner. The command center for field operations.',
        audience: 'Leadership · Ops',
        access: 'staff',
      },
      {
        path: '/sales',
        name: 'Sales Dashboard',
        description:
          'Company-level sales performance. Orders by state (NJ/MA/NY/RI/MO), by channel, by SKU. No individual rep names — aggregate view.',
        audience: 'Leadership · Exec',
        access: 'staff',
      },
      {
        path: '/staff-dashboard',
        name: 'Staff Training Hub',
        description:
          'The internal training track — Meet Ricky, brand training, the science, product training. Every staff member starts here.',
        audience: 'All staff',
        access: 'staff',
      },
    ],
  },
  {
    kicker: 'Section 03',
    title: 'Wholesale · B2B',
    accent: BRAND.green,
    blurb:
      'Buyer-facing pages. NJ retail partner resources, the wholesale menu, and retail merchandising.',
    pages: [
      {
        path: '/newjersey',
        name: 'NJ Retail Partner Resources',
        description:
          'The NJ wholesale landing page for dispensary buyers — brand story, lineup, partner program, menu download.',
        audience: 'NJ Dispensary Buyers',
        access: 'b2b',
      },
      {
        path: '/njmenu',
        name: 'NJ Wholesale Menu',
        description:
          'Live wholesale menu for New Jersey buyers. Pulls real-time inventory from Zoho, shows case pricing, 0.5% credit accrual on every order.',
        audience: 'NJ Dispensary Buyers',
        access: 'b2b',
      },
      {
        path: '/retail',
        name: 'Retail Merchandising',
        description:
          'Merch catalog for retail partners — POS displays, counter mats, branded swag. Order the in-store package that drives the pitch.',
        audience: 'Retail Partners',
        access: 'b2b',
      },
    ],
  },
  {
    kicker: 'Section 04',
    title: 'Budtender Tools',
    accent: BRAND.gold,
    blurb:
      'Training and activation for dispensary floor staff. Know the product, win the championship.',
    pages: [
      {
        path: '/budtenders',
        name: 'Budtender Championship',
        description:
          'The May 7 – June 7 2026 NJ Launch competition. Top budtenders win prizes for selling Highsman on the floor.',
        audience: 'NJ Budtenders',
        access: 'public',
      },
      {
        path: '/budtender-education',
        name: 'Budtender Training Camp',
        description:
          'The full budtender training program and portal. Brand story, product knowledge, approved pitches, closing scripts — plus all course quizzes built right in.',
        audience: 'Budtenders',
        access: 'public',
      },
    ],
  },
  {
    kicker: 'Section 05',
    title: 'Consumer · Brand',
    accent: BRAND.white,
    blurb:
      'Shop pages and brand storytelling. Where consumers land and convert.',
    pages: [
      {
        path: '/hit-sticks',
        name: 'Hit Sticks',
        description:
          '0.5g triple-infused pre-rolls built for on-the-go. The fastest way to hit the product — and the highest-margin unit on the menu.',
        access: 'public',
      },
      {
        path: '/pre-rolls',
        name: '1.2G Pre-Rolls',
        description:
          'The flagship 1.2g triple-infused pre-rolls. Built for sharing and heavy sessions. Five strains.',
        access: 'public',
      },
      {
        path: '/ground-game',
        name: 'Ground Game (7G Flower)',
        description:
          '7g jars of premium flower — the roll-your-own format. Versatile, high-value, and the workhorse of the lineup.',
        access: 'public',
      },
      {
        path: '/our-strains',
        name: 'Our Strains',
        description:
          'The full strain lineup. Terpenes, effects, and what each one delivers on the floor.',
        access: 'public',
      },
      {
        path: '/apparel',
        name: 'Apparel · The Collection',
        description:
          'Highsman merch — tees, hoodies, hats. The uniform. Ships DTC.',
        access: 'public',
      },
      {
        path: '/storelocator',
        name: 'Store Locator',
        description:
          'Find a dispensary carrying Highsman. Map view with filters by state and product line.',
        access: 'public',
      },
      {
        path: '/contact',
        name: 'Contact',
        description:
          'Public contact form — inbound inquiries, press, partnership asks.',
        access: 'public',
      },
    ],
  },
  {
    kicker: 'Section 06',
    title: 'Policies',
    accent: BRAND.gray,
    blurb: 'Legal footer pages — every site needs them.',
    pages: [
      {
        path: '/policies/privacy-policy',
        name: 'Privacy Policy',
        description: 'Site privacy policy. Updated for NJ cannabis compliance.',
        access: 'public',
      },
      {
        path: '/policies/terms-of-service',
        name: 'Terms of Service',
        description: 'Site terms of service and conditions of use.',
        access: 'public',
      },
    ],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function accessBadge(access?: PageEntry['access']) {
  if (!access) return null;
  const cfg = {
    staff: {label: 'Staff only', bg: 'rgba(245,228,0,0.14)', fg: BRAND.gold},
    b2b: {label: 'B2B', bg: 'rgba(46,204,113,0.14)', fg: BRAND.green},
    public: {label: 'Public', bg: 'rgba(169,172,175,0.16)', fg: BRAND.gray},
  } as const;
  const c = cfg[access];
  return {label: c.label, bg: c.bg, fg: c.fg};
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function Directory() {
  const [q, setQ] = useState('');

  const totalPages = useMemo(
    () => SECTIONS.reduce((acc, s) => acc + s.pages.length, 0),
    [],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return SECTIONS;
    return SECTIONS.map((s) => ({
      ...s,
      pages: s.pages.filter((p) =>
        (p.name + ' ' + p.path + ' ' + p.description + ' ' + (p.audience ?? ''))
          .toLowerCase()
          .includes(needle),
      ),
    })).filter((s) => s.pages.length > 0);
  }, [q]);

  return (
    <main
      style={{
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
        minHeight: '100vh',
        padding: '0 0 120px',
      }}
    >
      {/* Google Fonts */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap"
      />

      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${BRAND.line}`,
          padding: '28px 20px 24px',
          textAlign: 'center',
          background:
            'radial-gradient(ellipse at top, rgba(245,228,0,0.05), transparent 70%)',
        }}
      >
        <Link to="/" style={{display: 'inline-block'}}>
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 48, width: 'auto', display: 'block', margin: '0 auto 18px'}}
          />
        </Link>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            letterSpacing: 4,
            color: BRAND.gold,
            textTransform: 'uppercase',
            fontWeight: 600,
            marginBottom: 8,
          }}
        >
          Staff Directory · Site Map
        </div>
        <h1
          style={{
            fontFamily: TEKO,
            fontSize: 'clamp(44px, 8vw, 84px)',
            lineHeight: 0.95,
            margin: '0 0 12px',
            textTransform: 'uppercase',
            letterSpacing: '-0.01em',
            fontWeight: 700,
          }}
        >
          Every Page. One Place.
        </h1>
        <p
          style={{
            maxWidth: 620,
            margin: '0 auto',
            color: BRAND.gray,
            fontSize: 16,
            lineHeight: 1.45,
          }}
        >
          The Highsman site map. {totalPages} pages across{' '}
          {SECTIONS.length} sections — field ops, dashboards, wholesale,
          budtender tools, brand, and policies. Bookmark this. Share it.
        </p>

        {/* Search */}
        <div
          style={{
            maxWidth: 520,
            margin: '22px auto 0',
            position: 'relative',
          }}
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages — try 'menu', 'shift', 'training'…"
            style={{
              width: '100%',
              padding: '14px 16px 14px 44px',
              borderRadius: 10,
              border: `1px solid ${BRAND.lineStrong}`,
              background: BRAND.chip,
              color: BRAND.white,
              fontFamily: BODY,
              fontSize: 15,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          <span
            aria-hidden
            style={{
              position: 'absolute',
              left: 16,
              top: '50%',
              transform: 'translateY(-50%)',
              color: BRAND.gray,
              fontSize: 16,
            }}
          >
            ⌕
          </span>
        </div>
      </header>

      {/* Sections */}
      <div style={{maxWidth: 1120, margin: '0 auto', padding: '48px 20px 0'}}>
        {filtered.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              color: BRAND.gray,
              fontSize: 16,
              padding: '60px 0',
            }}
          >
            No pages match <strong style={{color: BRAND.white}}>“{q}”</strong>.
            Try a different term.
          </div>
        )}

        {filtered.map((section) => (
          <section key={section.title} style={{marginBottom: 56}}>
            {/* Section header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                gap: 16,
                flexWrap: 'wrap',
                borderBottom: `1px solid ${BRAND.line}`,
                paddingBottom: 14,
                marginBottom: 24,
              }}
            >
              <div style={{flex: '1 1 auto', minWidth: 0}}>
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 12,
                    letterSpacing: 3,
                    color: section.accent,
                    textTransform: 'uppercase',
                    fontWeight: 600,
                    marginBottom: 4,
                  }}
                >
                  {section.kicker}
                </div>
                <h2
                  style={{
                    fontFamily: TEKO,
                    fontSize: 'clamp(28px, 4vw, 40px)',
                    margin: 0,
                    textTransform: 'uppercase',
                    letterSpacing: '-0.01em',
                    fontWeight: 700,
                    lineHeight: 1,
                  }}
                >
                  {section.title}
                </h2>
              </div>
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 18,
                  color: BRAND.gray,
                  letterSpacing: 1,
                }}
              >
                {section.pages.length}{' '}
                {section.pages.length === 1 ? 'page' : 'pages'}
              </div>
            </div>
            <p
              style={{
                color: BRAND.gray,
                marginTop: -8,
                marginBottom: 24,
                fontSize: 15,
                maxWidth: 640,
                lineHeight: 1.5,
              }}
            >
              {section.blurb}
            </p>

            {/* Cards */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 16,
              }}
            >
              {section.pages.map((p) => {
                const badge = accessBadge(p.access);
                return (
                  <a
                    key={p.path}
                    href={p.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'block',
                      background: BRAND.surface,
                      border: `1px solid ${BRAND.line}`,
                      borderRadius: 14,
                      padding: '20px 20px 18px',
                      textDecoration: 'none',
                      color: BRAND.white,
                      transition: 'all 0.2s ease',
                      position: 'relative',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = section.accent;
                      e.currentTarget.style.transform = 'translateY(-2px)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = BRAND.line;
                      e.currentTarget.style.transform = 'translateY(0)';
                    }}
                  >
                    {/* Top row: path chip + access badge */}
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 8,
                        marginBottom: 10,
                      }}
                    >
                      <code
                        style={{
                          background: BRAND.chip,
                          color: BRAND.gray,
                          padding: '4px 8px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontFamily:
                            'ui-monospace, SFMono-Regular, Menlo, monospace',
                          letterSpacing: 0,
                        }}
                      >
                        {p.path}
                      </code>
                      {badge && (
                        <span
                          style={{
                            background: badge.bg,
                            color: badge.fg,
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 10,
                            fontFamily: TEKO,
                            letterSpacing: 1.5,
                            textTransform: 'uppercase',
                            fontWeight: 600,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>

                    <h3
                      style={{
                        fontFamily: TEKO,
                        fontSize: 26,
                        margin: '0 0 8px',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.01em',
                        fontWeight: 700,
                        lineHeight: 1.05,
                      }}
                    >
                      {p.name}
                    </h3>

                    <p
                      style={{
                        color: BRAND.gray,
                        fontSize: 14,
                        lineHeight: 1.5,
                        margin: '0 0 14px',
                      }}
                    >
                      {p.description}
                    </p>

                    {p.audience && (
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 13,
                          letterSpacing: 2,
                          color: section.accent,
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          marginBottom: 10,
                        }}
                      >
                        For: {p.audience}
                      </div>
                    )}

                    <div
                      style={{
                        fontFamily: TEKO,
                        fontSize: 15,
                        color: BRAND.white,
                        letterSpacing: 1.5,
                        textTransform: 'uppercase',
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      Open in new tab ↗
                    </div>
                  </a>
                );
              })}
            </div>
          </section>
        ))}

        {/* Footer */}
        <footer
          style={{
            marginTop: 40,
            borderTop: `1px solid ${BRAND.line}`,
            paddingTop: 28,
            textAlign: 'center',
            color: BRAND.gray,
            fontSize: 13,
            lineHeight: 1.6,
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 20,
              color: BRAND.white,
              letterSpacing: 2,
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Spark Greatness™
          </div>
          <div>
            Missing a page? Page renamed? Ping Reid — this directory is the
            single source of truth for where everything lives.
          </div>
          <div style={{marginTop: 14}}>
            <Link
              to="/"
              style={{
                color: BRAND.gold,
                fontFamily: TEKO,
                letterSpacing: 2,
                textTransform: 'uppercase',
                fontWeight: 600,
                textDecoration: 'none',
              }}
            >
              ← Back to Home
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}
