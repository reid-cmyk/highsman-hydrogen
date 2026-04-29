import type {LoaderFunctionArgs, ActionFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {useLoaderData, Form} from '@remix-run/react';
import {json, redirect} from '@shopify/remix-oxygen';
import {
  findRepByPassword,
  parseSalesFloorCookies,
  buildLoginCookieHeaders,
} from '../lib/sales-floor-reps';

export const meta: MetaFunction = () => {
  return [
    {title: 'HIGHSMAN | Sales Floor'},
    {name: 'robots', content: 'noindex, nofollow'},
  ];
};

// Each rep has their own password (see app/lib/sales-floor-reps.ts). The
// password IS the identity — we look up the rep by password, then set a
// sales_floor_rep=<id> cookie alongside the standard auth cookie.
// Adding/rotating a rep = one edit to sales-floor-reps.ts.

// Route mobile vs desktop by User-Agent. Mobile reps get the PWA shell at
// /sales-floor/mobile, desktop reps get the full desktop dashboard at
// /sales-floor/app. Mobile reps who WANT the desktop view can still reach it
// via the "Desktop View" link inside the mobile More sheet, and desktop reps
// can bookmark /sales-floor/mobile directly if they want to preview it.
function destinationForUA(ua: string | null): string {
  if (!ua) return '/sales-floor/app';
  // Phones only — iPad/tablets keep the desktop view since they have the screen.
  const isPhone = /iPhone|Android.*Mobile|Mobile Safari|IEMobile|Opera Mini/i.test(ua);
  return isPhone ? '/sales-floor/mobile' : '/sales-floor/app';
}

// /sales-floor/app and /sales-floor/mobile are resource routes (loader-only,
// raw text/html). Remix's client-side router has no component to render for
// them, so a Remix-style redirect from the login action lands the user on the
// root layout with an empty Outlet — the "blank screen until refresh" bug.
// Fix: the <Form> below uses reloadDocument so the browser performs a regular
// document POST and follows the 302 natively (full document GET on
// /sales-floor/app), and we surface the wrong-password error via the loader
// (?error=invalid) so a redirect-on-error works in document-submit mode too.

export async function loader({request}: LoaderFunctionArgs) {
  const {authed, repId} = parseSalesFloorCookies(request.headers.get('Cookie'));
  if (authed && repId) {
    return redirect(destinationForUA(request.headers.get('User-Agent')));
  }
  const url = new URL(request.url);
  const error =
    url.searchParams.get('error') === 'invalid' ? 'Incorrect password' : null;
  return json({authenticated: false, error});
}

export async function action({request}: ActionFunctionArgs) {
  const formData = await request.formData();
  const password = (formData.get('password') as string) || '';

  const rep = findRepByPassword(password);
  if (!rep) {
    // Redirect (not json) so reloadDocument-mode forms render a real page,
    // not raw JSON. Loader picks up ?error=invalid and renders inline.
    return redirect('/sales-floor?error=invalid');
  }

  // Remix accepts string[] for Set-Cookie — both cookies land on the response.
  const cookieHeaders = buildLoginCookieHeaders(rep.id);
  const headers = new Headers();
  for (const c of cookieHeaders) headers.append('Set-Cookie', c);

  return redirect(destinationForUA(request.headers.get('User-Agent')), {headers});
}

export default function SalesFloorLogin() {
  const data = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#000',
        color: '#FFF',
        fontFamily: "'Barlow Semi Condensed', sans-serif",
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          background: '#0a0a0a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: '12px',
          padding: '40px 32px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{textAlign: 'center', marginBottom: '32px'}}>
          <img
            src="https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430"
            alt="Highsman"
            style={{height: '48px', marginBottom: '16px'}}
          />
          <h1
            style={{
              fontFamily: "'Teko', sans-serif",
              fontWeight: 600,
              fontSize: '32px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              margin: 0,
            }}
          >
            Sales Floor
          </h1>
          <p
            style={{
              color: '#A9ACAF',
              fontSize: '14px',
              marginTop: '6px',
              letterSpacing: '0.03em',
            }}
          >
            Enter your rep password.
          </p>
        </div>

        <Form
          method="post"
          reloadDocument
          style={{display: 'flex', flexDirection: 'column', gap: '16px'}}
        >
          <label
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontSize: '12px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: '#A9ACAF',
            }}
          >
            Password
            <input
              type="password"
              name="password"
              required
              autoFocus
              autoComplete="current-password"
              style={{
                background: '#000',
                border: '1px solid rgba(255,255,255,0.15)',
                borderRadius: '8px',
                color: '#FFF',
                padding: '14px 16px',
                fontSize: '16px',
                fontFamily: 'inherit',
                outline: 'none',
              }}
            />
          </label>

          {data.error ? (
            <div
              style={{
                color: '#ff6b6b',
                fontSize: '13px',
                padding: '10px 12px',
                background: 'rgba(255, 107, 107, 0.08)',
                border: '1px solid rgba(255, 107, 107, 0.25)',
                borderRadius: '6px',
              }}
            >
              {data.error}
            </div>
          ) : null}

          <button
            type="submit"
            style={{
              background: '#FFF',
              color: '#000',
              border: 'none',
              borderRadius: '8px',
              padding: '14px 18px',
              fontFamily: "'Teko', sans-serif",
              fontWeight: 600,
              fontSize: '20px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              minHeight: '52px',
            }}
          >
            Enter Floor
          </button>
        </Form>

        <div
          style={{
            marginTop: '28px',
            paddingTop: '20px',
            borderTop: '1px solid rgba(255,255,255,0.08)',
            textAlign: 'center',
            fontSize: '11px',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#6a6d70',
          }}
        >
          Spark Greatness<span style={{fontSize: '9px'}}>™</span>
        </div>
      </div>
    </div>
  );
}
