import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Inventory — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaflink-inventory
// Returns available inventory for all Highsman products in LeafLink.
// Keyed by our internal SKU, values are available unit counts.
//
// NOTE: LeafLink auto-generates SKUs (random hashes), so we match by
// LeafLink Product ID instead, then map back to our internal SKUs.
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const LEAFLINK_COMPANY_ID = 24087; // Canfections NJ, INC

// LeafLink Product ID → our internal SKU
// (Reverse of the SKU_TO_PRODUCT_ID mapping in api.leaflink-order.tsx)
const PRODUCT_ID_TO_SKU: Record<number, string> = {
  // Hit Stick Singles (0.5g, Case 24)
  2554071: 'C-NJ-HSINF-BB',
  2554859: 'C-NJ-HSINF-CQ',
  2554839: 'C-NJ-HSINF-GG',
  2554077: 'C-NJ-HSINF-TM',
  2554845: 'C-NJ-HSINF-WW',
  // Black Tin 5-Packs (Case 6)
  2642378: 'C-NJ-HSTIN-BB',
  2642379: 'C-NJ-HSTIN-CQ',
  2642381: 'C-NJ-HSTIN-GG',
  2642380: 'C-NJ-HSTIN-TM',
  2642382: 'C-NJ-HSTIN-WW',
  // Fly High 5-Packs (Case 6)
  2644313: 'C-NJ-HSTINFH-BB',
  2644314: 'C-NJ-HSTINFH-CQ',
  2644315: 'C-NJ-HSTINFH-GG',
  2644316: 'C-NJ-HSTINFH-TM',
  2644317: 'C-NJ-HSTINFH-WW',
  // Triple Threat Pre-Rolls (1.2g, Case 12)
  2816205: 'C-NJ-HSTT-WW',
  2816206: 'C-NJ-HSTT-GG',
  2816207: 'C-NJ-HSTT-BB',
  2816208: 'C-NJ-HSTT-TM',
  2816209: 'C-NJ-HSTT-CQ',
  // Ground Game Milled Flower (7g, Case 6)
  2816210: 'C-NJ-HSGG-WW',
  2816211: 'C-NJ-HSGG-GG',
  2816212: 'C-NJ-HSGG-BB',
  2816213: 'C-NJ-HSGG-TM',
  2816214: 'C-NJ-HSGG-CQ',
};

const TRACKED_PRODUCT_IDS = new Set(Object.keys(PRODUCT_ID_TO_SKU).map(Number));
const ALL_SKUS = Object.values(PRODUCT_ID_TO_SKU);

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;

  if (!apiKey) {
    console.warn('[api/leaflink-inventory] LEAFLINK_API_KEY not configured');
    return json({ok: false, inventory: {}, error: 'Not configured'});
  }

  try {
    const inventory: Record<string, number> = {};
    let matched = 0;
    let page = 1;
    let hasMore = true;

    while (hasMore && page <= 10) {
      const url = `${LEAFLINK_API_BASE}/products/?seller=${LEAFLINK_COMPANY_ID}&page_size=100&page=${page}`;
      const res = await fetch(url, {
        headers: {Authorization: `Token ${apiKey}`},
      });

      if (!res.ok) {
        console.error(`[api/leaflink-inventory] API error (${res.status}):`, await res.text().catch(() => ''));
        break;
      }

      const data = await res.json();
      if (!data.results || data.results.length === 0) break;

      for (const product of data.results) {
        const productId = product.id;
        if (!productId || !TRACKED_PRODUCT_IDS.has(productId)) continue;

        const sku = PRODUCT_ID_TO_SKU[productId];
        if (!sku) continue;

        // Use quantity minus reserved_qty as available count
        // If listing_state is not "Available", treat as 0
        const qty = parseFloat(product.quantity ?? '0');
        const reserved = parseFloat(product.reserved_qty ?? '0');
        const available = product.listing_state === 'Available'
          ? Math.max(0, Math.floor(qty - reserved))
          : 0;

        inventory[sku] = available;
        matched++;
      }

      // Early exit if we've found all tracked products
      if (matched >= ALL_SKUS.length) break;

      hasMore = !!data.next;
      page++;
    }

    // Fill in any tracked SKUs that weren't found (treat as 0)
    for (const sku of ALL_SKUS) {
      if (!(sku in inventory)) {
        inventory[sku] = 0;
      }
    }

    // Temp debug: find all Highsman-related products
    const highsmanProducts: Array<{id: number; name: string; listing_state: string; qty: string}> = [];
    try {
      let dp = 1;
      let dMore = true;
      while (dMore && dp <= 10) {
        const dRes = await fetch(`${LEAFLINK_API_BASE}/products/?seller=${LEAFLINK_COMPANY_ID}&page_size=100&page=${dp}`, {
          headers: {Authorization: `Token ${apiKey}`},
        });
        if (!dRes.ok) break;
        const dData = await dRes.json();
        if (!dData.results || dData.results.length === 0) break;
        for (const p of dData.results) {
          const name = (p.name || '').toLowerCase();
          if (name.includes('highsman') || name.includes('hit stick') || name.includes('triple threat') || name.includes('ground game') || name.includes('fly high') || name.includes('blueberry blitz') || name.includes('watermelon') || name.includes('grape') || name.includes('mango') || name.includes('cake quake')) {
            highsmanProducts.push({id: p.id, name: p.name, listing_state: p.listing_state, qty: p.quantity});
          }
        }
        dMore = !!dData.next;
        dp++;
      }
    } catch {}

    return json(
      {ok: true, inventory, _matched: matched, _highsman: highsmanProducts},
      {
        headers: {
          // Cache for 5 minutes — inventory doesn't change that fast
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      },
    );
  } catch (err: any) {
    console.error('[api/leaflink-inventory] Unexpected error:', err.message);
    return json({ok: false, inventory: {}, error: 'Failed to fetch inventory'});
  }
}
