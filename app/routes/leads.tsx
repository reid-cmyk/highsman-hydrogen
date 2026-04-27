/**
 * leads.tsx — highsman.com/leads
 *
 * Public Lead Referral page. Anyone with the link can drop a referral.
 * Submission flows through api.lead-referral.tsx → Zoho Lead tagged "Hot Lead",
 * unclaimed (Working_Owner = null), surfaces in both:
 *   • New Business dashboard (filters Tag = "Hot Lead")
 *   • Sales Floor /sales-floor Leads tab (filters Lead_Status = "Hot")
 *
 * First rep to click Claim wins it.
 *
 * Brand:
 *   • Space Black #000, Quarter Gray #A9ACAF, White, Highsman Red accent
 *   • Headlines in Teko Bold, body in Barlow Semi Condensed
 *   • Real logo image (per feedback_highsman_logo_usage.md — never typeset)
 *
 * Klaviyo popup is suppressed on this page (data-no-klaviyo body attr — same
 * pattern as /staff-dashboard, /sales-floor, /vibes per
 * feedback_klaviyo_popup_suppression.md). It's a transactional referral form,
 * not a consumer shopping page.
 *
 * Place in Hydrogen as: app/routes/leads.tsx
 */

import type {MetaFunction} from '@shopify/remix-oxygen';
import {useEffect, useRef, useState} from 'react';

export const meta: MetaFunction = () => [
  {title: 'HIGHSMAN | Refer a Dispensary'},
  {
    name: 'description',
    content:
      "Know a buyer who deserves Highsman on their shelf? Drop them in. We'll take it from there.",
  },
  // No-index — referral page, not a marketing landing.
  {name: 'robots', content: 'noindex, nofollow'},
];

const STATES = [
  {code: '', label: 'Select state…'},
  {code: 'NJ', label: 'New Jersey'},
  {code: 'MA', label: 'Massachusetts'},
  {code: 'NY', label: 'New York'},
  {code: 'RI', label: 'Rhode Island'},
  {code: 'MO', label: 'Missouri'},
  {code: 'OTHER', label: 'Other'},
];

const RELATIONSHIPS = [
  '',
  'I work there',
  "I'm a customer",
  'Friend',
  'Family',
  'Industry contact',
  'Other',
];

// Logo — real image file per feedback_highsman_logo_usage.md.
// Hosted on Shopify CDN (same source as transactional emails).
const LOGO_WHITE =
  'https://cdn.shopify.com/s/files/1/0729/3787/8403/files/Highsman_Logo_White.png';

export default function LeadsPage() {
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    leadName: string;
    dispensary: string;
  } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Suppress Klaviyo popup on this page.
  useEffect(() => {
    document.body.setAttribute('data-no-klaviyo', 'true');
    return () => document.body.removeAttribute('data-no-klaviyo');
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrorMsg(null);
    setSubmitting(true);

    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch('/api/lead-referral', {method: 'POST', body: fd});
      const j = (await res.json()) as any;
      if (!j?.ok) {
        setErrorMsg(j?.error || 'Something went wrong. Try again.');
        setSubmitting(false);
        return;
      }
      setSuccess({leadName: j.lead_name, dispensary: j.dispensary});
    } catch (err) {
      setErrorMsg('Network hiccup. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <div style={styles.page}>
      <style dangerouslySetInnerHTML={{__html: globalCss}} />

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header style={styles.header}>
        <a href="/" style={styles.logoLink} aria-label="Highsman home">
          <img src={LOGO_WHITE} alt="Highsman" style={styles.logo} />
        </a>
      </header>

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section style={styles.hero}>
        <div style={styles.heroInner}>
          <div style={styles.eyebrow}>SCOUTING REPORT</div>
          <h1 style={styles.h1}>
            REFER A DISPENSARY.<br />
            <span style={styles.h1Accent}>WE'LL TAKE IT FROM HERE.</span>
          </h1>
          <p style={styles.heroLede}>
            Know a buyer who deserves Highsman on their shelf? Drop them in
            below. Our reps see it instantly — first one in calls them today.
          </p>
          <div style={styles.heroBadges}>
            <span style={styles.badge}>HOT LEAD ROUTING</span>
            <span style={styles.badgeDot}>•</span>
            <span style={styles.badge}>NJ · MA · NY · RI · MO</span>
            <span style={styles.badgeDot}>•</span>
            <span style={styles.badge}>2-MIN FORM</span>
          </div>
        </div>
      </section>

      {/* ── FORM ────────────────────────────────────────────────────────── */}
      <main style={styles.formWrap}>
        {success ? (
          <SuccessPanel name={success.leadName} dispensary={success.dispensary} />
        ) : (
          <form
            ref={formRef}
            onSubmit={handleSubmit}
            style={styles.form}
            noValidate
          >
            <div style={styles.formHeader}>
              <h2 style={styles.h2}>WHO ARE WE TALKING TO?</h2>
              <p style={styles.formSub}>
                Required marked with <span style={styles.req}>*</span>
              </p>
            </div>

            {/* Honeypot — bots fill, humans don't see */}
            <div style={styles.honeypot} aria-hidden="true">
              <label>
                Company website
                <input
                  type="text"
                  name="company_website"
                  tabIndex={-1}
                  autoComplete="off"
                />
              </label>
            </div>

            <Field
              label="Lead's full name"
              name="lead_name"
              required
              placeholder="Jordan Carter"
              autoComplete="off"
            />

            <div style={styles.row2}>
              <Field
                label="Lead's cell"
                name="lead_cell"
                type="tel"
                placeholder="555-867-5309"
                autoComplete="off"
              />
              <Field
                label="Lead's email"
                name="lead_email"
                type="email"
                placeholder="jordan@dispensary.com"
                autoComplete="off"
              />
            </div>
            <p style={styles.hint}>One of cell or email is required — both is better.</p>

            <Field
              label="Dispensary name"
              name="dispensary_name"
              required
              placeholder="Garden State Cannabis Co."
              autoComplete="off"
            />

            <div style={styles.row2}>
              <SelectField
                label="State"
                name="dispensary_state"
                options={STATES}
                required
              />
              <SelectField
                label="How do you know them?"
                name="relationship"
                options={RELATIONSHIPS.map((r) => ({
                  code: r,
                  label: r || 'Select…',
                }))}
              />
            </div>

            <TextareaField
              label="Notes — anything we should know"
              name="notes"
              placeholder="They mentioned wanting craft pre-rolls. Already carries one of our competitors. Best to call after 2pm."
              rows={4}
            />

            <div style={styles.divider} />

            <div style={styles.formHeader}>
              <h2 style={styles.h2}>AND YOU ARE…?</h2>
              <p style={styles.formSub}>
                So we can credit the assist when they sign on.
              </p>
            </div>

            <div style={styles.row2}>
              <Field
                label="Your name"
                name="submitter_name"
                required
                placeholder="Sky Anderson"
                autoComplete="name"
              />
              <Field
                label="Your email (optional)"
                name="submitter_email"
                type="email"
                placeholder="you@email.com"
                autoComplete="email"
              />
            </div>

            {errorMsg ? <div style={styles.error}>{errorMsg}</div> : null}

            <button type="submit" disabled={submitting} style={styles.submit}>
              {submitting ? 'SENDING…' : 'SEND THE LEAD →'}
            </button>

            <p style={styles.legal}>
              By submitting you confirm this person agreed to be contacted, or
              that you have a reasonable business reason to refer them.
              Highsman doesn't sell or share contact info.
            </p>
          </form>
        )}
      </main>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      {!success && (
        <section style={styles.how}>
          <h2 style={styles.howTitle}>WHAT HAPPENS NEXT</h2>
          <ol style={styles.steps}>
            <li style={styles.step}>
              <div style={styles.stepNum}>01</div>
              <div>
                <div style={styles.stepHead}>LEAD HITS THE FLOOR</div>
                <p style={styles.stepBody}>
                  The moment you submit, the lead drops into our Sales Floor +
                  New Business dashboards — tagged Hot. Every rep sees it live.
                </p>
              </div>
            </li>
            <li style={styles.step}>
              <div style={styles.stepNum}>02</div>
              <div>
                <div style={styles.stepHead}>FIRST REP CLAIMS IT</div>
                <p style={styles.stepBody}>
                  Whichever rep grabs it first owns the relationship. They'll
                  call within hours, not days. Hot leads don't sit.
                </p>
              </div>
            </li>
            <li style={styles.step}>
              <div style={styles.stepNum}>03</div>
              <div>
                <div style={styles.stepHead}>YOU GET THE CREDIT</div>
                <p style={styles.stepBody}>
                  When they sign on, your name is on the assist. We don't
                  forget who put us on.
                </p>
              </div>
            </li>
          </ol>
        </section>
      )}

      <footer style={styles.footer}>
        <img src={LOGO_WHITE} alt="Highsman" style={styles.footerLogo} />
        <div style={styles.tagline}>SPARK GREATNESS™</div>
        <div style={styles.footerLine}>
          Founded by Ricky Williams. Built for the floor.
        </div>
      </footer>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function Field(props: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  required?: boolean;
  autoComplete?: string;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>
        {props.label}
        {props.required ? <span style={styles.req}> *</span> : null}
      </span>
      <input
        name={props.name}
        type={props.type ?? 'text'}
        placeholder={props.placeholder}
        required={props.required}
        autoComplete={props.autoComplete ?? 'off'}
        style={styles.input}
      />
    </label>
  );
}

function SelectField(props: {
  label: string;
  name: string;
  options: {code: string; label: string}[];
  required?: boolean;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>
        {props.label}
        {props.required ? <span style={styles.req}> *</span> : null}
      </span>
      <select
        name={props.name}
        required={props.required}
        style={styles.input}
        defaultValue=""
      >
        {props.options.map((o) => (
          <option key={o.code} value={o.code}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function TextareaField(props: {
  label: string;
  name: string;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label style={styles.fieldLabel}>
      <span style={styles.fieldLabelText}>{props.label}</span>
      <textarea
        name={props.name}
        rows={props.rows ?? 3}
        placeholder={props.placeholder}
        style={{...styles.input, resize: 'vertical', minHeight: 100}}
      />
    </label>
  );
}

function SuccessPanel({name, dispensary}: {name: string; dispensary: string}) {
  return (
    <div style={styles.success}>
      <div style={styles.successFlame}>🔥</div>
      <h2 style={styles.successHead}>LEAD IS IN.</h2>
      <p style={styles.successBody}>
        <strong>{name}</strong> at <strong>{dispensary}</strong> just dropped
        into the Sales Floor as a Hot Lead. A rep will be on the phone today.
      </p>
      <p style={styles.successBody}>Thanks for the assist. We don't forget.</p>
      <a href="/leads" style={styles.successCta}>
        REFER ANOTHER →
      </a>
    </div>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const SPACE_BLACK = '#000000';
const QUARTER_GRAY = '#A9ACAF';
const HIGHSMAN_RED = '#C8102E';
const WHITE = '#FFFFFF';
const NIGHT = '#0a0a0a';
const CARD = '#111111';
const LINE = '#1f1f1f';

const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Teko:wght@500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap');
  body[data-no-klaviyo] [class*="klaviyo-form-"],
  body[data-no-klaviyo] [class*="needsclick"][class*="kl-private"] {
    display: none !important;
  }
  html, body { background: ${SPACE_BLACK}; }
  *::placeholder { color: #5a5d61; }
  select option { background: ${CARD}; color: ${WHITE}; }
  input:focus, select:focus, textarea:focus {
    outline: 2px solid ${HIGHSMAN_RED};
    outline-offset: 2px;
  }
  button:hover:not(:disabled) {
    background: ${HIGHSMAN_RED} !important;
    transform: translateY(-1px);
  }
  @media (max-width: 720px) {
    .row2 { grid-template-columns: 1fr !important; }
    h1 { font-size: 56px !important; line-height: 0.95 !important; }
  }
`;

const styles: Record<string, React.CSSProperties> = {
  page: {
    background: SPACE_BLACK,
    color: WHITE,
    minHeight: '100vh',
    fontFamily: '"Barlow Semi Condensed", system-ui, sans-serif',
  },
  header: {
    padding: '20px 24px',
    borderBottom: `1px solid ${LINE}`,
  },
  logoLink: {display: 'inline-block'},
  logo: {height: 36, width: 'auto', display: 'block'},
  hero: {
    padding: '64px 24px 48px',
    background: `radial-gradient(circle at 30% 20%, rgba(200,16,46,0.12), transparent 60%), ${SPACE_BLACK}`,
    borderBottom: `1px solid ${LINE}`,
  },
  heroInner: {maxWidth: 880, margin: '0 auto'},
  eyebrow: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 18,
    letterSpacing: '0.3em',
    color: HIGHSMAN_RED,
    marginBottom: 12,
    fontWeight: 600,
  },
  h1: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 96,
    lineHeight: 0.92,
    letterSpacing: '0.01em',
    margin: 0,
    fontWeight: 700,
    textTransform: 'uppercase',
  },
  h1Accent: {color: QUARTER_GRAY},
  heroLede: {
    fontSize: 20,
    lineHeight: 1.45,
    color: '#d6d8da',
    marginTop: 24,
    maxWidth: 640,
  },
  heroBadges: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 28,
    alignItems: 'center',
  },
  badge: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 16,
    letterSpacing: '0.18em',
    color: QUARTER_GRAY,
    textTransform: 'uppercase',
    fontWeight: 600,
  },
  badgeDot: {color: '#3a3d40'},

  formWrap: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '56px 24px',
  },
  form: {
    background: CARD,
    border: `1px solid ${LINE}`,
    borderRadius: 14,
    padding: '36px 32px',
  },
  formHeader: {marginBottom: 24},
  h2: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 38,
    letterSpacing: '0.02em',
    margin: 0,
    fontWeight: 700,
    textTransform: 'uppercase',
    color: WHITE,
  },
  formSub: {
    color: QUARTER_GRAY,
    fontSize: 14,
    marginTop: 4,
    marginBottom: 0,
  },
  req: {color: HIGHSMAN_RED, fontWeight: 700},

  honeypot: {
    position: 'absolute',
    left: '-10000px',
    width: 1,
    height: 1,
    overflow: 'hidden',
  },

  fieldLabel: {
    display: 'block',
    marginBottom: 18,
  },
  fieldLabelText: {
    display: 'block',
    fontFamily: 'Teko, sans-serif',
    fontSize: 18,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    color: QUARTER_GRAY,
    marginBottom: 8,
    fontWeight: 600,
  },
  input: {
    width: '100%',
    background: NIGHT,
    border: `1px solid ${LINE}`,
    borderRadius: 8,
    padding: '14px 16px',
    color: WHITE,
    fontSize: 16,
    fontFamily: '"Barlow Semi Condensed", system-ui, sans-serif',
    boxSizing: 'border-box',
  },
  row2: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 16,
  },
  hint: {
    color: QUARTER_GRAY,
    fontSize: 13,
    margin: '-8px 0 18px',
    fontStyle: 'italic',
  },
  divider: {
    height: 1,
    background: LINE,
    margin: '12px 0 24px',
  },

  error: {
    background: 'rgba(200,16,46,0.12)',
    border: `1px solid ${HIGHSMAN_RED}`,
    color: '#ffb1b8',
    padding: '12px 14px',
    borderRadius: 8,
    fontSize: 14,
    marginBottom: 16,
  },

  submit: {
    width: '100%',
    background: WHITE,
    color: SPACE_BLACK,
    fontFamily: 'Teko, sans-serif',
    fontSize: 28,
    letterSpacing: '0.08em',
    fontWeight: 700,
    padding: '18px 24px',
    border: 'none',
    borderRadius: 8,
    cursor: 'pointer',
    textTransform: 'uppercase',
    transition: 'all 0.15s ease',
  },
  legal: {
    color: '#6c6f72',
    fontSize: 12,
    marginTop: 16,
    lineHeight: 1.5,
  },

  // SUCCESS
  success: {
    background: CARD,
    border: `1px solid ${HIGHSMAN_RED}`,
    borderRadius: 14,
    padding: '48px 32px',
    textAlign: 'center',
  },
  successFlame: {fontSize: 56, marginBottom: 12},
  successHead: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 64,
    margin: 0,
    fontWeight: 700,
    color: WHITE,
    textTransform: 'uppercase',
  },
  successBody: {
    color: '#d6d8da',
    fontSize: 18,
    lineHeight: 1.5,
    marginTop: 16,
  },
  successCta: {
    display: 'inline-block',
    marginTop: 28,
    background: WHITE,
    color: SPACE_BLACK,
    padding: '14px 28px',
    fontFamily: 'Teko, sans-serif',
    fontSize: 22,
    letterSpacing: '0.08em',
    fontWeight: 700,
    textDecoration: 'none',
    borderRadius: 8,
  },

  // HOW IT WORKS
  how: {
    maxWidth: 880,
    margin: '0 auto',
    padding: '24px 24px 80px',
  },
  howTitle: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 42,
    letterSpacing: '0.04em',
    fontWeight: 700,
    textAlign: 'center',
    margin: '0 0 32px',
    textTransform: 'uppercase',
  },
  steps: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
    gap: 20,
  },
  step: {
    background: CARD,
    border: `1px solid ${LINE}`,
    borderRadius: 12,
    padding: '24px 22px',
  },
  stepNum: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 36,
    color: HIGHSMAN_RED,
    fontWeight: 700,
    marginBottom: 6,
    letterSpacing: '0.04em',
  },
  stepHead: {
    fontFamily: 'Teko, sans-serif',
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stepBody: {
    color: QUARTER_GRAY,
    fontSize: 15,
    lineHeight: 1.5,
    margin: 0,
  },

  footer: {
    borderTop: `1px solid ${LINE}`,
    padding: '36px 24px',
    textAlign: 'center',
  },
  footerLogo: {height: 32, marginBottom: 14},
  tagline: {
    fontFamily: 'Teko, sans-serif',
    letterSpacing: '0.3em',
    fontSize: 14,
    color: QUARTER_GRAY,
    marginBottom: 8,
    fontWeight: 600,
  },
  footerLine: {color: '#5a5d61', fontSize: 12},
};
