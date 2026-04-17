import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Google Maps — Drive-Time Lookup (Routes API v2)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/route-time
//
// Body (form data):
//   originLat, originLng         — origin point (required)
//   destLat, destLng             — destination point (required)
//   departureDateTime            — ISO 8601 with NJ offset (optional; improves
//                                  duration accuracy via traffic-aware routing
//                                  for the given weekday + hour)
//
// Returns JSON:
//   { ok: true,  minutes, seconds, text, meters }
//   { ok: false, error }
//
// Reuses env.GOOGLE_PLACES_API_KEY — same Google Cloud project key as
// /api/places. Routes API must be enabled on that key.
// ─────────────────────────────────────────────────────────────────────────────

// In-memory cache keyed by origin+dest+hour bucket (per worker instance).
// Saves Google API calls when staff toggles between dispensaries repeatedly.
const cache = new Map<string, {value: any; expiresAt: number}>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function cacheKey(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  hourBucket: string,
): string {
  // Round coords to 4 decimals (~11m precision) so nearby points coalesce.
  const r = (n: number) => n.toFixed(4);
  return `${r(originLat)},${r(originLng)}->${r(destLat)},${r(destLng)}@${hourBucket}`;
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const fd = await request.formData();
  const originLat = parseFloat((fd.get('originLat') as string) || '');
  const originLng = parseFloat((fd.get('originLng') as string) || '');
  const destLat = parseFloat((fd.get('destLat') as string) || '');
  const destLng = parseFloat((fd.get('destLng') as string) || '');
  const departureDateTime = ((fd.get('departureDateTime') as string) || '').trim();

  if (
    !Number.isFinite(originLat) ||
    !Number.isFinite(originLng) ||
    !Number.isFinite(destLat) ||
    !Number.isFinite(destLng)
  ) {
    return json(
      {ok: false, error: 'originLat, originLng, destLat, destLng are required numbers'},
      {status: 400},
    );
  }

  // If origin == destination (same point within rounding), zero drive time.
  if (Math.abs(originLat - destLat) < 1e-4 && Math.abs(originLng - destLng) < 1e-4) {
    return json({ok: true, minutes: 0, seconds: 0, text: '0 min', meters: 0});
  }

  const env = context.env as any;
  const apiKey = env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    console.warn('[api/route-time] GOOGLE_PLACES_API_KEY not configured');
    // Graceful degradation — if the key isn't wired up, treat as unknown.
    return json(
      {ok: false, error: 'Drive-time check unavailable (key not configured)'},
      {status: 200},
    );
  }

  // Hour bucket for cache — YYYY-MM-DDTHH (NJ local) or "default".
  const hourBucket = departureDateTime
    ? departureDateTime.slice(0, 13)
    : 'default';
  const key = cacheKey(originLat, originLng, destLat, destLng, hourBucket);

  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) {
    return json(cached.value, {
      headers: {'Cache-Control': 'private, max-age=600'},
    });
  }

  // Routes API v2 rejects departureTime if it's in the past. Only include it
  // when we have a future time — otherwise omit and let it fall back to now.
  const includeDeparture =
    departureDateTime && new Date(departureDateTime).getTime() > now + 60_000;

  const body: Record<string, any> = {
    origin: {location: {latLng: {latitude: originLat, longitude: originLng}}},
    destination: {location: {latLng: {latitude: destLat, longitude: destLng}}},
    travelMode: 'DRIVE',
    routingPreference: includeDeparture ? 'TRAFFIC_AWARE' : 'TRAFFIC_UNAWARE',
    languageCode: 'en-US',
    units: 'IMPERIAL',
  };
  if (includeDeparture) {
    body.departureTime = new Date(departureDateTime).toISOString();
  }

  try {
    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
          // Only return what we need — saves bandwidth and Google pricing tier.
          'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
        body: JSON.stringify(body),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/route-time] Routes API error (${res.status}): ${text.slice(0, 400)}`);
      return json(
        {ok: false, error: `Routes API error (${res.status})`},
        {status: 200},
      );
    }

    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) {
      return json({ok: false, error: 'No route found between points'}, {status: 200});
    }

    // Google returns duration as a string like "1423s"
    const durationStr: string = route.duration || '0s';
    const seconds = parseInt(durationStr.replace(/s$/, ''), 10) || 0;
    const minutes = Math.round(seconds / 60);
    const meters = route.distanceMeters || 0;

    const text =
      minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`;

    const value = {ok: true, minutes, seconds, text, meters};
    cache.set(key, {value, expiresAt: now + CACHE_TTL_MS});

    return json(value, {
      headers: {'Cache-Control': 'private, max-age=600'},
    });
  } catch (err: any) {
    console.error('[api/route-time] Error:', err?.message);
    return json({ok: false, error: 'Drive-time check failed'}, {status: 200});
  }
}
