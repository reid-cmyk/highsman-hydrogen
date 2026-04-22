import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Brand Team Training (Vibes Tier 2)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-vibes-training
//   body: {
//     zohoAccountId: string,
//     customerName: string,
//     trainingFocus?: string,    // optional: "CC interest", "new staff", etc.
//   }
//   → { ok, dealId, trainingDate }
//
// Parallel to /api/sales-floor-vibes-onboard but for Tier 2 Training visits.
// Training is a re-visit for budtender education / product walk — not the
// first-ever visit. Any rep can book it against any NJ account, regardless
// of whether the account has an order yet (cold staff training is valuable
// before the buyer says yes).
//
// Same Needs Onboarding pipeline, same sales-floor signature, but with
// [TIER:TRAINING] marker so Vibes board + sync + route builder can bucket
// it correctly. Dedup: one open Training deal per account at a time.
//
// Tier 3 Check-Ins are NOT booked through this route (or any route) — they
// are auto-scheduled by the Vibes route builder based on 30-day cadence
// from the last logged visit. Sky cannot manually book a check-in; if the
// buyer asks for one, Sky books a Training instead.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const DEFAULT_STAGE = 'Onboarding';
const VIBES_COVERED_STATES = new Set(['NJ', 'New Jersey']);
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';
// How many days out we target the training visit by default. Gives the
// route builder a week of flexibility to route Serena through — she works
// Tue/Wed/Thu so a 7-day window guarantees at least one eligible day.
const TRAINING_TARGET_DAYS = 7;

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho not configured');
  }
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
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
  if (!res.ok) throw new Error(`Zoho token (${res.status})`);
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

// Look for an existing open Training deal — same pipeline, same sales-floor
// signature, but we key specifically on the [TIER:TRAINING] marker so an
// Onboarding deal on the account doesn't block a Training booking (an
// account can have both at once — onboard then train).
async function findExistingTrainingDeal(
  accountId: string,
  token: string,
): Promise<string | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `((Account_Name.id:equals:${accountId})and(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE}))`,
  );
  url.searchParams.set('fields', 'id,Deal_Name,Stage,Pipeline,Description');
  url.searchParams.set('per_page', '20');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const rows = Array.isArray(data?.data) ? data.data : [];
  const signed = rows.find((r: any) => {
    const desc = typeof r?.Description === 'string' ? r.Description : '';
    return desc.includes(SALES_FLOOR_SIGNATURE) && desc.includes(TIER_MARKER_TRAINING);
  });
  return signed?.id || null;
}

// Same pattern as vibes-onboard — pull live Stage + Layout from any deal in
// the pipeline so we survive stage renames. Copy/paste parity keeps the two
// endpoints behaviorally identical except for the tier marker.
async function fetchPipelineReference(
  token: string,
): Promise<{stage: string; layoutId: string | null} | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set('criteria', `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`);
  url.searchParams.set('fields', 'id,Stage,Layout,Pipeline');
  url.searchParams.set('per_page', '1');
  url.searchParams.set('sort_by', 'Modified_Time');
  url.searchParams.set('sort_order', 'desc');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const row = Array.isArray(data?.data) ? data.data[0] : null;
  if (!row) return null;
  const stage = typeof row.Stage === 'string' ? row.Stage : '';
  const layoutId =
    (row.Layout && typeof row.Layout === 'object' && row.Layout.id) || null;
  if (!stage) return null;
  return {stage, layoutId};
}

async function fetchAccountState(
  accountId: string,
  token: string,
): Promise<{name: string; state: string | null} | null> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Accounts/${accountId}?fields=Account_Name,Billing_State,Account_State`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json();
  const a = (data.data || [])[0];
  if (!a) return null;
  return {
    name: a.Account_Name || '',
    state: a.Billing_State || a.Account_State || null,
  };
}

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

  const zohoAccountId = String(body?.zohoAccountId || '').trim();
  const customerName = String(body?.customerName || '').trim();
  const trainingFocus = String(body?.trainingFocus || '').trim();

  if (!zohoAccountId || !/^\d{6,}$/.test(zohoAccountId)) {
    return json({ok: false, error: 'invalid zohoAccountId'}, {status: 400});
  }
  if (!customerName) {
    return json({ok: false, error: 'customerName required'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);

    const acct = await fetchAccountState(zohoAccountId, token);
    if (!acct) {
      return json({ok: false, error: 'Zoho account not found'}, {status: 404});
    }
    if (!acct.state || !VIBES_COVERED_STATES.has(acct.state)) {
      return json(
        {
          ok: false,
          error: `Vibes coverage isn't live in ${acct.state || 'this state'} yet — Serena is NJ-only for now.`,
        },
        {status: 422},
      );
    }

    // Training target date = 7 days out. The route builder will slot it onto
    // whichever Tue/Wed/Thu fits the geography best; this date is the
    // "booked-by" marker, not the hard visit date.
    const today = new Date();
    const trainingDate = new Date(today.getTime() + TRAINING_TARGET_DAYS * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const closingDate = trainingDate;

    // Dedup: one open Training deal per account.
    const existingDealId = await findExistingTrainingDeal(zohoAccountId, token);
    if (existingDealId) {
      return json({
        ok: true,
        dealId: existingDealId,
        trainingDate,
        tier: 'training',
        cardState: 'training_booked',
        alreadyBooked: true,
      });
    }

    const dealName = `Training: ${customerName}`;
    const description = [
      `${SALES_FLOOR_SIGNATURE} ${TIER_MARKER_TRAINING} Training booked by ${rep.displayName || rep.email || 'rep'}.`,
      trainingFocus ? `Focus: ${trainingFocus}` : '',
      `Target visit: on or before ${trainingDate}`,
      `Stop duration: 60 min`,
    ]
      .filter(Boolean)
      .join('\n');

    const pipelineRef = await fetchPipelineReference(token);
    const resolvedStage = pipelineRef?.stage || DEFAULT_STAGE;
    const dealRow: Record<string, any> = {
      Deal_Name: dealName,
      Account_Name: zohoAccountId,
      Pipeline: NEEDS_ONBOARDING_PIPELINE,
      Stage: resolvedStage,
      Closing_Date: closingDate,
      Description: description,
    };
    if (pipelineRef?.layoutId) {
      dealRow.Layout = {id: pipelineRef.layoutId};
    }
    const dealPayload = {data: [dealRow], trigger: []};

    const dealRes = await fetch(`https://www.zohoapis.com/crm/v7/Deals`, {
      method: 'POST',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(dealPayload),
    });
    const dealText = await dealRes.text().catch(() => '');
    if (!dealRes.ok) {
      throw new Error(`Zoho Deals create (${dealRes.status}): ${dealText.slice(0, 300)}`);
    }
    let dealJson: any = {};
    try {
      dealJson = JSON.parse(dealText);
    } catch {}
    const dealId =
      dealJson?.data?.[0]?.details?.id ||
      dealJson?.data?.[0]?.id ||
      null;

    return json({
      ok: true,
      dealId,
      trainingDate,
      tier: 'training',
      cardState: 'training_booked',
    });
  } catch (err: any) {
    console.error('[sf-vibes-training] failed', zohoAccountId, err.message);
    return json(
      {ok: false, error: err.message || 'Training booking failed'},
      {status: 502},
    );
  }
}
