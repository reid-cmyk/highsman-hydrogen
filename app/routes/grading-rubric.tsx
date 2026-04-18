import {useEffect, useMemo, useState} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /grading-rubric — Spark Team grading one-pager (staff only, noindex)
// ─────────────────────────────────────────────────────────────────────────────
// Explains exactly how every shift report scores out of 100 and gets an A–F.
// Mirrors the gradeShift() function in /api/shift-report-submit.tsx so reps
// can see their grade math up front. Bottom of the page has a live scorer
// that runs the same formula client-side.
//
// The rubric stored on each row at insert-time is frozen — changing this page
// does not retroactively re-grade old shifts (by design).
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'How You Get Graded · Spark Team · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'Highsman Spark Team grading rubric — how close rate, volume, aggression, job completion, and retail intel combine into your letter grade.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS (matches /ops)
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
// RUBRIC CONSTANTS — single source of truth, matched 1:1 to gradeShift()
// ─────────────────────────────────────────────────────────────────────────────
const COMPONENTS = [
  {
    key: 'close',
    kicker: 'Pt 1',
    label: 'Close Rate',
    weight: 35,
    accent: BRAND.gold,
    oneLiner: 'Closes divided by intercepts. 50% or higher caps the line.',
    detail:
      'This is the lift. We measure the one thing a rep can fully own — how many conversations you turned into a bag. 0% earns nothing. 50% earns the full 35. Anything between scales straight-line.',
    thresholds: [
      {range: '50% +', pts: '35 / 35', note: 'Max lift. Flame territory.'},
      {range: '35%', pts: '24.5', note: 'Strong shift.'},
      {range: '20%', pts: '14', note: 'On pace — push it.'},
      {range: '10%', pts: '7', note: 'Low. Dial the pitch.'},
      {range: '0%', pts: '0', note: 'Flat. Reset before next shift.'},
    ],
    howToMove:
      'Run the approved 30-second pitch. Open with the tagline, land on product tier + format, go to an assumptive close. Every rep on this roster has moved from 15% → 30% inside a month by running the script clean.',
  },
  {
    key: 'volume',
    kicker: 'Pt 2',
    label: 'Volume',
    weight: 20,
    accent: BRAND.orange,
    oneLiner: 'Total closes on the shift. 20 closes is the ceiling.',
    detail:
      'Close rate without volume is theory. Volume without close rate is churn. We score the raw number of bags you moved so traffic-heavy shifts don\u2019t get penalized for a diluted rate. 20 closes on the shift = full 20.',
    thresholds: [
      {range: '20 +', pts: '20 / 20', note: 'Full throttle.'},
      {range: '15', pts: '15', note: 'Solid shift.'},
      {range: '10', pts: '10', note: 'Respectable — can we get 5 more?'},
      {range: '5', pts: '5', note: 'Slow day or slow pitch.'},
      {range: '0', pts: '0', note: 'Something broke — log the why.'},
    ],
    howToMove:
      'Own the first hour. Most reps get half their closes in the first 90 minutes because the budtender is fresh and the floor has energy. Lock that window and the rest of the shift runs downhill.',
  },
  {
    key: 'aggression',
    kicker: 'Pt 3',
    label: 'Aggression',
    weight: 15,
    accent: BRAND.red,
    oneLiner: 'Self-reported flame rating. 1–10. 10 is full tilt.',
    detail:
      'We trust you to call your own game. Aggression is how hard you actually pushed — intercepting strangers, re-engaging after a no, closing into silence. A 10 does not mean you were rude. It means you left nothing on the table.',
    thresholds: [
      {range: '10', pts: '15 / 15', note: 'Dialed. Every chance taken.'},
      {range: '8', pts: '12', note: 'High gear, one or two misses.'},
      {range: '6', pts: '9', note: 'Coasted on traffic.'},
      {range: '4', pts: '6', note: 'Soft. Name it in notes.'},
      {range: '1', pts: '1.5', note: 'Flat. What happened?'},
    ],
    howToMove:
      'Aggression is a tempo decision, not a personality. If you walk in knowing the pitch cold and the first intercept lands in under 90 seconds, you\u2019re already at 8. Everything after that is just staying in the pocket.',
  },
  {
    key: 'job',
    kicker: 'Pt 4',
    label: 'Job Complete',
    weight: 15,
    accent: BRAND.green,
    oneLiner: 'You filed the report + required photo. Full 15.',
    detail:
      'If your report lands in the system with the setup photo attached, you already earned this line. It is the only part of the grade not tied to performance — it is tied to finishing the job. Don\u2019t give this away.',
    thresholds: [
      {range: 'Filed', pts: '15 / 15', note: 'Take it. Move on.'},
      {range: 'Missing', pts: '0', note: 'No row = no grade.'},
    ],
    howToMove:
      'Submit before you leave the parking lot. Every report filed later than that night gets less accurate (stats drift, manager names blur, merch details fade). Same-shift filing keeps the rest of your grade clean.',
  },
  {
    key: 'intel',
    kicker: 'Pt 5',
    label: 'Retail Intel',
    weight: 15,
    accent: BRAND.white,
    oneLiner: 'Count of the 7 intel fields filled. 7 of 7 = full 15.',
    detail:
      'Every field you fill here becomes leverage next shift — for you and the next rep through the door. Menu placement, merch setup, who\u2019s behind the counter. The more complete the intel, the higher the score. 7 of 7 hits the ceiling.',
    thresholds: [
      {range: '7 / 7', pts: '15 / 15', note: 'Full scout report.'},
      {range: '5 / 7', pts: '\u224811', note: 'Mostly there.'},
      {range: '3 / 7', pts: '\u22486.5', note: 'Thin. Push for more next time.'},
      {range: '0 / 7', pts: '0', note: 'No intel logged.'},
    ],
    howToMove:
      'Write notes as you go — not at the end. A 30-second voice memo on the drive home turns into two full fields. The 7 are listed below.',
  },
] as const;

const INTEL_FIELDS = [
  'Menu visibility (how we show up on the digital menu)',
  'Merch setup (current placement on shelf / case)',
  'Merch opportunity (10+ char note on what\u2019s possible)',
  'Promos setup (any in-store promo running)',
  'Manager on duty (first or last name)',
  'Budtender rating (1\u201310)',
  'Product notes (10+ char note on questions, objections, intel)',
];

const LETTER_CUTS = [
  {letter: 'A', min: 90, color: BRAND.green, copy: 'Flame. Carry it into next shift.'},
  {letter: 'B', min: 80, color: BRAND.gold, copy: 'Strong. One component from an A.'},
  {letter: 'C', min: 70, color: BRAND.gold, copy: 'On pace. Pick the weakest line and move it.'},
  {letter: 'D', min: 60, color: BRAND.orange, copy: 'Under the bar. Name the fix before the next shift.'},
  {letter: 'F', min: 0, color: BRAND.red, copy: 'Reset. Pull up the 30-second pitch and run it clean.'},
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PAGE
// ─────────────────────────────────────────────────────────────────────────────
export default function GradingRubric() {
  // Klaviyo suppression + font load — match /ops.
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
    if (document.getElementById('hs-grading-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hs-grading-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

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
            Grading Rubric
          </div>
        </div>
        <Link
          to="/ops"
          style={{
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: BRAND.white,
            textDecoration: 'none',
            border: `1px solid ${BRAND.lineStrong}`,
            padding: '8px 12px',
          }}
        >
          ← Ops
        </Link>
      </div>

      <main style={{maxWidth: 760, margin: '0 auto', padding: '28px 16px 20px'}}>
        {/* ── Hero ─────────────────────────────────────────────────── */}
        <section style={{marginBottom: 28}}>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: BRAND.gold,
              marginBottom: 10,
            }}
          >
            Spark Team Playbook
          </div>
          <h1
            style={{
              fontFamily: TEKO,
              fontSize: 56,
              lineHeight: 0.95,
              letterSpacing: '0.01em',
              textTransform: 'uppercase',
              color: BRAND.white,
              margin: 0,
            }}
          >
            How Your <span style={{color: BRAND.gold}}>Grade</span> Gets Built
          </h1>
          <p
            style={{
              fontFamily: BODY,
              fontSize: 16,
              lineHeight: 1.5,
              color: BRAND.gray,
              marginTop: 14,
              maxWidth: 620,
            }}
          >
            Every shift report scores out of 100 across five lines. The math is the
            math — your grade is frozen the minute you submit, so rubric changes
            never re-write your history. This is the full picture. Learn the lines,
            win the shift.
          </p>
        </section>

        {/* ── Top-line weight strip ─────────────────────────────────── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 6,
            marginBottom: 28,
          }}
        >
          {COMPONENTS.map((c) => (
            <div
              key={c.key}
              style={{
                background: BRAND.surface,
                border: `1px solid ${BRAND.line}`,
                padding: '14px 10px',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 11,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  color: c.accent,
                  marginBottom: 4,
                }}
              >
                {c.label}
              </div>
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 28,
                  color: BRAND.white,
                  lineHeight: 1,
                }}
              >
                {c.weight}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: BRAND.gray,
                  marginTop: 2,
                  letterSpacing: '0.08em',
                }}
              >
                pts
              </div>
            </div>
          ))}
        </section>

        {/* ── The five lines ───────────────────────────────────────── */}
        {COMPONENTS.map((c) => (
          <ComponentBlock key={c.key} component={c} />
        ))}

        {/* ── Intel fields ─────────────────────────────────────────── */}
        <section
          style={{
            marginTop: 28,
            background: BRAND.surface,
            border: `1px solid ${BRAND.line}`,
            padding: '22px 20px',
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: BRAND.white,
              marginBottom: 6,
            }}
          >
            The 7 intel fields
          </div>
          <h3
            style={{
              fontFamily: TEKO,
              fontSize: 24,
              textTransform: 'uppercase',
              color: BRAND.white,
              margin: '0 0 14px',
              letterSpacing: '0.02em',
            }}
          >
            Fill all 7, bank the full 15.
          </h3>
          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'grid',
              gridTemplateColumns: '1fr',
              gap: 8,
            }}
          >
            {INTEL_FIELDS.map((f, i) => (
              <li
                key={f}
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: 'flex-start',
                  padding: '10px 12px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  fontSize: 14,
                  color: BRAND.white,
                }}
              >
                <span
                  style={{
                    fontFamily: TEKO,
                    fontSize: 18,
                    color: BRAND.gold,
                    width: 24,
                    flexShrink: 0,
                  }}
                >
                  {i + 1}
                </span>
                <span style={{fontFamily: BODY, lineHeight: 1.4}}>{f}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Letter grade cutoffs ─────────────────────────────────── */}
        <section style={{marginTop: 28}}>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 12,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: BRAND.gold,
              marginBottom: 6,
            }}
          >
            Score → Letter
          </div>
          <h3
            style={{
              fontFamily: TEKO,
              fontSize: 32,
              textTransform: 'uppercase',
              color: BRAND.white,
              margin: '0 0 16px',
              letterSpacing: '0.02em',
            }}
          >
            Where the lines fall.
          </h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, 1fr)',
              gap: 6,
            }}
          >
            {LETTER_CUTS.map((l) => (
              <div
                key={l.letter}
                style={{
                  background: BRAND.surface,
                  border: `1px solid ${l.color}`,
                  padding: '16px 10px',
                  textAlign: 'center',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 56,
                    color: l.color,
                    lineHeight: 1,
                  }}
                >
                  {l.letter}
                </div>
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 14,
                    color: BRAND.white,
                    letterSpacing: '0.1em',
                    marginTop: 4,
                  }}
                >
                  {l.min}
                  {l.letter === 'F' ? '' : '+'}
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6}}>
            {LETTER_CUTS.map((l) => (
              <div
                key={l.letter}
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '8px 10px',
                  borderBottom: `1px solid ${BRAND.line}`,
                }}
              >
                <span
                  style={{
                    fontFamily: TEKO,
                    fontSize: 20,
                    color: l.color,
                    width: 28,
                  }}
                >
                  {l.letter}
                </span>
                <span style={{fontSize: 13, color: BRAND.white, flex: 1}}>
                  {l.copy}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Live scorer ──────────────────────────────────────────── */}
        <Scorer />

        {/* ── CTA bar ──────────────────────────────────────────────── */}
        <section
          style={{
            marginTop: 28,
            padding: '24px 20px',
            background: BRAND.surface,
            border: `1px solid ${BRAND.gold}`,
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: BRAND.gold,
              marginBottom: 6,
            }}
          >
            Spark Greatness
          </div>
          <h3
            style={{
              fontFamily: TEKO,
              fontSize: 30,
              textTransform: 'uppercase',
              color: BRAND.white,
              margin: '0 0 14px',
              letterSpacing: '0.02em',
            }}
          >
            Run the shift. File the report. Earn the A.
          </h3>
          <div style={{display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap'}}>
            <Link
              to="/shift-report"
              style={{
                background: BRAND.gold,
                color: BRAND.black,
                fontFamily: TEKO,
                fontSize: 15,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '12px 18px',
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
              }}
            >
              File a Report
            </Link>
            <Link
              to="/ops"
              style={{
                background: 'transparent',
                color: BRAND.gold,
                fontFamily: TEKO,
                fontSize: 15,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                padding: '12px 18px',
                textDecoration: 'none',
                border: `1px solid ${BRAND.gold}`,
              }}
            >
              See Scoreboard →
            </Link>
          </div>
        </section>

        <div
          style={{
            padding: '22px 4px 8px',
            fontFamily: BODY,
            fontSize: 12,
            color: BRAND.gray,
            textAlign: 'center',
            letterSpacing: '0.04em',
          }}
        >
          Staff tool · Rubric locked at submit · Updated 2026-04-17
        </div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT BLOCK
// ─────────────────────────────────────────────────────────────────────────────
function ComponentBlock({component: c}: {component: (typeof COMPONENTS)[number]}) {
  return (
    <section
      style={{
        marginBottom: 18,
        background: BRAND.surface,
        border: `1px solid ${BRAND.line}`,
      }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 14,
          padding: '18px 20px 10px',
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 12,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: c.accent,
              marginBottom: 4,
            }}
          >
            {c.kicker} · {c.weight}% of grade
          </div>
          <h2
            style={{
              fontFamily: TEKO,
              fontSize: 36,
              lineHeight: 1,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              margin: 0,
              color: BRAND.white,
            }}
          >
            {c.label}
          </h2>
          <div
            style={{
              fontFamily: BODY,
              fontSize: 14,
              color: BRAND.gray,
              marginTop: 6,
              lineHeight: 1.4,
            }}
          >
            {c.oneLiner}
          </div>
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 44,
            color: c.accent,
            lineHeight: 1,
            flexShrink: 0,
          }}
        >
          {c.weight}
          <span style={{fontSize: 16, color: BRAND.gray, marginLeft: 2}}>pts</span>
        </div>
      </header>

      <div style={{padding: '16px 20px 20px'}}>
        <p
          style={{
            fontFamily: BODY,
            fontSize: 15,
            lineHeight: 1.5,
            color: BRAND.white,
            margin: '0 0 14px',
          }}
        >
          {c.detail}
        </p>

        <div
          style={{
            border: `1px solid ${BRAND.line}`,
            marginBottom: 14,
          }}
        >
          {c.thresholds.map((t, i) => (
            <div
              key={t.range}
              style={{
                display: 'grid',
                gridTemplateColumns: '100px 90px 1fr',
                gap: 10,
                padding: '10px 12px',
                borderBottom:
                  i === c.thresholds.length - 1
                    ? 'none'
                    : `1px solid ${BRAND.line}`,
                alignItems: 'center',
              }}
            >
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 18,
                  color: BRAND.white,
                  letterSpacing: '0.04em',
                }}
              >
                {t.range}
              </div>
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 16,
                  color: c.accent,
                  letterSpacing: '0.04em',
                }}
              >
                {t.pts}
              </div>
              <div style={{fontSize: 13, color: BRAND.gray}}>{t.note}</div>
            </div>
          ))}
        </div>

        <div
          style={{
            background: BRAND.chip,
            border: `1px dashed ${BRAND.lineStrong}`,
            padding: '12px 14px',
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: c.accent,
              marginBottom: 4,
            }}
          >
            How to Move Up
          </div>
          <div style={{fontFamily: BODY, fontSize: 14, color: BRAND.white, lineHeight: 1.5}}>
            {c.howToMove}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE SCORER — mirrors gradeShift() from /api/shift-report-submit.tsx
// ─────────────────────────────────────────────────────────────────────────────
function Scorer() {
  const [intercepts, setIntercepts] = useState(30);
  const [closes, setCloses] = useState(9);
  const [aggression, setAggression] = useState(8);
  const [intel, setIntel] = useState(6);

  const result = useMemo(() => {
    const closeRate = intercepts > 0 ? closes / intercepts : 0;
    const closeScore = Math.min(closeRate / 0.5, 1) * 35;
    const volScore = Math.min(closes / 20, 1) * 20;
    const aggScore = (aggression / 10) * 15;
    const jobScore = 15;
    const intelScore = Math.min(intel / 7, 1) * 15;
    const total = closeScore + volScore + aggScore + jobScore + intelScore;
    const letter =
      total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';
    return {
      closeRate,
      closeScore,
      volScore,
      aggScore,
      jobScore,
      intelScore,
      total: Math.round(total),
      letter,
    };
  }, [intercepts, closes, aggression, intel]);

  const letterColor =
    result.letter === 'A'
      ? BRAND.green
      : result.letter === 'B'
        ? BRAND.gold
        : result.letter === 'C'
          ? BRAND.gold
          : result.letter === 'D'
            ? BRAND.orange
            : BRAND.red;

  return (
    <section
      style={{
        marginTop: 34,
        background: BRAND.surface,
        border: `1px solid ${BRAND.gold}`,
        padding: '22px 20px 20px',
      }}
    >
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 13,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: BRAND.gold,
          marginBottom: 4,
        }}
      >
        Live Scorer
      </div>
      <h3
        style={{
          fontFamily: TEKO,
          fontSize: 34,
          textTransform: 'uppercase',
          color: BRAND.white,
          margin: '0 0 16px',
          letterSpacing: '0.02em',
        }}
      >
        Plug In Your Numbers.
      </h3>

      <div style={{display: 'grid', gridTemplateColumns: '1fr', gap: 14}}>
        <Slider
          label="Intercepts"
          value={intercepts}
          min={0}
          max={80}
          step={1}
          onChange={setIntercepts}
          suffix=""
        />
        <Slider
          label="Closes"
          value={closes}
          min={0}
          max={Math.max(intercepts, 30)}
          step={1}
          onChange={(v) => setCloses(Math.min(v, intercepts || v))}
          suffix=""
          helper={`Close rate ${Math.round(result.closeRate * 100)}%`}
        />
        <Slider
          label="Aggression"
          value={aggression}
          min={1}
          max={10}
          step={1}
          onChange={setAggression}
          suffix="/ 10"
        />
        <Slider
          label="Intel fields"
          value={intel}
          min={0}
          max={7}
          step={1}
          onChange={setIntel}
          suffix="/ 7"
        />
      </div>

      {/* Score readout */}
      <div
        style={{
          marginTop: 20,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 16,
          alignItems: 'center',
          padding: '18px 16px',
          background: BRAND.black,
          border: `1px solid ${BRAND.lineStrong}`,
        }}
      >
        <div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: BRAND.gray,
            }}
          >
            Total score
          </div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 64,
              color: BRAND.white,
              lineHeight: 1,
              letterSpacing: '0.02em',
            }}
          >
            {result.total}
            <span style={{fontSize: 24, color: BRAND.gray, marginLeft: 6}}>/ 100</span>
          </div>
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 96,
            color: letterColor,
            lineHeight: 1,
            letterSpacing: '0.02em',
          }}
        >
          {result.letter}
        </div>
      </div>

      {/* Per-line breakdown */}
      <div
        style={{
          marginTop: 12,
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 4,
        }}
      >
        {[
          {label: 'Close', pts: result.closeScore, max: 35, color: BRAND.gold},
          {label: 'Vol', pts: result.volScore, max: 20, color: BRAND.orange},
          {label: 'Agg', pts: result.aggScore, max: 15, color: BRAND.red},
          {label: 'Job', pts: result.jobScore, max: 15, color: BRAND.green},
          {label: 'Intel', pts: result.intelScore, max: 15, color: BRAND.white},
        ].map((l) => (
          <div
            key={l.label}
            style={{
              padding: '10px 6px',
              background: BRAND.chip,
              border: `1px solid ${BRAND.line}`,
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 10,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: l.color,
              }}
            >
              {l.label}
            </div>
            <div style={{fontFamily: TEKO, fontSize: 20, color: BRAND.white, lineHeight: 1.2}}>
              {Math.round(l.pts * 10) / 10}
            </div>
            <div style={{fontSize: 10, color: BRAND.gray}}>/ {l.max}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SLIDER
// ─────────────────────────────────────────────────────────────────────────────
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
  helper,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix: string;
  helper?: string;
}) {
  return (
    <label style={{display: 'block'}}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 13,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: BRAND.white,
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 22,
            color: BRAND.gold,
            letterSpacing: '0.04em',
          }}
        >
          {value}
          {suffix && (
            <span style={{fontSize: 13, color: BRAND.gray, marginLeft: 4}}>{suffix}</span>
          )}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{width: '100%', accentColor: BRAND.gold}}
      />
      {helper && (
        <div
          style={{
            fontSize: 11,
            color: BRAND.gray,
            marginTop: 2,
            letterSpacing: '0.06em',
          }}
        >
          {helper}
        </div>
      )}
    </label>
  );
}
