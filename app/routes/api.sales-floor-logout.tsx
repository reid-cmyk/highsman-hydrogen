import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {redirect} from '@shopify/remix-oxygen';
import {buildLogoutCookieHeaders} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Logout
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-logout → clears the auth + rep cookies and kicks the
// browser back to /sales-floor. GET does the same thing so a plain <a href>
// works too (useful on mobile where a form-POST menu entry is awkward).
// ─────────────────────────────────────────────────────────────────────────────

function clearAndRedirect(): Response {
  const headers = new Headers();
  for (const c of buildLogoutCookieHeaders()) headers.append('Set-Cookie', c);
  headers.set('Location', '/sales-floor');
  return new Response(null, {status: 302, headers});
}

export async function action(_args: ActionFunctionArgs) {
  return clearAndRedirect();
}

export async function loader(_args: LoaderFunctionArgs) {
  return clearAndRedirect();
}
