import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {
  verifyQuoSignature,
  fetchQuoUser,
  repByEmail,
  formatPhoneE164,
  type QuoCall,
} from '../lib/quo';
import {SALES_REPS, type SalesRep} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Quo → Zoho CRM Bridge
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/quo-webhook
//
// Accepts every Quo webhook event and conditionally writes a Zoho Call
// activity. The flow:
//
//   1. Verify the `openphone-signature` header against QUO_WEBHOOK_SECRET.
//      Reject with 401 on any failure (bad format, drift, sig mismatch).
//      No retries from Quo trigger Zoho writes.
//
//   2. Branch on `type`:
//        call.completed              → create the Zoho Call record (or
//                                      update the placeholder if we already
//                                      have one keyed by Quo call id)
//        call.summary.completed      → append AI summary to the existing
//                                      Description (Description += summary)
//        call.transcript.completed   → append the transcript URL marker so
//                                      reps can pull the full text in Zoho
//        message.received / message.delivered → no-op for now (SMS comes
//                                      in phase 4)
//
//   3. Match the "other party" phone (E.164) against Zoho Contacts to set
//      Who_Id. If no contact match, the Call is still created (Zoho permits
//      orphan Calls — useful when a rep is dialing a brand-new prospect).
//
//   4. Resolve `userId` on the call → Highsman rep (by email) → use that
//      rep's `zohoOwnerId` as the activity Owner. No mapping = leave Owner
//      to default (whoever the integration token belongs to).
//
// We use a 12-character `quoCallId → Zoho Call id` cache in module memory
// so summary/transcript events can find and update the existing record
// without an extra search round-trip. Cache is best-effort — on a cold
// worker we fall back to a Zoho criteria search by Subject containing the
// Quo call id.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Module-scope state ─────────────────────────────────────────────────────
const quoIdToZohoCallId = new Map<string, string>(); // best-effort cache
let cachedZohoToken: string | null = null;
let zohoTokenExpiresAt = 0;

// Last 10 errors + last 10 successes — temp diag so we can read them via
// /api/zoho-recent-calls. Drop after #41 verified.
type DiagEvent = {at: string; type: string; ok: boolean; detail: string};
const recentEvents: DiagEvent[] = [];
function recordEvent(e: DiagEvent) {
  recentEvents.unshift(e);
  if (recentEvents.length > 20) recentEvents.length = 20;
}
export function getRecentWebhookEvents() {
  return recentEvents.slice();
}

// ─── Zoho helpers (local — webhook is a single-purpose route, no shared DI) ─
async function getZohoToken(env: any): Promise<string> {
  const now = Date.now();
  if (cachedZohoToken && now < zohoTokenExpiresAt) return cachedZohoToken;
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      refresh_token: env.ZOHO_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho token (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedZohoToken = data.access_token;
  zohoTokenExpiresAt = now + 55 * 60 * 1000;
  return cachedZohoToken!;
}

// Find a Zoho Contact whose Phone or Mobile matches the E.164 number.
// We try Mobile first (more accurate for cell-only buyers) then Phone.
// Returns null if nothing matches — Zoho permits Calls without Who_Id.
async function findContactByPhone(token: string, e164: string): Promise<{
  id: string; accountId: string | null; name: string;
} | null> {
  if (!e164) return null;
  // Zoho's phone search wants a substring — try the last 10 digits which
  // is robust across +1 / no-+ / parens variations the CRM holds.
  const last10 = e164.replace(/[^\d]/g, '').slice(-10);
  if (last10.length !== 10) return null;

  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('phone', last10);
  url.searchParams.set('fields', ['Full_Name', 'Account_Name', 'Phone', 'Mobile'].join(','));
  url.searchParams.set('per_page', '5');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return null;
  if (!res.ok) return null;
  const data = await res.json();
  const c = (data.data || [])[0];
  if (!c) return null;
  return {
    id: c.id,
    accountId: c.Account_Name && typeof c.Account_Name === 'object' ? c.Account_Name.id || null : null,
    name: c.Full_Name || 'Unknown Contact',
  };
}

// Map Quo call.direction + status → Zoho Call_Type.
//   outgoing + completed     → Outbound
//   outgoing + no-answer/etc → Outbound
//   incoming + completed     → Inbound
//   incoming + missed/voice  → Missed
function zohoCallType(c: {direction: string; status: string}): 'Inbound' | 'Outbound' | 'Missed' {
  const s = (c.status || '').toLowerCase();
  if (c.direction === 'incoming' && (s === 'missed' || s === 'no-answer' || s === 'voicemail')) {
    return 'Missed';
  }
  return c.direction === 'incoming' ? 'Inbound' : 'Outbound';
}

async function createZohoCall(
  token: string,
  payload: any,
): Promise<string | null> {
  const res = await fetch('https://www.zohoapis.com/crm/v7/Calls', {
    method: 'POST',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [payload]}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    // Surface the full Zoho error + the payload we sent so we can diagnose
    // MANDATORY_NOT_FOUND from the webhook event log without guessing.
    const summary = `Zoho create Call (${res.status}): ${t.slice(0, 1500)} | sent=${JSON.stringify(payload).slice(0, 800)}`;
    throw new Error(summary);
  }
  const data = await res.json();
  const details = data?.data?.[0]?.details;
  return details?.id || null;
}

async function updateZohoCall(token: string, id: string, payload: any): Promise<void> {
  const res = await fetch(`https://www.zohoapis.com/crm/v7/Calls/${id}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [payload]}),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho update Call (${res.status}): ${t.slice(0, 300)}`);
  }
}

// Fallback lookup when our in-memory cache misses (cold worker, or
// summary arrives long after the call). Search by Subject containing the
// Quo call id which we always embed.
async function findZohoCallByQuoId(token: string, quoCallId: string): Promise<string | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Calls/search');
  url.searchParams.set('criteria', `(Subject:contains:${quoCallId})`);
  url.searchParams.set('per_page', '1');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return data?.data?.[0]?.id || null;
}

// ─── Other-party extraction (mirrors quo.ts but runs against the webhook
//     payload shape, which uses singular `to` for incoming and array for
//     outgoing).
function otherPartyFromCall(c: QuoCall): string {
  if (c.direction === 'outgoing') {
    return Array.isArray(c.to) ? (c.to[0] || '') : (c.to || '');
  }
  return c.from || '';
}

// ─── Rep attribution ────────────────────────────────────────────────────────
async function resolveRepFromCall(
  apiKey: string,
  c: QuoCall,
  inlineUser?: {id?: string; email?: string} | null,
): Promise<SalesRep | null> {
  // Prefer email if Quo includes it inline (newer payloads do).
  if (inlineUser?.email) {
    const r = repByEmail(inlineUser.email);
    if (r) return r;
  }
  // Otherwise, look up by user.id.
  const userId = c.userId || inlineUser?.id;
  if (!userId) return null;
  const u = await fetchQuoUser(apiKey, userId);
  return repByEmail(u?.email);
}

// ─── Duration formatter ─────────────────────────────────────────────────────
// Zoho Calls.Call_Duration is a *text* field. From inspection of existing
// records it accepts MM:SS for short calls and HH:MM:SS once you cross an
// hour. We always emit a zero-padded value so sorts work.
function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds || 0));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hh > 0 ? `${pad(hh)}:${pad(mm)}:${pad(ss)}` : `${pad(mm)}:${pad(ss)}`;
}

// ─── Subject builder ────────────────────────────────────────────────────────
// Quo call id goes at the END so the human-readable bit is what shows in
// the Zoho activity timeline. The id is what we search on later when
// summary/transcript events arrive.
function callSubject(c: QuoCall, contactName: string | null): string {
  const direction = c.direction === 'incoming' ? 'Inbound' : 'Outbound';
  const who = contactName || otherPartyFromCall(c) || 'Unknown';
  return `${direction} call with ${who} [quo:${c.id}]`;
}

// ─── Action: webhook receiver ───────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};

  // Read raw body BEFORE parsing — signature check needs the bytes.
  const rawBody = await request.text();
  const sigHeader = request.headers.get('openphone-signature');

  if (!env.QUO_WEBHOOK_SECRET) {
    console.error('[quo-webhook] QUO_WEBHOOK_SECRET missing — rejecting all events');
    return json({ok: false, error: 'webhook secret not configured'}, {status: 503});
  }

  const verified = await verifyQuoSignature(rawBody, sigHeader, env.QUO_WEBHOOK_SECRET);
  if (!verified) {
    console.warn('[quo-webhook] signature verification failed');
    return json({ok: false, error: 'invalid signature'}, {status: 401});
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const eventType: string = body?.type || '';
  const data = body?.data?.object || body?.data || {};

  try {
    if (eventType === 'call.completed') {
      await handleCallCompleted(env, data);
    } else if (eventType === 'call.summary.completed') {
      await handleSummary(env, data);
    } else if (eventType === 'call.transcript.completed') {
      await handleTranscript(env, data);
    } else {
      // Acknowledge but do nothing — Quo won't retry on 200.
      return json({ok: true, ignored: eventType}, {status: 200});
    }
  } catch (err: any) {
    console.error('[quo-webhook] handler error', eventType, err.message);
    recordEvent({at: new Date().toISOString(), type: eventType, ok: false, detail: String(err?.message || err).slice(0, 600)});
    // Returning 200 prevents endless Quo retries for permanent errors
    // (bad Zoho field, deleted contact, etc.). Transient infra issues
    // will surface in our own logs.
    return json({ok: false, error: err.message, eventType}, {status: 200});
  }

  recordEvent({at: new Date().toISOString(), type: eventType, ok: true, detail: ''});
  return json({ok: true, type: eventType}, {status: 200});
}

// Quo will sometimes hit this with a GET when validating the URL after
// you save it in their UI. Return 200 with a friendly message.
export async function loader(_: LoaderFunctionArgs) {
  return json({
    ok: true,
    service: 'quo-webhook',
    accepts: ['call.completed', 'call.summary.completed', 'call.transcript.completed'],
  });
}

// ─── Handlers ───────────────────────────────────────────────────────────────
async function handleCallCompleted(env: any, c: QuoCall) {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    console.warn('[quo-webhook] Zoho not configured — skipping create');
    return;
  }
  const token = await getZohoToken(env);

  const op = otherPartyFromCall(c);
  const e164 = formatPhoneE164(op);
  const contact = await findContactByPhone(token, e164);

  const rep = await resolveRepFromCall(env.QUO_API_KEY, c, (c as any).user);

  const startISO = c.answeredAt || c.completedAt || c.createdAt || new Date().toISOString();

  const durSeconds = c.duration || 0;
  const payload: any = {
    Subject: callSubject(c, contact?.name || null),
    Call_Type: zohoCallType({direction: c.direction, status: c.status}),
    Call_Start_Time: startISO,
    // Zoho v7 Calls module requires Call_Duration as a text field in MM:SS
    // (or HH:MM:SS) form. Call_Duration_in_seconds is optional but we send
    // both so reports can sum cleanly.
    Call_Duration: formatCallDuration(durSeconds),
    Call_Duration_in_seconds: durSeconds,
    Description: [
      `Quo call ${c.id}`,
      `Status: ${c.status}`,
      c.recordingUrl ? `Recording: ${c.recordingUrl}` : null,
      rep ? `Handled by: ${rep.displayName}` : null,
    ].filter(Boolean).join('\n'),
  };
  // Caller_ID / Dialled_Number aren't system_mandatory but help reps see
  // the other party at a glance in Zoho's call view.
  if (c.direction === 'outgoing') {
    const toRaw = Array.isArray(c.to) ? (c.to[0] || '') : (c.to || '');
    payload.Dialled_Number = formatPhoneE164(toRaw) || toRaw || '';
  } else {
    payload.Caller_ID = formatPhoneE164(c.from) || c.from || '';
  }
  if (contact?.id) payload.Who_Id = contact.id;
  if (contact?.accountId) payload.What_Id = contact.accountId;
  if (rep?.zohoOwnerId) payload.Owner = {id: rep.zohoOwnerId};

  const zohoId = await createZohoCall(token, payload);
  if (zohoId) {
    quoIdToZohoCallId.set(c.id, zohoId);
    // Cap the cache at 200 entries — drop the oldest when we breach.
    if (quoIdToZohoCallId.size > 200) {
      const firstKey = quoIdToZohoCallId.keys().next().value;
      if (firstKey) quoIdToZohoCallId.delete(firstKey);
    }
  }
}

async function handleSummary(env: any, payload: any) {
  if (!env.ZOHO_CLIENT_ID) return;
  const token = await getZohoToken(env);
  const callId: string = payload?.callId || payload?.id;
  if (!callId) return;
  const summary: string = payload?.summary?.text || payload?.summary || '';
  if (!summary) return;

  let zohoId = quoIdToZohoCallId.get(callId) || null;
  if (!zohoId) zohoId = await findZohoCallByQuoId(token, callId);
  if (!zohoId) {
    console.warn('[quo-webhook] summary arrived but no Zoho Call found for', callId);
    return;
  }

  await updateZohoCall(token, zohoId, {
    Description: `${summary}\n\n— AI summary (Quo) —`,
  });
  if (!quoIdToZohoCallId.has(callId)) quoIdToZohoCallId.set(callId, zohoId);
}

async function handleTranscript(env: any, payload: any) {
  if (!env.ZOHO_CLIENT_ID) return;
  const token = await getZohoToken(env);
  const callId: string = payload?.callId || payload?.id;
  if (!callId) return;
  const transcriptUrl: string = payload?.transcript?.url || payload?.url || '';
  if (!transcriptUrl) return;

  let zohoId = quoIdToZohoCallId.get(callId) || null;
  if (!zohoId) zohoId = await findZohoCallByQuoId(token, callId);
  if (!zohoId) return;

  await updateZohoCall(token, zohoId, {
    Description: `Transcript: ${transcriptUrl}`,
  });
}
