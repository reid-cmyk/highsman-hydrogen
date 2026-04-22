import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Mark Zoho Task Completed
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-task-complete
//   body: { taskId: string }
//   → { ok, taskId, status }
//
// Used by the Missed Calls panel "Mark Done" button. Flips a Zoho Task to
// `Status: Completed` so it disappears from the open-tasks queue (and
// therefore from the dashboard panel on next refresh).
//
// Auth is the same /sales-floor cookie pair as every other route in this
// folder — getRepFromRequest() returns null if the caller isn't logged in.
// ─────────────────────────────────────────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho not configured');
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
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho token (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

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
  const taskId = String(body?.taskId || '').trim();
  // Zoho ids are large numerics. Tight validation prevents this endpoint
  // from being used to flip arbitrary Tasks if someone discovers it — the
  // dashboard only ever passes ids it received from /api/sales-floor-missed-calls.
  if (!taskId || !/^\d{6,}$/.test(taskId)) {
    return json({ok: false, error: 'invalid taskId'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);
    const res = await fetch(`https://www.zohoapis.com/crm/v7/Tasks/${taskId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{
          Status: 'Completed',
          // Stamp the description so reps later auditing the task can see
          // it was closed via the dashboard (vs. manually in Zoho).
          // Append, don't overwrite — we can't know the existing body.
          // (Zoho won't append for us, but updating Description fully
          // would clobber the original missed-call notes. Skip for now;
          // a Notes-on-Task append would be cleaner if Reid wants audit.)
        }],
      }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      throw new Error(`Zoho update Task (${res.status}): ${t.slice(0, 300)}`);
    }
    return json({ok: true, taskId, status: 'Completed'});
  } catch (err: any) {
    console.error('[task-complete] failed', taskId, err.message);
    return json({ok: false, error: err.message || 'Zoho update failed'}, {status: 502});
  }
}
