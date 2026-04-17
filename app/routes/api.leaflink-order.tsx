import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Order Creation — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaflink-order
// Creates an order in LeafLink from njmenu cart data.
// Keeps LeafLink API key server-side (never exposed to browser).
// On failure, sends email notification via Gmail API to njorders@highsman.com.
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const FAILURE_NOTIFY_EMAIL = 'njorders@highsman.com';
const LEAFLINK_COMPANY_ID = 24087; // Canfections NJ, INC

// SKU → LeafLink Product ID mapping
const SKU_TO_PRODUCT_ID: Record<string, number> = {
  // Hit Stick Singles (0.5g, Case 24)
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
  // Triple Threat Pre-Rolls (1.2g, Case 12)
  'C-NJ-HSTT-WW': 2816205,
  'C-NJ-HSTT-GG': 2816206,
  'C-NJ-HSTT-BB': 2816207,
  'C-NJ-HSTT-TM': 2816208,
  'C-NJ-HSTT-CQ': 2816209,
  // Ground Game Milled Flower (7g, Case 6)
  'C-NJ-HSGG-WW': 2816210,
  'C-NJ-HSGG-GG': 2816211,
  'C-NJ-HSGG-BB': 2816212,
  'C-NJ-HSGG-TM': 2816213,
  'C-NJ-HSGG-CQ': 2816214,
};

// Sample SKU → LeafLink Product ID mapping
// Samples use the same underlying product (Hit Stick singles for all infused samples,
// Triple Threat for pre-roll samples, Ground Game for flower samples)
const SAMPLE_SKU_TO_PRODUCT_ID: Record<string, number> = {
  // Hit Stick samples (all Hit Stick / Power Pack / Fly High samples = Hit Stick singles)
  'C-S-NJ-HSINF-BB': 2554071,
  'C-S-NJ-HSINF-CQ': 2554859,
  'C-S-NJ-HSINF-GG': 2554839,
  'C-S-NJ-HSINF-TM': 2554077,
  'C-S-NJ-HSINF-WW': 2554845,
  // Triple Threat samples
  'C-S-NJ-HSTT-BB': 2816207,
  'C-S-NJ-HSTT-CQ': 2816209,
  'C-S-NJ-HSTT-GG': 2816206,
  'C-S-NJ-HSTT-TM': 2816208,
  'C-S-NJ-HSTT-WW': 2816205,
  // Ground Game samples
  'C-S-NJ-HSGG-BB': 2816212,
  'C-S-NJ-HSGG-CQ': 2816214,
  'C-S-NJ-HSGG-GG': 2816211,
  'C-S-NJ-HSGG-TM': 2816213,
  'C-S-NJ-HSGG-WW': 2816210,
};

// ─────────────────────────────────────────────────────────────────────────────
// Gmail API — Failure Notification Email
// ─────────────────────────────────────────────────────────────────────────────
// Uses OAuth2 refresh token to get an access token, then sends via Gmail REST API.
// Env vars needed: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN, GMAIL_FROM_EMAIL

/** Get a fresh Gmail access token using the stored refresh token. */
async function getGmailAccessToken(env: {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      console.error('[gmail] Token refresh failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error('[gmail] Token refresh error:', err);
    return null;
  }
}

/** Send an email via Gmail REST API. */
async function sendGmailEmail(params: {
  accessToken: string;
  from: string;
  to: string;
  subject: string;
  body: string;
}): Promise<boolean> {
  // Sanitize subject and body to pure ASCII to avoid encoding issues
  const sanitize = (s: string) => s.replace(/[\u2014\u2013]/g, '-').replace(/[\u2018\u2019]/g, "'").replace(/[\u2022]/g, '*').replace(/[^\x00-\x7F]/g, '');
  const safeSubject = sanitize(params.subject);
  const safeBody = sanitize(params.body);

  // Build RFC 2822 MIME message (ASCII-safe)
  const mimeMessage = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${safeSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    safeBody,
  ].join('\r\n');

  // Base64url encode (Gmail API requirement)
  const encoded = btoa(mimeMessage)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({raw: encoded}),
    });
    if (!res.ok) {
      console.error('[gmail] Send failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    console.log('[gmail] Failure notification sent successfully');
    return true;
  } catch (err) {
    console.error('[gmail] Send error:', err);
    return false;
  }
}

/** Send a failure notification email for a LeafLink order that couldn't be synced. */
async function sendFailureNotification(
  env: any,
  params: {
    dispensaryName: string;
    reason: string;
    items: Array<{sku: string; quantity: number; unitPrice: number}>;
    notes?: string;
  },
): Promise<void> {
  const clientId = env.GOOGLE_CLIENT_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET;
  const refreshToken = env.GOOGLE_REFRESH_TOKEN;
  const fromEmail = env.GMAIL_FROM_EMAIL || 'njorders@highsman.com';

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[gmail] Gmail credentials not configured — skipping failure notification email');
    return;
  }

  const accessToken = await getGmailAccessToken({
    GOOGLE_CLIENT_ID: clientId,
    GOOGLE_CLIENT_SECRET: clientSecret,
    GOOGLE_REFRESH_TOKEN: refreshToken,
  });

  if (!accessToken) {
    console.error('[gmail] Could not get access token — failure notification not sent');
    return;
  }

  // Build the email body
  const itemLines = params.items.map(
    (item) => `  * ${item.sku} - ${item.quantity} units @ $${item.unitPrice.toFixed(2)}/unit`,
  );

  const emailBody = [
    'HIGHSMAN ORDER INPUT FAILED',
    '═══════════════════════════════════════',
    '',
    `DISPENSARY: ${params.dispensaryName}`,
    `DATE: ${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})}`,
    '',
    `REASON: ${params.reason}`,
    '',
    '───────────────────────────────────────',
    'ORDER ITEMS:',
    ...itemLines,
    '',
    ...(params.notes ? [`NOTE: ${params.notes}`, ''] : []),
    '═══════════════════════════════════════',
    'This order needs to be input manually into LeafLink.',
    `LeafLink: https://app.leaflink.com/c/canfections-nj-inc/orders/received/`,
    '',
    '- Highsman Automated Order System',
  ].join('\n');

  const subject = `HIGHSMAN Order Input Failed for ${params.dispensaryName} - ${params.reason}`;

  await sendGmailEmail({
    accessToken,
    from: fromEmail,
    to: FAILURE_NOTIFY_EMAIL,
    subject,
    body: emailBody,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Customer Search
// ─────────────────────────────────────────────────────────────────────────────

/** Search LeafLink customers by license number (exact match).
 *  Scans all Canfections NJ customers and matches on license_number field.
 *  This is the preferred method — license numbers are unique state-issued IDs
 *  that don't have the ambiguity problems of business names.
 */
async function findCustomerByLicense(
  licenseNumber: string,
  apiKey: string,
): Promise<{id: number; name: string} | null> {
  const target = licenseNumber.toLowerCase().trim();
  let nextUrl: string | null = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&page_size=200`;
  let pages = 0;

  while (nextUrl && pages < 20) {
    const res = await fetch(nextUrl, {
      headers: {Authorization: `Token ${apiKey}`},
    });
    if (!res.ok) break;
    const data = await res.json();
    if (!data.results || data.results.length === 0) break;

    for (const c of data.results) {
      if ((c.license_number || '').toLowerCase().trim() === target) {
        console.log(`[api/leaflink-order] License scan match: "${c.name}" (ID: ${c.id}) for license "${licenseNumber}"`);
        return {id: c.id, name: c.name};
      }
    }

    nextUrl = data.next || null;
    pages++;
  }

  console.warn(`[api/leaflink-order] No license match found for "${licenseNumber}" after scanning`);
  return null;
}

/** Search LeafLink customers by name (fallback when no license available).
 *  IMPORTANT: Filters by seller (LEAFLINK_COMPANY_ID) so we only match
 *  customers that are actual buyers of Canfections NJ — not customers
 *  belonging to other sellers that happen to share the same name.
 */
async function findCustomer(
  dispensaryName: string,
  apiKey: string,
): Promise<{id: number; name: string} | null> {
  try {
    // Fetch customers scoped to our seller (Canfections NJ) and search client-side
    const searchTerms = dispensaryName.toLowerCase().split(/\s+/).filter(t => t.length > 2);
    let page = 1;
    let bestMatch: {id: number; name: string; score: number} | null = null;

    while (page <= 10) { // max 10 pages (~200 customers per page)
      const url = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&fields_include=id,name,nickname&page_size=100&page=${page}`;
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
          console.log(`[api/leaflink-order] Exact customer match: "${cust.name}" (ID: ${cust.id}) for "${dispensaryName}"`);
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
      console.log(`[api/leaflink-order] Best customer match: "${bestMatch.name}" (ID: ${bestMatch.id}, score: ${bestMatch.score}) for "${dispensaryName}"`);
      return {id: bestMatch.id, name: bestMatch.name};
    }

    console.warn(`[api/leaflink-order] No customer match found for "${dispensaryName}" among Canfections NJ buyers`);

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
    lineItems: Array<{sku: string; quantity: number; unitPrice: number; isSample?: boolean}>;
    notes: string;
  },
  apiKey: string,
): Promise<{success: boolean; orderNumber?: string; error?: string}> {
  // Build regular line items
  const regularItems = params.lineItems
    .filter(item => !item.isSample && SKU_TO_PRODUCT_ID[item.sku])
    .map(item => ({
      product: SKU_TO_PRODUCT_ID[item.sku],
      quantity: item.quantity.toString(),
      ordered_unit_price: {
        amount: item.unitPrice.toFixed(2),
        currency: 'USD',
      },
      sale_price: {
        amount: item.unitPrice.toFixed(2),
        currency: 'USD',
      },
    }));

  // Build sample line items — $0.01, 1 unit each, tagged as sample
  const sampleItems = params.lineItems
    .filter(item => item.isSample && SAMPLE_SKU_TO_PRODUCT_ID[item.sku])
    .map(item => ({
      product: SAMPLE_SKU_TO_PRODUCT_ID[item.sku],
      quantity: item.quantity.toString(),
      ordered_unit_price: {
        amount: '0.01',
        currency: 'USD',
      },
      sale_price: {
        amount: '0.01',
        currency: 'USD',
      },
      // Tag as sample via AVAILABLE_FOR_SAMPLES flag
      AVAILABLE_FOR_SAMPLES: true,
    }));

  const leaflinkLineItems = [...regularItems, ...sampleItems];

  if (leaflinkLineItems.length === 0) {
    return {success: false, error: 'No matching LeafLink products found in cart'};
  }

  // Build notes with sample callout
  const sampleNote = sampleItems.length > 0
    ? `\n[SAMPLES: ${sampleItems.length} sample line(s) included at $0.01 — tag as SAMPLE]`
    : '';

  // Build order payload
  const orderPayload: Record<string, any> = {
    seller: LEAFLINK_COMPANY_ID,
    status: 'Submitted',
    line_items: leaflinkLineItems,
    delivery_preferences: (params.notes || `Order from NJ Menu — ${params.dispensaryName}`) + sampleNote,
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

// ── TEMP: Diagnostic endpoint to verify LeafLink product IDs ──────────────
export async function loader({request, context}: ActionFunctionArgs) {
  const url = new URL(request.url);
  if (url.searchParams.get('debug') !== 'products') {
    return json({error: 'Not found'}, {status: 404});
  }
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;
  if (!apiKey) return json({error: 'No API key'});

  // Collect all product IDs we reference
  const allProductIds = new Set<number>([
    ...Object.values(SKU_TO_PRODUCT_ID),
    ...Object.values(SAMPLE_SKU_TO_PRODUCT_ID),
  ]);

  const results: any[] = [];
  for (const pid of allProductIds) {
    try {
      const res = await fetch(`${LEAFLINK_API_BASE}/products/${pid}/`, {
        headers: {Authorization: `Token ${apiKey}`},
      });
      if (res.ok) {
        const p = await res.json();
        results.push({
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit_of_measure: p.unit_of_measure,
          quantity_per_unit: p.quantity_per_unit,
          unit_denomination: p.unit_denomination,
          wholesale_price: p.wholesale_price,
          category: p.category,
          subcategory: p.subcategory,
        });
      } else {
        results.push({id: pid, error: `HTTP ${res.status}`});
      }
    } catch (e: any) {
      results.push({id: pid, error: e.message});
    }
  }

  // Also show the SKU → ID mapping for cross-reference
  return json({
    skuMapping: SKU_TO_PRODUCT_ID,
    sampleSkuMapping: SAMPLE_SKU_TO_PRODUCT_ID,
    products: results,
  });
}

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

  const {dispensaryName, dispensaryId, dispensaryLicense, items, notes} = body;

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

  // Check if any items are LeafLink-eligible (regular products or samples)
  const eligibleItems = items.filter((item: any) =>
    SKU_TO_PRODUCT_ID[item.sku] || SAMPLE_SKU_TO_PRODUCT_ID[item.sku]
  );
  if (eligibleItems.length === 0) {
    return json({
      ok: true,
      skipped: true,
      message: 'No LeafLink-eligible products in cart',
    });
  }

  try {
    // Step 1: Find the customer in LeafLink — try license first, then name
    let customer: {id: number; name: string} | null = null;
    if (dispensaryLicense) {
      console.log(`[api/leaflink-order] Trying license lookup: "${dispensaryLicense}" for "${dispensaryName}"`);
      customer = await findCustomerByLicense(dispensaryLicense, apiKey);
    }
    if (!customer) {
      console.log(`[api/leaflink-order] Trying name lookup for "${dispensaryName}"`);
      customer = await findCustomer(dispensaryName, apiKey);
    }
    console.log(
      `[api/leaflink-order] Customer lookup for "${dispensaryName}" (license: ${dispensaryLicense || 'none'}):`,
      customer ? `Found ${customer.name} (ID: ${customer.id})` : 'Not found',
    );

    // Step 2: If no customer found or customer not linked, skip LeafLink and notify
    // LeafLink requires a valid customer field — orders can't be created without one
    if (!customer) {
      console.warn(`[api/leaflink-order] No customer match for "${dispensaryName}" — sending email notification`);
      await sendFailureNotification(env, {
        dispensaryName,
        reason: `Customer "${dispensaryName}" not found in LeafLink — order needs manual entry`,
        items: eligibleItems,
        notes,
      });

      return json({
        ok: true,
        skipped: false,
        manualEntry: true,
        message: `Order received — "${dispensaryName}" not found in LeafLink. Notification sent for manual entry.`,
        customerMatched: false,
        itemsSynced: 0,
        itemsSkipped: eligibleItems.length,
      });
    }

    // Step 3: Create the order with customer link
    let result = await createLeafLinkOrder(
      {
        customerId: customer.id,
        dispensaryName,
        lineItems: eligibleItems,
        notes: notes || '',
      },
      apiKey,
    );

    // If order failed because customer isn't linked to our seller, fall back to email
    if (!result.success && result.error?.includes('is not a customer of')) {
      console.warn(
        `[api/leaflink-order] Customer ${customer.name} (${customer.id}) not linked to seller — falling back to email`,
      );
      await sendFailureNotification(env, {
        dispensaryName,
        reason: `Customer "${customer.name}" (ID: ${customer.id}) exists in LeafLink but is not linked to Canfections NJ as a buyer. Order needs manual entry. Please add them as a customer in LeafLink.`,
        items: eligibleItems,
        notes,
      });

      return json({
        ok: true,
        skipped: false,
        manualEntry: true,
        message: `Order received — "${customer.name}" is not yet linked as a Canfections NJ customer in LeafLink. Notification sent for manual entry.`,
        customerMatched: false,
        customerName: customer.name,
        itemsSynced: 0,
        itemsSkipped: eligibleItems.length,
      });
    }

    if (result.success) {
      return json({
        ok: true,
        orderNumber: result.orderNumber,
        customerMatched: true,
        customerName: customer.name,
        itemsSynced: eligibleItems.length,
        itemsSkipped: items.length - eligibleItems.length,
      });
    } else {
      // Order creation failed for another reason — send failure notification
      await sendFailureNotification(env, {
        dispensaryName,
        reason: result.error || 'LeafLink order creation failed',
        items: eligibleItems,
        notes,
      });

      return json({
        ok: false,
        error: result.error,
      });
    }
  } catch (err: any) {
    console.error('[api/leaflink-order] Unexpected error:', err.message);

    // Unexpected error — send failure notification
    await sendFailureNotification(env, {
      dispensaryName,
      reason: `Unexpected error: ${err.message || 'Unknown'}`,
      items: eligibleItems,
      notes,
    });

    return json({
      ok: false,
      error: 'Unexpected error creating LeafLink order',
    });
  }
}
