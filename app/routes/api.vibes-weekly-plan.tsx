import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {claudeTool, isAnthropicConfigured, type ClaudeToolSchema} from '../lib/anthropic';

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
const DAY_BUDGET_MIN = 8 * 60;
const CHECKIN_MIN_STALE_DAYS = 20;

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

SERENA'S CONSTRAINTS:
- Origin: Union, NJ 07083. Within ~60 min radius is ideal.
- 8-hour working day per day.
- Dwell: Onboarding 60 min, Training 60 min, Check-In 30 min.
- Plan at ~15 min of travel buffer between stops.
- Each day should be a tight geographic cluster — do not bounce across the state.

PRIORITY RULES:
1. Tier 1 (ONBOARDING) — never push to next week. These are first-ever brand visits. Always scheduled.
2. Tier 2 (TRAINING) — follow-ups to onboarded accounts. Schedule this week. Pair geographically with Tier 1 where possible.
3. Tier 3 (CHECK-IN) — 30-day cadence. Oldest stale visits first. Fill open budget after Tier 1+2 are slotted.

DAY STRUCTURE:
- Tuesday = high-energy launch day. Lead with Tier 1 if available.
- Wednesday = middle of the week, heaviest Tier 2 training day.
- Thursday = wrap-up, often mixed, good for clusters Sky wants visibility on before the weekend.
- If all 3 tiers represented, spread them across the week — don't dump all training on one day.

VOICE (when writing rationale fields): Highsman Training Register — declarative, no hedging, no "could/might/perhaps". Explain the logic in 2–3 sentences per day.

OUTPUT: Call build_weekly_plan once. Order stops within a day by rough geography starting from Union NJ. Return accountIds exactly as provided.`;

function greedyFallback(candidates: Candidate[]): {
  tuesday: {stops: string[]; rationale: string};
  wednesday: {stops: string[]; rationale: string};
  thursday: {stops: string[]; rationale: string};
  unassigned: string[];
  overallRationale: string;
} {
  // Sort: Tier 1 first, then Tier 2, then Tier 3 by priority (highest = oldest stale).
  const tierOrder: Record<Tier, number> = {onboarding: 0, training: 1, checkin: 2};
  const sorted = [...candidates].sort((a, b) => {
    const t = tierOrder[a.tier] - tierOrder[b.tier];
    if (t !== 0) return t;
    return b.priority - a.priority;
  });

  const days: Record<Day, {stops: string[]; used: number}> = {
    tuesday: {stops: [], used: 0},
    wednesday: {stops: [], used: 0},
    thursday: {stops: [], used: 0},
  };
  const dayList: Day[] = ['tuesday', 'wednesday', 'thursday'];
  const unassigned: string[] = [];

  // Round-robin by tier so each day gets a mix rather than tuesday eating all T1.
  let di = 0;
  for (const c of sorted) {
    let placed = false;
    for (let attempts = 0; attempts < 3 && !placed; attempts++) {
      const d = dayList[(di + attempts) % 3];
      if (days[d].used + c.dwellMin + 15 <= DAY_BUDGET_MIN) {
        days[d].stops.push(c.accountId);
        days[d].used += c.dwellMin + 15;
        placed = true;
      }
    }
    if (!placed) unassigned.push(c.accountId);
    di = (di + 1) % 3;
  }

  return {
    tuesday: {
      stops: days.tuesday.stops,
      rationale:
        'Deterministic fallback — no Anthropic key available. Stops packed greedily by tier priority.',
    },
    wednesday: {
      stops: days.wednesday.stops,
      rationale:
        'Deterministic fallback — balanced across the week to respect day budgets.',
    },
    thursday: {
      stops: days.thursday.stops,
      rationale:
        'Deterministic fallback — remaining stops, oldest check-ins first.',
    },
    unassigned,
    overallRationale:
      'AI strategist offline — this plan is a deterministic tier-priority split. Sky should review manually before Serena heads out.',
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
      });
    }

    // Cap the pool for Claude — anything beyond top-30 by priority is not
    // landing on a 3-day plan anyway.
    candidates.sort((a, b) => b.priority - a.priority);
    const capped = candidates.slice(0, 40);

    const accountsById: Record<string, any> = {};
    for (const c of capped) {
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
          sources: {
            zoho: true,
            anthropic: false,
            candidatePoolSize: capped.length,
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
    userLines.push(`DAY BUDGET: ${DAY_BUDGET_MIN} min each`);
    userLines.push('');
    userLines.push(`CANDIDATE POOL (${capped.length} stops):`);
    for (const c of capped) {
      const tag = c.tier === 'onboarding' ? 'ONBOARDING' : c.tier === 'training' ? 'TRAINING' : 'CHECK-IN';
      const stale = c.staleDays != null ? ` · stale ${c.staleDays}d` : c.lastVisitDate ? '' : ' · never-visited';
      userLines.push(
        `  • ${c.accountId} — ${c.name} — ${c.city || '(no city)'} — ${tag} · ${c.dwellMin}m${stale} · priority:${c.priority}`,
      );
    }
    userLines.push('');
    userLines.push('TASK: Call build_weekly_plan once. Cluster geographically, respect priority rules, keep day totals under budget.');

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
          sources: {
            zoho: true,
            anthropic: true,
            candidatePoolSize: capped.length,
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
          sources: {
            zoho: true,
            anthropic: false,
            candidatePoolSize: capped.length,
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
