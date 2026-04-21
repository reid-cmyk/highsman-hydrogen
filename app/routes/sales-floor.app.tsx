import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
// Raw HTML template imported at build time by Vite
// eslint-disable-next-line import/no-unresolved
import dashboardHtml from '../lib/sales-floor-dashboard.html?raw';
import {
  getRepFromRequest,
  toPublic,
  buildLogoutCookieHeaders,
} from '../lib/sales-floor-reps';

// Resource route (loader-only, no default component export).
// Returning a raw text/html Response is safe here because Remix treats
// resource routes as document responses — they never go through the
// client-side data revalidation path.
//
// Before serving, we resolve the rep from the cookie and splice their public
// profile into the HTML template. Any `__TOKEN__` in the template is replaced
// with an HTML-escaped value. A dedicated `<script>` block is injected into
// <head> so client-side code can read the rep as `window.__HS_REP__` without
// us having to worry about HTML-escape-inside-script pitfalls.
//
// Passwords + env var names never cross the wire — we only send what
// toPublic() exposes.

function htmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Replace every `__TOKEN__` with its HTML-escaped value. Safe in text nodes
// and HTML attributes. NOT safe for placement inside a <script> tag — use
// the dedicated window.__HS_REP__ injection for that.
function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(/__([A-Z_]+)__/g, (match, key) => {
    const raw = vars[key];
    return raw === undefined ? match : htmlEscape(raw);
  });
}

// JSON → script-safe string. Escape `<` so `</script>` can't break out of the
// surrounding <script> block, and escape the U+2028/U+2029 characters that
// break legacy JS parsers.
function scriptSafeJSON(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export async function loader({request}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) {
    // Missing or stale cookies → send them back to login AND clear any
    // half-set cookies so re-auth starts from a clean slate.
    const headers = new Headers();
    for (const c of buildLogoutCookieHeaders()) headers.append('Set-Cookie', c);
    headers.set('Location', '/sales-floor');
    return new Response(null, {status: 302, headers});
  }

  const pub = toPublic(rep);

  // 1) Token replacement for text/attribute contexts (greeting, alt text…).
  let body = renderTemplate(dashboardHtml, {
    REP_ID: pub.id,
    REP_DISPLAY_NAME: pub.displayName,
    REP_FIRST_NAME: pub.firstName,
    REP_EMAIL: pub.email,
    REP_TAGLINE: pub.tagline,
    REP_SIGNATURE: pub.signature,
  });

  // 2) Inject window.__HS_REP__ at the very top of <head> so every script
  // loaded afterward (app.js, contact-search.js, …) can read it synchronously.
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
