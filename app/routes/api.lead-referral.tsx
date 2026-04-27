/**
 * api.lead-referral.tsx
 *
 * Public POST endpoint backing /leads (highsman.com/leads).
 *
 * Creates a Zoho Lead tagged "Hot Lead" with no Working_Owner so it lands
 * unclaimed in BOTH the New Business dashboard and the Sales Floor /sales-floor
 * Leads tab. First rep to click Claim wins it (existing claim flow lives in
 * api.sales-floor-claim.tsx; nothing new required here as long as the lead
 * is created with Working_Owner = null).
 *
 * Behavior:
 *   • Honeypot field "company_website" — if filled, return ok silently (drops bot).
 *   • Naive in-memory IP rate limit (5 / 10 min) — fine for an Oxygen worker
 *     with low referral volume. If we ever scale, swap to KV.
 *   • Phone normalized to E.164-ish (digits only, +1 default for 10-digit US).
 *   • Submitter name + email + relationship appended to Description so
 *     reps see who referred whom in the brief modal.
 *   • Lead_Source = "Referral Page", Lead_Status = "Hot", Rating = "Hot",
 *     Tag = [{name: 'Hot Lead'}].
 *   • Working_Owner = null (Sales Floor surfaces unclaimed leads only when
 *     this is null — see project_zoho_lead_sales_floor_fields.md).
 *   • Enrichment_Status = "Pending" so the background enrichment job picks
 *     it up and fills in LinkedIn / firmographics overnight.
 *
 * Place in Hydrogen as: app/routes/api.lead-referral.tsx
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

import {getZohoAccessToken} from '~/lib/zoho-auth';

const ZOHO_API = 'https://www.zohoapis.com/crm/v7';

// ── Anti-spam: simple in-memory IP rate limit (per worker instance) ────────
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 min
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, number[]>();

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  ipHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

function clientIp(request: Request): string {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function normalizePhone(raw: string): string | null {
  const digits = (raw || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits.length >= 7 ? `+${digits}` : null;
}

function splitName(full: string): {first: string; last: string} {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return {first: '', last: parts[0]};
  return {first: parts[0], last: parts.slice(1).join(' ')};
}

function bad(msg: string, status = 400) {
  return json({ok: false, error: msg}, {status});
}

// ── Action ─────────────────────────────────────────────────────────────────
export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') return bad('Method not allowed', 405);

  const ip = clientIp(request);
  if (rateLimited(ip)) {
    return bad('Too many submissions. Try again in a few minutes.', 429);
  }

  const body = await request.formData();

  // Honeypot — bots fill hidden fields humans never see.
  if (String(body.get('company_website') || '').trim()) {
    // Pretend success so spam scrapers move on.
    return json({ok: true, drop: true});
  }

  const leadFullName = String(body.get('lead_name') || '').trim();
  const leadCell = String(body.get('lead_cell') || '').trim();
  const leadEmail = String(body.get('lead_email') || '').trim().toLowerCase();
  const dispensary = String(body.get('dispensary_name') || '').trim();
  const dispensaryState = String(body.get('dispensary_state') || '').trim().toUpperCase();
  const relationship = String(body.get('relationship') || '').trim();
  const notes = String(body.get('notes') || '').trim();
  const submitterName = String(body.get('submitter_name') || '').trim();
  const submitterEmail = String(body.get('submitter_email') || '').trim().toLowerCase();

  // ── Validate ─────────────────────────────────────────────────────────────
  if (!leadFullName) return bad('Lead name is required.');
  if (!leadCell && !leadEmail) return bad('Need at least a phone or email for the lead.');
  if (leadEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadEmail)) {
    return bad('Lead email looks invalid.');
  }
  if (!dispensary) return bad('Dispensary name is required.');
  if (!submitterName) return bad('Tell us who you are so we can give you credit.');
  if (submitterEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(submitterEmail)) {
    return bad('Your email looks invalid.');
  }

  const phone = normalizePhone(leadCell);
  const {first, last} = splitName(leadFullName);

  // ── Build Zoho payload ───────────────────────────────────────────────────
  const description = [
    `Submitted via highsman.com/leads on ${new Date().toISOString()}`,
    `Referred by: ${submitterName}${submitterEmail ? ` <${submitterEmail}>` : ''}`,
    relationship ? `Relationship to lead: ${relationship}` : null,
    notes ? `\nNotes from referrer:\n${notes}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const lead: Record<string, any> = {
    Last_Name: last || leadFullName,
    First_Name: first || undefined,
    Email: leadEmail || undefined,
    Phone: phone || undefined,
    Mobile: phone || undefined,
    // Zoho Leads requires Company. Dispensary name is the right map.
    Company: dispensary,
    State: dispensaryState || undefined,
    // Also write the Market_State picklist (api_name `States`) — that's
    // the canonical state field the Sales Floor + New Business dashboards
    // filter on. Without this, referral-form leads slip through any
    // state-scoped view because their address State is the only fallback.
    States: dispensaryState || undefined,
    Lead_Source: 'Referral Page',
    Lead_Status: 'Hot',
    Rating: 'Hot',
    Description: description,
    // Sales Floor custom fields (see reference_zoho_lead_sales_floor_fields.md)
    Working_Owner: null, // unclaimed → first-claim wins
    Enrichment_Status: 'Pending',
    // Inline tag — Zoho v7 accepts on create; we also call add_tags below
    // as a belt-and-suspenders in case the org has tag-on-create disabled.
    Tag: [{name: 'Hot Lead'}],
  };

  // Strip undefined keys so Zoho doesn't reject the payload.
  Object.keys(lead).forEach((k) => lead[k] === undefined && delete lead[k]);

  // ── Create in Zoho ───────────────────────────────────────────────────────
  let token: string;
  try {
    token = await getZohoAccessToken((context as any).env);
  } catch (err: any) {
    console.error('[lead-referral] Zoho token failed', err);
    return bad('Lead system unavailable. Try again in a minute.', 502);
  }

  let leadId: string | null = null;
  try {
    const res = await fetch(`${ZOHO_API}/Leads`, {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: [lead], trigger: ['workflow']}),
    });
    const j = (await res.json()) as any;
    const row = j?.data?.[0];
    if (!res.ok || row?.status !== 'success') {
      console.error('[lead-referral] Zoho create failed', JSON.stringify(j));
      return bad("We couldn't save the referral. Try again.", 502);
    }
    leadId = row?.details?.id || null;
  } catch (err: any) {
    console.error('[lead-referral] Zoho create exception', err);
    return bad('Lead system unavailable.', 502);
  }

  // ── Belt-and-suspenders: explicit add_tags call ──────────────────────────
  // If inline Tag worked, this is a no-op duplicate. If it didn't, this
  // guarantees the Hot Lead tag is on the record so dashboards see it.
  if (leadId) {
    try {
      await fetch(
        `${ZOHO_API}/Leads/${leadId}/actions/add_tags?tag_names=${encodeURIComponent('Hot Lead')}`,
        {
          method: 'POST',
          headers: {Authorization: `Zoho-oauthtoken ${token}`},
        },
      );
    } catch (err) {
      // Non-fatal — the lead is in. Tag will fall through.
      console.warn('[lead-referral] add_tags follow-up failed (non-fatal)', err);
    }
  }

  return json({
    ok: true,
    lead_id: leadId,
    lead_name: leadFullName,
    dispensary,
  });
}

// No GET surface for this endpoint.
export async function loader() {
  return new Response('Method not allowed', {status: 405});
}
