import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {formatPhonePretty, formatPhoneE164, isQuoConfigured, fetchRecentCalls} from '../lib/quo';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Missed Calls ("Call Back" queue)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-missed-calls
//   → { ok, missed: [...], count, configured, syncedAt, rep }
//
// Source of truth: Zoho Tasks module. When a Quo `call.completed` event
// arrives with `Missed` classification, the webhook creates a Task whose
// Subject contains `[quo:<callId>]` and is stamped with `Status = Not Started`.
// That gives us a persistent "needs callback" queue that:
//   1. Survives worker cold-starts (vs. in-memory call history).
//   2. Clears itself when a rep marks the Task Completed in Zoho.
//   3. Respects per-rep ownership (via Owner field).
//
// Fallback: if Zoho is unreachable or empty, we derive a best-guess queue
// from the last ~50 Quo calls (incoming + status in missed/no-answer/voicemail,
// last 7 days). This keeps the panel populated while the webhook Task flow
// settles after a cold deploy. Rep sees same shape either way.
//
// Dashboard uses this to render:
//   • "Missed Calls — Call Back" panel above Recent Calls.
//   • Unread-style badge in the sidebar/nav.
// ─────────────────────────────────────────────────────────────────────────────

type MissedCall = {
  // Stable id for React-like keyed rendering. Prefer Zoho Task id (persists
  // across refreshes); fall back to the Quo call id when only fallback data
  // is available.
  id: string;
  quoCallId: string | null;
  zohoTaskId: string | null;
  callerName: string | null;          // from Zoho contact match, if any
  callerE164: string;
  callerPretty: string;
  createdAt: string;                  // ISO (Quo createdAt or Zoho Created_Time)
  dueDate: string | null;             // YYYY-MM-DD from Task, if present
  priority: string;                   // 'High' | 'Normal' | ... (Task default)
  description: string | null;         // Task Description (has recording URL etc)
  source: 'zoho-task' | 'quo-fallback';
};

// ─── Zoho token (shared cache; null on missing creds / refresh failure) ────
// Wraps the shared helper so we preserve the nullable contract used by
// callers below for soft-degradation.
async function getZohoToken(env: any): Promise<string | null> {
  try {
    return await getZohoAccessToken(env);
  } catch {
    return null;
  }
}

// Pull open "Call back … [quo:…]" tasks from Zoho.
//
// Zoho v7 Tasks search supports criteria across Subject + Status. We use
// `(Subject:contains:[quo:)and(Status:equals:Not Started)` to find the
// auto-created queue without dragging in every other Task.
//
// We don't currently scope by Owner because rep.zohoOwnerId is null for
// Sky (shared book). Once per-rep Owner IDs are filled in, add:
//   criteria += `and(Owner:equals:${rep.zohoOwnerId})`
async function fetchOpenMissedCallTasks(token: string): Promise<any[]> {
  const criteria = '((Subject:contains:[quo:)and(Status:equals:Not Started))';
  const url = new URL('https://www.zohoapis.com/crm/v7/Tasks/search');
  url.searchParams.set('criteria', criteria);
  url.searchParams.set('per_page', '50');
  // Newest first — Created_Time is a system field, descending sort is default
  // so we don't specify sort_by. If we ever need explicit ordering, add:
  //   url.searchParams.set('sort_by', 'Created_Time');
  //   url.searchParams.set('sort_order', 'desc');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) return [];
  const data = await res.json();
  return data?.data || [];
}

// Extract `[quo:<id>]` out of a Zoho Task Subject.
// Subjects look like: "Call back Jane Doe — missed call [quo:AC12345]"
function parseQuoIdFromSubject(subject: string): string | null {
  const m = subject && subject.match(/\[quo:([^\]]+)\]/);
  return m ? m[1] : null;
}

// Best-guess phone + name extraction from a Zoho Task. Prefer the Contact
// (Who_Id) name; fall back to parsing the Subject. Phone lookup requires an
// extra Zoho call which we skip here — the webhook Description line already
// carries the caller number in E.164 form.
function extractCallerFromDescription(description: string | null | undefined): string {
  if (!description) return '';
  const m = description.match(/Missed inbound call from\s+(\+?[\d\s()-]+)/i);
  if (!m) return '';
  return formatPhoneE164(m[1].trim());
}

function shapeFromZohoTask(t: any): MissedCall {
  const subject: string = t.Subject || '';
  const quoCallId = parseQuoIdFromSubject(subject);
  const callerE164 = extractCallerFromDescription(t.Description);
  // Who_Id is the Contact relationship. Zoho returns it as either
  //   "Who_Id": {"id": "...", "name": "Jane Doe"}   (full lookup)
  //   "Who_Id": null
  const whoName = (t.Who_Id && typeof t.Who_Id === 'object') ? (t.Who_Id.name || null) : null;
  return {
    id: t.id,
    quoCallId,
    zohoTaskId: t.id,
    callerName: whoName,
    callerE164,
    callerPretty: callerE164 ? formatPhonePretty(callerE164) : '',
    createdAt: t.Created_Time || new Date().toISOString(),
    dueDate: t.Due_Date || null,
    priority: t.Priority || 'Normal',
    description: t.Description || null,
    source: 'zoho-task',
  };
}

// Fallback: derive missed calls straight from Quo when Zoho is empty or
// unreachable. Covers the gap between a missed call happening and the
// webhook Task becoming searchable (eventual consistency on Zoho search).
async function deriveFromQuo(env: any): Promise<MissedCall[]> {
  if (!isQuoConfigured(env)) return [];
  try {
    const calls = await fetchRecentCalls(env.QUO_API_KEY, env.QUO_PHONE_NUMBER_ID, 50);
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const missed = calls.filter((c) => {
      if (c.direction !== 'incoming') return false;
      const s = (c.status || '').toLowerCase();
      if (!(s === 'missed' || s === 'no-answer' || s === 'voicemail')) return false;
      const when = new Date(c.createdAt || c.completedAt || 0).getTime();
      return when >= sevenDaysAgo;
    });
    // Dedupe by counterparty — if the same number called three times and
    // you missed them all, that's one "call them back" item, not three.
    const byCaller = new Map<string, typeof missed[number]>();
    for (const c of missed) {
      const e164 = formatPhoneE164(c.from);
      if (!e164) continue;
      const prev = byCaller.get(e164);
      if (!prev || new Date(c.createdAt) > new Date(prev.createdAt)) {
        byCaller.set(e164, c);
      }
    }
    return Array.from(byCaller.values()).map((c) => ({
      id: `quo:${c.id}`,
      quoCallId: c.id,
      zohoTaskId: null,
      callerName: null,
      callerE164: formatPhoneE164(c.from),
      callerPretty: formatPhonePretty(c.from),
      createdAt: c.createdAt || c.completedAt || new Date().toISOString(),
      dueDate: null,
      priority: 'High',
      description: c.recordingUrl ? `Voicemail/recording: ${c.recordingUrl}` : null,
      source: 'quo-fallback' as const,
    }));
  } catch (err: any) {
    console.error('[missed-calls] quo fallback failed', err.message);
    return [];
  }
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);

  const token = await getZohoToken(env);
  let missed: MissedCall[] = [];
  let usedFallback = false;

  if (token) {
    try {
      const tasks = await fetchOpenMissedCallTasks(token);
      missed = tasks.map(shapeFromZohoTask);
    } catch (err: any) {
      console.error('[missed-calls] zoho fetch failed', err.message);
    }
  }

  // Supplement with Quo fallback for anything the webhook hasn't indexed yet.
  // De-dupe against Zoho tasks using the Quo call id — if the Task already
  // exists we prefer it (it's the canonical "open" record).
  if (missed.length < 25) {
    const fromQuo = await deriveFromQuo(env);
    const seenQuoIds = new Set(missed.map((m) => m.quoCallId).filter(Boolean));
    const seenCallers = new Set(missed.map((m) => m.callerE164).filter(Boolean));
    for (const mc of fromQuo) {
      if (mc.quoCallId && seenQuoIds.has(mc.quoCallId)) continue;
      if (mc.callerE164 && seenCallers.has(mc.callerE164)) continue;
      missed.push(mc);
      usedFallback = true;
    }
  }

  // Newest first.
  missed.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return json(
    {
      ok: true,
      missed: missed.slice(0, 25),
      count: missed.length,
      configured: !!token || isQuoConfigured(env),
      usedFallback,
      syncedAt: new Date().toISOString(),
      rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
    },
    {
      headers: {
        // 30s private cache — matches Recent Calls cadence.
        'Cache-Control': 'private, max-age=30',
      },
    },
  );
}
