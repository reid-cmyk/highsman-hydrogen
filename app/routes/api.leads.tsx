import type {LoaderFunctionArgs, ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM Leads Search + Create — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET  /api/leads?q=garfield     → fuzzy-search NJ Leads by Company
// POST /api/leads                → create a new Lead (inline from /vibes/lead-visit)
//
// Parallels /api/accounts but targets the Zoho LEADS module. Used by the
// Sampling/Lead visit flow so a brand rep can drop in on prospect stores that
// aren't in Accounts yet.
// ─────────────────────────────────────────────────────────────────────────────

export type LeadResult = {
  id: string;
  company: string;
  city: string | null;
  state: string | null;
  street: string | null;
  phone: string | null;
  contactName: string | null;
  title: string | null;
  leadStatus: string | null;
};

function buildLeadName(lead: any): string | null {
  const parts = [lead.First_Name, lead.Last_Name].filter(Boolean);
  return parts.length ? parts.join(' ') : null;
}

async function searchLeads(
  query: string,
  accessToken: string,
  scope: 'nj' | 'all' = 'nj',
): Promise<LeadResult[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Leads/search');
  // Zoho supports `word=` broad text search across all indexed fields.
  url.searchParams.set('word', query);
  url.searchParams.set(
    'fields',
    [
      'Company',
      'First_Name',
      'Last_Name',
      'Title',
      'Street',
      'City',
      'State',
      'Phone',
      'Lead_Status',
    ].join(','),
  );
  url.searchParams.set('per_page', '50');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho lead search failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const all: LeadResult[] = (data.data || []).map((lead: any): LeadResult => ({
    id: lead.id,
    company: lead.Company || 'Untitled Lead',
    city: lead.City || null,
    state: lead.State || null,
    street: lead.Street || null,
    phone: lead.Phone || null,
    contactName: buildLeadName(lead),
    title: lead.Title || null,
    leadStatus: lead.Lead_Status || null,
  }));

  if (scope === 'nj') {
    return all
      .filter((l) => l.state === 'NJ' || l.state === 'New Jersey')
      .slice(0, 15);
  }
  return all.slice(0, 15);
}

/** Create a Lead in Zoho CRM. Returns the new lead id. */
async function createLead(
  data: {
    company: string;
    firstName: string;
    lastName: string;
    title: string | null;
    phone: string | null;
    email: string | null;
    street: string | null;
    city: string | null;
    state: string;
    zip: string | null;
    leadSource?: string;
    leadStatus?: string;
    description?: string | null;
  },
  accessToken: string,
): Promise<{id: string; company: string; city: string | null; state: string; phone: string | null}> {
  const payload: Record<string, any> = {
    Company: data.company,
    First_Name: data.firstName || data.company,
    Last_Name: data.lastName || data.company,
    Title: data.title || null,
    Phone: data.phone || null,
    Email: data.email || null,
    Street: data.street || null,
    City: data.city || null,
    State: data.state,
    Zip_Code: data.zip || null,
    Lead_Source: data.leadSource || 'Vibes Team Sampling',
    Lead_Status: data.leadStatus || 'Sampling',
    Description: data.description || null,
  };

  const res = await fetch('https://www.zohoapis.com/crm/v7/Leads', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [payload], trigger: ['workflow']}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho lead create failed (${res.status}): ${text.slice(0, 500)}`);
  }

  const responseData = await res.json();
  const record = responseData.data?.[0];
  if (record?.status !== 'success') {
    throw new Error(`Zoho lead create rejected: ${JSON.stringify(record?.details || {})}`);
  }

  return {
    id: record.details.id,
    company: data.company,
    city: data.city,
    state: data.state,
    phone: data.phone,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Loader (GET /api/leads?q=...)
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const scope = url.searchParams.get('scope') === 'all' ? ('all' as const) : ('nj' as const);

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (query.length < 2) {
    return json({leads: []}, {headers: {'Cache-Control': 'no-store'}});
  }
  if (!clientId || !clientSecret || !refreshToken) {
    return json(
      {leads: [], error: 'CRM not configured'},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });
    const leads = await searchLeads(query, accessToken, scope);
    return json({leads}, {headers: {'Cache-Control': 'public, max-age=300'}});
  } catch (err: any) {
    console.error('[api/leads] Search error:', err.message);
    return json(
      {leads: [], error: 'Search unavailable'},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Action (POST /api/leads) — Create a new Lead in Zoho CRM
// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const form = await request.formData();
  const company = String(form.get('company') || '').trim();
  const contactFull = String(form.get('contactName') || '').trim();
  const title = String(form.get('title') || '').trim() || null;
  const phone = String(form.get('phone') || '').trim() || null;
  const email = String(form.get('email') || '').trim() || null;
  const street = String(form.get('street') || '').trim() || null;
  const city = String(form.get('city') || '').trim() || null;
  const rawState = String(form.get('state') || 'NJ').trim();
  const state = rawState.toLowerCase() === 'new jersey' ? 'NJ' : rawState || 'NJ';
  const zip = String(form.get('zip') || '').trim() || null;
  const description = String(form.get('description') || '').trim() || null;

  if (!company) {
    return json({ok: false, error: 'Company (dispensary) name is required.'}, {status: 400});
  }

  // Split contact name into First / Last; fall back to company for Last_Name
  // because Zoho Leads requires Last_Name.
  let firstName = '';
  let lastName = '';
  if (contactFull) {
    const tokens = contactFull.split(/\s+/);
    firstName = tokens[0] || '';
    lastName = tokens.slice(1).join(' ') || tokens[0] || '';
  }

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return json({
      ok: true,
      lead: {
        id: `local-${Date.now()}`,
        company,
        city,
        state,
        phone,
      },
      note: 'CRM not configured — lead saved locally only.',
    });
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });
    const lead = await createLead(
      {
        company,
        firstName,
        lastName,
        title,
        phone,
        email,
        street,
        city,
        state,
        zip,
        description,
      },
      accessToken,
    );
    return json({ok: true, lead});
  } catch (err: any) {
    console.error('[api/leads] Create error:', err.message);
    return json(
      {ok: false, error: 'Could not create lead. Please try again.'},
      {status: 500},
    );
  }
}
