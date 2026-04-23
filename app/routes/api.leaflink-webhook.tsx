import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// LeafLink Webhook — Order Status Changes
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/leaflink-webhook
//   → Receives order created/updated events from LeafLink
//   → Auto-deducts buyer store credit when an order is Rejected (cancelled)
//   → Verifies webhook signature via HMAC SHA-256
// ─────────────────────────────────────────────────────────────────────────────

const CREDIT_RATE = 0.005; // 0.5% — must match api.buyer-credit.tsx
const CREDIT_FIELD = 'Store_Credit';

// ─── Signature Verification ─────────────────────────────────────────────────

async function verifySignature(
  body: string,
  signature: string | null,
  webhookKey: string,
): Promise<boolean> {
  if (!signature || !webhookKey) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(webhookKey),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign'],
  );

  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const computed = btoa(String.fromCharCode(...new Uint8Array(sig)));
  return computed === signature;
}

// ─── Find Zoho contacts linked to a dispensary account ──────────────────────

async function findContactsWithCredit(
  accountName: string,
  token: string,
): Promise<Array<{id: string; name: string; email: string; credit: number}>> {
  // Search Zoho Accounts by name to get the Account ID
  const accountSearchUrl = `https://www.zohoapis.com/crm/v2/Accounts/search?criteria=(Account_Name:equals:${encodeURIComponent(accountName)})`;
  const accountRes = await fetch(accountSearchUrl, {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });

  if (!accountRes.ok || accountRes.status === 204) {
    console.log(`[leaflink-webhook] No Zoho account found for "${accountName}"`);
    return [];
  }

  const accountData = await accountRes.json();
  if (!accountData.data?.length) return [];
  const accountId = accountData.data[0].id;

  // Search Contacts linked to this Account that have credit > 0
  const contactSearchUrl = `https://www.zohoapis.com/crm/v2/Contacts/search?criteria=((Account_Name:equals:${accountId})and(${CREDIT_FIELD}:greater_than:0))`;
  const contactRes = await fetch(contactSearchUrl, {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });

  if (!contactRes.ok || contactRes.status === 204) return [];

  const contactData = await contactRes.json();
  if (!contactData.data?.length) return [];

  return contactData.data.map((c: any) => ({
    id: c.id,
    name: `${c.First_Name || ''} ${c.Last_Name || ''}`.trim(),
    email: c.Email || '',
    credit: parseFloat(c[CREDIT_FIELD]) || 0,
  }));
}

// ─── Deduct credit from a contact ───────────────────────────────────────────

async function deductCredit(
  contactId: string,
  currentBalance: number,
  deductAmount: number,
  token: string,
): Promise<number> {
  const actualDeduct = Math.min(deductAmount, currentBalance);
  const newBalance = Math.round((currentBalance - actualDeduct) * 100) / 100;

  const res = await fetch(`https://www.zohoapis.com/crm/v2/Contacts/${contactId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [{id: contactId, [CREDIT_FIELD]: newBalance}],
    }),
  });

  if (!res.ok) {
    console.error(`[leaflink-webhook] Failed to deduct credit from ${contactId}`);
    return currentBalance;
  }

  console.log(`[leaflink-webhook] Deducted $${actualDeduct.toFixed(2)} from contact ${contactId}: $${currentBalance} → $${newBalance}`);
  return newBalance;
}

// ─── Webhook Handler ────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({error: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as any;
  const rawBody = await request.text();

  // Verify webhook signature if we have a key configured
  const webhookKey = env.LEAFLINK_WEBHOOK_KEY;
  if (webhookKey) {
    const signature = request.headers.get('LL-Signature');
    const valid = await verifySignature(rawBody, signature, webhookKey);
    if (!valid) {
      console.error('[leaflink-webhook] Invalid signature — rejecting');
      return json({error: 'Invalid signature'}, {status: 401});
    }
  }

  let payload: any;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return json({error: 'Invalid JSON'}, {status: 400});
  }

  // LeafLink sends the order object directly
  const order = payload;
  const status = order.status;
  const orderNumber = order.number || order.short_id || 'unknown';
  const externalId = order.external_id_seller || '';

  console.log(`[leaflink-webhook] Order #${orderNumber} status: ${status} (external: ${externalId})`);

  // Only process rejected (cancelled) orders for credit clawback
  if (status !== 'Rejected') {
    return json({ok: true, action: 'ignored', reason: `Status "${status}" does not require credit adjustment`});
  }

  // Only claw back orders that came from our menu (external_id starts with NJMENU-)
  if (!externalId.startsWith('NJMENU-')) {
    console.log(`[leaflink-webhook] Order #${orderNumber} not from NJ menu — skipping credit clawback`);
    return json({ok: true, action: 'ignored', reason: 'Order not from NJ menu'});
  }

  // Calculate what credit was earned on this order
  // Sum up line item totals from the order
  let orderTotal = 0;
  if (order.line_items && Array.isArray(order.line_items)) {
    for (const li of order.line_items) {
      // LeafLink line items have ordered_unit_price and quantity
      const price = parseFloat(li.ordered_unit_price?.amount || li.ordered_unit_price || 0);
      const qty = parseFloat(li.quantity || 0);
      // ordered_unit_price is per case, quantity is in units, but the total on the line
      // is what matters — use sale_total if available
      if (li.sale_total) {
        orderTotal += parseFloat(li.sale_total);
      } else if (li.ordered_unit_price) {
        // Fallback: price × cases (quantity / unit_multiplier is cases)
        orderTotal += price * Math.ceil(qty / (li.unit_multiplier || 1));
      }
    }
  }

  // Fallback: use order.total if line item math didn't work
  if (orderTotal <= 0 && order.total) {
    orderTotal = parseFloat(order.total);
  }

  if (orderTotal <= 0) {
    console.log(`[leaflink-webhook] Order #${orderNumber} has no calculable total — skipping`);
    return json({ok: true, action: 'skipped', reason: 'Could not determine order total'});
  }

  const creditToDeduct = Math.round(orderTotal * CREDIT_RATE * 100) / 100;
  if (creditToDeduct < 0.01) {
    return json({ok: true, action: 'skipped', reason: 'Credit amount too small to deduct'});
  }

  // Find the buyer contact(s) to deduct from
  // Use the customer name from the order to find the Zoho account
  const customerName = order.customer?.name || order.buyer?.name || '';
  if (!customerName) {
    console.error(`[leaflink-webhook] Order #${orderNumber} has no customer name — cannot find buyer`);
    return json({ok: false, error: 'No customer name in order'}, {status: 422});
  }

  if (!env.ZOHO_CLIENT_ID) {
    console.error('[leaflink-webhook] Zoho not configured');
    return json({ok: false, error: 'Zoho not configured'}, {status: 500});
  }

  try {
    const token = await getZohoToken(env);
    const contacts = await findContactsWithCredit(customerName, token);

    if (contacts.length === 0) {
      console.log(`[leaflink-webhook] No contacts with credit found for "${customerName}" — nothing to deduct`);
      return json({ok: true, action: 'skipped', reason: 'No contacts with credit found for this customer'});
    }

    // Deduct from all contacts with credit on this account
    // (typically there's just one buyer per dispensary)
    const results = [];
    for (const contact of contacts) {
      const deductAmount = Math.min(creditToDeduct, contact.credit);
      if (deductAmount > 0) {
        const newBalance = await deductCredit(contact.id, contact.credit, deductAmount, token);
        results.push({
          contactId: contact.id,
          name: contact.name,
          deducted: deductAmount,
          newBalance,
        });
      }
    }

    console.log(`[leaflink-webhook] Order #${orderNumber} rejected — deducted $${creditToDeduct.toFixed(2)} from ${results.length} contact(s)`);

    return json({
      ok: true,
      action: 'deducted',
      orderNumber,
      orderTotal,
      creditDeducted: creditToDeduct,
      contacts: results,
    });
  } catch (err: any) {
    console.error(`[leaflink-webhook] Error processing order #${orderNumber}:`, err.message);
    return json({ok: false, error: 'Internal error'}, {status: 500});
  }
}
