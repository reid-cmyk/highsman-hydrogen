import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {encodeHeaderValue} from '~/lib/email-headers';
import {
  LAUNCH_PROMO,
  LAUNCH_TERMS_VERSION,
  isLaunchActive,
  SKU_TO_PRODUCT_LINE_ID,
  discountForProductLineId,
} from '~/lib/launch-promo';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Order Creation — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaflink-order
// Creates an order in LeafLink from njmenu cart data.
// Keeps LeafLink API key server-side (never exposed to browser).
// On failure, sends email notification via Gmail API to njorders@highsman.com.
// ─────────────────────────────────────────────────────────────────────────────

const LEAFLINK_API_BASE = 'https://app.leaflink.com/api/v2';
const FAILURE_NOTIFY_EMAIL = 'njsales@highsman.com';
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
  // Headers run through RFC 2047 encoded-word so em-dashes and smart quotes
  // in the subject render correctly in every inbox. The earlier ASCII-strip
  // workaround that lived here turned "\u2014" into "-" everywhere \u2014 fine, but
  // also nuked legit accents in dispensary names. Now we keep the original
  // text and encode the header properly.
  const subjectHeader = encodeHeaderValue(params.subject);
  // Body keeps full UTF-8 \u2014 declare 8bit on the part below so transports
  // that handle 8BITMIME (everything modern, including Gmail) leave it alone.
  const safeBody = params.body;

  // Build RFC 2822 MIME message
  const utf8Mime = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${subjectHeader}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    safeBody,
  ].join('\r\n');

  // Base64url encode (Gmail API requirement). Handle UTF-8 bytes via
  // TextEncoder so multi-byte chars in the body don't blow up btoa().
  const utf8Bytes = new TextEncoder().encode(utf8Mime);
  let bin = '';
  for (let i = 0; i < utf8Bytes.length; i++) bin += String.fromCharCode(utf8Bytes[i]);
  const encoded = btoa(bin)
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
/** Strip everything but [a-z0-9] and lowercase. Handles "RE-000726",
 *  "re 000726", "RE000726 ", etc. — all normalize to "re000726". */
function normalizeLicense(s: any): string {
  return String(s || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
}

/** True if `candidate` contains `target` as a whole license token.
 *
 *  LeafLink's `license_number` field often contains the license number
 *  followed by the license-type label, e.g.:
 *    "RE000726  Adult Use Cannabis Retailer (Class 5) (NJ)"
 *  We split on non-alphanumerics and look for an exact token match so
 *  "RE000726" matches the leading token without false-positive prefix
 *  collisions ("RE00072" won't match "RE000726"). Also accepts a fully
 *  normalized equality for fields stored with internal hyphens/spaces.
 */
function licenseFieldMatches(candidate: any, target: string): boolean {
  if (!candidate) return false;
  const raw = String(candidate);
  const tokens = raw.split(/[^a-zA-Z0-9]+/);
  for (const tok of tokens) {
    if (tok && tok.toLowerCase() === target) return true;
  }
  return normalizeLicense(raw) === target;
}

/** Pull all license-bearing strings off a LeafLink customer record. */
function collectCustomerLicenseFields(c: any): string[] {
  const out: string[] = [];
  if (c?.license_number) out.push(String(c.license_number));
  if (c?.business_license) out.push(String(c.business_license));
  if (Array.isArray(c?.licenses)) {
    for (const lic of c.licenses) {
      if (typeof lic === 'string') out.push(lic);
      else if (lic && typeof lic === 'object') {
        if (lic.license_number) out.push(String(lic.license_number));
        if (lic.number) out.push(String(lic.number));
        if (lic.value) out.push(String(lic.value));
      }
    }
  }
  return out;
}

async function findCustomerByLicense(
  licenseNumber: string,
  apiKey: string,
): Promise<{id: number; name: string} | null> {
  const target = normalizeLicense(licenseNumber);
  if (!target) return null;
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
      const fields = collectCustomerLicenseFields(c);
      for (const field of fields) {
        if (licenseFieldMatches(field, target)) {
          console.log(`[api/leaflink-order] License scan match: "${c.name}" (ID: ${c.id}) for license "${licenseNumber}" (matched field: "${field.slice(0, 80)}")`);
          return {id: c.id, name: c.name};
        }
      }
    }

    nextUrl = data.next || null;
    pages++;
  }

  console.warn(`[api/leaflink-order] No license match found for "${licenseNumber}" after scanning ${pages} pages`);
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

        // Distinct-term match scoring — count how many *unique* search terms
        // hit this customer's name or nickname. A single common word (e.g. "green")
        // matching multiple customers must NOT be enough to pick one. We had
        // "Eastern Green" misroute to "Green Lightning Cultivation" because the
        // old summed-score gate accepted score=2 from a single shared word.
        const matchedTerms = new Set<string>();
        for (const term of searchTerms) {
          if (custNameLower.includes(term) || custNickLower.includes(term)) {
            matchedTerms.add(term);
          }
        }
        const matchCount = matchedTerms.size;
        if (matchCount > 0 && (!bestMatch || matchCount > bestMatch.score)) {
          bestMatch = {id: cust.id, name: cust.name, score: matchCount};
        }
      }

      if (!data.next) break;
      page++;
    }

    // Only accept the fuzzy match if EVERY distinct search term matched and
    // the dispensary name had at least 2 terms to match against. Single-word
    // names ("Bloom") fall through to exact-match only, never fuzzy. Multi-word
    // names ("Eastern Green") must hit every word — partial overlap is unsafe.
    if (
      bestMatch &&
      searchTerms.length >= 2 &&
      bestMatch.score === searchTerms.length
    ) {
      console.log(`[api/leaflink-order] Best customer match: "${bestMatch.name}" (ID: ${bestMatch.id}, terms matched: ${bestMatch.score}/${searchTerms.length}) for "${dispensaryName}"`);
      return {id: bestMatch.id, name: bestMatch.name};
    }
    if (bestMatch) {
      console.warn(`[api/leaflink-order] Rejecting weak fuzzy match "${bestMatch.name}" (terms ${bestMatch.score}/${searchTerms.length}) for "${dispensaryName}" — falling back to email`);
    }

    console.warn(`[api/leaflink-order] No customer match found for "${dispensaryName}" among Canfections NJ buyers`);

    return null;
  } catch (err) {
    console.error('[api/leaflink-order] Customer search error:', err);
    return null;
  }
}

/** Create an order in LeafLink via the orders-received endpoint. */
/**
 * Turn a Highsman SKU into a buyer-readable name. The SKU format is
 * `C-NJ-{LINE}-{STRAIN}` (or `C-S-NJ-...` for samples). Used to translate
 * LeafLink line-item errors into something a buyer can actually act on.
 */
function friendlyNameForSku(sku: string): string {
  const STRAIN_NAMES: Record<string, string> = {
    BB: 'Blueberry Blitz',
    CQ: 'Cake Quake',
    GG: 'Gridiron Grape',
    TM: 'Touchdown Tango Mango',
    WW: 'Wavey Watermelon',
  };
  const LINE_NAMES: Record<string, string> = {
    HSINF: 'Hit Sticks Single',
    HSTIN: 'Hit Sticks Power Pack',
    HSTINFH: 'Fly High Tin',
    HSTT: 'Triple Threat Pre-Roll',
    HSGG: 'Ground Game',
  };
  // Strip optional sample prefix
  const clean = sku.replace(/^C-S-NJ-/, 'C-NJ-');
  const m = clean.match(/^C-NJ-(HSINF|HSTIN|HSTINFH|HSTT|HSGG)-(BB|CQ|GG|TM|WW)$/);
  if (!m) return sku;
  const lineName = LINE_NAMES[m[1]] || m[1];
  const strainName = STRAIN_NAMES[m[2]] || m[2];
  const isSample = sku.startsWith('C-S-');
  return `${strainName} ${lineName}${isSample ? ' (Sample)' : ''}`;
}

/**
 * Parse LeafLink's 400 response into a buyer-friendly message. LeafLink
 * sends per-line-item validation errors in the same order as the request,
 * so we can map errors back to our original line items by index.
 *
 * Common error shape LeafLink returns when inventory is insufficient:
 *   { line_items: [{}, {}, {product_id: ["..."], available_inventory: ["24.0000"],
 *                    quantity: ["Total combined quantity for all inherited products
 *                                exceeds available inventory"]}] }
 *
 * Returns null if the body doesn't look like a recognizable inventory error,
 * so the caller falls back to the raw message.
 */
function parseLeafLinkInventoryError(
  rawBody: string,
  lineItems: Array<{sku: string; quantity: number; isSample?: boolean}>,
): string | null {
  let parsed: any;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const itemErrors: any[] = Array.isArray(parsed?.line_items) ? parsed.line_items : [];
  if (itemErrors.length === 0) return null;

  const shortages: string[] = [];
  for (let i = 0; i < itemErrors.length; i++) {
    const err = itemErrors[i];
    if (!err || typeof err !== 'object' || Object.keys(err).length === 0) continue;
    // We only know how to surface inventory shortages right now
    const available = Array.isArray(err.available_inventory) ? err.available_inventory[0] : null;
    const quantityMsg = Array.isArray(err.quantity) ? err.quantity[0] : null;
    if (available == null && !quantityMsg) continue;

    const orig = lineItems[i];
    const sku = orig?.sku || '(unknown SKU)';
    const requested = orig?.quantity ?? null;
    const friendly = friendlyNameForSku(sku);
    const availNum = available != null ? Math.floor(parseFloat(available)) : null;

    if (availNum != null && requested != null) {
      shortages.push(`${friendly}: ordered ${requested}, only ${availNum} available`);
    } else if (availNum != null) {
      shortages.push(`${friendly}: only ${availNum} available`);
    } else {
      shortages.push(`${friendly}: ${quantityMsg || 'inventory issue'}`);
    }
  }

  if (shortages.length === 0) return null;
  if (shortages.length === 1) {
    return `Insufficient inventory — ${shortages[0]}. Reduce the quantity and resubmit.`;
  }
  return `Insufficient inventory on ${shortages.length} items:\n• ${shortages.join('\n• ')}\n\nReduce the quantities and resubmit.`;
}

async function createLeafLinkOrder(
  params: {
    customerId: number | null;
    dispensaryName: string;
    lineItems: Array<{sku: string; quantity: number; unitPrice: number; isSample?: boolean}>;
    notes: string;
  },
  apiKey: string,
): Promise<{success: boolean; orderNumber?: string; error?: string}> {
  // Build regular line items — quantity = individual units, price = per-unit wholesale
  const regularItems = params.lineItems
    .filter(item => !item.isSample && SKU_TO_PRODUCT_ID[item.sku])
    .map(item => {
      const productId = SKU_TO_PRODUCT_ID[item.sku];
      console.log(`[api/leaflink-order] Line item: SKU=${item.sku} → Product=${productId}, qty=${item.quantity} units, price=$${item.unitPrice}/unit`);
      return {
        product: productId,
        quantity: item.quantity.toString(),
        ordered_unit_price: {
          amount: item.unitPrice.toFixed(2),
          currency: 'USD',
        },
        sale_price: {
          amount: item.unitPrice.toFixed(2),
          currency: 'USD',
        },
      };
    });

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

  console.log(`[api/leaflink-order] Submitting order payload:`, JSON.stringify(orderPayload, null, 2));

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

    // Try to translate LeafLink's per-line-item validation errors into
    // something a dispensary buyer can act on (most common: inventory
    // shortage on a specific strain). Fall back to the truncated raw
    // body if we don't recognize the shape.
    if (res.status === 400) {
      const friendly = parseLeafLinkInventoryError(text, params.lineItems);
      if (friendly) {
        return {success: false, error: friendly};
      }
    }
    return {
      success: false,
      error: `LeafLink API error (${res.status}): ${text.slice(0, 200)}`,
    };
  }

  const data = await res.json();
  console.log(`[api/leaflink-order] LeafLink order created:`, JSON.stringify({
    number: data.number,
    short_id: data.short_id,
    line_items: data.line_items?.map((li: any) => ({
      product: li.product,
      quantity: li.quantity,
      ordered_unit_price: li.ordered_unit_price,
      sale_price: li.sale_price,
    })),
  }, null, 2));
  return {
    success: true,
    orderNumber: data.number || data.short_id || 'unknown',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (POST /api/leaflink-order)
// ─────────────────────────────────────────────────────────────────────────────

// ── TEMP: Diagnostic endpoint to verify LeafLink product IDs ──────────────
// ─────────────────────────────────────────────────────────────────────────────
// LAUNCH Promo — Zoho Account stamp + once-per-account enforcement
// ─────────────────────────────────────────────────────────────────────────────
// Custom fields on the Zoho Accounts module:
//   Launch_Promo_Used         (boolean)  — true once redeemed
//   Launch_Promo_Redeemed_At  (datetime) — ISO timestamp of redemption
//   Launch_Promo_Order_Number (text)     — LeafLink order # for audit trail
// One-time setup in Zoho UI (see project memory).
// ─────────────────────────────────────────────────────────────────────────────

async function checkLaunchPromoUsed(
  env: any,
  zohoAccountId: string,
): Promise<{used: boolean; error?: string}> {
  try {
    const token = await getZohoAccessToken(env);
    if (!token) return {used: false, error: 'No Zoho token'};
    const url = `https://www.zohoapis.com/crm/v7/Accounts/${zohoAccountId}?fields=Launch_Promo_Used,Launch_Promo_Redeemed_At`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (res.status === 204) return {used: false};
    if (!res.ok) {
      const body = await res.text();
      console.warn('[launch-promo] Zoho Account fetch failed:', res.status, body.slice(0, 200));
      // Fail-open: if Zoho is unreachable, allow the order to proceed without
      // the discount-stacking risk being blocked. The audit trail will catch
      // duplicates via the daily Zoho report.
      return {used: false, error: `Zoho ${res.status}`};
    }
    const data: any = await res.json();
    const account = data?.data?.[0];
    return {used: account?.Launch_Promo_Used === true};
  } catch (err: any) {
    console.warn('[launch-promo] checkLaunchPromoUsed error:', err.message);
    return {used: false, error: err.message};
  }
}

async function stampLaunchPromoOnAccount(
  env: any,
  zohoAccountId: string,
  orderNumber: string | null,
  termsVersion: string | null,
): Promise<{ok: boolean; error?: string}> {
  try {
    const token = await getZohoAccessToken(env);
    if (!token) return {ok: false, error: 'No Zoho token'};
    const url = `https://www.zohoapis.com/crm/v7/Accounts/${zohoAccountId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            Launch_Promo_Used: true,
            Launch_Promo_Redeemed_At: new Date().toISOString(),
            Launch_Promo_Order_Number: orderNumber || '',
            Launch_Promo_Terms_Version: termsVersion || '',
          },
        ],
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.warn('[launch-promo] Zoho Account stamp failed:', res.status, body.slice(0, 300));
      return {ok: false, error: `Zoho ${res.status}`};
    }
    console.log(`[launch-promo] Stamped Account ${zohoAccountId} as redeemed (order ${orderNumber || 'n/a'})`);
    return {ok: true};
  } catch (err: any) {
    console.warn('[launch-promo] stampLaunchPromoOnAccount error:', err.message);
    return {ok: false, error: err.message};
  }
}

/**
 * Sanity-check that a client-sent unitPrice for a LAUNCH-eligible SKU
 * matches the expected discount rate. Returns true if price looks honest,
 * false if it deviates more than 1¢ from expected (rounding tolerance).
 *
 * BASE prices live in njmenu._index.tsx — we duplicate them here so the
 * server can validate without importing UI code. Update both if pricing
 * changes.
 */
const BASE_CASE_PRICES: Record<string, number> = {
  'triple-threat': 174.0,
  'ground-game': 270.0,
  'hit-sticks-single': 168.0,
  'hit-sticks-5pack': 180.0,
  'fly-high-tins': 180.0,
};

function expectedDiscountedCasePrice(sku: string): number | null {
  const lineId = SKU_TO_PRODUCT_LINE_ID[sku];
  if (!lineId) return null;
  const base = BASE_CASE_PRICES[lineId];
  if (base == null) return null;
  const rate = discountForProductLineId(lineId);
  return Math.round(base * (1 - rate.percent / 100) * 100) / 100;
}

export async function loader({request, context}: ActionFunctionArgs) {
  const url = new URL(request.url);
  const env = context.env as any;
  const apiKey = env.LEAFLINK_API_KEY;
  if (!apiKey) return json({error: 'No API key'});

  // Diagnostic: dump customer records that match a license number — used to
  // figure out which LeafLink field (license_number top-level, licenses[],
  // business_license, etc.) actually carries the license value, and what
  // surrounding text trips up exact-match comparisons.
  // Usage: GET /api/leaflink-order?debug=license&q=RE000726
  if (url.searchParams.get('debug') === 'license') {
    const q = (url.searchParams.get('q') || '').trim();
    if (!q) return json({error: 'pass ?q=RE000726'}, {status: 400});
    const target = normalizeLicense(q);
    let nextUrl: string | null = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&page_size=200`;
    let pages = 0;
    const matches: any[] = [];
    const samples: any[] = [];
    while (nextUrl && pages < 20) {
      const res = await fetch(nextUrl, {headers: {Authorization: `Token ${apiKey}`}});
      if (!res.ok) break;
      const data = await res.json();
      if (!data.results?.length) break;
      for (const c of data.results) {
        const fields = collectCustomerLicenseFields(c);
        const hit = fields.some((f) => licenseFieldMatches(f, target));
        if (hit) {
          matches.push({
            id: c.id,
            name: c.name,
            license_number: c.license_number,
            licenses: c.licenses,
            business_license: c.business_license,
          });
        }
        // Also collect a few sample records that mention the digits anywhere,
        // even if the matcher rejected them — helps spot a stored variant.
        const digits = q.replace(/[^0-9]/g, '');
        if (digits.length >= 4 && samples.length < 5) {
          const blob = JSON.stringify({a: c.license_number, b: c.licenses, c: c.business_license});
          if (blob.includes(digits)) {
            samples.push({
              id: c.id,
              name: c.name,
              license_number: c.license_number,
              licenses: c.licenses,
              business_license: c.business_license,
            });
          }
        }
      }
      nextUrl = data.next || null;
      pages++;
    }
    return json({query: q, normalizedTarget: target, pagesScanned: pages, matches, digitSamples: samples});
  }

  // Diagnostic: search Canfections NJ customers by name fragment.
  // Tries 3 strategies: (1) full pagination scan with seller filter,
  // (2) LeafLink's ?search= built-in (server-side index), and
  // (3) global search without seller filter as a sanity check.
  // Usage: GET /api/leaflink-order?debug=customer&q=Uforia
  if (url.searchParams.get('debug') === 'customer') {
    const q = (url.searchParams.get('q') || '').trim().toLowerCase();
    if (!q) return json({error: 'pass ?q=name'}, {status: 400});

    // Strategy 1: paginate seller=24087 and walk every page client-side
    let nextUrl: string | null = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&page_size=200`;
    let pagesScanned = 0;
    let totalCustomersScanned = 0;
    const sellerScanMatches: any[] = [];
    let firstPageCount: number | null = null;
    let firstPageTotal: number | null = null;
    while (nextUrl && pagesScanned < 30) {
      const res = await fetch(nextUrl, {headers: {Authorization: `Token ${apiKey}`}});
      if (!res.ok) break;
      const data = await res.json();
      if (firstPageCount === null) {
        firstPageCount = data.results?.length || 0;
        firstPageTotal = data.count ?? null;
      }
      if (!data.results?.length) break;
      totalCustomersScanned += data.results.length;
      for (const c of data.results) {
        const name = (c.name || '').toLowerCase();
        const nick = (c.nickname || '').toLowerCase();
        if (name.includes(q) || nick.includes(q)) {
          sellerScanMatches.push({
            id: c.id, name: c.name, nickname: c.nickname,
            license_number: c.license_number, licenses: c.licenses,
            email: c.email, source: 'seller-paginate',
          });
        }
      }
      nextUrl = data.next || null;
      pagesScanned++;
    }

    // Strategy 2: LeafLink's ?search= filter scoped to seller
    const searchScopedUrl = `${LEAFLINK_API_BASE}/customers/?seller=${LEAFLINK_COMPANY_ID}&search=${encodeURIComponent(q)}&page_size=50`;
    const searchScopedRes = await fetch(searchScopedUrl, {headers: {Authorization: `Token ${apiKey}`}});
    let searchScoped: any = {ok: searchScopedRes.ok, status: searchScopedRes.status};
    if (searchScopedRes.ok) {
      const sd = await searchScopedRes.json();
      searchScoped.count = sd.count;
      searchScoped.results = (sd.results || []).map((c: any) => ({
        id: c.id, name: c.name, nickname: c.nickname,
        license_number: c.license_number, licenses: c.licenses, email: c.email,
      }));
    }

    // Strategy 3: global ?search= (no seller filter) — sanity check that
    // Uforia exists in LeafLink at all and what seller IDs they're tied to
    const searchGlobalUrl = `${LEAFLINK_API_BASE}/customers/?search=${encodeURIComponent(q)}&page_size=20`;
    const searchGlobalRes = await fetch(searchGlobalUrl, {headers: {Authorization: `Token ${apiKey}`}});
    let searchGlobal: any = {ok: searchGlobalRes.ok, status: searchGlobalRes.status};
    if (searchGlobalRes.ok) {
      const gd = await searchGlobalRes.json();
      searchGlobal.count = gd.count;
      searchGlobal.results = (gd.results || []).map((c: any) => ({
        id: c.id, name: c.name, seller: c.seller, buyer: c.buyer,
        license_number: c.license_number,
      }));
    }

    return json({
      query: q,
      sellerPaginate: {
        pagesScanned,
        totalCustomersScanned,
        firstPageCount,
        firstPageTotal,
        matches: sellerScanMatches,
      },
      searchScoped,
      searchGlobal,
    });
  }

  // Fix products: set unit_multiplier and sell_in_unit_of_measure for TT and GG
  if (url.searchParams.get('debug') === 'fix-products') {
    // Triple Threat: case of 12, Ground Game: case of 6
    const updates: Array<{id: number; sku: string; unit_multiplier: number}> = [
      // Triple Threat — case of 12
      {id: 2816205, sku: 'C-NJ-HSTT-WW', unit_multiplier: 12},
      {id: 2816206, sku: 'C-NJ-HSTT-GG', unit_multiplier: 12},
      {id: 2816207, sku: 'C-NJ-HSTT-BB', unit_multiplier: 12},
      {id: 2816208, sku: 'C-NJ-HSTT-TM', unit_multiplier: 12},
      {id: 2816209, sku: 'C-NJ-HSTT-CQ', unit_multiplier: 12},
      // Ground Game — case of 6
      {id: 2816210, sku: 'C-NJ-HSGG-WW', unit_multiplier: 6},
      {id: 2816211, sku: 'C-NJ-HSGG-GG', unit_multiplier: 6},
      {id: 2816212, sku: 'C-NJ-HSGG-BB', unit_multiplier: 6},
      {id: 2816213, sku: 'C-NJ-HSGG-TM', unit_multiplier: 6},
      {id: 2816214, sku: 'C-NJ-HSGG-CQ', unit_multiplier: 6},
    ];

    const results: any[] = [];
    for (const u of updates) {
      try {
        const res = await fetch(`${LEAFLINK_API_BASE}/products/${u.id}/`, {
          method: 'PATCH',
          headers: {
            Authorization: `Token ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            unit_multiplier: u.unit_multiplier,
            sell_in_unit_of_measure: 'Case',
          }),
        });
        const body = await res.text();
        results.push({
          sku: u.sku,
          id: u.id,
          unit_multiplier: u.unit_multiplier,
          status: res.status,
          ok: res.ok,
          response: body.slice(0, 300),
        });
      } catch (e: any) {
        results.push({sku: u.sku, id: u.id, error: e.message});
      }
    }
    return json({action: 'fix-products', results});
  }

  if (url.searchParams.get('debug') !== 'products') {
    return json({error: 'Not found'}, {status: 404});
  }

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
        // Return all fields for debugging — compare Hit Sticks vs Ground Game
        results.push(p);
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

  const {dispensaryName, dispensaryId, dispensaryLicense, items, notes, promoCode, launchTermsAgreed, launchTermsVersion, customerId: customerIdOverride} = body;

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

  // ── LAUNCH Promo Validation ──────────────────────────────────────
  // Re-validate window + once-per-account rule server-side. Trust nothing
  // from the client. Soft-fails (allows order through without discount
  // stamp) only if Zoho is unreachable — see checkLaunchPromoUsed comment.
  let launchValid = false;
  if (promoCode && typeof promoCode === 'string') {
    const code = promoCode.trim().toUpperCase();
    if (code !== LAUNCH_PROMO.code) {
      return json({ok: false, error: `Promo code "${promoCode}" is not valid.`}, {status: 400});
    }
    if (!isLaunchActive()) {
      return json({ok: false, error: 'The LAUNCH promo window has closed.'}, {status: 400});
    }
    if (launchTermsAgreed !== true) {
      return json(
        {
          ok: false,
          error: 'You must agree to the LAUNCH Promo Terms to use this code.',
          launchTermsRequired: true,
        },
        {status: 400},
      );
    }
    if (dispensaryId) {
      const used = await checkLaunchPromoUsed(env, String(dispensaryId));
      if (used.used) {
        return json(
          {
            ok: false,
            error: 'The LAUNCH code has already been redeemed by your account. Remove the code and resubmit.',
            launchAlreadyUsed: true,
          },
          {status: 400},
        );
      }
    }
    // Verify each LAUNCH-eligible line item's unitPrice matches the expected
    // discounted price (within 1¢ rounding). Catches client tampering / bugs.
    for (const item of eligibleItems) {
      const expected = expectedDiscountedCasePrice(item.sku);
      if (expected != null && Math.abs(item.unitPrice - expected) > 0.01) {
        console.warn(
          `[launch-promo] Price mismatch on ${item.sku}: client=${item.unitPrice}, expected=${expected}`,
        );
        return json(
          {ok: false, error: 'Cart pricing looks off. Refresh the page and try again.'},
          {status: 400},
        );
      }
    }
    launchValid = true;
  }

  try {
    // Step 1: Find the customer in LeafLink.
    // Rule: if a license number was supplied with the order, license is the ONLY
    // way to match. Falling back to fuzzy name search after a failed license
    // lookup misrouted Eastern Green (RE000726) to "Green Lightning Cultivation".
    // The right behavior when license fails is to email the rep for manual entry —
    // they can fix the LeafLink customer record (set license_number) and resubmit.
    let customer: {id: number; name: string} | null = null;
    if (customerIdOverride && Number.isInteger(customerIdOverride)) {
      // Trusted override from internal admin/rep tooling. Skip lookup entirely.
      console.log(`[api/leaflink-order] customerId override supplied: ${customerIdOverride} for "${dispensaryName}"`);
      customer = {id: customerIdOverride, name: dispensaryName};
    } else if (dispensaryLicense) {
      console.log(`[api/leaflink-order] Trying license lookup: "${dispensaryLicense}" for "${dispensaryName}"`);
      customer = await findCustomerByLicense(dispensaryLicense, apiKey);
      if (!customer) {
        console.warn(`[api/leaflink-order] License "${dispensaryLicense}" not found in LeafLink for "${dispensaryName}" — skipping name fallback to avoid wrong-customer match`);
      }
    } else {
      console.log(`[api/leaflink-order] No license on dispensary record — trying name lookup for "${dispensaryName}"`);
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
        reason: dispensaryLicense
          ? `Customer "${dispensaryName}" (license ${dispensaryLicense}) not found in LeafLink — verify the LeafLink customer record has license_number set, then manually enter this order`
          : `Customer "${dispensaryName}" not found in LeafLink — order needs manual entry`,
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
      // Stamp Zoho Account so the LAUNCH code is one-and-done for this dispensary.
      let launchStamped = false;
      if (launchValid && dispensaryId) {
        // Use the version the buyer actually saw, falling back to the
        // server's compiled value if the client omitted it.
        const versionToStamp =
          (typeof launchTermsVersion === 'string' && launchTermsVersion) ||
          LAUNCH_TERMS_VERSION;
        const stamp = await stampLaunchPromoOnAccount(
          env,
          String(dispensaryId),
          result.orderNumber || null,
          versionToStamp,
        );
        launchStamped = stamp.ok;
      }
      return json({
        ok: true,
        orderNumber: result.orderNumber,
        customerMatched: true,
        customerName: customer.name,
        itemsSynced: eligibleItems.length,
        itemsSkipped: items.length - eligibleItems.length,
        launchPromoApplied: launchValid,
        launchPromoStamped: launchStamped,
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
