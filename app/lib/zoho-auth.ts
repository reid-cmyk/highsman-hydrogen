// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM — Shared Access Token Helper
// ─────────────────────────────────────────────────────────────────────────────
// One cache per worker instance — shared across every route that talks to
// Zoho CRM. Before this module existed, each of ~26 route files owned its own
// inline `cachedToken` / `getAccessToken()`, so a cold-started worker fanned
// out as many as 26 parallel calls to `/oauth/v2/token` on first use.
// Zoho's OAuth endpoint responds to bursts with:
//   HTTP 400 { "error": "Access Denied",
//              "error_description": "You have made too many requests
//                                     continuously. Please try again after
//                                     some time." }
// and imposes a 15–30 minute global cooldown — which blocks every Zoho call
// in the app, not just the offending route.
//
// This helper fixes that by:
//   1. A single module-scope cache: all routes share `cachedToken` + TTL.
//   2. An in-flight promise singleton: concurrent callers within the same
//      worker tick await the same refresh, so we never fire duplicate
//      token requests even on a cold start.
//
// Usage:
//   import {getZohoAccessToken} from '~/lib/zoho-auth';
//   const token = await getZohoAccessToken(context.env);
//
// Companion memory: feedback_zoho_token_caching.md
// ─────────────────────────────────────────────────────────────────────────────

type ZohoEnv = {
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  // Loose typing so any `context.env` shape can be passed in without casts.
  [k: string]: string | undefined;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlight: Promise<string> | null = null;

// Zoho tokens are issued with a 1 hour life. Cache for 55 minutes to stay
// clear of the expiry cliff — an in-flight call that straddles the boundary
// will still succeed because Zoho grants a short grace window on expired
// tokens used mid-request.
const TTL_MS = 55 * 60 * 1000;

/**
 * Fetch a Zoho CRM access token, sharing the cache across every route in the
 * app. Concurrent callers during a cold start await the same refresh.
 */
export async function getZohoAccessToken(env: ZohoEnv): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho credentials missing');
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;

  // Dedup concurrent refreshes. Without this, a cold worker serving 5
  // simultaneous requests would fire 5 token calls before any of them
  // cached. With it, only the first request fires; the rest await.
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      // 10s hard timeout. Without this, a stalled accounts.zoho.com (rare
      // but happens after rate-limit cooldowns) would hang the whole
      // request — every caller awaiting the in-flight singleton would
      // wait indefinitely, because `inFlight = null` only runs in finally
      // after the promise settles. AbortController gives Zoho a deadline
      // and forces the singleton to clear so the NEXT caller can retry.
      const ctrl = new AbortController();
      const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
      let res: Response;
      try {
        res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        signal: ctrl.signal,
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: env.ZOHO_CLIENT_ID!,
          client_secret: env.ZOHO_CLIENT_SECRET!,
          refresh_token: env.ZOHO_REFRESH_TOKEN!,
        }),
      });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          throw new Error('Zoho token fetch timed out (>10s) — likely rate-limited or upstream slow');
        }
        throw err;
      } finally {
        clearTimeout(timeoutId);
      }

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Bubble up the full Zoho response on the short-error channel so
        // downstream routes can surface the rate-limit message verbatim to
        // the UI — it's worth the user seeing "too many requests" rather
        // than a generic "Zoho auth failed".
        throw new Error(`Zoho token (${res.status}): ${text.slice(0, 300)}`);
      }

      const data = await res.json();
      if (!data?.access_token) {
        throw new Error('Zoho token response missing access_token');
      }
      cachedToken = data.access_token;
      tokenExpiresAt = Date.now() + TTL_MS;
      return cachedToken!;
    } finally {
      // Clear the in-flight slot whether the refresh succeeded or failed.
      // On failure a subsequent caller gets a fresh attempt rather than
      // inheriting a stale rejected promise.
      inFlight = null;
    }
  })();

  return inFlight;
}

/**
 * Test-only: reset the cache. Never call from route code in production.
 */
export function __resetZohoTokenCacheForTests(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  inFlight = null;
}

// Backwards-compatible alias. Many existing routes called their local helper
// `getAccessToken` — importing this name lets us migrate with a one-line diff:
//   -async function getAccessToken(env) { ...inline cache... }
//   +import {getAccessToken} from '~/lib/zoho-auth';
export {getZohoAccessToken as getAccessToken};
