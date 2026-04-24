// ─────────────────────────────────────────────────────────────────────────────
// NJ region classifier — shared across Vibes routing + Sales Floor bookings.
// ─────────────────────────────────────────────────────────────────────────────
// Serena works NJ Tue/Wed/Thu. Each day locks to a single region so she's
// not zig-zagging across the state. This module is the single source of
// truth for:
//   • Which NJ city belongs to North / Central / South
//   • Which cities are drop-in OUTLIERS (quarterly Shore runs, never weekly)
//   • Which weekday a region defaults to (Tue=N, Wed=C, Thu=S)
//
// Used by:
//   • api.vibes-weekly-plan.tsx      — week builder, splits pool by region
//   • api.vibes-daily-route.tsx      — daily anchor region lock
//   • api.sales-floor-vibes-onboard  — Sky's Brand Team Onboarding button
//   • api.sales-floor-vibes-training — Sky's Training button
//
// Classification order inside njRegion():
//   1. OUTLIER_CITIES set               (quarterly-only Shore)
//   2. NORTH / SOUTH / CENTRAL city set (explicit allow-list, wins over zip)
//   3. Zip-prefix fallback              (catches new dispensary cities without
//                                        waiting for a code push)
//   4. Silent 'central' default         (should be rare once sets are populated)
// ─────────────────────────────────────────────────────────────────────────────

export type NjRegion = 'north' | 'central' | 'south';

// Bergen, Hudson, Passaic, Essex, Union, Morris, Sussex, Warren — Serena's
// Tuesday anchor because Union NJ (her origin) sits in this cluster.
export const NORTH_CITIES = new Set<string>([
  'newark','jersey city','hoboken','union city','west new york','bayonne','weehawken',
  'north bergen','fort lee','englewood','hackensack','paramus','fair lawn','ridgewood',
  'clifton','paterson','passaic','wayne','west milford','ringwood','kinnelon',
  'east orange','orange','irvington','bloomfield','montclair','west orange','livingston',
  'millburn','short hills','maplewood','south orange','south hackensack','cedar grove',
  'union','elizabeth','linden','roselle','hillside','cranford','westfield','summit',
  'morristown','madison','chatham','denville','dover','parsippany','rockaway',
  'hackettstown','phillipsburg','washington','belvidere',
  'newton','sparta','vernon','sussex',
  'secaucus','lyndhurst','kearny','north arlington','rutherford','carlstadt',
  'teaneck','bergenfield','dumont','new milford','tenafly','cliffside park',
  'garfield','lodi','elmwood park','saddle brook','rochelle park',
  'roselle park','mountainside','new providence','berkeley heights','scotch plains',
  'fanwood','plainfield','south plainfield',
]);

// Middlesex, Monmouth, Somerset, Hunterdon, Mercer — mid-state belt, natural
// Wednesday anchor because you can hit Princeton/New Brunswick/Red Bank in
// one loop without leaving central NJ.
export const CENTRAL_CITIES = new Set<string>([
  'new brunswick','north brunswick','south brunswick','east brunswick','edison',
  'woodbridge','piscataway','highland park','metuchen','iselin','perth amboy',
  'sayreville','south amboy','old bridge','spotswood','matawan','aberdeen',
  'red bank','middletown','long branch','asbury park','ocean','neptune',
  'eatontown','tinton falls','oakhurst','freehold','howell','marlboro','manalapan',
  'colts neck','holmdel','hazlet',
  'somerville','bridgewater','bound brook','franklin','hillsborough','raritan',
  'watchung','warren','basking ridge','bernardsville',
  'flemington','clinton','lambertville',
  'princeton','trenton','hamilton','ewing','lawrenceville','west windsor','east windsor',
  'plainsboro','cranbury','jamesburg','monroe',
  'belmar','bradley beach','wall','west long branch','shrewsbury','fair haven',
  'rumson','little silver','oceanport','keansburg','keyport',
]);

// Burlington, Camden, Gloucester, Ocean, Atlantic (non-shore) — Thursday
// anchor. Farthest from Union NJ so it gets the day with the most runway.
export const SOUTH_CITIES = new Set<string>([
  'cherry hill','camden','collingswood','haddonfield','voorhees','marlton','mount laurel',
  'moorestown','medford','mount holly','burlington','willingboro','maple shade',
  'pennsauken','merchantville','audubon','barrington','magnolia','lindenwold',
  'deptford','woodbury','glassboro','pitman','washington township','sewell',
  'vineland','millville','bridgeton','pennsville','salem',
  'toms river','brick','lakewood','jackson','point pleasant','bayville','manchester',
  'lakehurst','whiting','forked river',
  'hammonton','egg harbor','egg harbor township','mays landing','pleasantville',
  // Camden County gaps that previously silently fell through to 'central':
  'gloucester township','blackwood','sicklerville','runnemede','stratford',
  'somerdale','gibbsboro','berlin','laurel springs','pine hill','winslow',
  'williamstown','clementon','waterford','bellmawr',
  // Gloucester County gaps:
  'mantua','mullica hill','swedesboro','west deptford','monroe township',
  'franklinville','turnersville','clayton',
  // Burlington County gaps:
  'cinnaminson','delran','riverside','palmyra','riverton','beverly','bordentown',
  'florence','edgewater park','eastampton','lumberton','hainesport','evesham',
  'southampton','tabernacle','pemberton','new lisbon','fort dix',
  // Atlantic (inland, non-shore) gaps:
  'absecon','galloway','northfield','linwood','somers point','buena','hamilton township',
  // Ocean County gaps (inland):
  'barnegat','tuckerton','little egg harbor','stafford','waretown','bayville',
  // Cumberland / Salem:
  'woodstown',
]);

// Deep shore / LBI / Cape May — ≥2hr drive from Union NJ. Dispensaries here
// (Shore House Canna et al.) get quarterly drop-in runs, not weekly visits.
// Every weekly planner filters these out; Sky's button flags them for direct
// arrangement with Serena.
export const OUTLIER_CITIES = new Set<string>([
  'atlantic city','ventnor','ventnor city','margate','margate city','longport',
  'brigantine',
  'ocean city','sea isle city','avalon','stone harbor','wildwood','wildwood crest',
  'north wildwood','cape may','cape may court house','cape may point','rio grande',
  'west cape may','villas','del haven','dennis','dennisville','ocean view',
  'beach haven','long beach island','lbi','barnegat light','ship bottom','surf city',
  'harvey cedars','high bar harbor',
  'seaside heights','seaside park','lavallette','ortley beach','chadwick beach',
]);

function normalizeCity(city: string | null | undefined): string {
  return (city || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Extract the 5-digit NJ zip from whatever Zoho gives us in Billing_Code.
// Accepts "08012", "08012-1234", "NJ 08012", etc. Returns null if nothing
// that looks like a valid NJ zip (starts with 07/08) can be parsed.
function normalizeZip(zip: string | null | undefined): string | null {
  if (!zip) return null;
  const m = String(zip).match(/\b(0[78]\d{3})\b/);
  return m ? m[1] : null;
}

// Zip-prefix classifier. Broad ranges, erring on the conservative side:
//   07xxx        → NORTH (North NJ, Hudson/Bergen/Essex/Morris/Sussex/Warren/Union)
//   077xx        → nuance: Monmouth fringe, treat as CENTRAL
//   078xx        → Union/Somerset (North or Central) — keep NORTH as safe default
//                  for Union-NJ-origin driving math; city set wins when present.
//   080xx-081xx  → SOUTH (Camden/Gloucester/Burlington)
//   082xx        → SOUTH generally, with coastal AC/LBI/Cape May as OUTLIER
//                  (those are caught by OUTLIER_CITIES too, belt + suspenders)
//   083xx        → SOUTH (Ocean County inland)
//   084xx        → OUTLIER (Cape May — always shore/quarterly)
//   085xx        → CENTRAL (Mercer / Trenton)
//   086xx        → CENTRAL (Monmouth)
//   087xx        → CENTRAL (Middlesex)
//   088xx-089xx  → CENTRAL (Middlesex / Somerset)
function regionFromZip(
  zip: string,
): {region: NjRegion; infrequentDropIn: boolean} | null {
  const p3 = zip.slice(0, 3);
  const p2 = zip.slice(0, 2);

  if (p2 === '07') {
    // 077xx is mostly Monmouth shore fringe — treat as central
    if (p3 === '077') return {region: 'central', infrequentDropIn: false};
    return {region: 'north', infrequentDropIn: false};
  }

  if (p2 === '08') {
    // Cape May county
    if (p3 === '084') return {region: 'south', infrequentDropIn: true};
    // Atlantic City / LBI coastal
    // 08201 Absecon is inland (SOUTH, not outlier).
    // 08202 Avalon, 08203 Brigantine, 08204 Cape May, 08205 Absecon/Galloway,
    // 08210 CMCH, 08225 Northfield, 08226 Ocean City, 08230 Ocean View,
    // 08232 Pleasantville, 08234 Northfield, 08240 Mays Landing, 08243 Sea Isle,
    // 08244 Somers Point, 08246 Tuckahoe, 08247 Stone Harbor, 08248 Strathmere,
    // 08251 Villas, 08260 Wildwood, 08401-08406 Atlantic City.
    const n = Number(zip);
    if (n === 8202 || n === 8203 || n === 8204) return {region: 'south', infrequentDropIn: true};
    if (n === 8226 || n === 8230 || n === 8243 || n === 8247 || n === 8248) return {region: 'south', infrequentDropIn: true};
    if (n === 8251 || n === 8260) return {region: 'south', infrequentDropIn: true};
    if (n >= 8401 && n <= 8406) return {region: 'south', infrequentDropIn: true};
    // LBI (Beach Haven / Barnegat Light / Ship Bottom / Surf City)
    if (n >= 8006 && n <= 8008) return {region: 'south', infrequentDropIn: true};
    if (n === 8092) return {region: 'south', infrequentDropIn: true};
    // Everything else in 080-083 → SOUTH inland
    if (p3 === '080' || p3 === '081' || p3 === '082' || p3 === '083') {
      return {region: 'south', infrequentDropIn: false};
    }
    // 085-089 → CENTRAL
    if (p3 === '085' || p3 === '086' || p3 === '087' || p3 === '088' || p3 === '089') {
      return {region: 'central', infrequentDropIn: false};
    }
  }

  return null;
}

// Classify a city (+ optional zip) into a region + outlier flag.
//
// Explicit city sets win over zip (they're hand-curated and authoritative for
// the dispensary cities we actually service). Zip is a safety net for cities
// that haven't been added yet — it keeps the region-lock honest when a new
// dispensary's city hasn't made it into the allow-list above.
//
// Unknown city AND unknown/missing zip falls back to 'central' — same as
// before. That fallback should now be rare because the zip prefix covers
// virtually every NJ dispensary address.
export function njRegion(
  city: string | null | undefined,
  zip?: string | null | undefined,
): {region: NjRegion; infrequentDropIn: boolean} {
  const c = normalizeCity(city);

  // City sets first — hand-curated, always authoritative when matched.
  if (c) {
    if (OUTLIER_CITIES.has(c)) return {region: 'south', infrequentDropIn: true};
    if (NORTH_CITIES.has(c)) return {region: 'north', infrequentDropIn: false};
    if (SOUTH_CITIES.has(c)) return {region: 'south', infrequentDropIn: false};
    if (CENTRAL_CITIES.has(c)) return {region: 'central', infrequentDropIn: false};
  }

  // City missed all sets — try zip-prefix fallback before silent 'central'.
  const z = normalizeZip(zip);
  if (z) {
    const byZip = regionFromZip(z);
    if (byZip) return byZip;
  }

  // Truly unknown — central is the safest mid-state default.
  return {region: 'central', infrequentDropIn: false};
}

// Human-readable region label for UI toasts / deal descriptions.
export function regionLabel(r: NjRegion): string {
  return r === 'north' ? 'North NJ' : r === 'south' ? 'South NJ' : 'Central NJ';
}

// Default weekday anchor per region. Serena works Tue/Wed/Thu — Tuesday
// anchors North (her origin is Union NJ), Wednesday handles Central,
// Thursday runs the longer South drive.
//
// Weekly planner can override this dynamically by load (see
// api.vibes-daily-route DOW slot logic), but Sky's button uses the default
// so we can tell him a predictable day at click time.
export function defaultDayForRegion(r: NjRegion): {
  dayName: string;
  weekday: number; // 2=Tue, 3=Wed, 4=Thu
} {
  if (r === 'north') return {dayName: 'Tuesday', weekday: 2};
  if (r === 'central') return {dayName: 'Wednesday', weekday: 3};
  return {dayName: 'Thursday', weekday: 4};
}

// Compute the next occurrence of the given weekday (2=Tue, 3=Wed, 4=Thu)
// on or after `from`, clamped to at least `minDaysAhead` days out so we
// don't book a same-day visit Sky doesn't have time to coordinate.
export function nextDateForWeekday(
  from: Date,
  targetWeekday: number,
  minDaysAhead = 2,
): string {
  const start = new Date(from.getTime() + minDaysAhead * 86400 * 1000);
  const cur = start.getDay();
  const diff = (targetWeekday - cur + 7) % 7;
  const target = new Date(start.getTime() + diff * 86400 * 1000);
  return target.toISOString().slice(0, 10);
}
