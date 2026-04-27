import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {njRegion, regionLabel, predictedDayForRegion} from '../lib/nj-regions';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/vibes-pending-trainings  (GET)
// ─────────────────────────────────────────────────────────────────────────────
// Returns all open Training deals that Sky flagged from /sales-floor but which
// Serena hasn't yet confirmed with the store.  Used by the "Trainings to Book"
// inbox on Serena's /vibes dashboard so she can call each store, negotiate an
// exact day + time window, and lock the visit in via /api/vibes-training-confirm.
//
// Criteria (Zoho Deals):
//   • Pipeline = 6699615000010154308 (Needs Onboarding)
//   • Description contains [TIER:TRAINING] AND [PENDING_CONFIRM]
//   • Closing_Date = 2099-12-31 sentinel (extra safety — if the description
//     tag is stripped but the date stayed, we still catch it)
//
// Shape:
//   { ok: true, pending: [{ dealId, customerName, accountId, city, region,
//     regionLabel, isOutlier, predictedDay, trainingFocus, requestedBy,
//     requestedAt }] }
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';
const TIER_MARKER_PENDING_CONFIRM = '[PENDING_CONFIRM]';
const PENDING_CLOSING_DATE = '2099-12-31';

// Pull every open deal in the Needs Onboarding pipeline with the sentinel
// Closing_Date. That gives us a small result set — we then filter by tags in
// Description on the app side.
async function fetchPendingDeals(token: string): Promise<any[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `((Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})and(Closing_Date:equals:${PENDING_CLOSING_DATE}))`,
  );
  url.searchParams.set(
    'fields',
    'id,Deal_Name,Stage,Pipeline,Closing_Date,Description,Account_Name,Modified_Time,Created_Time',
  );
  url.searchParams.set('per_page', '200');
  url.searchParams.set('sort_by', 'Modified_Time');
  url.searchParams.set('sort_order', 'desc');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (res.status === 204) return []; // no data
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  return Array.isArray(data?.data) ? data.data : [];
}

// For each unique Account we reference, pull Billing_City + Billing_Code to
// classify region. Billing_Code feeds the zip-prefix fallback when a city
// hasn't been added to the North/Central/South allow-list yet. Batched into
// one request via Zoho's id-list criteria — capped at 50 at a time which is
// well above anything realistic for this inbox.
async function fetchAccountCities(
  accountIds: string[],
  token: string,
): Promise<Map<string, {city: string | null; zip: string | null}>> {
  const map = new Map<string, {city: string | null; zip: string | null}>();
  if (accountIds.length === 0) return map;
  // Zoho search uses criteria (id:equals:X) — for multi-id we use OR chain.
  // Chunk the chain to be safe.
  const chunks: string[][] = [];
  for (let i = 0; i < accountIds.length; i += 25) {
    chunks.push(accountIds.slice(i, i + 25));
  }
  for (const chunk of chunks) {
    const criteria =
      chunk.length === 1
        ? `(id:equals:${chunk[0]})`
        : '(' + chunk.map((id) => `(id:equals:${id})`).join('or') + ')';
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set('criteria', criteria);
    url.searchParams.set('fields', 'id,Billing_City,Billing_Code');
    url.searchParams.set('per_page', '100');
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) continue;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const row of rows) {
      map.set(row.id, {
        city: row.Billing_City || null,
        zip: row.Billing_Code || null,
      });
    }
  }
  return map;
}

// Parse [FOCUS: xxx] style hints from Description. The training endpoint
// writes "Focus: ..." on its own line (no brackets) so we grep that too.
function parseFocus(desc: string): string | null {
  const m = desc.match(/\bFocus:\s*([^\n\r]+)/i);
  return m ? m[1].trim() : null;
}

// Parse "from <name>" out of the signature line to show who requested it.
function parseRequester(desc: string): string | null {
  const m = desc.match(/Training request from\s+([^\n\r.]+?)\.?(?:\n|\r|$)/i);
  return m ? m[1].trim() : null;
}

export async function loader({context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  try {
    const token = await getZohoToken(env);
    const deals = await fetchPendingDeals(token);

    // Double-filter in case sentinel Closing_Date matches something unexpected.
    const pendingDeals = deals.filter((d) => {
      const desc = typeof d?.Description === 'string' ? d.Description : '';
      return (
        desc.includes(SALES_FLOOR_SIGNATURE) &&
        desc.includes(TIER_MARKER_TRAINING) &&
        desc.includes(TIER_MARKER_PENDING_CONFIRM)
      );
    });

    // Gather unique account ids for the city lookup.
    const accountIds = Array.from(
      new Set(
        pendingDeals
          .map((d) => d?.Account_Name?.id)
          .filter((x): x is string => typeof x === 'string' && x.length > 0),
      ),
    );
    const cityMap = await fetchAccountCities(accountIds, token);

    const pending = pendingDeals.map((d) => {
      const desc = typeof d.Description === 'string' ? d.Description : '';
      const accountId = d?.Account_Name?.id || null;
      const customerName = d?.Account_Name?.name || d?.Deal_Name || '(unknown)';
      const cityRow = accountId ? cityMap.get(accountId) : null;
      const city = cityRow?.city || null;
      const zip = cityRow?.zip || null;
      const geo = njRegion(city, zip);
      const region = geo.region;
      const isOutlier = geo.infrequentDropIn;
      // Honors Serena's launch schedule (May 14 floor + ramp-up week).
      let predictedDay: string | null = null;
      if (!isOutlier) {
        predictedDay = predictedDayForRegion(region, new Date()).label;
      }
      return {
        dealId: d.id,
        accountId,
        customerName,
        city,
        region,
        regionLabel: regionLabel(region),
        isOutlier,
        predictedDay,
        trainingFocus: parseFocus(desc),
        requestedBy: parseRequester(desc),
        requestedAt: d.Created_Time || d.Modified_Time || null,
      };
    });

    return json({ok: true, pending});
  } catch (err: any) {
    console.error('[vibes-pending-trainings] failed', err.message);
    return json(
      {ok: false, pending: [], error: err.message || 'Pending lookup failed'},
      {status: 502},
    );
  }
}
