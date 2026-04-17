import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM — Pop-Up POC Write-Back (Staff Override)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/popups-poc
//
// When staff edits pop-up contact/link info on /njpopups, this endpoint pushes
// the new values back to the Zoho Account (override semantics — whatever staff
// enters overwrites what's in Zoho) and creates/updates the linked Contact.
//
// Body (form data):
//   accountId         — Zoho Account ID (required)
//   popUpEmail        — Email_to_book_pop_ups   (optional; empty string clears)
//   popUpLink         — Link_for_Pop_Ups        (optional; empty string clears)
//   contactName       — full name (split on whitespace into First/Last_Name)
//   contactRole       — Title on the Contact
//   contactPhone      — Phone
//   stampVisit        — "true" to stamp Visit_Date with today (default: true)
//
// Rules:
//   • OVERRIDE semantics: blank strings clear the field; undefined leaves it alone.
//   • Always stamps Visit_Date (Data Collection Last Visit Date) with today unless
//     stampVisit === "false".
//   • If contactName + popUpEmail are both present, creates a Contact on the
//     Account (or updates the matching-email Contact if one already exists).
//   • Fires Zoho workflows with trigger: ['workflow'].
// ─────────────────────────────────────────────────────────────────────────────

// In-memory token cache (per worker instance)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(env: {
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

/** PATCH the Account with the pop-up custom fields. */
async function patchAccountPopUpFields(
  accountId: string,
  fields: Record<string, string | null>,
  accessToken: string,
): Promise<void> {
  const res = await fetch(`https://www.zohoapis.com/crm/v7/Accounts/${accountId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [fields], trigger: ['workflow']}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho account PATCH failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const data = await res.json();
  const record = data.data?.[0];
  if (record?.status !== 'success') {
    throw new Error(`Zoho account PATCH rejected: ${JSON.stringify(record?.details || {})}`);
  }
}

/** Look up a Contact by email. Returns the record id if found. */
async function findContactIdByEmail(email: string, accessToken: string): Promise<string | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('criteria', `(Email:equals:${email})`);
  url.searchParams.set('fields', 'id');
  url.searchParams.set('per_page', '1');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });

  if (res.status === 204) return null;
  if (!res.ok) return null;
  const data = await res.json();
  return (data.data || [])[0]?.id || null;
}

async function upsertContact(
  accountId: string,
  data: {
    contactName: string;
    contactRole: string;
    contactEmail: string;
    contactPhone: string;
  },
  accessToken: string,
): Promise<string | null> {
  const {contactName, contactRole, contactEmail, contactPhone} = data;
  if (!contactEmail) return null;

  const [firstName, ...lastParts] = contactName.trim().split(/\s+/);
  const lastName = lastParts.length > 0 ? lastParts.join(' ') : firstName || contactEmail;

  // Check for existing Contact with this email — update rather than duplicate.
  const existingId = await findContactIdByEmail(contactEmail, accessToken);

  const payload = {
    First_Name: firstName || null,
    Last_Name: lastName,
    Email: contactEmail,
    Phone: contactPhone || null,
    Title: contactRole || null,
    Account_Name: {id: accountId},
    Description: 'Pop-up POC — set via /njpopups staff override.',
  };

  if (existingId) {
    const res = await fetch(`https://www.zohoapis.com/crm/v7/Contacts/${existingId}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: [payload], trigger: ['workflow']}),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`[api/popups-poc] Contact PATCH failed: ${res.status} ${text.slice(0, 300)}`);
    }
    return existingId;
  }

  const res = await fetch('https://www.zohoapis.com/crm/v7/Contacts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [payload], trigger: ['workflow']}),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.warn(`[api/popups-poc] Contact POST failed: ${res.status} ${text.slice(0, 300)}`);
    return null;
  }
  const j = await res.json();
  return j.data?.[0]?.details?.id || null;
}

// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const formData = await request.formData();
  const accountId = (formData.get('accountId') as string || '').trim();
  if (!accountId) {
    return json({ok: false, error: 'accountId is required'}, {status: 400});
  }

  // These are intentionally read with `has()` so "" explicitly clears the field
  // and "undefined" leaves it alone.
  const hasEmail = formData.has('popUpEmail');
  const hasLink = formData.has('popUpLink');
  const popUpEmailRaw = hasEmail ? ((formData.get('popUpEmail') as string) || '').trim() : undefined;
  const popUpLinkRaw = hasLink ? ((formData.get('popUpLink') as string) || '').trim() : undefined;

  const contactName = ((formData.get('contactName') as string) || '').trim();
  const contactRole = ((formData.get('contactRole') as string) || '').trim();
  const contactPhone = ((formData.get('contactPhone') as string) || '').trim();
  const stampVisitRaw = ((formData.get('stampVisit') as string) || 'true').trim().toLowerCase();
  const stampVisit = stampVisitRaw !== 'false';

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    // Graceful degradation — if Zoho isn't wired up, pretend it worked so the
    // UI stays functional. The booking itself is still captured locally.
    console.warn('[api/popups-poc] Zoho credentials not configured — no-op.');
    return json({
      ok: true,
      note: 'CRM not configured — override not persisted.',
    });
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    // Build the Account PATCH payload. Only include fields the client explicitly
    // sent — that preserves any untouched values.
    const accountFields: Record<string, string | null> = {};
    if (hasEmail) accountFields.Email_to_book_pop_ups = popUpEmailRaw || null;
    if (hasLink) accountFields.Link_for_Pop_Ups = popUpLinkRaw || null;
    if (stampVisit) {
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      accountFields.Visit_Date = today;
    }

    if (Object.keys(accountFields).length > 0) {
      await patchAccountPopUpFields(accountId, accountFields, accessToken);
    }

    // Upsert the linked Contact when enough data is present.
    let contactId: string | null = null;
    const contactEmail = popUpEmailRaw || '';
    if (contactEmail && contactName) {
      contactId = await upsertContact(
        accountId,
        {contactName, contactRole, contactEmail, contactPhone},
        accessToken,
      );
    }

    return json({
      ok: true,
      accountId,
      contactId,
      updated: {
        popUpEmail: hasEmail ? popUpEmailRaw || null : undefined,
        popUpLink: hasLink ? popUpLinkRaw || null : undefined,
        lastVisitDate: stampVisit ? new Date().toISOString().slice(0, 10) : undefined,
      },
    });
  } catch (err: any) {
    console.error('[api/popups-poc] Error:', err.message);
    return json(
      {ok: false, error: 'Could not update Zoho pop-up POC. Try again or email popups@highsman.com.'},
      {status: 500},
    );
  }
}
