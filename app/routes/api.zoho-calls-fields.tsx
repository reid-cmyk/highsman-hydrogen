// TEMP DIAG — list mandatory fields on Zoho Calls module so we can find
// the real "DO..." field name. Delete after #41 verified.
// GET /api/zoho-calls-fields?key=sparkgreatness-scopecheck-2026

import {json, type LoaderFunctionArgs} from '@shopify/remix-oxygen';

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
    return json({ok: false, stage: 'token', body: (await tokRes.text()).slice(0, 300)});
  }
  const tok = await tokRes.json();
  const token = tok.access_token;

  // Fields metadata for Calls module
  const r = await fetch(
    'https://www.zohoapis.com/crm/v7/settings/fields?module=Calls',
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  const txt = await r.text();
  if (!r.ok) return json({ok: false, stage: 'fields', status: r.status, body: txt.slice(0, 600)});
  let body: any = {};
  try { body = JSON.parse(txt); } catch { return json({ok: false, stage: 'parse', body: txt.slice(0, 400)}); }

  const fields = body.fields || [];
  // Just the relevant bits, sorted with "DO..." first
  const compact = fields.map((f: any) => ({
    api_name: f.api_name,
    field_label: f.field_label,
    data_type: f.data_type,
    system_mandatory: f.system_mandatory,
    custom_field: f.custom_field,
  }));
  const startsWithDO = compact.filter((f: any) => /^DO/i.test(f.api_name));
  const mandatory = compact.filter((f: any) => f.system_mandatory);
  return json({
    ok: true,
    count: compact.length,
    startsWithDO,
    mandatory,
    all: compact,
  });
}
