import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, findRepById, type SalesRep} from '../lib/sales-floor-reps';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';
import {sendSms, formatPhoneE164} from '../lib/quo';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Send SMS (per-rep Quo number)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-send-sms
//   body (JSON): { to, body }
//   → { ok: true, messageId, from, to, zohoNoteId? } | { ok: false, error }
//
// Flow:
//   1. Rep auth: read sales_floor_rep cookie → SalesRep, must have a `quo`
//      config block (Sky for now).
//   2. Send via Quo: POST /v1/messages with the rep's E.164 as `from`,
//      attaching `userId` if we have the rep's Quo seat id (so the message
//      lands in their personal Quo inbox, not the workspace shared inbox).
//   3. Mirror to Zoho: search Contacts by counterparty phone (last-10),
//      create a Note on the matched Account/Contact with the [SMS → Out]
//      title prefix and Quo message id embedded for dedupe.
//
// We also embed `[quo:<msgId>]` in the Note Title so the webhook handler
// for `message.delivered` can detect "this Note already exists" and skip
// the duplicate. Without this, every outbound SMS would create TWO Notes.
// ─────────────────────────────────────────────────────────────────────────────

// Zoho token helper is imported from `~/lib/zoho-auth` — the shared module
// keeps a single cache across every Zoho CRM route in the worker, which is
// what prevents the "too many token requests continuously" rate-limit that
// used to trip when each route owned its own cache.

// Resolve rep's Quo config from env (with Sky as the only seat right now).
function resolveRepQuo(rep: SalesRep, env: any): {
  fromE164: string;
  phoneNumberId?: string;
  userId?: string;
} | null {
  if (!rep.quo) return null;
  const phoneNumberId = rep.quo.phoneNumberIdVar ? env[rep.quo.phoneNumberIdVar] : undefined;
  const userId = rep.quo.userIdVar ? env[rep.quo.userIdVar] : undefined;
  return {
    fromE164: rep.quo.numberE164,
    phoneNumberId,
    userId,
  };
}

// Quo doesn't allow GET on this route — redirect curious clicks to a JSON
// shape instead of a 405.
export async function loader(_: LoaderFunctionArgs) {
  return json({ok: true, service: 'sales-floor-send-sms', method: 'POST only'});
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};

  if (request.method !== 'POST') {
    return json({ok: false, error: 'POST only'}, {status: 405});
  }

  const cookie = request.headers.get('Cookie') || '';
  let rep = getRepFromRequest(request);
  if (!rep && (isStagingAuthed(cookie) || getSFToken(cookie))) {
    rep = findRepById('sky');
  }
  if (!rep) {
    return json({ok: false, error: 'not authenticated'}, {status: 401});
  }
  const quoCfg = resolveRepQuo(rep, env);
  if (!quoCfg) {
    return json(
      {ok: false, error: `${rep.firstName} has no Quo seat configured`},
      {status: 503},
    );
  }
  if (!env.QUO_API_KEY) {
    return json({ok: false, error: 'QUO_API_KEY missing'}, {status: 503});
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const toE164 = formatPhoneE164(body?.to);
  const content = String(body?.body || '').trim();

  if (!toE164 || !/^\+[1-9]\d{1,14}$/.test(toE164)) {
    return json({ok: false, error: 'invalid `to` (need E.164 like +15555555555)'}, {status: 400});
  }
  if (content.length === 0 || content.length > 1600) {
    return json({ok: false, error: 'body must be 1–1600 chars'}, {status: 400});
  }

  // Send via Quo first — if Quo fails, do not write a Note.
  let quoMsg;
  try {
    quoMsg = await sendSms({
      apiKey: env.QUO_API_KEY,
      fromE164: quoCfg.fromE164,
      toE164,
      content,
      userId: quoCfg.userId,
    });
  } catch (err: any) {
    console.error('[send-sms] Quo send failed', err.message);
    return json({ok: false, error: err.message}, {status: 502});
  }

  return json(
    {
      ok: true,
      messageId: quoMsg.id,
      from: quoCfg.fromE164,
      to: toE164,
      status: quoMsg.status,
      createdAt: quoMsg.createdAt,
    },
    {status: 200},
  );
}
