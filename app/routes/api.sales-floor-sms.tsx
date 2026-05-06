import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, findRepById, type SalesRep} from '../lib/sales-floor-reps';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';
import {
  listConversations,
  listMessagesWith,
  formatPhoneE164,
  formatPhonePretty,
  type QuoMessage,
  type QuoConversation,
} from '../lib/quo';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — SMS read endpoint (threads list + per-thread history)
// ─────────────────────────────────────────────────────────────────────────────
// Two modes on one route, switched by query string. Keeping them in one file
// because they share auth, env resolution, and shaping helpers.
//
//   GET /api/sales-floor-sms                     → threads list
//   GET /api/sales-floor-sms?with=+15555550100   → message history with one
//
// Both responses return ok=true + an empty array on misconfig instead of
// erroring — the dashboard renders a quiet empty state rather than a banner.
// ─────────────────────────────────────────────────────────────────────────────

type ShapedMessage = {
  id: string;
  direction: 'incoming' | 'outgoing';
  text: string;
  from: string;          // E.164
  to: string;            // E.164 (first recipient)
  status: string;
  createdAt: string;
};

type ShapedThread = {
  id: string;
  participant: string;        // counterparty E.164
  participantPretty: string;
  lastActivityAt: string;
  lastActivityType: string;   // 'message' | 'call' | ''
  unreadCount: number;
};

function resolveRepQuo(rep: SalesRep, env: any): {
  fromE164: string;
  phoneNumberId?: string;
} | null {
  if (!rep.quo) return null;
  return {
    fromE164: rep.quo.numberE164,
    phoneNumberId: rep.quo.phoneNumberIdVar ? env[rep.quo.phoneNumberIdVar] : undefined,
  };
}

function shapeMessage(m: QuoMessage): ShapedMessage {
  return {
    id: m.id,
    direction: m.direction,
    text: m.text || '',
    from: m.from || '',
    to: Array.isArray(m.to) ? (m.to[0] || '') : (m.to || ''),
    status: m.status || '',
    createdAt: m.createdAt || new Date().toISOString(),
  };
}

function shapeThread(c: QuoConversation): ShapedThread {
  const participant = (c.participants && c.participants[0]) || '';
  return {
    id: c.id,
    participant,
    participantPretty: formatPhonePretty(participant),
    lastActivityAt: c.lastActivityAt || '',
    lastActivityType: c.lastActivityType || '',
    unreadCount: c.unreadCount || 0,
  };
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const cookie = request.headers.get('Cookie') || '';
  let rep = getRepFromRequest(request);
  if (!rep && (isStagingAuthed(cookie) || getSFToken(cookie))) {
    rep = findRepById('sky');
  }

  // Stable response envelope — dashboard expects same shape on auth/config
  // failures so the panel renders an empty state instead of throwing.
  const baseEnvelope = {
    ok: false as boolean,
    configured: false as boolean,
    rep: rep ? {id: rep.id, firstName: rep.firstName, fromE164: rep.quo?.numberE164 || null} : null,
    threads: [] as ShapedThread[],
    messages: [] as ShapedMessage[],
    syncedAt: new Date().toISOString(),
    error: undefined as string | undefined,
  };

  if (!rep) {
    return json({...baseEnvelope, error: 'not authenticated'}, {status: 200});
  }
  if (!env.QUO_API_KEY) {
    return json({...baseEnvelope, error: 'QUO_API_KEY missing'}, {status: 200});
  }
  const quoCfg = resolveRepQuo(rep, env);
  if (!quoCfg || !quoCfg.phoneNumberId) {
    return json(
      {...baseEnvelope, error: `${rep.firstName} has no Quo phoneNumberId`},
      {status: 200},
    );
  }

  const url = new URL(request.url);
  const withRaw = url.searchParams.get('with');

  try {
    if (withRaw) {
      // ── Mode 2: one-thread history ─────────────────────────────────────
      const participantE164 = formatPhoneE164(withRaw);
      if (!participantE164) {
        return json({...baseEnvelope, configured: true, error: 'invalid `with` number'}, {status: 200});
      }
      const raw = await listMessagesWith(env.QUO_API_KEY, quoCfg.phoneNumberId, participantE164, 50);
      // Quo returns newest first — reverse to chronological for the chat UI.
      const shaped = raw.map(shapeMessage).sort(
        (a, b) => +new Date(a.createdAt) - +new Date(b.createdAt),
      );
      return json(
        {
          ...baseEnvelope,
          ok: true,
          configured: true,
          messages: shaped,
        },
        {status: 200, headers: {'Cache-Control': 'private, max-age=10'}},
      );
    }

    // ── Mode 1: threads list ────────────────────────────────────────────
    const raw = await listConversations(env.QUO_API_KEY, quoCfg.phoneNumberId, 25);
    const shaped = raw
      .map(shapeThread)
      .filter((t) => !!t.participant)
      .sort((a, b) => +new Date(b.lastActivityAt || 0) - +new Date(a.lastActivityAt || 0));
    return json(
      {
        ...baseEnvelope,
        ok: true,
        configured: true,
        threads: shaped,
      },
      {status: 200, headers: {'Cache-Control': 'private, max-age=30'}},
    );
  } catch (err: any) {
    console.error('[sales-floor-sms] fetch failed:', err.message);
    return json(
      {...baseEnvelope, configured: true, error: err.message || 'Quo fetch failed'},
      {status: 200},
    );
  }
}
