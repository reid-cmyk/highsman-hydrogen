import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getAccessToken} from '~/lib/zoho-auth';
import {sendEmailFromUser, isGmailSAConfigured} from '~/lib/gmail-sa';
import {createCalendarEvent, isCalendarSAConfigured} from '~/lib/google-calendar-sa';
import {REP_HUBS, type RepId} from '~/lib/reps';

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
//   shiftLabel       — human-readable, e.g. "1:00 – 4:00 PM" (optional; for Description)
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

// Shift key → start/end hours in 24h local time.
// Thu/Fri main: 15:00–19:00. Sat matinee: 13:00–16:00. Sat late: 17:00–20:00.
// Saturday shifts locked to 1–4 PM / 5–8 PM per Reid on 2026-04-17 — gives the
// rep a 1-hour breather to reset between stops instead of a back-to-back hop.
function shiftHours(shiftKey: string): {startH: number; endH: number} {
  if (shiftKey.endsWith('-main')) return {startH: 15, endH: 19};
  if (shiftKey.endsWith('-mat')) return {startH: 13, endH: 16};
  if (shiftKey.endsWith('-late')) return {startH: 17, endH: 20};
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


// ─────────────────────────────────────────────────────────────────────────────
// Highsman-brand-voice HTML email — pop-up confirmation
// ─────────────────────────────────────────────────────────────────────────────
// Floor-register voice (concise, confident, assumptive — no permission-seeking).
// Black/gold palette per brand guidelines. Shopify CDN logo per memory
// `feedback_highsman_email_logos.md`. Inline styles only — most enterprise
// dispensary inboxes (Outlook on Windows, GoDaddy, Zoho) strip <style> tags.
// ─────────────────────────────────────────────────────────────────────────────
function renderPopupConfirmHtml(args: {
  pocFirstName: string;
  dispensaryName: string;
  city: string;
  friendlyDate: string;
  shiftTimeLabel: string;
  repName: string;
}): string {
  const {pocFirstName, dispensaryName, city, friendlyDate, shiftTimeLabel, repName} = args;
  // Highsman's actual Shopify shop is 0752/8598/7491 — the wrong shop ID
  // that lived here (0934/4853/0945) belongs to nothing we own, so the
  // header/footer logos rendered as broken-image icons in Reid's inbox.
  // Canonical URLs per memory `feedback_highsman_email_logos.md`.
  const headerLogo =
    'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430';
  const footerLogo =
    'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430';
  const storeLine = `${dispensaryName}${city ? `, ${city}, NJ` : ''}`;
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#000000;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#000000;border:1px solid #1a1a1a;">
        <tr><td align="center" style="padding:40px 32px 24px 32px;border-bottom:1px solid #1a1a1a;">
          <img src="${headerLogo}" alt="Highsman" width="180" style="display:block;border:0;outline:none;text-decoration:none;height:auto;" />
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 8px 0;color:#C9A867;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:2px;text-transform:uppercase;">Pop-Up Confirmed</p>
          <h1 style="margin:0 0 24px 0;color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:28px;line-height:1.2;font-weight:700;">Highsman x ${escape(dispensaryName)}</h1>
          <p style="margin:0 0 20px 0;color:#FFFFFF;font-size:16px;line-height:1.5;">Hi ${escape(pocFirstName)},</p>
          <p style="margin:0 0 20px 0;color:#FFFFFF;font-size:16px;line-height:1.5;">Locked in. We're rolling into <strong style="color:#C9A867;">${escape(dispensaryName)}</strong> for a pop-up on <strong style="color:#C9A867;">${escape(friendlyDate)}</strong> from <strong style="color:#C9A867;">${escape(shiftTimeLabel)}</strong>.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background:#0a0a0a;border:1px solid #C9A867;">
            <tr><td style="padding:20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="padding:6px 0;color:#A9ACAF;font-size:13px;letter-spacing:1px;text-transform:uppercase;width:140px;">Date / Time</td>
                  <td style="padding:6px 0;color:#FFFFFF;font-size:15px;">${escape(friendlyDate)} · ${escape(shiftTimeLabel)}</td>
                </tr>
                <tr>
                  <td style="padding:6px 0;color:#A9ACAF;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Store</td>
                  <td style="padding:6px 0;color:#FFFFFF;font-size:15px;">${escape(storeLine)}</td>
                </tr>
                ${
                  repName
                    ? `<tr><td style="padding:6px 0;color:#A9ACAF;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Rep on Duty</td><td style="padding:6px 0;color:#FFFFFF;font-size:15px;">${escape(repName)}</td></tr>`
                    : ''
                }
                <tr>
                  <td style="padding:6px 0;color:#A9ACAF;font-size:13px;letter-spacing:1px;text-transform:uppercase;">Bringing</td>
                  <td style="padding:6px 0;color:#FFFFFF;font-size:15px;">Hit Stick · Pre-Rolls · Ground Game</td>
                </tr>
              </table>
            </td></tr>
          </table>
          <p style="margin:0 0 20px 0;color:#FFFFFF;font-size:15px;line-height:1.5;">A calendar invite from <span style="color:#C9A867;">popups@highsman.com</span> is in your inbox — accept it and you're locked in.</p>
          <p style="margin:0 0 20px 0;color:#FFFFFF;font-size:15px;line-height:1.5;">Day-of questions or last-minute changes, hit me directly:<br/><a href="mailto:sky@highsman.com" style="color:#C9A867;text-decoration:none;">sky@highsman.com</a> &nbsp;·&nbsp; <a href="tel:+19297253511" style="color:#C9A867;text-decoration:none;">929-725-3511</a></p>
          <p style="margin:32px 0 0 0;color:#FFFFFF;font-size:16px;line-height:1.5;">Let's spark greatness.</p>
          <p style="margin:8px 0 0 0;color:#FFFFFF;font-size:16px;line-height:1.5;">— Sky</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 32px 32px 32px;border-top:1px solid #1a1a1a;">
          <img src="${footerLogo}" alt="Spark Greatness" width="160" style="display:block;border:0;outline:none;text-decoration:none;height:auto;margin:0 auto 12px auto;" />
          <p style="margin:0;color:#A9ACAF;font-size:11px;letter-spacing:2px;text-transform:uppercase;">Highsman &nbsp;|&nbsp; highsman.com</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

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
  // Snr Staff out-of-coverage override — stamped on Description so the CRM
  // record shows this booking was a human exception, not an automatic pass.
  const coverageOverride =
    ((fd.get('coverageOverride') as string) || '').trim() === '1';
  const coverageOverrideReason = ((fd.get('coverageOverrideReason') as string) || '').trim();
  const coverageOverrideApprovedBy = ((fd.get('coverageOverrideApprovedBy') as string) || '').trim();
  const coverageOverrideMessage = ((fd.get('coverageOverrideMessage') as string) || '').trim();

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
    if (coverageOverride) {
      descriptionLines.push(
        '',
        '⚠ SNR STAFF OVERRIDE — OUT OF NJ COVERAGE',
        `  Approved by: ${coverageOverrideApprovedBy || 'Snr Staff'}`,
        `  Reason: ${coverageOverrideReason || '(no reason provided)'}`,
      );
      if (coverageOverrideMessage) {
        descriptionLines.push(`  Block detail: ${coverageOverrideMessage}`);
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
    // Snr Staff override adds a "[OVR]" flag so exception bookings are visible
    // at-a-glance on the calendar (not just buried in Description).
    const titlePrefix = `${repTag ? `${repTag} ` : ''}${coverageOverride ? '[OVR] ' : ''}`;
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

    // ──────────────────────────────────────────────────────────────────────
    // SIDE-EFFECTS: Google Calendar invite + Sky confirmation email
    // ──────────────────────────────────────────────────────────────────────
    // Booking is already persisted in Zoho at this point — both side-effects
    // run fire-and-forget with their own try/catch so a Gmail/Calendar outage
    // never breaks the booking. Results are returned in the response so the
    // UI can flag partial successes (e.g. "booked, invite failed").
    //
    // Calendar:
    //   • Owner: popups@highsman.com (master pop-up calendar — staff sees all)
    //   • Attendees: POC, sales@highsman.com, sky@highsman.com, assigned rep email
    //   • sendUpdates=all → Google emails the canonical .ics invite to all
    //
    // Email:
    //   • From: sky@highsman.com (Highsman brand voice, "Spark Greatness")
    //   • To: POC
    //   • Cc: assigned rep email (if known) + sales@highsman.com
    // ──────────────────────────────────────────────────────────────────────
    let calendarInvite: {ok: boolean; htmlLink?: string; error?: string} = {ok: false};
    let confirmationEmail: {ok: boolean; messageId?: string; error?: string} = {ok: false};

    // Resolve rep email from the rep registry (currently null until reps are seated).
    const repEmail = (() => {
      if (!repTag) return null;
      const id: RepId | null =
        repTag === '[NJ-N]' ? 'north' : repTag === '[NJ-S]' ? 'south' : null;
      return id ? REP_HUBS[id].email || null : null;
    })();

    const friendlyDate = new Date(`${date}T12:00:00${offset}`).toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'America/New_York',
    });
    const shiftTimeLabel =
      shiftLabel ||
      (shiftKey.endsWith('-main')
        ? '3:00 PM – 7:00 PM'
        : shiftKey.endsWith('-mat')
          ? '1:00 PM – 4:00 PM'
          : shiftKey.endsWith('-late')
            ? '5:00 PM – 8:00 PM'
            : 'Shift TBD');
    const venueLine = [street, city ? `${city}, NJ` : null].filter(Boolean).join(', ');
    const pocFirstName = (contactName.split(' ')[0] || 'Team').trim();

    // ── Calendar event ──
    if (contactEmail && isCalendarSAConfigured(env)) {
      try {
        const attendees = [contactEmail, 'sales@highsman.com', 'sky@highsman.com'];
        if (repEmail) attendees.push(repEmail);

        const calendarDescription = [
          `Highsman pop-up at ${dispensaryName}${city ? ` — ${city}, NJ` : ''}.`,
          ``,
          `Shift: ${shiftTimeLabel}`,
          repName ? `Highsman Rep on Duty: ${repName}` : null,
          contactName ? `Dispensary POC: ${contactName}${contactRole ? ` (${contactRole})` : ''}` : null,
          ``,
          `Bringing: Hit Stick, Pre-Rolls, Ground Game.`,
          `Day-of contact: sky@highsman.com / 929-725-3511`,
        ]
          .filter(Boolean)
          .join('\n');

        const calendarRes = await createCalendarEvent(
          {
            calendarOwner: 'popups@highsman.com',
            summary: `Highsman Pop-Up — ${dispensaryName}${city ? ` (${city})` : ''}`,
            description: calendarDescription,
            location: venueLine || `${dispensaryName}, NJ`,
            startDateTime: startISO,
            endDateTime: endISO,
            timeZone: 'America/New_York',
            attendees,
            sendUpdates: 'all',
          },
          env,
        );
        calendarInvite = {ok: true, htmlLink: calendarRes.htmlLink};
      } catch (calErr: any) {
        console.warn('[api/popups-book] Calendar invite failed:', calErr?.message);
        calendarInvite = {ok: false, error: calErr?.message?.slice(0, 200)};
      }
    } else if (contactEmail) {
      console.warn('[api/popups-book] Calendar SA not configured — skipping invite.');
    }

    // ── Confirmation email from sky@highsman.com ──
    if (contactEmail && isGmailSAConfigured(env)) {
      try {
        const ccList = ['sales@highsman.com'];
        if (repEmail) ccList.push(repEmail);

        const subject = `Pop-up confirmed — Highsman x ${dispensaryName} — ${friendlyDate}`;

        const textLines = [
          `Hi ${pocFirstName},`,
          ``,
          `Locked in. Highsman is rolling into ${dispensaryName} for a pop-up on ${friendlyDate} from ${shiftTimeLabel}.`,
          ``,
          `Here's the play:`,
          `  • Date / Time: ${friendlyDate} · ${shiftTimeLabel}`,
          `  • Store: ${dispensaryName}${city ? `, ${city}, NJ` : ''}`,
          repName ? `  • Highsman Rep on Duty: ${repName}` : null,
          `  • Bringing: Hit Stick, Pre-Rolls, Ground Game — full lineup, on-site activation`,
          ``,
          `A calendar invite from popups@highsman.com is in your inbox — accept it and you're locked in.`,
          ``,
          `Day-of questions or last-minute changes, hit me directly: sky@highsman.com / 929-725-3511.`,
          ``,
          `Let's spark greatness.`,
          ``,
          `— Sky`,
          `Sky Lima`,
          `Highsman`,
          `sky@highsman.com`,
          `highsman.com`,
        ]
          .filter(Boolean)
          .join('\n');

        const htmlBody = renderPopupConfirmHtml({
          pocFirstName,
          dispensaryName,
          city,
          friendlyDate,
          shiftTimeLabel,
          repName,
        });

        const messageId = await sendEmailFromUser(
          'sky@highsman.com',
          {
            to: contactEmail,
            cc: ccList.join(', '),
            subject,
            textBody: textLines,
            htmlBody,
            fromName: 'Sky Lima — Highsman',
            replyTo: 'sky@highsman.com',
          },
          env,
        );
        confirmationEmail = {ok: true, messageId};
      } catch (emailErr: any) {
        console.warn('[api/popups-book] Confirmation email failed:', emailErr?.message);
        confirmationEmail = {ok: false, error: emailErr?.message?.slice(0, 200)};
      }
    } else if (contactEmail) {
      console.warn('[api/popups-book] Gmail SA not configured — skipping confirmation email.');
    }

    return json({
      ok: true,
      eventId: record.details.id,
      startDateTime: startISO,
      endDateTime: endISO,
      lastPopUpDate,
      calendarInvite,
      confirmationEmail,
    });
  } catch (err: any) {
    console.error('[api/popups-book] Error:', err.message);
    return json(
      {ok: false, error: 'Could not create Zoho Event. Booking is still saved locally.'},
      {status: 500},
    );
  }
}
