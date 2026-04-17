// ─────────────────────────────────────────────────────────────────────────────
// Highsman NJ Rep Hubs + Coverage Rules
// ─────────────────────────────────────────────────────────────────────────────
// Every NJ pop-up is run by one of two reps. Each rep has a "hub" — a home
// base they drive from — and a max solo drive radius from that hub. Dispensaries
// outside both hubs' radii are NOT eligible for pop-ups; the picker blocks them.
//
// Weekend doubleheader exception: if the assigned rep already has a booking
// earlier the same Sat or Sun, the second shift can be farther from hub AS
// LONG AS it's within MAX_DOUBLEHEADER_HOP_MIN of the earlier dispensary. This
// matches the real-world constraint — rep is already in the field, so clock
// starts at dispensary A, not the hub.
//
// Assumption: "low-traffic impact" — Google Routes API is called without
// TRAFFIC_AWARE, so drive times are the no-traffic baseline.
// ─────────────────────────────────────────────────────────────────────────────

export type RepId = 'north' | 'south';

export type RepHub = {
  id: RepId;
  name: string;
  hubCity: string;
  hubLabel: string;
  // Coordinates of the rep's home hub. Used as origin for Routes API lookups.
  // Newark ~ downtown transit hub; Collingswood ~ PATCO center.
  hubLat: number;
  hubLng: number;
  // Zoho Event subject tag — e.g. "[NJ-N]" for North Jersey bookings.
  subjectTag: string;
  // UI color accent for the rep badge.
  color: string;
};

export const REP_HUBS: Record<RepId, RepHub> = {
  north: {
    id: 'north',
    name: 'North Jersey Rep',
    hubCity: 'Newark, NJ',
    hubLabel: 'North Jersey (Newark hub)',
    hubLat: 40.7357,
    hubLng: -74.1724,
    subjectTag: '[NJ-N]',
    color: '#C9A867', // Highsman gold
  },
  south: {
    id: 'south',
    name: 'South Jersey Rep',
    hubCity: 'Collingswood, NJ',
    hubLabel: 'South Jersey (Collingswood hub)',
    hubLat: 39.918,
    hubLng: -75.0718,
    subjectTag: '[NJ-S]',
    color: '#A9ACAF', // Highsman quarter gray
  },
};

// Max drive minutes from a rep's hub to a dispensary for a solo booking.
export const MAX_SOLO_DRIVE_MIN = 60;

// Max drive minutes between two same-day dispensaries for the doubleheader
// exception. Applies only when the rep already has a booking that Saturday —
// the second stop must sit within this radius of the first stop, NOT from hub.
export const MAX_DOUBLEHEADER_HOP_MIN = 40;

// Saturday-only doubleheader exception. Friday visits must always satisfy
// the solo hub-radius rule (60 min from home base).
export function isWeekendShift(shiftKey: string): boolean {
  return shiftKey.startsWith('sat-');
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick (no-API) coverage estimate — used to TAG dispensaries in the picker
// BEFORE a slot is chosen. The authoritative check still runs via
// /api/rep-assign once staff commits to a slot, but this lets the rep see
// out-of-coverage dispensaries as soon as they show up in search results.
//
// Thresholds are tuned against "low-traffic impact" NJ driving:
//   ≤35 mi crow-flies from either hub   → 'in'     (effectively always ≤60 min)
//   35–50 mi from closer hub             → 'edge'   (verify on pick)
//   >50 mi from both hubs                → 'out'    (almost certainly blocked)
// ─────────────────────────────────────────────────────────────────────────────
export const HAVERSINE_IN_MILES = 35;
export const HAVERSINE_EDGE_MILES = 50;

export function haversineMiles(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 3958.7613; // Earth radius in miles
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export type QuickCoverageStatus = 'in' | 'edge' | 'out' | 'unknown';

export type QuickCoverage = {
  status: QuickCoverageStatus;
  closestHub?: RepId;
  miles?: number;
};

export function quickCoverageStatus(
  lat?: number | null,
  lng?: number | null,
): QuickCoverage {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return {status: 'unknown'};
  }
  const milesNorth = haversineMiles(
    lat,
    lng,
    REP_HUBS.north.hubLat,
    REP_HUBS.north.hubLng,
  );
  const milesSouth = haversineMiles(
    lat,
    lng,
    REP_HUBS.south.hubLat,
    REP_HUBS.south.hubLng,
  );
  const closestHub: RepId = milesNorth <= milesSouth ? 'north' : 'south';
  const miles = Math.min(milesNorth, milesSouth);
  if (miles <= HAVERSINE_IN_MILES) return {status: 'in', closestHub, miles};
  if (miles <= HAVERSINE_EDGE_MILES) return {status: 'edge', closestHub, miles};
  return {status: 'out', closestHub, miles};
}

// Return the hub entry, with a typed narrowing guard.
export function getRep(id: RepId): RepHub {
  return REP_HUBS[id];
}

// Result of an assignment attempt. Either a successful assignment with a rep
// and drive time, or an out-of-coverage reason.
export type RepAssignment =
  | {
      ok: true;
      repId: RepId;
      repName: string;
      hubLabel: string;
      subjectTag: string;
      color: string;
      // Drive minutes used in the decision — from hub (solo) or from the earlier
      // same-day dispensary (doubleheader).
      driveMin: number;
      mode: 'solo' | 'doubleheader';
      // Dispensary name the doubleheader is anchored to, if any.
      anchorName?: string;
      note?: string;
    }
  | {
      ok: false;
      reason:
        | 'out_of_coverage'
        | 'doubleheader_too_far'
        | 'drive_lookup_failed';
      bestRepId?: RepId;
      bestDriveMin?: number;
      message: string;
    };
