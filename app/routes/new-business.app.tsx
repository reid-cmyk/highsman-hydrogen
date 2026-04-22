import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
// eslint-disable-next-line import/no-unresolved
import dashboardHtml from '../lib/new-business-dashboard.html?raw';
import {
  getRepFromRequest,
  toPublic,
  buildLogoutCookieHeaders,
} from '../lib/sales-floor-reps';

// Resource route — loader-only, serves the /new-business/app dashboard HTML
// template server-side with the logged-in rep spliced in. Mirrors the same
// injection pattern used for /sales-floor/app so every XHR inside the page
// knows which rep it's running as (window.__HS_REP__).

function htmlEscape(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTemplate(template: string, vars: Record<string, string>): string {
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
    headers.set('Location', '/new-business');
    return new Response(null, {status: 302, headers});
  }

  const pub = toPublic(rep);

  let body = renderTemplate(dashboardHtml, {
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
