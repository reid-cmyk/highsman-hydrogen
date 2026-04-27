import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isCalendarSAConfigured} from '~/lib/google-calendar-sa';

// ─────────────────────────────────────────────────────────────────────────────
// /api/diag-calendar
// ─────────────────────────────────────────────────────────────────────────────
// Read-only diagnostic for the Google Calendar SA setup.
//
// Steps:
//   1. Confirm GOOGLE_SA_CLIENT_EMAIL + GOOGLE_SA_PRIVATE_KEY are present.
//   2. Mint a Calendar token impersonating popups@highsman.com with the
//      calendar.events scope.
//   3. GET events.list with maxResults=1 — confirms the scope was actually
//      authorized in admin.google.com domain-wide delegation.
//
// Returns structured JSON. NO calendar data is leaked — just booleans + the
// upstream HTTP status / first 200 chars of any error string. Safe to curl.
//
// Usage:
//   curl https://highsman.com/api/diag-calendar
// ─────────────────────────────────────────────────────────────────────────────

const CALENDAR_OWNER = 'popups@highsman.com';

export async function loader({context}: LoaderFunctionArgs) {
  const env = (context.env || {}) as Record<string, string | undefined>;

  const result: {
    ok: boolean;
    saConfigured: boolean;
    tokenMinted: boolean;
    eventsListOk: boolean;
    httpStatus?: number;
    eventCountReturned?: number;
    errorStage?: 'config' | 'token' | 'events.list';
    errorMessage?: string;
    hint?: string;
  } = {
    ok: false,
    saConfigured: false,
    tokenMinted: false,
    eventsListOk: false,
  };

  if (!isCalendarSAConfigured(env)) {
    result.errorStage = 'config';
    result.errorMessage =
      'GOOGLE_SA_CLIENT_EMAIL and/or GOOGLE_SA_PRIVATE_KEY are not set in Oxygen env.';
    return json(result, {status: 200});
  }
  result.saConfigured = true;

  // Step 2 — mint token. We re-implement the JWT here (instead of importing
  // from the lib) so the diagnostic clearly reports WHICH stage broke.
  let accessToken: string;
  try {
    accessToken = await mintCalendarToken(env, CALENDAR_OWNER);
    result.tokenMinted = true;
  } catch (err: any) {
    result.errorStage = 'token';
    result.errorMessage = String(err?.message || err).slice(0, 400);
    if (/invalid_grant|unauthorized_client/i.test(result.errorMessage)) {
      result.hint =
        'unauthorized_client usually means the calendar.events scope was NOT added to the SA Client ID 102137292617151899463 in admin.google.com → Domain-wide delegation. Double-check the scope string is exactly: https://www.googleapis.com/auth/calendar.events';
    }
    return json(result, {status: 200});
  }

  // Step 3 — read-only events.list call. maxResults=1 keeps payload tiny.
  try {
    const url =
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(CALENDAR_OWNER)}/events` +
      `?maxResults=1&showDeleted=false&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(new Date().toISOString())}`;
    const res = await fetch(url, {
      headers: {Authorization: `Bearer ${accessToken}`},
    });
    result.httpStatus = res.status;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      result.errorStage = 'events.list';
      result.errorMessage = text.slice(0, 400);
      if (res.status === 403 && /insufficient/i.test(text)) {
        result.hint =
          'insufficient_scope = scope is recognized but not authorized for this SA. Add https://www.googleapis.com/auth/calendar.events in admin.google.com → Domain-wide delegation for Client ID 102137292617151899463.';
      } else if (res.status === 404) {
        result.hint =
          'Calendar not found — popups@highsman.com may not exist as a Workspace user, or its primary calendar has never been opened. Sign in to popups@ once and accept the calendar TOS.';
      }
      return json(result, {status: 200});
    }
    const data = (await res.json().catch(() => ({}))) as {items?: any[]};
    result.eventsListOk = true;
    result.eventCountReturned = (data.items || []).length;
    result.ok = true;
    return json(result, {status: 200});
  } catch (err: any) {
    result.errorStage = 'events.list';
    result.errorMessage = String(err?.message || err).slice(0, 400);
    return json(result, {status: 200});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Local JWT minting — duplicated from google-calendar-sa.ts so this diagnostic
// is fully self-contained and surfaces stage-specific errors clearly.
// ─────────────────────────────────────────────────────────────────────────────
async function mintCalendarToken(
  env: Record<string, string | undefined>,
  subject: string,
): Promise<string> {
  const clientEmail = env.GOOGLE_SA_CLIENT_EMAIL!.trim();
  const privateKeyPem = env.GOOGLE_SA_PRIVATE_KEY!.replace(/\\n/g, '\n').trim();

  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'RS256', typ: 'JWT'};
  const payload = {
    iss: clientEmail,
    sub: subject,
    scope: 'https://www.googleapis.com/auth/calendar.events',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };

  const encode = (s: string | Uint8Array) => {
    const bytes = typeof s === 'string' ? new TextEncoder().encode(s) : s;
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  };

  const signingInput = `${encode(JSON.stringify(header))}.${encode(JSON.stringify(payload))}`;

  const pemBody = privateKeyPem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(pemBody);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);

  const key = await crypto.subtle.importKey(
    'pkcs8',
    der.buffer,
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const assertion = `${signingInput}.${encode(new Uint8Array(sig))}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Token exchange ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {access_token?: string};
  if (!data.access_token) throw new Error('Token endpoint returned no access_token');
  return data.access_token;
}
