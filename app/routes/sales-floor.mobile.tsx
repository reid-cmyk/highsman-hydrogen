import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
// Raw HTML template imported at build time by Vite
// eslint-disable-next-line import/no-unresolved
import mobileHtml from '../lib/sales-floor-mobile.html?raw';
import {
  getRepFromRequest,
  toPublic,
  buildLogoutCookieHeaders,
} from '../lib/sales-floor-reps';

// Mobile-first twin of /sales-floor/app. Resource route (loader-only): serves
// the mobile HTML shell with the rep's public profile spliced into both text
// tokens (__REP_DISPLAY_NAME__ etc.) and a `window.__HS_REP__` script so the
// shared JS bundles pick it up identically to the desktop build.
//
// This route reuses every /sales-floor/js/* bundle and every /api/sales-floor-*
// endpoint — only the HTML shell and CSS differ from /sales-floor/app.

function htmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/__([A-Z_]+)__/g, (match, key) => {
    const raw = vars[key];
    return raw === undefined ? match : htmlEscape(raw);
  });
}

function scriptSafeJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export async function loader({request}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) {
    const headers = new Headers();
    for (const c of buildLogoutCookieHeaders()) headers.append('Set-Cookie', c);
    headers.set('Location', '/sales-floor');
    return new Response(null, {status: 302, headers});
  }

  const pub = toPublic(rep);

  let body = renderTemplate(mobileHtml, {
    REP_ID: pub.id,
    REP_DISPLAY_NAME: pub.displayName,
    REP_FIRST_NAME: pub.firstName,
    REP_EMAIL: pub.email,
    REP_TAGLINE: pub.tagline,
    REP_SIGNATURE: pub.signature,
  });

  const repScript =
    `<script>window.__HS_REP__ = ${scriptSafeJSON(pub)};</script>\n  `;
  body = body.replace(/<head[^>]*>/i, (m) => `${m}\n  ${repScript}`);

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}
