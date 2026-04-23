import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

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

  // Zoho v7 tag endpoints — use the per-record path form and carry the tag in
  // the body, matching the proven pattern in api.accounts.tsx. The mass-action
  // form (`/Accounts/actions/add_tags?ids=...&tag_names=...`) used to accept a
  // bodiless POST but as of Apr 2026 it rejects with
  // `{"code":"INVALID_DATA","details":{"expected_data_type":"jsonobject"},"message":"body"}`
  // because the v7 validator now requires a JSON-object body even when the
  // identifying data is in the query string. Switching to the per-record path
  // form sidesteps that: `tags` is carried in the body, which the validator
  // accepts cleanly, and we keep the additive semantics (other tags on the
  // record are preserved — add_tags never overwrites unrelated tags).
  const endpoint = act === 'flag' ? 'add_tags' : 'remove_tags';
  const url = `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(accountId)}/actions/${endpoint}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tags: [{name: FOLLOWUP_TAG}],
    }),
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
