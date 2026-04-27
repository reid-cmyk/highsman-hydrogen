import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {njRegion, regionLabel, predictedDayForRegion} from '../lib/nj-regions';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — New Product Onboarding (Vibes Tier 1, existing accounts)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-vibes-product-onboard
//   body: {
//     zohoAccountId: string,
//     customerName: string,
//     productName?: string,        // optional — what new SKU triggered this
//   }
//   → { ok, dealId, region, regionLabel, predictedDay, isOutlier, message }
//
// What this does:
//   1. Mirrors api.sales-floor-vibes-onboard except the trigger is "this shop
//      just brought in a new product." Sky clicks it from the Accounts tab
//      (not from New Customers — that flow is for first-ever orders).
//   2. Creates a Deal in the Needs Onboarding pipeline with the same Tier 1
//      marker so the route builders treat it identically (60-min dwell,
//      "fresh" tier on /vibes today). A separate [KIND:PRODUCT] sub-marker
//      lets the UI label it "New Product Onboarding" instead of "Onboarding."
//   3. Duplicate check is scoped to product-onboarding deals — a shop can
//      have BOTH a regular onboarding (first visit) and a product onboarding
//      (new SKU) open at the same time. They're different intents.
//   4. Honors Serena's launch schedule (May 14 floor + ramp-up week) just
//      like the onboarding flow. Outliers get a 422 with the same Book
//      Manually Through Serena rejection.
//
// Vibes coverage: NJ-only for v1. Out-of-state accounts get a friendly 422.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const ONBOARDING_STAGE = 'Onboarding';
const VIBES_COVERED_STATES = new Set(['NJ', 'New Jersey']);
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
// Same Tier 1 marker as the new-customer onboarding flow — the route
// builders bucket both into "fresh" 60-min Tier 1 stops. The [KIND:PRODUCT]
// sub-marker is what differentiates this from a first-customer onboarding
// in /vibes (label) and in the dedup check (this endpoint only collides
// with other product-onboardings, not with first-visit onboardings).
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const KIND_MARKER_PRODUCT = '[KIND:PRODUCT]';

// Dedup helper — only counts as a duplicate if the existing open deal has
// BOTH the sales-floor signature AND the product sub-marker. A regular
// new-customer onboarding deal on the same account does NOT block a product
// onboarding. They're different intents and Serena should see both.
async function findExistingProductOnboardingDeal(
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
  // Both the sales-floor signature AND the product sub-marker must appear
  // for this to count as a duplicate. Keeps us isolated from new-customer
  // onboardings on the same account.
  const signed = rows.find((r: any) => {
    const desc = typeof r?.Description === 'string' ? r.Description : '';
    if (!desc.includes(SALES_FLOOR_SIGNATURE)) return false;
    if (!desc.includes(KIND_MARKER_PRODUCT)) return false;
    const stage = (r?.Stage || '').toLowerCase();
    if (stage.includes('closed')) return false;
    return true;
  });
  return signed?.id || null;
}

// Pull a reference deal in the pipeline so we can copy its Stage + Layout
// onto the new deal. Same pattern as api.sales-floor-vibes-onboard — Zoho
// rejects stage names that don't match the pipeline's layout, and our org
// has renamed stages enough times that hardcoding 'Onboarding' is brittle.
async function fetchPipelineReference(
  token: string,
): Promise<{stage: string; layoutId: string | null} | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`,
  );
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
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
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
  const productName = String(body?.productName || '').trim();

  if (!zohoAccountId || !/^\d{6,}$/.test(zohoAccountId)) {
    return json({ok: false, error: 'invalid zohoAccountId'}, {status: 400});
  }
  if (!customerName) {
    return json({ok: false, error: 'customerName required'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);

    // Verify Vibes coverage (NJ only for v1).
    const acct = await fetchAccountState(zohoAccountId, token);
    if (!acct) {
      return json({ok: false, error: 'Zoho account not found'}, {status: 404});
    }
    if (!acct.state || !VIBES_COVERED_STATES.has(acct.state)) {
      return json(
        {
          ok: false,
          error: `Vibes coverage isn't live in ${acct.state || 'this state'} yet — call the buyer instead.`,
        },
        {status: 422},
      );
    }

    // Region classification (city + zip-fallback). Outliers (Shore House
    // Canna, Cape May, LBI) get a 422 — Serena runs them as direct shore
    // trips, not on the weekly route.
    const geo = njRegion(acct.city, acct.zip);
    const region = geo.region;
    const isOutlier = geo.infrequentDropIn;
    if (isOutlier) {
      return json(
        {
          ok: false,
          isOutlier: true,
          region,
          regionLabel: regionLabel(region),
          error:
            `${customerName} (${acct.city || 'Shore/LBI/Cape May'}) is not available for regular product-onboarding visits. Book Manually Through Serena.`,
        },
        {status: 422},
      );
    }

    // Predicted day honors Serena's May 14 launch + ramp window.
    const predicted = predictedDayForRegion(region, new Date());
    const predictedDay = predicted.label;
    const predictedDate = predicted.iso;

    // Closing date = the day Serena should have wrapped the product visit.
    // Default 7 days out from now; floor at the predicted date so the deal
    // never looks overdue on /vibes before Serena has even gotten there.
    const sevenDaysOut = new Date(Date.now() + 7 * 86400 * 1000)
      .toISOString()
      .slice(0, 10);
    const closingDate =
      predictedDate > sevenDaysOut ? predictedDate : sevenDaysOut;

    // Dedup — only block if a Product Onboarding is already open for this
    // account. A standard first-visit onboarding deal on the same account
    // does NOT block this; they're different intents.
    const existingDealId = await findExistingProductOnboardingDeal(
      zohoAccountId,
      token,
    );
    if (existingDealId) {
      return json({
        ok: true,
        dealId: existingDealId,
        alreadyBooked: true,
        region,
        regionLabel: regionLabel(region),
        predictedDay,
        isOutlier: false,
        message:
          `Already booked — Serena is set for ${predictedDay} (${regionLabel(region)} coverage) to walk the new product.`,
      });
    }

    const regionTag = `[REGION:${region.toUpperCase()}]`;
    const dealName = productName
      ? `Product Onboarding: ${customerName} — ${productName}`
      : `Product Onboarding: ${customerName}`;
    const description = [
      `${SALES_FLOOR_SIGNATURE} ${TIER_MARKER_ONBOARDING} ${KIND_MARKER_PRODUCT} ${regionTag} New Product Onboarding from ${rep.displayName || rep.email || 'rep'}.`,
      productName ? `New product: ${productName}` : '',
      `Region: ${regionLabel(region)} · Predicted day: ${predictedDay}`,
      'Visit type: walk the buyer + budtenders through the new SKU. Place merch + sample.',
      'Stop duration: 60 min',
    ]
      .filter(Boolean)
      .join('\n');

    const pipelineRef = await fetchPipelineReference(token);
    const resolvedStage = pipelineRef?.stage || ONBOARDING_STAGE;
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

    const dealRes = await fetch('https://www.zohoapis.com/crm/v7/Deals', {
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
    } catch {
      // Empty body still counts as success on some Zoho 201s.
    }
    const dealId =
      dealJson?.data?.[0]?.details?.id || dealJson?.data?.[0]?.id || null;

    return json({
      ok: true,
      dealId,
      region,
      regionLabel: regionLabel(region),
      predictedDay,
      isOutlier: false,
      productName: productName || null,
      message: `New Product Onboarding booked — Serena will walk it on ${predictedDay} (${regionLabel(region)} coverage).`,
    });
  } catch (err: any) {
    console.error('[sf-vibes-product-onboard] failed', zohoAccountId, err.message);
    return json(
      {ok: false, error: err.message || 'Product onboarding failed'},
      {status: 502},
    );
  }
}
