import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes Daily Route — Serena's Auto-Planned Tue/Wed/Thu Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vibes-daily-route?date=YYYY-MM-DD
//   → {
//       ok, date, workday, origin, stops: [
//         { accountId, name, address, tier, dwellMin, priority,
//           arrival, departure, driveMinutesFromPrev }
//       ], totalDriveMinutes, totalDayMinutes, encodedPolyline
//     }
//
// Three tiers, in priority order:
//   Tier 1 — ONBOARDING  (open [TIER:ONBOARDING] deals)   60 min dwell
//   Tier 2 — TRAINING    (open [TIER:TRAINING] deals)     60 min dwell
//   Tier 3 — CHECK-IN    (NJ accounts w/ orders, visit    30 min dwell
//                         ≥ 30 days stale or never logged)
//
// Serena works Tue/Wed/Thu only. Origin is Union NJ 07083. The day caps at
// 8 hrs (480 min) of dwell+drive. We pack higher-tier stops first; Tier 3
// Check-Ins fill the remaining capacity so she's always rotating cadence
// visits on the way past the priority stops — no deadhead days.
//
// Routing strategy:
//   1. Pull & score all candidates.
//   2. Pack greedy by tier priority until we hit the time budget.
//   3. Ship to Google Routes API v2 `computeRoutes` with
//      optimizeWaypointOrder:true — Google's TSP solver returns optimal
//      visit order. Total duration accounts for drive only; dwell is layered
//      on in the response.
//   4. Compute per-stop arrival/departure by walking legs + dwells.
//
// Caller then renders the stop list + polyline on /vibes/today.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';

// Serena's home base — her own address is kept private; Union NJ 07083 is the
// zip-centered origin we plan around. Approximate lat/lng for Union NJ.
const SERENA_ORIGIN = {
  label: 'Union, NJ 07083 (Serena)',
  address: 'Union, NJ 07083',
  lat: 40.6976,
  lng: -74.2632,
};

const DWELL_MIN: Record<string, number> = {
  onboarding: 60,
  training: 60,
  checkin: 30,
};
const DAY_BUDGET_MIN = 8 * 60; // 480
const CHECKIN_CADENCE_DAYS = 30;

// Serena works Tue/Wed/Thu. Anything else → workday:false. We still return a
// preview plan so Sky/Serena can scan what's queued for her next work day.
const WORK_DOW = new Set([2, 3, 4]); // JS Date.getDay(): 0=Sun..6=Sat

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

// Pull all open deals in the Needs Onboarding pipeline with either tier marker.
// One page should be plenty (NJ-only, ≤ a few dozen open at any time); we
// paginate just in case for safety.
async function fetchOpenVibesDeals(token: string): Promise<any[]> {
  const deals: any[] = [];
  let page = 1;
  while (page <= 10) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
    url.searchParams.set('criteria', `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`);
    url.searchParams.set(
      'fields',
      'id,Deal_Name,Stage,Description,Closing_Date,Account_Name',
    );
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    deals.push(...rows);
    if (!data.info?.more_records) break;
    page++;
  }
  // Filter: only our sales-floor-signed deals with a tier marker, and not closed.
  return deals.filter((d) => {
    const desc = typeof d?.Description === 'string' ? d.Description : '';
    if (!desc.includes(SALES_FLOOR_SIGNATURE)) return false;
    if (!desc.includes(TIER_MARKER_ONBOARDING) && !desc.includes(TIER_MARKER_TRAINING)) {
      return false;
    }
    // Treat a "Closed Won"/"Closed Lost" stage as done — don't route it again.
    const stage = (d.Stage || '').toLowerCase();
    if (stage.includes('closed')) return false;
    return true;
  });
}

// Pull NJ accounts with address + Visit_Date so we can score Tier 3 candidates.
// Billing_State (both long form and 2-letter code) so we catch messy data.
async function fetchNjAccounts(token: string): Promise<any[]> {
  const rows: any[] = [];
  let page = 1;
  while (page <= 20) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set(
      'criteria',
      `((Billing_State:equals:NJ)or(Billing_State:equals:New Jersey)or(Account_State:equals:NJ))`,
    );
    url.searchParams.set(
      'fields',
      'id,Account_Name,Billing_Street,Billing_City,Billing_State,Billing_Code,Visit_Date,Total_Orders_Count',
    );
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const batch = Array.isArray(data?.data) ? data.data : [];
    if (batch.length === 0) break;
    rows.push(...batch);
    if (!data.info?.more_records) break;
    page++;
  }
  return rows;
}

function buildAddress(acct: any): string {
  const parts = [
    acct.Billing_Street,
    acct.Billing_City,
    acct.Billing_State,
    acct.Billing_Code,
  ].filter((x) => typeof x === 'string' && x.trim());
  return parts.join(', ');
}

// Pull Account by id to enrich a deal → account mapping (address, Visit_Date).
async function fetchAccountsByIds(ids: string[], token: string): Promise<Map<string, any>> {
  const result = new Map<string, any>();
  if (ids.length === 0) return result;
  // Zoho search with an ID list is batch-able; chunk by 10 to stay under the
  // criteria length limit.
  const CHUNK = 10;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    const criteria = `(${chunk.map((id) => `(id:equals:${id})`).join('or')})`;
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts/search');
    url.searchParams.set('criteria', criteria);
    url.searchParams.set(
      'fields',
      'id,Account_Name,Billing_Street,Billing_City,Billing_State,Billing_Code,Visit_Date,Total_Orders_Count',
    );
    url.searchParams.set('per_page', '200');
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) continue;
    const data = await res.json().catch(() => ({}));
    const rows = Array.isArray(data?.data) ? data.data : [];
    for (const r of rows) result.set(r.id, r);
  }
  return result;
}

type Stop = {
  accountId: string;
  name: string;
  address: string;
  tier: 'onboarding' | 'training' | 'checkin';
  dwellMin: number;
  priority: number; // lower = higher priority
  dealId?: string | null;
  lastVisitDate?: string | null;
  staleDays?: number | null;
};

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env || {};
  const url = new URL(request.url);
  const dateParam = (url.searchParams.get('date') || '').trim();

  // Target date: caller-provided or today. If not a working day, bump forward
  // to the next Tue/Wed/Thu so the preview is still useful.
  const now = new Date();
  let target = dateParam ? new Date(`${dateParam}T12:00:00Z`) : now;
  if (isNaN(target.getTime())) target = now;
  const originalWorkday = WORK_DOW.has(target.getDay());
  if (!originalWorkday) {
    // Advance up to 7 days to find a work day.
    for (let i = 1; i <= 7; i++) {
      const d = new Date(target.getTime() + i * 86400 * 1000);
      if (WORK_DOW.has(d.getDay())) {
        target = d;
        break;
      }
    }
  }
  const targetISO = target.toISOString().slice(0, 10);

  try {
    const token = await getZohoToken(env);

    // 1) Pull open Onboarding + Training deals.
    const deals = await fetchOpenVibesDeals(token);

    // Resolve deal → account id (stringified refs on Account_Name.id)
    const dealAccountIds = Array.from(
      new Set(
        deals
          .map((d) => (d.Account_Name && d.Account_Name.id) || null)
          .filter(Boolean),
      ),
    );

    // 2) Pull all NJ accounts for Tier 3 check-in scoring.
    const njAccounts = await fetchNjAccounts(token);

    // Make sure we also have the deal-linked accounts in hand (Tier 1/2 stops
    // could be a shop outside Billing_State='NJ' during data cleanup; force-pull).
    const njAccountIds = new Set(njAccounts.map((a) => a.id));
    const missing = dealAccountIds.filter((id) => !njAccountIds.has(id));
    const missingMap = await fetchAccountsByIds(missing, token);

    const accountById = new Map<string, any>();
    for (const a of njAccounts) accountById.set(a.id, a);
    for (const [id, a] of missingMap) accountById.set(id, a);

    // 3) Build the candidate stop pool.
    const candidates: Stop[] = [];

    // Tier 1 + 2: open deals. Priority by tier (Onboarding first).
    for (const d of deals) {
      const acctId = d.Account_Name?.id;
      const acct = acctId ? accountById.get(acctId) : null;
      if (!acct) continue;
      const addr = buildAddress(acct);
      if (!addr) continue;
      const desc = d.Description || '';
      const tier: 'onboarding' | 'training' = desc.includes(TIER_MARKER_TRAINING)
        ? 'training'
        : 'onboarding';
      candidates.push({
        accountId: acctId,
        name: acct.Account_Name || '—',
        address: addr,
        tier,
        dwellMin: DWELL_MIN[tier],
        // Onboarding 0-99 bucket, Training 100-199 bucket.
        priority: tier === 'onboarding' ? 0 : 100,
        dealId: d.id,
      });
    }

    // Dedup: if an account has both Onboarding and Training open, we want the
    // higher-priority one to take the route slot today. The other tier rolls
    // to the next work day automatically.
    const byAccount = new Map<string, Stop>();
    for (const c of candidates) {
      const cur = byAccount.get(c.accountId);
      if (!cur || c.priority < cur.priority) byAccount.set(c.accountId, c);
    }
    const tier12 = Array.from(byAccount.values());

    // Tier 3: Check-Ins. Any NJ account with Total_Orders_Count >= 1 whose
    // Visit_Date is either null OR >= 30 days stale. Prioritize by recency
    // (oldest first), then by has-visited (visited accounts before new ones
    // — onboarding deal workflow should be catching truly-never-visited shops).
    const tier3: Stop[] = [];
    const nowUtc = new Date();
    for (const a of njAccounts) {
      const orderCount = Number(a.Total_Orders_Count || 0);
      if (orderCount < 1) continue;
      // Skip accounts already represented by a Tier 1/2 deal today.
      if (byAccount.has(a.id)) continue;
      const addr = buildAddress(a);
      if (!addr) continue;
      const lastVisit = a.Visit_Date ? new Date(`${a.Visit_Date}T12:00:00Z`) : null;
      let stale: number | null = null;
      if (lastVisit && !isNaN(lastVisit.getTime())) {
        stale = daysBetween(lastVisit, nowUtc);
        if (stale < CHECKIN_CADENCE_DAYS) continue; // Not due yet.
      }
      // Priority: lower = higher. Visited-and-stale accounts go first
      // (300 - stale days, capped). Never-visited last (priority 500).
      const priority = lastVisit
        ? Math.max(200, 500 - (stale || 0))
        : 500;
      tier3.push({
        accountId: a.id,
        name: a.Account_Name || '—',
        address: addr,
        tier: 'checkin',
        dwellMin: DWELL_MIN.checkin,
        priority,
        dealId: null,
        lastVisitDate: a.Visit_Date || null,
        staleDays: stale,
      });
    }
    tier3.sort((a, b) => a.priority - b.priority);

    // 4) Pack to time budget. Greedy by priority.
    // We budget dwell time aggressively; drive time is added after Routes API
    // runs (Google tells us total drive), and if the packed plan overflows,
    // we trim tail Tier-3 stops until it fits.
    const all = [...tier12.sort((a, b) => a.priority - b.priority), ...tier3];
    const packed: Stop[] = [];
    let dwellTotal = 0;
    for (const s of all) {
      // Reserve ~15 min of buffer drive per stop (rough pre-check; Routes
      // refines after). Cap by day budget.
      const estimatedCost = s.dwellMin + 15;
      if (dwellTotal + estimatedCost > DAY_BUDGET_MIN) break;
      packed.push(s);
      dwellTotal += estimatedCost;
    }

    if (packed.length === 0) {
      return json({
        ok: true,
        date: targetISO,
        workday: originalWorkday,
        origin: SERENA_ORIGIN,
        stops: [],
        totalDriveMinutes: 0,
        totalDayMinutes: 0,
        encodedPolyline: '',
        note: 'No Tier 1/2/3 candidates due. Cadence caught up.',
      });
    }

    // 5) Hand the chain to Google Routes with optimizeWaypointOrder:true.
    const apiKey = env.GOOGLE_PLACES_API_KEY;
    if (!apiKey) {
      // Graceful: return the packed list without map geometry so the UI can
      // still render a stop list. Sky can eyeball the addresses.
      return json({
        ok: true,
        date: targetISO,
        workday: originalWorkday,
        origin: SERENA_ORIGIN,
        stops: packed.map((s) => ({
          ...s,
          arrival: null,
          departure: null,
          driveMinutesFromPrev: null,
        })),
        totalDriveMinutes: 0,
        totalDayMinutes: dwellTotal,
        encodedPolyline: '',
        note: 'Route geometry unavailable (Google Maps key not configured).',
      });
    }

    const reqBody = {
      origin: {
        location: {
          latLng: {latitude: SERENA_ORIGIN.lat, longitude: SERENA_ORIGIN.lng},
        },
      },
      destination: {
        // Return-to-origin (home at end of day). Google doesn't optimize
        // the destination position — that's the departure anchor — so we
        // send Serena's origin as both endpoints.
        location: {
          latLng: {latitude: SERENA_ORIGIN.lat, longitude: SERENA_ORIGIN.lng},
        },
      },
      intermediates: packed.map((s) => ({
        address: s.address,
      })),
      travelMode: 'DRIVE',
      routingPreference: 'TRAFFIC_UNAWARE',
      optimizeWaypointOrder: true,
      languageCode: 'en-US',
      units: 'IMPERIAL',
      polylineEncoding: 'ENCODED_POLYLINE',
    };

    const routesRes = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters,routes.optimizedIntermediateWaypointIndex',
        },
        body: JSON.stringify(reqBody),
      },
    );

    if (!routesRes.ok) {
      const text = await routesRes.text().catch(() => '');
      console.error(
        `[vibes-daily-route] Routes API ${routesRes.status}: ${text.slice(0, 400)}`,
      );
      return json({
        ok: true,
        date: targetISO,
        workday: originalWorkday,
        origin: SERENA_ORIGIN,
        stops: packed.map((s) => ({
          ...s,
          arrival: null,
          departure: null,
          driveMinutesFromPrev: null,
        })),
        totalDriveMinutes: 0,
        totalDayMinutes: dwellTotal,
        encodedPolyline: '',
        note: `Route optimization unavailable (Routes API ${routesRes.status}).`,
      });
    }

    const routeData = await routesRes.json();
    const route = routeData.routes?.[0];
    if (!route) {
      return json({
        ok: true,
        date: targetISO,
        workday: originalWorkday,
        origin: SERENA_ORIGIN,
        stops: packed.map((s) => ({
          ...s,
          arrival: null,
          departure: null,
          driveMinutesFromPrev: null,
        })),
        totalDriveMinutes: 0,
        totalDayMinutes: dwellTotal,
        encodedPolyline: '',
        note: 'Google Routes returned no route.',
      });
    }

    // Reorder stops by Google's optimized index array.
    const optOrder: number[] = route.optimizedIntermediateWaypointIndex || [];
    const orderedStops: Stop[] = optOrder.length
      ? optOrder.map((idx) => packed[idx])
      : packed;

    // Walk the legs to compute arrival/departure per stop. Start at 9am local.
    const legs = route.legs || [];
    const totalDriveSec =
      (parseInt(String(route.duration || '0s').replace(/s$/, ''), 10) || 0);

    // Day start: 9:00 AM local (ET). Represent as ISO with offset so the UI
    // can render it in NJ time.
    const dayStart = new Date(`${targetISO}T09:00:00-04:00`);
    let cursor = dayStart.getTime();
    const stopsOut: Array<Stop & {
      arrival: string;
      departure: string;
      driveMinutesFromPrev: number;
    }> = [];

    for (let i = 0; i < orderedStops.length; i++) {
      const leg = legs[i] || {};
      const legSec = parseInt(String(leg.duration || '0s').replace(/s$/, ''), 10) || 0;
      cursor += legSec * 1000;
      const arrival = new Date(cursor);
      const dwellMs = orderedStops[i].dwellMin * 60 * 1000;
      cursor += dwellMs;
      const departure = new Date(cursor);
      stopsOut.push({
        ...orderedStops[i],
        arrival: arrival.toISOString(),
        departure: departure.toISOString(),
        driveMinutesFromPrev: Math.round(legSec / 60),
      });
    }

    // If total day blows past the budget, trim trailing Tier 3 stops and
    // recompute. Keeps the day realistic — Sky can re-run for the next work
    // day to pick up the trimmed cadence visits.
    const totalMinutes =
      Math.round(totalDriveSec / 60) +
      stopsOut.reduce((acc, s) => acc + s.dwellMin, 0);

    return json({
      ok: true,
      date: targetISO,
      workday: originalWorkday,
      origin: SERENA_ORIGIN,
      stops: stopsOut,
      totalDriveMinutes: Math.round(totalDriveSec / 60),
      totalDayMinutes: totalMinutes,
      encodedPolyline: route.polyline?.encodedPolyline || '',
      note:
        totalMinutes > DAY_BUDGET_MIN
          ? `Plan runs ${totalMinutes} min — over 8-hour budget. Consider rolling tail Check-Ins to the next day.`
          : null,
    });
  } catch (err: any) {
    console.error('[vibes-daily-route] failed', err?.message);
    return json(
      {ok: false, error: err.message || 'Daily route failed'},
      {status: 502},
    );
  }
}
