import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {
  fetchRecentCalls,
  callStatusLabel,
  formatPhonePretty,
  isQuoConfigured,
  type QuoCall,
} from '../lib/quo';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Recent Quo Calls
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-quo-recent
//   → { ok, calls: [...], todayCount, configured, syncedAt }
//
// Powers two things on the dashboard:
//   1. The new "Recent Calls" panel (last 15 calls on the Sales line).
//   2. The "Calls Today" KPI tile — replaces the previous client-side
//      `callsToday++` counter that was always wrong (only counted
//      tel:-link clicks made from this browser tab).
//
// We fetch the workspace's Sales phone number history, not the rep's
// individual line. Rationale: there's one shared inbound number; per-rep
// outbound attribution comes through `userId` on each call object so the
// UI can still mark which calls were yours vs Sky's.
//
// Caching: Quo's `/calls` endpoint is rate-limited (per their docs, 10
// req/sec workspace-wide). We cache the JSON for 30 seconds at the worker
// edge — fast enough to feel live for a sales rep, easy on the budget.
// ─────────────────────────────────────────────────────────────────────────────

type ShapedCall = {
  id: string;
  direction: 'incoming' | 'outgoing';
  status: string;             // human label
  rawStatus: string;
  duration: number;           // seconds
  durationLabel: string;      // "2m 14s"
  createdAt: string;
  otherParty: string;         // E.164 of the non-Highsman participant
  otherPartyPretty: string;
  userId: string | null;      // Quo user id who handled the call (for rep attribution)
  hasRecording: boolean;
  recordingUrl: string | null;
  hasSummary: boolean;
  summary: string | null;
};

function durationLabel(secs: number): string {
  if (!secs || secs < 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

function isToday(iso: string | undefined | null, tz = 'America/New_York'): boolean {
  if (!iso) return false;
  try {
    const d = new Date(iso);
    const today = new Date();
    const fmt = new Intl.DateTimeFormat('en-CA', {timeZone: tz});
    return fmt.format(d) === fmt.format(today);
  } catch {
    return false;
  }
}

// Identify the "other party" on a Quo call — the participant that ISN'T
// the workspace number. Quo gives us `from` (string) and `to` (array on
// outgoing, string on incoming). Easiest heuristic: for outgoing, the
// other party is the first `to`; for incoming, it's `from`.
function otherParty(c: QuoCall): string {
  if (c.direction === 'outgoing') {
    if (Array.isArray(c.to)) return c.to[0] || '';
    return c.to || '';
  }
  return c.from || '';
}

function shape(c: QuoCall): ShapedCall {
  const op = otherParty(c);
  return {
    id: c.id,
    direction: c.direction,
    status: callStatusLabel(c),
    rawStatus: c.status || '',
    duration: c.duration || 0,
    durationLabel: durationLabel(c.duration || 0),
    createdAt: c.createdAt || c.completedAt || c.answeredAt || new Date().toISOString(),
    otherParty: op,
    otherPartyPretty: formatPhonePretty(op),
    userId: c.userId || null,
    hasRecording: !!c.recordingUrl,
    recordingUrl: c.recordingUrl || null,
    hasSummary: !!(c.ai && c.ai.summary),
    summary: c.ai?.summary || null,
  };
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);

  // Always 200 with shape — the dashboard prefers a degraded panel over
  // a missing one. Match the api.sales-floor-sync error envelope.
  if (!isQuoConfigured(env)) {
    return json(
      {
        ok: false,
        error: 'Quo not configured',
        configured: false,
        calls: [],
        todayCount: 0,
        syncedAt: new Date().toISOString(),
        rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const calls = await fetchRecentCalls(env.QUO_API_KEY, env.QUO_PHONE_NUMBER_ID, 25);
    const shaped = calls.map(shape);
    // Sort newest first (Quo usually returns this order, but guarantee it).
    shaped.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

    const todayCount = shaped.filter((c) => isToday(c.createdAt)).length;

    return json(
      {
        ok: true,
        configured: true,
        calls: shaped.slice(0, 15),
        todayCount,
        syncedAt: new Date().toISOString(),
        rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
      },
      {
        headers: {
          // 30s private cache — long enough to absorb tab churn, short
          // enough that "I just hung up" appears within a refresh.
          'Cache-Control': 'private, max-age=30',
        },
      },
    );
  } catch (err: any) {
    console.error('[quo-recent] fetch failed:', err.message);
    return json(
      {
        ok: false,
        error: err.message || 'Quo fetch failed',
        configured: true,
        calls: [],
        todayCount: 0,
        syncedAt: new Date().toISOString(),
        rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
