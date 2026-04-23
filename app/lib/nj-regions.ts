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
  'hammonton','egg harbor','mays landing','pleasantville',
]);

// Deep shore / LBI / Cape May — ≥2hr drive from Union NJ. Dispensaries here
// (Shore House Canna et al.) get quarterly drop-in runs, not weekly visits.
// Every weekly planner filters these out; Sky's button flags them for direct
// arrangement with Serena.
export const OUTLIER_CITIES = new Set<string>([
  'atlantic city','ventnor','ventnor city','margate','margate city','longport',
  'ocean city','sea isle city','avalon','stone harbor','wildwood','wildwood crest',
  'north wildwood','cape may','cape may court house','rio grande',
  'beach haven','long beach island','lbi','barnegat light','ship bottom','surf city',
  'seaside heights','seaside park',
]);

function normalizeCity(city: string | null | undefined): string {
  return (city || '').toLowerCase().trim().replace(/\s+/g, ' ');
}

// Classify a city into a region + outlier flag. Unknown cities default to
// 'central' (safest fallback — mid-state, moderate drive from Union NJ).
export function njRegion(
  city: string | null | undefined,
): {region: NjRegion; infrequentDropIn: boolean} {
  const c = normalizeCity(city);
  if (!c) return {region: 'central', infrequentDropIn: false};
  if (OUTLIER_CITIES.has(c)) return {region: 'south', infrequentDropIn: true};
  if (NORTH_CITIES.has(c)) return {region: 'north', infrequentDropIn: false};
  if (SOUTH_CITIES.has(c)) return {region: 'south', infrequentDropIn: false};
  if (CENTRAL_CITIES.has(c)) return {region: 'central', infrequentDropIn: false};
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
