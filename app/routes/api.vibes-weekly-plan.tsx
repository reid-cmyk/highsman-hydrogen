import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {claudeTool, isAnthropicConfigured, type ClaudeToolSchema} from '../lib/anthropic';
import type {NjRegion} from '../lib/nj-regions';
import {njRegion} from '../lib/nj-regions';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes — Weekly Strategist (Tue/Wed/Thu)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/vibes-weekly-plan
//   → {
//       ok,
//       weekOf: 'YYYY-MM-DD',           // the Tuesday of the planned week
//       origin: {label, address, lat, lng},
//       plan: {
//         tuesday:  { date, stops: [accountId], rationale },
//         wednesday:{ date, stops: [accountId], rationale },
//         thursday: { date, stops: [accountId], rationale },
//       },
//       accountsById: {                  // dictionary the UI renders
//         [accountId]: { name, address, city, state, tier, priority, staleDays,
//                        dwellMin, lastVisitDate, dealId }
//       },
//       overallRationale,                // one paragraph explaining the week
//       unassigned: [accountId],         // stops that didn't fit the week
//       sources
//     }
//
// Pulls:
//   • Open Onboarding + Training deals in NEEDS_ONBOARDING pipeline (Tier 1+2)
//   • NJ accounts with Total_Orders_Count > 0, Visit_Date stale >= 20 days
//     OR Visit_Date null (Tier 3 Check-In candidates)
//
// Then hands the full candidate pool to Claude with:
//   • Origin = Union NJ 07083 (Serena)
//   • 3 days × 8h budget each
//   • Dwell: Onboarding/Training 60m, Check-In 30m
//   • Per-stop priority hint (Tier 1 > Tier 2 > Tier 3-by-staleness)
//
// Claude returns a day-by-day assignment + rationale. This endpoint does NOT
// run the Routes API — that happens when Sky hits /vibes/today (via
// /api/vibes-daily-route) for each planned day. Keeping the two concerns split
// means the strategist can plan the week even if Routes is hiccupping, and
// day-of optimization always uses the live traffic state.
//
// Degradation:
//   • No Anthropic key → deterministic greedy fallback (split by geography + priority)
//   • Claude errors → fallback + warning
//   • Zoho errors → return 502
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';

const SERENA_ORIGIN = {
  label: 'Union, NJ 07083 (Serena)',
  address: 'Union, NJ 07083',
  lat: 40.6976,
  lng: -74.2632,
};

const DWELL_MIN = {onboarding: 60, training: 60, checkin: 30} as const;
// Serena's day: 8.5 hours total (shift cap) minus 30 min lunch = 480 min of
// effective "stops + drive" budget. If the plan packs more than that it's an
// overbook and stops need to roll to the next work day.
const DAY_SHIFT_MIN = 8.5 * 60; // 510 — total shift length, clock-in to clock-out
const LUNCH_MIN = 30;
const DAY_BUDGET_MIN = DAY_SHIFT_MIN - LUNCH_MIN; // 480 — effective stops+drive
// NJ inter-city driving averages closer to 30 min between stops once you
// cluster Union-out. 15 was unrealistic and caused the 11h+ overbook Reid
// flagged. This is the per-stop drive cushion used by the pre-pack check; the
// live Routes API still refines day-of.
const TRAVEL_BUFFER_MIN = 30;
// Hard cap per day. A Vibes day with 60-min onboardings + realistic drive
// between stops tops out well under 6. Cap at 5 so we never surface a plan
// that reads like 10 stops in one shift.
const MAX_STOPS_PER_DAY = 5;
const CHECKIN_MIN_STALE_DAYS = 20;

// ─── NJ geography: 3-region split + outlier set ──────────────────────────────
// Serena is based in Union, NJ (Union County). To keep daily drive sane we
// assign every NJ account a region and lock each planning day to ONE region.
// Unknown cities default to "central" (Union is technically north but Middlesex
// County is a short hop — central absorbs the ambiguity safely).
//
// Outlier = ≥2 hrs one-way from Union. These are valid accounts but do NOT
// belong in a Tue/Wed/Thu plan — they're flagged for quarterly drop-in runs
// (e.g., a dedicated Shore day) and skipped by the weekly strategist.

// NjRegion + njRegion() live in app/lib/nj-regions.ts — shared with the
// daily route planner and Sky's Sales Floor booking buttons. Single source
// of truth for the North / Central / South split and Shore outlier set.

type Tier = 'onboarding' | 'training' | 'checkin';
type Day = 'tuesday' | 'wednesday' | 'thursday';

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

function isNj(state: string | null | undefined): boolean {
  if (!state) return false;
  const s = String(state).trim();
  return s === 'NJ' || /^new jersey$/i.test(s);
}

type Candidate = {
  accountId: string;
  name: string;
  city: string;
  state: string;
  address: string;
  tier: Tier;
  dwellMin: number;
  priority: number;
  dealId: string | null;
  lastVisitDate: string | null;
  staleDays: number | null;
  region: NjRegion;
  infrequentDropIn: boolean;
};

async function fetchOpenVibesDeals(token: string): Promise<
  Array<{
    accountId: string;
    dealId: string;
    tier: Tier;
    stage: string;
  }>
> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set('criteria', `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`);
  url.searchParams.set('fields', 'id,Stage,Account_Name,Description');
  url.searchParams.set('per_page', '200');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  const out: Array<{accountId: string; dealId: string; tier: Tier; stage: string}> = [];
  for (const r of rows) {
    const desc = String(r?.Description || '');
    const stage = String(r?.Stage || '').toLowerCase();
    // skip closed deals — only open pipeline stages
    if (/closed.*won|closed.*lost|done|complete/.test(stage)) continue;
    if (!desc.includes(SALES_FLOOR_SIGNATURE)) continue;
    let tier: Tier;
    if (desc.includes(TIER_MARKER_TRAINING)) tier = 'training';
    else if (desc.includes(TIER_MARKER_ONBOARDING)) tier = 'onboarding';
    else tier = 'onboarding'; // legacy unmarked
    const acctId = r?.Account_Name?.id || null;
    if (!acctId) continue;
    out.push({
      accountId: String(acctId),
      dealId: String(r.id),
      tier,
      stage: r.Stage || '',
    });
  }
  return out;
}

type AccountRow = {
  id: string;
  name: string;
  city: string;
  state: string;
  street: string;
  totalOrders: number;
  visitDate: string | null;
};

async function fetchNjAccountsForPool(token: string): Promise<AccountRow[]> {
  // Paginate — NJ account pool can exceed 200.
  const all: AccountRow[] = [];
  for (let page = 1; page <= 20; page++) {
    const url = new URL('https://www.zohoapis.com/crm/v7/Accounts');
    url.searchParams.set(
      'fields',
      [
        'Account_Name',
        'Billing_Street',
        'Billing_City',
        'Billing_State',
        'Account_State',
        'Shipping_State',
        'Total_Orders_Count',
        'Visit_Date',
      ].join(','),
    );
    url.searchParams.set('per_page', '200');
    url.searchParams.set('page', String(page));
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${token}`},
    });
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const rows: any[] = Array.isArray(data?.data) ? data.data : [];
    if (rows.length === 0) break;
    for (const a of rows) {
      if (
        !isNj(a.Account_State) &&
        !isNj(a.Billing_State) &&
        !isNj(a.Shipping_State)
      )
        continue;
      all.push({
        id: String(a.id),
        name: a.Account_Name || '',
        city: a.Billing_City || '',
        state: a.Account_State || a.Billing_State || '',
        street: a.Billing_Street || '',
        totalOrders:
          typeof a.Total_Orders_Count === 'number'
            ? a.Total_Orders_Count
            : Number(a.Total_Orders_Count || 0),
        visitDate: a.Visit_Date || null,
      });
    }
    const more = data?.info?.more_records;
    if (!more) break;
  }
  return all;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function accountAddress(a: AccountRow): string {
  const parts = [a.street, a.city, a.state].filter(Boolean);
  return parts.join(', ').replace(/\s+/g, ' ').trim() || (a.name + ', NJ');
}

function nextTuesday(from: Date): Date {
  const d = new Date(from);
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  // 2 = Tuesday
  const diff = (2 - dow + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

// Claude tool — 3-day plan with rationale per day + global reasoning.
const WEEKLY_PLAN_TOOL: ClaudeToolSchema = {
  name: 'build_weekly_plan',
  description:
    'Assign NJ Vibes candidate stops to Tue/Wed/Thu, respecting per-day budget, dwell, and tier priority. Return per-day stop lists + rationale.',
  input_schema: {
    type: 'object',
    properties: {
      tuesday: {
        type: 'object',
        properties: {
          stops: {
            type: 'array',
            items: {type: 'string'},
            description: 'Ordered accountIds for Tuesday, starting closest to Union NJ 07083.',
          },
          rationale: {
            type: 'string',
            description:
              'One paragraph explaining Tuesday — geography cluster, tier mix, why these stops today.',
          },
        },
        required: ['stops', 'rationale'],
      },
      wednesday: {
        type: 'object',
        properties: {
          stops: {type: 'array', items: {type: 'string'}},
          rationale: {type: 'string'},
        },
        required: ['stops', 'rationale'],
      },
      thursday: {
        type: 'object',
        properties: {
          stops: {type: 'array', items: {type: 'string'}},
          rationale: {type: 'string'},
        },
        required: ['stops', 'rationale'],
      },
      unassigned: {
        type: 'array',
        items: {type: 'string'},
        description:
          'AccountIds that did not fit the week. Prefer dropping stale Check-Ins over Tier 1/2 bookings.',
      },
      overallRationale: {
        type: 'string',
        description:
          'One paragraph explaining the week as a whole — what is prioritized, what was deferred, why.',
      },
    },
    required: ['tuesday', 'wednesday', 'thursday', 'unassigned', 'overallRationale'],
  },
};

const SYSTEM_PROMPT = `You are the Highsman Vibes Team Weekly Strategist.

Your job: build Serena's 3-day NJ plan (Tuesday/Wednesday/Thursday) from the candidate stop pool.

SERENA'S CONSTRAINTS (HARD CAPS — never exceed):
- Origin: Union, NJ 07083. Within ~60 min radius is ideal.
- 8.5-hour shift. Subtract 30 min for lunch — leaves 480 min for stops + driving.
- Dwell: Onboarding 60 min, Training 60 min, Check-In 30 min.
- Plan ~30 min of realistic drive time between stops (NJ inter-city average, including traffic). Never fewer.
- Maximum 5 stops per day. If the pool is larger, push extras to "unassigned" — do NOT overpack.
- Each day should be a tight geographic cluster — do not bounce across the state. If a cluster forces >5 stops, split it across two days.
- Mileage sanity check: a day with 5 stops should be roughly 80–150 miles, not 300+. If your plan implies more than ~200 miles in a day, you're bouncing too much — re-cluster.

NJ 3-REGION MODEL (THIS IS HOW YOU CLUSTER):
Each candidate is tagged region=NORTH / CENTRAL / SOUTH.
- NORTH = Bergen, Hudson, Passaic, Essex, Union, Morris, Sussex, Warren (I-78/I-80 corridor).
- CENTRAL = Middlesex, Monmouth, Somerset, Hunterdon, Mercer (Princeton/New Brunswick/Red Bank).
- SOUTH = Burlington, Camden, Gloucester, Ocean, Atlantic (Cherry Hill/Toms River/Atlantic).
HARD RULE: each day locks to ONE region. A Tuesday in CENTRAL means every Tuesday stop is CENTRAL. Do not mix regions within a day. If a region has too much demand for one day, use two days for that region.
ASSIGN DAYS TO REGIONS: look at the pool. Put the busiest region on Tuesday, second busiest on Wednesday, lightest on Thursday. If a region has zero candidates, that day can absorb overflow from the busier adjacent region (NORTH↔CENTRAL or CENTRAL↔SOUTH are acceptable spill-overs — never NORTH↔SOUTH in a single day).

OUTLIERS (INFREQUENT DROP-INS — DO NOT SCHEDULE THIS WEEK):
Candidates marked infrequent_dropin=true (e.g. Atlantic City, Cape May, Ocean City/Shore House Canna, LBI) are ≥2 hrs one-way from Union. They are excluded from weekly planning entirely. If any sneak into the pool, push them straight to "unassigned" with a note. These get picked up on dedicated quarterly Shore runs.

PRIORITY RULES:
1. Tier 1 (ONBOARDING) — never push out of the week. These are first-ever brand visits. Always scheduled SOMEWHERE in the 3 days.
2. Tier 2 (TRAINING) — follow-ups to onboarded accounts. Schedule this week. Pair geographically with Tier 1 where possible.
3. Tier 3 (CHECK-IN) — 30-day cadence. Oldest stale visits first. Fill open budget after Tier 1+2 are slotted.

GEOGRAPHIC CLUSTERING IS THE HARDEST CONSTRAINT — HARDER THAN DAILY TIER MIX:
- Soft floor: try to land at least ONE Onboarding or Training on each work day, so every day has a "reason to be there." This is subordinate to the region-lock rule.
- HARD rule: NEVER force a Tier 1 or Tier 2 onto a day whose region doesn't match the stop. If the only Tier 1 on Wednesday is SOUTH but Wednesday is locked to NORTH, move it to a day that matches its region. If none of the 3 days matches, defer to unassigned.
- The day's region comes first. Tier floor is a nice-to-have, not a reason to break the region lock.

DAY STRUCTURE:
- Tuesday = busiest region of the week.
- Wednesday = second busiest.
- Thursday = lightest / wrap-up.
- Assignment priority: the stop's region determines its day. Within a day, order by rough geography starting closest to Union NJ (for north/central days) or closest to the region's entry highway (for south days).

VOICE (when writing rationale fields): Highsman Training Register — declarative, no hedging, no "could/might/perhaps". Explain the logic in 2–3 sentences per day.

OUTPUT: Call build_weekly_plan once. Order stops within a day by rough geography starting from Union NJ. Return accountIds exactly as provided.`;

function greedyFallback(candidates: Candidate[]): {
  tuesday: {stops: string[]; rationale: string};
  wednesday: {stops: string[]; rationale: string};
  thursday: {stops: string[]; rationale: string};
  unassigned: string[];
  overallRationale: string;
} {
  // Region-first greedy packer. Each day is locked to ONE NJ region so drive
  // time stays tight. Which region a day gets depends on where the demand is
  // heaviest — we count candidates per region and assign the busiest two to
  // the first two days, the lightest to Thursday. Ties break N > C > S.
  const tierOrder: Record<Tier, number> = {onboarding: 0, training: 1, checkin: 2};

  const byRegion: Record<NjRegion, Candidate[]> = {
    north: [],
    central: [],
    south: [],
  };
  for (const c of candidates) byRegion[c.region].push(c);

  // Sort each region bucket: Tier 1 → Tier 2 → Tier 3 by priority desc.
  for (const r of ['north', 'central', 'south'] as NjRegion[]) {
    byRegion[r].sort((a, b) => {
      const t = tierOrder[a.tier] - tierOrder[b.tier];
      if (t !== 0) return t;
      return b.priority - a.priority;
    });
  }

  // Rank regions by total candidates (heaviest first). Break ties N > C > S.
  const regionOrder = (['north', 'central', 'south'] as NjRegion[])
    .sort((a, b) => {
      const diff = byRegion[b].length - byRegion[a].length;
      if (diff !== 0) return diff;
      const rank: Record<NjRegion, number> = {north: 0, central: 1, south: 2};
      return rank[a] - rank[b];
    });

  // Assign days — heaviest region gets Tue (fresh energy), next gets Wed,
  // lightest gets Thu. If two regions are empty, the same region can pick up
  // two days (overflow spills into the second slot).
  const dayList: Day[] = ['tuesday', 'wednesday', 'thursday'];
  const dayRegion: Record<Day, NjRegion> = {
    tuesday: regionOrder[0],
    wednesday: regionOrder[1],
    thursday: regionOrder[2],
  };

  const days: Record<Day, {stops: string[]; used: number; region: NjRegion}> = {
    tuesday: {stops: [], used: 0, region: dayRegion.tuesday},
    wednesday: {stops: [], used: 0, region: dayRegion.wednesday},
    thursday: {stops: [], used: 0, region: dayRegion.thursday},
  };

  const unassigned: string[] = [];

  // Pack each day from its region's queue. Hard caps: MAX_STOPS_PER_DAY and
  // DAY_BUDGET_MIN. Stops that don't fit roll to unassigned — NOT to the next
  // day (that would violate the one-region-per-day rule).
  for (const d of dayList) {
    const queue = byRegion[days[d].region];
    while (queue.length > 0) {
      const c = queue[0];
      if (days[d].stops.length >= MAX_STOPS_PER_DAY) break;
      if (days[d].used + c.dwellMin + TRAVEL_BUFFER_MIN > DAY_BUDGET_MIN) break;
      days[d].stops.push(c.accountId);
      days[d].used += c.dwellMin + TRAVEL_BUFFER_MIN;
      queue.shift();
    }
  }

  // Second pass — if a day was over-assigned and another day has room AND the
  // same region, spill there. (Happens when two days land the same region due
  // to region emptiness.)
  for (const d of dayList) {
    const queue = byRegion[days[d].region];
    for (const otherDay of dayList) {
      if (otherDay === d) continue;
      if (days[otherDay].region !== days[d].region) continue;
      while (queue.length > 0) {
        const c = queue[0];
        if (days[otherDay].stops.length >= MAX_STOPS_PER_DAY) break;
        if (days[otherDay].used + c.dwellMin + TRAVEL_BUFFER_MIN > DAY_BUDGET_MIN) break;
        days[otherDay].stops.push(c.accountId);
        days[otherDay].used += c.dwellMin + TRAVEL_BUFFER_MIN;
        queue.shift();
      }
    }
  }

  // Anything still in a region queue = unassigned for the week.
  for (const r of ['north', 'central', 'south'] as NjRegion[]) {
    for (const c of byRegion[r]) unassigned.push(c.accountId);
  }

  const regionLabel = (r: NjRegion) =>
    r === 'north' ? 'North NJ' : r === 'central' ? 'Central NJ' : 'South NJ';

  return {
    tuesday: {
      stops: days.tuesday.stops,
      rationale: `Region-locked fallback — Tuesday targets ${regionLabel(days.tuesday.region)} to keep drive time tight. Tier 1 and Tier 2 lead; oldest Check-Ins fill the rest.`,
    },
    wednesday: {
      stops: days.wednesday.stops,
      rationale: `Region-locked fallback — Wednesday covers ${regionLabel(days.wednesday.region)}. One cluster, no cross-state zigzag.`,
    },
    thursday: {
      stops: days.thursday.stops,
      rationale: `Region-locked fallback — Thursday wraps ${regionLabel(days.thursday.region)}. Stops ordered by priority within the cluster.`,
    },
    unassigned,
    overallRationale:
      'AI strategist offline — deterministic plan. Each day locked to one NJ region (North / Central / South) to minimize drive. Outliers like Shore House Canna are held for quarterly drop-in runs, not this week.',
  };
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = (context as any).env || {};

  try {
    const token = await getZohoToken(env);

    const [openDeals, njAccounts] = await Promise.all([
      fetchOpenVibesDeals(token),
      fetchNjAccountsForPool(token),
    ]);

    const acctById = new Map<string, AccountRow>();
    for (const a of njAccounts) acctById.set(a.id, a);

    // Tier 1 + Tier 2 pool — dedup per account; onboarding wins over training
    // on the same account (onboard first, then train).
    const tierByAcct = new Map<string, {tier: Tier; dealId: string}>();
    for (const d of openDeals) {
      if (!acctById.has(d.accountId)) continue; // deal for non-NJ account
      const existing = tierByAcct.get(d.accountId);
      if (!existing) {
        tierByAcct.set(d.accountId, {tier: d.tier, dealId: d.dealId});
      } else if (existing.tier === 'training' && d.tier === 'onboarding') {
        tierByAcct.set(d.accountId, {tier: d.tier, dealId: d.dealId});
      }
    }

    const today = new Date();
    const candidates: Candidate[] = [];

    // Tier 1 + 2 from open deals
    for (const [accountId, {tier, dealId}] of tierByAcct.entries()) {
      const a = acctById.get(accountId);
      if (!a) continue;
      const geo = njRegion(a.city);
      candidates.push({
        accountId,
        name: a.name,
        city: a.city,
        state: a.state,
        address: accountAddress(a),
        tier,
        dwellMin: DWELL_MIN[tier],
        // onboarding = 1000, training = 900 — keeps them above any check-in
        priority: tier === 'onboarding' ? 1000 : 900,
        dealId,
        lastVisitDate: a.visitDate,
        staleDays: a.visitDate
          ? daysBetween(today, new Date(a.visitDate))
          : null,
        region: geo.region,
        infrequentDropIn: geo.infrequentDropIn,
      });
    }

    // Tier 3 Check-Ins — NJ accounts with orders, stale visits
    for (const a of njAccounts) {
      if (tierByAcct.has(a.id)) continue; // already in pool as T1/T2
      if ((a.totalOrders || 0) <= 0) continue; // no orders yet = not check-in territory
      const stale = a.visitDate
        ? daysBetween(today, new Date(a.visitDate))
        : null;
      if (stale != null && stale < CHECKIN_MIN_STALE_DAYS) continue;
      // never-visited accounts with orders: low priority here — Sky's workflow
      // should catch them via New Customer onboard flow.
      const priority = stale != null ? Math.min(500, 400 + (stale - CHECKIN_MIN_STALE_DAYS)) : 300;
      const geo = njRegion(a.city);
      candidates.push({
        accountId: a.id,
        name: a.name,
        city: a.city,
        state: a.state,
        address: accountAddress(a),
        tier: 'checkin',
        dwellMin: DWELL_MIN.checkin,
        priority,
        dealId: null,
        lastVisitDate: a.visitDate,
        staleDays: stale,
        region: geo.region,
        infrequentDropIn: geo.infrequentDropIn,
      });
    }

    // Pull outliers OUT of the weekly plan — they go on a quarterly "Shore
    // day" run, not a Tue/Wed/Thu route. Keep them discoverable via a separate
    // `droppedForOutlier` list on the response so Sky can see what was excluded.
    const outliers = candidates.filter((c) => c.infrequentDropIn);
    const inRegion = candidates.filter((c) => !c.infrequentDropIn);

    // Cap the pool for Claude — anything beyond top-40 by priority is not
    // landing on a 3-day plan anyway.
    inRegion.sort((a, b) => b.priority - a.priority);
    const capped = inRegion.slice(0, 40);

    const accountsById: Record<string, any> = {};
    for (const c of [...capped, ...outliers]) {
      accountsById[c.accountId] = {
        name: c.name,
        address: c.address,
        city: c.city,
        state: c.state,
        tier: c.tier,
        priority: c.priority,
        staleDays: c.staleDays,
        dwellMin: c.dwellMin,
        lastVisitDate: c.lastVisitDate,
        dealId: c.dealId,
        region: c.region,
        infrequentDropIn: c.infrequentDropIn,
      };
    }

    const weekOf = nextTuesday(today).toISOString().slice(0, 10);
    const dayDates = {
      tuesday: weekOf,
      wednesday: new Date(nextTuesday(today).getTime() + 86400000)
        .toISOString()
        .slice(0, 10),
      thursday: new Date(nextTuesday(today).getTime() + 2 * 86400000)
        .toISOString()
        .slice(0, 10),
    };

    const outlierIds = outliers.map((o) => o.accountId);

    // ─── If Anthropic not configured, run greedy fallback ─────────────────
    if (!isAnthropicConfigured(env) || capped.length === 0) {
      const fb = greedyFallback(capped);
      return json(
        {
          ok: true,
          weekOf,
          origin: SERENA_ORIGIN,
          plan: {
            tuesday: {date: dayDates.tuesday, ...fb.tuesday},
            wednesday: {date: dayDates.wednesday, ...fb.wednesday},
            thursday: {date: dayDates.thursday, ...fb.thursday},
          },
          accountsById,
          overallRationale: fb.overallRationale,
          unassigned: fb.unassigned,
          droppedForOutlier: outlierIds,
          sources: {
            zoho: true,
            anthropic: false,
            candidatePoolSize: capped.length,
            outlierCount: outliers.length,
          },
        },
        {headers: {'Cache-Control': 'no-store'}},
      );
    }

    // ─── Claude call ──────────────────────────────────────────────────────
    const userLines: string[] = [];
    userLines.push(`TODAY: ${today.toISOString()}`);
    userLines.push(`WEEK OF: ${weekOf} (Tue ${dayDates.tuesday} / Wed ${dayDates.wednesday} / Thu ${dayDates.thursday})`);
    userLines.push(`ORIGIN: ${SERENA_ORIGIN.label}`);
    userLines.push(
      `SHIFT: ${DAY_SHIFT_MIN} min total — subtract ${LUNCH_MIN} min lunch = ${DAY_BUDGET_MIN} min for stops + driving.`,
    );
    userLines.push(`TRAVEL BUFFER: ${TRAVEL_BUFFER_MIN} min between stops (NJ realistic).`);
    userLines.push(`MAX STOPS PER DAY: ${MAX_STOPS_PER_DAY}. Overflow → unassigned.`);
    userLines.push('');
    // Region distribution — helps Claude decide which region gets which day.
    const regionCounts: Record<NjRegion, number> = {north: 0, central: 0, south: 0};
    for (const c of capped) regionCounts[c.region]++;
    userLines.push(
      `REGION DISTRIBUTION: NORTH=${regionCounts.north} · CENTRAL=${regionCounts.central} · SOUTH=${regionCounts.south}`,
    );
    userLines.push('');
    userLines.push(`CANDIDATE POOL (${capped.length} stops, outliers already excluded):`);
    for (const c of capped) {
      const tag = c.tier === 'onboarding' ? 'ONBOARDING' : c.tier === 'training' ? 'TRAINING' : 'CHECK-IN';
      const stale = c.staleDays != null ? ` · stale ${c.staleDays}d` : c.lastVisitDate ? '' : ' · never-visited';
      const region = c.region.toUpperCase();
      userLines.push(
        `  • ${c.accountId} — ${c.name} — ${c.city || '(no city)'} [${region}] — ${tag} · ${c.dwellMin}m${stale} · priority:${c.priority}`,
      );
    }
    if (outliers.length > 0) {
      userLines.push('');
      userLines.push(
        `INFREQUENT DROP-INS (EXCLUDED — do NOT assign to any day this week, ever):`,
      );
      for (const c of outliers) {
        userLines.push(
          `  • ${c.accountId} — ${c.name} — ${c.city || '(no city)'} · quarterly Shore run only`,
        );
      }
    }
    userLines.push('');
    userLines.push(
      `TASK: Call build_weekly_plan once. LOCK each day to ONE region (NORTH / CENTRAL / SOUTH) based on REGION DISTRIBUTION — busiest region on Tuesday, lightest on Thursday. Never mix regions within a day. Within a region, pick the stops using priority rules. Target ≥1 Onboarding/Training per day ONLY when it fits that day's region; otherwise push to a day whose region matches. Keep every day under ${DAY_BUDGET_MIN} min (stops + drive) AND under ${MAX_STOPS_PER_DAY} stops. When in doubt, defer to unassigned — an overbooked or region-mixed day is worse than a light one.`,
    );

    try {
      const result = await claudeTool<any>({
        apiKey: env.ANTHROPIC_API_KEY!,
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        system: SYSTEM_PROMPT,
        user: userLines.join('\n'),
        tool: WEEKLY_PLAN_TOOL,
        maxTokens: 1600,
        temperature: 0.4,
        timeoutMs: 26000,
      });

      const plan = result.input || {};
      return json(
        {
          ok: true,
          weekOf,
          origin: SERENA_ORIGIN,
          plan: {
            tuesday: {
              date: dayDates.tuesday,
              stops: plan?.tuesday?.stops || [],
              rationale: plan?.tuesday?.rationale || '',
            },
            wednesday: {
              date: dayDates.wednesday,
              stops: plan?.wednesday?.stops || [],
              rationale: plan?.wednesday?.rationale || '',
            },
            thursday: {
              date: dayDates.thursday,
              stops: plan?.thursday?.stops || [],
              rationale: plan?.thursday?.rationale || '',
            },
          },
          accountsById,
          overallRationale: plan?.overallRationale || '',
          unassigned: plan?.unassigned || [],
          droppedForOutlier: outlierIds,
          sources: {
            zoho: true,
            anthropic: true,
            candidatePoolSize: capped.length,
            outlierCount: outliers.length,
          },
          usage: result.usage,
        },
        {headers: {'Cache-Control': 'no-store'}},
      );
    } catch (err: any) {
      console.warn('[vibes-weekly-plan] Claude failed, falling back:', err.message);
      const fb = greedyFallback(capped);
      return json(
        {
          ok: true,
          weekOf,
          origin: SERENA_ORIGIN,
          plan: {
            tuesday: {date: dayDates.tuesday, ...fb.tuesday},
            wednesday: {date: dayDates.wednesday, ...fb.wednesday},
            thursday: {date: dayDates.thursday, ...fb.thursday},
          },
          accountsById,
          overallRationale: fb.overallRationale,
          unassigned: fb.unassigned,
          droppedForOutlier: outlierIds,
          sources: {
            zoho: true,
            anthropic: false,
            candidatePoolSize: capped.length,
            outlierCount: outliers.length,
          },
          warning: err.message,
        },
        {headers: {'Cache-Control': 'no-store'}},
      );
    }
  } catch (err: any) {
    console.error('[vibes-weekly-plan] failed', err.message);
    return json(
      {ok: false, error: err.message || 'weekly plan failed'},
      {status: 502},
    );
  }
}
