/**
 * app/routes/api.order-create.tsx
 * POST /api/order-create
 * Creates a manual order in leaflink_orders (for non-LeafLink markets).
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd = await request.formData();
  const org_id            = String(fd.get('org_id') || '').trim() || null;
  const leaflink_customer_name = String(fd.get('leaflink_customer_name') || '').trim();
  const status            = String(fd.get('status') || 'Submitted').trim();
  const order_date        = String(fd.get('order_date') || '').trim() || null;
  const total_amount      = parseFloat(String(fd.get('total_amount') || '0')) || 0;
  const market_state      = String(fd.get('market_state') || '').trim();
  const payment_terms     = String(fd.get('payment_terms') || '').trim() || null;

  if (!leaflink_customer_name || !market_state)
    return json({ok: false, error: 'customer name and market state required'}, {status: 400});

  // Generate a manual order ID
  const order_id = `MAN-${Date.now()}`;

  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const lineItemsRaw = String(fd.get('line_items_json') || '[]');
  let lineItems: any[] = [];
  try { lineItems = JSON.parse(lineItemsRaw).filter((l:any)=>l.product_name?.trim()); } catch {}

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/leaflink_orders`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      leaflink_order_id:      order_id,
      organization_id:        org_id,
      leaflink_customer_name,
      status,
      order_date:             order_date ? new Date(order_date).toISOString() : null,
      total_amount,
      credits_applied:        0,
      market_state,
      source:                 'manual',
      is_sample_order:        total_amount < 5,
      payment_terms,
      updated_at:             new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return json({ok: false, error: `${res.status}: ${txt}`}, {status: 500});
  }

  const order = await res.json();
  const newOrder = Array.isArray(order) ? order[0] : order;

  // Insert line items if provided
  if (lineItems.length > 0 && newOrder?.id) {
    const lines = lineItems.map((l:any) => {
      const qty = parseFloat(l.quantity)||0;
      const price = parseFloat(l.unit_price)||0;
      return {
        order_id: newOrder.id,
        leaflink_line_id: `${newOrder.id}-${l.product_name?.slice(0,20)}-${Date.now()}`,
        product_name: l.product_name?.trim()||null,
        quantity: qty, unit_price: price, line_total: qty*price, is_sample: false,
      };
    });
    await fetch(`${env.SUPABASE_URL}/rest/v1/leaflink_order_lines`, {
      method: 'POST',
      headers: {...h, Prefer: 'return=minimal'},
      body: JSON.stringify(lines),
    }).catch(()=>{});
  }

  // Bump org orders_count if org linked
  if (org_id && total_amount >= 5 && !['Cancelled','Rejected'].includes(status)) {
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/increment_org_orders`, {
      method: 'POST',
      headers: h,
      body: JSON.stringify({org_id_input: org_id}),
    }).catch(() => {});
  }

  return json({ok: true, order: newOrder});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
