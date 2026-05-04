/**
 * app/routes/api.order-update.tsx
 * POST /api/order-update
 * Updates an order's status, total_amount, or order_date.
 * Any change triggers org stat recalculation + reorder flag clearing.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {recalcOrgAfterOrder} from '~/routes/api.order-create';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd       = await request.formData();
  const intent   = String(fd.get('intent') || 'patch_status');
  const order_id = String(fd.get('order_id') || '').trim();

  if (!order_id) return json({ok: false, error: 'order_id required'}, {status: 400});

  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // Helper: run patch, return org_id from updated row
  const patch = async (body: object) => {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/sales_orders?id=eq.${order_id}`,
      {method: 'PATCH', headers: h, body: JSON.stringify({...body, updated_at: new Date().toISOString()})},
    );
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      return {ok: false as const, error: `${res.status}: ${t}`};
    }
    const rows = await res.json().catch(() => []);
    const org_id: string | undefined = Array.isArray(rows) ? rows[0]?.organization_id : rows?.organization_id;
    return {ok: true as const, org_id};
  };

  // ── Patch status ────────────────────────────────────────────────────────────
  if (intent === 'patch_status') {
    const status = String(fd.get('status') || '').trim();
    if (!status) return json({ok: false, error: 'status required'}, {status: 400});
    const result = await patch({status});
    if (!result.ok) return json({ok: false, error: result.error}, {status: 500});
    if (result.org_id) recalcOrgAfterOrder(env, result.org_id).catch(() => {});
    return json({ok: true, status});
  }

  // ── Patch amount ─────────────────────────────────────────────────────────────
  if (intent === 'patch_amount') {
    const total_amount = parseFloat(String(fd.get('total_amount') || ''));
    if (isNaN(total_amount)) return json({ok: false, error: 'valid total_amount required'}, {status: 400});
    const result = await patch({total_amount});
    if (!result.ok) return json({ok: false, error: result.error}, {status: 500});
    if (result.org_id) recalcOrgAfterOrder(env, result.org_id).catch(() => {});
    return json({ok: true, total_amount});
  }

  // ── Patch order date ─────────────────────────────────────────────────────────
  if (intent === 'patch_date') {
    const raw_date = String(fd.get('order_date') || '').trim();
    if (!raw_date) return json({ok: false, error: 'order_date required'}, {status: 400});
    const order_date = new Date(raw_date).toISOString();
    const result = await patch({order_date});
    if (!result.ok) return json({ok: false, error: result.error}, {status: 500});
    if (result.org_id) recalcOrgAfterOrder(env, result.org_id).catch(() => {});
    return json({ok: true, order_date});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
