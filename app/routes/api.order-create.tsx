/**
 * app/routes/api.order-create.tsx
 * POST /api/order-create
 * Creates a manual order in sales_orders, then recalculates org stats
 * and clears all reorder flags (new order = back to Healthy).
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

// ─── Shared helper: recalculate org stats after any order change ─────────────
// Called after create AND update. Recomputes orders_count, last_order_date,
// last_order_amount, reorder_cadence_days from live order data, then clears
// all reorder flag timestamps and resets reorder_status to 'healthy'.
export async function recalcOrgAfterOrder(env: any, org_id: string): Promise<void> {
  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  };

  const ordersRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/sales_orders` +
    `?organization_id=eq.${org_id}` +
    `&is_sample_order=eq.false` +
    `&status=not.in.(Cancelled,Rejected)` +
    `&select=order_date,total_amount` +
    `&order=order_date.asc`,
    {headers: h},
  );
  const raw: any[] = await ordersRes.json().catch(() => []);
  const orders = Array.isArray(raw) ? raw.filter(o => o.order_date) : [];

  if (orders.length === 0) return;

  const latest = orders[orders.length - 1];
  const lastOrderDate = String(latest.order_date).slice(0, 10);
  const lastOrderAmount = parseFloat(String(latest.total_amount || 0)) || null;
  const ordersCount = orders.length;

  // Avg days between consecutive orders
  let cadence: number | null = null;
  if (orders.length >= 2) {
    const gaps: number[] = [];
    for (let i = 1; i < orders.length; i++) {
      const diff =
        (new Date(orders[i].order_date).getTime() -
          new Date(orders[i - 1].order_date).getTime()) /
        86400000;
      if (diff > 0) gaps.push(diff);
    }
    if (gaps.length > 0) {
      cadence = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
    }
  }

  // Patch org — clear all flags, update all order stats
  await fetch(
    `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`,
    {
      method: 'PATCH',
      headers: {...h, 'Content-Type': 'application/json', Prefer: 'return=minimal'},
      body: JSON.stringify({
        orders_count:              ordersCount,
        last_order_date:           lastOrderDate,
        last_order_amount:         lastOrderAmount,
        reorder_cadence_days:      cadence,
        reorder_status:            'healthy',
        reorder_flag_aging_at:     null,
        reorder_flag_past_cadence_at: null,
        reorder_flag_low_inv_at:   null,
        reorder_flag_out_of_stock_at: null,
        reorder_suppressed:        false,  // new order unsuppresses the account
        updated_at:                new Date().toISOString(),
      }),
    },
  ).catch(() => {});
}

// ─── Action ───────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({ok: false, error: 'unauthorized'}, {status: 401});

  const fd = await request.formData();
  const org_id               = String(fd.get('org_id') || '').trim() || null;
  const leaflink_customer_name = String(fd.get('leaflink_customer_name') || '').trim();
  const status               = String(fd.get('status') || 'Submitted').trim();
  const order_date           = String(fd.get('order_date') || '').trim() || null;
  const total_amount         = parseFloat(String(fd.get('total_amount') || '0')) || 0;
  const market_state         = String(fd.get('market_state') || '').trim();
  const payment_terms        = String(fd.get('payment_terms') || '').trim() || null;

  if (!leaflink_customer_name || !market_state)
    return json({ok: false, error: 'customer name and market state required'}, {status: 400});

  const order_id = `MAN-${Date.now()}`;

  const h = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/sales_orders`, {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      leaflink_order_id:     order_id,
      organization_id:       org_id,
      leaflink_customer_name,
      status,
      order_date:            order_date ? new Date(order_date).toISOString() : null,
      total_amount,
      credits_applied:       0,
      market_state,
      source:                'manual',
      is_sample_order:       total_amount < 5,
      payment_terms,
      updated_at:            new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return json({ok: false, error: `${res.status}: ${txt}`}, {status: 500});
  }

  const order = await res.json();
  const newOrder = Array.isArray(order) ? order[0] : order;

  // Insert line items if provided
  const lineItemsRaw = String(fd.get('line_items_json') || '[]');
  let lineItems: any[] = [];
  try { lineItems = JSON.parse(lineItemsRaw).filter((l: any) => l.product_name?.trim()); } catch {}

  if (lineItems.length > 0 && newOrder?.id) {
    const lines = lineItems.map((l: any) => {
      const qty   = parseFloat(l.quantity) || 0;
      const price = parseFloat(l.unit_price) || 0;
      return {
        order_id: newOrder.id,
        leaflink_line_id: `${newOrder.id}-${l.product_name?.slice(0, 20)}-${Date.now()}`,
        product_name: l.product_name?.trim() || null,
        quantity: qty, unit_price: price, line_total: qty * price, is_sample: false,
      };
    });
    await fetch(`${env.SUPABASE_URL}/rest/v1/leaflink_order_lines`, {
      method: 'POST',
      headers: {...h, Prefer: 'return=minimal'},
      body: JSON.stringify(lines),
    }).catch(() => {});
  }

  // Recalculate org stats + clear all reorder flags (fire-and-forget)
  if (org_id && total_amount >= 5 && !['Cancelled', 'Rejected'].includes(status)) {
    recalcOrgAfterOrder(env, org_id).catch(() => {});
  }

  return json({ok: true, order: newOrder});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
