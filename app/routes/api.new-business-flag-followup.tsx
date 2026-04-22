import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// /api/new-business-flag-followup
// ─────────────────────────────────────────────────────────────────────────────
// POST { accountId, action: 'flag' | 'unflag' } → { ok, tagged }
//
// Adds or removes the Zoho Tag `pete-followup` on an Account. Sky uses this
// from her Sales Floor card; Pete uses it from his Follow Up list to mark
// "handled" — tag goes away, account drops off his queue.
//
// Auth: any logged-in rep can flag/unflag. No per-rep permission matrix yet
// because the only people with dashboard access are already trusted.
//
// Zoho v7 tag endpoints:
//   POST /crm/v7/Accounts/actions/add_tags?ids=<id>&tag_names=<name>
//   POST /crm/v7/Accounts/actions/remove_tags?ids=<id>&tag_names=<name>
// Both return { data: [{code:'SUCCESS', ...}] } on success. Anything else
// is surfaced to the caller so the UI can show a clear error.
// ─────────────────────────────────────────────────────────────────────────────

export const FOLLOWUP_TAG = 'pete-followup';

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

export async function action({request, context}: ActionFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  const env = context.env as Record<string, string | undefined>;
  let body: {accountId?: string; action?: string};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON body'}, {status: 400});
  }
  const accountId = (body.accountId || '').trim();
  const act = (body.action || '').trim().toLowerCase();
  if (!accountId) return json({ok: false, error: 'accountId required'}, {status: 400});
  if (act !== 'flag' && act !== 'unflag') {
    return json({ok: false, error: "action must be 'flag' or 'unflag'"}, {status: 400});
  }

  let token: string;
  try {
    token = await getZohoToken(env);
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'Zoho auth failed'}, {status: 503});
  }

  // Zoho v7 tag endpoints take ids + tag_names as query params. Bodies are
  // unused for these actions but POST is still required.
  const endpoint = act === 'flag' ? 'add_tags' : 'remove_tags';
  const url = new URL(`https://www.zohoapis.com/crm/v7/Accounts/actions/${endpoint}`);
  url.searchParams.set('ids', accountId);
  url.searchParams.set('tag_names', FOLLOWUP_TAG);
  // `over_write=false` on add keeps any OTHER tags already on the record —
  // we only want to push ours in, not nuke Sky's tagging scheme.
  if (act === 'flag') url.searchParams.set('over_write', 'false');

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return json(
      {ok: false, error: `Zoho ${endpoint} (${res.status}): ${text.slice(0, 300)}`},
      {status: 502},
    );
  }
  const data = await res.json();
  const row = (data?.data || [])[0];
  if (row && row.code && row.code !== 'SUCCESS') {
    return json({ok: false, error: `Zoho ${row.code}: ${row.message || 'unknown'}`}, {status: 502});
  }

  return json({
    ok: true,
    tagged: act === 'flag',
    accountId,
    by: rep.id,
  });
}
