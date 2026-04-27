// ─────────────────────────────────────────────────────────────────────────────
// Google Calendar — Service Account Helper (Domain-Wide Delegation)
// ─────────────────────────────────────────────────────────────────────────────
// Companion to gmail-sa.ts. Same `highsman-brief-reader` service account, same
// JWT-from-scratch RS256 signing flow, just a different scope and endpoint.
//
// Used by /api/popups-book to drop confirmed pop-up shifts onto
// popups@highsman.com's primary calendar AND auto-invite the dispensary POC
// (and reps / sales@) so everyone gets a native Google/Outlook calendar entry
// with no extra clicks.
//
// REQUIRED SETUP (one-time, in Google Workspace admin):
//   admin.google.com → Security → API controls → Domain-wide delegation
//   Add scope to existing Client ID 102137292617151899463:
//     - https://www.googleapis.com/auth/calendar.events
//
// Until that scope is added, calls here will 403 with "insufficient_scope" or
// the SA token exchange will reject the assertion. The /api/popups-book route
// catches that and degrades gracefully — Zoho Event + email still go through.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events'];

type TokenCacheEntry = {token: string; expiresAt: number};
const tokenCache = new Map<string, TokenCacheEntry>();

type SAConfig = {clientEmail: string; privateKeyPem: string};

function resolveSAConfig(env: Record<string, string | undefined>): SAConfig | null {
  const clientEmail = env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const rawKey = env.GOOGLE_SA_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;
  const privateKeyPem = rawKey.replace(/\\n/g, '\n').trim();
  if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) return null;
  return {clientEmail, privateKeyPem};
}

export function isCalendarSAConfigured(env: Record<string, string | undefined>): boolean {
  return resolveSAConfig(env) !== null;
}

function b64url(input: string | Uint8Array): string {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, '').replace(/-----END [^-]+-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  );
}

async function buildAssertion(sa: SAConfig, subject: string, scopes: string[]): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'RS256', typ: 'JWT'};
  const payload = {
    iss: sa.clientEmail,
    sub: subject,
    scope: scopes.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const key = await importPrivateKey(sa.privateKeyPem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

async function getCalendarAccessTokenForUser(
  userEmail: string,
  env: Record<string, string | undefined>,
  scopes: string[] = CALENDAR_SCOPES,
): Promise<string> {
  const sa = resolveSAConfig(env);
  if (!sa) {
    throw new Error('Calendar service account not configured.');
  }
  const target = userEmail.trim().toLowerCase();
  if (!target) throw new Error('getCalendarAccessTokenForUser: userEmail required.');

  const cacheKey = `${target}:${scopes.join(',')}`;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt) return cached.token;

  const assertion = await buildAssertion(sa, target, scopes);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Calendar SA token exchange failed (${res.status}): ${txt.slice(0, 300)}`);
  }
  const data = (await res.json()) as {access_token: string; expires_in?: number};
  tokenCache.set(cacheKey, {token: data.access_token, expiresAt: now + 55 * 60 * 1000});
  return data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export type CalendarEventInput = {
  // Mailbox whose calendar the event lands on (always popups@highsman.com).
  calendarOwner: string;
  summary: string;
  description?: string;
  location?: string;
  // ISO-8601 with explicit timezone offset (e.g. "2026-05-15T15:00:00-04:00")
  startDateTime: string;
  endDateTime: string;
  timeZone?: string; // IANA tz, default America/New_York
  attendees: string[]; // raw emails — duplicates dropped, owner self-skipped
  // sendUpdates=all → Google emails calendar invitations to every attendee.
  sendUpdates?: 'all' | 'externalOnly' | 'none';
};

export type CalendarEventResult = {
  id: string;
  htmlLink?: string;
  hangoutLink?: string;
  status?: string;
};

/**
 * Insert a Google Calendar event on the given owner's primary calendar via
 * the service account's domain-wide delegation. Attendees are auto-invited
 * (Google sends the canonical calendar invite emails, .ics included).
 *
 * Throws on configuration issues or non-2xx responses. Callers should wrap in
 * try/catch and degrade gracefully — the booking flow can still succeed
 * without the calendar event.
 */
export async function createCalendarEvent(
  input: CalendarEventInput,
  env: Record<string, string | undefined>,
): Promise<CalendarEventResult> {
  const owner = input.calendarOwner.trim().toLowerCase();
  if (!owner) throw new Error('createCalendarEvent: calendarOwner required.');

  const token = await getCalendarAccessTokenForUser(owner, env);

  // Dedupe attendees, drop the calendar owner (Google adds them implicitly),
  // and lowercase for stable equality.
  const seen = new Set<string>();
  const attendees: Array<{email: string}> = [];
  for (const raw of input.attendees) {
    const e = (raw || '').trim().toLowerCase();
    if (!e || e === owner || seen.has(e)) continue;
    seen.add(e);
    attendees.push({email: e});
  }

  const tz = input.timeZone || 'America/New_York';
  const body = {
    summary: input.summary,
    description: input.description || '',
    location: input.location || '',
    start: {dateTime: input.startDateTime, timeZone: tz},
    end: {dateTime: input.endDateTime, timeZone: tz},
    attendees,
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    reminders: {
      useDefault: false,
      overrides: [
        {method: 'email', minutes: 24 * 60}, // 1 day before
        {method: 'popup', minutes: 60}, // 1 hour before
      ],
    },
  };

  const sendUpdates = input.sendUpdates || 'all';
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(owner)}/events` +
    `?sendUpdates=${sendUpdates}&conferenceDataVersion=0`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar event insert ${res.status}: ${text.slice(0, 400)}`);
  }
  const data = (await res.json().catch(() => ({}))) as CalendarEventResult;
  return {
    id: data.id || '',
    htmlLink: data.htmlLink,
    hangoutLink: data.hangoutLink,
    status: data.status,
  };
}

/**
 * Delete a Google Calendar event from the given owner's calendar via the
 * service account's domain-wide delegation. Sends cancellation notices to
 * all attendees by default — the dispensary POC, the Highsman rep, and
 * sales@ all get the standard "Event has been canceled" email automatically.
 *
 * Returns true on success or 410 (already gone). Throws on auth/config issues.
 */
export async function deleteCalendarEvent(
  args: {calendarOwner: string; eventId: string; sendUpdates?: 'all' | 'externalOnly' | 'none'},
  env: Record<string, string | undefined>,
): Promise<boolean> {
  const owner = args.calendarOwner.trim().toLowerCase();
  const eventId = args.eventId.trim();
  if (!owner) throw new Error('deleteCalendarEvent: calendarOwner required.');
  if (!eventId) throw new Error('deleteCalendarEvent: eventId required.');

  const token = await getCalendarAccessTokenForUser(owner, env);
  const sendUpdates = args.sendUpdates || 'all';
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(owner)}/events/${encodeURIComponent(eventId)}` +
    `?sendUpdates=${sendUpdates}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {authorization: `Bearer ${token}`},
  });

  if (res.status === 204 || res.status === 200 || res.status === 410) return true;
  const text = await res.text().catch(() => '');
  throw new Error(`Calendar event delete ${res.status}: ${text.slice(0, 400)}`);
}

/**
 * Find Google Calendar event IDs on the given owner's calendar that match a
 * date + a substring in the summary. Used by /api/popups-cancel as a fuzzy
 * fallback when the explicit Calendar Event ID isn't stamped on the Zoho
 * Event Description (legacy bookings, or cases where the PATCH failed).
 *
 * Returns an array of matching event IDs (could be 0, 1, or many — caller
 * decides whether to delete all matches).
 */
export async function findCalendarEventsByTitle(
  args: {
    calendarOwner: string;
    date: string; // YYYY-MM-DD in the calendar's local timezone
    titleContains: string;
  },
  env: Record<string, string | undefined>,
): Promise<string[]> {
  const owner = args.calendarOwner.trim().toLowerCase();
  const needle = args.titleContains.trim().toLowerCase();
  if (!owner || !needle || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) return [];

  const token = await getCalendarAccessTokenForUser(owner, env);
  // 24-hour window in UTC — Calendar API accepts any ISO offset and converts.
  const timeMin = `${args.date}T00:00:00-12:00`;
  const timeMax = `${args.date}T23:59:59+14:00`;

  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(owner)}/events` +
    `?timeMin=${encodeURIComponent(timeMin)}` +
    `&timeMax=${encodeURIComponent(timeMax)}` +
    `&singleEvents=true&maxResults=100&showDeleted=false`;

  const res = await fetch(url, {
    headers: {authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Calendar list ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as {items?: Array<{id?: string; summary?: string; status?: string}>};
  const items = data.items || [];
  return items
    .filter((it) => it.status !== 'cancelled')
    .filter((it) => (it.summary || '').toLowerCase().includes(needle))
    .map((it) => it.id || '')
    .filter(Boolean);
}

