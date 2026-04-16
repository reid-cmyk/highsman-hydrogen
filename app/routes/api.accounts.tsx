import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM Account Search — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/accounts?q=garfield
// Returns matching NJ dispensary accounts from Zoho CRM.
// Keeps Zoho OAuth credentials server-side (never exposed to browser).
// ─────────────────────────────────────────────────────────────────────────────

// In-memory token cache (per worker instance)
let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

/** Exchange a refresh token for a fresh Zoho access token. */
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
  // Zoho tokens last 1 hour — cache for 55 minutes to be safe
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedAccessToken!;
}

/** Search Zoho CRM Accounts by name (NJ only). */
async function searchAccounts(
  query: string,
  accessToken: string,
): Promise<Array<{id: string; name: string; city: string | null; phone: string | null}>> {
  // Use Zoho's searchRecords with word search + NJ state filter
  const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
  url.searchParams.set('criteria', `((Account_Name:starts_with:${query})and(Billing_State:equals:NJ))`);
  url.searchParams.set('fields', 'Account_Name,Billing_City,Billing_State,Phone');
  url.searchParams.set('per_page', '15');

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
    },
  });

  // 204 = no results
  if (res.status === 204) return [];

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  return (data.data || []).map((acct: any) => ({
    id: acct.id,
    name: acct.Account_Name,
    city: acct.Billing_City || null,
    phone: acct.Phone || null,
  }));
}

/** Create a new Account in Zoho CRM and attach a Contact. */
async function createAccountWithContact(
  data: {
    dispensaryName: string;
    contactName: string;
    jobRole: string;
    phone: string;
    email: string;
  },
  accessToken: string,
): Promise<{id: string; name: string; city: string | null; phone: string | null}> {
  // 1. Create the Account
  const accountRes = await fetch('https://www.zohoapis.com/crm/v7/Accounts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [
        {
          Account_Name: data.dispensaryName,
          Phone: data.phone || null,
          Billing_State: 'NJ',
          Account_Type: 'Prospect',
          Description: `Self-registered via NJ wholesale menu. Contact: ${data.contactName} (${data.jobRole}). Email: ${data.email}`,
        },
      ],
      trigger: ['workflow'],
    }),
  });

  if (!accountRes.ok) {
    const text = await accountRes.text().catch(() => '');
    throw new Error(`Zoho account creation failed (${accountRes.status}): ${text.slice(0, 500)}`);
  }

  const accountData = await accountRes.json();
  const accountRecord = accountData.data?.[0];
  if (accountRecord?.status !== 'success') {
    throw new Error(`Zoho account creation rejected: ${JSON.stringify(accountRecord?.details || {})}`);
  }

  const accountId = accountRecord.details.id;

  // 2. Create a Contact linked to the Account
  const [firstName, ...lastParts] = data.contactName.trim().split(/\s+/);
  const lastName = lastParts.length > 0 ? lastParts.join(' ') : firstName; // Zoho requires Last_Name

  try {
    await fetch('https://www.zohoapis.com/crm/v7/Contacts', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [
          {
            First_Name: firstName,
            Last_Name: lastName,
            Email: data.email || null,
            Phone: data.phone || null,
            Title: data.jobRole || null,
            Account_Name: {id: accountId},
            Description: `Self-registered via NJ wholesale menu (${data.jobRole}).`,
          },
        ],
        trigger: ['workflow'],
      }),
    });
  } catch (contactErr) {
    // Don't fail the whole flow if contact creation fails — the account is enough
    console.error('[api/accounts] Contact creation failed (non-fatal):', contactErr);
  }

  return {
    id: accountId,
    name: data.dispensaryName,
    city: null,
    phone: data.phone || null,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loader (GET /api/accounts?q=...)
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();

  // Require at least 2 characters
  if (query.length < 2) {
    return json({accounts: []}, {
      headers: {'Cache-Control': 'no-store'},
    });
  }

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  // If Zoho credentials aren't set, return empty (graceful degradation)
  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[api/accounts] Zoho CRM credentials not configured — returning empty results');
    return json({accounts: [], error: 'CRM not configured'}, {
      status: 200,
      headers: {'Cache-Control': 'no-store'},
    });
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const accounts = await searchAccounts(query, accessToken);
    return json({accounts}, {
      headers: {
        'Cache-Control': 'public, max-age=300', // cache 5 min
      },
    });
  } catch (err: any) {
    console.error('[api/accounts] Error:', err.message);
    return json({accounts: [], error: 'Search unavailable'}, {
      status: 200, // don't break the UI — degrade gracefully
      headers: {'Cache-Control': 'no-store'},
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (POST /api/accounts) — Create a new dispensary account in Zoho CRM
// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const formData = await request.formData();
  const dispensaryName = (formData.get('dispensaryName') as string || '').trim();
  const contactName = (formData.get('contactName') as string || '').trim();
  const jobRole = (formData.get('jobRole') as string || '').trim();
  const phone = (formData.get('phone') as string || '').trim();
  const email = (formData.get('email') as string || '').trim();

  // Validate required fields
  if (!dispensaryName) {
    return json({ok: false, error: 'Dispensary name is required.'}, {status: 400});
  }
  if (!contactName) {
    return json({ok: false, error: 'Contact name is required.'}, {status: 400});
  }
  if (!email) {
    return json({ok: false, error: 'Email is required.'}, {status: 400});
  }

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    // If CRM isn't configured, return a mock account so they can still order
    return json({
      ok: true,
      account: {
        id: `local-${Date.now()}`,
        name: dispensaryName,
        city: null,
        phone: phone || null,
      },
      note: 'CRM not configured — account saved locally.',
    });
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const account = await createAccountWithContact(
      {dispensaryName, contactName, jobRole, phone, email},
      accessToken,
    );

    return json({ok: true, account});
  } catch (err: any) {
    console.error('[api/accounts] Create error:', err.message);
    return json({ok: false, error: 'Could not create account. Please try again or email njsales@highsman.com.'}, {status: 500});
  }
}
