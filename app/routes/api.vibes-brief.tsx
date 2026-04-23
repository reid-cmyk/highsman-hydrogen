import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {claudeTool, isAnthropicConfigured, type ClaudeToolSchema} from '../lib/anthropic';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes Daily Route — Per-Stop AI Brief
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vibes-brief
//   body: {
//     accountId:   string,   // Zoho Account id
//     accountName: string,   // fallback for display
//     tier:        'onboarding' | 'training' | 'checkin'
//   }
//   → { ok, brief: { headline, play, watchFor, closeOn }, sources, warning? }
//
// Serena is a brand rep, not a closer. This brief gives her a 30-second read
// BEFORE she walks into the shop: what this store is, what the goal is today
// for THIS tier, what to watch for, and what to close on.
//
// Voice: Highsman Training Register — declarative, no hedging, Spark Greatness.
//
// Data sources:
//   • Zoho Account — name, address, state, Description, order counts
//   • Zoho Contacts (buyer) — name, Role_Title, Email
//   • Zoho Deals in NEEDS_ONBOARDING pipeline — our prior onboard/training
//     activity (Description carries the signature + tier marker + who booked)
//   • Zoho Notes (Visit_Date) — last-visit signal
//
// Degrades to a deterministic template if ANTHROPIC_API_KEY missing.
// Soft-falls to same template if Claude errors.
// ─────────────────────────────────────────────────────────────────────────────

const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';

type Tier = 'onboarding' | 'training' | 'checkin';

type AccountCtx = {
  id: string;
  name: string;
  city: string;
  state: string;
  description: string;
  totalOrders: number | null;
  firstOrderDate: string | null;
  lastOrderDate: string | null;
  visitDate: string | null;
  industry: string;
  accountType: string;
};

async function fetchAccountCtx(
  id: string,
  token: string,
): Promise<AccountCtx | null> {
  const fields = [
    'Account_Name',
    'Billing_City',
    'Billing_State',
    'Account_State',
    'Industry',
    'Account_Type',
    'Description',
    'Total_Orders_Count',
    'First_Order_Date',
    'Last_Order_Date',
    'Visit_Date',
  ].join(',');
  const res = await fetch(
    `https://www.zohoapis.com/crm/v7/Accounts/${id}?fields=${encodeURIComponent(fields)}`,
    {headers: {Authorization: `Zoho-oauthtoken ${token}`}},
  );
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const a = (data?.data || [])[0];
  if (!a) return null;
  return {
    id,
    name: a.Account_Name || '',
    city: a.Billing_City || '',
    state: a.Account_State || a.Billing_State || '',
    description: a.Description || '',
    totalOrders:
      typeof a.Total_Orders_Count === 'number'
        ? a.Total_Orders_Count
        : a.Total_Orders_Count
          ? Number(a.Total_Orders_Count)
          : null,
    firstOrderDate: a.First_Order_Date || null,
    lastOrderDate: a.Last_Order_Date || null,
    visitDate: a.Visit_Date || null,
    industry: a.Industry || '',
    accountType: a.Account_Type || '',
  };
}

type BuyerCtx = {
  name: string;
  roleTitle: string;
  email: string;
};

async function fetchBuyer(accountId: string, token: string): Promise<BuyerCtx | null> {
  // Pull up to 5 contacts on the account, pick the one tagged Buyer / Manager
  // if present; otherwise return the first one.
  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('criteria', `(Account_Name.id:equals:${accountId})`);
  url.searchParams.set('fields', 'id,First_Name,Last_Name,Full_Name,Email,Role_Title');
  url.searchParams.set('per_page', '5');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  if (rows.length === 0) return null;
  const buyer =
    rows.find((r: any) => {
      const rt = String(r?.Role_Title || '').toLowerCase();
      return rt.includes('buyer') || rt.includes('manager');
    }) || rows[0];
  const full =
    buyer.Full_Name ||
    [buyer.First_Name, buyer.Last_Name].filter(Boolean).join(' ').trim();
  return {
    name: full || '',
    roleTitle: buyer.Role_Title || '',
    email: buyer.Email || '',
  };
}

type DealCtx = {
  id: string;
  dealName: string;
  stage: string;
  closingDate: string | null;
  description: string;
  tier: Tier | null;
  bookedBy: string | null;
  createdTime: string | null;
};

async function fetchRecentVibesDeals(
  accountId: string,
  token: string,
): Promise<DealCtx[]> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `((Account_Name.id:equals:${accountId})and(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE}))`,
  );
  url.searchParams.set(
    'fields',
    'id,Deal_Name,Stage,Closing_Date,Description,Created_Time',
  );
  url.searchParams.set('per_page', '20');
  url.searchParams.set('sort_by', 'Modified_Time');
  url.searchParams.set('sort_order', 'desc');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${token}`},
  });
  if (!res.ok) return [];
  const data = await res.json().catch(() => ({}));
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  return rows.map((r: any) => {
    const desc = String(r?.Description || '');
    let tier: Tier | null = null;
    if (desc.includes(TIER_MARKER_TRAINING)) tier = 'training';
    else if (desc.includes(TIER_MARKER_ONBOARDING)) tier = 'onboarding';
    else if (desc.includes(SALES_FLOOR_SIGNATURE)) tier = 'onboarding'; // legacy unmarked

    // Parse "booked by X." from our signature format.
    let bookedBy: string | null = null;
    const m = /booked by ([^\.\n]+)\./i.exec(desc);
    if (m) bookedBy = m[1].trim();

    return {
      id: r.id,
      dealName: r.Deal_Name || '',
      stage: r.Stage || '',
      closingDate: r.Closing_Date || null,
      description: desc,
      tier,
      bookedBy,
      createdTime: r.Created_Time || null,
    };
  });
}

// ─── Claude tool schema ─────────────────────────────────────────────────────
// Pinned via tool_choice so Claude must return exactly this shape.
// Kept tight: this is a 30-second read for Serena — not a research report.
const BUILD_VIBES_BRIEF_TOOL: ClaudeToolSchema = {
  name: 'build_vibes_brief',
  description:
    'Produce a one-screen tactical brief for Serena (Highsman brand rep) BEFORE she walks into this shop. Ground every claim in provided context.',
  input_schema: {
    type: 'object',
    properties: {
      headline: {
        type: 'string',
        description:
          'One-sentence read on this stop. What is this store, where are we with them, what matters today. Under 22 words. Declarative, no hedging.',
      },
      play: {
        type: 'string',
        description:
          "Serena's play for this visit. 2 sentences max. Tier-specific: ONBOARDING = first impression + buyer rapport + menu walk-through. TRAINING = product education + specific SKU to push + floor-ready script. CHECK-IN = what to ask the buyer, what to restock, what to leave behind. Highsman Training voice: declarative, assumptive.",
      },
      watchFor: {
        type: 'array',
        minItems: 0,
        maxItems: 3,
        items: {type: 'string'},
        description:
          '0–3 specific things to watch for on this visit. Inferred from context (previous notes, order pattern, stale days). Short — under 14 words each. Empty array if nothing context-specific.',
      },
      closeOn: {
        type: 'string',
        description:
          'Exact closing move — what Serena leaves with. Assumptive, never permissioning. 1 sentence. E.g. "Lock the two-pack reorder and book a floor set for next Tuesday."',
      },
      productFocus: {
        type: 'array',
        minItems: 1,
        maxItems: 3,
        items: {
          type: 'string',
          enum: ['Hit Stick', 'Triple Infused Pre-Rolls', 'Ground Game', 'Triple Threat'],
        },
        description:
          '1–3 Highsman products to lead with on this visit. Pick based on tier + store context. Use EXACT product names.',
      },
    },
    required: ['headline', 'play', 'watchFor', 'closeOn', 'productFocus'],
  },
};

// ─── System prompt — Highsman Training Register ────────────────────────────
const SYSTEM_PROMPT = `You are the Highsman Vibes Team AI Coach.

Your job: produce 30-second tactical briefs for Serena, a Highsman brand rep working NJ dispensaries Tuesday/Wednesday/Thursday. She visits stores to onboard new buyers, train budtenders, and maintain relationships.

VOICE — Highsman Training Register:
- Declarative, confident, no hedging. Never use "could", "might", "maybe", "perhaps", "consider", "would you like".
- Assumptive close style: "Lock the reorder." not "You might want to suggest a reorder."
- Ricky Williams founded Highsman. Spark Greatness™ is the tagline.
- Products:
  • Hit Stick — 0.5g disposable, on-the-go, entry SKU, easiest first yes
  • Triple Infused Pre-Rolls — 1.2g, Microstructure infusion (Live Resin + Diamonds + interior kief), sharing/heavy sessions, the closest thing to hash in a pre-roll format
  • Ground Game — 7g shake, roll-your-own, versatile
  • Triple Threat — the three-pack of Triple Infused pre-rolls
- Never call products "artisan" or "small batch". No medical framing.

TIER DEFINITIONS:
- ONBOARDING (Tier 1): First-ever brand visit. Goal = buyer rapport, menu walk-through, leave goodies, schedule the Training visit. 60 min dwell.
- TRAINING (Tier 2): Budtender education. Goal = teach Microstructure infusion, arm staff with floor-ready scripts, drop sample pack. 60 min dwell.
- CHECK-IN (Tier 3): 30-day maintenance rotation. Goal = buyer pulse, restock goodies, read the shelf, capture intel. 30 min dwell.

DISCIPLINE:
- Ground every claim in the context block. If there's no prior history, say so — do not invent past interactions.
- Watch-fors must be inferred from actual context (order gaps, notes, stale days). Return empty array if nothing stands out.
- Close must be tier-appropriate: Onboarding = book the Training. Training = lock the next order + tag a regular budtender as point-person. Check-In = restock + confirm reorder timing.

OUTPUT: Call the build_vibes_brief tool exactly once. No free-form text.`;

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

function buildClaudeContext(args: {
  account: AccountCtx;
  buyer: BuyerCtx | null;
  deals: DealCtx[];
  tier: Tier;
}): string {
  const {account, buyer, deals, tier} = args;
  const today = new Date();
  const todayIso = today.toISOString();

  const lines: string[] = [];
  lines.push(`TODAY: ${todayIso}`);
  lines.push(`REP: Serena (Highsman Vibes Team — NJ brand rep, Tue/Wed/Thu)`);
  lines.push(`TIER FOR THIS STOP: ${tier.toUpperCase()}`);
  lines.push('');
  lines.push('STORE:');
  lines.push(`  name: ${account.name}`);
  lines.push(`  city/state: ${account.city || '(unknown city)'}, ${account.state || '(unknown state)'}`);
  if (account.accountType) lines.push(`  account_type: ${account.accountType}`);
  if (account.industry) lines.push(`  industry: ${account.industry}`);
  lines.push(
    `  lifetime_orders: ${account.totalOrders ?? 0}` +
      (account.firstOrderDate ? ` (first: ${account.firstOrderDate})` : '') +
      (account.lastOrderDate ? ` (last: ${account.lastOrderDate})` : ''),
  );
  if (account.visitDate) {
    const vd = new Date(account.visitDate);
    const days = isNaN(vd.getTime()) ? null : daysBetween(today, vd);
    lines.push(
      `  last_brand_visit: ${account.visitDate}${
        days != null ? ` (${days} days ago)` : ''
      }`,
    );
  } else {
    lines.push('  last_brand_visit: (none on record — never visited)');
  }
  if (account.description && account.description.trim()) {
    lines.push(
      `  crm_notes: ${account.description.trim().replace(/\s+/g, ' ').slice(0, 600)}`,
    );
  }
  lines.push('');

  // Buyer
  lines.push('BUYER:');
  if (!buyer) {
    lines.push('  (no buyer contact on record — Serena should identify decision-maker on arrival)');
  } else {
    lines.push(`  name: ${buyer.name || '(no name)'}`);
    if (buyer.roleTitle) lines.push(`  role: ${buyer.roleTitle}`);
    if (buyer.email) lines.push(`  email: ${buyer.email}`);
  }
  lines.push('');

  // Prior Vibes activity — open + closed deals in the NEEDS_ONBOARDING pipeline
  lines.push('PRIOR VIBES ACTIVITY (onboarding/training deals):');
  if (deals.length === 0) {
    lines.push('  (no prior onboarding or training deals — this is a fresh relationship for the Vibes team)');
  } else {
    for (const d of deals.slice(0, 10)) {
      const created = d.createdTime
        ? new Date(d.createdTime).toISOString().slice(0, 10)
        : 'unknown';
      const tierTag = d.tier ? d.tier.toUpperCase() : 'UNCATEGORIZED';
      const close = d.closingDate ? ` (target ${d.closingDate})` : '';
      const who = d.bookedBy ? ` by ${d.bookedBy}` : '';
      lines.push(`  • [${created}] ${tierTag} — ${d.dealName} — stage:${d.stage}${close}${who}`);
    }
  }
  lines.push('');

  // Tier-specific task framing
  lines.push('TASK:');
  if (tier === 'onboarding') {
    lines.push(
      '  This is the FIRST Highsman brand visit. Serena needs to introduce Highsman, walk the buyer through the menu (Hit Stick, Triple Infused Pre-Rolls, Ground Game), leave the $60 goodies kit, and BOOK the Training visit. Close = Training booked on a specific day.',
    );
  } else if (tier === 'training') {
    lines.push(
      '  Training visit — Serena educates the budtender staff. Teach Microstructure infusion (what makes Triple Infused different from surface-coated competitors). Arm them with the floor-ready script. Drop sample pack. Close = budtenders can pitch Highsman unprompted + buyer confirms a reorder.',
    );
  } else {
    lines.push(
      '  30-day check-in. Serena keeps the relationship warm, restocks goodies, reads the shelf to see what is moving, and captures intel. Close = confirm next reorder timing + flag any issues Sky needs to handle.',
    );
  }
  lines.push('');
  lines.push('OUTPUT: Call the build_vibes_brief tool once. Ground every claim in the context above.');

  return lines.join('\n');
}

function buildFallbackBrief(account: AccountCtx, tier: Tier): any {
  const store = account.name || 'this shop';
  if (tier === 'onboarding') {
    return {
      headline: `First Highsman visit at ${store} — introduce the brand and book the Training.`,
      play:
        'Walk the buyer through the menu: Hit Stick as the first yes, Triple Infused Pre-Rolls as the flagship, Ground Game for versatility. Leave the goodies kit and lock the Training date before you leave.',
      watchFor: [],
      closeOn: 'Book the Training visit on a specific Tue/Wed/Thu within 10 days.',
      productFocus: ['Hit Stick', 'Triple Infused Pre-Rolls', 'Ground Game'],
      _fallback: true,
    };
  }
  if (tier === 'training') {
    return {
      headline: `Training day at ${store} — arm the budtenders with the Triple Infused pitch.`,
      play:
        'Teach Microstructure infusion — Highsman spins Live Resin, Diamonds, and interior kief into the flower so it burns like hash. Drop the sample pack and run the 30-second floor script with every budtender on shift.',
      watchFor: [],
      closeOn: 'Lock a reorder with the buyer and tag a lead budtender as point-person for questions.',
      productFocus: ['Triple Infused Pre-Rolls', 'Hit Stick', 'Triple Threat'],
      _fallback: true,
    };
  }
  return {
    headline: `30-day check-in at ${store} — keep the relationship warm and read the shelf.`,
    play:
      'Restock the goodies, scan the display to see what is moving, and get a pulse from the buyer on reorder timing. Capture intel Sky needs to act on.',
    watchFor: [],
    closeOn: 'Confirm next reorder timing and flag any service issues for Sky.',
    productFocus: ['Hit Stick', 'Triple Infused Pre-Rolls'],
    _fallback: true,
  };
}

function isValidTier(v: any): v is Tier {
  return v === 'onboarding' || v === 'training' || v === 'checkin';
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = (context as any).env || {};

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const accountId = String(body?.accountId || '').trim();
  const accountName = String(body?.accountName || '').trim();
  const tier = isValidTier(body?.tier) ? (body.tier as Tier) : null;

  if (!accountId || !/^\d{6,}$/.test(accountId)) {
    return json({ok: false, error: 'invalid accountId'}, {status: 400});
  }
  if (!tier) {
    return json(
      {ok: false, error: 'tier must be onboarding|training|checkin'},
      {status: 400},
    );
  }

  try {
    const token = await getZohoToken(env);

    // Parallel pulls — account, buyer, deals.
    const [account, buyer, deals] = await Promise.all([
      fetchAccountCtx(accountId, token),
      fetchBuyer(accountId, token).catch(() => null),
      fetchRecentVibesDeals(accountId, token).catch(() => []),
    ]);

    if (!account) {
      // Still return a minimal brief — /vibes/today should never show a blank
      // card just because the Zoho call flaked.
      const stub: AccountCtx = {
        id: accountId,
        name: accountName || 'this shop',
        city: '',
        state: '',
        description: '',
        totalOrders: null,
        firstOrderDate: null,
        lastOrderDate: null,
        visitDate: null,
        industry: '',
        accountType: '',
      };
      const brief = buildFallbackBrief(stub, tier);
      brief._fallbackReason = 'Zoho account not found';
      return json(
        {ok: true, brief, sources: {zoho: false, anthropic: false}},
        {headers: {'Cache-Control': 'no-store'}},
      );
    }

    const sources = {
      zoho: true,
      anthropic: isAnthropicConfigured(env),
      hasBuyer: !!buyer,
      dealCount: deals.length,
      hasVisitDate: !!account.visitDate,
    };

    if (!isAnthropicConfigured(env)) {
      const brief = buildFallbackBrief(account, tier);
      brief._fallbackReason = 'Anthropic API key not configured';
      return json(
        {ok: true, brief, sources},
        {headers: {'Cache-Control': 'no-store'}},
      );
    }

    const userContent = buildClaudeContext({account, buyer, deals, tier});

    try {
      const result = await claudeTool<any>({
        apiKey: env.ANTHROPIC_API_KEY!,
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        system: SYSTEM_PROMPT,
        user: userContent,
        tool: BUILD_VIBES_BRIEF_TOOL,
        maxTokens: 900,
        temperature: 0.35,
        timeoutMs: 22000,
      });
      return json(
        {
          ok: true,
          brief: result.input || {},
          sources,
          usage: result.usage,
        },
        {headers: {'Cache-Control': 'no-store'}},
      );
    } catch (err: any) {
      console.warn('[vibes-brief] Claude failed, falling back:', err.message);
      const brief = buildFallbackBrief(account, tier);
      brief._fallbackReason = `Claude error: ${err.message}`;
      return json(
        {ok: true, brief, sources, warning: err.message},
        {headers: {'Cache-Control': 'no-store'}},
      );
    }
  } catch (err: any) {
    console.error('[vibes-brief] failed', accountId, err.message);
    return json(
      {ok: false, error: err.message || 'brief failed'},
      {status: 502},
    );
  }
}
