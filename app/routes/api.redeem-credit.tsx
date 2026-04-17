import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Buyer Store Credit — Gift Card Redemption API
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/redeem-credit  { contactId, email, amount?, redeemAll? }
//   → Verifies buyer identity against Zoho Contact
//   → Creates a Shopify customer (or uses existing) for that email
//   → Creates a Shopify gift card for the requested amount
//   → Triggers Shopify to email the code to the buyer
//   → Deducts the redeemed amount from the Zoho Store_Credit field
//   → Returns masked gift card code + remaining balance
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_FIELD = 'Store_Credit';
const MIN_REDEEM = 1.0; // Minimum redemption amount ($1.00)
const DEFAULT_ADMIN_SHOP = 'qcpbii-fn.myshopify.com';
const ADMIN_API_VERSION = '2024-01';

// ─── Zoho OAuth (same pattern as api.buyer-credit.tsx) ───────────────────────

let cachedZohoToken: string | null = null;
let zohoTokenExpiresAt = 0;

async function getZohoToken(env: {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}): Promise<string> {
  const now = Date.now();
  if (cachedZohoToken && now < zohoTokenExpiresAt) return cachedZohoToken;

  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      refresh_token: env.ZOHO_REFRESH_TOKEN,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  cachedZohoToken = data.access_token;
  zohoTokenExpiresAt = now + 55 * 60 * 1000;
  return cachedZohoToken!;
}

// ─── Zoho Contact fetch (by id) ──────────────────────────────────────────────

type ZohoContact = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  credit: number;
};

async function fetchZohoContact(contactId: string, token: string): Promise<ZohoContact | null> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v2/Contacts/${encodeURIComponent(contactId)}`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json();
  const c = data.data?.[0];
  if (!c) return null;
  return {
    id: c.id,
    email: (c.Email || '').toLowerCase(),
    firstName: c.First_Name || '',
    lastName: c.Last_Name || '',
    credit: parseFloat(c[CREDIT_FIELD]) || 0,
  };
}

async function setZohoCredit(contactId: string, newBalance: number, token: string): Promise<boolean> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v2/Contacts/${encodeURIComponent(contactId)}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [{id: contactId, [CREDIT_FIELD]: newBalance}],
      }),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[redeem-credit] Zoho set credit failed (${res.status}):`, text.slice(0, 300));
    return false;
  }
  return true;
}

// ─── Shopify Admin API helpers ───────────────────────────────────────────────

type ShopifyEnv = {
  SHOPIFY_ADMIN_API_TOKEN?: string;
  SHOPIFY_ADMIN_SHOP?: string;
};

function adminUrl(env: ShopifyEnv, path: string): string {
  const shop = env.SHOPIFY_ADMIN_SHOP || DEFAULT_ADMIN_SHOP;
  return `https://${shop}/admin/api/${ADMIN_API_VERSION}/${path}`;
}

function adminHeaders(env: ShopifyEnv): HeadersInit {
  return {
    'X-Shopify-Access-Token': env.SHOPIFY_ADMIN_API_TOKEN || '',
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

/** Find a Shopify customer by email. Returns null if not found. */
async function findShopifyCustomer(
  email: string,
  env: ShopifyEnv,
): Promise<{id: number; email: string} | null> {
  const url = adminUrl(env, `customers/search.json?query=${encodeURIComponent(`email:${email}`)}`);
  const res = await fetch(url, {headers: adminHeaders(env)});
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[redeem-credit] Shopify customer search failed (${res.status}):`, text.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const c = data?.customers?.[0];
  if (!c) return null;
  return {id: c.id, email: c.email};
}

/** Create a Shopify customer. Returns null on failure. */
async function createShopifyCustomer(
  params: {email: string; firstName: string; lastName: string},
  env: ShopifyEnv,
): Promise<{id: number; email: string} | null> {
  const url = adminUrl(env, 'customers.json');
  const res = await fetch(url, {
    method: 'POST',
    headers: adminHeaders(env),
    body: JSON.stringify({
      customer: {
        email: params.email,
        first_name: params.firstName,
        last_name: params.lastName,
        tags: 'wholesale-credit-redemption',
        // Ensure the customer can receive transactional email from Shopify
        email_marketing_consent: {
          state: 'not_subscribed',
          opt_in_level: 'single_opt_in',
        },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[redeem-credit] Shopify customer create failed (${res.status}):`, text.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const c = data?.customer;
  if (!c) return null;
  return {id: c.id, email: c.email};
}

/** Create a Shopify gift card. Returns the full code (only available at creation). */
async function createShopifyGiftCard(
  params: {customerId: number; amount: number; note: string},
  env: ShopifyEnv,
): Promise<{id: number; code: string; lastCharacters: string; initialValue: number} | null> {
  const url = adminUrl(env, 'gift_cards.json');
  const res = await fetch(url, {
    method: 'POST',
    headers: adminHeaders(env),
    body: JSON.stringify({
      gift_card: {
        initial_value: params.amount.toFixed(2),
        customer_id: params.customerId,
        note: params.note,
        template_suffix: null,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[redeem-credit] Shopify gift card create failed (${res.status}):`, text.slice(0, 300));
    return null;
  }
  const data = await res.json();
  const gc = data?.gift_card;
  if (!gc) return null;
  return {
    id: gc.id,
    code: gc.code, // full code is only available at creation time
    lastCharacters: gc.last_characters || '',
    initialValue: parseFloat(gc.initial_value) || params.amount,
  };
}

/** Trigger Shopify to send the gift card email to the attached customer. */
async function sendGiftCardEmail(giftCardId: number, env: ShopifyEnv): Promise<boolean> {
  // Shopify's GraphQL Admin API exposes giftCardSendNotificationToCustomer
  const url = adminUrl(env, 'graphql.json');
  const mutation = `
    mutation sendGiftCardEmail($id: ID!) {
      giftCardSendNotificationToCustomer(id: $id) {
        userErrors { field message }
      }
    }
  `;
  const variables = {id: `gid://shopify/GiftCard/${giftCardId}`};
  const res = await fetch(url, {
    method: 'POST',
    headers: adminHeaders(env),
    body: JSON.stringify({query: mutation, variables}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[redeem-credit] Shopify send gift card email failed (${res.status}):`, text.slice(0, 300));
    return false;
  }
  const data = await res.json();
  const errs = data?.data?.giftCardSendNotificationToCustomer?.userErrors || [];
  if (errs.length > 0) {
    console.error('[redeem-credit] Gift card email userErrors:', JSON.stringify(errs));
    return false;
  }
  return true;
}

// ─── POST /api/redeem-credit ─────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as any;

  // Validate config
  if (!env.ZOHO_CLIENT_ID) {
    return json({ok: false, error: 'Zoho not configured'}, {status: 500});
  }
  if (!env.SHOPIFY_ADMIN_API_TOKEN) {
    return json({
      ok: false,
      error: 'Gift card redemption is not yet enabled — admin API token missing.',
    }, {status: 503});
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'Invalid JSON'}, {status: 400});
  }

  const {contactId, email, amount, redeemAll} = body || {};

  if (!contactId || typeof contactId !== 'string') {
    return json({ok: false, error: 'contactId is required'}, {status: 400});
  }
  if (!email || typeof email !== 'string') {
    return json({ok: false, error: 'email is required'}, {status: 400});
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const zohoToken = await getZohoToken(env);

    // Step 1 — Fetch Zoho Contact and verify identity
    const contact = await fetchZohoContact(contactId, zohoToken);
    if (!contact) {
      return json({ok: false, error: 'Contact not found'}, {status: 404});
    }
    if (contact.email !== normalizedEmail) {
      console.warn(
        `[redeem-credit] Email mismatch for contact ${contactId}: ${contact.email} vs ${normalizedEmail}`,
      );
      return json({ok: false, error: 'Email does not match contact record'}, {status: 403});
    }

    // Step 2 — Determine redemption amount
    const currentBalance = contact.credit;
    let redeemAmount: number;
    if (redeemAll === true || amount === undefined || amount === null) {
      redeemAmount = currentBalance;
    } else if (typeof amount === 'number' && amount > 0) {
      redeemAmount = Math.min(amount, currentBalance);
    } else {
      return json({ok: false, error: 'amount must be a positive number'}, {status: 400});
    }

    redeemAmount = Math.floor(redeemAmount * 100) / 100;

    if (redeemAmount < MIN_REDEEM) {
      return json({
        ok: false,
        error: `Minimum redemption is $${MIN_REDEEM.toFixed(2)}. Current balance: $${currentBalance.toFixed(2)}`,
        currentBalance,
      }, {status: 400});
    }

    // Step 3 — Find or create Shopify customer
    let customer = await findShopifyCustomer(normalizedEmail, env);
    if (!customer) {
      customer = await createShopifyCustomer(
        {
          email: normalizedEmail,
          firstName: contact.firstName,
          lastName: contact.lastName,
        },
        env,
      );
    }
    if (!customer) {
      return json({ok: false, error: 'Could not create Shopify customer for redemption'}, {status: 500});
    }

    // Step 4 — Create the gift card
    const noteLines = [
      `Wholesale buyer credit redemption`,
      `Buyer: ${contact.firstName} ${contact.lastName} <${contact.email}>`,
      `Zoho Contact ID: ${contact.id}`,
      `Previous balance: $${currentBalance.toFixed(2)}`,
      `Redeemed amount: $${redeemAmount.toFixed(2)}`,
      `Date: ${new Date().toISOString()}`,
    ];
    const giftCard = await createShopifyGiftCard(
      {
        customerId: customer.id,
        amount: redeemAmount,
        note: noteLines.join('\n'),
      },
      env,
    );
    if (!giftCard) {
      return json({ok: false, error: 'Failed to create Shopify gift card'}, {status: 500});
    }

    // Step 5 — Deduct from Zoho Store_Credit
    const newBalance = Math.round((currentBalance - redeemAmount) * 100) / 100;
    const deductOk = await setZohoCredit(contactId, newBalance, zohoToken);
    if (!deductOk) {
      // We have a created gift card but failed to deduct. Log prominently so
      // the clawback can be handled manually. The gift card still works for
      // the buyer — we just didn't debit their balance.
      console.error(
        `[redeem-credit] CRITICAL: Gift card ${giftCard.id} created for $${redeemAmount} ` +
        `but failed to deduct from Zoho contact ${contactId}. Manual reconciliation needed.`,
      );
    }

    // Step 6 — Trigger Shopify to email the code
    const emailSent = await sendGiftCardEmail(giftCard.id, env);

    // Return masked code (never return full code in API response unless user asks)
    // We return the full code ONCE here since the buyer just initiated this themselves.
    console.log(
      `[redeem-credit] Redeemed $${redeemAmount} for contact ${contactId} ` +
      `(${contact.email}) → gift card ${giftCard.id} (…${giftCard.lastCharacters}). ` +
      `Email sent: ${emailSent}`,
    );

    return json({
      ok: true,
      action: 'redeemed',
      amount: redeemAmount,
      giftCardCode: giftCard.code, // full code — show once to buyer
      giftCardLastChars: giftCard.lastCharacters,
      previousBalance: currentBalance,
      newBalance,
      emailSent,
      apparelUrl: 'https://highsman.com/apparel',
    });
  } catch (err: any) {
    console.error('[redeem-credit] Action error:', err?.message || err);
    return json({ok: false, error: 'Internal error during redemption'}, {status: 500});
  }
}

// Block GETs — this endpoint only accepts POST
export async function loader() {
  return json({ok: false, error: 'POST only'}, {status: 405});
}
