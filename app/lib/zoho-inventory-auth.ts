// ─────────────────────────────────────────────────────────────────────────────
// Zoho INVENTORY — Shared Access Token Helper
// ─────────────────────────────────────────────────────────────────────────────
// Sister module to app/lib/zoho-auth.ts (CRM). Inventory has its OWN OAuth
// Self Client (separate ZOHO_INVENTORY_* env vars) — they cannot share a
// cache, but they share the same anti-pattern hazard: every route doing its
// own inline `cachedToken` will fan out concurrent `/oauth/v2/token` POSTs
// on a cold worker and trip Zoho's:
//
//   HTTP 400 { "error":"Access Denied",
//              "error_description":"You have made too many requests
//                                   continuously. Please try again after
//                                   some time." }
//
// 2026-04-28: this exact thing took out State Pulse. Three routes
// (api.sales-floor-state-pulse, sales, api.account-last-orders) each owned
// an inline cache; an Oxygen cold spread across workers tripped the limit
// and every Inventory call started failing. /sales-floor showed Apr MTD
// numbers that looked stale because they came from the LAST successful
// fetch before the rate-limit kicked in.
//
// This module fixes that by:
//   1. Single module-scope cache shared across every Inventory route.
//   2. In-flight promise singleton — concurrent callers within the same
//      worker tick await the same refresh, no duplicate token requests.
//   3. Honors ZOHO_INVENTORY_* envs first, then falls back to general
//      ZOHO_* envs (matches existing per-route logic so no env changes).
//
// Usage:
//   import {getInventoryAccessToken} from '~/lib/zoho-inventory-auth';
//   const token = await getInventoryAccessToken(context.env);
//
// Companion memory: feedback_zoho_token_caching.md (CRM equivalent).
// ─────────────────────────────────────────────────────────────────────────────

type InvEnv = {
  ZOHO_INVENTORY_CLIENT_ID?: string;
  ZOHO_INVENTORY_CLIENT_SECRET?: string;
  ZOHO_INVENTORY_REFRESH_TOKEN?: string;
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
  [k: string]: string | undefined;
};

let cachedToken: string | null = null;
let tokenExpiresAt = 0;
let inFlight: Promise<string> | null = null;

// Inventory tokens, like CRM, are 60-min. Cache 55 to clear the cliff.
const TTL_MS = 55 * 60 * 1000;
// 30s grace window: if we're within 30s of expiry, refresh anyway so an
// in-flight long-running request never lands on an expired token.
const REFRESH_GRACE_MS = 30 * 1000;

export async function getInventoryAccessToken(env: InvEnv): Promise<string> {
  const clientId = env.ZOHO_INVENTORY_CLIENT_ID || env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_INVENTORY_CLIENT_SECRET || env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_INVENTORY_REFRESH_TOKEN || env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Zoho Inventory credentials missing');
  }

  const now = Date.now();
  if (cachedToken && now + REFRESH_GRACE_MS < tokenExpiresAt) return cachedToken;

  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
        method: 'POST',
        headers: {'Content-Type': 'application/x-www-form-urlencoded'},
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: refreshToken!,
        }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        // Surface the verbatim Zoho message so the rate-limit string is
        // visible upstream — same behavior as zoho-auth.ts.
        throw new Error(`Zoho Inventory token (${res.status}): ${text.slice(0, 300)}`);
      }

      const data = await res.json();
      if (!data?.access_token) {
        throw new Error('Zoho Inventory token response missing access_token');
      }
      cachedToken = data.access_token as string;
      tokenExpiresAt = Date.now() + TTL_MS;
      return cachedToken!;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

/** Test-only: reset the cache. Never call from route code in production. */
export function __resetInventoryTokenCacheForTests(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
  inFlight = null;
}
