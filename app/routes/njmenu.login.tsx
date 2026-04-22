import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {redirect} from '@shopify/remix-oxygen';
import {useFetcher, useSearchParams} from '@remix-run/react';
import {getBuyerFromRequest} from '../lib/njmenu-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /njmenu/login — Highsman-branded magic link login
// ─────────────────────────────────────────────────────────────────────────────
// Single-field UX:
//   1. Buyer enters email
//   2. Form posts intent=lookup → backend says { exists: true|false }
//   3. exists=true  → posts intent=request-link → success: "Check your email"
//      exists=false → swaps to signup form → posts intent=signup → success state
//
// All Set-Cookie work happens on the magic-link verify (GET /api/njmenu-auth)
// not here — this page never sets a cookie itself.
// ─────────────────────────────────────────────────────────────────────────────

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Sign In | Highsman NJ Wholesale Menu'},
  {description: 'Sign in to the Highsman NJ wholesale menu.'},
  {name: 'robots', content: 'noindex'},
];

const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  goldDark: '#D4C700',
  surface: '#0A0A0A',
  surfaceHigh: '#141414',
  border: 'rgba(169,172,175,0.20)',
  textMuted: 'rgba(255,255,255,0.55)',
  danger: '#FF6B35',
} as const;

const HEADER_LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0683/5469/4729/files/Highsman-Logo-White.png';

// ── Loader: skip the page entirely if already authed ────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const secret = env.SESSION_SECRET;
  if (secret) {
    const session = await getBuyerFromRequest(request, secret);
    if (session) {
      const url = new URL(request.url);
      const returnTo = url.searchParams.get('return') || '/njmenu';
      // Only honour same-origin returns
      const safe = returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/njmenu';
      throw redirect(safe);
    }
  }
  return null;
}

// ── Component ────────────────────────────────────────────────────────────────

type Step = 'email' | 'signup' | 'sent';

export default function NJMenuLogin() {
  const [searchParams] = useSearchParams();
  const returnTo = searchParams.get('return') || '/njmenu';
  const errorParam = searchParams.get('error');

  const lookupFetcher = useFetcher<{ok: boolean; exists?: boolean; degraded?: boolean; error?: string}>();
  const linkFetcher = useFetcher<{ok: boolean; sent?: boolean; needsSignup?: boolean; error?: string}>();
  const signupFetcher = useFetcher<{ok: boolean; sent?: boolean; error?: string}>();

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(
    errorParam === 'expired' ? 'That sign-in link expired. Enter your email to get a new one.' :
    errorParam === 'invalid_link' ? 'That sign-in link is invalid. Enter your email to get a new one.' :
    null,
  );

  // Signup fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [dispensaryName, setDispensaryName] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [role, setRole] = useState('Buyer');

  const busy =
    lookupFetcher.state !== 'idle' ||
    linkFetcher.state !== 'idle' ||
    signupFetcher.state !== 'idle';

  // After lookup completes, decide: send link or show signup form
  useEffect(() => {
    if (lookupFetcher.state !== 'idle' || !lookupFetcher.data) return;
    const data = lookupFetcher.data;
    if (!data.ok) {
      setError(data.error || 'Something went wrong. Try again.');
      return;
    }
    if (data.exists) {
      // Existing buyer → request a magic link straight away
      const fd = new FormData();
      fd.set('intent', 'request-link');
      fd.set('email', email);
      fd.set('return', returnTo);
      linkFetcher.submit(fd, {method: 'post', action: '/api/njmenu-auth'});
    } else {
      // New buyer → swap into signup
      setStep('signup');
      setError(null);
    }
    // We intentionally only react to lookupFetcher.data changing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookupFetcher.data, lookupFetcher.state]);

  // Existing-buyer link send result
  useEffect(() => {
    if (linkFetcher.state !== 'idle' || !linkFetcher.data) return;
    const data = linkFetcher.data;
    if (data.ok && data.sent) {
      setStep('sent');
      setError(null);
    } else if (data.ok && data.needsSignup) {
      // Race: contact existed at lookup, gone at request time — swap to signup
      setStep('signup');
    } else if (!data.ok) {
      setError(data.error || 'Could not send the link. Try again.');
    }
  }, [linkFetcher.data, linkFetcher.state]);

  // Signup → link send result
  useEffect(() => {
    if (signupFetcher.state !== 'idle' || !signupFetcher.data) return;
    const data = signupFetcher.data;
    if (data.ok && data.sent) {
      setStep('sent');
      setError(null);
    } else if (!data.ok) {
      setError(data.error || 'Could not create your account. Try again.');
    }
  }, [signupFetcher.data, signupFetcher.state]);

  const startLookup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Enter your email to continue.');
      return;
    }
    const fd = new FormData();
    fd.set('intent', 'lookup');
    fd.set('email', email.trim().toLowerCase());
    fd.set('return', returnTo);
    lookupFetcher.submit(fd, {method: 'post', action: '/api/njmenu-auth'});
  };

  const submitSignup = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!firstName.trim() || !lastName.trim() || !dispensaryName.trim()) {
      setError('First name, last name, and dispensary name are required.');
      return;
    }
    const fd = new FormData();
    fd.set('intent', 'signup');
    fd.set('email', email.trim().toLowerCase());
    fd.set('firstName', firstName.trim());
    fd.set('lastName', lastName.trim());
    fd.set('phone', phone.trim());
    fd.set('dispensaryName', dispensaryName.trim());
    fd.set('licenseNumber', licenseNumber.trim());
    fd.set('role', role);
    fd.set('return', returnTo);
    signupFetcher.submit(fd, {method: 'post', action: '/api/njmenu-auth'});
  };

  const inputStyle = useMemo(
    () => ({
      width: '100%',
      background: BRAND.surfaceHigh,
      color: BRAND.white,
      border: `1px solid ${BRAND.border}`,
      borderRadius: 4,
      padding: '14px 16px',
      fontSize: 16,
      fontFamily: "'Helvetica Neue', Arial, sans-serif",
      outline: 'none',
      transition: 'border-color 0.15s',
    }),
    [],
  );

  const buttonStyle = useMemo(
    () => ({
      width: '100%',
      background: BRAND.gold,
      color: BRAND.black,
      border: `2px solid ${BRAND.gold}`,
      padding: '16px 24px',
      fontSize: 18,
      fontFamily: "'Teko', 'Oswald', 'Helvetica Neue', Arial, sans-serif",
      fontWeight: 700,
      letterSpacing: '0.08em',
      textTransform: 'uppercase' as const,
      cursor: busy ? 'wait' : 'pointer',
      opacity: busy ? 0.7 : 1,
      transition: 'opacity 0.15s',
    }),
    [busy],
  );

  return (
    <div
      className="njmenu-login"
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Helvetica Neue', Arial, sans-serif",
      }}
    >
      <style>{`
        .njmenu-login * { box-sizing: border-box; }
        .njmenu-login input:focus { border-color: ${BRAND.gold} !important; }
        .njmenu-login a { color: ${BRAND.gold}; }
        .njmenu-login button:hover:not(:disabled) { opacity: 0.85 !important; }
        .njmenu-login .field-label {
          font-family: 'Teko','Oswald','Helvetica Neue',Arial,sans-serif;
          font-size: 14px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: ${BRAND.gray};
          margin-bottom: 6px; display: block;
        }
        @keyframes pulse-gold {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.6; }
        }
        .njmenu-login .pulse { animation: pulse-gold 1.4s ease-in-out infinite; }
      `}</style>

      <main
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 20px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 440,
            background: BRAND.surface,
            border: `1px solid ${BRAND.border}`,
            padding: '40px 32px',
          }}
        >
          {/* Logo */}
          <div style={{textAlign: 'center', marginBottom: 24}}>
            <img
              src={HEADER_LOGO_URL}
              alt="Highsman"
              style={{width: 140, height: 'auto', margin: '0 auto', display: 'block'}}
            />
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: "'Teko', 'Oswald', 'Helvetica Neue', Arial, sans-serif",
              fontSize: 44,
              fontWeight: 700,
              lineHeight: 1,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
              textAlign: 'center',
              margin: '0 0 6px 0',
            }}
          >
            {step === 'sent' ? 'Check your email' : step === 'signup' ? 'Create account' : 'Sign in'}
          </h1>
          <p
            style={{
              fontFamily: "'Teko', 'Oswald', 'Helvetica Neue', Arial, sans-serif",
              fontSize: 18,
              fontWeight: 500,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textAlign: 'center',
              color: BRAND.gold,
              margin: '0 0 28px 0',
            }}
          >
            NJ Wholesale Menu
          </p>

          {/* Error banner */}
          {error && (
            <div
              role="alert"
              style={{
                background: 'rgba(255,107,53,0.1)',
                border: `1px solid ${BRAND.danger}`,
                color: BRAND.white,
                padding: '12px 14px',
                marginBottom: 20,
                fontSize: 14,
                lineHeight: 1.4,
              }}
            >
              {error}
            </div>
          )}

          {/* ── EMAIL STEP ───────────────────────────────────────────── */}
          {step === 'email' && (
            <form onSubmit={startLookup}>
              <label className="field-label" htmlFor="email">
                Work email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@dispensary.com"
                autoComplete="email"
                autoFocus
                required
                style={inputStyle}
              />
              <div style={{height: 20}} />
              <button type="submit" disabled={busy} style={buttonStyle}>
                {busy ? 'One sec…' : 'Continue'}
              </button>
              <p
                style={{
                  marginTop: 18,
                  textAlign: 'center',
                  fontSize: 13,
                  color: BRAND.textMuted,
                }}
              >
                We'll send a sign-in link to your inbox. No password.
              </p>
            </form>
          )}

          {/* ── SIGNUP STEP ──────────────────────────────────────────── */}
          {step === 'signup' && (
            <form onSubmit={submitSignup}>
              <p
                style={{
                  marginTop: 0,
                  marginBottom: 22,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: BRAND.textMuted,
                }}
              >
                We didn't find <strong style={{color: BRAND.white}}>{email}</strong> in our buyer list. Tell us who you are and we'll set you up in 30 seconds.
              </p>

              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14}}>
                <div>
                  <label className="field-label" htmlFor="firstName">First name</label>
                  <input
                    id="firstName"
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    autoComplete="given-name"
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label className="field-label" htmlFor="lastName">Last name</label>
                  <input
                    id="lastName"
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    autoComplete="family-name"
                    required
                    style={inputStyle}
                  />
                </div>
              </div>

              <label className="field-label" htmlFor="dispensaryName">Dispensary name</label>
              <input
                id="dispensaryName"
                type="text"
                value={dispensaryName}
                onChange={(e) => setDispensaryName(e.target.value)}
                autoComplete="organization"
                required
                style={{...inputStyle, marginBottom: 14}}
              />

              <label className="field-label" htmlFor="licenseNumber">NJ Cannabis License # (optional)</label>
              <input
                id="licenseNumber"
                type="text"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                placeholder="e.g. RE-000123-CRC"
                style={{...inputStyle, marginBottom: 14}}
              />

              <label className="field-label" htmlFor="phone">Phone (optional)</label>
              <input
                id="phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
                style={{...inputStyle, marginBottom: 14}}
              />

              <label className="field-label" htmlFor="role">Role</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                style={{...inputStyle, marginBottom: 22, appearance: 'auto'}}
              >
                <option value="Buyer">Buyer</option>
                <option value="Manager">Manager</option>
                <option value="Owner">Owner</option>
                <option value="Inventory">Inventory</option>
                <option value="Other">Other</option>
              </select>

              <button type="submit" disabled={busy} style={buttonStyle}>
                {busy ? 'Setting up…' : 'Create account & send link'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
                disabled={busy}
                style={{
                  marginTop: 12,
                  width: '100%',
                  background: 'transparent',
                  color: BRAND.textMuted,
                  border: 'none',
                  fontSize: 13,
                  fontFamily: "'Helvetica Neue', Arial, sans-serif",
                  cursor: 'pointer',
                  padding: '10px',
                }}
              >
                ← Use a different email
              </button>
            </form>
          )}

          {/* ── SENT STEP ────────────────────────────────────────────── */}
          {step === 'sent' && (
            <div style={{textAlign: 'center'}}>
              <div
                className="pulse"
                style={{
                  width: 64,
                  height: 64,
                  margin: '0 auto 20px auto',
                  borderRadius: '50%',
                  background: BRAND.gold,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 32,
                  color: BRAND.black,
                  fontWeight: 700,
                }}
                aria-hidden="true"
              >
                ✓
              </div>
              <p style={{fontSize: 16, lineHeight: 1.5, marginBottom: 8}}>
                We sent a sign-in link to
              </p>
              <p
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: BRAND.gold,
                  marginBottom: 22,
                  wordBreak: 'break-all',
                }}
              >
                {email}
              </p>
              <p style={{fontSize: 14, color: BRAND.textMuted, lineHeight: 1.5, marginBottom: 24}}>
                Tap the button in the email to sign in. The link expires in 15 minutes.
                <br />
                Don't see it? Check your spam folder.
              </p>
              <button
                type="button"
                onClick={() => {
                  setStep('email');
                  setError(null);
                }}
                style={{
                  background: 'transparent',
                  color: BRAND.gold,
                  border: `1px solid ${BRAND.gold}`,
                  padding: '12px 24px',
                  fontSize: 14,
                  fontFamily: "'Teko', 'Oswald', 'Helvetica Neue', Arial, sans-serif",
                  fontWeight: 600,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer
        style={{
          padding: '24px 20px',
          textAlign: 'center',
          fontSize: 12,
          color: 'rgba(169,172,175,0.6)',
          borderTop: `1px solid ${BRAND.border}`,
        }}
      >
        Need help? Email{' '}
        <a href="mailto:njsales@highsman.com" style={{color: 'rgba(169,172,175,0.85)'}}>
          njsales@highsman.com
        </a>{' '}
        or text your rep.
      </footer>
    </div>
  );
}
