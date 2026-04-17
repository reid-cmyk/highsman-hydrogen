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
// exception. Applies only when the rep already has a booking that weekend day.
export const MAX_DOUBLEHEADER_HOP_MIN = 60;

// Weekend doubleheader exception is Sat/Sun only. Thu/Fri pop-ups must always
// satisfy the solo hub-radius rule.
export function isWeekendShift(shiftKey: string): boolean {
  return shiftKey.startsWith('sat-') || shiftKey.startsWith('sun-');
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
