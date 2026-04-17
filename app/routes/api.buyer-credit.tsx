import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Buyer Store Credit — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/buyer-credit?email=buyer@store.com&accountId=669...
//   → Returns buyer's credit balance and name
// POST /api/buyer-credit
//   → Accrues credit (called after successful menu order)
//   → Or creates/links a new buyer contact
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_RATE = 0.005; // 0.5% of order total
const CREDIT_FIELD = 'Store_Credit'; // Custom currency field on Zoho Contacts

// ─── Zoho OAuth ──────────────────────────────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) return cachedAccessToken;

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
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedAccessToken!;
}

// ─── Zoho Contact Helpers ────────────────────────────────────────────────────

/** Find a Contact by email that is linked to a specific Account. */
async function findContactByEmail(
  email: string,
  accountId: string,
  token: string,
): Promise<{id: string; name: string; credit: number} | null> {
  // Search contacts by email
  const searchUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?email=${encodeURIComponent(email)}`;
  const res = await fetch(searchUrl, {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });

  if (!res.ok) {
    if (res.status === 204) return null; // no results
    console.error(`[buyer-credit] Zoho contact search failed (${res.status})`);
    return null;
  }

  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;

  // Find the contact linked to this account
  for (const contact of data.data) {
    const contactAccountId = contact.Account_Name?.id;
    if (contactAccountId === accountId) {
      return {
        id: contact.id,
        name: `${contact.First_Name || ''} ${contact.Last_Name || ''}`.trim(),
        credit: parseFloat(contact[CREDIT_FIELD]) || 0,
      };
    }
  }

  // Contact exists but not linked to this account — return it anyway
  // (the buyer may order for multiple dispensaries)
  const first = data.data[0];
  return {
    id: first.id,
    name: `${first.First_Name || ''} ${first.Last_Name || ''}`.trim(),
    credit: parseFloat(first[CREDIT_FIELD]) || 0,
  };
}

/** Create a new Contact linked to an Account. */
async function createContact(
  params: {firstName: string; lastName: string; email: string; accountId: string},
  token: string,
): Promise<{id: string; name: string; credit: number} | null> {
  const res = await fetch('https://www.zohoapis.com/crm/v2/Contacts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [{
        First_Name: params.firstName,
        Last_Name: params.lastName,
        Email: params.email,
        Account_Name: {id: params.accountId},
        [CREDIT_FIELD]: 0,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[buyer-credit] Zoho contact create failed (${res.status}):`, text.slice(0, 300));
    return null;
  }

  const data = await res.json();
  const created = data.data?.[0];
  if (created?.status === 'success') {
    return {
      id: created.details.id,
      name: `${params.firstName} ${params.lastName}`.trim(),
      credit: 0,
    };
  }

  console.error('[buyer-credit] Zoho contact create response:', JSON.stringify(data.data?.[0]));
  return null;
}

/** Add credit to an existing Contact. Returns the new balance. */
async function accrueCredit(
  contactId: string,
  currentBalance: number,
  creditAmount: number,
  token: string,
): Promise<number> {
  const newBalance = Math.round((currentBalance + creditAmount) * 100) / 100;

  const res = await fetch(`https://www.zohoapis.com/crm/v2/Contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [{
        id: contactId,
        [CREDIT_FIELD]: newBalance,
      }],
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`[buyer-credit] Zoho credit update failed (${res.status}):`, text.slice(0, 300));
    return currentBalance; // return unchanged on failure
  }

  console.log(`[buyer-credit] Updated credit for contact ${contactId}: $${currentBalance} → $${newBalance} (+$${creditAmount.toFixed(2)})`);
  return newBalance;
}

// ─── GET: Look up buyer credit balance ───────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const email = url.searchParams.get('email')?.trim().toLowerCase();
  const accountId = url.searchParams.get('accountId');

  if (!email || !accountId) {
    return json({ok: false, error: 'email and accountId are required'}, {status: 400});
  }

  const env = context.env as any;
  if (!env.ZOHO_CLIENT_ID) {
    return json({ok: false, error: 'Zoho not configured'}, {status: 500});
  }

  try {
    const token = await getZohoToken(env);
    const contact = await findContactByEmail(email, accountId, token);

    if (!contact) {
      return json({ok: true, found: false, credit: 0});
    }

    return json({
      ok: true,
      found: true,
      contactId: contact.id,
      name: contact.name,
      credit: contact.credit,
    });
  } catch (err: any) {
    console.error('[buyer-credit] Loader error:', err.message);
    return json({ok: false, error: 'Failed to look up credit'}, {status: 500});
  }
}

// ─── POST: Accrue credit or create buyer contact ─────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as any;
  if (!env.ZOHO_CLIENT_ID) {
    return json({ok: false, error: 'Zoho not configured'}, {status: 500});
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'Invalid JSON'}, {status: 400});
  }

  const {action: actionType} = body;

  try {
    const token = await getZohoToken(env);

    // ── Action: Register buyer (create or find contact) ──
    if (actionType === 'register') {
      const {firstName, lastName, email, accountId} = body;
      if (!email || !accountId || !lastName) {
        return json({ok: false, error: 'firstName, lastName, email, and accountId required'}, {status: 400});
      }

      // Check if contact already exists
      let contact = await findContactByEmail(email.trim().toLowerCase(), accountId, token);
      if (contact) {
        return json({ok: true, action: 'found', contactId: contact.id, name: contact.name, credit: contact.credit});
      }

      // Create new contact
      contact = await createContact({
        firstName: firstName || '',
        lastName,
        email: email.trim().toLowerCase(),
        accountId,
      }, token);

      if (!contact) {
        return json({ok: false, error: 'Failed to create contact in Zoho'}, {status: 500});
      }

      return json({ok: true, action: 'created', contactId: contact.id, name: contact.name, credit: contact.credit});
    }

    // ── Action: Accrue credit from a menu order ──
    if (actionType === 'accrue') {
      const {contactId, orderTotal} = body;
      if (!contactId || typeof orderTotal !== 'number' || orderTotal <= 0) {
        return json({ok: false, error: 'contactId and orderTotal (positive number) required'}, {status: 400});
      }

      // Calculate credit: 0.5% of order total
      const creditAmount = Math.round(orderTotal * CREDIT_RATE * 100) / 100;
      if (creditAmount < 0.01) {
        return json({ok: true, action: 'skipped', reason: 'Credit amount too small', creditEarned: 0});
      }

      // Get current balance
      const contactRes = await fetch(`https://www.zohoapis.com/crm/v2/Contacts/${contactId}`, {
        headers: {Authorization: `Zoho-oauthtoken ${token}`},
      });

      if (!contactRes.ok) {
        return json({ok: false, error: 'Could not fetch contact'}, {status: 500});
      }

      const contactData = await contactRes.json();
      const currentBalance = parseFloat(contactData.data?.[0]?.[CREDIT_FIELD]) || 0;

      // Accrue
      const newBalance = await accrueCredit(contactId, currentBalance, creditAmount, token);

      return json({
        ok: true,
        action: 'accrued',
        creditEarned: creditAmount,
        previousBalance: currentBalance,
        newBalance,
      });
    }

    return json({ok: false, error: `Unknown action: ${actionType}`}, {status: 400});
  } catch (err: any) {
    console.error('[buyer-credit] Action error:', err.message);
    return json({ok: false, error: 'Internal error'}, {status: 500});
  }
}
