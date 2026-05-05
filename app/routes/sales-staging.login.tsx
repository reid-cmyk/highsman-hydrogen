/**
 * app/routes/sales-staging.login.tsx
 * /sales-staging/login — Supabase Auth login for Sales Floor
 */

import type {ActionFunctionArgs, LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useActionData, Form} from '@remix-run/react';
import {getSFToken, getSFUser, signInWithPassword, buildSFSessionCookie, buildSFUserCookie} from '~/lib/sf-auth.server';
import {isStagingAuthed} from '~/lib/staging-auth';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [{title: 'Sales Floor — Sign In'}];

const T = {
  bg: '#0A0A0A', border: '#1F1F1F', borderStrong: '#2F2F2F',
  text: '#F0F0F0', textFaint: '#5A5A5A', textMuted: '#7A7A7A',
  yellow: '#FFD500', redSystems: '#FF3355', surface: '#111111',
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  // Legacy password gate — still valid, redirect immediately
  if (isStagingAuthed(cookie)) return redirect('/sales-staging');
  // New token — validate it with Supabase before redirecting to prevent loops on stale tokens
  if (getSFToken(cookie)) {
    const sfUser = await getSFUser(cookie, env);
    if (sfUser) return redirect('/sales-staging');
    // Token present but invalid — fall through to login page (clears the loop)
  }
  return json({});
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const fd = await request.formData();
  const email    = String(fd.get('email')    || '').trim().toLowerCase();
  const password = String(fd.get('password') || '');

  if (!email || !password) {
    return json({error: 'Email and password required'});
  }

  const result = await signInWithPassword(email, password, env);
  if (result.error || !result.token) {
    return json({error: result.error || 'Invalid credentials'});
  }

  // Load user once at login to populate the cache cookie (no Supabase call on subsequent requests)
  const sfUser = await getSFUser(`sf_token=${result.token}`, env);
  const headers = new Headers();
  headers.append('Set-Cookie', buildSFSessionCookie(result.token));
  if (sfUser) headers.append('Set-Cookie', buildSFUserCookie(sfUser));
  return redirect('/sales-staging', {headers});
}

export default function SFLogin() {
  const data = useActionData<typeof action>();
  const error = (data as any)?.error;

  return (
    <div style={{
      minHeight: '100vh', background: T.bg, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      backgroundImage: 'radial-gradient(ellipse at top, rgba(255,213,0,0.05) 0%, transparent 55%)',
    }}>
      <div style={{width: 360, padding: '40px 32px', border: `1px solid ${T.borderStrong}`, background: T.surface}}>
        {/* Logo */}
        <div style={{textAlign: 'center', marginBottom: 32}}>
          <img
            src="https://agents-assets.nyc3.cdn.digitaloceanspaces.com/Highsman%20logo%20(2).png"
            alt="Highsman" style={{height: 32, marginBottom: 12}}
          />
          <div style={{fontFamily: 'Teko,sans-serif', fontSize: 14, letterSpacing: '0.32em', color: T.textFaint, textTransform: 'uppercase'}}>
            Sales Floor
          </div>
        </div>

        <Form method="post">
          <div style={{marginBottom: 16}}>
            <label style={{display: 'block', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, letterSpacing: '0.22em', color: T.textFaint, textTransform: 'uppercase', marginBottom: 6}}>
              Email
            </label>
            <input
              type="email"
              name="email"
              autoFocus
              autoComplete="email"
              placeholder="you@highsman.com"
              required
              style={{
                width: '100%', padding: '10px 12px', background: T.bg,
                border: `1px solid ${T.borderStrong}`, color: T.text,
                fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{marginBottom: 24}}>
            <label style={{display: 'block', fontFamily: 'JetBrains Mono,monospace', fontSize: 10, letterSpacing: '0.22em', color: T.textFaint, textTransform: 'uppercase', marginBottom: 6}}>
              Password
            </label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              style={{
                width: '100%', padding: '10px 12px', background: T.bg,
                border: `1px solid ${error ? T.redSystems : T.borderStrong}`, color: T.text,
                fontSize: 14, fontFamily: 'Inter,sans-serif', outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{fontFamily: 'JetBrains Mono,monospace', fontSize: 11, color: T.redSystems, marginBottom: 16, letterSpacing: '0.08em'}}>
              {error}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%', padding: '12px', background: T.yellow,
              border: 'none', color: '#000', fontFamily: 'Teko,sans-serif',
              fontSize: 16, fontWeight: 600, letterSpacing: '0.22em',
              textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            Sign In
          </button>
        </Form>
      </div>
    </div>
  );
}
