import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Log 12-Day Check-in (graduate New Customer card)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-checkin-done
//   body: {
//     zohoAccountId: string,
//     customerName?: string,
//     summary?: string,           // free-text from the rep ("rocking — 4 cases moved")
//   }
//   → { ok, noteId }
//
// What this does:
//   Stamps the dispensary's Zoho Account with a Note titled `[CHECKIN-12D] …`.
//   The /sales-floor New Customers loader looks for a note whose title starts
//   with `[CHECKIN-12D]` to mark the card as `done` and remove it from the
//   onboarding tab. The shop now lives in the regular Accounts list.
//
// Why a Note (not a Task / custom field)? No Zoho schema migration required,
// and Notes are already how this codebase audits ad-hoc events (see SMS
// notes pattern in api.sales-floor-send-sms.tsx).
// ─────────────────────────────────────────────────────────────────────────────

const CHECKIN_NOTE_SUBJECT_PREFIX = '[CHECKIN-12D]';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const zohoAccountId = String(body?.zohoAccountId || '').trim();
  const customerName = String(body?.customerName || '').trim();
  const summary = String(body?.summary || '').trim();

  if (!zohoAccountId || !/^\d{6,}$/.test(zohoAccountId)) {
    return json({ok: false, error: 'invalid zohoAccountId'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);

    const today = new Date().toISOString().slice(0, 10);
    const noteTitle = `${CHECKIN_NOTE_SUBJECT_PREFIX} ${today} — ${rep.displayName || rep.email || 'rep'}`;
    const noteContent = [
      `12-day post-ship check-in logged by ${rep.displayName || rep.email || 'rep'} on ${today}.`,
      customerName ? `Account: ${customerName}` : '',
      summary ? `Notes: ${summary}` : 'No additional notes.',
    ]
      .filter(Boolean)
      .join('\n');

    const notePayload = {
      data: [
        {
          Note_Title: noteTitle,
          Note_Content: noteContent,
          Parent_Id: zohoAccountId,
          $se_module: 'Accounts',
        },
      ],
    };

    const noteRes = await fetch(`https://www.zohoapis.com/crm/v7/Notes`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(notePayload),
    });
    const noteText = await noteRes.text().catch(() => '');
    if (!noteRes.ok) {
      throw new Error(`Zoho Notes create (${noteRes.status}): ${noteText.slice(0, 300)}`);
    }
    let noteJson: any = {};
    try {
      noteJson = JSON.parse(noteText);
    } catch {}
    const noteId =
      noteJson?.data?.[0]?.details?.id ||
      noteJson?.data?.[0]?.id ||
      null;

    return json({
      ok: true,
      noteId,
      cardState: 'done',
    });
  } catch (err: any) {
    console.error('[sf-checkin-done] failed', zohoAccountId, err.message);
    return json(
      {ok: false, error: err.message || 'Check-in log failed'},
      {status: 502},
    );
  }
}
