import {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link, useFetcher} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// META — staff-only internal tool; hide global nav like /njmenu
// ─────────────────────────────────────────────────────────────────────────────
export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'NJ Pop Up Booking · Staff Only · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'Internal staff tool for scheduling Highsman pop ups at NJ dispensaries.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS — match /njmenu
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  goldDark: '#D4C700',
  green: '#2ECC71',
  red: '#FF3B30',
  surface: '#0B0B0B',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.22)',
  chip: 'rgba(255,255,255,0.06)',
} as const;

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;
const SPARK_WHITE = `${CDN}/Spark_Greatness_White.png?v=1775594430`;

// ─────────────────────────────────────────────────────────────────────────────
// DISPENSARY DATA — Zoho CRM is the source of truth for the picker.
// /api/accounts?scope=nj&q=X returns live Accounts (including pop-up custom fields).
// The lat/lng for the map isn't stored in Zoho, so we keep a local COORDS_LOOKUP for
// known NJ dispensaries. Accounts without coords get an "off-map" treatment — still
// bookable, just no pin/route visualization for that stop.
// ─────────────────────────────────────────────────────────────────────────────
type Dispensary = {
  id: string;
  name: string;
  city: string;
  lat?: number;
  lng?: number;
  // Zoho-resolved pop-up fields.
  popUpEmail?: string | null;
  popUpLink?: string | null;
  lastVisitDate?: string | null;
  // Resolved contact (populated after Contact-by-email lookup).
  contact?: {name: string; role: string; email: string; phone: string} | null;
};

// Shape returned by /api/accounts?q=X (matches AccountResult in api.accounts.tsx).
type ApiAccount = {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  street: string | null;
  phone: string | null;
  popUpEmail: string | null;
  popUpLink: string | null;
  lastVisitDate: string | null;
};

// Local coords index for the map — keyed by `${name}|${city}` (case-insensitive).
// Add to this list as more NJ dispensaries come online. Missing entries degrade
// gracefully: the booking still works, it just doesn't get a map pin.
const COORDS_LOOKUP: Record<string, {lat: number; lng: number}> = {
  'the botanist|egg harbor twp': {lat: 39.4136, lng: -74.5866},
  'curaleaf|bellmawr': {lat: 39.8654, lng: -75.0935},
  'curaleaf|bordentown': {lat: 40.1462, lng: -74.7118},
  'curaleaf|edgewater park': {lat: 40.0376, lng: -74.9115},
  'garden state dispensary|eatontown': {lat: 40.2962, lng: -74.0568},
  'garden state dispensary|union': {lat: 40.6976, lng: -74.2632},
  'garden state dispensary|woodbridge': {lat: 40.5576, lng: -74.2846},
  'zen leaf|elizabeth': {lat: 40.6640, lng: -74.2107},
  'zen leaf|lawrence': {lat: 40.2971, lng: -74.7293},
  'zen leaf|neptune': {lat: 40.1987, lng: -74.0278},
  'rise|bloomfield': {lat: 40.8068, lng: -74.1854},
  'rise|paterson': {lat: 40.9168, lng: -74.1718},
  'rise|paramus': {lat: 40.9445, lng: -74.0754},
  'columbia care|deptford': {lat: 39.8412, lng: -75.1080},
  'columbia care|vineland': {lat: 39.4864, lng: -75.0263},
  'the apothecarium|phillipsburg': {lat: 40.6934, lng: -75.1904},
  'the apothecarium|maplewood': {lat: 40.7315, lng: -74.2735},
  'the apothecarium|lodi': {lat: 40.8820, lng: -74.0835},
  'gotham|jersey city': {lat: 40.7178, lng: -74.0431},
  'valley wellness|raritan': {lat: 40.5712, lng: -74.6335},
  'ascend|montclair': {lat: 40.8162, lng: -74.2029},
  'ascend|rochelle park': {lat: 40.9064, lng: -74.0741},
  // Premo + Shore House Canna — verified from Zoho 2026-04-17
  'premo|keyport': {lat: 40.4337, lng: -74.1996},
  'shore house canna|cape may': {lat: 38.9351, lng: -74.9060},
  'the cannabist|deptford': {lat: 39.8412, lng: -75.1080},
  'the cannabist|vineland': {lat: 39.4864, lng: -75.0263},
};

function coordsFor(name: string, city: string | null): {lat: number; lng: number} | null {
  if (!city) return null;
  const key = `${name.trim().toLowerCase()}|${city.trim().toLowerCase()}`;
  return COORDS_LOOKUP[key] || null;
}

function apiAccountToDispensary(a: ApiAccount): Dispensary {
  const coords = coordsFor(a.name, a.city);
  return {
    id: a.id,
    name: a.name,
    city: a.city || '',
    lat: coords?.lat,
    lng: coords?.lng,
    popUpEmail: a.popUpEmail,
    popUpLink: a.popUpLink,
    lastVisitDate: a.lastVisitDate,
  };
}

type Booking = {
  dispId: string;
  name: string;
  city: string;
  lat?: number;
  lng?: number;
  date: string;
  shiftKey: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;

function haversineMiles(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}
function estDriveMinutes(a: {lat: number; lng: number}, b: {lat: number; lng: number}) {
  const miles = haversineMiles(a, b) * 1.3;
  return Math.round((miles / 38) * 60);
}
function fmtDate(iso: string) {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', {weekday: 'short', month: 'short', day: 'numeric'});
}
function shiftLabel(k: string) {
  return (
    ({
      'sat-mat': 'Sat 1–3 PM',
      'sat-late': 'Sat 4–6 PM',
      'sun-mat': 'Sun 1–3 PM',
      'sun-late': 'Sun 4–6 PM',
      'thu-main': 'Thu 3–7 PM',
      'fri-main': 'Fri 3–7 PM',
    } as Record<string, string>)[k] || k
  );
}
function buildWeekDays() {
  const today = new Date();
  const dow = today.getDay();
  let offset = 4 - dow;
  if (offset < 0) offset += 7;
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  const days: Array<{
    iso: string;
    dow: string;
    date: Date;
    shifts: Array<{key: string; label: string; capacity: number}>;
  }> = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const didx = d.getDay();
    let shifts: Array<{key: string; label: string; capacity: number}> = [];
    if (didx === 4 || didx === 5) {
      shifts = [{key: didx === 4 ? 'thu-main' : 'fri-main', label: '3:00 – 7:00 PM', capacity: 2}];
    } else if (didx === 6 || didx === 0) {
      const p = didx === 6 ? 'sat' : 'sun';
      shifts = [
        {key: `${p}-mat`, label: '1:00 – 3:00 PM', capacity: 2},
        {key: `${p}-late`, label: '4:00 – 6:00 PM', capacity: 2},
      ];
    }
    days.push({iso, dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][didx], date: d, shifts});
  }
  return days;
}

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function NJPopups() {
  const [dispensary, setDispensary] = useState<Dispensary | null>(null);
  const [slot, setSlot] = useState<{
    date: string;
    dateLabel: string;
    dowLabel: string;
    timeLabel: string;
    shiftKey: string;
  } | null>(null);
  const [overrideContact, setOverrideContact] = useState(false);
  const [newContact, setNewContact] = useState({name: '', role: '', email: '', phone: ''});
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [query, setQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);
  const [toast, setToast] = useState(false);

  // Live Zoho account search — same pattern as /njmenu.
  const accountFetcher = useFetcher<{accounts: ApiAccount[]; error?: string}>();
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || dispensary) return;
    const t = setTimeout(() => {
      accountFetcher.load(`/api/accounts?scope=nj&q=${encodeURIComponent(q)}`);
    }, 220);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, dispensary]);
  const isSearching = accountFetcher.state === 'loading';
  const crmUnavailable = accountFetcher.data?.error === 'CRM not configured';

  // Suppress Klaviyo popup — staff-only page (matches /njmenu pattern)
  useEffect(() => {
    const style = document.createElement('style');
    style.id = 'suppress-klaviyo-popup';
    style.textContent =
      '[data-testid="klaviyo-form-overlay"], .klaviyo-form-overlay, ' +
      '.needsclick.kl-private-reset-css-Xuajs1, #klaviyo-ios-modal, ' +
      '[class*="klaviyo"][class*="overlay"], [class*="klaviyo"][class*="modal"], ' +
      '[id*="klaviyo"][id*="popup"] { display: none !important; }';
    document.head.appendChild(style);
    return () => {
      style.remove();
    };
  }, []);

  // Load Google Fonts (Teko + Barlow Semi Condensed) once
  useEffect(() => {
    if (document.getElementById('hs-popups-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hs-popups-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  // Resolution modes, driven by Zoho Account custom fields:
  //   'link'   → `Link for Pop Ups` is set; booking goes via dispensary portal, skip contact card
  //   'email'  → `Email for Pop Ups` resolved to a Contact; auto-fill the card
  //   'manual' → neither set, or user chose to override; collect contact inline
  const mode: 'link' | 'email' | 'manual' = useMemo(() => {
    if (!dispensary) return 'manual';
    if (dispensary.popUpLink && !overrideContact) return 'link';
    if (dispensary.contact && !overrideContact) return 'email';
    return 'manual';
  }, [dispensary, overrideContact]);

  // When a dispensary has `popUpEmail` but no resolved contact yet, fetch it from Zoho.
  // In the seeded demo data, `contact` is already present so this no-ops; against live
  // Zoho, this populates the POC card from the Email-for-Pop-Ups field.
  useEffect(() => {
    if (!dispensary || dispensary.contact || !dispensary.popUpEmail) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/accounts?contactEmail=${encodeURIComponent(dispensary.popUpEmail!)}`);
        if (!res.ok) return;
        const data = (await res.json()) as {contact: {name: string; email: string; phone: string | null; title: string | null} | null};
        if (cancelled || !data.contact) return;
        setDispensary((prev) =>
          prev && prev.id === dispensary.id
            ? {
                ...prev,
                contact: {
                  name: data.contact!.name,
                  role: data.contact!.title || '—',
                  email: data.contact!.email,
                  phone: data.contact!.phone || '—',
                },
              }
            : prev,
        );
      } catch (err) {
        console.warn('[njpopups] Contact resolution failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dispensary]);

  const contact = useMemo(() => {
    if (!dispensary) return null;
    if (mode === 'email' && dispensary.contact) return {...dispensary.contact, source: 'zoho' as const};
    if (mode === 'link') return null; // booking goes via dispensary portal
    const n = newContact.name.trim();
    const e = newContact.email.trim();
    const p = newContact.phone.trim();
    const r = newContact.role.trim();
    const ok = n && /.+@.+\..+/.test(e) && p.replace(/\D/g, '').length >= 10;
    if (!ok) return null;
    return {name: n, role: r || '—', email: e, phone: p, source: 'new' as const};
  }, [dispensary, mode, newContact]);

  const week = useMemo(buildWeekDays, []);
  const countBookings = useCallback(
    (iso: string, key: string) => bookings.filter((b) => b.date === iso && b.shiftKey === key).length,
    [bookings],
  );

  // Live Zoho results, mapped to our Dispensary shape (coords filled in when known).
  const filtered: Dispensary[] = useMemo(() => {
    const apiAccounts = accountFetcher.data?.accounts || [];
    if (query.trim().length < 2) return [];
    return apiAccounts.map(apiAccountToDispensary);
  }, [accountFetcher.data, query]);

  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const mapLayersRef = useRef<{pins: any[]; route: any}>({pins: [], route: null});
  const [leafletReady, setLeafletReady] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).L) {
      setLeafletReady(true);
      return;
    }
    if (!document.getElementById('leaflet-css')) {
      const css = document.createElement('link');
      css.id = 'leaflet-css';
      css.rel = 'stylesheet';
      css.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(css);
    }
    if (!document.getElementById('leaflet-js')) {
      const js = document.createElement('script');
      js.id = 'leaflet-js';
      js.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      js.async = true;
      js.onload = () => setLeafletReady(true);
      document.body.appendChild(js);
    } else {
      setLeafletReady(true);
    }
  }, []);

  // Weekend stops — includes all booked weekend slots plus the currently-pending selection.
  // Each stop carries its own lat/lng (may be undefined if Zoho account isn't in COORDS_LOOKUP).
  type Stop = {
    name: string;
    city: string;
    lat?: number;
    lng?: number;
    date: string;
    shiftKey: string;
    pending: boolean;
  };
  const weekendStops: Stop[] = useMemo(() => {
    const stops: Stop[] = [];
    bookings
      .filter((b) => /^sat-|^sun-/.test(b.shiftKey))
      .forEach((b) => {
        stops.push({
          name: b.name,
          city: b.city,
          lat: b.lat,
          lng: b.lng,
          date: b.date,
          shiftKey: b.shiftKey,
          pending: false,
        });
      });
    if (slot && /^sat-|^sun-/.test(slot.shiftKey) && dispensary) {
      stops.push({
        name: dispensary.name,
        city: dispensary.city,
        lat: dispensary.lat,
        lng: dispensary.lng,
        date: slot.date,
        shiftKey: slot.shiftKey,
        pending: true,
      });
    }
    const order: Record<string, number> = {'sat-mat': 0, 'sat-late': 1, 'sun-mat': 2, 'sun-late': 3};
    stops.sort((a, b) => (a.date + order[a.shiftKey]).localeCompare(b.date + order[b.shiftKey]));
    return stops;
  }, [bookings, slot, dispensary]);

  // Stops that actually have coords — used for map pins and drive-time calc.
  const mappableStops = useMemo(
    () => weekendStops.filter((s): s is Stop & {lat: number; lng: number} => s.lat != null && s.lng != null),
    [weekendStops],
  );

  useEffect(() => {
    if (!leafletReady || !mapRef.current) return;
    const L = (window as any).L;
    if (!mapInstance.current) {
      mapInstance.current = L.map(mapRef.current, {zoomControl: true, attributionControl: false}).setView(
        [40.2, -74.5],
        8,
      );
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', {
        subdomains: 'abcd',
        maxZoom: 19,
      }).addTo(mapInstance.current);
      L.control.attribution({prefix: false}).addAttribution('© OpenStreetMap · CARTO').addTo(mapInstance.current);
    }
    const map = mapInstance.current;

    mapLayersRef.current.pins.forEach((p) => map.removeLayer(p));
    mapLayersRef.current.pins = [];
    if (mapLayersRef.current.route) {
      map.removeLayer(mapLayersRef.current.route);
      mapLayersRef.current.route = null;
    }

    // Faint pins for all known NJ dispensaries (from the local coords index)
    Object.entries(COORDS_LOOKUP).forEach(([key, coords]) => {
      const [name, city] = key.split('|');
      const m = L.circleMarker([coords.lat, coords.lng], {
        radius: 4,
        color: BRAND.gray,
        fillColor: BRAND.gray,
        fillOpacity: 0.5,
        weight: 1,
      }).addTo(map);
      m.bindTooltip(
        `${name.replace(/\b\w/g, (c: string) => c.toUpperCase())} — ${city.replace(/\b\w/g, (c: string) => c.toUpperCase())}`,
        {direction: 'top'},
      );
      mapLayersRef.current.pins.push(m);
    });

    mappableStops.forEach((s, i) => {
      const color = s.pending ? BRAND.white : BRAND.gold;
      const icon = L.divIcon({
        className: 'hs-pin',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
        html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2px solid #000;display:flex;align-items:center;justify-content:center;font-family:Teko,sans-serif;font-size:18px;font-weight:700;color:#000;box-shadow:0 2px 6px rgba(0,0,0,0.6);">${i + 1}</div>`,
      });
      const m = L.marker([s.lat, s.lng], {icon}).addTo(map);
      m.bindPopup(
        `<b>${s.name}</b><br>${s.city}<br>${shiftLabel(s.shiftKey)} · ${fmtDate(s.date)}${
          s.pending ? '<br><em>Pending</em>' : ''
        }`,
      );
      mapLayersRef.current.pins.push(m);
    });

    if (mappableStops.length >= 2) {
      mapLayersRef.current.route = L.polyline(
        mappableStops.map((s) => [s.lat, s.lng]),
        {color: BRAND.gold, weight: 3, opacity: 0.9, dashArray: '8,6'},
      ).addTo(map);
      map.fitBounds(mapLayersRef.current.route.getBounds(), {padding: [40, 40]});
    } else if (mappableStops.length === 1) {
      map.setView([mappableStops[0].lat, mappableStops[0].lng], 10);
    } else {
      map.setView([40.2, -74.5], 8);
    }
  }, [leafletReady, mappableStops]);

  const driveLegs = useMemo(() => {
    const legs: number[] = [];
    for (let i = 0; i < mappableStops.length - 1; i++) {
      legs.push(estDriveMinutes(mappableStops[i], mappableStops[i + 1]));
    }
    return legs;
  }, [mappableStops]);
  const totalDrive = driveLegs.reduce((a, b) => a + b, 0);

  const step1Done = !!dispensary;
  const step2Done = !!slot;
  // Link mode is "done" as soon as a slot is picked — the contact handoff happens in the portal.
  const step3Done = mode === 'link' ? !!slot : !!contact;
  const step5Done = step1Done && step2Done && step3Done;

  const handleBook = () => {
    if (!dispensary || !slot) return;

    // LINK MODE — hand off to the dispensary's own booking portal.
    // Copy a prefilled payload to clipboard so the staffer can paste it into the
    // portal's form. Open the portal in a new tab with common hints as query params
    // (portals ignore unknown params safely).
    if (mode === 'link' && dispensary.popUpLink) {
      const slotLabel = `${fmtDate(slot.date)} — ${shiftLabel(slot.shiftKey)}`;
      const payload = [
        `Vendor: Highsman`,
        `Dispensary: ${dispensary.name} — ${dispensary.city}, NJ`,
        `Requested Slot: ${slotLabel}`,
        `Contact From Highsman: popups@highsman.com`,
        `Products: Hit Stick, Pre-Rolls, Ground Game`,
        ``,
        `Notes: Pop-up booking requested via Highsman staff tool.`,
      ].join('\n');

      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard) {
          navigator.clipboard.writeText(payload).catch(() => {});
        }
      } catch {
        // ignore — clipboard is best-effort
      }

      const params = new URLSearchParams({
        vendor: 'Highsman',
        dispensary: dispensary.name,
        city: dispensary.city,
        date: slot.date,
        slot: shiftLabel(slot.shiftKey),
        email: 'popups@highsman.com',
      });
      const sep = dispensary.popUpLink.includes('?') ? '&' : '?';
      const targetUrl = `${dispensary.popUpLink}${sep}${params.toString()}`;

      if (typeof window !== 'undefined') window.open(targetUrl, '_blank', 'noopener,noreferrer');

      // eslint-disable-next-line no-console
      console.log('[LINK HANDOFF]', {dispensary, slot, targetUrl, payload});
      setBookings((b) => [
        ...b,
        {
          dispId: dispensary.id,
          name: dispensary.name,
          city: dispensary.city,
          lat: dispensary.lat,
          lng: dispensary.lng,
          date: slot.date,
          shiftKey: slot.shiftKey,
        },
      ]);
      setToast(true);
      setTimeout(() => setToast(false), 3200);
      setSlot(null);
      return;
    }

    // EMAIL / MANUAL MODE — standard calendar-invite flow.
    if (!contact) return;
    // In production: POST /api/popups/book → creates Google Calendar event on
    // popups@highsman.com, invites contact + staff, upserts Zoho Contact.
    // eslint-disable-next-line no-console
    console.log('[MOCK BOOK]', {dispensary, slot, contact, calendar: 'popups@highsman.com'});
    setBookings((b) => [
      ...b,
      {
        dispId: dispensary.id,
        name: dispensary.name,
        city: dispensary.city,
        lat: dispensary.lat,
        lng: dispensary.lng,
        date: slot.date,
        shiftKey: slot.shiftKey,
      },
    ]);
    setToast(true);
    setTimeout(() => setToast(false), 3200);
    setSlot(null);
    setOverrideContact(false);
    setNewContact({name: '', role: '', email: '', phone: ''});
  };

  const resetAll = () => {
    setDispensary(null);
    setSlot(null);
    setOverrideContact(false);
    setNewContact({name: '', role: '', email: '', phone: ''});
    setQuery('');
    window.scrollTo({top: 0, behavior: 'smooth'});
  };

  const stepBox: React.CSSProperties = {
    border: `1px solid ${BRAND.line}`,
    background: BRAND.surface,
    marginBottom: 24,
    overflow: 'hidden',
  };
  const stepHead: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 18,
    padding: '22px 28px',
    borderBottom: `1px solid ${BRAND.line}`,
    background: 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
  };
  const stepNum: React.CSSProperties = {
    fontFamily: TEKO,
    fontSize: 40,
    fontWeight: 700,
    color: BRAND.gold,
    lineHeight: 0.8,
    minWidth: 56,
  };
  const stepStatus = (done: boolean): React.CSSProperties => ({
    fontFamily: TEKO,
    fontSize: 15,
    letterSpacing: '0.14em',
    padding: '6px 12px',
    border: `1px solid ${done ? 'rgba(46,204,113,0.5)' : BRAND.lineStrong}`,
    color: done ? BRAND.green : BRAND.gray,
    whiteSpace: 'nowrap',
  });
  const h2: React.CSSProperties = {
    fontFamily: TEKO,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
    fontWeight: 600,
    fontSize: 34,
    margin: 0,
    color: BRAND.white,
  };
  const kicker: React.CSSProperties = {
    margin: '4px 0 0',
    color: BRAND.gray,
    fontSize: 15,
    lineHeight: 1.4,
    fontFamily: BODY,
  };

  return (
    <div style={{fontFamily: BODY, background: BRAND.black, color: BRAND.white, minHeight: '100vh'}}>
      {/* TOP BAR */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(0,0,0,0.92)',
          backdropFilter: 'blur(8px)',
          borderBottom: `1px solid ${BRAND.line}`,
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 24,
            fontFamily: TEKO,
            textTransform: 'uppercase',
            fontSize: 17,
            letterSpacing: '0.08em',
            color: BRAND.gray,
          }}
        >
          <Link to="/wholesale" style={{textDecoration: 'none', color: 'inherit'}}>
            ← Wholesale Portal
          </Link>
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              border: `1px solid ${BRAND.gold}`,
              color: BRAND.gold,
              fontSize: 13,
              letterSpacing: '0.14em',
            }}
          >
            ● Staff Only · Internal Tool
          </span>
          <a href="mailto:popups@highsman.com" style={{textDecoration: 'none', color: 'inherit'}}>
            popups@highsman.com
          </a>
        </div>
      </div>

      {/* HERO */}
      <section
        style={{
          padding: '56px 28px 40px',
          textAlign: 'center',
          borderBottom: `1px solid ${BRAND.line}`,
          background: 'radial-gradient(ellipse at top, rgba(245,229,0,0.08), transparent 60%), #000',
        }}
      >
        <img
          src={LOGO_WHITE}
          alt="Highsman"
          style={{maxWidth: 260, width: '60%', height: 'auto', margin: '0 auto 24px', display: 'block'}}
        />
        <div
          style={{
            fontFamily: TEKO,
            textTransform: 'uppercase',
            letterSpacing: '0.3em',
            color: BRAND.gray,
            fontSize: 15,
            marginBottom: 8,
          }}
        >
          New Jersey · Pop Up Booking
        </div>
        <h1
          style={{
            fontFamily: TEKO,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            lineHeight: 1,
            margin: 0,
            fontWeight: 700,
            fontSize: 'clamp(64px, 9vw, 128px)',
            color: BRAND.white,
            marginBottom: 14,
          }}
        >
          Book The <span style={{color: BRAND.gold}}>Pop Up</span>
        </h1>
        <p style={{maxWidth: 720, margin: '0 auto', color: BRAND.gray, fontSize: 18, lineHeight: 1.55}}>
          Staff tool for scheduling Highsman pop ups at licensed NJ dispensaries.{' '}
          <strong style={{color: BRAND.white, fontWeight: 600}}>Thursday &amp; Friday 3–7 PM</strong> (max 2
          simultaneous statewide),{' '}
          <strong style={{color: BRAND.white, fontWeight: 600}}>
            Saturday &amp; Sunday 1–3 PM and 4–6 PM
          </strong>{' '}
          shifts. Confirmed bookings auto-sync to Google Calendar and{' '}
          <span style={{color: BRAND.gold}}>popups@highsman.com</span>.
        </p>
      </section>

      <main style={{maxWidth: 1400, margin: '0 auto', padding: '40px 28px 80px'}}>
        {/* STEP 01 */}
        <section style={{...stepBox, overflow: 'visible', position: 'relative', zIndex: 30}}>
          <div style={stepHead}>
            <div style={stepNum}>01</div>
            <div style={{flex: 1}}>
              <h2 style={h2}>Select Dispensary</h2>
              <p style={kicker}>
                Same lookup as the NJ Wholesale Menu. Contacts auto-pull from Zoho when a dispensary is
                picked.
              </p>
            </div>
            <div style={stepStatus(step1Done)}>{step1Done ? 'Locked In' : 'Pending'}</div>
          </div>
          <div style={{padding: 28}}>
            {!dispensary && (
              <div style={{position: 'relative'}}>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPickerOpen(true);
                  }}
                  onFocus={() => setPickerOpen(true)}
                  onBlur={() => setTimeout(() => setPickerOpen(false), 150)}
                  placeholder="Search by dispensary name or city…"
                  autoComplete="off"
                  style={{
                    width: '100%',
                    background: BRAND.black,
                    border: `1px solid ${BRAND.lineStrong}`,
                    color: BRAND.white,
                    fontFamily: BODY,
                    fontSize: 18,
                    padding: '18px 20px',
                    outline: 'none',
                  }}
                />
                {pickerOpen && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      top: 'calc(100% + 4px)',
                      background: BRAND.black,
                      border: `1px solid ${BRAND.lineStrong}`,
                      maxHeight: 380,
                      overflowY: 'auto',
                      zIndex: 40,
                      boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
                    }}
                  >
                    {query.trim().length < 2 ? (
                      <div style={{padding: '14px 20px', color: BRAND.gray}}>
                        Type at least 2 characters to search NJ dispensaries.
                      </div>
                    ) : isSearching ? (
                      <div style={{padding: '14px 20px', color: BRAND.gray}}>
                        Searching Zoho CRM…
                      </div>
                    ) : crmUnavailable ? (
                      <div style={{padding: '14px 20px', color: BRAND.red}}>
                        CRM not configured — can't search live. Contact ops.
                      </div>
                    ) : filtered.length === 0 ? (
                      <div style={{padding: '14px 20px', color: BRAND.gray}}>
                        No NJ dispensaries found for "{query.trim()}". Check the spelling or try a city.
                      </div>
                    ) : (
                      filtered.map((d) => (
                        <div
                          key={d.id}
                          onMouseDown={() => {
                            setDispensary(d);
                            setOverrideContact(false);
                            setQuery('');
                            setPickerOpen(false);
                          }}
                          style={{
                            padding: '14px 20px',
                            borderBottom: `1px solid ${BRAND.line}`,
                            cursor: 'pointer',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: 14,
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.chip)}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                        >
                          <div>
                            <div
                              style={{
                                fontFamily: TEKO,
                                fontSize: 22,
                                letterSpacing: '0.03em',
                                textTransform: 'uppercase',
                              }}
                            >
                              {d.name}
                            </div>
                            <div style={{color: BRAND.gray, fontSize: 14}}>{d.city}, NJ</div>
                          </div>
                          {(() => {
                            const label = d.popUpLink ? 'Portal' : d.contact || d.popUpEmail ? 'Email POC' : 'No POC';
                            const color = d.popUpLink ? BRAND.gold : d.contact || d.popUpEmail ? BRAND.green : BRAND.gray;
                            return (
                              <span
                                style={{
                                  fontFamily: TEKO,
                                  fontSize: 12,
                                  letterSpacing: '0.15em',
                                  padding: '2px 8px',
                                  border: `1px solid ${color}`,
                                  color,
                                }}
                              >
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
            {dispensary && (
              <div
                style={{
                  border: `1px solid ${BRAND.lineStrong}`,
                  padding: '20px 22px',
                  background: 'linear-gradient(180deg, rgba(245,229,0,0.04), transparent)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 16,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                }}
              >
                <div>
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 28,
                      letterSpacing: '0.03em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {dispensary.name}
                  </div>
                  <div style={{color: BRAND.gray, fontSize: 15, marginTop: 2}}>
                    {dispensary.city}, NJ
                    {dispensary.lastVisitDate && (
                      <>
                        {' · '}
                        <span style={{color: BRAND.white}}>
                          Last visit {fmtDate(dispensary.lastVisitDate)}
                        </span>
                      </>
                    )}
                  </div>
                  {dispensary.popUpLink && (
                    <div
                      style={{
                        marginTop: 8,
                        display: 'inline-block',
                        fontFamily: TEKO,
                        fontSize: 12,
                        letterSpacing: '0.18em',
                        textTransform: 'uppercase',
                        color: BRAND.gold,
                        border: `1px solid ${BRAND.gold}`,
                        padding: '3px 8px',
                      }}
                    >
                      Books via dispensary portal
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setDispensary(null);
                    setSlot(null);
                    setOverrideContact(false);
                    setNewContact({name: '', role: '', email: '', phone: ''});
                  }}
                  style={{
                    background: 'transparent',
                    border: `1px solid ${BRAND.lineStrong}`,
                    color: BRAND.gray,
                    padding: '8px 14px',
                    fontFamily: TEKO,
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  Change
                </button>
              </div>
            )}
          </div>
        </section>

        {/* STEP 02 */}
        <section style={stepBox}>
          <div style={stepHead}>
            <div style={stepNum}>02</div>
            <div style={{flex: 1}}>
              <h2 style={h2}>Pick Time Slot</h2>
              <p style={kicker}>
                All shifts cap at 2 simultaneous bookings statewide. Sat/Sun splits into matinee (1–3 PM)
                and late (4–6 PM) — each with its own 2-spot cap.
              </p>
            </div>
            <div style={stepStatus(step2Done)}>{step2Done ? 'Locked In' : 'Pending'}</div>
          </div>
          <div style={{padding: 28}}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: 12,
                marginBottom: 22,
              }}
            >
              {[
                {l: 'Thu & Fri', v: '3:00 – 7:00 PM', s: 'Max 2 simultaneous · NJ statewide'},
                {l: 'Sat & Sun · Matinee', v: '1:00 – 3:00 PM', s: 'Max 2 simultaneous · route-planned'},
                {l: 'Sat & Sun · Late', v: '4:00 – 6:00 PM', s: 'Max 2 simultaneous · drive-time checked'},
                {l: 'Lead Time', v: '72 Hours Min', s: 'For gear + ops prep'},
              ].map((r) => (
                <div
                  key={r.l}
                  style={{border: `1px solid ${BRAND.line}`, padding: '14px 16px', background: BRAND.black}}
                >
                  <div
                    style={{
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontSize: 13,
                      color: BRAND.gray,
                      marginBottom: 4,
                    }}
                  >
                    {r.l}
                  </div>
                  <div style={{fontFamily: TEKO, fontSize: 22, color: BRAND.white}}>{r.v}</div>
                  <div style={{color: BRAND.gray, fontSize: 13, marginTop: 4}}>{r.s}</div>
                </div>
              ))}
            </div>

            {!dispensary ? (
              <div
                style={{
                  padding: 20,
                  textAlign: 'center',
                  border: `1px dashed ${BRAND.lineStrong}`,
                  color: BRAND.gray,
                }}
              >
                Pick a dispensary above to unlock time slots.
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: 14,
                }}
              >
                {week.map((day) => (
                  <div key={day.iso} style={{border: `1px solid ${BRAND.line}`, background: BRAND.black}}>
                    <div
                      style={{
                        padding: '14px 16px',
                        borderBottom: `1px solid ${BRAND.line}`,
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'baseline',
                      }}
                    >
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 26,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {day.dow}
                      </div>
                      <div
                        style={{
                          color: BRAND.gray,
                          fontSize: 14,
                          fontFamily: TEKO,
                          letterSpacing: '0.1em',
                        }}
                      >
                        {day.date.toLocaleDateString('en-US', {month: 'short', day: 'numeric'})}
                      </div>
                    </div>
                    {day.shifts.map((s) => {
                      const used = countBookings(day.iso, s.key);
                      const full = used >= s.capacity;
                      const remaining = s.capacity - used;
                      const selected = slot && slot.date === day.iso && slot.shiftKey === s.key;
                      return (
                        <div
                          key={s.key}
                          onClick={() => {
                            if (full) return;
                            setSlot({
                              date: day.iso,
                              dateLabel: fmtDate(day.iso),
                              dowLabel: day.dow,
                              timeLabel: s.label,
                              shiftKey: s.key,
                            });
                          }}
                          style={{
                            padding: 16,
                            borderBottom: `1px solid ${BRAND.line}`,
                            cursor: full ? 'not-allowed' : 'pointer',
                            opacity: full ? 0.4 : 1,
                            background: selected ? BRAND.gold : 'transparent',
                            color: selected ? BRAND.black : BRAND.white,
                          }}
                        >
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 22,
                              letterSpacing: '0.05em',
                              textTransform: 'uppercase',
                              color: selected ? BRAND.black : BRAND.white,
                            }}
                          >
                            {selected ? '● ' : ''}
                            {s.label}
                          </div>
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 13,
                              letterSpacing: '0.14em',
                              color: selected ? BRAND.black : full ? BRAND.red : BRAND.gray,
                              marginTop: 4,
                            }}
                          >
                            {full
                              ? 'Slot Full · Statewide Cap Hit'
                              : `${remaining} of ${s.capacity} open`}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* STEP 03 */}
        <section style={stepBox}>
          <div style={stepHead}>
            <div style={stepNum}>03</div>
            <div style={{flex: 1}}>
              <h2 style={h2}>Confirm Dispensary Contact</h2>
              <p style={kicker}>
                Who's the point person at the shop? We'll add them to the calendar invite. If not in Zoho,
                we'll create the record.
              </p>
            </div>
            <div style={stepStatus(step3Done)}>{step3Done ? 'Locked In' : 'Pending'}</div>
          </div>
          <div style={{padding: 28}}>
            {!dispensary && (
              <div style={{color: BRAND.gray}}>Pick a dispensary above to see contact details.</div>
            )}
            {dispensary && mode === 'link' && (
              <div
                style={{
                  border: `1px solid ${BRAND.gold}`,
                  padding: '22px 24px',
                  background: 'linear-gradient(180deg, rgba(245,229,0,0.08), transparent)',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    letterSpacing: '0.2em',
                    color: BRAND.gold,
                    marginBottom: 8,
                  }}
                >
                  ● Direct Booking Portal
                </div>
                <div style={{color: BRAND.white, fontSize: 16, marginBottom: 6}}>
                  {dispensary.name} uses their own vendor-event portal. We'll hand you off there at the final step —
                  no email invite needed from our side.
                </div>
                <div style={{color: BRAND.gray, fontSize: 14, marginBottom: 14, wordBreak: 'break-all'}}>
                  {dispensary.popUpLink}
                </div>
                <div style={{fontSize: 14, color: BRAND.gray}}>
                  Wrong channel?{' '}
                  <button
                    type="button"
                    onClick={() => setOverrideContact(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: BRAND.gold,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      font: 'inherit',
                      padding: 0,
                    }}
                  >
                    Use an email POC instead for this booking →
                  </button>
                </div>
              </div>
            )}
            {dispensary && mode === 'email' && dispensary.contact && (
              <div
                style={{
                  border: `1px solid ${BRAND.lineStrong}`,
                  padding: '22px 24px',
                  background: 'linear-gradient(180deg, rgba(46,204,113,0.05), transparent)',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    letterSpacing: '0.2em',
                    color: BRAND.green,
                    marginBottom: 8,
                  }}
                >
                  ● Found in Zoho CRM
                </div>
                <div style={{color: BRAND.gray, marginBottom: 10}}>
                  Contact linked to this Account — will be auto-invited to the calendar event.
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    marginTop: 12,
                  }}
                >
                  {[
                    ['Contact Name', dispensary.contact.name],
                    ['Role', dispensary.contact.role],
                    ['Email', dispensary.contact.email],
                    ['Phone', dispensary.contact.phone],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <label
                        style={{
                          display: 'block',
                          fontFamily: TEKO,
                          textTransform: 'uppercase',
                          letterSpacing: '0.16em',
                          fontSize: 13,
                          color: BRAND.gray,
                          marginBottom: 6,
                        }}
                      >
                        {l}
                      </label>
                      <div
                        style={{
                          padding: '12px 14px',
                          border: `1px dashed ${BRAND.line}`,
                          color: BRAND.white,
                          fontFamily: BODY,
                          fontSize: 16,
                        }}
                      >
                        {v}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{marginTop: 14, fontSize: 14, color: BRAND.gray}}>
                  Wrong contact?{' '}
                  <button
                    type="button"
                    onClick={() => setOverrideContact(true)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: BRAND.gold,
                      textDecoration: 'underline',
                      cursor: 'pointer',
                      font: 'inherit',
                      padding: 0,
                    }}
                  >
                    Use a different person for this booking →
                  </button>
                </div>
              </div>
            )}
            {dispensary && mode === 'manual' && (
              <div
                style={{
                  border: `1px solid ${BRAND.lineStrong}`,
                  padding: '22px 24px',
                  background: 'linear-gradient(180deg, rgba(245,229,0,0.05), transparent)',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    letterSpacing: '0.2em',
                    color: BRAND.gold,
                    marginBottom: 8,
                  }}
                >
                  ● Add New Contact to Zoho
                </div>
                <div style={{color: BRAND.gray, marginBottom: 10}}>
                  {overrideContact
                    ? 'Overriding the default Zoho contact for this booking. Fill in the one-time details below.'
                    : "No point-of-contact on file for this account. Fill in the details — we'll create the Zoho contact and attach it to the calendar invite."}
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: 14,
                    marginTop: 12,
                  }}
                >
                  {(
                    [
                      {k: 'name', l: 'Contact Name *', p: 'Jane Doe', t: 'text'},
                      {k: 'role', l: 'Role / Title', p: 'General Manager, Buyer, etc.', t: 'text'},
                      {k: 'email', l: 'Email *', p: 'jane@dispensary.com', t: 'email'},
                      {k: 'phone', l: 'Phone *', p: '(201) 555-0123', t: 'tel'},
                    ] as const
                  ).map((f) => (
                    <div key={f.k}>
                      <label
                        style={{
                          display: 'block',
                          fontFamily: TEKO,
                          textTransform: 'uppercase',
                          letterSpacing: '0.16em',
                          fontSize: 13,
                          color: BRAND.gray,
                          marginBottom: 6,
                        }}
                      >
                        {f.l}
                      </label>
                      <input
                        type={f.t}
                        value={newContact[f.k]}
                        onChange={(e) => setNewContact((p) => ({...p, [f.k]: e.target.value}))}
                        placeholder={f.p}
                        style={{
                          width: '100%',
                          background: BRAND.black,
                          border: `1px solid ${BRAND.lineStrong}`,
                          color: BRAND.white,
                          padding: '12px 14px',
                          fontFamily: BODY,
                          fontSize: 16,
                          outline: 'none',
                        }}
                      />
                    </div>
                  ))}
                </div>
                <div style={{marginTop: 14, fontSize: 14, color: BRAND.gray}}>
                  <strong style={{color: BRAND.gold}}>Auto-sync:</strong> Submitting creates a new Zoho
                  Contact, links it to the Account, and adds them to the Google Calendar invite alongside
                  popups@highsman.com.
                </div>
              </div>
            )}
          </div>
        </section>

        {/* STEP 04 */}
        <section style={stepBox}>
          <div style={stepHead}>
            <div style={stepNum}>04</div>
            <div style={{flex: 1}}>
              <h2 style={h2}>Weekend Route Planner</h2>
              <p style={kicker}>
                All confirmed NJ bookings plotted on one map. Drive time between stops is calculated so the
                same crew can cover multiple shifts without overreaching.
              </p>
            </div>
            <div style={stepStatus(weekendStops.length > 0)}>
              {weekendStops.length > 0
                ? `${weekendStops.length} Stop${weekendStops.length === 1 ? '' : 's'}`
                : 'Weekend Only'}
            </div>
          </div>
          <div style={{padding: 28}}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'minmax(0,1.4fr) minmax(0,1fr)',
                gap: 18,
              }}
            >
              <div
                ref={mapRef}
                style={{height: 520, border: `1px solid ${BRAND.line}`, background: '#111', minWidth: 0}}
              />
              <aside
                style={{
                  border: `1px solid ${BRAND.line}`,
                  padding: 20,
                  background: BRAND.black,
                  display: 'flex',
                  flexDirection: 'column',
                  minWidth: 0,
                }}
              >
                <h3 style={{...h2, fontSize: 24}}>Selected Stops</h3>
                <div style={{color: BRAND.gray, fontSize: 14, marginBottom: 16, lineHeight: 1.5}}>
                  Ordered by shift time. Legs flagged red if drive time &gt; 45 min between consecutive
                  stops.
                </div>
                {weekendStops.length === 0 ? (
                  <div
                    style={{
                      color: BRAND.gray,
                      fontSize: 15,
                      padding: '40px 8px',
                      textAlign: 'center',
                      border: `1px dashed ${BRAND.lineStrong}`,
                    }}
                  >
                    Select a weekend shift to plot a route.
                    <br />
                    Matinee + late shifts for the same crew show here with drive-time checks.
                  </div>
                ) : (
                  weekendStops.map((s, i) => (
                    <div key={`${s.name}-${s.city}-${s.date}-${s.shiftKey}-${i}`}>
                      <div
                        style={{
                          border: `1px solid ${BRAND.line}`,
                          padding: '12px 14px',
                          marginBottom: 10,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            background: s.pending ? BRAND.white : BRAND.gold,
                            color: BRAND.black,
                            fontFamily: TEKO,
                            fontSize: 20,
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            border: s.pending ? `1px solid ${BRAND.gold}` : 'none',
                          }}
                        >
                          {i + 1}
                        </div>
                        <div style={{flex: 1, minWidth: 0}}>
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 20,
                              letterSpacing: '0.03em',
                              textTransform: 'uppercase',
                              color: BRAND.white,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {s.name}
                            {s.pending && (
                              <span
                                style={{
                                  color: BRAND.gold,
                                  fontSize: 13,
                                  letterSpacing: '0.1em',
                                  marginLeft: 8,
                                }}
                              >
                                · PENDING
                              </span>
                            )}
                          </div>
                          <div style={{color: BRAND.gray, fontSize: 13}}>
                            {s.city} · {shiftLabel(s.shiftKey)} · {fmtDate(s.date)}
                          </div>
                        </div>
                      </div>
                      {i < weekendStops.length - 1 && (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '8px 0 8px 32px',
                            color: driveLegs[i] > 45 ? BRAND.red : BRAND.gray,
                            fontSize: 14,
                            fontFamily: TEKO,
                            letterSpacing: '0.08em',
                          }}
                        >
                          <span style={{color: BRAND.gold}}>↓</span> {driveLegs[i]} min drive
                          {driveLegs[i] > 45 ? ' · flagged' : ''}
                        </div>
                      )}
                    </div>
                  ))
                )}
                <div
                  style={{
                    marginTop: 'auto',
                    paddingTop: 16,
                    borderTop: `1px solid ${BRAND.line}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                  }}
                >
                  <span
                    style={{
                      fontFamily: TEKO,
                      fontSize: 15,
                      letterSpacing: '0.18em',
                      color: BRAND.gray,
                    }}
                  >
                    Total Drive
                  </span>
                  <span style={{fontFamily: TEKO, fontSize: 28, color: BRAND.gold}}>
                    {totalDrive > 0 ? `${totalDrive} min` : '—'}
                  </span>
                </div>
              </aside>
            </div>
          </div>
        </section>

        {/* STEP 05 */}
        <section style={stepBox}>
          <div style={stepHead}>
            <div style={stepNum}>05</div>
            <div style={{flex: 1}}>
              <h2 style={h2}>Review &amp; Spark Greatness</h2>
              <p style={kicker}>
                Confirm the details. One click creates the Google Calendar invite, emails
                popups@highsman.com, and updates the Zoho record.
              </p>
            </div>
            <div style={stepStatus(step5Done)}>{step5Done ? 'Ready' : 'Pending'}</div>
          </div>
          <div style={{padding: 28}}>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                border: `1px solid ${BRAND.line}`,
              }}
            >
              {(
                [
                  ['Dispensary', dispensary?.name || '—'],
                  ['City / State', dispensary ? `${dispensary.city}, NJ` : '—'],
                  ['Date', slot?.dateLabel || '—'],
                  ['Shift', slot?.timeLabel || '—'],
                  mode === 'link'
                    ? ['Booking Channel', dispensary?.popUpLink ? 'Dispensary Portal' : '—']
                    : ['Contact', contact ? `${contact.name}${contact.source === 'new' ? ' · New' : ''}` : '—'],
                  ['Calendar', mode === 'link' ? 'Via dispensary portal' : 'popups@highsman.com'],
                ] as Array<[string, string]>
              ).map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    padding: '18px 20px',
                    borderRight: `1px solid ${BRAND.line}`,
                    borderBottom: `1px solid ${BRAND.line}`,
                  }}
                >
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 13,
                      letterSpacing: '0.18em',
                      color: BRAND.gray,
                      textTransform: 'uppercase',
                      marginBottom: 6,
                    }}
                  >
                    {k}
                  </div>
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 22,
                      textTransform: 'uppercase',
                      letterSpacing: '0.03em',
                    }}
                  >
                    {v}
                  </div>
                </div>
              ))}
            </div>

            <div style={{marginTop: 24, display: 'flex', gap: 14, flexWrap: 'wrap'}}>
              <button
                onClick={handleBook}
                disabled={!step5Done}
                style={{
                  fontFamily: TEKO,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  fontSize: 22,
                  padding: '16px 28px',
                  border: 'none',
                  cursor: step5Done ? 'pointer' : 'not-allowed',
                  background: BRAND.gold,
                  color: BRAND.black,
                  fontWeight: 700,
                  opacity: step5Done ? 1 : 0.5,
                }}
              >
                {mode === 'link' ? 'Open Dispensary Portal →' : 'Confirm & Book Pop Up'}
              </button>
              <button
                onClick={resetAll}
                style={{
                  fontFamily: TEKO,
                  textTransform: 'uppercase',
                  letterSpacing: '0.14em',
                  fontSize: 22,
                  padding: '16px 28px',
                  background: 'transparent',
                  border: `1px solid ${BRAND.lineStrong}`,
                  color: BRAND.gray,
                  cursor: 'pointer',
                }}
              >
                Start Over
              </button>
            </div>

            <div
              style={{
                marginTop: 14,
                color: BRAND.gray,
                fontSize: 14,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <span>Invite goes to:</span>
              <code
                style={{
                  background: BRAND.chip,
                  padding: '2px 8px',
                  color: BRAND.white,
                  fontFamily: BODY,
                  fontSize: 14,
                }}
              >
                popups@highsman.com
              </code>
              <span>+</span>
              <code
                style={{
                  background: BRAND.chip,
                  padding: '2px 8px',
                  color: BRAND.white,
                  fontFamily: BODY,
                  fontSize: 14,
                }}
              >
                {contact?.email || 'contact@dispensary.com'}
              </code>
              <span>·</span>
              <span>Zoho record updated</span>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer style={{borderTop: `1px solid ${BRAND.line}`, padding: '48px 28px', textAlign: 'center'}}>
        <img
          src={SPARK_WHITE}
          alt="Spark Greatness"
          style={{maxWidth: 180, opacity: 0.9, marginBottom: 14, display: 'inline-block'}}
        />
        <div
          style={{
            fontFamily: TEKO,
            textTransform: 'uppercase',
            letterSpacing: '0.2em',
            color: BRAND.gray,
            fontSize: 16,
          }}
        >
          Pop Up Questions ·{' '}
          <a href="mailto:popups@highsman.com" style={{color: BRAND.white, textDecoration: 'none'}}>
            popups@highsman.com
          </a>
        </div>
        <div style={{marginTop: 20, fontSize: 13, color: BRAND.gray}}>
          © 2026 Highsman Inc. All rights reserved. Staff tool — do not share externally. Compliance:
          licensed NJ-CRC dispensaries only.
        </div>
      </footer>

      {/* Toast */}
      <div
        style={{
          position: 'fixed',
          bottom: 30,
          left: '50%',
          transform: `translateX(-50%) translateY(${toast ? '0' : '120%'})`,
          background: BRAND.gold,
          color: BRAND.black,
          padding: '18px 28px',
          fontFamily: TEKO,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontSize: 22,
          fontWeight: 700,
          boxShadow: '0 18px 40px rgba(0,0,0,0.5)',
          transition: 'transform .4s cubic-bezier(.22,1,.36,1)',
          zIndex: 100,
          pointerEvents: 'none',
        }}
      >
        ● Pop Up Booked — Calendar Invite Sent
      </div>
    </div>
  );
}
