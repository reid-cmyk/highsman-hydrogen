/**
 * app/routes/api.order-update.tsx
 * POST /api/order-update
 * Updates an order's status or other fields.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd = await request.formData();
  const intent   = String(fd.get('intent') || 'patch_status');
  const order_id = String(fd.get('order_id') || '').trim();

  if (!order_id) return json({ok: false, error: 'order_id required'}, {status: 400});

  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  if (intent === 'patch_status') {
    const status = String(fd.get('status') || '').trim();
    if (!status) return json({ok: false, error: 'status required'}, {status: 400});

    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/leaflink_orders?id=eq.${order_id}`,
      {method: 'PATCH', headers: h, body: JSON.stringify({status, updated_at: new Date().toISOString()})},
    );
    if (!res.ok) { const t = await res.text().catch(()=>''); return json({ok:false,error:`${res.status}: ${t}`},{status:500}); }
    return json({ok: true, status});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
