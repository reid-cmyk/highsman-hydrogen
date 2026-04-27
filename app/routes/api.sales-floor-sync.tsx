import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, type SalesRep} from '../lib/sales-floor-reps';
import {getAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor CRM Sync — Server-side API Route
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-sync
//   → { leads: [...], deals: [...], accounts: [...], meta: {...} }
//
// Single combined endpoint the /sales-floor dashboard calls instead of making
// 3 separate round-trips from the browser. Keeps Zoho creds server-side and
// folds 3 parallel Zoho requests into one worker response.
//
// Shapes preserved exactly to match what app.js renderers already expect:
//   Lead    → { id, _fullName, First_Name, Last_Name, Company, Email, Phone,
//               _status: 'hot'|'warm'|'new'|'cold', Lead_Status, Lead_Source,
//               Description, State, Market_State, _state, Modified_Time }
//               NOTE: `Market_State` is Highsman's custom "Market State" picklist
//               (Zoho api_name `States`), a clean 2-letter code. `_state` is the
//               canonical code the client's state-filter tabs key off — prefers
//               Market_State, falls back to the address State field.
//   Deal    → { id, Deal_Name, Account_Name, Stage, Amount, Closing_Date }
//   Account → { Id, Account_Name, Industry, Billing_City, Billing_State,
//               Account_State, Shipping_State, _state,
//               Total_Orders_Count, First_Order_Date, Last_Order_Date,
//               First_Order_Number, _orderCount,
//               Phone, contacts: Contact[], buyer: Contact|null }
//               NOTE: `_state` is the canonical 2-letter code the client's
//               state-filter tabs key off of. Highsman's Zoho has three state
//               fields and they drift out of sync — Account_State (picklist,
//               always a clean 2-letter code) is the authoritative signal and
//               Billing_State/Shipping_State are only consulted as fallbacks.
//               Historical bug: the dashboard filtered by Billing_State alone
//               and lost ~9/10 RI accounts because Billing_State was either
//               "Rhode Island" (long form) or null on most records.
//               NOTE: `_orderCount` is Highsman's custom "Orders Count" field
//               (api_name `Total_Orders_Count`) maintained by the
//               LeafLink→Zoho integration. This is the source of truth for
//               "does this account have orders?" — the Accounts tab filters
//               to >= 1. LeafLink is NOT the source (it only polls Canfections
//               NJ; MO/NY/RI orders would disappear). LeafLink still owns
//               ship date + order confirmation on the Orders Due / New
//               Customers cards. `Order_Count` (singular) is a legacy duplicate
//               field — do not use.
//   Contact → { id, _fullName, Email, Phone, Mobile, Title, Role_Title,
//               _jobRole, _accountId, _accountName }
//               NOTE: "Job Role" in Zoho's UI has api_name `Role_Title`.
//               `_jobRole` is the client-friendly normalized alias we read
//               for buyer detection — Title / Job_Title are never used.
//
// MA accounts are hard-filtered out before the response is built (Reid's
// request — sales-floor doesn't surface Massachusetts for now).
//
// Buyer detection: per-account `buyer` is set by pickBuyer(), which prefers
// an exact case-insensitive match on "Purchasing & Inventory Management" and
// falls back to any role containing buyer / purchas / inventory.
//
// Per-rep scoping: the caller's rep is resolved from the sales_floor_rep
// cookie (see app/lib/sales-floor-reps.ts). If the rep has a zohoOwnerId set
// in the registry, every Zoho query is filtered by Owner.id so the dashboard
// only returns that rep's book. Sky currently runs unfiltered — flip his
// zohoOwnerId in the registry to enable scoping.
//
// Graceful degradation: if env vars are missing or Zoho fails, returns empty
// arrays (200) with { ok:false, error:'...' } so the client can fall back to
// demo data without breaking the UI.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Zoho Lead_Status → hot / warm / new / cold ──────────────────────────────
function normalizeLeadStatus(raw: string | null | undefined): 'hot' | 'warm' | 'new' | 'cold' {
  const s = (raw || '').toLowerCase();
  if (['qualified', 'hot', 'ready to buy'].includes(s)) return 'hot';
  if (['working - contacted', 'contact in future', 'warm', 'nurturing'].includes(s)) return 'warm';
  if (['unqualified', 'junk lead', 'cold', 'lost lead'].includes(s)) return 'cold';
  // Default for "not contacted", "attempted to contact", "contacted", "pre-qualified",
  // anything custom, or empty.
  return 'new';
}

function fullName(l: any): string {
  return `${l.First_Name || ''} ${l.Last_Name || ''}`.trim() || l.Company || 'Unknown Lead';
}

// When a rep has a zohoOwnerId, we fetch records scoped to that owner via the
// /search endpoint with a COQL-style criteria string. Owner filtering through
// the generic list endpoint doesn't work — Zoho only honors criteria on
// /search or through `view_id`. We intentionally use /search here (no word
// query, just criteria) to keep per-rep scoping consistent across modules.
function ownerCriteria(ownerId: string): string {
  return `(Owner.id:equals:${ownerId})`;
}

// Decide list-vs-search URL + query params based on whether a rep filter is in
// play. Keeps the call sites below readable.
function zohoModuleUrl(
  module: string,
  ownerId: string | null,
  fields: string[],
  perPage: number,
  page: number = 1,
): URL {
  const base = ownerId
    ? `https://www.zohoapis.com/crm/v7/${module}/search`
    : `https://www.zohoapis.com/crm/v7/${module}`;
  const url = new URL(base);
  url.searchParams.set('fields', fields.join(','));
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('page', String(page));
  url.searchParams.set('sort_by', 'Modified_Time');
  url.searchParams.set('sort_order', 'desc');
  if (ownerId) url.searchParams.set('criteria', ownerCriteria(ownerId));
  return url;
}

// Loop through Zoho pages until `more_records` flips false or we hit MAX_PAGES.
// The accounts module alone has 400+ records across 3+ pages once MA is filtered
// in — without this, most of RI, MO, and anything older than Feb 2026 falls off.
// Zoho v7 list endpoints cap at 200/page; 10 pages × 200 = 2000 records ceiling,
// which comfortably covers the full Highsman book for every module right now.
const MAX_PAGES = 10;

async function fetchAllPages(
  module: string,
  ownerId: string | null,
  fields: string[],
  perPage: number,
  accessToken: string,
): Promise<any[]> {
  const collected: any[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = zohoModuleUrl(module, ownerId, fields, perPage, page);
    const res = await fetch(url.toString(), {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
    });
    if (res.status === 204) break;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Zoho ${module} fetch p${page} failed (${res.status}): ${text.slice(0, 300)}`);
    }
    const data = await res.json();
    const rows = Array.isArray(data.data) ? data.data : [];
    collected.push(...rows);
    // `info.more_records` is the canonical "there's another page" signal in
    // v7. Break as soon as Zoho tells us we're done to avoid a wasted fetch.
    if (!data.info?.more_records) break;
  }
  return collected;
}

// ─── Zoho fetchers ───────────────────────────────────────────────────────────
async function fetchLeads(accessToken: string, ownerId: string | null) {
  const rows = await fetchAllPages(
    'Leads',
    ownerId,
    [
      'First_Name',
      'Last_Name',
      'Email',
      'Phone',
      'Mobile',
      'Company',
      'Lead_Status',
      'Lead_Source',
      'Description',
      // State + City are the legacy address fields. Market_State (api_name
      // `States`) is Highsman's custom "Market State" picklist — always a clean
      // 2-letter code, which is why it's the authoritative signal for the
      // /sales-floor state filter tabs. The address `State` is kept as a
      // fallback for records predating the picklist rollout.
      'State',
      'States',
      'City',
      'Modified_Time',
      'Created_Time',
      // Phase B — claim/TTL. Floor PWA renders owner pill + TTL chip off these.
      'Working_Owner',
      'Working_Claimed_At',
      'Working_Last_Activity_At',
      // Phase D — LinkedIn deep-link pill.
      'LinkedIn_URL',
    ],
    200,
    accessToken,
  );
  return rows
    // Drop leads whose Company starts with "Test" (same rule we use for
    // accounts) so throwaway seeded records don't clutter the Leads tab.
    .filter((l: any) => !isTestName(l.Company))
    // Drop leads with no email AND no phone AND no mobile — a lead with
    // zero contact methods is useless on the Sales Floor (can't call,
    // can't text, can't email), so we hide it. Record stays in Zoho; we
    // just don't surface it to the rep.
    .filter((l: any) => {
      const email = String(l.Email || '').trim();
      const phone = String(l.Phone || '').trim();
      const mobile = String(l.Mobile || '').trim();
      return Boolean(email || phone || mobile);
    })
    .map((l: any) => ({
    id: l.id,
    First_Name: l.First_Name || '',
    Last_Name: l.Last_Name || '',
    _fullName: fullName(l),
    Email: l.Email || '',
    Phone: l.Phone || l.Mobile || '',
    Company: l.Company || '',
    Lead_Status: l.Lead_Status || '',
    _status: normalizeLeadStatus(l.Lead_Status),
    Lead_Source: l.Lead_Source || '',
    Description: l.Description || '',
    State: l.State || '',
    // `States` is Zoho's api_name for the custom "Market State" picklist.
    // Renamed on our shape to `Market_State` so the client doesn't read a
    // plural field name that looks like a typo.
    Market_State: l.States || '',
    // Canonical 2-letter code the client state-filter tabs read. Market State
    // wins because it's always clean; address State is the fallback for
    // legacy records where the picklist is blank.
    _state: normalizeStateCode(l.States) || normalizeStateCode(l.State) || '',
    City: l.City || '',
    Modified_Time: l.Modified_Time || null,
    // Phase B — claim/TTL. Empty strings / null when the lead is in the open pool.
    Working_Owner: String(l.Working_Owner || '').trim(),
    Working_Claimed_At: l.Working_Claimed_At || null,
    Working_Last_Activity_At: l.Working_Last_Activity_At || null,
    // Phase D — LinkedIn deep-link pill.
    LinkedIn_URL: String(l.LinkedIn_URL || '').trim(),
  }));
}

async function fetchDeals(accessToken: string, ownerId: string | null) {
  const rows = await fetchAllPages(
    'Deals',
    ownerId,
    ['Deal_Name', 'Account_Name', 'Stage', 'Amount', 'Closing_Date', 'Contact_Name', 'Description'],
    200,
    accessToken,
  );
  return rows
    // Drop deals whose linked Account name or Deal_Name starts with "Test" so
    // throwaway pipeline records don't leak onto the dashboard.
    .filter((d: any) => {
      const acct = typeof d.Account_Name === 'object'
        ? d.Account_Name?.name || ''
        : d.Account_Name || '';
      return !isTestName(acct) && !isTestName(d.Deal_Name);
    })
    .map((d: any) => ({
    id: d.id,
    Deal_Name: d.Deal_Name || '',
    // Zoho returns lookup fields as objects {name, id}; flatten to the string app.js uses.
    Account_Name: typeof d.Account_Name === 'object' ? d.Account_Name?.name || '' : d.Account_Name || '',
    // Preserve the linked Account's id alongside the flattened name so the
    // first-order-number enrichment below can match a Deal to its Account
    // without relying on fuzzy name comparison.
    _accountId: typeof d.Account_Name === 'object' ? (d.Account_Name?.id || '') : '',
    Stage: d.Stage || '',
    Amount: d.Amount || 0,
    Closing_Date: d.Closing_Date || '',
    Contact_Name: typeof d.Contact_Name === 'object' ? d.Contact_Name?.name || '' : d.Contact_Name || '',
    Description: d.Description || '',
  }));
}

// ─── First-order number enrichment ───────────────────────────────────────────
// For each Account where _orderCount === 1 we surface the LeafLink order
// number on the "New Customers" card. Highsman doesn't keep a dedicated
// Order_Number field anywhere — the LeafLink→Zoho integration encodes it in
// the Deal_Name string with the pattern `{Account_Name} - Order #{N}`. This
// pass walks the already-fetched deals array (so we don't spend a round-trip
// per account) and picks the earliest Deal for each first-order account.
const ORDER_NUMBER_PATTERN = /-\s*Order\s*#(\d+)\b/i;

function parseOrderNumberFromDealName(name: string | null | undefined): string {
  const m = ORDER_NUMBER_PATTERN.exec(String(name || ''));
  return m && m[1] ? m[1] : '';
}

// Returns a Map<accountId, {orderNumber, closingDate}> for accounts whose
// single Deal we can identify from the deals array. Accounts without a
// matching Deal (or where the Deal_Name doesn't carry "#N") are absent from
// the map and the client just renders the date-only line.
function buildFirstOrderIndex(deals: any[]): Map<string, {orderNumber: string; closingDate: string}> {
  const byAcct = new Map<string, any[]>();
  for (const d of deals) {
    const acctId = d._accountId || '';
    if (!acctId) continue;
    if (!byAcct.has(acctId)) byAcct.set(acctId, []);
    byAcct.get(acctId)!.push(d);
  }
  const out = new Map<string, {orderNumber: string; closingDate: string}>();
  for (const [acctId, list] of byAcct.entries()) {
    // Earliest Closing_Date wins — that's the first order. Deals with a blank
    // Closing_Date sort to the bottom so we don't pick a stub over a real
    // closed deal.
    const sorted = list.slice().sort((a, b) => {
      const ad = a.Closing_Date || '9999-12-31';
      const bd = b.Closing_Date || '9999-12-31';
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    });
    // Prefer a Deal whose name actually carries "Order #N" — fall back to the
    // earliest Deal otherwise so we still surface date context even without
    // a number.
    const withNumber = sorted.find((d) => parseOrderNumberFromDealName(d.Deal_Name));
    const chosen = withNumber || sorted[0];
    if (!chosen) continue;
    out.set(acctId, {
      orderNumber: parseOrderNumberFromDealName(chosen.Deal_Name),
      closingDate: chosen.Closing_Date || '',
    });
  }
  return out;
}

function attachFirstOrderNumbers(accounts: any[], deals: any[]) {
  const index = buildFirstOrderIndex(deals);
  for (const a of accounts) {
    if (Number(a._orderCount || 0) !== 1) continue;
    const hit = index.get(a.id);
    if (!hit) continue;
    if (hit.orderNumber) a.First_Order_Number = hit.orderNumber;
    // If First_Order_Date wasn't populated on the Account, use the Deal's
    // Closing_Date as a fallback so the card always has something to show.
    if (!a.First_Order_Date && hit.closingDate) a.First_Order_Date = hit.closingDate;
  }
  return accounts;
}


// ─── Auto-clear stale Pete flags on reorder ───────────────────────────────
// Mirrors the rule in api.new-business-followups: if a flagged account has
// a Last_Order_Date within the AUTO_CLEAR_WINDOW_DAYS = 14 day window,
// Pete's chase is done — clear the pete-followup tag on Zoho AND flip the
// in-memory _flaggedForPete flag to false so Sky's card re-renders the
// 'Flag Pete' pill (unlocked) instead of 'On Pete' (locked).
//
// Fire-and-forget on the Zoho remove_tags call so the dashboard load isn't
// gated on the round-trip — even if the API hiccups, the UI is correct
// because we updated the in-memory flag.
const PETE_FOLLOWUP_TAG = 'pete-followup';
const AUTO_CLEAR_WINDOW_DAYS = 14;
function autoClearStalePeteFlags(
  accounts: any[],
  accessToken: string,
): void {
  const cutoffMs = Date.now() - AUTO_CLEAR_WINDOW_DAYS * 86400 * 1000;
  const toClear: string[] = [];
  for (const a of accounts) {
    if (!a._flaggedForPete) continue;
    const lastOrder = a.Last_Order_Date;
    if (!lastOrder) continue;
    const t = new Date(`${lastOrder}T00:00:00Z`).getTime();
    if (Number.isNaN(t)) continue;
    if (t >= cutoffMs) {
      // Account reordered recently — clear the flag.
      a._flaggedForPete = false;
      toClear.push(a.id);
    }
  }
  if (toClear.length === 0) return;
  // Fire-and-forget tag removal so Zoho stops returning these tagged on
  // future Pete pulls. UI is already correct because we mutated in-memory.
  Promise.all(
    toClear.map((id) =>
      fetch(
        `https://www.zohoapis.com/crm/v7/Accounts/${encodeURIComponent(id)}/actions/remove_tags`,
        {
          method: 'POST',
          headers: {
            Authorization: `Zoho-oauthtoken ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({tags: [{name: PETE_FOLLOWUP_TAG}]}),
        },
      ).catch(() => {}),
    ),
  ).catch(() => {});
}

// ─── Vibes booked-state attachment (Tier 1 + Tier 2) ─────────────────────────
// After a rep clicks Brand Team Onboarding OR Training on a card, we want the
// card to stay visible (so the rep can still call/text/email the buyer) but
// switch into a "booked" visual state instead of disappearing. The source of
// truth is whether the account has a signed Sales Floor deal in the Needs
// Onboarding pipeline — same signature the Vibes board filters on. Fetching
// those deals up front and stamping per-tier flags onto matching accounts
// lets the card survive across reloads without any extra client roundtrips.
//
// Tier 1 ONBOARDING and Tier 2 TRAINING are distinguished via the [TIER:X]
// marker in Description. An account can have both booked at once (onboarded,
// then training scheduled) — we track them separately so the card can show
// two pills and hide both CTAs independently.
//
// Tier 3 CHECK-IN is NOT represented in Zoho deals — it's auto-derived by
// the /vibes route builder from last-visit cadence. Sales-floor card UI
// doesn't need a Tier 3 state (Sky can't trigger it).
const NEEDS_ONBOARDING_PIPELINE = '6699615000010154308';
const SALES_FLOOR_SIGNATURE = 'Auto-created from /sales-floor';
const TIER_MARKER_ONBOARDING = '[TIER:ONBOARDING]';
const TIER_MARKER_TRAINING = '[TIER:TRAINING]';
// Sub-marker on Tier 1 deals that came from the New Product Onboarding
// button (existing accounts, new SKU walkthrough). When present, the deal
// is bucketed separately from a first-customer onboarding so the card can
// show a distinct "Product Onboarding Booked" pill without flipping the
// generic Brand Team Onboarding state.
const KIND_MARKER_PRODUCT = '[KIND:PRODUCT]';

type VibesBookedEntry = {
  dealId: string;
  tier: 'onboarding' | 'training' | 'product_onboarding';
  // Onboarding → 12-day check-in date.
  // Training → target visit date.
  // Product onboarding → predicted Closing_Date.
  // All three surface as their own _*Date on cards.
  dateLabel: string | null;
};

async function fetchSalesFloorVibesDeals(
  accessToken: string,
): Promise<{
  onboarding: Map<string, VibesBookedEntry>;
  training: Map<string, VibesBookedEntry>;
  productOnboarding: Map<string, VibesBookedEntry>;
}> {
  // One search call, signature-filtered in memory. Deals/search supports the
  // Pipeline criteria directly; we can't filter on Description text in the
  // criteria (Zoho doesn't index it) so we do it client-side.
  const url = new URL('https://www.zohoapis.com/crm/v7/Deals/search');
  url.searchParams.set(
    'criteria',
    `(Pipeline:equals:${NEEDS_ONBOARDING_PIPELINE})`,
  );
  url.searchParams.set(
    'fields',
    ['id', 'Account_Name', 'Description', 'Closing_Date'].join(','),
  );
  url.searchParams.set('per_page', '200');
  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  const onboarding = new Map<string, VibesBookedEntry>();
  const training = new Map<string, VibesBookedEntry>();
  const productOnboarding = new Map<string, VibesBookedEntry>();
  if (!res.ok) return {onboarding, training, productOnboarding};
  const data: any = await res.json().catch(() => ({}));
  const rows: any[] = Array.isArray(data?.data) ? data.data : [];
  for (const row of rows) {
    const desc = typeof row?.Description === 'string' ? row.Description : '';
    if (!desc.includes(SALES_FLOOR_SIGNATURE)) continue;
    const acctId = row?.Account_Name?.id ? String(row.Account_Name.id) : '';
    if (!acctId) continue;
    const dealId = String(row.id || '');
    // Bucketing order: PRODUCT first (Tier 1 + KIND:PRODUCT), then TRAINING
    // (Tier 2), then default ONBOARDING. Product onboarding is checked
    // first because a [KIND:PRODUCT] deal also carries [TIER:ONBOARDING],
    // and we don't want it falling into the generic onboarding bucket and
    // flipping the Brand Team Onboarding pill on a card that's actually
    // booked for a new-SKU walkthrough.
    if (desc.includes(KIND_MARKER_PRODUCT)) {
      // Product onboarding — closing date is the predicted ramp-week date
      // or 7 days out, whichever is later. Surface as the booked label.
      const dateLabel = row?.Closing_Date || null;
      if (!productOnboarding.has(acctId)) {
        productOnboarding.set(acctId, {
          dealId,
          tier: 'product_onboarding',
          dateLabel,
        });
      }
    } else if (desc.includes(TIER_MARKER_TRAINING)) {
      const match = desc.match(/Target visit:\s*on or before\s*(\d{4}-\d{2}-\d{2})/i);
      const dateLabel = match ? match[1] : row?.Closing_Date || null;
      if (!training.has(acctId)) {
        training.set(acctId, {dealId, tier: 'training', dateLabel});
      }
    } else {
      // Onboarding (explicit [TIER:ONBOARDING] or legacy unmarked deal).
      // Legacy deals (pre-v2) have no tier marker — bucket them as
      // onboarding because every pre-v2 signed deal came from the original
      // onboarding button. Falls under the "when in doubt, keep the
      // behavior that was shipping before" rule.
      const match = desc.match(/12-day check-in due:\s*(\d{4}-\d{2}-\d{2})/);
      const dateLabel = match ? match[1] : null;
      if (!onboarding.has(acctId)) {
        onboarding.set(acctId, {dealId, tier: 'onboarding', dateLabel});
      }
    }
  }
  return {onboarding, training, productOnboarding};
}

function attachVibesBookedStatus(
  accounts: any[],
  booked: {
    onboarding: Map<string, VibesBookedEntry>;
    training: Map<string, VibesBookedEntry>;
    productOnboarding: Map<string, VibesBookedEntry>;
  },
) {
  for (const a of accounts) {
    const onb = booked.onboarding.get(a.id);
    const trn = booked.training.get(a.id);
    const prod = booked.productOnboarding.get(a.id);
    if (onb) {
      // Legacy flag the client already reads — keep for backward compat
      // (markZohoReadyToBrandTeam sets this same flag optimistically).
      a._vibesBooked = true;
      a._vibesDealId = onb.dealId;
      a._checkInDueDate = onb.dateLabel;
      a._onboardingBooked = true;
    }
    if (trn) {
      a._trainingBooked = true;
      a._trainingDealId = trn.dealId;
      a._trainingDate = trn.dateLabel;
    }
    if (prod) {
      // markNewProductOnboarding sets these flags optimistically; this
      // attaches the authoritative state from a signed deal so the booked
      // pill survives a refresh.
      a._productOnboardBooked = true;
      a._productOnboardDealId = prod.dealId;
      a._productOnboardDate = prod.dateLabel;
    }
  }
  return accounts;
}

// MA-state filter shared by the Accounts + Contacts fetchers. Reid asked us to
// hide MA from the sales-floor for now — easiest place to do it is right after
// the Zoho fetch so downstream views never see them. We check both 'MA' (the
// 2-letter code Highsman uses everywhere) and 'Massachusetts' just in case
// some legacy records have the long form.
const EXCLUDED_STATES = new Set(['MA', 'Massachusetts']);

function isExcludedState(state: string | null | undefined): boolean {
  return EXCLUDED_STATES.has(String(state || '').trim());
}

// Normalize whatever state value we're handed — "Rhode Island", "rhode island",
// "RI", "ri" — down to a clean 2-letter uppercase code. Mirrors the client-side
// normalizeStateCode() in public/sales-floor/js/app.js so server + client agree
// on what "the state" is. Anything we can't resolve comes back as '' so the
// caller can fall through to another field.
const LONG_TO_CODE: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS', missouri: 'MO',
  montana: 'MT', nebraska: 'NE', nevada: 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND',
  ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
  'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY', 'district of columbia': 'DC',
};

function normalizeStateCode(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const lower = s.toLowerCase();
  if (LONG_TO_CODE[lower]) return LONG_TO_CODE[lower];
  if (/^[A-Za-z]{2}$/.test(s)) return s.toUpperCase();
  return '';
}

// Authoritative state resolver. Highsman's Zoho keeps three state fields on
// each Account and they routinely drift out of sync:
//   Account_State    — custom picklist, always a clean 2-letter code
//   Billing_State    — free-text, mix of "Rhode Island" / "RI" / null
//   Shipping_State   — free-text, same mess
// Account_State is the only reliably normalized field, so prefer it first.
// Billing_State is the historical fallback (what the UI used to filter on).
// Shipping_State is the last resort for records that have no billing address
// but were entered via a warehouse-shipping flow.
function resolveAccountState(a: any): string {
  return (
    normalizeStateCode(a.Account_State) ||
    normalizeStateCode(a.Billing_State) ||
    normalizeStateCode(a.Shipping_State) ||
    ''
  );
}

// Test-record filter — drops anything whose name begins with "test" as a whole
// word ("Test", "Test Dispensary", "TEST-ACCOUNT", "test 123"). Uses a
// negative-lookahead on the next char so real names like "Testament" or
// "Tester" don't get caught. Applied to Account_Name and Lead Company so the
// rep's dashboard never has to scroll past throwaway records Reid or ops
// seeded in Zoho while building workflows.
function isTestName(name: string | null | undefined): boolean {
  const n = String(name || '').trim();
  if (!n) return false;
  return /^test(?![a-z])/i.test(n);
}

async function fetchAccounts(accessToken: string, ownerId: string | null) {
  const rows = await fetchAllPages(
    'Accounts',
    ownerId,
    [
      'Account_Name',
      'Phone',
      'Website',
      'Industry',
      'Annual_Revenue',
      'Billing_Street',
      'Billing_City',
      'Billing_State',
      // Account_State is the custom picklist ("Account State" in the Zoho UI)
      // that Highsman ops uses as the canonical state signal — always a clean
      // 2-letter code. Billing_State is frequently the long form or null, so
      // filtering on Billing_State alone was silently hiding records.
      'Account_State',
      'Shipping_State',
      'Account_Type',
      'Description',
      'Modified_Time',
      // Order-tracking custom fields maintained by the LeafLink→Zoho
      // integration. `Total_Orders_Count` is the live one; `Order_Count`
      // (singular) is a legacy duplicate and always null — do not request it.
      'Total_Orders_Count',
      'First_Order_Date',
      'Last_Order_Date',
      // Zoho Tags are what power the "Flag for Pete" feature — Sky tags an
      // Account `pete-followup` on Sales Floor, Pete sees it on /new-business.
      // Fetched here so every account card on Sky's side already knows its
      // current tag state and can render the correct flag button without a
      // separate round trip.
      'Tag',
    ],
    200,
    accessToken,
  );
  return rows
    // Drop MA accounts before we even shape them — keeps the response leaner
    // and prevents any downstream join from reintroducing them. Check ALL three
    // state fields: some records have MA on Account_State but blank billing,
    // others have "Massachusetts" on Billing_State but nothing on the picklist.
    .filter(
      (a: any) =>
        !isExcludedState(a.Account_State) &&
        !isExcludedState(a.Billing_State) &&
        !isExcludedState(a.Shipping_State),
    )
    // Drop anything whose Account_Name starts with "Test" — those are
    // throwaway records seeded while wiring up workflows.
    .filter((a: any) => !isTestName(a.Account_Name))
    .map((a: any) => ({
      // app.js uses `Id` (capital I) in a couple spots; keep both for safety.
      Id: a.id,
      id: a.id,
      Account_Name: a.Account_Name || '',
      Industry: a.Industry || '',
      Billing_Street: a.Billing_Street || '',
      Billing_City: a.Billing_City || '',
      Billing_State: a.Billing_State || '',
      Account_State: a.Account_State || '',
      Shipping_State: a.Shipping_State || '',
      // Canonical 2-letter state code the client filter + tab strip read.
      // Account_State first, then Billing_State, then Shipping_State — all
      // normalized through the same lookup the client uses. If every field
      // is blank this is '' and the record lands in the "—" (unknown) bucket.
      _state: resolveAccountState(a),
      Phone: a.Phone || '',
      Website: a.Website || '',
      Account_Type: a.Account_Type || '',
      Annual_Revenue: a.Annual_Revenue || 0,
      Description: a.Description || '',
      Modified_Time: a.Modified_Time || null,
      // Order-tracking fields (LeafLink→Zoho integration writes these). Raw
      // values pass through verbatim so the client can display exact figures.
      Total_Orders_Count: a.Total_Orders_Count ?? null,
      First_Order_Date: a.First_Order_Date || null,
      Last_Order_Date: a.Last_Order_Date || null,
      // Populated by attachFirstOrderNumbers() downstream. Stays null when the
      // account isn't a first-order account or when the matching Deal_Name
      // doesn't carry an "Order #N" token. The New Customers card reads this
      // to render the exact LeafLink order number on Zoho-sourced cards
      // (NJ fallback + NY/RI/MO).
      First_Order_Number: null as string | null,
      // Canonical "how many orders" signal. Coerce null → 0 so client filters
      // can safely compare with >= 1 without null-checking. This is the ONLY
      // field the Accounts-tab filter should read.
      _orderCount: Number(a.Total_Orders_Count ?? 0) || 0,
      // `_flaggedForPete` is true when the account carries the `pete-followup`
      // Zoho tag — the cross-rep signal that puts it on Pete's /new-business
      // Follow-Ups queue. Precomputed here so Sky's cards can render the
      // correct flag toggle without every card needing its own tag API call.
      _flaggedForPete: Array.isArray(a.Tag)
        ? a.Tag.some((t: any) => String(t?.name || '').toLowerCase() === 'pete-followup')
        : false,
      // Populated by attachContactsToAccounts() after the contacts fetch
      // resolves. `buyer` is the chosen primary contact (if one exists),
      // `contacts` is the full list for the account.
      contacts: [] as any[],
      buyer: null as any,
    }));
}

// ─── Contacts ────────────────────────────────────────────────────────────────
// Pull every contact attached to an account so we can (a) surface the real
// buyer on the account card, (b) let the rep swap who the buyer is.
//
// Highsman's Zoho org has a dedicated custom picklist labelled "Job Role" that
// holds the role the contact owns at the shop ("Purchasing & Inventory
// Management", "Owner", "Manager on Duty", etc.). The real api_name for that
// field is `Role_Title` (NOT `Job_Role` — that field does not exist). `Title`
// and `Job_Title` are separate generic text fields that often hold noisy
// values (e.g. "Owner", "Buyer") and must NEVER be treated as the buyer-role
// signal. `_jobRole` is sourced ONLY from `Role_Title`. If a contact has no
// Role_Title, that's "no role on file" — full stop.
const CONTACT_BASE_FIELDS = [
  'First_Name',
  'Last_Name',
  'Email',
  'Phone',
  'Mobile',
  'Title',
  'Role_Title',
  'Account_Name',
  'Modified_Time',
];

async function fetchContacts(accessToken: string, ownerId: string | null) {
  const rows = await fetchAllPages('Contacts', ownerId, CONTACT_BASE_FIELDS, 200, accessToken);
  const contacts = rows.map((c: any) => {
    const accountId = c.Account_Name?.id || null;
    const accountName = c.Account_Name?.name || '';
    // Role_Title is the real api_name for the "Job Role" picklist in Highsman's
    // Zoho org. Title / Job_Title are held separately for display only, never
    // the buyer-role signal.
    const jobRole = c.Role_Title || '';
    const fn = c.First_Name || '';
    const ln = c.Last_Name || '';
    return {
      id: c.id,
      First_Name: fn,
      Last_Name: ln,
      _fullName: `${fn} ${ln}`.trim() || c.Email || 'Unknown Contact',
      Email: c.Email || '',
      Phone: c.Phone || '',
      Mobile: c.Mobile || '',
      Title: c.Title || '',
      Role_Title: jobRole,
      _jobRole: jobRole,
      _accountId: accountId,
      _accountName: accountName,
      Modified_Time: c.Modified_Time || null,
    };
  });
  return {contacts};
}

// ─── Buyer detection ─────────────────────────────────────────────────────────
// We treat any contact whose Role_Title (the "Job Role" picklist) contains
// "buyer", "purchas" (catches "Purchasing", "Purchaser"), or "inventory"
// (catches "Inventory Management") as a candidate buyer. Exact match on the
// canonical buyer role wins over loose matches when both exist. Title /
// Job_Title are never read here — they're separate generic text fields full
// of noise like "Owner".
//
// NOTE: The Role_Title picklist option for shop-buyer stores an
// `actual_value` of 'Buyer / Manager' but a `display_value` of
// 'Purchasing & Inventory Management (Buyer, Procurement, Inventory Manager)'.
// Zoho v7 returns the `actual_value` on read, so we compare against that.
const CANONICAL_BUYER_ROLE = 'Buyer / Manager';

function isBuyerRole(role: string | null | undefined): boolean {
  const r = String(role || '').toLowerCase();
  if (!r) return false;
  return r.includes('buyer') || r.includes('purchas') || r.includes('inventory');
}

function pickBuyer(contacts: any[]): any | null {
  if (!contacts.length) return null;
  // 1. Exact canonical match first (case-insensitive).
  const exact = contacts.find(
    (c) => String(c._jobRole || '').toLowerCase() === CANONICAL_BUYER_ROLE.toLowerCase(),
  );
  if (exact) return exact;
  // 2. Any buyer-ish role.
  const fuzzy = contacts.find((c) => isBuyerRole(c._jobRole));
  if (fuzzy) return fuzzy;
  return null;
}

function attachContactsToAccounts(accounts: any[], contacts: any[]) {
  // Group contacts by account id once so we don't loop O(n*m).
  const byAccount = new Map<string, any[]>();
  for (const c of contacts) {
    if (!c._accountId) continue;
    if (!byAccount.has(c._accountId)) byAccount.set(c._accountId, []);
    byAccount.get(c._accountId)!.push(c);
  }
  for (const acc of accounts) {
    const list = byAccount.get(acc.id) || [];
    acc.contacts = list;
    acc.buyer = pickBuyer(list);
  }
  return accounts;
}

// ─── Loader ──────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  // Resolve the caller's rep from the cookie. If they're not logged in we
  // still serve an empty response (200) rather than 401 so the UI can fall
  // back to demo mode the same way it does for missing env vars.
  const rep: SalesRep | null = getRepFromRequest(request);

  if (!clientId || !clientSecret || !refreshToken) {
    return json(
      {
        ok: false,
        error: 'CRM not configured',
        leads: [],
        deals: [],
        accounts: [],
        meta: {
          configured: false,
          syncedAt: new Date().toISOString(),
          rep: rep ? {id: rep.id, firstName: rep.firstName} : null,
        },
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  const ownerId = rep?.zohoOwnerId || null;

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const [leads, deals, accounts, contactsResult, vibesBookedMap] = await Promise.all([
      fetchLeads(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] leads fetch failed:', e.message);
        return [];
      }),
      fetchDeals(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] deals fetch failed:', e.message);
        return [];
      }),
      fetchAccounts(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] accounts fetch failed:', e.message);
        return [];
      }),
      fetchContacts(accessToken, ownerId).catch((e) => {
        console.error('[sales-floor-sync] contacts fetch failed:', e.message);
        return {contacts: []};
      }),
      // Signed Onboarding + Training deals are NOT owner-scoped on purpose:
      // the "booked" pills should show for every rep that opens the board,
      // not just whoever clicked the button. Returns { onboarding, training }
      // maps keyed by account id so attachVibesBookedStatus can stamp
      // per-tier flags without a second roundtrip.
      fetchSalesFloorVibesDeals(accessToken).catch((e) => {
        console.error('[sales-floor-sync] vibes-booked fetch failed:', e.message);
        return {
          onboarding: new Map<string, VibesBookedEntry>(),
          training: new Map<string, VibesBookedEntry>(),
        };
      }),
    ]);

    // Filter MA contacts out before joining (their accounts are already gone)
    // so the picker doesn't show contacts that belong to hidden accounts.
    const accountIds = new Set(accounts.map((a: any) => a.id));
    const visibleContacts = contactsResult.contacts.filter((c: any) =>
      c._accountId ? accountIds.has(c._accountId) : true,
    );
    attachContactsToAccounts(accounts, visibleContacts);

    // Pull the LeafLink order number off the matching earliest Deal so the
    // New Customers card can render "Order #N · {date}" on Zoho-sourced cards
    // (NJ fallback + NY / RI / MO). Uses the deals array we already fetched
    // — no extra round-trip. Accounts without a matching Deal_Name that
    // carries "Order #N" stay as "First order {date}" (graceful fallback).
    attachFirstOrderNumbers(accounts, deals);
    // Auto-clear stale pete-followup flags whose accounts have ordered
    // within AUTO_CLEAR_WINDOW_DAYS. Last-order DOLLAR amounts come from
    // LeafLink and are joined client-side from /api/sales-floor-leaflink-orders.
    autoClearStalePeteFlags(accounts, accessToken);

    // Stamp _vibesBooked / _onboardingBooked / _trainingBooked onto any
    // account that already has a signed Sales Floor deal. The client uses
    // these to render the "Brand Team Booked — Check in by {date}" pill and
    // the "Training Booked — Visit by {date}" pill independently, so an
    // account that's been onboarded AND scheduled for training shows both.
    attachVibesBookedStatus(accounts, vibesBookedMap);

    return json(
      {
        ok: true,
        leads,
        deals,
        accounts,
        meta: {
          configured: true,
          syncedAt: new Date().toISOString(),
          counts: {
            leads: leads.length,
            deals: deals.length,
            accounts: accounts.length,
            contacts: visibleContacts.length,
          },
          contactFieldMode: 'job_role',
          rep: rep ? {id: rep.id, firstName: rep.firstName, scoped: !!ownerId} : null,
        },
      },
      {
        headers: {
          // 60s browser cache so rapid tab-switches don't refetch; worker-side
          // token cache handles the 55-min window. `private` because the
          // payload is rep-scoped.
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  } catch (err: any) {
    console.error('[sales-floor-sync] Sync error:', err.message);
    return json(
      {
        ok: false,
        error: err.message || 'Sync failed',
        leads: [],
        deals: [],
        accounts: [],
        meta: {
          configured: true,
          syncedAt: new Date().toISOString(),
          rep: rep ? {id: rep.id, firstName: rep.firstName, scoped: !!ownerId} : null,
        },
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
