// TEMPORARY DIAGNOSTIC ROUTE — delete after #41 is verified.
// GET /api/zoho-scope-check?key=<diag key>
// Mints a Zoho access token using current ZOHO_CLIENT_ID/SECRET/REFRESH_TOKEN
// and probes Calls / Tasks / Notes / Events for the .ALL scope. Returns a
// per-module status so we can confirm the regenerated refresh token in
// Production has the expanded scope set.

import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';

const PROBES = [
  {module: 'Calls', method: 'GET', path: '/crm/v7/Calls?per_page=1'},
  {module: 'Tasks', method: 'GET', path: '/crm/v7/Tasks?per_page=1'},
  {module: 'Notes', method: 'GET', path: '/crm/v7/Notes?per_page=1'},
  {module: 'Events', method: 'GET', path: '/crm/v7/Events?per_page=1'},
];

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const url = new URL(request.url);
  const key = url.searchParams.get('key') || '';
  // Tiny shared-secret guard so the route can't be hit anonymously.
  if (key !== 'sparkgreatness-scopecheck-2026') {
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
  const tokText = await tokRes.text();
  if (!tokRes.ok) {
    return json({
      ok: false,
      stage: 'token_exchange',
      status: tokRes.status,
      body: tokText.slice(0, 400),
      clientIdHead: (env.ZOHO_CLIENT_ID || '').slice(0, 18),
      refreshHead: (env.ZOHO_REFRESH_TOKEN || '').slice(0, 18),
    });
  }
  let tok: any = {};
  try {
    tok = JSON.parse(tokText);
  } catch {
    return json({ok: false, stage: 'token_parse', body: tokText.slice(0, 400)});
  }
  const token = tok.access_token as string | undefined;
  if (!token) {
    return json({ok: false, stage: 'token_missing', body: tokText.slice(0, 400)});
  }

  const results: Record<string, any> = {};
  for (const p of PROBES) {
    try {
      const r = await fetch(`https://www.zohoapis.com${p.path}`, {
        method: p.method,
        headers: {Authorization: `Zoho-oauthtoken ${token}`},
      });
      const body = r.status === 204 ? '' : (await r.text()).slice(0, 240);
      results[p.module] = {status: r.status, ok: r.ok || r.status === 204, body};
    } catch (e: any) {
      results[p.module] = {status: 0, ok: false, body: String(e).slice(0, 200)};
    }
  }

  const allOk = Object.values(results).every((r: any) => r.ok);
  return json({
    ok: allOk,
    scopes: tok.scope || null,
    expiresIn: tok.expires_in || null,
    apiDomain: tok.api_domain || null,
    probes: results,
  });
}
