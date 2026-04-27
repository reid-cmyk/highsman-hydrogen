import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {redirect, json} from '@shopify/remix-oxygen';
import {
  checkTerritoryPassword,
  buildNjTerrLoginCookies,
  buildNjTerrLogoutCookies,
  type NjTerrId,
} from '~/lib/njterr-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/njterr-login — handles login + logout for /njnorth and /njsouth
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/njterr-login
//   form fields:
//     intent     — 'login' | 'logout'
//     territory  — 'north' | 'south'
//     password   — required when intent=login
//
// Login flow:
//   1. Validate territory + password against NJ_{NORTH,SOUTH}_PASS env.
//   2. On success, set the auth cookies and 302 → /njnorth or /njsouth.
//   3. On failure, 302 back to the login page with ?error=invalid.
//
// Logout flow:
//   Clear cookies and bounce home.
// ─────────────────────────────────────────────────────────────────────────────

function isTerritory(value: string | null): value is NjTerrId {
  return value === 'north' || value === 'south';
}

export async function action({request, context}: ActionFunctionArgs) {
  const fd = await request.formData();
  const intent = ((fd.get('intent') as string) || 'login').trim();
  const territoryRaw = ((fd.get('territory') as string) || '').trim();
  const password = ((fd.get('password') as string) || '').trim();

  if (!isTerritory(territoryRaw)) {
    return json({ok: false, error: 'Invalid territory.'}, {status: 400});
  }
  const territory = territoryRaw;
  const targetPath = territory === 'north' ? '/njnorth' : '/njsouth';

  if (intent === 'logout') {
    const headers = new Headers();
    for (const c of buildNjTerrLogoutCookies()) headers.append('Set-Cookie', c);
    headers.set('Location', '/');
    return new Response(null, {status: 302, headers});
  }

  const env = (context.env || {}) as Record<string, string | undefined>;
  if (!checkTerritoryPassword(territory, password, env)) {
    const headers = new Headers();
    headers.set('Location', `${targetPath}?error=invalid`);
    return new Response(null, {status: 302, headers});
  }

  const headers = new Headers();
  for (const c of buildNjTerrLoginCookies(territory)) headers.append('Set-Cookie', c);
  headers.set('Location', targetPath);
  return new Response(null, {status: 302, headers});
}

// GET on this route just kicks back to home — login is POST-only.
export async function loader() {
  return redirect('/');
}
