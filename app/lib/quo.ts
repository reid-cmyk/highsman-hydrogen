// ─────────────────────────────────────────────────────────────────────────────
// Quo (formerly OpenPhone) — Shared Client Helpers
// ─────────────────────────────────────────────────────────────────────────────
// Quo's API is REST/JSON, base `https://api.openphone.com/v1/`. The auth
// header is the API key VERBATIM (no `Bearer` prefix — that's an OpenPhone
// quirk that bites every integrator at least once).
//
// All Quo env vars live on Oxygen as secrets:
//   QUO_API_KEY           — workspace API key (Settings → API)
//   QUO_PHONE_NUMBER_ID   — the "Sales" line ID, e.g. PN66zgjPHr
//   QUO_WEBHOOK_SECRET    — used to verify inbound webhook signatures
//   QUO_SALES_LINE_FROM   — E.164 formatted Sales number (display only)
//
// We map a Quo `user.id` → Highsman rep via a small in-memory table built from
// SALES_REPS. Keep that table in sync as new reps come on. (Quo doesn't have
// a tag/custom-field on the user object that mirrors our rep id, so the
// mapping is by email.)
// ─────────────────────────────────────────────────────────────────────────────

import {SALES_REPS, type SalesRep} from './sales-floor-reps';

export const QUO_API_BASE = 'https://api.openphone.com/v1';

export type QuoEnv = {
  QUO_API_KEY?: string;
  QUO_PHONE_NUMBER_ID?: string;
  QUO_WEBHOOK_SECRET?: string;
  QUO_SALES_LINE_FROM?: string;
};

export function isQuoConfigured(env: QuoEnv): boolean {
  return !!env.QUO_API_KEY && !!env.QUO_PHONE_NUMBER_ID;
}

// ─── Quo HTTP wrapper ───────────────────────────────────────────────────────
// Always pass the API key as the bare `Authorization` header value (no
// `Bearer`). 4xx/5xx are surfaced as Errors with the response body trimmed
// to 300 chars so logs stay readable.
export async function quoFetch<T = any>(
  apiKey: string,
  path: string,
  init?: RequestInit & {query?: Record<string, string | number | undefined>},
): Promise<T> {
  const url = new URL(`${QUO_API_BASE}${path}`);
  if (init?.query) {
    for (const [k, v] of Object.entries(init.query)) {
      if (v != null) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    ...init,
    headers: {
      'Authorization': apiKey,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Quo ${path} ${res.status}: ${text.slice(0, 300)}`);
  }
  if (res.status === 204) return null as T;
  return (await res.json()) as T;
}

// ─── Recent calls fetcher ───────────────────────────────────────────────────
// GET /v1/calls?phoneNumberId=...&maxResults=...
// Returns the raw Quo Call objects (we trim them for the dashboard widget
// in the route handler — keep this layer pure).
export type QuoCall = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;             // 'completed' | 'no-answer' | 'busy' | 'missed' | 'voicemail' | ...
  duration: number;           // seconds
  createdAt: string;          // ISO
  completedAt?: string;
  answeredAt?: string;
  from: string;               // E.164 (call participant on the other side for incoming)
  to: string[] | string;      // outgoing → array; incoming → string
  participants: string[];     // E.164 list
  userId?: string;            // Quo user who owns this leg
  phoneNumberId: string;
  voicemail?: {url?: string; duration?: number};
  recordingUrl?: string;
  ai?: {summary?: string; transcript?: string};
};

export async function fetchRecentCalls(
  apiKey: string,
  phoneNumberId: string,
  maxResults = 25,
): Promise<QuoCall[]> {
  const data = await quoFetch<{data: QuoCall[]}>(apiKey, '/calls', {
    query: {phoneNumberId, maxResults},
  });
  return data?.data || [];
}

// Look up a single Quo user by id (used by webhook to attribute to the rep
// who actually made/took the call — Sky vs Reid).
export async function fetchQuoUser(
  apiKey: string,
  userId: string,
): Promise<{id: string; email?: string; firstName?: string; lastName?: string} | null> {
  try {
    const user = await quoFetch<any>(apiKey, `/users/${encodeURIComponent(userId)}`);
    return user || null;
  } catch {
    return null;
  }
}

// ─── Quo user.id → Highsman rep mapping ─────────────────────────────────────
// Two paths:
//   1. Webhook payload includes `user.id` + `user.email` → use the email.
//   2. Webhook payload only has `user.id` → call fetchQuoUser to resolve email.
// Either way, we then match email (case-insensitive) against SALES_REPS.
export function repByEmail(email: string | null | undefined): SalesRep | null {
  if (!email) return null;
  const norm = email.trim().toLowerCase();
  for (const rep of Object.values(SALES_REPS)) {
    if (rep.email.toLowerCase() === norm) return rep;
  }
  return null;
}

// ─── Webhook signature verification ─────────────────────────────────────────
// Quo signs every webhook with `openphone-signature` header in the format:
//   `hmac;{version};{timestamp};{base64-signature}`
// where `{base64-signature}` is HMAC-SHA256 over `{timestamp}.{rawBody}`
// using the secret you configured when creating the webhook (NOT the API key).
//
// We re-compute it on the server and constant-time compare. If anything is
// off (bad format, version mismatch, timestamp drift > 5 min, sig mismatch)
// we return false and the route returns 401.
export async function verifyQuoSignature(
  rawBody: string,
  header: string | null | undefined,
  secret: string,
): Promise<boolean> {
  if (!header || !secret) return false;
  const parts = header.split(';');
  if (parts.length !== 4 || parts[0] !== 'hmac') return false;
  const version = parts[1];
  const timestamp = parts[2];
  const sig = parts[3];
  if (version !== '1') return false;

  // Reject anything older than 5 minutes — replay protection.
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const drift = Math.abs(Date.now() - ts);
  if (drift > 5 * 60 * 1000) return false;

  const enc = new TextEncoder();
  // Quo/OpenPhone issues the signing secret as a base64-encoded random byte
  // sequence (44 chars = 32 decoded bytes). The HMAC key has to be the raw
  // decoded bytes — NOT the base64 string itself. Using the string produces
  // a signature that never matches what Quo sends, and every webhook 401s.
  const keyBytes = base64ToBytes(secret);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );
  const data = enc.encode(`${timestamp}.${rawBody}`);
  const computed = await crypto.subtle.sign('HMAC', key, data);
  const computedB64 = btoa(String.fromCharCode(...new Uint8Array(computed)));
  return constantTimeEquals(computedB64, sig);
}

// Decode a base64 (standard or url-safe, padded or not) string into raw
// bytes. Used to turn the Quo signing secret into HMAC key material.
function base64ToBytes(b64: string): Uint8Array {
  let s = b64.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) s += '=';
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// ─── SMS / Messages ─────────────────────────────────────────────────────────
// Quo's API expects:
//   POST /v1/messages
//     { content, from, to: [E.164], userId?, setInboxStatus? }
//   GET /v1/messages?phoneNumberId=PN…&participants[]=+1…&maxResults=N
// `from` accepts EITHER an E.164 number OR a phoneNumberId (PN…). E.164 is
// less brittle (no env-var lookup needed) so that's our default.

export type QuoMessage = {
  id: string;
  to: string[];
  from: string;
  text: string;
  phoneNumberId: string;
  direction: 'incoming' | 'outgoing';
  userId?: string;
  status: string;            // queued | sent | delivered | failed | received
  createdAt: string;
  updatedAt?: string;
};

export type SendSmsInput = {
  apiKey: string;
  fromE164: string;          // e.g. "+19297253511"
  toE164: string;            // single recipient
  content: string;           // 1-1600 chars, must contain non-whitespace
  userId?: string;           // optional Quo user (US…) — attributes to a seat
};

export async function sendSms(input: SendSmsInput): Promise<QuoMessage> {
  const body: any = {
    content: input.content,
    from: input.fromE164,
    to: [input.toE164],
  };
  if (input.userId) body.userId = input.userId;
  const data = await quoFetch<{data: QuoMessage}>(input.apiKey, '/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return data?.data;
}

export async function listMessagesWith(
  apiKey: string,
  phoneNumberId: string,
  participantE164: string,
  maxResults = 50,
): Promise<QuoMessage[]> {
  const url = new URL(`${QUO_API_BASE}/messages`);
  url.searchParams.set('phoneNumberId', phoneNumberId);
  url.searchParams.append('participants[]', participantE164);
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url.toString(), {
    headers: {Authorization: apiKey, 'Content-Type': 'application/json'},
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Quo /messages ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.data || [];
}

// Quo `/v1/conversations` returns one row per unique participant pairing
// for a given phone number. Useful for the SMS thread list.
export type QuoConversation = {
  id: string;
  phoneNumberId: string;
  participants: string[];     // [counterparty E.164]
  lastActivityAt?: string;
  lastActivityType?: string;  // 'message' | 'call'
  unreadCount?: number;
  name?: string;
};

export async function listConversations(
  apiKey: string,
  phoneNumberId: string,
  maxResults = 25,
): Promise<QuoConversation[]> {
  // The conversations endpoint accepts phoneNumbers[] (array). We pass the
  // single rep number to get just their threads. Some shapes return `data`,
  // some return `conversations` — handle both.
  const url = new URL(`${QUO_API_BASE}/conversations`);
  url.searchParams.append('phoneNumbers[]', phoneNumberId);
  url.searchParams.set('maxResults', String(maxResults));
  const res = await fetch(url.toString(), {
    headers: {Authorization: apiKey, 'Content-Type': 'application/json'},
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Quo /conversations ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.data || data?.conversations || [];
}

// ─── Format helpers (used by both server JSON shaping + webhook → Zoho) ─────
export function formatPhoneE164(p: string | null | undefined): string {
  if (!p) return '';
  // Strip everything but digits + leading +
  const cleaned = String(p).replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length === 10) return `+1${cleaned}`;
  if (cleaned.length === 11 && cleaned.startsWith('1')) return `+${cleaned}`;
  return cleaned;
}

// Pretty (213) 555-9876 — used by the Recent Calls widget in the UI.
export function formatPhonePretty(p: string | null | undefined): string {
  if (!p) return '';
  const e164 = formatPhoneE164(p);
  const digits = e164.replace(/[^\d]/g, '');
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return e164 || String(p);
}

// Map Quo call status → human label for the Recent Calls list.
export function callStatusLabel(c: Pick<QuoCall, 'status' | 'direction'>): string {
  const s = (c.status || '').toLowerCase();
  if (s === 'completed') return 'Completed';
  if (s === 'no-answer' || s === 'noanswer') return c.direction === 'incoming' ? 'Missed' : 'No answer';
  if (s === 'busy') return 'Busy';
  if (s === 'missed') return 'Missed';
  if (s === 'voicemail') return 'Voicemail';
  if (s === 'forwarded') return 'Forwarded';
  if (s === 'in-progress' || s === 'inprogress') return 'In progress';
  if (s === 'ringing') return 'Ringing';
  return c.status || 'Unknown';
}
