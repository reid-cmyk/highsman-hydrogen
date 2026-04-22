// TEMP DIAG — POST a Zoho Calls payload directly and get back the FULL
// Zoho response so we can see the full MANDATORY_NOT_FOUND api_name.
// GET  /api/zoho-call-probe?key=sparkgreatness-scopecheck-2026
//   → runs a known-good payload and returns the response as JSON
// POST /api/zoho-call-probe?key=sparkgreatness-scopecheck-2026
//   body: full payload to send to Zoho v7 /Calls
// Delete after #41 verified.

import {json, type ActionFunctionArgs, type LoaderFunctionArgs} from '@shopify/remix-oxygen';

async function getToken(env: any): Promise<string> {
  const r = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID || '',
      client_secret: env.ZOHO_CLIENT_SECRET || '',
      refresh_token: env.ZOHO_REFRESH_TOKEN || '',
    }),
  });
  const d = await r.json();
  return d.access_token;
}

async function tryCreate(env: any, payload: any) {
  const token = await getToken(env);
  const res = await fetch('https://www.zohoapis.com/crm/v7/Calls', {
    method: 'POST',
    headers: {Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json'},
    body: JSON.stringify({data: [payload]}),
  });
  const text = await res.text();
  let parsed: any = null;
  try { parsed = JSON.parse(text); } catch {}
  return {status: res.status, ok: res.ok, sent: payload, body: parsed || text};
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== 'sparkgreatness-scopecheck-2026') {
    return json({ok: false, error: 'forbidden'}, {status: 403});
  }

  // Default test payload — same shape we send from the webhook for an
  // outgoing completed call. Tweak fields via query params: variant=minimal|full|nodur|nocaller
  const variant = url.searchParams.get('variant') || 'full';
  const base: any = {
    Subject: `Diag probe ${new Date().toISOString()} [quo:probe]`,
    Call_Type: 'Outbound',
    Call_Start_Time: new Date(Date.now() - 60_000).toISOString(),
    Call_Duration: '00:30',
    Call_Duration_in_seconds: 30,
    Description: 'Probe payload to identify mandatory field',
    Dialled_Number: '+15555550100',
  };
  let payload: any = base;
  if (variant === 'minimal') payload = {Subject: base.Subject, Call_Type: base.Call_Type, Call_Start_Time: base.Call_Start_Time};
  if (variant === 'nodur') { payload = {...base}; delete payload.Call_Duration; delete payload.Call_Duration_in_seconds; }
  if (variant === 'nocaller') { payload = {...base}; delete payload.Dialled_Number; }
  if (variant === 'callduronly') { payload = {...base}; delete payload.Call_Duration_in_seconds; }
  if (variant === 'callduronly_int') { payload = {...base}; delete payload.Call_Duration; }

  const result = await tryCreate(env, payload);
  return json({variant, ...result});
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = context.env as any;
  const url = new URL(request.url);
  if (url.searchParams.get('key') !== 'sparkgreatness-scopecheck-2026') {
    return json({ok: false, error: 'forbidden'}, {status: 403});
  }
  const payload = await request.json();
  const result = await tryCreate(env, payload);
  return json(result);
}
