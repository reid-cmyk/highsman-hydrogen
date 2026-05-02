/**
 * app/routes/api.state-rank.tsx
 *
 * GET /api/state-rank?state=NJ&name=Premo
 * Returns the rank of a dispensary among all Lit Alerts retailers in its state.
 * Ranking is by number of Highsman SKUs carried (from the partner API).
 *
 * Falls back to Supabase-based rank (by last_order_date) if Lit token missing.
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

const BRAND_ID = 9027;
const LIT_API = 'https://partnerapi.litalerts.com';

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function loader({request, context}: LoaderFunctionArgs) {
  if (!isStagingAuthed(request.headers.get('Cookie') || '')) {
    return json({rank: null, total: null, error: 'unauthorized'}, {status: 401});
  }

  const env = (context as any).env;
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  const orgName = url.searchParams.get('name') || '';
  const leaflinkId = url.searchParams.get('leaflink_id') || '';

  if (!state) return json({rank: null, total: null, error: 'state required'});

  const token = env.LIT_ALERTS_TOKEN;

  // ── Strategy A: Lit Alerts partner API (real state ranking by SKU presence) ──
  if (token) {
    try {
      const res = await fetch(`${LIT_API}/retailers?states=${state}`, {
        headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'},
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data: any = await res.json();
        const retailers: any[] = data?.data || [];

        // Get products for this brand in this state to see SKU counts per retailer
        const prodRes = await fetch(
          `${LIT_API}/brands/${BRAND_ID}/products?state=${state}&includeOOS=true`,
          {headers: {Authorization: `Bearer ${token}`, Accept: 'application/json'}, signal: AbortSignal.timeout(8000)},
        );

        let skuCounts: Record<string, number> = {};
        if (prodRes.ok) {
          const prodData: any = await prodRes.json();
          const products: any[] = prodData?.data || [];
          for (const product of products) {
            const configs: any[] = product.configs || [];
            for (const cfg of configs) {
              const rid = String(cfg.retailerId || '');
              if (rid) skuCounts[rid] = (skuCounts[rid] || 0) + 1;
            }
          }
        }

        // Score each retailer by Highsman SKU count
        const scored = retailers.map((r: any) => ({
          id: String(r.id),
          name: r.name || '',
          skuCount: skuCounts[String(r.id)] || 0,
        })).sort((a, b) => b.skuCount - a.skuCount);

        const total = scored.length;

        // Find this dispensary by leaflink_id first, then by name fuzzy match
        let idx = leaflinkId ? scored.findIndex(r => r.id === leaflinkId) : -1;
        if (idx === -1 && orgName) {
          const normTarget = normalize(orgName);
          idx = scored.findIndex(r => {
            const n = normalize(r.name);
            return n === normTarget || n.includes(normTarget) || normTarget.includes(n);
          });
        }

        if (idx >= 0) {
          return json({rank: idx + 1, total, skuCount: scored[idx].skuCount, source: 'lit'});
        }
        return json({rank: null, total, skuCount: 0, source: 'lit', note: 'not found in Lit roster'});
      }
    } catch (err: any) {
      console.warn('[api/state-rank] Lit API error:', err.message);
    }
  }

  // ── Strategy B: Supabase fallback — rank by last_order_date among our accounts ──
  try {
    const sbH = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,last_order_date&market_state=eq.${state}&lifecycle_stage=in.(active,dormant)&order=last_order_date.desc.nullslast&limit=500`,
      {headers: sbH},
    );
    const orgs: any[] = await res.json();
    const total = orgs.length;
    const normTarget = normalize(orgName);
    const idx = orgs.findIndex(o => {
      const n = normalize(o.name);
      return n === normTarget || n.includes(normTarget) || normTarget.includes(n);
    });
    if (idx >= 0) return json({rank: idx + 1, total, source: 'supabase'});
    return json({rank: null, total, source: 'supabase'});
  } catch {
    return json({rank: null, total: null, error: 'failed'});
  }
}
