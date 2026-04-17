import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Zoho CRM — Pop-Up Event Creation
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/popups-book
//
// Creates a Zoho CRM Event linked to the dispensary Account for every pop-up
// booking on /njpopups. The Event shows up in the Account's Activities timeline
// so you can look at any dispensary and see every pop-up ever booked there,
// plus upcoming ones on the Zoho calendar.
//
// Body (form data):
//   accountId        — Zoho Account ID (required)
//   dispensaryName   — for Event_Title (required)
//   date             — YYYY-MM-DD, the pop-up date (required)
//   shiftKey         — e.g. 'thu-main', 'sat-mat', 'sat-late' (required)
//   shiftLabel       — human-readable, e.g. "1:00 – 3:00 PM" (optional; for Description)
//   channel          — "email" | "link" | "manual" (for Description)
//   contactName      — optional, for Description
//   contactEmail     — optional, for Description
//   contactPhone     — optional, for Description
//   contactRole      — optional, for Description
//   portalUrl        — optional, the Link_for_Pop_Ups value when channel='link'
//   city             — optional, for Venue/Location
//   street           — optional, for Location
//
// NOTE: This endpoint also PATCHes the Account's `Visit_Date` field (UI label
// "Last Pop Up Date") with the pop-up slot date, so any NJ dispensary in Zoho
// shows when its most recent pop-up was booked. The POC endpoint (/api/popups-poc)
// no longer touches Visit_Date.
// ─────────────────────────────────────────────────────────────────────────────

let cachedAccessToken: string | null = null;
let tokenExpiresAt = 0;

async function getAccessToken(env: {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}): Promise<string> {
  const now = Date.now();
  if (cachedAccessToken && now < tokenExpiresAt) return cachedAccessToken;

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
  cachedAccessToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedAccessToken!;
}

// Shift key → start/end hours in 24h local time.
// Thu/Fri main: 15:00–19:00. Sat/Sun matinee: 13:00–15:00. Sat/Sun late: 16:00–18:00.
function shiftHours(shiftKey: string): {startH: number; endH: number} {
  if (shiftKey.endsWith('-main')) return {startH: 15, endH: 19};
  if (shiftKey.endsWith('-mat')) return {startH: 13, endH: 15};
  if (shiftKey.endsWith('-late')) return {startH: 16, endH: 18};
  // Fallback — 2 PM to 4 PM
  return {startH: 14, endH: 16};
}

/**
 * New Jersey timezone offset for a given date. Handles DST boundaries automatically:
 *   EDT (-04:00) from the second Sunday of March through the first Sunday of November
 *   EST (-05:00) the rest of the year
 */
function njOffset(isoDate: string): '-04:00' | '-05:00' {
  const d = new Date(`${isoDate}T12:00:00Z`);
  const year = d.getUTCFullYear();

  // Second Sunday of March — DST starts at 2:00 AM ET (= 07:00 UTC that day)
  const marchFirst = new Date(Date.UTC(year, 2, 1));
  const marchFirstSunday = 1 + ((7 - marchFirst.getUTCDay()) % 7);
  const dstStart = new Date(Date.UTC(year, 2, marchFirstSunday + 7, 7, 0, 0));

  // First Sunday of November — DST ends at 2:00 AM ET (= 06:00 UTC that day, since
  // we were on EDT [-04] until switch: 02:00 EDT = 06:00 UTC)
  const novFirst = new Date(Date.UTC(year, 10, 1));
  const novFirstSunday = 1 + ((7 - novFirst.getUTCDay()) % 7);
  const dstEnd = new Date(Date.UTC(year, 10, novFirstSunday, 6, 0, 0));

  return d >= dstStart && d < dstEnd ? '-04:00' : '-05:00';
}

function toZohoDateTime(isoDate: string, hour: number, offset: string): string {
  const hh = String(hour).padStart(2, '0');
  return `${isoDate}T${hh}:00:00${offset}`;
}

function shiftTitleSuffix(shiftKey: string): string {
  if (shiftKey.endsWith('-main')) return 'Main Shift';
  if (shiftKey.endsWith('-mat')) return 'Matinee';
  if (shiftKey.endsWith('-late')) return 'Late Shift';
  return 'Pop Up';
}

// ─────────────────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const fd = await request.formData();
  const accountId = ((fd.get('accountId') as string) || '').trim();
  const dispensaryName = ((fd.get('dispensaryName') as string) || '').trim();
  const date = ((fd.get('date') as string) || '').trim();
  const shiftKey = ((fd.get('shiftKey') as string) || '').trim();
  const shiftLabel = ((fd.get('shiftLabel') as string) || '').trim();
  const channel = ((fd.get('channel') as string) || 'email').trim();
  const contactName = ((fd.get('contactName') as string) || '').trim();
  const contactEmail = ((fd.get('contactEmail') as string) || '').trim();
  const contactPhone = ((fd.get('contactPhone') as string) || '').trim();
  const contactRole = ((fd.get('contactRole') as string) || '').trim();
  const portalUrl = ((fd.get('portalUrl') as string) || '').trim();
  const city = ((fd.get('city') as string) || '').trim();
  const street = ((fd.get('street') as string) || '').trim();
  // Rep assignment (optional — only set when UI successfully resolved a rep).
  // repId is received but not persisted as its own field; Subject + Description
  // carry the identity. Later we can map it to a Zoho Host_Rep custom field.
  const repName = ((fd.get('repName') as string) || '').trim();
  const repTag = ((fd.get('repTag') as string) || '').trim();
  const repMode = ((fd.get('repMode') as string) || '').trim();
  const repDriveMin = ((fd.get('repDriveMin') as string) || '').trim();
  const repAnchorName = ((fd.get('repAnchorName') as string) || '').trim();

  if (!accountId || !dispensaryName || !date || !shiftKey) {
    return json(
      {ok: false, error: 'accountId, dispensaryName, date, and shiftKey are required.'},
      {status: 400},
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return json({ok: false, error: 'date must be YYYY-MM-DD'}, {status: 400});
  }

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.warn('[api/popups-book] Zoho credentials not configured — no-op.');
    return json({ok: true, note: 'CRM not configured — Event not created.'});
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const {startH, endH} = shiftHours(shiftKey);
    const offset = njOffset(date);
    const startISO = toZohoDateTime(date, startH, offset);
    const endISO = toZohoDateTime(date, endH, offset);

    const descriptionLines: string[] = [
      `Highsman Pop Up at ${dispensaryName}${city ? ` — ${city}` : ''}.`,
      `Shift: ${shiftLabel || shiftTitleSuffix(shiftKey)}`,
      `Booking Channel: ${channel === 'link' ? 'Dispensary Portal' : channel === 'manual' ? 'Email (new contact)' : 'Email'}`,
    ];
    if (repName) {
      const driveLine = repDriveMin ? ` (${repDriveMin} min${repMode === 'doubleheader' ? ` from ${repAnchorName || 'earlier stop'}` : ' from hub'})` : '';
      descriptionLines.push(`Rep on Duty: ${repName}${driveLine}`);
      if (repMode === 'doubleheader') {
        descriptionLines.push('  Doubleheader — same rep running an earlier stop that day.');
      }
    }
    if (contactName || contactEmail || contactPhone) {
      descriptionLines.push('', 'POC:');
      if (contactName) descriptionLines.push(`  Name: ${contactName}${contactRole ? ` (${contactRole})` : ''}`);
      if (contactEmail) descriptionLines.push(`  Email: ${contactEmail}`);
      if (contactPhone) descriptionLines.push(`  Phone: ${contactPhone}`);
    }
    if (channel === 'link' && portalUrl) {
      descriptionLines.push('', `Portal: ${portalUrl}`);
    }
    descriptionLines.push('', 'Created via /njpopups staff tool.');

    // Subject prefix makes the rep obvious in Zoho's calendar views without
    // needing to click into the Event. e.g. "[NJ-N] Highsman Pop Up — ..."
    const titlePrefix = repTag ? `${repTag} ` : '';
    const eventPayload: Record<string, any> = {
      Event_Title: `${titlePrefix}Highsman Pop Up — ${dispensaryName} (${shiftTitleSuffix(shiftKey)})`,
      Start_DateTime: startISO,
      End_DateTime: endISO,
      Description: descriptionLines.join('\n'),
      // Link to the Account via What_Id + $se_module (Zoho v7 convention)
      What_Id: accountId,
      $se_module: 'Accounts',
    };

    if (street || city) {
      eventPayload.Venue = [street, city].filter(Boolean).join(', ');
    }

    const res = await fetch('https://www.zohoapis.com/crm/v7/Events', {
      method: 'POST',
      headers: {
        Authorization: `Zoho-oauthtoken ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({data: [eventPayload], trigger: ['workflow']}),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Zoho Event create failed (${res.status}): ${text.slice(0, 500)}`);
    }

    const data = await res.json();
    const record = data.data?.[0];
    if (record?.status !== 'success') {
      throw new Error(`Zoho Event create rejected: ${JSON.stringify(record?.details || {})}`);
    }

    // Stamp the Account's Visit_Date (UI label: "Last Pop Up Date") with the
    // pop-up slot date. Fire-and-forget — Event creation already succeeded, so
    // a PATCH failure here shouldn't fail the whole request.
    let lastPopUpDate: string | null = null;
    try {
      const patchRes = await fetch(`https://www.zohoapis.com/crm/v7/Accounts/${accountId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          data: [{Visit_Date: date}],
          trigger: ['workflow'],
        }),
      });
      if (patchRes.ok) {
        lastPopUpDate = date;
      } else {
        const t = await patchRes.text().catch(() => '');
        console.warn(`[api/popups-book] Account PATCH (Visit_Date) failed: ${patchRes.status} ${t.slice(0, 300)}`);
      }
    } catch (patchErr: any) {
      console.warn('[api/popups-book] Account PATCH (Visit_Date) error:', patchErr?.message);
    }

    return json({
      ok: true,
      eventId: record.details.id,
      startDateTime: startISO,
      endDateTime: endISO,
      lastPopUpDate,
    });
  } catch (err: any) {
    console.error('[api/popups-book] Error:', err.message);
    return json(
      {ok: false, error: 'Could not create Zoho Event. Booking is still saved locally.'},
      {status: 500},
    );
  }
}
