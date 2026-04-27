// ─────────────────────────────────────────────────────────────────────────────
// /njnorth + /njsouth — shared loader (auth + Zoho fetch)
// ─────────────────────────────────────────────────────────────────────────────
// Both route files call buildNjTerrLoader(territory) to get a complete loader.
// The loader handles:
//   • Auth check (cookies via njterr-auth.ts)
//   • Zoho Events fetch scoped to the territory's tag ([NJ-N] or [NJ-S])
//   • Past + Today + Upcoming bucket split
//
// Returning {authed: false} short-circuits the dashboard into the login screen.
// ─────────────────────────────────────────────────────────────────────────────

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getZohoAccessToken} from '~/lib/zoho-auth';
import {isAuthedForTerritory} from '~/lib/njterr-auth';
import type {RepId} from '~/lib/reps';
import type {DashEvent, NjTerrLoaderData} from '~/lib/njterr-dashboard';

type Env = {
  ZOHO_CLIENT_ID?: string;
  ZOHO_CLIENT_SECRET?: string;
  ZOHO_REFRESH_TOKEN?: string;
};

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

function dateKeyNJ(d: Date): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = fmt.formatToParts(d);
  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const dd = parts.find((p) => p.type === 'day')?.value;
  return `${y}-${m}-${dd}`;
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fetchTerritoryEvents(
  accessToken: string,
  startIso: string,
  endIso: string,
  territoryTag: '[NJ-N]' | '[NJ-S]',
): Promise<DashEvent[]> {
  // Use /Events/search — the workspace token has ZohoCRM.modules.events.READ
  // but NOT ZohoCRM.coql.READ scope, so COQL returns 401 OAUTH_SCOPE_MISMATCH.
  // Search API has a 30-90s indexing delay for newly created events; that's
  // acceptable here because the dashboard auto-refreshes and most bookings
  // are made well in advance.
  const criteria = `(Start_DateTime:between:${startIso},${endIso})`;
  const url =
    `https://www.zohoapis.com/crm/v7/Events/search?criteria=${encodeURIComponent(
      criteria,
    )}` +
    `&fields=id,Event_Title,Start_DateTime,End_DateTime,What_Id` +
    // Zoho v7 search only sorts by id|Created_Time|Modified_Time. Re-sort client-side.
    `&per_page=200`;

  const res = await fetch(url, {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return [];
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho Events search failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const rows: any[] = data.data || [];
  return rows
    .map<DashEvent | null>((ev) => {
      const title = String(ev.Event_Title || '');
      // Inclusion rules:
      //   1. Event explicitly tagged for this territory  → include (strict)
      //   2. Event is a Snr Staff Override `[OVR] …` with NO territory tag
      //      → include on BOTH /njnorth and /njsouth so out-of-coverage
      //        bookings are visible to whoever picks them up.
      //   3. Event has no territory tag and no [OVR] tag, but starts with
      //      "Highsman Pop Up" — usually means the coverage check errored
      //      at booking time and `repTag` was never set. Surface these on
      //      both dashboards so they aren't silently invisible.
      // Anything else (other rep tags, non-pop-up events) is dropped.
      const startsWithThisTerritory = title.startsWith(territoryTag);
      const startsWithOtherTerritory =
        title.startsWith('[NJ-N]') || title.startsWith('[NJ-S]');
      const looksLikePopUp =
        title.startsWith('[OVR]') ||
        title.startsWith('Highsman Pop Up') ||
        title.includes('Highsman Pop Up');
      if (startsWithThisTerritory) {
        // matched — fall through
      } else if (!startsWithOtherTerritory && looksLikePopUp) {
        // untagged or override — show on both dashboards
      } else {
        return null;
      }
      const isOverride = title.includes('[OVR]') || !startsWithThisTerritory;
      const startIso = String(ev.Start_DateTime || '');
      const date = startIso.slice(0, 10);
      const d = new Date(startIso);
      const time = Number.isFinite(d.getTime())
        ? d.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: 'America/New_York',
          })
        : '';
      const whatId = ev.What_Id?.id || null;
      const accountName =
        ev.What_Id?.name ||
        (() => {
          const m = title.match(/—\s+(.+?)\s+\(/);
          return m ? m[1] : null;
        })();
      return {
        id: String(ev.id),
        title,
        date,
        time,
        accountId: whatId,
        accountName,
        accountCity: null,
        isOverride,
        startIso,
      };
    })
    .filter((x): x is DashEvent => x !== null);
}

export function buildNjTerrLoader(territory: RepId) {
  const territoryTag: '[NJ-N]' | '[NJ-S]' =
    territory === 'north' ? '[NJ-N]' : '[NJ-S]';

  return async function loader({request, context}: LoaderFunctionArgs) {
    const url = new URL(request.url);
    const loginError = url.searchParams.get('error') === 'invalid' ? 'invalid' : null;

    if (!isAuthedForTerritory(request, territory)) {
      const data: NjTerrLoaderData = {
        authed: false,
        territory,
        loginError,
        nowIso: new Date().toISOString(),
        today: {ok: true, events: []},
        upcoming: {ok: true, events: []},
        past: {ok: true, events: []},
        hasZoho: false,
      };
      return json(data);
    }

    const env = context.env as Env;
    const hasZoho = Boolean(
      env.ZOHO_CLIENT_ID && env.ZOHO_CLIENT_SECRET && env.ZOHO_REFRESH_TOKEN,
    );

    const now = new Date();
    const todayIso = dateKeyNJ(now);
    const futureEnd = addDays(todayIso, 60);
    const pastStart = addDays(todayIso, -60);

    const startDateTime = `${pastStart}T00:00:00${njOffset(pastStart)}`;
    const endDateTime = `${futureEnd}T23:59:59${njOffset(futureEnd)}`;

    let accessToken: string | null = null;
    if (hasZoho) {
      try {
        accessToken = await getZohoAccessToken(
          env as Required<Pick<Env, 'ZOHO_CLIENT_ID' | 'ZOHO_CLIENT_SECRET' | 'ZOHO_REFRESH_TOKEN'>>,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[/nj${territory}] Zoho token fetch failed`, err);
      }
    }

    const events: DashEvent[] | null = accessToken
      ? await fetchTerritoryEvents(
          accessToken,
          startDateTime,
          endDateTime,
          territoryTag,
        ).catch((err) => {
          // eslint-disable-next-line no-console
          console.warn(`[/nj${territory}] events fetch failed`, err);
          return null;
        })
      : null;

    const all = events || [];
    const todayEvents = all.filter((e) => e.date === todayIso);
    const upcomingEvents = all.filter((e) => e.date > todayIso);
    const pastEvents = all
      .filter((e) => e.date < todayIso)
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest-first

    const data: NjTerrLoaderData = {
      authed: true,
      territory,
      loginError: null,
      nowIso: now.toISOString(),
      today: {ok: events !== null, events: todayEvents},
      upcoming: {ok: events !== null, events: upcomingEvents},
      past: {ok: events !== null, events: pastEvents},
      hasZoho,
    };
    return json(data);
  };
}
