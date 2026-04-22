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

// Per-rep Quo (formerly OpenPhone) config. The Quo account model has one
// phone number per Quo user — so each rep gets their own number + Quo user
// ID, and we look those up by the env-var name pattern.
//
// For SMS send: we need either the rep's E.164 number (preferred — Quo's
// `from` accepts E.164 directly) or their phone number id (PN...).
// For Zoho attribution: we use the rep's existing `zohoOwnerId` field to
// own the Note that gets created on send.
//
// Sky is the only Quo seat right now, so her phoneNumberIdVar can reuse the
// workspace-wide QUO_PHONE_NUMBER_ID env (same number). When rep #2 gets a
// Quo seat, give them their own QUO_PHONE_NUMBER_ID_<NAME> env var.
export type SalesRepQuoConfig = {
  // Display E.164 — used in UI and as the `from` value on outbound SMS.
  // Authoritative source for "who is this rep texting from".
  numberE164: string;
  // Env var holding the Quo phoneNumberId (PN…). Optional: if numberE164
  // is set we can use it as `from` directly. Keeping it lets us also
  // pass phoneNumberId to message-list endpoints which require it.
  phoneNumberIdVar?: string;
  // Env var holding the Quo userId (US…) for this rep. Optional: when set,
  // we attach `userId` to outbound POST /messages so the message shows up
  // in the right rep's Quo inbox (not just the workspace's).
  userIdVar?: string;
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
  // Quo (SMS + calling) config — null for reps who don't have a Quo seat.
  quo?: SalesRepQuoConfig | null;
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
    quo: {
      // Sky's Quo line — same number used by the workspace-wide
      // QUO_PHONE_NUMBER_ID env, so we reuse that env var for the
      // phoneNumberId. When Reid's seat goes live, give him QUO_PHONE_NUMBER_ID_REID.
      numberE164: '+19297253511',
      phoneNumberIdVar: 'QUO_PHONE_NUMBER_ID',
      userIdVar: 'QUO_USER_ID_SKY',
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

// Build the Set-Cookie header pair for a successful login.
//
// Path=/ (NOT /sales-floor): the dashboard UI lives under /sales-floor/* but
// every XHR it makes goes to /api/sales-floor-* (sync, send-email, send-sms,
// set-account-buyer, task-complete, …). Per RFC 6265, a cookie scoped to
// /sales-floor does NOT match request paths starting with /api, so those
// endpoints received no cookie and silently 401'd (or fell back to an
// unfiltered view). We hit this on Set Buyer in Apr 2026 — "Could not save
// buyer: unauthorized" — even though the user was clearly logged in.
// HttpOnly keeps the cookies out of page JS, so broadening Path to / is safe.
export function buildLoginCookieHeaders(repId: SalesRepId): string[] {
  const common = `Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`;
  return [
    `${AUTH_COOKIE_NAME}=1; ${common}`,
    `${REP_COOKIE_NAME}=${encodeURIComponent(repId)}; ${common}`,
  ];
}

// Build the expired Set-Cookie pair for logout (Max-Age=0 clears).
// Also clear the legacy Path=/sales-floor cookies from pre-Apr-2026 sessions
// so the logout actually clears state for users who logged in before the
// cookie-path fix (browsers treat Path=/ and Path=/sales-floor as separate
// cookie jars — we have to expire both).
export function buildLogoutCookieHeaders(): string[] {
  const common = `HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
  return [
    `${AUTH_COOKIE_NAME}=; Path=/; ${common}`,
    `${REP_COOKIE_NAME}=; Path=/; ${common}`,
    // Legacy path — clears any cookie still lingering from before the broaden.
    `${AUTH_COOKIE_NAME}=; Path=/sales-floor; ${common}`,
    `${REP_COOKIE_NAME}=; Path=/sales-floor; ${common}`,
  ];
}

// Read the current rep from a request (or null if unauthenticated / no rep).
// Every sales-floor API route should call this FIRST to decide what to return.
export function getRepFromRequest(request: Request): SalesRep | null {
  const {authed, repId} = parseSalesFloorCookies(request.headers.get('Cookie'));
  if (!authed) return null;
  return findRepById(repId);
}
