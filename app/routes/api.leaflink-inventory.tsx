import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Inventory — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/leaflink-inventory
// Returns available inventory for all Highsman products in LeafLink.
// Keyed by SKU, values are available unit counts.
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const LEAFLINK_COMPANY_ID = 24087; // Canfections NJ, INC

// All Highsman product SKUs we care about
const TRACKED_SKUS = [
  // Hit Stick Singles (Case 24)
  'C-NJ-HSINF-BB', 'C-NJ-HSINF-CQ', 'C-NJ-HSINF-GG', 'C-NJ-HSINF-TM', 'C-NJ-HSINF-WW',
  // Black Tin 5-Packs (Case 6)
  'C-NJ-HSTIN-BB', 'C-NJ-HSTIN-CQ', 'C-NJ-HSTIN-GG', 'C-NJ-HSTIN-TM', 'C-NJ-HSTIN-WW',
  // Fly High 5-Packs (Case 6)
  'C-NJ-HSTINFH-BB', 'C-NJ-HSTINFH-CQ', 'C-NJ-HSTINFH-GG', 'C-NJ-HSTINFH-TM', 'C-NJ-HSTINFH-WW',
  // Triple Threat Pre-Rolls (Case 12)
  'C-NJ-HSTT-WW', 'C-NJ-HSTT-GG', 'C-NJ-HSTT-BB', 'C-NJ-HSTT-TM', 'C-NJ-HSTT-CQ',
  // Ground Game Milled Flower (Case 6)
  'C-NJ-HSGG-WW', 'C-NJ-HSGG-GG', 'C-NJ-HSGG-BB', 'C-NJ-HSGG-TM', 'C-NJ-HSGG-CQ',
];

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;

  if (!apiKey) {
    console.warn('[api/leaflink-inventory] LEAFLINK_API_KEY not configured');
    return json({ok: false, inventory: {}, error: 'Not configured'});
  }

  try {
    // Fetch all products for this seller with inventory fields
    // We paginate to ensure we get everything
    const inventory: Record<string, number> = {};
    let debugSample: any = null; // temp: capture first tracked product's raw data
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
        const sku = product.sku;
        if (!sku || !TRACKED_SKUS.includes(sku)) continue;

        // Capture first tracked product for debugging
        if (!debugSample) {
          debugSample = {
            sku: product.sku,
            listing_state: product.listing_state,
            available_inventory: product.available_inventory,
            quantity: product.quantity,
            reserved_qty: product.reserved_qty,
            keys: Object.keys(product).slice(0, 30),
          };
        }

        // available_inventory is the count after reserved qty is subtracted
        // If listing_state is not "Available", treat as 0
        const available = product.listing_state === 'Available'
          ? Math.max(0, Math.floor(parseFloat(product.available_inventory ?? '0')))
          : 0;

        inventory[sku] = available;
      }

      hasMore = !!data.next;
      page++;
    }

    // Fill in any tracked SKUs that weren't found (treat as 0)
    for (const sku of TRACKED_SKUS) {
      if (!(sku in inventory)) {
        inventory[sku] = 0;
      }
    }

    return json(
      {ok: true, inventory, _debug: debugSample},
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
