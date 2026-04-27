import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM Account Search — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/accounts?q=garfield
// Returns matching NJ dispensary accounts from Zoho CRM.
// Keeps Zoho OAuth credentials server-side (never exposed to browser).
// ─────────────────────────────────────────────────────────────────────────────

/** Account shape returned to the client. Pop-up custom fields are included when present. */
type AccountResult = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  street: string | null;
  phone: string | null;
  // Pop-up coordination custom fields (Highsman-specific on Accounts)
  popUpEmail: string | null;
  popUpLink: string | null;
  lastVisitDate: string | null;
  // Staffing — used by /vibes/visit/new to set the live-training goal per store.
  // Custom field on Accounts ("Account Information → Number of Budtenders").
  numberOfBudtenders: number | null;
};

/** Parse a Zoho custom number field that may be sent as string or number. */
function readNumber(acct: any, ...candidates: string[]): number | null {
  for (const key of candidates) {
    const raw = acct[key];
    if (raw == null || raw === '') continue;
    const n = typeof raw === 'number' ? raw : Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Read a custom field from a Zoho record tolerating multiple API-name conventions. */
function readCustom(acct: any, ...candidates: string[]): string | null {
  for (const key of candidates) {
    if (acct[key] !== undefined && acct[key] !== null && acct[key] !== '') return acct[key];
  }
  return null;
}

/** Search Zoho CRM Accounts by name. When scope='all', returns all states; otherwise NJ only. */
async function searchAccounts(
  query: string,
  accessToken: string,
  scope: 'nj' | 'all' = 'nj',
): Promise<AccountResult[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
  // Zoho CRM's criteria API does NOT support `contains` on Account_Name — only
  // `equals` and `starts_with`. For the 'all' scope we use `word=X`, which does
  // a broad text search across all fields (but caps at the top 50 global hits
  // which miss NJ matches when non-NJ stores share the name). For NJ scope we
  // use a criteria search that combines state + name prefix, so we get ALL NJ
  // matches regardless of word-search ranking. We also OR in Billing_State so
  // records missing the Account_State picklist (common after migrations) are
  // not dropped.
  if (scope === 'nj') {
    const q = query.replace(/[()\\,]/g, '').trim();
    // `starts_with` matches the first word of the Account_Name — covers the
    // 90% case ("rise", "ayr", "garden", "ascend", "curaleaf", etc.). If the
    // user types a mid-word fragment we'll miss it, but that's rare in the
    // field and better than silently dropping known NJ stores.
    //
    // Zoho's criteria parser is picky about arity — we stick to a clean
    // 2-arity OR on the state picklist + free-text Billing_State, which
    // covers both migrated and fresh records. Shipping_State alone rarely
    // holds a value Billing_State doesn't also have.
    const criteria =
      `((Account_State:equals:NJ)or(Billing_State:equals:NJ))and(Account_Name:starts_with:${q})`;
    url.searchParams.set('criteria', criteria);
  } else {
    url.searchParams.set('word', query);
  }
  // Custom field API names were confirmed 2026-04-17 against a live Account:
  // - Email_to_book_pop_ups (lowercase)
  // - Link_for_Pop_Ups
  // - Visit_Date (the "Data Collection Last Visit Date" UI label)
  url.searchParams.set(
    'fields',
    [
      'Account_Name',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Shipping_State',
      'Account_State',
      'Phone',
      'Email_to_book_pop_ups',
      'Link_for_Pop_Ups',
      'Visit_Date',
      'Number_of_Budtenders',
    ].join(','),
  );
  url.searchParams.set('per_page', '50');

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
  const allAccounts: AccountResult[] = (data.data || []).map((acct: any): AccountResult => {
    // Reconcile across the 3 state fields — Billing_State is the preferred
    // display value, but many records have it empty while Account_State (the
    // 2-letter picklist) or Shipping_State is filled. Fall through until we
    // find a non-empty value so the client always gets a state string.
    const state =
      acct.Billing_State ||
      acct.Account_State ||
      acct.Shipping_State ||
      null;
    return {
      id: acct.id,
      name: acct.Account_Name,
      city: acct.Billing_City || null,
      state,
      street: acct.Billing_Street || null,
      phone: acct.Phone || null,
      popUpEmail: readCustom(acct, 'Email_to_book_pop_ups', 'Email_for_Pop_Ups'),
      popUpLink: readCustom(acct, 'Link_for_Pop_Ups', 'Link_For_Pop_Ups'),
      lastVisitDate: readCustom(acct, 'Visit_Date', 'Data_Collection_Last_Visit_Date'),
      numberOfBudtenders: readNumber(acct, 'Number_of_Budtenders', 'No_of_Budtenders'),
    };
  });

  // When scope=nj the criteria query already filtered to NJ at Zoho — no
  // post-filter needed. The `word` path (scope=all) also returns the full set.
  return allAccounts.slice(0, 15);
}

/** Fetch a single Zoho Account by id. Returns the same AccountResult shape the
 *  search endpoint returns so clients have a consistent account contract. */
async function fetchAccountById(
  accountId: string,
  accessToken: string,
): Promise<AccountResult | null> {
  const url = new URL(`https://www.zohoapis.com/crm/v7/Accounts/${accountId}`);
  url.searchParams.set(
    'fields',
    [
      'Account_Name',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      'Phone',
      'Email_to_book_pop_ups',
      'Link_for_Pop_Ups',
      'Visit_Date',
      'Number_of_Budtenders',
    ].join(','),
  );
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204 || res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho account fetch failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const acct = (data.data || [])[0];
  if (!acct) return null;
  return {
    id: acct.id,
    name: acct.Account_Name,
    city: acct.Billing_City || null,
    state: acct.Billing_State || null,
    street: acct.Billing_Street || null,
    phone: acct.Phone || null,
    popUpEmail: readCustom(acct, 'Email_to_book_pop_ups', 'Email_for_Pop_Ups'),
    popUpLink: readCustom(acct, 'Link_for_Pop_Ups', 'Link_For_Pop_Ups'),
    lastVisitDate: readCustom(acct, 'Visit_Date', 'Data_Collection_Last_Visit_Date'),
    numberOfBudtenders: readNumber(acct, 'Number_of_Budtenders', 'No_of_Budtenders'),
  };
}

/** Look up a single Contact by email. Used to resolve `Email for Pop Ups` → full contact record. */
async function findContactByEmail(
  email: string,
  accessToken: string,
): Promise<{id: string; name: string; email: string; phone: string | null; title: string | null} | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('criteria', `(Email:equals:${email})`);
  url.searchParams.set('fields', 'First_Name,Last_Name,Email,Phone,Title,Mobile');
  url.searchParams.set('per_page', '1');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });

  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho contact search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const c = (data.data || [])[0];
  if (!c) return null;
  const name = [c.First_Name, c.Last_Name].filter(Boolean).join(' ').trim();
  return {
    id: c.id,
    name: name || c.Email,
    email: c.Email,
    phone: c.Phone || c.Mobile || null,
    title: c.Title || null,
  };
}

/** Create a new Account in Zoho CRM and attach a Contact. */
async function createAccountWithContact(
  data: {
    dispensaryName: string;
    contactName: string;
    jobRole: string;
    phone: string;
    email: string;
    street: string;
    city: string;
    state: string;
    zip: string;
  },
  accessToken: string,
): Promise<{id: string; name: string; city: string | null; state: string | null; phone: string | null}> {
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
          Account_State: data.state || 'NJ',
          Phone: data.phone || null,
          Billing_Street: data.street || null,
          Billing_City: data.city || null,
          Billing_State: data.state || 'NJ',
          Billing_Code: data.zip || null,
          Billing_Country: 'United States',
          Shipping_Street: data.street || null,
          Shipping_City: data.city || null,
          Shipping_State: data.state || 'NJ',
          Shipping_Code: data.zip || null,
          Shipping_Country: 'United States',
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
    city: data.city || null,
    state: data.state || null,
    phone: data.phone || null,
  };
}

/** Add tags to an Account record in Zoho CRM. Non-fatal if it fails. */
async function tagAccount(
  accountId: string,
  tags: string[],
  accessToken: string,
): Promise<void> {
  try {
    await fetch(`https://www.zohoapis.com/crm/v7/Accounts/${accountId}/actions/add_tags`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        tags: tags.map((t) => ({name: t})),
      }),
    });
  } catch (err) {
    console.error('[api/accounts] Tag failed (non-fatal):', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Loader (GET /api/accounts?q=...)
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const contactEmail = (url.searchParams.get('contactEmail') || '').trim();
  const accountId = (url.searchParams.get('accountId') || '').trim();
  const scope = url.searchParams.get('scope') === 'all' ? 'all' as const : 'nj' as const;

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  // Single-account fetch by id — used by /vibes/visit/new when a rep arrives
  // with a preset accountId (from the Store Profile deep-link) so we can pull
  // the Number of Budtenders custom field to set the training goal.
  if (accountId) {
    if (!clientId || !clientSecret || !refreshToken) {
      return json({account: null, error: 'CRM not configured'}, {
        headers: {'Cache-Control': 'no-store'},
      });
    }
    try {
      const accessToken = await getAccessToken({
        ZOHO_CLIENT_ID: clientId,
        ZOHO_CLIENT_SECRET: clientSecret,
        ZOHO_REFRESH_TOKEN: refreshToken,
      });
      const account = await fetchAccountById(accountId, accessToken);
      return json({account}, {
        headers: {'Cache-Control': 'public, max-age=300'},
      });
    } catch (err: any) {
      console.error('[api/accounts] Account fetch error:', err.message);
      return json({account: null, error: 'Account lookup unavailable'}, {
        status: 200,
        headers: {'Cache-Control': 'no-store'},
      });
    }
  }

  // Dedicated contact-by-email lookup (for resolving `Email for Pop Ups` → full Contact)
  if (contactEmail) {
    if (!clientId || !clientSecret || !refreshToken) {
      return json({contact: null, error: 'CRM not configured'}, {
        headers: {'Cache-Control': 'no-store'},
      });
    }
    try {
      const accessToken = await getAccessToken({
        ZOHO_CLIENT_ID: clientId,
        ZOHO_CLIENT_SECRET: clientSecret,
        ZOHO_REFRESH_TOKEN: refreshToken,
      });
      const contact = await findContactByEmail(contactEmail, accessToken);
      return json({contact}, {
        headers: {'Cache-Control': 'public, max-age=300'},
      });
    } catch (err: any) {
      console.error('[api/accounts] Contact lookup error:', err.message);
      return json({contact: null, error: 'Contact lookup unavailable'}, {
        status: 200,
        headers: {'Cache-Control': 'no-store'},
      });
    }
  }

  // Require at least 2 characters for account search
  if (query.length < 2) {
    return json({accounts: []}, {
      headers: {'Cache-Control': 'no-store'},
    });
  }

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

    let accounts = await searchAccounts(query, accessToken, scope);

    // Fallback: if NJ-scoped prefix search returned nothing, do a global
    // word search and filter to NJ on our side. This catches:
    //   • Mid-name fragments — "bellmawr" finds "Curaleaf - Bellmawr"
    //   • Records missing Account_State / Billing_State but with the city
    //     in Billing_City (we treat any non-NJ-named city as still NJ if
    //     the global word search returns it AND state is blank — staff
    //     intent on /njpopups is to find an NJ store).
    //   • Names with leading articles like "The Apothecarium" where users
    //     type "apothecarium" without the prefix.
    if (scope === 'nj' && accounts.length === 0 && query.trim().length >= 2) {
      const allMatches = await searchAccounts(query, accessToken, 'all');
      accounts = allMatches.filter((a) => {
        const st = (a.state || '').trim().toUpperCase();
        // Accept exact NJ codes / full name, or blank state (we'll trust
        // the user's intent on this NJ-scoped page).
        return st === 'NJ' || st === 'NEW JERSEY' || st === '' || st === 'N.J.';
      });
    }

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
  const street = (formData.get('street') as string || '').trim();
  const city = (formData.get('city') as string || '').trim();
  const rawState = (formData.get('state') as string || 'NJ').trim();
  // Normalize state to 2-letter abbreviation (Google Places may return full name)
  const state = rawState.toLowerCase() === 'new jersey' ? 'NJ' : (rawState || 'NJ');
  const zip = (formData.get('zip') as string || '').trim();
  const tagsRaw = (formData.get('tags') as string || '').trim(); // comma-separated tags
  const tags = tagsRaw ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean) : [];

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
        city: city || null,
        state: state || null,
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
      {dispensaryName, contactName, jobRole, phone, email, street, city, state, zip},
      accessToken,
    );

    // Apply tags if provided (e.g. "Budtender Education Portal")
    if (tags.length > 0) {
      await tagAccount(account.id, tags, accessToken);
    }

    return json({ok: true, account});
  } catch (err: any) {
    console.error('[api/accounts] Create error:', err.message);
    return json({ok: false, error: 'Could not create account. Please try again or email njsales@highsman.com.'}, {status: 500});
  }
}
