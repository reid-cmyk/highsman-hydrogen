/**
 * app/routes/api.product-search.tsx
 * GET /api/product-search?q=...
 * Returns matching products from leaflink_products for autocomplete.
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  if (!isStagingAuthed(request.headers.get('Cookie') || ''))
    return json({products: []}, {status: 401});

  const q = new URL(request.url).searchParams.get('q') || '';
  if (q.length < 2) return json({products: []});

  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
  const res = await fetch(
    `${env.SUPABASE_URL}/rest/v1/leaflink_products?name=ilike.*${encodeURIComponent(q)}*&select=leaflink_sku,name,product_line,wholesale_price,category&limit=10`,
    {headers: h},
  );
  const products = await res.json().catch(() => []);
  return json({products: Array.isArray(products) ? products : []});
}
