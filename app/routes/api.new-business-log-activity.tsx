import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {createZohoNote} from '../lib/zoho-notes';

// ─────────────────────────────────────────────────────────────────────────────
// /api/new-business-log-activity
// ─────────────────────────────────────────────────────────────────────────────
// POST {
//   parent: { id: string, module: 'Leads' | 'Accounts' | 'Contacts' },
//   type: 'call' | 'text' | 'email' | 'visit',
//   outcome: string,              // "Connected" | "Voicemail" | "No Answer" | ...
//   direction?: 'out' | 'in',     // default 'out' (Pete usually initiates)
//   notes: string,                // free-text summary
//   nextStepDate?: string,        // YYYY-MM-DD — creates a follow-up Task
//   nextStepNote?: string,        // what to do on the next touch
// }
// → { ok, noteId, taskId? }
//
// Why Notes, not the Calls module?
//   Calls requires a strict shape ($se_module, Call_Duration as MM:SS, +00:00
//   timestamps) and Pete won't always know duration for a manual log — he'll
//   be thumbing this in while getting back in his car. Notes tolerate arbitrary
//   text and still land in the Zoho timeline where Sky can see them.
//
//   Auto-ingested calls from Quo keep using the dedicated Calls flow via the
//   existing webhook — those DO have reliable metadata. This route is for
//   MANUAL logs that come from Pete's personal phone, a walk-in, or a text
//   thread that never touched Quo.
//
// Title convention (searchable in Zoho list views):
//   [Call → Out] Connected · Peter Casey · Apr 22, 2026
//   [Text → In]  Interested · Peter Casey · Apr 22, 2026
//   [Visit]      Dropped in · Peter Casey · Apr 22, 2026
// ─────────────────────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: Record<string, string | undefined>): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho credentials missing');
  }
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
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
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho token (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

const TYPE_LABEL: Record<string, string> = {
  call: 'Call',
  text: 'Text',
  email: 'Email',
  visit: 'Visit',
};

function titlePrefix(type: string, direction: string): string {
  const label = TYPE_LABEL[type] || 'Note';
  if (type === 'visit') return '[Visit]';
  // Arrow is intentional — Sky's existing dashboard already parses `[Text → Out]`
  // and the same convention keeps all activity in ONE Zoho list view.
  const arrow = direction === 'in' ? '→ In' : '→ Out';
  return `[${label} ${arrow}]`;
}

function formatDate(date = new Date()): string {
  return date.toLocaleDateString('en-US', {month: 'short', day: 'numeric', year: 'numeric'});
}

// Best-effort Task creation for the next-step follow-up. Returns the Task id
// or null on failure — we don't block the Note creation on this because a
// failed Task is recoverable, but a failed Note means the activity was lost.
async function createFollowUpTask(
  token: string,
  parent: {id: string; module: string},
  dueDate: string,
  subject: string,
  description: string,
): Promise<string | null> {
  const payload: any = {
    Subject: subject.slice(0, 200), // Zoho Subject cap
    Status: 'Not Started',
    Priority: 'High',
    Due_Date: dueDate, // YYYY-MM-DD
    Description: description,
    What_Id: parent.id,
    $se_module: parent.module, // required whenever What_Id is set (v7)
  };
  try {
    const res = await fetch('https://www.zohoapis.com/crm/v7/Tasks', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: [payload], trigger: ['workflow']}),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const row = (data?.data || [])[0];
    if (row?.code === 'SUCCESS') return row?.details?.id || null;
    return null;
  } catch {
    return null;
  }
}

export async function action({request, context}: ActionFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  const env = context.env as Record<string, string | undefined>;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON body'}, {status: 400});
  }

  const parentId = body?.parent?.id;
  const parentModule = body?.parent?.module;
  const type = String(body?.type || '').toLowerCase();
  const outcome = String(body?.outcome || '').trim() || 'Logged';
  const direction = String(body?.direction || 'out').toLowerCase();
  const notes = String(body?.notes || '').trim();
  const nextStepDate = body?.nextStepDate ? String(body.nextStepDate).trim() : null;
  const nextStepNote = String(body?.nextStepNote || '').trim();

  if (!parentId) return json({ok: false, error: 'parent.id required'}, {status: 400});
  if (!['Leads', 'Accounts', 'Contacts'].includes(parentModule)) {
    return json({ok: false, error: 'parent.module must be Leads, Accounts, or Contacts'}, {status: 400});
  }
  if (!['call', 'text', 'email', 'visit'].includes(type)) {
    return json({ok: false, error: 'type must be call|text|email|visit'}, {status: 400});
  }
  if (!notes && !outcome) {
    return json({ok: false, error: 'notes or outcome required'}, {status: 400});
  }

  let token: string;
  try {
    token = await getZohoToken(env);
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'Zoho auth failed'}, {status: 503});
  }

  const title = `${titlePrefix(type, direction)} ${outcome} · ${rep.displayName} · ${formatDate()}`;
  const content = [
    notes || `(no notes added)`,
    '',
    `— ${rep.displayName} (${rep.email})`,
    `Logged via /new-business on ${new Date().toISOString()}`,
    nextStepDate ? `Next step: ${nextStepDate}${nextStepNote ? ` — ${nextStepNote}` : ''}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let noteId: string | null = null;
  try {
    noteId = await createZohoNote({
      token,
      parent: {id: parentId, module: parentModule},
      title: title.slice(0, 120), // Zoho Note_Title cap is 120
      content: content.slice(0, 32000),
    });
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'note create failed'}, {status: 502});
  }

  let taskId: string | null = null;
  if (nextStepDate) {
    const taskSubject = `Follow up ${rep.displayName}: ${outcome} → next step`;
    const taskDesc = [
      nextStepNote || `Follow up after ${TYPE_LABEL[type] || 'activity'} (${outcome}).`,
      '',
      `Previous activity logged ${formatDate()}:`,
      notes,
    ]
      .filter(Boolean)
      .join('\n');
    taskId = await createFollowUpTask(
      token,
      {id: parentId, module: parentModule},
      nextStepDate,
      taskSubject,
      taskDesc,
    );
  }

  return json({
    ok: true,
    noteId,
    taskId,
    title,
    parent: {id: parentId, module: parentModule},
  });
}
