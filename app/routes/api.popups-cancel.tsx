import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getAccessToken} from '~/lib/zoho-auth';
import {deleteCalendarEvent, isCalendarSAConfigured} from '~/lib/google-calendar-sa';

// ─────────────────────────────────────────────────────────────────────────────
// /api/popups-cancel — One-click cancel for a pop-up booking.
// ─────────────────────────────────────────────────────────────────────────────
// Deletes BOTH the Zoho CRM Event and the matching Google Calendar invite
// (which sends cancellation notices to the dispensary POC, the rep, and
// sales@ automatically). Used by the cancel button on /njnorth + /njsouth.
//
// Body (form data):
//   eventId — Zoho CRM Event ID (required)
//
// The Calendar event ID is read from the Zoho Event Description, which
// /api/popups-book stamps as `[CalendarEventId]<id>@popups@highsman.com`
// after the Calendar event is created. Bookings made before that field was
// added will only have their Zoho Event deleted; the Calendar invite has
// to be removed manually for those (rare, just legacy data).
// ─────────────────────────────────────────────────────────────────────────────

const CALENDAR_OWNER = 'popups@highsman.com';

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const fd = await request.formData();
  const eventId = ((fd.get('eventId') as string) || '').trim();
  if (!eventId) {
    return json({ok: false, error: 'eventId required'}, {status: 400});
  }

  const env = context.env as any;
  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    return json({ok: false, error: 'Zoho creds not configured'}, {status: 500});
  }

  try {
    const accessToken = await getAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    // ── 1. Fetch the Zoho Event to recover the Calendar event ID ──
    let calendarEventId: string | null = null;
    try {
      const r = await fetch(
        `https://www.zohoapis.com/crm/v7/Events/${eventId}?fields=Description,Event_Title`,
        {headers: {Authorization: `Zoho-oauthtoken ${accessToken}`}},
      );
      if (r.ok) {
        const d: any = await r.json().catch(() => ({}));
        const desc: string = d?.data?.[0]?.Description || '';
        // Match `[CalendarEventId]<id>@popups@highsman.com`
        const m = desc.match(/\[CalendarEventId\]([A-Za-z0-9_-]+)@/);
        if (m) calendarEventId = m[1];
      }
    } catch {/* fall through */}

    // ── 2. Delete the Google Calendar event (best-effort) ──
    let calendarDelete: {ok: boolean; error?: string} = {ok: false};
    if (calendarEventId && isCalendarSAConfigured(env)) {
      try {
        await deleteCalendarEvent(
          {calendarOwner: CALENDAR_OWNER, eventId: calendarEventId, sendUpdates: 'all'},
          env,
        );
        calendarDelete = {ok: true};
      } catch (calErr: any) {
        // Log but don't fail the whole request — the Zoho delete is the
        // source of truth for the dashboard. Calendar can be cleaned up
        // manually if this fails.
        console.warn('[api/popups-cancel] Calendar delete failed:', calErr?.message);
        calendarDelete = {ok: false, error: calErr?.message?.slice(0, 200)};
      }
    } else if (!calendarEventId) {
      calendarDelete = {ok: false, error: 'no_calendar_id_on_zoho_event'};
    } else {
      calendarDelete = {ok: false, error: 'calendar_sa_not_configured'};
    }

    // ── 3. Delete the Zoho Event ──
    const delRes = await fetch(
      `https://www.zohoapis.com/crm/v7/Events?ids=${encodeURIComponent(eventId)}`,
      {
        method: 'DELETE',
        headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
      },
    );

    if (!delRes.ok) {
      const text = await delRes.text().catch(() => '');
      throw new Error(`Zoho Event delete ${delRes.status}: ${text.slice(0, 300)}`);
    }
    const data = await delRes.json().catch(() => ({}));
    const record = data.data?.[0];
    if (record?.status !== 'success') {
      throw new Error(`Zoho Event delete rejected: ${JSON.stringify(record?.details || {})}`);
    }

    return json({
      ok: true,
      eventId,
      calendarDelete,
    });
  } catch (err: any) {
    console.error('[api/popups-cancel] Error:', err.message);
    return json(
      {ok: false, error: err.message?.slice(0, 200) || 'cancel failed'},
      {status: 500},
    );
  }
}

export async function loader() {
  return json({ok: false, error: 'Method not allowed'}, {status: 405});
}
