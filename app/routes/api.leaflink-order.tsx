import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Order Creation — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaflink-order
// Creates an order in LeafLink from njmenu cart data.
// Keeps LeafLink API key server-side (never exposed to browser).
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const LEAFLINK_COMPANY_ID = 24087; // Canfections NJ, INC

// SKU → LeafLink Product ID mapping
// Only Hit Sticks singles, Black Tin 5-packs, and Fly High Tins are in LeafLink
const SKU_TO_PRODUCT_ID: Record<string, number> = {
  // Singles (0.5g)
  'C-NJ-HSINF-BB': 2554071,
  'C-NJ-HSINF-CQ': 2554859,
  'C-NJ-HSINF-GG': 2554839,
  'C-NJ-HSINF-TM': 2554077,
  'C-NJ-HSINF-WW': 2554845,
  // Black Tin 5-Packs (Case 6)
  'C-NJ-HSTIN-BB': 2642378,
  'C-NJ-HSTIN-CQ': 2642379,
  'C-NJ-HSTIN-GG': 2642381,
  'C-NJ-HSTIN-TM': 2642380,
  'C-NJ-HSTIN-WW': 2642382,
  // Fly High 5-Packs (Case 6)
  'C-NJ-HSTINFH-BB': 2644313,
  'C-NJ-HSTINFH-CQ': 2644314,
  'C-NJ-HSTINFH-GG': 2644315,
  'C-NJ-HSTINFH-TM': 2644316,
  'C-NJ-HSTINFH-WW': 2644317,
};

/** Search LeafLink customers by name to find the matching dispensary. */
async function findCustomer(
  dispensaryName: string,
  apiKey: string,
): Promise<{id: number; name: string} | null> {
  try {
    // Fetch all customers and search client-side (LeafLink doesn't have great search filters)
    // We'll paginate through to find a match
    const searchTerms = dispensaryName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let page = 1;
    let bestMatch: {id: number; name: string; score: number} | null = null;

    while (page <= 10) { // max 10 pages (~200 customers per page)
      const url = `${LEAFLINK_API_BASE}/customers/?fields_include=id,name,nickname&page_size=100&page=${page}`;
      const res = await fetch(url, {
        headers: {Authorization: `Token ${apiKey}`},
      });

      if (!res.ok) break;
      const data = await res.json();
      if (!data.results || data.results.length === 0) break;

      for (const cust of data.results) {
        const custNameLower = (cust.name || '').toLowerCase();
        const custNickLower = (cust.nickname || '').toLowerCase();

        // Exact match
        if (custNameLower === dispensaryName.toLowerCase() || custNickLower === dispensaryName.toLowerCase()) {
          return {id: cust.id, name: cust.name};
        }

        // Partial match scoring
        let score = 0;
        for (const term of searchTerms) {
          if (custNameLower.includes(term)) score += 2;
          if (custNickLower.includes(term)) score += 1;
        }
        if (score > 0 && (!bestMatch || score > bestMatch.score)) {
          bestMatch = {id: cust.id, name: cust.name, score};
        }
      }

      if (!data.next) break;
      page++;
    }

    // Only return best match if it's a reasonable match (at least 2 term hits)
    if (bestMatch && bestMatch.score >= 2) {
      return {id: bestMatch.id, name: bestMatch.name};
    }

    return null;
  } catch (err) {
    console.error('[api/leaflink-order] Customer search error:', err);
    return null;
  }
}

/** Create an order in LeafLink via the orders-received endpoint. */
async function createLeafLinkOrder(
  params: {
    customerId: number | null;
    dispensaryName: string;
    lineItems: Array<{sku: string; quantity: number; unitPrice: number}>;
    notes: string;
  },
  apiKey: string,
): Promise<{success: boolean; orderNumber?: string; error?: string}> {
  // Build line items — only include items with valid LeafLink product IDs
  const leaflinkLineItems = params.lineItems
    .filter(item => SKU_TO_PRODUCT_ID[item.sku])
    .map(item => ({
      product: SKU_TO_PRODUCT_ID[item.sku],
      quantity: item.quantity.toString(),
      ordered_unit_price: {
        amount: item.unitPrice.toFixed(2),
        currency: 'USD',
      },
    }));

  if (leaflinkLineItems.length === 0) {
    return {success: false, error: 'No matching LeafLink products found in cart'};
  }

  // Build order payload
  const orderPayload: Record<string, any> = {
    seller: LEAFLINK_COMPANY_ID,
    status: 'Submitted',
    line_items: leaflinkLineItems,
    delivery_preferences: params.notes || `Order from NJ Menu — ${params.dispensaryName}`,
    external_id_seller: `NJMENU-${Date.now()}`,
  };

  // If we found a matching customer, include them
  if (params.customerId) {
    orderPayload.customer = {id: params.customerId};
  }

  const res = await fetch(`${LEAFLINK_API_BASE}/orders-received/`, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[api/leaflink-order] LeafLink order creation failed (${res.status}):`, text.slice(0, 500));
    return {
      success: false,
      error: `LeafLink API error (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json();
  return {
    success: true,
    orderNumber: data.number || data.short_id || 'unknown',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (POST /api/leaflink-order)
// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;

  if (!apiKey) {
    console.warn('[api/leaflink-order] LEAFLINK_API_KEY not configured');
    return json({
      ok: false,
      error: 'LeafLink integration not configured',
      skipped: true,
    });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'Invalid JSON body'}, {status: 400});
  }

  const {dispensaryName, dispensaryId, items, notes} = body;

  if (!dispensaryName) {
    return json({ok: false, error: 'Dispensary name is required'}, {status: 400});
  }

  if (!items || !Array.isArray(items) || items.length === 0) {
    return json({ok: false, error: 'Cart items are required'}, {status: 400});
  }

  // Validate items have required fields
  for (const item of items) {
    if (!item.sku || typeof item.quantity !== 'number' || typeof item.unitPrice !== 'number') {
      return json({ok: false, error: 'Each item must have sku, quantity, and unitPrice'}, {status: 400});
    }
  }

  // Check if any items are LeafLink-eligible
  const eligibleItems = items.filter((item: any) => SKU_TO_PRODUCT_ID[item.sku]);
  if (eligibleItems.length === 0) {
    return json({
      ok: true,
      skipped: true,
      message: 'No LeafLink-eligible products in cart (only Hit Sticks singles and 5-packs sync to LeafLink)',
    });
  }

  try {
    // Step 1: Find the customer in LeafLink
    const customer = await findCustomer(dispensaryName, apiKey);
    console.log(
      `[api/leaflink-order] Customer lookup for "${dispensaryName}":`,
      customer ? `Found ${customer.name} (ID: ${customer.id})` : 'Not found',
    );

    // Step 2: Create the order
    const result = await createLeafLinkOrder(
      {
        customerId: customer?.id ?? null,
        dispensaryName,
        lineItems: eligibleItems,
        notes: notes || '',
      },
      apiKey,
    );

    if (result.success) {
      return json({
        ok: true,
        orderNumber: result.orderNumber,
        customerMatched: !!customer,
        customerName: customer?.name || null,
        itemsSynced: eligibleItems.length,
        itemsSkipped: items.length - eligibleItems.length,
      });
    } else {
      return json({
        ok: false,
        error: result.error,
      });
    }
  } catch (err: any) {
    console.error('[api/leaflink-order] Unexpected error:', err.message);
    return json({
      ok: false,
      error: 'Unexpected error creating LeafLink order',
    });
  }
}
