// ─────────────────────────────────────────────────────────────────────────────
// NJ Territory Dashboard Auth — Per-Rep Password + Cookie
// ─────────────────────────────────────────────────────────────────────────────
// Powers /njnorth and /njsouth — the rep-facing dashboards where field staff
// see their upcoming shifts, complete shift reports, and (later) review their
// commissions.
//
// Each territory has its own password set in Oxygen env:
//   NJ_NORTH_PASS   — North Jersey rep password
//   NJ_SOUTH_PASS   — South Jersey rep password
//
// If the env var is unset, both default to "hmexec2025$" so the pages still
// work in dev/staging without cred provisioning. Reid: rotate these once the
// actual reps are seated.
//
// Cookie pair on success:
//   nj_terr_auth=1                                — presence = logged in
//   nj_terr=<north|south>                         — which rep is logged in
//
// Both Path=/, HttpOnly, Secure, SameSite=Lax, Max-Age=7 days.
// Keeping Path=/ so any /api/njterr-* route can read them (per
// `feedback_sales_floor_cookie_path.md` — same lesson learned).
// ─────────────────────────────────────────────────────────────────────────────

import type {RepId} from '~/lib/reps';

export type NjTerrId = RepId; // 'north' | 'south'

const AUTH_COOKIE = 'nj_terr_auth';
const ID_COOKIE = 'nj_terr';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const DEFAULT_PASSWORD = 'hmexec2025$';

export function getTerritoryPassword(
  territory: NjTerrId,
  env: Record<string, string | undefined>,
): string {
  const envName = territory === 'north' ? 'NJ_NORTH_PASS' : 'NJ_SOUTH_PASS';
  return (env[envName] || '').trim() || DEFAULT_PASSWORD;
}

/**
 * Verify a submitted password against the territory's configured password.
 * Constant-time compare avoids timing-side-channel password discovery.
 */
export function checkTerritoryPassword(
  territory: NjTerrId,
  submitted: string,
  env: Record<string, string | undefined>,
): boolean {
  const expected = getTerritoryPassword(territory, env);
  if (!submitted || submitted.length !== expected.length) {
    // Run a sham compare so a length mismatch isn't faster than a real one.
    let _ = 0;
    for (let i = 0; i < (submitted || '').length; i++) {
      _ |= (submitted || '').charCodeAt(i);
    }
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= submitted.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export type NjTerrAuth = {
  authed: boolean;
  territory: NjTerrId | null;
};

/**
 * Read the cookies on a request and report (a) whether the visitor is
 * authenticated at all, and (b) which territory they're authenticated for.
 * Routes use this to gate access to /njnorth vs /njsouth — a north rep
 * landing on /njsouth gets bounced to /njsouth's login, NOT auto-admitted.
 */
export function readNjTerrAuth(request: Request): NjTerrAuth {
  const header = request.headers.get('Cookie') || '';
  const authed = /(^|;\s*)nj_terr_auth=1(;|$)/.test(header);
  const match = header.match(/(?:^|;\s*)nj_terr=([^;]+)/);
  const raw = match ? decodeURIComponent(match[1]) : null;
  const territory: NjTerrId | null =
    raw === 'north' || raw === 'south' ? raw : null;
  return {authed, territory};
}

/**
 * Build the Set-Cookie header pair for a successful login.
 * Returns an array — the action route should append each as a separate
 * Set-Cookie header (Remix's `headers` field accepts multiple).
 */
export function buildNjTerrLoginCookies(territory: NjTerrId): string[] {
  const common = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}`;
  return [
    `${AUTH_COOKIE}=1; ${common}`,
    `${ID_COOKIE}=${encodeURIComponent(territory)}; ${common}`,
  ];
}

export function buildNjTerrLogoutCookies(): string[] {
  const common = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return [`${AUTH_COOKIE}=; ${common}`, `${ID_COOKIE}=; ${common}`];
}

/**
 * Quick guard for use inside a loader. Returns true if the request is
 * authenticated for the given territory. North rep on /njsouth → false.
 */
export function isAuthedForTerritory(
  request: Request,
  territory: NjTerrId,
): boolean {
  const {authed, territory: cookieTerr} = readNjTerrAuth(request);
  return authed && cookieTerr === territory;
}
