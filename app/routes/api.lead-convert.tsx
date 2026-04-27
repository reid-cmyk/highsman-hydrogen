import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {getRepFromRequest} from '~/lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-convert
// ─────────────────────────────────────────────────────────────────────────────
// POST { leadId, dealAmount?, dealStage?, dealName?, source?: 'manual'|'webhook' }
//   → { ok, accountId, contactId, dealId }
//
// Wraps Zoho v7 Leads/{id}/actions/convert. Always creates a Deal so the
// converted Lead lands on the New Customers tab the same way a first
// LeafLink order does (per Reid's spec, 2026-04-27).
//
// Two callers:
//   1. Manual: a rep clicks "Convert to Account" on a Lead card on either
//      /sales-floor or /new-business. Auth is the rep cookie.
//   2. Webhook fallback: api.leaflink-webhook detects an incoming order for
//      a company that has no Zoho Account but matches an open Lead by
//      Company name. It POSTs here with `source='webhook'` + the order
//      total as `dealAmount`. Auth is the same X-Internal-Key the rest of
//      the cron/webhook routes already use (env.INTERNAL_API_KEY) so we
//      don't need a fake rep cookie.
//
// Response carries the new Zoho IDs so the client can refresh its lists
// and the webhook can write the order under the new Account.
// ─────────────────────────────────────────────────────────────────────────────

const ZOHO_CRM_BASE = 'https://www.zohoapis.com/crm/v7';

type ConvertSource = 'manual' | 'webhook';

type ConvertBody = {
  leadId: string;
  // Optional Deal payload. If amount is omitted we still create a Deal so the
  // converted Lead lands on the New Customers funnel; default amount = 0,
  // default stage = 'Closed Won'. Reid's spec.
  dealAmount?: number;
  dealStage?: string;
  dealName?: string;
  source?: ConvertSource;
};

function todayIsoNJ(): string {
  // Closing_Date is a date-only field. NJ-localized today so a late-night
  // convert doesn't look like it closed yesterday.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${d}`;
}

async function fetchLeadCompany(
  leadId: string,
  token: string,
): Promise<{company: string; ownerId: string | null} | null> {
  const url = `${ZOHO_CRM_BASE}/Leads/${leadId}?fields=id,Company,Owner`;
  const res = await fetch(url, {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const row = (data?.data || [])[0];
  if (!row) return null;
  return {
    company: String(row.Company || '').trim(),
    ownerId: row?.Owner?.id || null,
  };
}

async function convertViaZoho(
  leadId: string,
  payload: {
    dealName: string;
    dealAmount: number;
    dealStage: string;
    closingDate: string;
    assignTo: string | null;
  },
  token: string,
): Promise<{accountId: string; contactId: string; dealId: string}> {
  const dealsBlock: Record<string, any> = {
    Deal_Name: payload.dealName,
    Stage: payload.dealStage,
    Closing_Date: payload.closingDate,
  };
  // Only include Amount if it's > 0 — Zoho is lenient with 0 but it's
  // cleaner to leave the field unset when there's no real number yet.
  if (payload.dealAmount > 0) dealsBlock.Amount = payload.dealAmount;

  const body: Record<string, any> = {
    overwrite: true,
    notify_lead_owner: false,
    notify_new_entity_owner: false,
    Deals: dealsBlock,
  };
  if (payload.assignTo) body.assign_to = payload.assignTo;

  const res = await fetch(
    `${ZOHO_CRM_BASE}/Leads/${leadId}/actions/convert`,
    {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: [body]}),
    },
  );
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Zoho convertLead (${res.status}): ${text.slice(0, 300)}`);
  }
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Zoho convertLead returned non-JSON: ${text.slice(0, 200)}`);
  }
  const out = (data?.data || [])[0];
  if (!out) throw new Error('Zoho convertLead returned no data');
  return {
    accountId: String(out.Accounts || ''),
    contactId: String(out.Contacts || ''),
    dealId: String(out.Deals || ''),
  };
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  // Auth — either a rep cookie (manual convert from dashboard) or the
  // internal API key (webhook fallback). Webhook path lets the LeafLink
  // handler invoke us without faking a session.
  const rep = getRepFromRequest(request);
  const internalKey = request.headers.get('x-internal-key') || '';
  const env = (context as any).env || {};
  const expectedKey = String(env.INTERNAL_API_KEY || '').trim();
  const internalAuthed =
    expectedKey.length > 0 && internalKey === expectedKey;

  if (!rep && !internalAuthed) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  let body: ConvertBody;
  try {
    body = (await request.json()) as ConvertBody;
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const leadId = String(body?.leadId || '').trim();
  if (!/^\d{6,}$/.test(leadId)) {
    return json({ok: false, error: 'leadId is required'}, {status: 400});
  }

  const dealAmount = Math.max(0, Number(body.dealAmount) || 0);
  // Closed Won lands the converted Lead's Deal in the won-revenue bucket
  // immediately, which is what Reid wants for the funnel revenue rollup.
  // Override-able when we add a "convert as in-pipeline" path later.
  const dealStage = String(body.dealStage || '').trim() || 'Closed Won';
  const source: ConvertSource =
    body.source === 'webhook' ? 'webhook' : 'manual';

  try {
    const token = await getZohoAccessToken(env);

    const lead = await fetchLeadCompany(leadId, token);
    if (!lead) {
      return json({ok: false, error: 'lead not found'}, {status: 404});
    }

    const dealName =
      String(body.dealName || '').trim() ||
      `${lead.company || 'New Account'} — First Order`;

    const result = await convertViaZoho(
      leadId,
      {
        dealName,
        dealAmount,
        dealStage,
        closingDate: todayIsoNJ(),
        // Keep ownership with the existing Lead Owner so the rep who worked
        // it gets credit. Falls through to whoever the API token is acting
        // as if Owner was unset on the Lead.
        assignTo: lead.ownerId,
      },
      token,
    );

    return json({
      ok: true,
      leadId,
      accountId: result.accountId,
      contactId: result.contactId,
      dealId: result.dealId,
      source,
      convertedBy: rep?.id || (internalAuthed ? 'webhook' : null),
    });
  } catch (err: any) {
    console.error('[api/lead-convert] failed', leadId, err.message);
    return json(
      {ok: false, error: err.message || 'convert failed'},
      {status: 502},
    );
  }
}
