// ─────────────────────────────────────────────────────────────────────────────
// app/lib/zoho-users.ts
// ─────────────────────────────────────────────────────────────────────────────
// Resolve a Zoho CRM user ID from an email address. Used by /api/lead-claim
// when we want to set the Lead's `Owner` field to whichever rep is currently
// working the lead — Zoho's Owner field is keyed by user id, not email, so
// we need this translation layer.
//
// The Zoho Users API has no clean "look up by email" endpoint, only a list
// endpoint. So we lazy-load every active CRM user on first call, build an
// email → user_id map, and cache it module-scope for 30 minutes. A 30-min
// TTL is fine because (a) Highsman's CRM has ~5 users today, (b) new hires
// are rare, (c) a stale cache only means a brand-new rep's Owner-write skips
// for half an hour after they're added — they'd still get the rest of the
// claim flow (Working_Owner, etc.) just fine.
// ─────────────────────────────────────────────────────────────────────────────

let cachedUsers: Map<string, string> | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const ZOHO_USERS_BASE = 'https://www.zohoapis.com/crm/v7/users';

async function loadAllActiveUsers(token: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (let page = 1; page <= 5; page++) {
    const url = `${ZOHO_USERS_BASE}?type=ActiveConfirmedUsers&page=${page}&per_page=200`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const users: any[] = Array.isArray(data?.users) ? data.users : [];
    for (const u of users) {
      const email = String(u?.email || '').trim().toLowerCase();
      const id = String(u?.id || '').trim();
      if (email && id) map.set(email, id);
    }
    if (!data?.info?.more_records) break;
  }
  return map;
}

/**
 * Resolve a Zoho CRM user id from an email address. Returns null if no match
 * or the lookup fails — callers should treat null as "skip the Owner write".
 */
export async function getZohoUserIdByEmail(
  email: string | null | undefined,
  token: string,
): Promise<string | null> {
  const lower = String(email || '').trim().toLowerCase();
  if (!lower) return null;
  const now = Date.now();
  if (!cachedUsers || now - cachedAt > CACHE_TTL_MS) {
    try {
      cachedUsers = await loadAllActiveUsers(token);
      cachedAt = now;
    } catch {
      // Don't blow up the caller if the user list is unreachable — return
      // whatever we've got (possibly empty). A failed Owner write is better
      // than a failed claim.
      cachedUsers = cachedUsers || new Map();
    }
  }
  return cachedUsers.get(lower) || null;
}
