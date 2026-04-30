import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/sales-floor-add-contact
// ─────────────────────────────────────────────────────────────────────────────
// POST { accountId, name, email?, phone?, role? } → { ok, contact }
//
// Reid 2026-04-29: Sky needs to be able to add a buyer contact to a New
// Customer dispensary inline on /sales-floor when Zoho doesn't have one yet.
// This route creates a Zoho Contact, links it to the Account, and writes
// Job_Role from the role picklist value (memory: feedback_zoho_contact_job_role.md
// — buyer-role lives in Job_Role, never Title).
//
// Auth: any logged-in rep. New contact carries the rep's id in Description so
// audit trails show who added it ("Added via /sales-floor by sky on …").
//
// Failure mode: full-fat error string passed back to the client so the toast
// can show "Zoho INVALID_DATA: phone format invalid" rather than a generic
// "save failed". No partial writes — Zoho's create is atomic.
// ─────────────────────────────────────────────────────────────────────────────

type CreateContactBody = {
  accountId?: string;
  name?: string;
  email?: string;
  phone?: string;
  role?: string;
};

// Map Sky-facing role labels → Zoho Job_Role picklist actual_value.
// Memory: reference_zoho_role_title_picklist.md — picklist writes MUST send
// the short actual_value (e.g. 'Buyer / Manager'), not the long display label
// or Zoho 502s with PICKLIST_VALUE_NOT_CONFIGURED.
const ROLE_PICKLIST: Record<string, string> = {
  buyer: 'Buyer / Manager',
  manager: 'Buyer / Manager',
  owner: 'Owner / Founder',
  purchasing: 'Buyer / Manager',
  budtender: 'Retail & Customer Operations Staff (Budtender, Customer Service, Store Lead/Associate)',
  staff: 'Retail & Customer Operations Staff (Budtender, Customer Service, Store Lead/Associate)',
  other: '',
};

function normalizeRole(raw: string | null | undefined): string {
  const k = String(raw || '').toLowerCase().trim();
  if (!k) return '';
  if (ROLE_PICKLIST[k] !== undefined) return ROLE_PICKLIST[k];
  // If the caller passed the full label already (e.g. 'Buyer / Manager'),
  // accept it as-is — Zoho will reject anything that doesn't match the
  // picklist and we'll surface the error.
  return raw || '';
}

function splitName(full: string): {first: string; last: string} {
  const t = String(full || '').trim();
  if (!t) return {first: '', last: ''};
  const parts = t.split(/\s+/);
  if (parts.length === 1) return {first: '', last: parts[0]}; // Zoho requires Last_Name
  return {first: parts[0], last: parts.slice(1).join(' ')};
}

export async function action({request, context}: ActionFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  const env = context.env as Record<string, string | undefined>;
  let body: CreateContactBody;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON body'}, {status: 400});
  }
  const accountId = String(body.accountId || '').trim();
  const name = String(body.name || '').trim();
  const email = String(body.email || '').trim();
  const phone = String(body.phone || '').trim();
  const role = normalizeRole(body.role);

  if (!accountId) return json({ok: false, error: 'accountId required'}, {status: 400});
  if (!name) return json({ok: false, error: 'name required'}, {status: 400});
  if (!email && !phone) {
    return json({ok: false, error: 'email or phone required'}, {status: 400});
  }

  let token: string;
  try {
    token = await getZohoToken(env);
  } catch (err: any) {
    return json({ok: false, error: err?.message || 'Zoho auth failed'}, {status: 503});
  }

  const {first, last} = splitName(name);
  // Build the Zoho payload. Phone goes on both Phone and Mobile so the
  // Sales Floor card's `cardPhone = buyer.Mobile || buyer.Phone || a.Phone`
  // chain finds it without us needing to know which one Sky filled in.
  const record: Record<string, unknown> = {
    First_Name: first || '',
    Last_Name: last || name, // Last_Name is required by Zoho — fall back to whole name
    Account_Name: {id: accountId},
    Description: `Added via /sales-floor by ${rep.id} on ${new Date().toISOString().slice(0, 10)}`,
  };
  if (email) record.Email = email;
  if (phone) {
    record.Phone = phone;
    record.Mobile = phone;
  }
  if (role) record.Job_Role = role;

  const res = await fetch('https://www.zohoapis.com/crm/v7/Contacts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [record]}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return json(
      {ok: false, error: `Zoho Contacts (${res.status}): ${text.slice(0, 300)}`},
      {status: 502},
    );
  }
  const data = await res.json();
  const row = (data?.data || [])[0];
  if (!row || row.code !== 'SUCCESS') {
    const reason = row?.message || row?.code || 'unknown';
    return json({ok: false, error: `Zoho Contacts: ${reason}`}, {status: 502});
  }

  return json({
    ok: true,
    contact: {
      id: row.details?.id || '',
      name,
      email,
      phone,
      role,
      accountId,
      _fullName: name,
      _jobRole: role,
      First_Name: first,
      Last_Name: last || name,
      Email: email,
      Phone: phone,
      Mobile: phone,
      Job_Role: role,
    },
    by: rep.id,
  });
}
