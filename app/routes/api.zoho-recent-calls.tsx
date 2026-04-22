// TEMPORARY DIAGNOSTIC — delete after #41 verified.
// GET /api/zoho-recent-calls?key=sparkgreatness-scopecheck-2026
// Returns the 5 most recent Zoho Calls so we can confirm the webhook wrote.

import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';

const FIELDS = [
  'id', 'Subject', 'Call_Type', 'Call_Start_Time', 'Call_Duration', 'Call_Status',
  'Description', 'From', 'To', 'Created_Time', 'Owner', 'Who_Id', 'What_Id',
].join(',');

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== 'sparkgreatness-scopecheck-2026') {
    return json({ok: false, error: 'forbidden'}, {status: 403});
  }

  const tokRes = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID || '',
      client_secret: env.ZOHO_CLIENT_SECRET || '',
      refresh_token: env.ZOHO_REFRESH_TOKEN || '',
    }),
  });
  if (!tokRes.ok) {
    return json({ok: false, stage: 'token', status: tokRes.status, body: (await tokRes.text()).slice(0, 300)});
  }
  const tok = await tokRes.json();
  const token = tok.access_token;

  const u = new URL('https://www.zohoapis.com/crm/v7/Calls');
  u.searchParams.set('fields', FIELDS);
  u.searchParams.set('per_page', '8');
  u.searchParams.set('sort_by', 'Created_Time');
  u.searchParams.set('sort_order', 'desc');

  const r = await fetch(u.toString(), {headers: {Authorization: `Zoho-oauthtoken ${token}`}});
  if (r.status === 204) return json({ok: true, calls: []});
  const txt = await r.text();
  if (!r.ok) return json({ok: false, stage: 'list', status: r.status, body: txt.slice(0, 600)});
  let body: any = {};
  try { body = JSON.parse(txt); } catch { return json({ok: false, stage: 'parse', body: txt.slice(0, 400)}); }
  return json({ok: true, calls: body.data || []});
}
