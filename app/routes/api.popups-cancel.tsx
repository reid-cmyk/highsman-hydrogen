import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getAccessToken} from '~/lib/zoho-auth';
import {deleteCalendarEvent, findCalendarEventsByTitle, isCalendarSAConfigured} from '~/lib/google-calendar-sa';

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

    // ── 1. Fetch the Zoho Event to recover the Calendar event ID + metadata
    let calendarEventId: string | null = null;
    let zohoTitle = '';
    let zohoStartIso = '';
    let zohoEndIso = '';
    try {
      const r = await fetch(
        `https://www.zohoapis.com/crm/v7/Events/${eventId}?fields=Description,Event_Title,Start_DateTime,End_DateTime`,
        {headers: {Authorization: `Zoho-oauthtoken ${accessToken}`}},
      );
      if (r.ok) {
        const d: any = await r.json().catch(() => ({}));
        const rec = d?.data?.[0] || {};
        const desc: string = rec.Description || '';
        zohoTitle = String(rec.Event_Title || '');
        zohoStartIso = String(rec.Start_DateTime || '');
        zohoEndIso = String(rec.End_DateTime || '');
        const m = desc.match(/\[CalendarEventId\]([A-Za-z0-9_-]+)@/);
        if (m) calendarEventId = m[1];
      }
    } catch {/* fall through */}

    // ── 2. Delete the Google Calendar event (best-effort) ──
    // Two-tier resolution: (a) explicit ID stamped on the Zoho Description by
    // /api/popups-book — fast, accurate. (b) Fuzzy fallback — list calendar
    // events on the same day and match by dispensary name in the summary.
    // Fuzzy is necessary for legacy bookings made before the stamp shipped,
    // and for cases where the PATCH to add the stamp silently failed.
    let calendarDelete: {ok: boolean; error?: string; matched?: string[]} = {ok: false};
    if (isCalendarSAConfigured(env)) {
      const idsToDelete: string[] = [];
      if (calendarEventId) idsToDelete.push(calendarEventId);

      // ALWAYS run fuzzy in addition to the explicit ID. The Zoho-Google
      // Calendar sync creates a SECOND Calendar event on popups@highsman.com
      // when we POST a Zoho Event — that synced one doesn't carry our
      // [CalendarEventId] tag, so the explicit-ID delete misses it. The
      // fuzzy pass catches the duplicate (and is a no-op if the explicit ID
      // was the only one there, since we de-dupe the IDs below).
      if (zohoTitle && zohoStartIso) {
        try {
          // Parse dispensary name out of "[NJ-N] Highsman Pop Up — DispName (Shift)"
          const dashSplit = zohoTitle.split('—');
          const dispNameRaw = dashSplit.length > 1 ? dashSplit[1] : zohoTitle;
          const dispName = dispNameRaw.replace(/\s*\([^)]+\)\s*$/, '').trim();
          // Pull a date string like 2026-05-15 from the Start_DateTime
          const date = zohoStartIso.slice(0, 10);
          if (dispName && date) {
            const fuzzy = await findCalendarEventsByTitle(
              {
                calendarOwner: CALENDAR_OWNER,
                date,
                titleContains: dispName,
              },
              env,
            );
            for (const id of fuzzy) idsToDelete.push(id);
          }
        } catch (fuzzyErr: any) {
          console.warn('[api/popups-cancel] Fuzzy lookup failed:', fuzzyErr?.message);
        }
      }

      const matched: string[] = [];
      const errors: string[] = [];
      // Dedup: explicit ID + fuzzy can hit the same event, no need to try twice.
      const uniqueIds = Array.from(new Set(idsToDelete.filter(Boolean)));
      for (const calId of uniqueIds) {
        try {
          await deleteCalendarEvent(
            {calendarOwner: CALENDAR_OWNER, eventId: calId, sendUpdates: 'all'},
            env,
          );
          matched.push(calId);
        } catch (calErr: any) {
          console.warn('[api/popups-cancel] Calendar delete failed:', calErr?.message);
          errors.push(calErr?.message?.slice(0, 100) || 'delete failed');
        }
      }

      if (matched.length > 0) {
        // Even if some IDs failed (e.g. already-deleted), we count this as
        // success because at least one Calendar event was successfully removed.
        calendarDelete = {ok: true, matched};
      } else if (errors.length > 0) {
        calendarDelete = {ok: false, error: errors.join('; ')};
      } else {
        calendarDelete = {ok: false, error: 'no_calendar_event_found'};
      }
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
