import {useEffect, useMemo, useRef, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/today — Serena's Daily Route (auto-planned, 3-tier)
// ─────────────────────────────────────────────────────────────────────────────
// Pulls from /api/vibes-daily-route and renders:
//   • Header: date, total drive time, stop count, day budget gauge
//   • Map with polyline + numbered markers
//   • Ordered stop list — tier chip, dwell time, address, call/text/open-in-maps,
//     AI brief (loads from /api/vibes-brief on expand), note-parse mic for
//     post-visit voice capture
//
// Mobile-first. Dark. Klaviyo-suppressed. Matches /vibes brand surface.
// ─────────────────────────────────────────────────────────────────────────────

export const meta: MetaFunction = () => [
  {title: 'Vibes · Today — Highsman'},
  {name: 'robots', content: 'noindex,nofollow'},
];

// Suppress the customer-facing Highsman.com site nav + footer on this staff page.
export const handle = {hideHeader: true, hideFooter: true};

type Env = {GOOGLE_MAPS_JS_KEY?: string};

type Stop = {
  accountId: string;
  name: string;
  address: string;
  tier: 'onboarding' | 'training' | 'checkin';
  dwellMin: number;
  priority: number;
  dealId: string | null;
  lastVisitDate?: string | null;
  staleDays?: number | null;
  arrival: string | null;
  departure: string | null;
  driveMinutesFromPrev: number | null;
  // Serena's confirmed time commitment for Training stops:
  //   "Exact: 14:00"  → pinned appointment
  //   "Morning (10am-12pm)" → window
  timeConstraintLabel?: string | null;
  timeConflict?: boolean;
  timeConflictReason?: string | null;
};

type RoutePayload = {
  ok: boolean;
  date: string;
  workday: boolean;
  origin: {label: string; address: string; lat: number; lng: number};
  stops: Stop[];
  totalDriveMinutes: number;
  totalDayMinutes: number;
  encodedPolyline: string;
  note?: string | null;
  dayStart?: string | null;
  dayStartLabel?: string | null;
  anchor?: {accountId: string; name: string; time: string} | null;
  timeConflicts?: Array<{accountId: string; name: string; reason: string}>;
};

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  return json({mapsKey: env.GOOGLE_MAPS_JS_KEY || ''});
}

// ─── Brand palette (matches /vibes/_index.tsx) ───────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#FFD700',
  goldDark: '#D4C700',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  purple: '#B884FF',
  surface: '#0B0B0B',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.22)',
  chip: 'rgba(255,255,255,0.06)',
};

const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;

const TIER_COLOR: Record<Stop['tier'], string> = {
  onboarding: BRAND.gold,
  training: BRAND.purple,
  checkin: BRAND.green,
};
const TIER_LABEL: Record<Stop['tier'], string> = {
  onboarding: 'ONBOARDING',
  training: 'TRAINING',
  checkin: 'CHECK-IN',
};

function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/New_York',
  });
}

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'America/New_York',
  });
}

export default function VibesToday() {
  const {mapsKey} = useLoaderData<typeof loader>();
  const [data, setData] = useState<RoutePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Font load
  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l = document.createElement('link');
    l.id = 'vibes-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
  }, []);

  // Klaviyo suppression (brand-by-brand B2B rule)
  useEffect(() => {
    const id = 'vibes-today-klaviyo-suppress';
    if (document.getElementById(id)) return;
    const s = document.createElement('style');
    s.id = id;
    s.innerHTML = `
      .klaviyo-form, [class*="needsclick"], [class*="kl-private"], div[class^="kl_"],
      iframe[id^="klaviyo"], div[id^="klaviyo"] { display:none !important; }
    `;
    document.head.appendChild(s);
  }, []);

  // Pull the route
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch('/api/vibes-daily-route', {
          credentials: 'include',
        });
        const body = (await res.json()) as RoutePayload;
        if (!cancelled) setData(body);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Failed to load route');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load Google Maps JS on first mount (only if we have a key + a route)
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);
  useEffect(() => {
    if (!mapsKey) return;
    if ((window as any).google?.maps) {
      setMapsReady(true);
      return;
    }
    const existing = document.getElementById('google-maps-js');
    if (existing) {
      existing.addEventListener('load', () => setMapsReady(true));
      return;
    }
    const s = document.createElement('script');
    s.id = 'google-maps-js';
    s.src = `https://maps.googleapis.com/maps/api/js?key=${mapsKey}&libraries=geometry`;
    s.async = true;
    s.defer = true;
    s.onload = () => setMapsReady(true);
    document.head.appendChild(s);
  }, [mapsKey]);

  // Render the map when data + SDK both ready
  useEffect(() => {
    if (!mapsReady || !data || !mapRef.current) return;
    const google = (window as any).google;
    if (!google?.maps) return;

    if (!mapInstanceRef.current) {
      mapInstanceRef.current = new google.maps.Map(mapRef.current, {
        center: {lat: data.origin.lat, lng: data.origin.lng},
        zoom: 10,
        disableDefaultUI: true,
        zoomControl: true,
        styles: darkMapStyle,
      });
    }
    const map = mapInstanceRef.current;

    // Clear prior overlays (markers, polyline) stashed on the instance.
    if (map.__overlays) {
      for (const o of map.__overlays) o.setMap(null);
    }
    map.__overlays = [];

    // Origin marker
    const originMarker = new google.maps.Marker({
      position: {lat: data.origin.lat, lng: data.origin.lng},
      map,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 7,
        fillColor: BRAND.white,
        fillOpacity: 1,
        strokeColor: BRAND.gold,
        strokeWeight: 3,
      },
      title: data.origin.label,
    });
    map.__overlays.push(originMarker);

    // Polyline
    if (data.encodedPolyline && google.maps.geometry?.encoding) {
      const path = google.maps.geometry.encoding.decodePath(data.encodedPolyline);
      const poly = new google.maps.Polyline({
        path,
        strokeColor: BRAND.gold,
        strokeOpacity: 0.9,
        strokeWeight: 4,
        map,
      });
      map.__overlays.push(poly);
      const bounds = new google.maps.LatLngBounds();
      for (const p of path) bounds.extend(p);
      map.fitBounds(bounds, 40);
    }

    // Numbered stop markers (we rely on Google's geocoding via the polyline
    // path — we don't have exact stop lat/lngs, so place a label at approx
    // every Nth point along the path proportional to the leg count).
    // Alt: use google.maps.Geocoder per stop. Skip for v1 — label-along-path
    // is good enough for orientation.
    const stopCount = data.stops.length;
    if (
      stopCount > 0 &&
      data.encodedPolyline &&
      google.maps.geometry?.encoding
    ) {
      const path = google.maps.geometry.encoding.decodePath(data.encodedPolyline);
      // Distribute stops evenly across path points (not perfect — address-based
      // geocoding would be better long-term — but fine for the visual map).
      for (let i = 0; i < stopCount; i++) {
        const pathIdx = Math.floor(((i + 1) / (stopCount + 1)) * path.length);
        const mk = new google.maps.Marker({
          position: path[pathIdx],
          map,
          label: {
            text: String(i + 1),
            color: BRAND.black,
            fontWeight: '700',
            fontSize: '13px',
          },
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: TIER_COLOR[data.stops[i].tier],
            fillOpacity: 1,
            strokeColor: BRAND.black,
            strokeWeight: 2,
          },
          title: data.stops[i].name,
        });
        map.__overlays.push(mk);
      }
    }
  }, [mapsReady, data]);

  const stops = data?.stops || [];
  const totalMin = data?.totalDayMinutes || 0;
  const dayBudgetPct = Math.min(100, Math.round((totalMin / 480) * 100));

  return (
    <div
      style={{
        background: BRAND.black,
        color: BRAND.white,
        minHeight: '100vh',
        fontFamily: BODY,
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 16px 12px',
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      >
        <div
          style={{
            color: BRAND.gold,
            fontSize: 22,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
            fontFamily: TEKO,
            fontWeight: 600,
            lineHeight: 1,
          }}
        >
          Vibes · Today
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 40,
            lineHeight: 1.05,
            color: BRAND.white,
            letterSpacing: '0.02em',
            textTransform: 'uppercase',
            marginTop: 6,
          }}
        >
          {data?.date ? fmtDate(data.date) : 'Loading…'}
        </div>
        {data && !data.workday ? (
          <div
            style={{
              marginTop: 6,
              color: BRAND.orange,
              fontSize: 12,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            Not a Serena work day — preview of next Tue/Wed/Thu
          </div>
        ) : null}

        {/* Stat pills */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3,1fr)',
            gap: 8,
            marginTop: 14,
          }}
        >
          <StatPill
            label="Stops"
            value={String(stops.length)}
            sub={`${stops.filter((s) => s.tier === 'onboarding').length}O · ${stops.filter((s) => s.tier === 'training').length}T · ${stops.filter((s) => s.tier === 'checkin').length}C`}
            accent={BRAND.gold}
          />
          <StatPill
            label="Drive"
            value={`${data?.totalDriveMinutes ?? 0}m`}
            sub="total"
            accent={BRAND.green}
          />
          <StatPill
            label="Day"
            value={`${Math.floor(totalMin / 60)}h ${totalMin % 60}m`}
            sub={`${dayBudgetPct}% of 8h`}
            accent={dayBudgetPct > 95 ? BRAND.red : BRAND.orange}
          />
        </div>
        <div
          style={{
            marginTop: 10,
            height: 4,
            background: BRAND.chip,
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${dayBudgetPct}%`,
              height: '100%',
              background:
                dayBudgetPct > 95
                  ? BRAND.red
                  : dayBudgetPct > 80
                  ? BRAND.orange
                  : BRAND.gold,
              transition: 'width 240ms ease',
            }}
          />
        </div>

        {data?.note ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: BRAND.chip,
              border: `1px solid ${BRAND.line}`,
              borderLeft: `3px solid ${BRAND.orange}`,
              fontSize: 12,
              color: BRAND.gray,
              borderRadius: 4,
            }}
          >
            {data.note}
          </div>
        ) : null}

        {data?.anchor ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: 'rgba(255,215,0,0.08)',
              border: `1px solid ${BRAND.gold}`,
              fontSize: 12,
              color: BRAND.gold,
              borderRadius: 4,
              fontFamily: BODY,
              letterSpacing: '0.04em',
            }}
          >
            <strong style={{letterSpacing: '0.12em'}}>PINNED ANCHOR</strong>
            &nbsp;· {data.anchor.name} at {data.anchor.time}
            {data.dayStartLabel ? ` · day starts ${data.dayStartLabel}` : ''}
          </div>
        ) : null}

        {data?.timeConflicts && data.timeConflicts.length > 0 ? (
          <div
            style={{
              marginTop: 10,
              padding: 10,
              background: 'rgba(255,59,48,0.08)',
              border: `1px solid ${BRAND.red}`,
              fontSize: 12,
              color: BRAND.red,
              borderRadius: 4,
              fontFamily: BODY,
            }}
          >
            <div
              style={{
                fontWeight: 700,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                fontSize: 11,
                marginBottom: 6,
              }}
            >
              Time Conflicts · {data.timeConflicts.length}
            </div>
            {data.timeConflicts.map((c, i) => (
              <div key={`${c.accountId}-${i}`} style={{marginTop: 2}}>
                • {c.name}: {c.reason}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {/* Map */}
      <div
        ref={mapRef}
        style={{
          width: '100%',
          height: 300,
          background: BRAND.surface,
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      />
      {!mapsKey ? (
        <div
          style={{
            padding: 12,
            fontSize: 12,
            color: BRAND.gray,
            textAlign: 'center',
            borderBottom: `1px solid ${BRAND.line}`,
          }}
        >
          Map unavailable — GOOGLE_MAPS_JS_KEY not configured.
        </div>
      ) : null}

      {/* Stop list */}
      <div style={{padding: '12px 12px 40px'}}>
        {loading ? (
          <div style={{padding: 40, textAlign: 'center', color: BRAND.gray}}>
            Loading Serena's route…
          </div>
        ) : error ? (
          <div
            style={{
              padding: 20,
              background: 'rgba(255,59,48,0.1)',
              border: `1px solid ${BRAND.red}`,
              color: BRAND.red,
              borderRadius: 6,
              textAlign: 'center',
            }}
          >
            {error}
          </div>
        ) : stops.length === 0 ? (
          <div
            style={{
              padding: 40,
              textAlign: 'center',
              color: BRAND.gray,
              fontSize: 14,
            }}
          >
            <div style={{fontSize: 36, marginBottom: 8}}>✓</div>
            Cadence is caught up. No Tier 1/2/3 due today.
          </div>
        ) : (
          stops.map((s, i) => <StopCard key={s.accountId} stop={s} idx={i + 1} />)
        )}
      </div>
    </div>
  );
}

// ─── Stat pill ─────────────────────────────────────────────────────────────
function StatPill({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: string;
}) {
  return (
    <div
      style={{
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        padding: '8px 10px',
        borderRadius: 4,
      }}
    >
      <div
        style={{
          color: BRAND.gray,
          fontSize: 9,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 28,
          lineHeight: 1,
          color: accent,
          letterSpacing: '0.02em',
          marginTop: 2,
        }}
      >
        {value}
      </div>
      <div style={{color: BRAND.gray, fontSize: 10, marginTop: 2}}>{sub}</div>
    </div>
  );
}

// ─── Stop card ─────────────────────────────────────────────────────────────
type VibesBrief = {
  headline?: string;
  play?: string;
  watchFor?: string[];
  closeOn?: string;
  productFocus?: string[];
  _fallback?: boolean;
  _fallbackReason?: string;
};

function StopCard({stop, idx}: {stop: Stop; idx: number}) {
  const [open, setOpen] = useState(false);
  const [brief, setBrief] = useState<VibesBrief | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);

  const fetchBrief = async () => {
    if (brief || briefLoading) return;
    setBriefLoading(true);
    setBriefError(null);
    try {
      const res = await fetch('/api/vibes-brief', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          accountId: stop.accountId,
          accountName: stop.name,
          tier: stop.tier,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setBrief((body?.brief as VibesBrief) || null);
    } catch (err: any) {
      setBriefError(err?.message || 'unknown');
    } finally {
      setBriefLoading(false);
    }
  };

  const openMaps = () => {
    const q = encodeURIComponent(`${stop.name}, ${stop.address}`);
    window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, '_blank');
  };

  const tierColor = TIER_COLOR[stop.tier];

  return (
    <div
      style={{
        background: BRAND.surface,
        border: `1px solid ${BRAND.line}`,
        borderLeft: `3px solid ${tierColor}`,
        borderRadius: 4,
        marginBottom: 10,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 10,
          padding: 12,
          alignItems: 'flex-start',
          cursor: 'pointer',
        }}
        onClick={() => {
          const next = !open;
          setOpen(next);
          if (next) fetchBrief();
        }}
      >
        {/* Stop number disc */}
        <div
          style={{
            width: 34,
            height: 34,
            minWidth: 34,
            borderRadius: '50%',
            background: tierColor,
            color: BRAND.black,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: TEKO,
            fontSize: 20,
            fontWeight: 700,
          }}
        >
          {idx}
        </div>

        <div style={{flex: 1, minWidth: 0}}>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              marginBottom: 4,
              flexWrap: 'wrap',
            }}
          >
            <span
              style={{
                color: tierColor,
                fontSize: 9,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                fontWeight: 700,
              }}
            >
              {TIER_LABEL[stop.tier]}
            </span>
            <span
              style={{
                color: BRAND.gray,
                fontSize: 9,
                letterSpacing: '0.08em',
              }}
            >
              {stop.dwellMin}M DWELL
            </span>
            {stop.staleDays != null ? (
              <span
                style={{
                  color: BRAND.orange,
                  fontSize: 9,
                  letterSpacing: '0.08em',
                }}
              >
                {stop.staleDays}D STALE
              </span>
            ) : null}
          </div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 22,
              lineHeight: 1.1,
              color: BRAND.white,
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {stop.name}
          </div>
          <div
            style={{
              color: BRAND.gray,
              fontSize: 12,
              marginTop: 4,
              lineHeight: 1.3,
            }}
          >
            {stop.address}
          </div>

          <div
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 8,
              fontSize: 11,
              color: BRAND.white,
              flexWrap: 'wrap',
            }}
          >
            <div>
              <span style={{color: BRAND.gray}}>Arr </span>
              {fmtTime(stop.arrival)}
            </div>
            <div>
              <span style={{color: BRAND.gray}}>Dep </span>
              {fmtTime(stop.departure)}
            </div>
            {stop.driveMinutesFromPrev != null ? (
              <div style={{color: BRAND.gray}}>
                +{stop.driveMinutesFromPrev}m drive
              </div>
            ) : null}
          </div>
          {stop.timeConstraintLabel ? (
            <div
              style={{
                marginTop: 6,
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '3px 8px',
                border: `1px solid ${
                  stop.timeConflict ? BRAND.red : BRAND.gold
                }`,
                color: stop.timeConflict ? BRAND.red : BRAND.gold,
                borderRadius: 4,
                fontFamily: BODY,
                fontSize: 10,
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                fontWeight: 600,
              }}
            >
              <span>PINNED · {stop.timeConstraintLabel}</span>
            </div>
          ) : null}
          {stop.timeConflict && stop.timeConflictReason ? (
            <div
              style={{
                marginTop: 6,
                color: BRAND.red,
                fontSize: 11,
                fontFamily: BODY,
              }}
            >
              ⚠ {stop.timeConflictReason}
            </div>
          ) : null}
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          display: 'flex',
          borderTop: `1px solid ${BRAND.line}`,
          background: 'rgba(0,0,0,0.4)',
        }}
      >
        <button
          onClick={openMaps}
          style={{
            flex: 1,
            padding: '10px 8px',
            background: 'none',
            border: 'none',
            color: BRAND.white,
            fontFamily: BODY,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            borderRight: `1px solid ${BRAND.line}`,
          }}
        >
          Open in Maps
        </button>
        <button
          onClick={() => {
            const next = !open;
            setOpen(next);
            if (next) fetchBrief();
          }}
          style={{
            flex: 1,
            padding: '10px 8px',
            background: 'none',
            border: 'none',
            color: BRAND.gold,
            fontFamily: BODY,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            borderRight: `1px solid ${BRAND.line}`,
          }}
        >
          {open ? 'Hide Brief' : 'AI Brief'}
        </button>
        <a
          href={`/vibes/store/${stop.accountId}`}
          style={{
            flex: 1,
            padding: '10px 8px',
            background: 'none',
            border: 'none',
            color: BRAND.white,
            fontFamily: BODY,
            fontSize: 11,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            textAlign: 'center',
            textDecoration: 'none',
          }}
        >
          Store Page
        </a>
      </div>

      {/* Expanded: Brief + post-visit note capture */}
      {open ? (
        <div style={{padding: 12, borderTop: `1px solid ${BRAND.line}`}}>
          <div
            style={{
              color: BRAND.gold,
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 6,
            }}
          >
            Brief
          </div>
          {briefLoading ? (
            <div style={{fontSize: 13, color: BRAND.gray, minHeight: 40}}>
              Pulling context…
            </div>
          ) : briefError ? (
            <div style={{fontSize: 12, color: BRAND.red, minHeight: 40}}>
              Brief failed: {briefError}
            </div>
          ) : brief ? (
            <BriefBody brief={brief} />
          ) : (
            <div style={{fontSize: 13, color: BRAND.gray, minHeight: 40}}>
              Tap AI Brief to load.
            </div>
          )}
          <NoteCapture
            accountId={stop.accountId}
            accountName={stop.name}
            tier={stop.tier}
          />
        </div>
      ) : null}
    </div>
  );
}

// ─── Brief body (structured) ───────────────────────────────────────────────
function BriefBody({brief}: {brief: VibesBrief}) {
  const rowLabel = {
    color: BRAND.gold,
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase' as const,
    marginBottom: 4,
  };
  const rowBody = {
    fontSize: 13,
    color: BRAND.white,
    lineHeight: 1.4,
    marginBottom: 10,
  };
  return (
    <div style={{minHeight: 40}}>
      {brief.headline ? (
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 18,
            lineHeight: 1.2,
            color: BRAND.white,
            letterSpacing: '0.02em',
            marginBottom: 10,
          }}
        >
          {brief.headline}
        </div>
      ) : null}
      {brief.play ? (
        <>
          <div style={rowLabel}>Play</div>
          <div style={rowBody}>{brief.play}</div>
        </>
      ) : null}
      {Array.isArray(brief.watchFor) && brief.watchFor.length > 0 ? (
        <>
          <div style={rowLabel}>Watch For</div>
          <ul style={{...rowBody, paddingLeft: 18, marginTop: 0}}>
            {brief.watchFor.map((w, i) => (
              <li key={i} style={{marginBottom: 2}}>
                {w}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {brief.closeOn ? (
        <>
          <div style={rowLabel}>Close On</div>
          <div
            style={{
              ...rowBody,
              color: BRAND.gold,
              fontWeight: 600,
            }}
          >
            {brief.closeOn}
          </div>
        </>
      ) : null}
      {Array.isArray(brief.productFocus) && brief.productFocus.length > 0 ? (
        <div style={{display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4}}>
          {brief.productFocus.map((p, i) => (
            <span
              key={i}
              style={{
                fontSize: 10,
                color: BRAND.gold,
                border: `1px solid ${BRAND.line}`,
                background: BRAND.chip,
                padding: '3px 8px',
                borderRadius: 999,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
              }}
            >
              {p}
            </span>
          ))}
        </div>
      ) : null}
      {brief._fallback ? (
        <div
          style={{
            marginTop: 10,
            fontSize: 10,
            color: BRAND.gray,
            fontStyle: 'italic',
          }}
        >
          {brief._fallbackReason || 'Fallback brief — AI offline.'}
        </div>
      ) : null}
    </div>
  );
}

// ─── Post-visit voice/text note capture ────────────────────────────────────
function NoteCapture({
  accountId,
  accountName,
  tier,
}: {
  accountId: string;
  accountName: string;
  tier: Stop['tier'];
}) {
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'done' | 'error'>(
    'idle',
  );
  const [parsed, setParsed] = useState<any>(null);

  const submit = async () => {
    if (!note.trim()) return;
    setStatus('sending');
    try {
      const res = await fetch('/api/vibes-note-parse', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({accountId, accountName, tier, note}),
      });
      const body = await res.json();
      if (!res.ok || !body?.ok) {
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      setParsed(body.parsed);
      setStatus('done');
      setNote('');
    } catch (err: any) {
      setStatus('error');
      setParsed({error: err?.message || 'parse failed'});
    }
  };

  return (
    <div
      style={{
        marginTop: 16,
        paddingTop: 12,
        borderTop: `1px dashed ${BRAND.line}`,
      }}
    >
      <div
        style={{
          color: BRAND.green,
          fontSize: 10,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        Post-visit note
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Dump the visit — what moved, objections, next step. Claude parses it into a Zoho action."
        style={{
          width: '100%',
          minHeight: 64,
          background: BRAND.black,
          color: BRAND.white,
          border: `1px solid ${BRAND.line}`,
          borderRadius: 4,
          padding: 8,
          fontFamily: BODY,
          fontSize: 13,
          resize: 'vertical',
          boxSizing: 'border-box',
        }}
      />
      <button
        onClick={submit}
        disabled={status === 'sending' || !note.trim()}
        style={{
          marginTop: 8,
          padding: '8px 14px',
          background: BRAND.gold,
          color: BRAND.black,
          border: 'none',
          borderRadius: 4,
          fontFamily: BODY,
          fontSize: 11,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 700,
          cursor: status === 'sending' ? 'wait' : 'pointer',
          opacity: !note.trim() ? 0.4 : 1,
        }}
      >
        {status === 'sending' ? 'Parsing…' : 'Log Visit'}
      </button>
      {parsed ? (
        <pre
          style={{
            marginTop: 10,
            padding: 10,
            background: BRAND.black,
            border: `1px solid ${BRAND.line}`,
            borderRadius: 4,
            fontSize: 11,
            color: BRAND.gray,
            whiteSpace: 'pre-wrap',
            overflow: 'auto',
          }}
        >
          {JSON.stringify(parsed, null, 2)}
        </pre>
      ) : null}
    </div>
  );
}

// ─── Dark map style (matches Highsman surface) ────────────────────────────
const darkMapStyle = [
  {elementType: 'geometry', stylers: [{color: '#0b0b0b'}]},
  {elementType: 'labels.text.stroke', stylers: [{color: '#0b0b0b'}]},
  {elementType: 'labels.text.fill', stylers: [{color: '#A9ACAF'}]},
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{color: '#1a1a1a'}],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{color: '#2a2a2a'}],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{color: '#050505'}],
  },
  {
    featureType: 'poi',
    elementType: 'labels',
    stylers: [{visibility: 'off'}],
  },
  {
    featureType: 'administrative.land_parcel',
    stylers: [{visibility: 'off'}],
  },
];
