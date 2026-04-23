import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/lead-release
// ─────────────────────────────────────────────────────────────────────────────
// POST { leadId, reason?: string }
//   → { ok, released: true }
//
// Releases a Zoho Lead back to the open pool. The owning rep can release
// anytime ("I'll pass on this one"); Senior Staff can force-release any
// claim via the X-HS-Senior header.
//
// Non-owners cannot release unless they are Senior Staff — this prevents
// a rep from kicking a coworker off a lead to grab it.
//
// The scheduled auto-release worker (/api/lead-auto-release, cron every 30
// min) wipes any claim past its TTL; this endpoint is the manual path.
// ─────────────────────────────────────────────────────────────────────────────

const SENIOR_STAFF_PASS = 'hmexec2025$';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const leadId = String(body?.leadId || '').trim();
  if (!/^\d{6,}$/.test(leadId)) {
    return json({ok: false, error: 'invalid leadId'}, {status: 400});
  }

  const senior = request.headers.get('X-HS-Senior') === SENIOR_STAFF_PASS;

  let token: string;
  try {
    token = await getZohoAccessToken(env);
  } catch (e: any) {
    return json({ok: false, error: `Zoho auth: ${e.message || 'failed'}`}, {status: 502});
  }

  // Check who currently owns this claim — non-Senior reps can only release
  // their own.
  const readUrl = new URL(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`);
  readUrl.searchParams.set('fields', 'Working_Owner');
  const readRes = await fetch(readUrl.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!readRes.ok) {
    const t = await readRes.text().catch(() => '');
    return json(
      {ok: false, error: `Zoho Leads read (${readRes.status})`, detail: t.slice(0, 300)},
      {status: 502},
    );
  }
  const readData: any = await readRes.json().catch(() => ({}));
  const current = Array.isArray(readData?.data) ? readData.data[0] : null;
  const currentOwner = String(current?.Working_Owner || '').trim();
  if (currentOwner && currentOwner !== rep.id && !senior) {
    return json(
      {ok: false, error: 'cannot release a lead owned by another rep'},
      {status: 403},
    );
  }

  // Wiping all three fields to empty string returns the lead to the open
  // pool. Zoho treats "" as "clear the field" on v7.
  const patch = {
    Working_Owner: '',
    Working_Claimed_At: null,
    Working_Last_Activity_At: null,
  };

  const writeRes = await fetch(`https://www.zohoapis.com/crm/v7/Leads/${leadId}`, {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({data: [patch], trigger: []}),
  });

  if (!writeRes.ok) {
    const t = await writeRes.text().catch(() => '');
    console.error('[lead-release]', leadId, writeRes.status, t.slice(0, 300));
    return json(
      {ok: false, error: `Zoho update (${writeRes.status})`, detail: t.slice(0, 300)},
      {status: 502},
    );
  }

  return json({ok: true, released: true, leadId, senior: senior || undefined});
}
