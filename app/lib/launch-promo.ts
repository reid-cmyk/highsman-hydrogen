/**
 * Launch Promo — wholesale stock-up window tied to the consumer Launch
 * Promotion (May 14 – Jun 13, 2026).
 *
 * Buyers who place an NJ menu order between Apr 28, 2026 and end-of-day
 * May 1, 2026 (ET) and use code `LAUNCH` get:
 *   - 20% off Triple Threat Pre-Rolls
 *   - 10% off Ground Game
 *   - No discount on Hit Sticks (excluded — protects the impulse-SKU margin)
 *
 * One redemption per Account. Stamped on the Zoho Sales Order via
 * `Launch_Promo_Used` (boolean) + `Launch_Promo_Redeemed_At` (datetime)
 * after a successful LeafLink push.
 *
 * Single source of truth — used by both the /njmenu UI and the
 * /api/leaflink-order action so client and server cannot drift.
 */

export const LAUNCH_PROMO = {
  code: 'LAUNCH',
  // ET window (UTC offset -04:00 in late April → DST already on)
  startsAt: '2026-04-28T00:00:00-04:00',
  endsAt: '2026-05-01T23:59:59-04:00',

  // Per-product-line discount rates (matches PRODUCT_LINES.id values
  // in app/routes/njmenu._index.tsx)
  rates: {
    'triple-threat': {percent: 20, label: 'LAUNCH'},
    'ground-game':   {percent: 10, label: 'LAUNCH'},
    // Hit Sticks family — explicitly excluded
    'hit-sticks-single': {percent: 0, label: ''},
    'hit-sticks-5pack':  {percent: 0, label: ''},
    'fly-high-tins':     {percent: 0, label: ''},
  } as Record<string, {percent: number; label: string}>,

  // Window for the consumer-facing launch this is enrolling stores into.
  // Display copy + reporting only.
  consumerLaunchStartsAt: '2026-05-14T00:00:00-04:00',
  consumerLaunchEndsAt:   '2026-06-13T23:59:59-04:00',
} as const;

export type LaunchPromoStatus =
  | {ok: true}
  | {ok: false; reason: 'inactive_window' | 'invalid_code' | 'already_used'};

export function isLaunchActive(now: Date = new Date()): boolean {
  const start = new Date(LAUNCH_PROMO.startsAt).getTime();
  const end = new Date(LAUNCH_PROMO.endsAt).getTime();
  const t = now.getTime();
  return t >= start && t <= end;
}

export function discountForProductLineId(productLineId: string): {percent: number; label: string} {
  const rate = LAUNCH_PROMO.rates[productLineId];
  return rate ?? {percent: 0, label: ''};
}

/**
 * Returns ms remaining until the promo window closes.
 * Negative if already over. Used for the countdown banner.
 */
export function msUntilLaunchEnd(now: Date = new Date()): number {
  return new Date(LAUNCH_PROMO.endsAt).getTime() - now.getTime();
}

/**
 * Format ms remaining as a readable countdown string.
 * Examples: "2d 14h 33m", "5h 12m", "Ends today"
 */
export function formatLaunchCountdown(ms: number): string {
  if (ms <= 0) return 'Ended';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/**
 * Validate a user-entered code.
 * Returns ok=true only if the code matches AND the window is open.
 * Account-level "already used" check happens server-side (see
 * api.leaflink-order.tsx) — this client-side helper trusts what it sees.
 */
export function validateLaunchCode(
  code: string,
  now: Date = new Date(),
): LaunchPromoStatus {
  if (!isLaunchActive(now)) {
    return {ok: false, reason: 'inactive_window'};
  }
  if (code.trim().toUpperCase() !== LAUNCH_PROMO.code) {
    return {ok: false, reason: 'invalid_code'};
  }
  return {ok: true};
}

/**
 * Apply the LAUNCH discount to a product-line-shaped object that has
 * `id` and `discount` fields. Mutates a shallow copy — original is
 * never touched.
 *
 * Used by the /njmenu UI to decorate PRODUCT_LINES once a valid code
 * has been applied. Server-side, the same lookup runs against the
 * incoming SKU → product-line-id mapping.
 */
export function decorateWithLaunchDiscount<
  T extends {id: string; discount?: {label: string; percent: number}},
>(line: T): T {
  const rate = discountForProductLineId(line.id);
  if (rate.percent <= 0) return line;
  return {...line, discount: {label: rate.label, percent: rate.percent}};
}

/**
 * Server-side helper for api.leaflink-order.tsx.
 * Given a LAUNCH-eligible SKU + base case price, return the discounted
 * case price. SKUs not in the discount map get their original price back.
 *
 * The SKU → product-line-id mapping is colocated here so this lib stays
 * the single source of truth.
 */
export const SKU_TO_PRODUCT_LINE_ID: Record<string, string> = {
  // Triple Threat (Pre-Roll, 1.2g) — 20% off during LAUNCH
  'C-NJ-HSTT-WW': 'triple-threat',
  'C-NJ-HSTT-GG': 'triple-threat',
  'C-NJ-HSTT-BB': 'triple-threat',
  'C-NJ-HSTT-TM': 'triple-threat',
  'C-NJ-HSTT-CQ': 'triple-threat',
  // Ground Game (7g milled flower) — 10% off during LAUNCH
  'C-NJ-HSGG-WW': 'ground-game',
  'C-NJ-HSGG-GG': 'ground-game',
  'C-NJ-HSGG-BB': 'ground-game',
  'C-NJ-HSGG-TM': 'ground-game',
  'C-NJ-HSGG-CQ': 'ground-game',
  // Hit Sticks family — excluded (returned with 0% discount; here for
  // documentation + future-proofing if rates change mid-promo)
  'C-NJ-HSINF-WW': 'hit-sticks-single',
  'C-NJ-HSINF-GG': 'hit-sticks-single',
  'C-NJ-HSINF-BB': 'hit-sticks-single',
  'C-NJ-HSINF-TM': 'hit-sticks-single',
  'C-NJ-HSINF-CQ': 'hit-sticks-single',
  'C-NJ-HSTIN-WW': 'hit-sticks-5pack',
  'C-NJ-HSTIN-GG': 'hit-sticks-5pack',
  'C-NJ-HSTIN-BB': 'hit-sticks-5pack',
  'C-NJ-HSTIN-TM': 'hit-sticks-5pack',
  'C-NJ-HSTIN-CQ': 'hit-sticks-5pack',
  'C-NJ-HSTINFH-WW': 'fly-high-tins',
  'C-NJ-HSTINFH-GG': 'fly-high-tins',
  'C-NJ-HSTINFH-BB': 'fly-high-tins',
  'C-NJ-HSTINFH-TM': 'fly-high-tins',
  'C-NJ-HSTINFH-CQ': 'fly-high-tins',
};

export function discountedCasePriceForSku(
  sku: string,
  basePrice: number,
): {price: number; percent: number} {
  const lineId = SKU_TO_PRODUCT_LINE_ID[sku];
  if (!lineId) return {price: basePrice, percent: 0};
  const rate = discountForProductLineId(lineId);
  if (rate.percent <= 0) return {price: basePrice, percent: 0};
  const discounted = Math.round(basePrice * (1 - rate.percent / 100) * 100) / 100;
  return {price: discounted, percent: rate.percent};
}

/**
 * Banner copy shown on /njmenu while the window is active.
 */
export const LAUNCH_BANNER_COPY = {
  eyebrow: 'LAUNCH PROMO',
  headline: '20% OFF PRE-ROLLS · 10% OFF GROUND GAME',
  body: 'Stock up before the May 14 consumer launch. Use code',
  codeText: 'LAUNCH',
  cta: 'at checkout.',
} as const;
