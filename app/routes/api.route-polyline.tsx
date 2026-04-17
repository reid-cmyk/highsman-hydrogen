import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Google Routes API — Multi-Stop Polyline for the Weekend Route Planner
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/route-polyline
//
// Body (JSON):
//   {
//     waypoints: [{lat, lng}, {lat, lng}, ...]  // ≥2 points; index 0 is origin,
//                                                // last is destination, everything
//                                                // in between is an intermediate
//     departureDateTime?: string                 // ISO (optional)
//     trafficAware?: boolean                     // default false — Reid wants
//                                                // no-traffic baseline for the
//                                                // route visualization
//   }
//
// Returns:
//   {
//     ok: true,
//     encodedPolyline: string,                   // Google encoded polyline of the
//                                                // whole route (decode client-side
//                                                // via google.maps.geometry.encoding)
//     durationSeconds: number,                   // total drive time (no traffic)
//     distanceMeters: number,
//     legs: [{durationSeconds, distanceMeters}], // hub→stop1, stop1→stop2, ...
//   }
//   or { ok: false, error }
//
// Reuses env.GOOGLE_PLACES_API_KEY — same Google Cloud project key as
// /api/route-time and /api/rep-assign. Routes API must be enabled on that key.
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache keyed by the full waypoint chain. A rep's daily route is
// stable for a given set of stops, so repeat renders (re-opens, tab switches)
// don't need to hit Google again.
const cache = new Map<string, {value: any; expiresAt: number}>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

type LatLng = {lat: number; lng: number};

function cacheKey(waypoints: LatLng[], hourBucket: string, trafficAware: boolean): string {
  const r = (n: number) => n.toFixed(4);
  const pts = waypoints.map((w) => `${r(w.lat)},${r(w.lng)}`).join('|');
  return `${pts}@${hourBucket}@${trafficAware ? 'T' : 'F'}`;
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'Body must be JSON'}, {status: 400});
  }

  const waypoints: LatLng[] = Array.isArray(body?.waypoints)
    ? body.waypoints
        .map((w: any) => ({lat: parseFloat(w?.lat), lng: parseFloat(w?.lng)}))
        .filter((w: LatLng) => Number.isFinite(w.lat) && Number.isFinite(w.lng))
    : [];

  if (waypoints.length < 2) {
    return json(
      {ok: false, error: 'waypoints must have ≥2 valid lat/lng pairs'},
      {status: 400},
    );
  }

  const departureDateTime = (body?.departureDateTime || '').trim?.() || '';
  const trafficAware = !!body?.trafficAware;

  const env = context.env as any;
  const apiKey = env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    console.warn('[api/route-polyline] GOOGLE_PLACES_API_KEY not configured');
    return json({ok: false, error: 'Route lookup unavailable'}, {status: 200});
  }

  const hourBucket = departureDateTime ? departureDateTime.slice(0, 13) : 'default';
  const key = cacheKey(waypoints, hourBucket, trafficAware);
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return json(cached.value, {
      headers: {'Cache-Control': 'private, max-age=1800'},
    });
  }

  // Routes API rejects departureTime in the past; only include for future.
  const includeDeparture =
    trafficAware &&
    !!departureDateTime &&
    new Date(departureDateTime).getTime() > now + 60_000;

  const origin = waypoints[0];
  const destination = waypoints[waypoints.length - 1];
  const intermediates = waypoints.slice(1, -1);

  const reqBody: Record<string, any> = {
    origin: {location: {latLng: {latitude: origin.lat, longitude: origin.lng}}},
    destination: {
      location: {latLng: {latitude: destination.lat, longitude: destination.lng}},
    },
    travelMode: 'DRIVE',
    // Reid: "Assume low traffic impact" — default to TRAFFIC_UNAWARE. Caller
    // can opt in to traffic-aware by passing trafficAware: true.
    routingPreference: includeDeparture ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
    languageCode: 'en-US',
    units: 'IMPERIAL',
    polylineEncoding: 'ENCODED_POLYLINE',
  };
  if (intermediates.length > 0) {
    reqBody.intermediates = intermediates.map((p) => ({
      location: {latLng: {latitude: p.lat, longitude: p.lng}},
    }));
  }
  if (includeDeparture) {
    reqBody.departureTime = new Date(departureDateTime).toISOString();
  }

  try {
    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Ask for the whole-route polyline + per-leg durations.
          'X-Goog-FieldMask':
            'routes.duration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.duration,routes.legs.distanceMeters',
        },
        body: JSON.stringify(reqBody),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(
        `[api/route-polyline] Routes API ${res.status}: ${text.slice(0, 400)}`,
      );
      return json(
        {ok: false, error: `Routes API error (${res.status})`},
        {status: 200},
      );
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) {
      return json({ok: false, error: 'No route found'}, {status: 200});
    }

    const durStr: string = route.duration || '0s';
    const durationSeconds = parseInt(durStr.replace(/s$/, ''), 10) || 0;
    const distanceMeters = route.distanceMeters || 0;
    const encodedPolyline: string = route.polyline?.encodedPolyline || '';
    const legs: Array<{durationSeconds: number; distanceMeters: number}> =
      (route.legs || []).map((leg: any) => ({
        durationSeconds: parseInt(
          String(leg.duration || '0s').replace(/s$/, ''),
          10,
        ) || 0,
        distanceMeters: leg.distanceMeters || 0,
      }));

    const value = {
      ok: true,
      encodedPolyline,
      durationSeconds,
      distanceMeters,
      legs,
    };
    cache.set(key, {value, expiresAt: now + CACHE_TTL_MS});
    return json(value, {headers: {'Cache-Control': 'private, max-age=1800'}});
  } catch (err: any) {
    console.error('[api/route-polyline] Error:', err?.message);
    return json({ok: false, error: 'Route lookup failed'}, {status: 200});
  }
}
