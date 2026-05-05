/**
 * app/lib/staging-auth.ts
 *
 * Cookie-gate helper for /sales-staging.
 * Ported from the ceo.tsx pattern (ceo_auth=1).
 *
 * Cookie: sales_staging_auth=1, Path=/, HttpOnly, Secure, SameSite=Lax, 24h
 * Env var: SALES_STAGING_PASSWORD (set in Oxygen Production + Preview)
 */

export const STAGING_COOKIE_NAME = 'sales_staging_auth';
export const STAGING_COOKIE_VALUE = '1';

export function isStagingAuthed(cookieHeader: string | null): boolean {
  if (!cookieHeader) return false;
  return cookieHeader.includes(`${STAGING_COOKIE_NAME}=${STAGING_COOKIE_VALUE}`);
}

export function buildStagingLoginCookie(): string {
  return `${STAGING_COOKIE_NAME}=${STAGING_COOKIE_VALUE}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
}

export function buildStagingLogoutCookie(): string {
  return `${STAGING_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

/** Clears the legacy password cookie, SF session token, and SF user cache cookie. */
export function buildFullLogoutHeaders(): Headers {
  const h = new Headers();
  h.append('Set-Cookie', `${STAGING_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  h.append('Set-Cookie', `sf_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  h.append('Set-Cookie', `sf_user=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  return h;
}

export function checkStagingPassword(
  input: string,
  env: {SALES_STAGING_PASSWORD?: string},
): boolean {
  const correct = env.SALES_STAGING_PASSWORD || '2026t0them00n!';
  return input === correct;
}
