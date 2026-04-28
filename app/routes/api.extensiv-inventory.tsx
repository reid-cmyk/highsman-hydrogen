import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getExtensivInventory, isExtensivConfigured} from '~/lib/extensiv';

// ─────────────────────────────────────────────────────────────────────────────
// Extensiv Inventory — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/extensiv-inventory
// Returns a {sku → qtyAvailable} map for every SKU under Highsman's customer
// record in Extensiv. Used by /retail's loader to gate add-to-cart and hide
// out-of-stock SKUs.
//
// Caching: 60-second worker-instance cache so a busy /retail page doesn't
// hammer Extensiv. Cache is per-isolate, not global — fine for our scale.
// ─────────────────────────────────────────────────────────────────────────────

const CACHE_TTL_MS = 60 * 1000;

type CacheEntry = {at: number; data: Record<string, number>};
let cache: CacheEntry | null = null;

export async function loader({context, request}: LoaderFunctionArgs) {
  const env = context.env as any;

  if (!isExtensivConfigured(env)) {
    console.warn('[api/extensiv-inventory] Extensiv not configured — returning empty');
    return json({ok: false, inventory: {}, error: 'Not configured'});
  }

  // Honor ?fresh=1 to bypass cache (debug + the order-submit path uses this).
  const url = new URL(request.url);
  const fresh = url.searchParams.get('fresh') === '1';

  const now = Date.now();
  if (!fresh && cache && now - cache.at < CACHE_TTL_MS) {
    return json({ok: true, inventory: cache.data, cached: true});
  }

  try {
    const rows = await getExtensivInventory(env);
    const flat: Record<string, number> = {};
    for (const sku of Object.keys(rows)) flat[sku] = rows[sku].qty;
    cache = {at: now, data: flat};
    return json({ok: true, inventory: flat, cached: false});
  } catch (err: any) {
    console.error('[api/extensiv-inventory]', err?.message || err);
    // Fail-soft: return last good cache if we have one, otherwise empty.
    if (cache) return json({ok: true, inventory: cache.data, cached: true, stale: true});
    return json({ok: false, inventory: {}, error: String(err?.message || err)});
  }
}
