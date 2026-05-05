/**
 * app/routes/sales-staging.api.org-orders.tsx
 * GET /sales-staging/api/org-orders?org_id=...
 * Returns orders for a specific org, sorted newest first.
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const _sfCk = request.headers.get('Cookie')||''; if (!isStagingAuthed(_sfCk) && !getSFToken(_sfCk))
    return json({orders: []}, {status: 401});

  const url = new URL(request.url);
  const org_id = url.searchParams.get('org_id') || '';
  if (!org_id) return json({orders: []});

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/sales_orders?organization_id=eq.${org_id}&is_sample_order=eq.false&order=order_date.desc.nullslast&limit=50`,
    {headers: h},
  );
  const orders = await res.json().catch(() => []);
  return json({orders: Array.isArray(orders) ? orders : []});
}
