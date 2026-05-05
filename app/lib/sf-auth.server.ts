/**
 * app/lib/sf-auth.server.ts
 *
 * Supabase Auth-based user session for /sales-staging.
 * Uses fetch() only — no supabase-js dependency needed.
 * Permissions are stored in user_metadata on each auth.users row.
 *
 * Cookie: sf_token=<access_token>  HttpOnly Secure SameSite=Lax 7d
 */

export const SF_TOKEN_COOKIE = 'sf_token';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SFPermissions = {
  display_name: string;
  role: 'admin' | 'rep';
  modules: string[];    // ['*'] = all, or specific keys
  features: string[];   // ['*'] = all, or specific keys
  markets: string[];    // ['*'] = all, or state codes like ['NJ','NY']
  avatar_url?: string;  // optional avatar image URL
};

export type SFUser = {
  id: string;
  email: string;
  permissions: SFPermissions;
};

// ─── Module keys ─────────────────────────────────────────────────────────────
// Defined in ~/lib/sf-permissions.ts (not .server) so client JSX can use them
export {SF_MODULES, SF_FEATURES} from '~/lib/sf-permissions';

// ─── Cookie helpers ───────────────────────────────────────────────────────────

export function getSFToken(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/sf_token=([^;]+)/);
  return match ? match[1] : null;
}

export const SF_USER_COOKIE = 'sf_user';

export function buildSFSessionCookie(token: string): string {
  const maxAge = 365 * 24 * 3600; // 1 year
  return `${SF_TOKEN_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

/** Cache user permissions in a separate cookie to avoid a Supabase round-trip on every request. */
export function buildSFUserCookie(user: SFUser): string {
  // btoa requires ASCII — encodeURIComponent first handles any unicode in display names
  const json = JSON.stringify({id: user.id, email: user.email, permissions: user.permissions});
  const payload = btoa(encodeURIComponent(json));
  const maxAge = 365 * 24 * 3600;
  return `${SF_USER_COOKIE}=${payload}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function buildSFLogoutCookies(): string[] {
  return [
    `${SF_TOKEN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
    `${SF_USER_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
  ];
}

/** Read user from the cached cookie (fast path — no Supabase call). */
export function getSFUserFromCache(cookieHeader: string | null): SFUser | null {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/sf_user=([^;]+)/);
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(atob(match[1]))) as SFUser;
  } catch { return null; }
}

export function buildSFLogoutCookie(): string {
  return `${SF_TOKEN_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** Sign in with email + password. Returns access_token or null on failure. */
export async function signInWithPassword(
  email: string,
  password: string,
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string },
): Promise<{ token: string; error: null } | { token: null; error: string }> {
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: 'POST',
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      },
    );
    const data: any = await res.json();
    if (!res.ok || !data.access_token) {
      return { token: null, error: data.error_description || data.message || 'Invalid credentials' };
    }
    return { token: data.access_token, error: null };
  } catch {
    return { token: null, error: 'Auth service unavailable' };
  }
}

/** Validate token + load user with permissions from user_metadata.
 *  Pass userId to look up by ID directly (admin operations), or cookieHeader for session auth. */
export async function getSFUser(
  cookieHeader: string | null,
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string },
  userId?: string,
): Promise<SFUser | null> {
  // Direct lookup by user ID (admin use — bypasses token)
  if (userId) {
    try {
      const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
        headers: {
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
      });
      if (!res.ok) return null;
      const user: any = await res.json();
      if (!user?.id) return null;
      const meta = user.user_metadata || {};
      return {
        id: user.id, email: user.email,
        permissions: {
          display_name: meta.display_name || user.email,
          role:     meta.role     || 'rep',
          modules:  Array.isArray(meta.modules)  ? meta.modules  : [],
          features: Array.isArray(meta.features) ? meta.features : [],
          markets:  Array.isArray(meta.markets)  ? meta.markets  : [],
          avatar_url: meta.avatar_url,
        },
      };
    } catch { return null; }
  }

  // Fast path: read from cached cookie (avoids Supabase round-trip)
  const cached = getSFUserFromCache(cookieHeader);
  if (cached) return cached;

  const token = getSFToken(cookieHeader);
  if (!token) return null;

  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    const user: any = await res.json();
    if (!user?.id) return null;

    const meta = user.user_metadata || {};
    const permissions: SFPermissions = {
      display_name: meta.display_name || user.email,
      role:         meta.role         || 'rep',
      modules:      Array.isArray(meta.modules)  ? meta.modules  : [],
      features:     Array.isArray(meta.features) ? meta.features : [],
      markets:      Array.isArray(meta.markets)  ? meta.markets  : [],
    };

    return { id: user.id, email: user.email, permissions };
  } catch {
    return null;
  }
}

/** List all SF users (admin only). */
export async function listSFUsers(
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string },
): Promise<SFUser[]> {
  try {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users?per_page=50`, {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    });
    const data: any = await res.json();
    return (data.users || []).map((u: any) => {
      const meta = u.user_metadata || {};
      return {
        id: u.id,
        email: u.email,
        permissions: {
          display_name: meta.display_name || u.email,
          role:         meta.role         || 'rep',
          modules:      Array.isArray(meta.modules)  ? meta.modules  : [],
          features:     Array.isArray(meta.features) ? meta.features : [],
          markets:      Array.isArray(meta.markets)  ? meta.markets  : [],
        },
      };
    });
  } catch {
    return [];
  }
}

/** Update a user's permissions (admin only). Merges with existing metadata. */
export async function updateSFUserPermissions(
  userId: string,
  permissions: Partial<SFPermissions>,
  env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string },
): Promise<boolean> {
  try {
    // Read existing metadata first so we don't wipe keys we're not touching.
    // Only spread keys that are actually provided (not undefined) so existing values survive.
    const existing = await getSFUser(null, env, userId);
    const provided = Object.fromEntries(
      Object.entries(permissions).filter(([, v]) => v !== undefined),
    );
    const merged = { ...(existing?.permissions || {}), ...provided };

    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/admin/users/${userId}`, {
      method: 'PUT',
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ user_metadata: merged }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Permission checks ────────────────────────────────────────────────────────

export function hasModule(user: SFUser, module: string): boolean {
  const m = user.permissions.modules;
  return m.includes('*') || m.includes(module);
}

export function hasFeature(user: SFUser, feature: string): boolean {
  const f = user.permissions.features;
  return f.includes('*') || f.includes(feature);
}

/** Returns null for all-markets, or a string[] of allowed state codes. */
export function allowedMarkets(user: SFUser): string[] | null {
  const m = user.permissions.markets;
  return m.includes('*') ? null : m;
}

export function isAdmin(user: SFUser): boolean {
  return user.permissions.role === 'admin';
}
