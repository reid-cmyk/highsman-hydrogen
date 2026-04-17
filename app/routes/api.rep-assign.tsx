import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {
  MAX_DOUBLEHEADER_HOP_MIN,
  MAX_SOLO_DRIVE_MIN,
  REP_HUBS,
  isWeekendShift,
  type RepAssignment,
  type RepId,
} from '~/lib/reps';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho OAuth — minimal inline refresh flow (same pattern as /api/popups-book).
// Cached at module scope so repeated rep-assign calls reuse the token across
// requests within the same Oxygen worker instance.
// ─────────────────────────────────────────────────────────────────────────────
let zohoCachedToken: string | null = null;
let zohoTokenExpiresAt = 0;

async function getZohoAccessToken(env: {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}): Promise<string> {
  const now = Date.now();
  if (zohoCachedToken && now < zohoTokenExpiresAt) return zohoCachedToken;

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

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  zohoCachedToken = data.access_token;
  zohoTokenExpiresAt = now + 55 * 60 * 1000;
  return zohoCachedToken!;
}

// ─────────────────────────────────────────────────────────────────────────────
// Datetime helpers — MUST match /api/popups-book conventions exactly, since
// we're comparing equality with Events created by that endpoint.
// ─────────────────────────────────────────────────────────────────────────────
function shiftStartEndHours(shiftKey: string): {startH: number; endH: number} {
  if (shiftKey.endsWith('-main')) return {startH: 15, endH: 19};
  if (shiftKey.endsWith('-mat')) return {startH: 13, endH: 15};
  if (shiftKey.endsWith('-late')) return {startH: 16, endH: 18};
  return {startH: 14, endH: 16};
}

function njOffset(isoDate: string): '-04:00' | '-05:00' {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const year = d.getUTCFullYear();
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchFirstSunday = 1 + ((7 - marchFirst.getUTCDay()) % 7);
  const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 7, 7, 0, 0));
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novFirstSunday = 1 + ((7 - novFirst.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0));
  return d >= dstStart && d < dstEnd ? '-04:00' : '-05:00';
}

function toZohoDateTime(isoDate: string, hour: number, offset: string): string {
  const hh = String(hour).padStart(2, '0');
  return `${isoDate}T${hh}:00:00${offset}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Same-shift-same-rep check — the authoritative "one per rep area per shift"
// guard. Queries Zoho for Events at this exact Start_DateTime and looks for
// an Event_Title that starts with the target rep's subject tag (e.g. "[NJ-N]"
// or "[NJ-S]"). Returns the colliding Event_Title if found, else null.
// Safe-fail: if Zoho is unreachable, returns null (don't block on infra flakes).
// ─────────────────────────────────────────────────────────────────────────────
async function findRepShiftConflict(args: {
  accessToken: string;
  startDateTime: string;
  repTag: string;
  selfAccountId?: string;
}): Promise<{eventTitle: string; eventId: string} | null> {
  try {
    const criteria = `(Start_DateTime:equals:${args.startDateTime})`;
    const url = `https://www.zohoapis.com/crm/v7/Events/search?criteria=${encodeURIComponent(criteria)}&fields=id,Event_Title,Start_DateTime,What_Id`;
    const res = await fetch(url, {
      headers: {Authorization: `Zoho-oauthtoken ${args.accessToken}`},
    });
    // Zoho returns 204 when there are no results — treat as no conflict.
    if (res.status === 204) return null;
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(
        `[api/rep-assign] Zoho Events search failed: ${res.status} ${text.slice(0, 200)}`,
      );
      return null;
    }
    const data = await res.json();
    const events: any[] = data.data || [];
    for (const ev of events) {
      const title = String(ev.Event_Title || '');
      if (!title.startsWith(args.repTag)) continue;
      // If the caller is the same Account re-checking its own booking (eg.
      // staff reviewing a slot they already booked), don't flag it.
      const whatId = ev.What_Id?.id || ev.What_Id;
      if (args.selfAccountId && whatId === args.selfAccountId) continue;
      return {eventTitle: title, eventId: String(ev.id)};
    }
    return null;
  } catch (err: any) {
    console.warn('[api/rep-assign] rep-shift conflict check error:', err?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Highsman Rep Assignment (NJ)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/rep-assign
//
// Given a dispensary + slot, figure out which NJ rep (north or south) covers
// it. If a same-day earlier booking at a different dispensary is provided,
// apply the weekend doubleheader exception: second shift can be up to
// MAX_DOUBLEHEADER_HOP_MIN minutes from the earlier dispensary even if the
// solo hub-radius rule would fail.
//
// Body (form data):
//   destLat, destLng           — dispensary coordinates (required, numbers)
//   dispensaryName             — for error messages (optional)
//   shiftKey                   — e.g. 'sat-late' (required)
//   date                       — YYYY-MM-DD (optional; future-only for traffic)
//   anchorLat, anchorLng       — earlier same-day booking coords (optional)
//   anchorName                 — earlier same-day dispensary name (optional)
//   anchorShiftKey             — earlier same-day shift (optional)
//
// Returns: RepAssignment (see app/lib/reps.ts)
//
// Reuses env.GOOGLE_PLACES_API_KEY — same key as /api/route-time.
// ─────────────────────────────────────────────────────────────────────────────

type RouteLookupArgs = {
  apiKey: string;
  originLat: number;
  originLng: number;
  destLat: number;
  destLng: number;
  departureDateTime?: string;
};

type RouteLookupResult =
  | {ok: true; minutes: number; seconds: number; meters: number}
  | {ok: false; error: string};

async function lookupDrive(args: RouteLookupArgs): Promise<RouteLookupResult> {
  // Identical origin/dest → zero minutes, skip the API call.
  if (
    Math.abs(args.originLat - args.destLat) < 1e-4 &&
    Math.abs(args.originLng - args.destLng) < 1e-4
  ) {
    return {ok: true, minutes: 0, seconds: 0, meters: 0};
  }

  const includeDeparture =
    !!args.departureDateTime &&
    new Date(args.departureDateTime).getTime() > Date.now() + 60_000;

  const body: Record<string, any> = {
    origin: {location: {latLng: {latitude: args.originLat, longitude: args.originLng}}},
    destination: {location: {latLng: {latitude: args.destLat, longitude: args.destLng}}},
    travelMode: 'DRIVE',
    // Low-traffic assumption per Reid — don't pay for traffic-aware routing here.
    routingPreference: includeDeparture ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
    languageCode: 'en-US',
    units: 'IMPERIAL',
  };
  if (includeDeparture && args.departureDateTime) {
    body.departureTime = new Date(args.departureDateTime).toISOString();
  }

  try {
    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': args.apiKey,
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        ok: false,
        error: `Routes API ${res.status}: ${text.slice(0, 200)}`,
      };
    }
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return {ok: false, error: 'No route found'};
    const durationStr: string = route.duration || '0s';
    const seconds = parseInt(durationStr.replace(/s$/, ''), 10) || 0;
    return {
      ok: true,
      minutes: Math.round(seconds / 60),
      seconds,
      meters: route.distanceMeters || 0,
    };
  } catch (err: any) {
    return {ok: false, error: err?.message || 'Routes API failed'};
  }
}

// Hour bucket for departureDateTime — mirrors the convention in /api/popups-book.
function shiftHour(shiftKey: string): number {
  if (shiftKey.endsWith('-main')) return 15; // Thu/Fri 3 PM
  if (shiftKey.endsWith('-mat')) return 13; // Sat/Sun 1 PM matinee
  if (shiftKey.endsWith('-late')) return 16; // Sat/Sun 4 PM late
  return 14;
}

// ─────────────────────────────────────────────────────────────────────────────
// Server-side "one per rep area per shift" enforcement.
// Calls Zoho and returns a `rep_shift_taken` RepAssignment failure if the
// chosen rep already has an Event at this exact Start_DateTime. Safe-fail:
// if Zoho creds aren't configured OR the API fails transiently, we return
// null (no conflict) — we prefer letting a legit booking through over
// hard-failing on infra flakes. The client-side in-memory guardrail still
// catches same-session collisions.
// ─────────────────────────────────────────────────────────────────────────────
async function checkRepShiftConflict(args: {
  env: any;
  date: string;
  shiftKey: string;
  repId: RepId;
  selfAccountId?: string;
  dispensaryName: string;
}): Promise<RepAssignment | null> {
  const {env, date, shiftKey, repId, selfAccountId, dispensaryName} = args;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const hasZoho =
    env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN;
  if (!hasZoho) return null;

  let accessToken: string;
  try {
    accessToken = await getZohoAccessToken(env);
  } catch (err: any) {
    console.warn('[api/rep-assign] Zoho token fetch failed:', err?.message);
    return null;
  }

  const {startH} = shiftStartEndHours(shiftKey);
  const offset = njOffset(date);
  const startDateTime = toZohoDateTime(date, startH, offset);
  const hub = REP_HUBS[repId];

  const conflict = await findRepShiftConflict({
    accessToken,
    startDateTime,
    repTag: hub.subjectTag,
    selfAccountId,
  });
  if (!conflict) return null;

  // Human-friendly shift label for the error message.
  const shiftLabel = shiftKey.endsWith('-main')
    ? 'Friday shift'
    : shiftKey.endsWith('-mat')
      ? 'Saturday matinee'
      : shiftKey.endsWith('-late')
        ? 'Saturday late'
        : 'shift';

  return {
    ok: false,
    reason: 'rep_shift_taken',
    bestRepId: repId,
    message: `${hub.name}'s ${shiftLabel} on ${date} is already covered${
      dispensaryName ? ` (can't add ${dispensaryName})` : ''
    }. Only one Spark Team visit per rep area per shift — try the other shift or another date.`,
    conflictEventId: conflict.eventId,
    conflictEventTitle: conflict.eventTitle,
  };
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, reason: 'method_not_allowed', message: 'POST only'}, {status: 405});
  }

  const fd = await request.formData();
  const destLat = parseFloat((fd.get('destLat') as string) || '');
  const destLng = parseFloat((fd.get('destLng') as string) || '');
  const dispensaryName = ((fd.get('dispensaryName') as string) || '').trim();
  const shiftKey = ((fd.get('shiftKey') as string) || '').trim();
  const date = ((fd.get('date') as string) || '').trim();
  const anchorLatRaw = (fd.get('anchorLat') as string) || '';
  const anchorLngRaw = (fd.get('anchorLng') as string) || '';
  const anchorName = ((fd.get('anchorName') as string) || '').trim();
  const anchorShiftKey = ((fd.get('anchorShiftKey') as string) || '').trim();
  // Optional — if the caller is already booked under this Account, we skip
  // self-matches in the Zoho conflict check (staff re-checking their own slot).
  const selfAccountId = ((fd.get('accountId') as string) || '').trim() || undefined;

  if (!Number.isFinite(destLat) || !Number.isFinite(destLng) || !shiftKey) {
    return json(
      {
        ok: false,
        reason: 'bad_request',
        message: 'destLat, destLng, shiftKey are required.',
      },
      {status: 400},
    );
  }

  const env = context.env as any;
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[api/rep-assign] GOOGLE_PLACES_API_KEY not configured');
    const fail: RepAssignment = {
      ok: false,
      reason: 'drive_lookup_failed',
      message: 'Rep coverage check unavailable (API key not configured).',
    };
    return json(fail);
  }

  // Build departure ISO for the shift (NJ local, no TZ — Routes API treats
  // string + Date parsing the same way /api/route-time does). Only meaningful
  // when the booking is in the future.
  let departureDateTime: string | undefined;
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    departureDateTime = `${date}T${String(shiftHour(shiftKey)).padStart(2, '0')}:00:00`;
  }

  // ── Phase 1: drive time from each rep hub to the dispensary ────────────────
  const [northRes, southRes] = await Promise.all([
    lookupDrive({
      apiKey,
      originLat: REP_HUBS.north.hubLat,
      originLng: REP_HUBS.north.hubLng,
      destLat,
      destLng,
      departureDateTime,
    }),
    lookupDrive({
      apiKey,
      originLat: REP_HUBS.south.hubLat,
      originLng: REP_HUBS.south.hubLng,
      destLat,
      destLng,
      departureDateTime,
    }),
  ]);

  // If BOTH lookups errored, we can't make an informed decision — fail closed.
  if (!northRes.ok && !southRes.ok) {
    const fail: RepAssignment = {
      ok: false,
      reason: 'drive_lookup_failed',
      message: `Couldn't reach Google Routes API (${northRes.error}).`,
    };
    return json(fail);
  }

  const northMin = northRes.ok ? northRes.minutes : Number.POSITIVE_INFINITY;
  const southMin = southRes.ok ? southRes.minutes : Number.POSITIVE_INFINITY;

  // Closer-rep wins. Tie or North-only coverage defaults to North Jersey.
  const closerRepId: RepId = northMin <= southMin ? 'north' : 'south';
  const closerMin = closerRepId === 'north' ? northMin : southMin;

  // ── Phase 2: in-range? ─────────────────────────────────────────────────────
  if (closerMin <= MAX_SOLO_DRIVE_MIN) {
    // Authoritative rep-shift conflict check against Zoho. This is what
    // catches cross-session bookings that the client-side guardrail can't see.
    const conflict = await checkRepShiftConflict({
      env,
      date,
      shiftKey,
      repId: closerRepId,
      selfAccountId,
      dispensaryName,
    });
    if (conflict) return json(conflict);

    const hub = REP_HUBS[closerRepId];
    const ok: RepAssignment = {
      ok: true,
      repId: closerRepId,
      repName: hub.name,
      hubLabel: hub.hubLabel,
      subjectTag: hub.subjectTag,
      color: hub.color,
      driveMin: closerMin,
      mode: 'solo',
    };
    return json(ok);
  }

  // ── Phase 3: doubleheader exception ────────────────────────────────────────
  // Only applies on Sat/Sun, only when we have an earlier same-day booking to
  // anchor from. Otherwise the solo rule stands and we're out of coverage.
  const haveAnchor =
    isWeekendShift(shiftKey) &&
    Number.isFinite(parseFloat(anchorLatRaw)) &&
    Number.isFinite(parseFloat(anchorLngRaw));

  if (!haveAnchor) {
    const dispLabel = dispensaryName || 'this dispensary';
    const fail: RepAssignment = {
      ok: false,
      reason: 'out_of_coverage',
      bestRepId: closerRepId,
      bestDriveMin: closerMin,
      message: `${dispLabel} is ${closerMin} min from ${REP_HUBS[closerRepId].hubCity} — outside our ${MAX_SOLO_DRIVE_MIN}-min NJ coverage radius. Pick a dispensary closer to Newark or Collingswood.`,
    };
    return json(fail);
  }

  // Anchor present — check drive from anchor dispensary to this one. Use the
  // closer rep as the assignment (they're the one doubling up).
  const anchorLat = parseFloat(anchorLatRaw);
  const anchorLng = parseFloat(anchorLngRaw);
  const hop = await lookupDrive({
    apiKey,
    originLat: anchorLat,
    originLng: anchorLng,
    destLat,
    destLng,
    departureDateTime,
  });

  if (!hop.ok) {
    const fail: RepAssignment = {
      ok: false,
      reason: 'drive_lookup_failed',
      message: `Couldn't verify doubleheader hop (${hop.error}).`,
    };
    return json(fail);
  }

  if (hop.minutes <= MAX_DOUBLEHEADER_HOP_MIN) {
    // Same rep-shift conflict check — a doubleheader still requires an open
    // rep slot at this Start_DateTime.
    const conflict = await checkRepShiftConflict({
      env,
      date,
      shiftKey,
      repId: closerRepId,
      selfAccountId,
      dispensaryName,
    });
    if (conflict) return json(conflict);

    const hub = REP_HUBS[closerRepId];
    const ok: RepAssignment = {
      ok: true,
      repId: closerRepId,
      repName: hub.name,
      hubLabel: hub.hubLabel,
      subjectTag: hub.subjectTag,
      color: hub.color,
      driveMin: hop.minutes,
      mode: 'doubleheader',
      anchorName: anchorName || undefined,
      note: `Doubleheader — ${hop.minutes} min from ${anchorName || 'earlier stop'}.`,
    };
    return json(ok);
  }

  const fail: RepAssignment = {
    ok: false,
    reason: 'doubleheader_too_far',
    bestRepId: closerRepId,
    bestDriveMin: hop.minutes,
    message: `${hop.minutes}-min drive from ${anchorName || 'earlier stop'} to ${
      dispensaryName || 'this dispensary'
    } — past the ${MAX_DOUBLEHEADER_HOP_MIN}-min doubleheader limit. Split the day across two reps or pick a closer dispensary.`,
  };
  return json(fail);
}
