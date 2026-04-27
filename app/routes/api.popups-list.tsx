import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/popups-list — list Highsman pop-up bookings for the Bookings tab.
// ─────────────────────────────────────────────────────────────────────────────
// Returns events from the past 14 days through 90 days out, filtered to the
// pop-up bookings created via /api/popups-book (title starts with `[NJ-N]`,
// `[NJ-S]`, `[OVR]`, or contains "Highsman Pop Up").
//
// Used by the Bookings tab on /njpopups. Auto-refreshed every 90s.
// ─────────────────────────────────────────────────────────────────────────────

type PopupBooking = {
  id: string;
  title: string;
  date: string;
  startIso: string;
  endIso: string;
  timeLabel: string;
  territory: 'north' | 'south' | 'unassigned';
  isOverride: boolean;
  accountId: string | null;
  accountName: string | null;
  shiftLabel: string;
};

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
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

function shiftLabelFromTitle(title: string): string {
  const m = title.match(/\(([^)]+)\)\s*$/);
  return m ? m[1] : '';
}

function territoryFromTitle(title: string): 'north' | 'south' | 'unassigned' {
  if (title.startsWith('[NJ-N]')) return 'north';
  if (title.startsWith('[NJ-S]')) return 'south';
  return 'unassigned';
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const days = Math.max(7, Math.min(180, Number(url.searchParams.get('days') || 90)));
  const env = context.env as any;

  const clientId = env.ZOHO_CLIENT_ID;
  const clientSecret = env.ZOHO_CLIENT_SECRET;
  const refreshToken = env.ZOHO_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    return json({ok: false, error: 'Zoho creds not configured', bookings: []}, {status: 500});
  }

  const now = new Date();
  const past = new Date(now);
  past.setDate(past.getDate() - 14);
  const future = new Date(now);
  future.setDate(future.getDate() + days);

  const startIso = `${ymd(past)}T00:00:00${njOffset(ymd(past))}`;
  const endIso = `${ymd(future)}T23:59:59${njOffset(ymd(future))}`;

  try {
    const accessToken = await getZohoAccessToken({
      ZOHO_CLIENT_ID: clientId,
      ZOHO_CLIENT_SECRET: clientSecret,
      ZOHO_REFRESH_TOKEN: refreshToken,
    });

    const criteria = `(Start_DateTime:between:${startIso},${endIso})`;
    const apiUrl =
      `https://www.zohoapis.com/crm/v7/Events/search?criteria=${encodeURIComponent(criteria)}` +
      `&fields=id,Event_Title,Start_DateTime,End_DateTime,What_Id` +
      `&per_page=200`;

    const res = await fetch(apiUrl, {
      headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
    });
    if (res.status === 204) return json({ok: true, bookings: []});
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Zoho Events search failed (${res.status}): ${text.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const rows: any[] = data.data || [];

    // Filter to pop-up events only
    const bookings: PopupBooking[] = rows
      .map((ev: any): PopupBooking | null => {
        const title = String(ev.Event_Title || '');
        const isPopUp =
          title.startsWith('[NJ-N]') ||
          title.startsWith('[NJ-S]') ||
          title.startsWith('[OVR]') ||
          title.includes('Highsman Pop Up') ||
          title.includes('Highsman Pop-Up');
        if (!isPopUp) return null;
        const sIso = String(ev.Start_DateTime || '');
        const eIso = String(ev.End_DateTime || '');
        const startD = new Date(sIso);
        const endD = new Date(eIso);
        const fmt = (d: Date) =>
          d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
          });
        const timeLabel =
          Number.isFinite(startD.getTime()) && Number.isFinite(endD.getTime())
            ? `${fmt(startD)} – ${fmt(endD)}`
            : '';
        return {
          id: String(ev.id),
          title,
          date: sIso.slice(0, 10),
          startIso: sIso,
          endIso: eIso,
          timeLabel,
          territory: territoryFromTitle(title),
          isOverride: title.includes('[OVR]'),
          accountId: ev.What_Id?.id || null,
          accountName:
            ev.What_Id?.name ||
            (() => {
              const m = title.match(/—\s+(.+?)\s+\(/);
              return m ? m[1] : null;
            })(),
          shiftLabel: shiftLabelFromTitle(title),
        };
      })
      .filter((x): x is PopupBooking => x !== null)
      .sort((a, b) => (a.startIso < b.startIso ? -1 : 1));

    return json({ok: true, bookings, generatedAt: new Date().toISOString()});
  } catch (err: any) {
    return json(
      {ok: false, error: err.message?.slice(0, 200) || 'fetch failed', bookings: []},
      {status: 500},
    );
  }
}
