// ─────────────────────────────────────────────────────────────────────────────
// Highsman Sales Floor — Rep Registry
// ─────────────────────────────────────────────────────────────────────────────
// One parametrized /sales-floor dashboard serves every rep. Each rep has:
//   • Their own login password (the password IS how we identify them).
//   • Their own Gmail sender (routes through rep-specific env vars).
//   • Optional Zoho Owner ID filter so "your book" = records you own.
//
// Adding a new rep = one entry below + three Oxygen env vars (the Gmail OAuth
// triple for their @highsman.com mailbox). No route forking, no copy-paste.
//
// Lookups by password are done via `findRepByPassword()` inside the login
// action; lookups by cookie ID go through `findRepById()` (used by every
// sales-floor API route to scope data to the caller).
//
// IMPORTANT: passwords live in-code for now — the surface is intentionally
// small (2–3 reps) and rotation is a one-line PR. If the list ever grows
// past that, move to Oxygen env vars (`SALES_FLOOR_PASSWORDS` JSON blob) or
// a tiny KV lookup, and delete the inline passwords here.
// ─────────────────────────────────────────────────────────────────────────────

export type SalesRepId = 'sky';

export type SalesRepGmailConfig = {
  // Env var NAMES that hold this rep's Google OAuth credentials on Oxygen.
  // Sky reuses the pre-existing GMAIL_* triple so no env changes are needed
  // to ship this refactor. Future reps get their own prefix.
  clientIdVar: string;
  clientSecretVar: string;
  refreshTokenVar: string;
  // Optional override env var that holds the From address. If unset, falls
  // back to `defaultFrom` below.
  fromVar?: string;
  // Hard-coded fallback address if the fromVar is missing (should match the
  // mailbox that actually granted the refresh token).
  defaultFrom: string;
  // Display name rendered in the From header ("Sky Lima" not "Highsman Sales"
  // is a deliberate swap — people reply faster to a human name).
  fromName: string;
};

export type SalesRep = {
  id: SalesRepId;
  displayName: string;   // "Sky Lima"
  firstName: string;     // used in greetings
  email: string;         // primary inbox
  password: string;      // login secret — rep-unique
  // Zoho CRM user ID to filter by. If set, /api/sales-floor-sync adds
  // `criteria=(Owner.id:equals:{id})` so the rep only sees their book.
  // Leave null to show the full team's book (Sky for now — Reid wants him
  // to see everything until a second rep is in seat).
  zohoOwnerId: string | null;
  gmail: SalesRepGmailConfig;
  // Plain-text signature appended to template emails after a blank line.
  signature: string;
  // Short tagline shown under the greeting on the dashboard.
  tagline?: string;
};

export const SALES_REPS: Record<SalesRepId, SalesRep> = {
  sky: {
    id: 'sky',
    displayName: 'Sky Lima',
    firstName: 'Sky',
    email: 'sky@highsman.com',
    password: 'hmexec2025$$',
    zohoOwnerId: null, // unfiltered view for now — switch to Sky's Zoho user ID to scope
    gmail: {
      clientIdVar: 'GMAIL_CLIENT_ID',
      clientSecretVar: 'GMAIL_CLIENT_SECRET',
      refreshTokenVar: 'GMAIL_REFRESH_TOKEN',
      fromVar: 'GMAIL_SALES_FROM',
      defaultFrom: 'sky@highsman.com',
      fromName: 'Sky Lima — Highsman',
    },
    signature: [
      'Sky Lima',
      'Highsman',
      'sky@highsman.com',
      'highsman.com',
    ].join('\n'),
    tagline: 'Spark Greatness™',
  },
};

// ─── Lookups ────────────────────────────────────────────────────────────────

export function findRepByPassword(password: string): SalesRep | null {
  if (!password) return null;
  for (const rep of Object.values(SALES_REPS)) {
    if (rep.password === password) return rep;
  }
  return null;
}

export function findRepById(id: string | null | undefined): SalesRep | null {
  if (!id) return null;
  return (SALES_REPS as Record<string, SalesRep>)[id] || null;
}

// Safe public projection — never includes passwords or env var names.
// Use this when injecting rep info into the dashboard HTML (client-visible).
export type SalesRepPublic = {
  id: string;
  displayName: string;
  firstName: string;
  email: string;
  signature: string;
  tagline: string;
};

export function toPublic(rep: SalesRep): SalesRepPublic {
  return {
    id: rep.id,
    displayName: rep.displayName,
    firstName: rep.firstName,
    email: rep.email,
    signature: rep.signature,
    tagline: rep.tagline || 'Spark Greatness™',
  };
}

// ─── Cookie helpers ─────────────────────────────────────────────────────────
// Two cookies on purpose:
//   sales_floor_auth=1           → presence = logged in
//   sales_floor_rep=<id>         → which rep is logged in
// Two cookies (vs one) keeps the old isAuthenticated() guard working while we
// add the rep dimension, and makes logout a single-line clear of both.

export const AUTH_COOKIE_NAME = 'sales_floor_auth';
export const REP_COOKIE_NAME = 'sales_floor_rep';

export function parseSalesFloorCookies(cookieHeader: string | null | undefined): {
  authed: boolean;
  repId: string | null;
} {
  const header = cookieHeader || '';
  const authed = /(^|;\s*)sales_floor_auth=1(;|$)/.test(header);
  const match = header.match(/(?:^|;\s*)sales_floor_rep=([^;]+)/);
  const repId = match ? decodeURIComponent(match[1]) : null;
  return {authed, repId};
}

// Build the Set-Cookie header pair for a successful login. Path scoped to
// /sales-floor so these cookies never leak to the rest of the site.
export function buildLoginCookieHeaders(repId: SalesRepId): string[] {
  const common = `Path=/sales-floor; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
  return [
    `${AUTH_COOKIE_NAME}=1; ${common}`,
    `${REP_COOKIE_NAME}=${encodeURIComponent(repId)}; ${common}`,
  ];
}

// Build the expired Set-Cookie pair for logout (Max-Age=0 clears).
export function buildLogoutCookieHeaders(): string[] {
  const common = `Path=/sales-floor; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return [
    `${AUTH_COOKIE_NAME}=; ${common}`,
    `${REP_COOKIE_NAME}=; ${common}`,
  ];
}

// Read the current rep from a request (or null if unauthenticated / no rep).
// Every sales-floor API route should call this FIRST to decide what to return.
export function getRepFromRequest(request: Request): SalesRep | null {
  const {authed, repId} = parseSalesFloorCookies(request.headers.get('Cookie'));
  if (!authed) return null;
  return findRepById(repId);
}
