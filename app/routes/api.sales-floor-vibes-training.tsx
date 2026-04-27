import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {njRegion, regionLabel, predictedDayForRegion} from '../lib/nj-regions';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

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
// Pending-confirm marker. Sky's button creates the deal with this tag; Serena
// reviews in her inbox, calls the store to negotiate a time, then confirms
// via /api/vibes-training-confirm which strips this tag and writes the real
// Closing_Date + time marker. Route builders MUST skip deals with this tag.
const TIER_MARKER_PENDING_CONFIRM = '[PENDING_CONFIRM]';
// Sentinel far-future date. Zoho Deals layout requires Closing_Date; we use
// 2099-12-31 as "no real date yet" so it never surfaces in any live week.
const PENDING_CLOSING_DATE = '2099-12-31';

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
): Promise<{
  name: string;
  state: string | null;
  city: string | null;
  zip: string | null;
} | null> {
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Accounts/${accountId}?fields=Account_Name,Billing_State,Billing_City,Billing_Code,Account_State`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json();
  const a = (data.data || [])[0];
  if (!a) return null;
  return {
    name: a.Account_Name || '',
    state: a.Billing_State || a.Account_State || null,
    city: a.Billing_City || null,
    zip: a.Billing_Code || null,
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

    // Classify the store by region. Outliers (Shore House Canna, Cape May,
    // LBI, Atlantic City etc.) never make the weekly route — they get
    // quarterly drop-in runs. We still create the deal so it's on Serena's
    // radar, but we flag it and tell Sky to arrange direct.
    const geo = njRegion(acct.city, acct.zip);
    const region = geo.region;
    const isOutlier = geo.infrequentDropIn;

    // Predicted day. Default: North=Tue, Central=Wed, South=Thu. Outliers
    // get no predicted day — Sky must coordinate direct. This is ONLY a
    // suggestion now — the real Closing_Date is set by Serena when she
    // confirms the visit with the store. Sky's button is a soft request.
    //
    // Honors Serena's launch schedule: before May 14 (her start) the predicted
    // day is a calendar date inside the ramp-up week (May 14-18). After May 19
    // it switches to the rolling Tue/Wed/Thu rhythm.
    let predictedDay: string | null = null;
    if (!isOutlier) {
      predictedDay = predictedDayForRegion(region, new Date()).label;
    }

    // Dedup: one open Training deal per account (pending or confirmed).
    const existingDealId = await findExistingTrainingDeal(zohoAccountId, token);
    if (existingDealId) {
      return json({
        ok: true,
        dealId: existingDealId,
        tier: 'training',
        cardState: 'training_pending',
        alreadyBooked: true,
        pendingConfirm: true,
        region,
        regionLabel: regionLabel(region),
        predictedDay,
        isOutlier,
        message: isOutlier
          ? `Training request already logged. ${customerName} is a drop-in location — Serena will coordinate a direct Shore run.`
          : `Training request already logged. Serena will confirm the day and time with the store (likely ${predictedDay} in ${regionLabel(region)}).`,
      });
    }

    const regionTag = isOutlier ? '[OUTLIER]' : `[REGION:${region.toUpperCase()}]`;
    const dealName = `Training (pending): ${customerName}`;
    const description = [
      `${SALES_FLOOR_SIGNATURE} ${TIER_MARKER_TRAINING} ${TIER_MARKER_PENDING_CONFIRM} ${regionTag} Training request from ${rep.displayName || rep.email || 'rep'}.`,
      trainingFocus ? `Focus: ${trainingFocus}` : '',
      isOutlier
        ? `OUTLIER LOCATION (${acct.city || 'unknown city'}) — outside weekly route. Serena to arrange direct Shore run.`
        : `Region: ${regionLabel(region)} · Suggested day: ${predictedDay}`,
      `Status: AWAITING SERENA CONFIRMATION. Serena will call the store to set the exact day + time.`,
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
      // Sentinel — real date written by /api/vibes-training-confirm when
      // Serena locks the visit in. Route builders must treat this sentinel
      // as "not scheduled yet" and skip it.
      Closing_Date: PENDING_CLOSING_DATE,
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
      tier: 'training',
      cardState: 'training_pending',
      pendingConfirm: true,
      region,
      regionLabel: regionLabel(region),
      predictedDay,
      isOutlier,
      message: isOutlier
        ? `Training request sent. ${customerName} is a drop-in (${acct.city || 'outside weekly coverage'}) — Serena will coordinate a Shore run direct. You don't need to follow up.`
        : `Training request sent. Serena will call the store to confirm the exact day + time (likely ${predictedDay} in ${regionLabel(region)}).`,
    });
  } catch (err: any) {
    console.error('[sf-vibes-training] failed', zohoAccountId, err.message);
    return json(
      {ok: false, error: err.message || 'Training booking failed'},
      {status: 502},
    );
  }
}
