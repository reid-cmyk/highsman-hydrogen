import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Google Places — Server-side API Proxy
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/places?q=123+Main+St        → Autocomplete suggestions
// GET /api/places?placeId=ChIJ...      → Place details (structured address)
// Keeps the Google API key server-side (never exposed to browser).
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const placeId = (url.searchParams.get('placeId') || '').trim();

  const env = context.env as any;
  const apiKey = env.GOOGLE_PLACES_NEW_API_KEY || env.GOOGLE_PLACES_API_KEY;

  if (!apiKey) {
    console.warn('[api/places] GOOGLE_PLACES_API_KEY not configured — set this in Oxygen env vars');
    return json({predictions: [], error: 'GOOGLE_PLACES_API_KEY not set'}, {
      status: 200,
      headers: {'Cache-Control': 'no-store'},
    });
  }

  // ── Place Details (resolve placeId → structured address) ──────────────
  if (placeId) {
    try {
      const res = await fetch(
        `https://places.googleapis.com/v1/places/${placeId}`,
        {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'addressComponents,formattedAddress,displayName,nationalPhoneNumber,websiteUri',
          },
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error(`[api/places] Details error (${res.status}): ${text.slice(0, 300)}`);
        return json({address: null, error: 'Details unavailable'}, {status: 200});
      }

      const data = await res.json();
      const components = data.addressComponents || [];

      const get = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.longText || '';
      const getShort = (type: string) =>
        components.find((c: any) => c.types?.includes(type))?.shortText || '';

      const streetNumber = get('street_number');
      const route = get('route');
      const street = [streetNumber, route].filter(Boolean).join(' ');
      const city = get('locality') || get('sublocality') || get('administrative_area_level_3');
      const state = getShort('administrative_area_level_1');
      const zip = get('postal_code');

      return json({
        address: {
          street,
          city,
          state,
          zip,
          display: data.formattedAddress || [street, city, state, zip].filter(Boolean).join(', '),
          name: data.displayName?.text || '',
          phone: data.nationalPhoneNumber || '',
          website: data.websiteUri || '',
        },
      }, {
        headers: {'Cache-Control': 'public, max-age=86400'}, // addresses don't change
      });
    } catch (err: any) {
      console.error('[api/places] Details error:', err.message);
      return json({address: null, error: 'Details unavailable'}, {status: 200});
    }
  }

  // ── Autocomplete ──────────────────────────────────────────────────────
  // type=business → search dispensary/business names, no location bias
  // default       → street address lookup with NJ bias (existing delivery behavior)
  const isBusiness = url.searchParams.get('type') === 'business';

  if (query.length < 3) {
    return json({predictions: []}, {
      headers: {'Cache-Control': 'no-store'},
    });
  }

  try {
    const res = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
      },
      body: JSON.stringify(
        isBusiness
          ? {
              // Business search: no type filter, no location bias — find any business in the US
              input: query,
              includedRegionCodes: ['us'],
            }
          : {
              // Address search: street addresses with NJ bias (delivery/retail use)
              input: query,
              includedPrimaryTypes: ['street_address', 'premise', 'subpremise', 'route'],
              includedRegionCodes: ['us'],
              locationBias: {
                rectangle: {
                  low: {latitude: 38.9, longitude: -75.6},
                  high: {latitude: 41.4, longitude: -73.9},
                },
              },
            }
      ),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`[api/places] Autocomplete error (${res.status}): ${text.slice(0, 300)}`);
      return json({predictions: [], error: 'Search unavailable'}, {
        status: 200,
        headers: {'Cache-Control': 'no-store'},
      });
    }

    const data = await res.json();
    const suggestions = (data.suggestions || [])
      .filter((s: any) => s.placePrediction)
      .slice(0, 6)
      .map((s: any) => {
        const p = s.placePrediction;
        return {
          placeId: p.placeId,
          description: p.text?.text || '',
          mainText: p.structuredFormat?.mainText?.text || '',
          secondaryText: p.structuredFormat?.secondaryText?.text || '',
        };
      });

    return json({predictions: suggestions}, {
      headers: {
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err: any) {
    console.error('[api/places] Autocomplete error:', err.message);
    return json({predictions: [], error: 'Search unavailable'}, {
      status: 200,
      headers: {'Cache-Control': 'no-store'},
    });
  }
}
