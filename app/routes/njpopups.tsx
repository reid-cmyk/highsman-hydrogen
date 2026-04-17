import {useState, useEffect, useMemo, useRef, useCallback} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useFetcher, useLoaderData} from '@remix-run/react';
import type {RepId, QuickCoverage} from '~/lib/reps';
import {
  MAX_SOLO_DRIVE_MIN,
  MAX_DOUBLEHEADER_HOP_MIN,
  REP_HUBS,
  quickCoverageStatus,
} from '~/lib/reps';

// ─────────────────────────────────────────────────────────────────────────────
// LOADER — expose the Google Maps JS API key to the client.
// Prefer env.GOOGLE_MAPS_JS_KEY — a browser-only key restricted by HTTP
// referrer to *.highsman.com in Cloud Console and scoped to the Maps
// JavaScript API only. Falls back to GOOGLE_PLACES_API_KEY (the existing
// server-side key) so the map keeps working if the new env var is not yet
// set. Once GOOGLE_MAPS_JS_KEY is configured in Oxygen, the fallback can be
// removed.
// ─────────────────────────────────────────────────────────────────────────────
export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  const browserKey =
    (env?.GOOGLE_MAPS_JS_KEY as string) ||
    (env?.GOOGLE_PLACES_API_KEY as string) ||
    '';
  return json({
    googleMapsApiKey: browserKey,
  });
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Booking window rules:
//   LAUNCH_DATE   — the first day pop-ups can physically run. Hard floor; no
//                    date before this is bookable even if the lead time clears.
//   MIN_LEAD_DAYS — bookings must be at least this many days ahead so POC +
//                    rep have time to confirm logistics/portal paperwork.
//   WINDOW_WEEKS  — how many weeks of Thu/Fri/Sat/Sun shifts the picker shows.
//                    ~2 months of rolling visibility; each week the last week
//                    drops off and a new one appears at the far end.
// Enforcement is layered: picker gray-out, Book button disabled, handleBook
// safety net. `tooEarly` (before LAUNCH_DATE) and `tooSoon` (inside lead time)
// are separate flags so staff see the right reason in each card.
// ─────────────────────────────────────────────────────────────────────────────
const LAUNCH_DATE = '2026-05-08';
const MIN_LEAD_DAYS = 5;
const WINDOW_WEEKS = 9;

function isoLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysUntil(iso: string) {
  const [y, m, d] = iso.split('-').map((n) => parseInt(n, 10));
  const target = new Date(y, (m || 1) - 1, d || 1).getTime();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today.getTime()) / 86_400_000);
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
type Shift = {key: string; label: string; capacity: number};
type Day = {iso: string; dow: string; date: Date; shifts: Shift[]};
type Week = {weekIndex: number; weekLabel: string; days: Day[]};

// Builds a rolling calendar of Thu/Fri/Sat/Sun shift days across WINDOW_WEEKS
// consecutive weeks, anchored on the first week whose Sunday falls at or after
// today's lead-time floor AND at or after LAUNCH_DATE. This gives staff ~2
// months of forward visibility so they can plan paired weekend shifts and
// catch early-bird bookings before dispensaries lock their calendars.
function buildWeeks(): Week[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First viable calendar date = later of (today + lead) and LAUNCH_DATE.
  const earliestByLead = new Date(today);
  earliestByLead.setDate(today.getDate() + MIN_LEAD_DAYS);
  const [ly, lm, ld] = LAUNCH_DATE.split('-').map((n) => parseInt(n, 10));
  const launchDate = new Date(ly, (lm || 1) - 1, ld || 1);
  const firstViable =
    earliestByLead.getTime() > launchDate.getTime() ? earliestByLead : launchDate;

  // Snap back to the Thursday of the week containing firstViable. If it's
  // Mon–Wed, hop forward to that week's Thursday instead (no shift days
  // before then).
  const startThu = new Date(firstViable);
  const fvDow = firstViable.getDay(); // 0=Sun .. 6=Sat
  if (fvDow === 0) {
    startThu.setDate(firstViable.getDate() - 3); // Sun → prev Thu
  } else if (fvDow >= 4) {
    startThu.setDate(firstViable.getDate() - (fvDow - 4)); // Thu/Fri/Sat → that week's Thu
  } else {
    startThu.setDate(firstViable.getDate() + (4 - fvDow)); // Mon/Tue/Wed → that week's Thu
  }

  const weeks: Week[] = [];
  for (let w = 0; w < WINDOW_WEEKS; w++) {
    const days: Day[] = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(startThu);
      d.setDate(startThu.getDate() + w * 7 + i);
      const iso = isoLocal(d);
      const didx = d.getDay();
      let shifts: Shift[] = [];
      if (didx === 4 || didx === 5) {
        shifts = [
          {
            key: didx === 4 ? 'thu-main' : 'fri-main',
            label: '3:00 – 7:00 PM',
            capacity: 2,
          },
        ];
      } else if (didx === 6 || didx === 0) {
        const p = didx === 6 ? 'sat' : 'sun';
        shifts = [
          {key: `${p}-mat`, label: '1:00 – 3:00 PM', capacity: 2},
          {key: `${p}-late`, label: '4:00 – 6:00 PM', capacity: 2},
        ];
      }
      days.push({
        iso,
        dow: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][didx],
        date: d,
        shifts,
      });
    }
    const startLbl = days[0].date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    const endLbl = days[3].date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });
    weeks.push({
      weekIndex: w,
      weekLabel: `${startLbl} – ${endLbl}`,
      days,
    });
  }
  return weeks;
}

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE PILL — quick, no-API coverage tag rendered in the picker and on the
// selected-dispensary card. The authoritative check still runs via /api/rep-assign
// once a slot is picked, but this lets the rep see out-of-coverage spots as soon
// as they appear in search results. Red border-left on the row drives the eye.
// ─────────────────────────────────────────────────────────────────────────────
function CoveragePill({
  cov,
  compact = false,
}: {
  cov: QuickCoverage;
  compact?: boolean;
}) {
  const miles =
    typeof cov.miles === 'number' ? Math.round(cov.miles) : null;
  let label: string;
  let color: string;
  switch (cov.status) {
    case 'in':
      label = compact ? 'In Coverage' : `In Coverage · ${miles} mi`;
      color = BRAND.green;
      break;
    case 'edge':
      label = `Edge · ~${miles} mi`;
      color = BRAND.gold;
      break;
    case 'out':
      label = `Out of NJ Coverage · ~${miles} mi`;
      color = BRAND.red;
      break;
    default:
      label = 'Verify on pick';
      color = BRAND.gray;
  }
  return (
    <span
      style={{
        fontFamily: TEKO,
        fontSize: 12,
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        padding: '2px 8px',
        border: `1px solid ${color}`,
        color,
        display: 'inline-block',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
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

  // Staff-change override drawer state. When open, staff edits the pop-up POC
  // fields on the current dispensary and the save PATCHes Zoho (override semantics).
  const [staffEditOpen, setStaffEditOpen] = useState(false);
  const [staffEdit, setStaffEdit] = useState({
    email: '',
    link: '',
    name: '',
    role: '',
    phone: '',
  });
  const [staffSaving, setStaffSaving] = useState(false);
  const [staffError, setStaffError] = useState<string | null>(null);
  const [staffToast, setStaffToast] = useState(false);

  // Drive-time guardrail (weekend same-day rule): if staff tries to book a
  // second pop-up on a Sat/Sun at a dispensary more than 40 min driving from
  // the already-booked stop on that day, block the Book button. We compute
  // drive time server-side via Google Routes API (/api/route-time).
  const [driveCheck, setDriveCheck] = useState<
    | {status: 'idle'}
    | {status: 'checking'; otherName: string}
    | {status: 'ok'; minutes: number; text: string; otherName: string}
    | {status: 'blocked'; minutes: number; text: string; otherName: string}
    | {status: 'error'; message: string; otherName: string}
  >({status: 'idle'});

  // ── Rep assignment (NJ coverage guardrail) ──────────────────────────────
  // Every NJ pop-up is run by either the North Jersey rep (Newark hub) or
  // South Jersey rep (Collingswood hub). The server figures out which rep
  // covers the dispensary based on drive time from each hub, and blocks
  // bookings outside coverage. Weekend doubleheader exception: if the same
  // rep already has an earlier booking that Sat/Sun, the second stop can
  // be within MAX_DOUBLEHEADER_HOP_MIN of the earlier dispensary instead.
  const [repCheck, setRepCheck] = useState<
    | {status: 'idle'}
    | {status: 'checking'}
    | {
        status: 'assigned';
        repId: RepId;
        repName: string;
        hubLabel: string;
        subjectTag: string;
        color: string;
        driveMin: number;
        mode: 'solo' | 'doubleheader';
        anchorName?: string;
        note?: string;
      }
    | {
        status: 'blocked';
        reason: 'out_of_coverage' | 'doubleheader_too_far';
        message: string;
      }
    | {status: 'error'; message: string}
  >({status: 'idle'});

  // ── Snr Staff override for out-of-coverage bookings ──
  // When a dispensary is out of the 60-min hub radius (and no doubleheader anchor
  // saves it), the booking is hard-blocked. Snr Staff can punch through the
  // block with password `hmexec2025$` — the override stamps a warning line on
  // the Zoho Event Description so the CRM record shows it was a manual call.
  // Only applies to `out_of_coverage` — never to `doubleheader_too_far` (that's
  // a scheduling problem, not a policy-level judgment call).
  // Override state resets whenever dispensary/slot changes.
  const [repOverride, setRepOverride] = useState<{
    active: boolean;
    reason: string;
    approvedBy: string;
  }>({active: false, reason: '', approvedBy: ''});
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideReasonInput, setOverrideReasonInput] = useState('');
  const [overrideNameInput, setOverrideNameInput] = useState('');
  const [overridePasswordInput, setOverridePasswordInput] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Reset override state whenever context changes — never let an old override
  // silently carry into a new booking.
  useEffect(() => {
    setRepOverride({active: false, reason: '', approvedBy: ''});
    setOverrideOpen(false);
    setOverrideReasonInput('');
    setOverrideNameInput('');
    setOverridePasswordInput('');
    setOverrideError(null);
  }, [dispensary?.id, slot?.date, slot?.shiftKey]);

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

  const weeks = useMemo(buildWeeks, []);
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

  // ── Google Maps refs ──────────────────────────────────────────────────────
  // We keep the map instance + layer arrays on refs so re-renders don't rebuild
  // the whole map. mapLayersRef is the render-scoped collection we clear between
  // draws (dispensary pins, stop markers, route polylines, hub markers).
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const mapLayersRef = useRef<{
    pins: any[];
    stops: any[];
    hubs: any[];
    routes: any[];
  }>({pins: [], stops: [], hubs: [], routes: []});
  const [mapsReady, setMapsReady] = useState<boolean>(false);
  const {googleMapsApiKey} = useLoaderData<typeof loader>();

  // Load Google Maps JS API once per page. `geometry` library is required for
  // `google.maps.geometry.encoding.decodePath` — that's how we turn the encoded
  // polyline returned by /api/route-polyline into actual LatLng points.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ((window as any).google?.maps) {
      setMapsReady(true);
      return;
    }
    if (!googleMapsApiKey) {
      // eslint-disable-next-line no-console
      console.warn('[njpopups] No Google Maps API key — map disabled.');
      return;
    }
    // Cowork-mode-style JSONP loader with a global callback. If an earlier
    // mount already queued the script we just register a listener on it.
    const existing = document.getElementById('google-maps-js') as
      | HTMLScriptElement
      | null;
    if (existing) {
      existing.addEventListener('load', () => setMapsReady(true));
      return;
    }
    const cbName = '__hsGmapsReady__';
    (window as any)[cbName] = () => setMapsReady(true);
    const js = document.createElement('script');
    js.id = 'google-maps-js';
    js.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      googleMapsApiKey,
    )}&libraries=geometry&v=quarterly&callback=${cbName}`;
    js.async = true;
    js.defer = true;
    document.body.appendChild(js);
  }, [googleMapsApiKey]);

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
  const SHIFT_ORDER: Record<string, number> = {
    'sat-mat': 0,
    'sat-late': 1,
    'sun-mat': 2,
    'sun-late': 3,
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
    stops.sort((a, b) =>
      (a.date + (SHIFT_ORDER[a.shiftKey] ?? 10)).localeCompare(
        b.date + (SHIFT_ORDER[b.shiftKey] ?? 10),
      ),
    );
    return stops;
  }, [bookings, slot, dispensary]);

  // Stops that actually have coords — used for map pins and drive-time calc.
  const mappableStops = useMemo(
    () => weekendStops.filter((s): s is Stop & {lat: number; lng: number} => s.lat != null && s.lng != null),
    [weekendStops],
  );

  // All stops (weekend + weekday) with coords — grouped into per-rep daily routes
  // for the map. Each route starts at the rep's hub and threads through every
  // booking on that day, so the map shows "here's where each rep is driving on
  // Saturday" rather than a single cross-day polyline.
  type DayRoute = {
    key: string; // `${date}|${repId}`
    date: string;
    repId: RepId;
    stops: Array<Stop & {lat: number; lng: number}>;
  };
  const dailyRoutes: DayRoute[] = useMemo(() => {
    const all: Stop[] = [];
    bookings.forEach((b) => {
      all.push({
        name: b.name,
        city: b.city,
        lat: b.lat,
        lng: b.lng,
        date: b.date,
        shiftKey: b.shiftKey,
        pending: false,
      });
    });
    if (slot && dispensary) {
      all.push({
        name: dispensary.name,
        city: dispensary.city,
        lat: dispensary.lat,
        lng: dispensary.lng,
        date: slot.date,
        shiftKey: slot.shiftKey,
        pending: true,
      });
    }
    const groups = new Map<string, DayRoute>();
    all.forEach((s) => {
      if (s.lat == null || s.lng == null) return;
      const stop = s as Stop & {lat: number; lng: number};
      // Rep derived from haversine (cheap). The authoritative rep assignment
      // lives in /api/rep-assign and gates booking; for map rendering this
      // estimate matches in 100% of in-coverage cases.
      const cov = quickCoverageStatus(stop.lat, stop.lng);
      const repId: RepId = cov.closestHub || 'north';
      const key = `${s.date}|${repId}`;
      const existing = groups.get(key);
      if (existing) {
        existing.stops.push(stop);
      } else {
        groups.set(key, {key, date: s.date, repId, stops: [stop]});
      }
    });
    // Order stops within a day by shift time so the route runs matinee → late.
    for (const g of groups.values()) {
      g.stops.sort((a, b) => {
        const oa = SHIFT_ORDER[a.shiftKey] ?? 10;
        const ob = SHIFT_ORDER[b.shiftKey] ?? 10;
        if (oa !== ob) return oa - ob;
        return a.shiftKey.localeCompare(b.shiftKey);
      });
    }
    return Array.from(groups.values()).sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return a.repId.localeCompare(b.repId);
    });
  }, [bookings, slot, dispensary]);

  // ── Polyline cache ────────────────────────────────────────────────────────
  // One cached polyline per (date, rep, stop-chain). The chain hash lets the
  // cache invalidate cleanly when a pending slot is added to a day's route.
  type RoutePoly = {
    points: Array<{lat: number; lng: number}>;
    legsSeconds: number[];
    totalSeconds: number;
    totalMeters: number;
  };
  const routeCacheKey = useCallback((dr: DayRoute): string => {
    const chain = dr.stops
      .map((s) => `${s.lat.toFixed(4)},${s.lng.toFixed(4)}`)
      .join('|');
    return `${dr.key}#${chain}`;
  }, []);
  const [routePolylines, setRoutePolylines] = useState<Record<string, RoutePoly>>({});

  // Fetch encoded polylines for any route groups we haven't resolved yet.
  // POST to /api/route-polyline — server caches 30 min, so this is cheap.
  useEffect(() => {
    if (!mapsReady) return;
    let cancelled = false;
    (async () => {
      for (const dr of dailyRoutes) {
        const cKey = routeCacheKey(dr);
        if (routePolylines[cKey]) continue;
        const hub = REP_HUBS[dr.repId];
        const waypoints = [
          {lat: hub.hubLat, lng: hub.hubLng},
          ...dr.stops.map((s) => ({lat: s.lat, lng: s.lng})),
        ];
        try {
          const res = await fetch('/api/route-polyline', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({waypoints}),
          });
          const data = await res.json();
          if (!data?.ok || cancelled) continue;
          const G = (window as any).google;
          const decoded: any[] = data.encodedPolyline
            ? G?.maps?.geometry?.encoding?.decodePath(data.encodedPolyline) || []
            : [];
          const points = decoded.map((ll: any) => ({lat: ll.lat(), lng: ll.lng()}));
          const legsSeconds: number[] = Array.isArray(data.legs)
            ? data.legs.map((l: any) => l.durationSeconds || 0)
            : [];
          if (cancelled) return;
          setRoutePolylines((prev) => ({
            ...prev,
            [cKey]: {
              points,
              legsSeconds,
              totalSeconds: data.durationSeconds || 0,
              totalMeters: data.distanceMeters || 0,
            },
          }));
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[njpopups] polyline fetch failed', err);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [mapsReady, dailyRoutes, routeCacheKey, routePolylines]);

  // ── Google Maps render ────────────────────────────────────────────────────
  // First call sets up the map + one-time layers (hubs, faint dispensary dots).
  // Subsequent calls repaint stop markers + route polylines in place.
  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;
    const G = (window as any).google;
    if (!G?.maps) return;

    // Dark styled basemap — matches Highsman's Space Black surface.
    const darkStyle: any[] = [
      {elementType: 'geometry', stylers: [{color: '#111111'}]},
      {elementType: 'labels.text.stroke', stylers: [{color: '#111111'}]},
      {elementType: 'labels.text.fill', stylers: [{color: '#A9ACAF'}]},
      {featureType: 'road', elementType: 'geometry', stylers: [{color: '#1e1e1e'}]},
      {featureType: 'road', elementType: 'labels', stylers: [{visibility: 'off'}]},
      {featureType: 'road.highway', elementType: 'geometry', stylers: [{color: '#2a2a2a'}]},
      {featureType: 'road.highway', elementType: 'labels', stylers: [{visibility: 'simplified'}]},
      {featureType: 'water', elementType: 'geometry', stylers: [{color: '#0a1a24'}]},
      {featureType: 'poi', stylers: [{visibility: 'off'}]},
      {featureType: 'transit', stylers: [{visibility: 'off'}]},
      {featureType: 'administrative', elementType: 'geometry', stylers: [{color: '#2a2a2a'}]},
      {featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{color: '#A9ACAF'}]},
    ];

    if (!mapInstance.current) {
      mapInstance.current = new G.maps.Map(mapRef.current, {
        center: {lat: 40.2, lng: -74.5},
        zoom: 8,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
        styles: darkStyle,
        backgroundColor: '#111111',
        gestureHandling: 'greedy',
      });

      // Hub markers — star shape, colored per rep.
      (['north', 'south'] as RepId[]).forEach((id) => {
        const hub = REP_HUBS[id];
        const marker = new G.maps.Marker({
          position: {lat: hub.hubLat, lng: hub.hubLng},
          map: mapInstance.current,
          icon: {
            // 10-point star SVG path — unambiguous "base" shape vs. stop circles.
            path:
              'M 0,-12 L 3.5,-3.7 12,-3.7 5.3,1.5 7.7,10 0,4.8 -7.7,10 -5.3,1.5 -12,-3.7 -3.5,-3.7 Z',
            fillColor: hub.color,
            fillOpacity: 1,
            strokeColor: '#000',
            strokeWeight: 2,
            scale: 1.1,
          },
          title: `${hub.hubLabel} — ${hub.hubCity} hub`,
          zIndex: 200,
        });
        mapLayersRef.current.hubs.push(marker);
      });

      // Faint dots for every known NJ dispensary in the local coords index.
      Object.entries(COORDS_LOOKUP).forEach(([key, coords]) => {
        const [name, city] = key.split('|');
        const marker = new G.maps.Marker({
          position: {lat: coords.lat, lng: coords.lng},
          map: mapInstance.current,
          icon: {
            path: G.maps.SymbolPath.CIRCLE,
            scale: 3,
            fillColor: BRAND.gray,
            fillOpacity: 0.55,
            strokeWeight: 0,
          },
          title: `${name.replace(/\b\w/g, (c: string) => c.toUpperCase())} — ${city.replace(
            /\b\w/g,
            (c: string) => c.toUpperCase(),
          )}`,
          zIndex: 50,
        });
        mapLayersRef.current.pins.push(marker);
      });
    }

    const map = mapInstance.current;

    // Clear per-render layers.
    mapLayersRef.current.stops.forEach((m) => m.setMap(null));
    mapLayersRef.current.stops = [];
    mapLayersRef.current.routes.forEach((p) => p.setMap(null));
    mapLayersRef.current.routes = [];

    const bounds = new G.maps.LatLngBounds();
    let hasBounds = false;

    dailyRoutes.forEach((dr) => {
      const hub = REP_HUBS[dr.repId];
      const cKey = routeCacheKey(dr);
      const poly = routePolylines[cKey];

      // Hub anchors the route — always include in bounds for the group.
      bounds.extend({lat: hub.hubLat, lng: hub.hubLng});
      hasBounds = true;

      if (poly && poly.points.length > 1) {
        // Real road-following polyline from Google Routes API.
        const line = new G.maps.Polyline({
          path: poly.points,
          geodesic: false,
          strokeColor: hub.color,
          strokeOpacity: 0.9,
          strokeWeight: 4,
          map,
          zIndex: 100,
        });
        mapLayersRef.current.routes.push(line);
        poly.points.forEach((pt) => bounds.extend(pt));
      } else {
        // Fallback while the polyline is still loading: dashed straight line
        // from hub → each stop. Visible immediately so users see intent.
        const path = [
          {lat: hub.hubLat, lng: hub.hubLng},
          ...dr.stops.map((s) => ({lat: s.lat, lng: s.lng})),
        ];
        const line = new G.maps.Polyline({
          path,
          geodesic: true,
          strokeOpacity: 0,
          strokeWeight: 0,
          icons: [
            {
              icon: {
                path: 'M 0,-1 0,1',
                strokeOpacity: 0.7,
                strokeColor: hub.color,
                scale: 3,
              },
              offset: '0',
              repeat: '12px',
            },
          ],
          map,
          zIndex: 90,
        });
        mapLayersRef.current.routes.push(line);
        path.forEach((pt) => bounds.extend(pt));
      }

      // Numbered stop markers — colored by rep, highlighted when pending.
      dr.stops.forEach((s, i) => {
        const marker = new G.maps.Marker({
          position: {lat: s.lat, lng: s.lng},
          map,
          label: {
            text: String(i + 1),
            color: '#000',
            fontFamily: 'Teko, sans-serif',
            fontSize: '16px',
            fontWeight: '700',
          },
          icon: {
            path: G.maps.SymbolPath.CIRCLE,
            scale: 14,
            fillColor: s.pending ? BRAND.white : hub.color,
            fillOpacity: 1,
            strokeColor: '#000',
            strokeWeight: 2,
          },
          title: `${s.name} — ${s.city} · ${shiftLabel(s.shiftKey)} · ${fmtDate(s.date)}${
            s.pending ? ' · PENDING' : ''
          }`,
          zIndex: 150,
        });
        mapLayersRef.current.stops.push(marker);
      });
    });

    if (hasBounds) {
      map.fitBounds(bounds, 60);
    } else {
      map.setCenter({lat: 40.2, lng: -74.5});
      map.setZoom(8);
    }
  }, [mapsReady, dailyRoutes, routePolylines, routeCacheKey]);

  // Drive legs for the weekend sidebar. Uses real Routes-API times when the
  // polyline for that (date, rep) group has loaded; falls back to the
  // haversine estimate otherwise so the UI stays responsive.
  const driveLegs = useMemo(() => {
    const legs: number[] = [];
    for (let i = 0; i < mappableStops.length - 1; i++) {
      const a = mappableStops[i];
      const b = mappableStops[i + 1];
      if (a.date !== b.date) {
        // Cross-day sidebar rows — no meaningful drive leg. Show 0 (rendered as '—').
        legs.push(0);
        continue;
      }
      const cov = quickCoverageStatus(a.lat, a.lng);
      const repId: RepId = cov.closestHub || 'north';
      const dr = dailyRoutes.find((d) => d.key === `${a.date}|${repId}`);
      if (dr) {
        const poly = routePolylines[routeCacheKey(dr)];
        if (poly) {
          const idxA = dr.stops.findIndex((s) => s.lat === a.lat && s.lng === a.lng);
          const idxB = dr.stops.findIndex((s) => s.lat === b.lat && s.lng === b.lng);
          if (idxA >= 0 && idxB === idxA + 1) {
            // Routes API returns N legs for N+1 waypoints (hub, s0, s1, ...).
            // Leg index (idxA+1) is s0→s1 when idxA=0.
            const legSec = poly.legsSeconds[idxA + 1] || 0;
            if (legSec > 0) {
              legs.push(Math.round(legSec / 60));
              continue;
            }
          }
        }
      }
      legs.push(estDriveMinutes(a, b));
    }
    return legs;
  }, [mappableStops, dailyRoutes, routePolylines, routeCacheKey]);
  const totalDrive = driveLegs.reduce((a, b) => a + b, 0);

  // ── Weekend same-day drive-time guardrail ───────────────────────────────
  // Find any existing booking on the same weekend day at a different dispensary
  // with known coordinates. If there is one, we need to verify the drive time
  // between the two stops before allowing this booking.
  const sameDayConflict = useMemo(() => {
    if (!slot || !dispensary) return null;
    const isWeekend =
      slot.shiftKey.startsWith('sat-') || slot.shiftKey.startsWith('sun-');
    if (!isWeekend) return null;
    return (
      bookings.find(
        (b) =>
          b.date === slot.date &&
          b.dispId !== dispensary.id &&
          typeof b.lat === 'number' &&
          typeof b.lng === 'number',
      ) || null
    );
  }, [slot, dispensary, bookings]);

  useEffect(() => {
    if (
      !sameDayConflict ||
      !dispensary ||
      typeof dispensary.lat !== 'number' ||
      typeof dispensary.lng !== 'number' ||
      !slot
    ) {
      setDriveCheck({status: 'idle'});
      return;
    }

    // Hour map for departure (NJ local): *-mat = 13, *-late = 16.
    // Route direction = earlier stop → later stop. Departure time = later shift.
    const hourFor = (k: string) =>
      k.endsWith('-mat') ? 13 : k.endsWith('-late') ? 16 : 15;
    const currentHour = hourFor(slot.shiftKey);
    const otherHour = hourFor(sameDayConflict.shiftKey);
    const currentIsLater = currentHour >= otherHour;
    const origin = currentIsLater
      ? {lat: sameDayConflict.lat as number, lng: sameDayConflict.lng as number}
      : {lat: dispensary.lat, lng: dispensary.lng};
    const destination = currentIsLater
      ? {lat: dispensary.lat, lng: dispensary.lng}
      : {lat: sameDayConflict.lat as number, lng: sameDayConflict.lng as number};
    const laterHour = Math.max(currentHour, otherHour);
    const departureDateTime = `${slot.date}T${String(laterHour).padStart(2, '0')}:00:00`;

    const otherName = sameDayConflict.name;
    setDriveCheck({status: 'checking', otherName});

    const fd = new FormData();
    fd.append('originLat', String(origin.lat));
    fd.append('originLng', String(origin.lng));
    fd.append('destLat', String(destination.lat));
    fd.append('destLng', String(destination.lng));
    fd.append('departureDateTime', departureDateTime);

    let cancelled = false;
    fetch('/api/route-time', {method: 'POST', body: fd})
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (!data?.ok) {
          setDriveCheck({
            status: 'error',
            message: data?.error || 'Could not verify drive time.',
            otherName,
          });
          return;
        }
        const minutes = Number(data.minutes) || 0;
        const text = String(data.text || `${minutes} min`);
        if (minutes > 40) {
          setDriveCheck({status: 'blocked', minutes, text, otherName});
        } else {
          setDriveCheck({status: 'ok', minutes, text, otherName});
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setDriveCheck({
          status: 'error',
          message: err?.message || 'Could not verify drive time.',
          otherName,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [sameDayConflict, dispensary, slot]);

  const driveBlocked = driveCheck.status === 'blocked';

  // ── Rep-assignment lookup ───────────────────────────────────────────────
  // Fires whenever dispensary + slot are both present and the dispensary has
  // coordinates. Checks coverage from both NJ rep hubs, applies the weekend
  // doubleheader exception if an earlier same-day booking exists.
  useEffect(() => {
    if (
      !dispensary ||
      !slot ||
      typeof dispensary.lat !== 'number' ||
      typeof dispensary.lng !== 'number'
    ) {
      setRepCheck({status: 'idle'});
      return;
    }

    const fd = new FormData();
    fd.append('destLat', String(dispensary.lat));
    fd.append('destLng', String(dispensary.lng));
    fd.append('dispensaryName', dispensary.name);
    fd.append('shiftKey', slot.shiftKey);
    fd.append('date', slot.date);

    // Look for a same-day earlier booking at a different dispensary with
    // coords — that unlocks the doubleheader exception server-side.
    const isWeekend =
      slot.shiftKey.startsWith('sat-') || slot.shiftKey.startsWith('sun-');
    if (isWeekend) {
      const anchor = bookings.find(
        (b) =>
          b.date === slot.date &&
          b.dispId !== dispensary.id &&
          typeof b.lat === 'number' &&
          typeof b.lng === 'number',
      );
      if (anchor) {
        fd.append('anchorLat', String(anchor.lat));
        fd.append('anchorLng', String(anchor.lng));
        fd.append('anchorName', anchor.name);
        fd.append('anchorShiftKey', anchor.shiftKey);
      }
    }

    setRepCheck({status: 'checking'});
    let cancelled = false;
    fetch('/api/rep-assign', {method: 'POST', body: fd})
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (cancelled) return;
        if (data?.ok) {
          setRepCheck({
            status: 'assigned',
            repId: data.repId,
            repName: data.repName,
            hubLabel: data.hubLabel,
            subjectTag: data.subjectTag,
            color: data.color,
            driveMin: data.driveMin,
            mode: data.mode,
            anchorName: data.anchorName,
            note: data.note,
          });
        } else if (data?.reason === 'drive_lookup_failed') {
          setRepCheck({
            status: 'error',
            message: data?.message || 'Rep coverage check unavailable.',
          });
        } else {
          setRepCheck({
            status: 'blocked',
            reason: data?.reason === 'doubleheader_too_far'
              ? 'doubleheader_too_far'
              : 'out_of_coverage',
            message: data?.message || 'Dispensary is outside NJ rep coverage.',
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setRepCheck({
          status: 'error',
          message: err?.message || 'Rep coverage check failed.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [dispensary, slot, bookings]);

  // `repBlocked` = booking is blocked by rep coverage. Snr Staff override ONLY
  // unblocks `out_of_coverage` (policy-level) — never `doubleheader_too_far`.
  const repBlocked =
    repCheck.status === 'blocked' &&
    !(repCheck.reason === 'out_of_coverage' && repOverride.active);

  // Booking-window checks. The picker already gray-outs disallowed shifts, but
  // we also defend here so a bypassed click (devtools, stale state) can't book.
  //   leadOk     → slot is at least MIN_LEAD_DAYS out from today
  //   launchOk   → slot date >= LAUNCH_DATE (hard floor; no pre-launch bookings)
  const leadOk = !!slot && daysUntil(slot.date) >= MIN_LEAD_DAYS;
  const launchOk = !!slot && slot.date >= LAUNCH_DATE;
  const windowOk = leadOk && launchOk;

  const step1Done = !!dispensary;
  const step2Done = !!slot;
  // Link mode is "done" as soon as a slot is picked — the contact handoff happens in the portal.
  const step3Done = mode === 'link' ? !!slot : !!contact;
  const step5Done =
    step1Done && step2Done && step3Done && !driveBlocked && !repBlocked && windowOk;

  // Fire a Zoho Event creation for every booking so the Account's Activities
  // timeline shows the pop-up history + upcoming stops on the Zoho calendar.
  // Fire-and-forget — never block the local booking confirmation.
  const postBookingEvent = (opts: {
    channel: 'link' | 'email' | 'manual';
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    contactRole?: string;
    portalUrl?: string;
  }) => {
    if (!dispensary || !slot) return;
    if (!dispensary.id || dispensary.id.startsWith('local-')) return;
    const slotDate = slot.date;
    const dispId = dispensary.id;
    const fd = new FormData();
    fd.append('accountId', dispensary.id);
    fd.append('dispensaryName', dispensary.name);
    fd.append('date', slotDate);
    fd.append('shiftKey', slot.shiftKey);
    fd.append('shiftLabel', shiftLabel(slot.shiftKey));
    fd.append('channel', opts.channel);
    if (opts.contactName) fd.append('contactName', opts.contactName);
    if (opts.contactEmail) fd.append('contactEmail', opts.contactEmail);
    if (opts.contactPhone) fd.append('contactPhone', opts.contactPhone);
    if (opts.contactRole && opts.contactRole !== '—') fd.append('contactRole', opts.contactRole);
    if (opts.portalUrl) fd.append('portalUrl', opts.portalUrl);
    if (dispensary.city) fd.append('city', dispensary.city);
    // Rep assignment — stamped onto the Zoho Event Subject prefix + Description
    // so staff can see which rep owns each booking from the CRM directly.
    if (repCheck.status === 'assigned') {
      fd.append('repId', repCheck.repId);
      fd.append('repName', repCheck.repName);
      fd.append('repTag', repCheck.subjectTag);
      fd.append('repMode', repCheck.mode);
      fd.append('repDriveMin', String(repCheck.driveMin));
      if (repCheck.anchorName) fd.append('repAnchorName', repCheck.anchorName);
    }
    // Snr Staff out-of-coverage override — stamped on the Zoho Event
    // Description so CRM shows the exception was a human call, not an
    // automatic pass.
    if (
      repOverride.active &&
      repCheck.status === 'blocked' &&
      repCheck.reason === 'out_of_coverage'
    ) {
      fd.append('coverageOverride', '1');
      fd.append('coverageOverrideReason', repOverride.reason);
      fd.append('coverageOverrideApprovedBy', repOverride.approvedBy);
      fd.append('coverageOverrideMessage', repCheck.message);
    }
    fetch('/api/popups-book', {method: 'POST', body: fd})
      .then((r) => r.json().catch(() => null))
      .then((data) => {
        if (!data?.ok) {
          console.warn('[njpopups] Event creation failed:', data?.error);
          return;
        }
        // eslint-disable-next-line no-console
        console.log('[njpopups] Zoho Event created:', data.eventId);
        // Mirror the newly stamped "Last Pop Up Date" onto local state so the UI
        // reflects Zoho without a full refetch. Server uses the slot date, not today.
        const stamped = data.lastPopUpDate || slotDate;
        setDispensary((prev) =>
          prev && prev.id === dispId ? {...prev, lastVisitDate: stamped} : prev,
        );
      })
      .catch((err) => console.warn('[njpopups] Event creation error:', err));
  };

  const handleBook = () => {
    if (!dispensary || !slot) return;
    // Hard block: same-day weekend booking > 40 min drive from the existing stop.
    if (driveBlocked) return;
    // Hard block: dispensary is outside the NJ rep coverage radius.
    if (repBlocked) return;
    // Hard block: under the 5-day lead-time window or before LAUNCH_DATE.
    if (!windowOk) return;

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

      // Log the Event on the Zoho Account's Activities timeline.
      postBookingEvent({channel: 'link', portalUrl: dispensary.popUpLink});

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

    // If the staff entered a brand-new POC (MANUAL mode), push the override
    // back to Zoho so the next booking for this Account uses the same contact.
    // Fire-and-forget — a failure here shouldn't block the local confirmation.
    if (mode === 'manual' && contact.source === 'new' && !dispensary.id.startsWith('local-')) {
      const fd = new FormData();
      fd.append('accountId', dispensary.id);
      fd.append('popUpEmail', contact.email);
      // Leave popUpLink untouched — manual mode is explicitly an email POC.
      // (If staff wants to set a portal link, they use the "Staff change" drawer.)
      fd.append('contactName', contact.name);
      if (contact.role && contact.role !== '—') fd.append('contactRole', contact.role);
      if (contact.phone) fd.append('contactPhone', contact.phone);
      // NOTE: no stampVisit here — /api/popups-book owns Visit_Date (UI label
      // "Last Pop Up Date") and stamps it with the slot date, not today.
      fetch('/api/popups-poc', {method: 'POST', body: fd})
        .then((r) => r.json().catch(() => null))
        .then((data) => {
          if (data?.ok) {
            // Mirror the new POC values onto the dispensary so the UI reflects
            // Zoho. Last Pop Up Date is handled by postBookingEvent's callback.
            setDispensary((prev) =>
              prev && prev.id === dispensary.id
                ? {
                    ...prev,
                    popUpEmail: contact.email,
                    contact: {
                      name: contact.name,
                      role: contact.role || '—',
                      email: contact.email,
                      phone: contact.phone || '—',
                    },
                  }
                : prev,
            );
          } else {
            console.warn('[njpopups] POC write-back failed:', data?.error);
          }
        })
        .catch((err) => console.warn('[njpopups] POC write-back error:', err));
    }

    // Log the Event on the Zoho Account's Activities timeline.
    postBookingEvent({
      channel: mode === 'manual' ? 'manual' : 'email',
      contactName: contact.name,
      contactEmail: contact.email,
      contactPhone: contact.phone,
      contactRole: contact.role,
    });

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

  // Open the "Staff change for pop ups" drawer pre-filled with the current
  // Zoho values (email POC, portal link, and contact card fields when present).
  const openStaffEdit = () => {
    if (!dispensary) return;
    setStaffEdit({
      email: dispensary.popUpEmail || dispensary.contact?.email || '',
      link: dispensary.popUpLink || '',
      name: dispensary.contact?.name || '',
      role: dispensary.contact?.role && dispensary.contact.role !== '—' ? dispensary.contact.role : '',
      phone: dispensary.contact?.phone && dispensary.contact.phone !== '—' ? dispensary.contact.phone : '',
    });
    setStaffError(null);
    setStaffEditOpen(true);
  };

  // Push the override to Zoho. Override semantics: whatever staff typed wins,
  // including empty strings (which clear the field). Last Pop Up Date is NOT
  // touched here — that field (Visit_Date) is owned by /api/popups-book and
  // stamps the pop-up slot date on every booking.
  const saveStaffEdit = async () => {
    if (!dispensary) return;
    setStaffSaving(true);
    setStaffError(null);
    try {
      const fd = new FormData();
      fd.append('accountId', dispensary.id);
      fd.append('popUpEmail', staffEdit.email.trim());
      fd.append('popUpLink', staffEdit.link.trim());
      if (staffEdit.name.trim()) fd.append('contactName', staffEdit.name.trim());
      if (staffEdit.role.trim()) fd.append('contactRole', staffEdit.role.trim());
      if (staffEdit.phone.trim()) fd.append('contactPhone', staffEdit.phone.trim());

      const res = await fetch('/api/popups-poc', {method: 'POST', body: fd});
      const data = await res.json().catch(() => ({ok: false, error: 'Bad response'}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Save failed (${res.status})`);
      }

      // Apply the new values to the local dispensary so the UI reflects reality
      // without a full refetch.
      const newEmail = staffEdit.email.trim();
      const newLink = staffEdit.link.trim();
      const newName = staffEdit.name.trim();
      const newRole = staffEdit.role.trim();
      const newPhone = staffEdit.phone.trim();

      setDispensary((prev) => {
        if (!prev) return prev;
        const contact =
          newEmail && newName
            ? {
                name: newName,
                role: newRole || '—',
                email: newEmail,
                phone: newPhone || '—',
              }
            : newEmail
              ? prev.contact // keep existing resolved contact if only email changed
              : null;
        return {
          ...prev,
          popUpEmail: newEmail || null,
          popUpLink: newLink || null,
          contact,
        };
      });

      // Reset override-to-manual so the UI re-evaluates which mode to show.
      setOverrideContact(false);
      setStaffEditOpen(false);
      setStaffToast(true);
      setTimeout(() => setStaffToast(false), 3200);
    } catch (err: any) {
      setStaffError(err?.message || 'Could not save. Try again.');
    } finally {
      setStaffSaving(false);
    }
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
                      filtered.map((d) => {
                        const cov = quickCoverageStatus(d.lat, d.lng);
                        const isOut = cov.status === 'out';
                        return (
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
                              borderLeft: isOut
                                ? `3px solid ${BRAND.red}`
                                : '3px solid transparent',
                              cursor: 'pointer',
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                              gap: 14,
                              opacity: isOut ? 0.85 : 1,
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = BRAND.chip)}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            <div style={{minWidth: 0, flex: 1}}>
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
                              <div
                                style={{
                                  marginTop: 6,
                                  display: 'flex',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <CoveragePill cov={cov} compact />
                              </div>
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
                                    flexShrink: 0,
                                  }}
                                >
                                  {label}
                                </span>
                              );
                            })()}
                          </div>
                        );
                      })
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
                  <div style={{marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                    <CoveragePill cov={quickCoverageStatus(dispensary.lat, dispensary.lng)} />
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
                and late (4–6 PM) — each with its own 2-spot cap. Pop-ups officially launch{' '}
                <strong>Fri May 8</strong>; bookings require a {MIN_LEAD_DAYS}-day minimum lead time. Window
                rolls forward weekly so you can always plan ~2 months out. Dispensaries must sit within{' '}
                {MAX_SOLO_DRIVE_MIN} min of Newark (North Jersey Rep) or Collingswood (South Jersey Rep) — auto-assigned
                on pick. Weekend doubleheaders allow up to {MAX_DOUBLEHEADER_HOP_MIN} min between stops.
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
              <div style={{display: 'flex', flexDirection: 'column', gap: 22}}>
                {weeks.map((wk) => (
                  <div key={wk.weekIndex}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        gap: 14,
                        marginBottom: 10,
                        paddingBottom: 8,
                        borderBottom: `1px solid ${BRAND.line}`,
                      }}
                    >
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 20,
                          letterSpacing: '0.18em',
                          textTransform: 'uppercase',
                          color: BRAND.gold,
                        }}
                      >
                        Week {wk.weekIndex + 1}
                      </div>
                      <div
                        style={{
                          fontFamily: TEKO,
                          fontSize: 16,
                          letterSpacing: '0.1em',
                          color: BRAND.gray,
                          textTransform: 'uppercase',
                        }}
                      >
                        {wk.weekLabel}
                      </div>
                    </div>
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: 14,
                      }}
                    >
                      {wk.days.map((day) => (
                        <div
                          key={day.iso}
                          style={{border: `1px solid ${BRAND.line}`, background: BRAND.black}}
                        >
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
                              {day.date.toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </div>
                          </div>
                          {day.shifts.map((s) => {
                            const used = countBookings(day.iso, s.key);
                            const full = used >= s.capacity;
                            const daysOut = daysUntil(day.iso);
                            const tooSoon = daysOut < MIN_LEAD_DAYS;
                            const tooEarly = day.iso < LAUNCH_DATE;
                            const disabled = full || tooEarly || tooSoon;
                            const remaining = s.capacity - used;
                            const selected =
                              slot && slot.date === day.iso && slot.shiftKey === s.key;
                            return (
                              <div
                                key={s.key}
                                onClick={() => {
                                  if (disabled) return;
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
                                  cursor: disabled ? 'not-allowed' : 'pointer',
                                  opacity: disabled ? 0.4 : 1,
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
                                    color: selected
                                      ? BRAND.black
                                      : full || tooEarly || tooSoon
                                        ? BRAND.red
                                        : BRAND.gray,
                                    marginTop: 4,
                                  }}
                                >
                                  {full
                                    ? 'Slot Full · Statewide Cap Hit'
                                    : tooEarly
                                      ? 'Pre-Launch · Opens May 8'
                                      : tooSoon
                                        ? `Too Soon · ${MIN_LEAD_DAYS}-Day Lead Time`
                                        : `${remaining} of ${s.capacity} open`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
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
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 18,
                    rowGap: 8,
                    alignItems: 'center',
                    fontSize: 14,
                    color: BRAND.gray,
                  }}
                >
                  <button
                    type="button"
                    onClick={openStaffEdit}
                    style={{
                      background: BRAND.gold,
                      border: `1px solid ${BRAND.gold}`,
                      color: BRAND.black,
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontSize: 14,
                      padding: '9px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Staff change for pop ups — update data here
                  </button>
                  <span>
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
                  </span>
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
                <div
                  style={{
                    marginTop: 14,
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 18,
                    rowGap: 8,
                    alignItems: 'center',
                    fontSize: 14,
                    color: BRAND.gray,
                  }}
                >
                  <button
                    type="button"
                    onClick={openStaffEdit}
                    style={{
                      background: BRAND.gold,
                      border: `1px solid ${BRAND.gold}`,
                      color: BRAND.black,
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontSize: 14,
                      padding: '9px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    Staff change for pop ups — update data here
                  </button>
                  <span>
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
                  </span>
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
            {dispensary && staffEditOpen && (
              <div
                style={{
                  marginTop: 18,
                  border: `1px solid ${BRAND.gold}`,
                  padding: '22px 24px',
                  background: 'linear-gradient(180deg, rgba(245,229,0,0.06), transparent)',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    justifyContent: 'space-between',
                    gap: 12,
                    flexWrap: 'wrap',
                    marginBottom: 12,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: TEKO,
                        fontSize: 13,
                        letterSpacing: '0.2em',
                        color: BRAND.gold,
                        marginBottom: 6,
                      }}
                    >
                      ● Staff Change · Write Back to Zoho
                    </div>
                    <div style={{color: BRAND.white, fontSize: 15}}>
                      Whatever you type here <strong style={{color: BRAND.gold}}>overwrites</strong> what's
                      in Zoho for{' '}
                      <strong style={{color: BRAND.white}}>
                        {dispensary.name} — {dispensary.city}
                      </strong>
                      . "Last Pop Up Date" isn't changed here — that field updates
                      automatically when a pop-up is booked.
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setStaffEditOpen(false)}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${BRAND.lineStrong}`,
                      color: BRAND.gray,
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.14em',
                      fontSize: 12,
                      padding: '6px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                    gap: 14,
                  }}
                >
                  {(
                    [
                      {k: 'email' as const, l: 'Email for Pop Ups', p: 'buyer@dispensary.com', t: 'email'},
                      {k: 'link' as const, l: 'Booking Portal Link (optional)', p: 'https://portal.dispensary.com/vendor', t: 'url'},
                      {k: 'name' as const, l: 'Contact Name', p: 'Jane Doe', t: 'text'},
                      {k: 'role' as const, l: 'Role / Title', p: 'Buyer, GM, Events', t: 'text'},
                      {k: 'phone' as const, l: 'Phone', p: '(201) 555-0123', t: 'tel'},
                    ]
                  ).map((f) => (
                    <div key={f.k} style={f.k === 'link' ? {gridColumn: '1 / -1'} : {}}>
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
                        value={staffEdit[f.k]}
                        onChange={(e) =>
                          setStaffEdit((p) => ({...p, [f.k]: e.target.value}))
                        }
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
                <div style={{marginTop: 12, fontSize: 13, color: BRAND.gray, lineHeight: 1.5}}>
                  Leave a field blank to <em>clear</em> it in Zoho. If a Link is set, the booking will route
                  through the portal — otherwise it'll use the email POC.
                </div>
                {staffError && (
                  <div style={{marginTop: 12, color: BRAND.red, fontSize: 14}}>{staffError}</div>
                )}
                <div style={{marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap'}}>
                  <button
                    type="button"
                    onClick={saveStaffEdit}
                    disabled={staffSaving}
                    style={{
                      background: staffSaving ? BRAND.chip : BRAND.gold,
                      border: `1px solid ${BRAND.gold}`,
                      color: BRAND.black,
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.16em',
                      fontSize: 15,
                      padding: '12px 20px',
                      cursor: staffSaving ? 'wait' : 'pointer',
                      opacity: staffSaving ? 0.7 : 1,
                    }}
                  >
                    {staffSaving ? 'Saving to Zoho…' : 'Save & Override Zoho'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setStaffEditOpen(false)}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${BRAND.lineStrong}`,
                      color: BRAND.gray,
                      fontFamily: TEKO,
                      textTransform: 'uppercase',
                      letterSpacing: '0.16em',
                      fontSize: 15,
                      padding: '12px 20px',
                      cursor: 'pointer',
                    }}
                  >
                    Discard
                  </button>
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
              <h2 style={h2}>Route Planner</h2>
              <p style={kicker}>
                Every booked NJ pop-up plotted on Google Maps — each rep's day runs from their hub through
                their assigned stops. Drive times are the no-traffic baseline from Google Routes.
              </p>
            </div>
            <div style={stepStatus(dailyRoutes.length > 0)}>
              {dailyRoutes.length > 0
                ? `${dailyRoutes.length} Day${dailyRoutes.length === 1 ? '' : 's'}`
                : 'No Routes'}
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
                  maxHeight: 520,
                  overflowY: 'auto',
                }}
              >
                <h3 style={{...h2, fontSize: 24}}>Daily Routes</h3>
                <div style={{color: BRAND.gray, fontSize: 14, marginBottom: 16, lineHeight: 1.5}}>
                  Grouped by day + rep. Hub → stops in shift order. Real Google Routes drive times once a
                  polyline loads — haversine estimate otherwise.
                </div>
                {dailyRoutes.length === 0 ? (
                  <div
                    style={{
                      color: BRAND.gray,
                      fontSize: 15,
                      padding: '40px 8px',
                      textAlign: 'center',
                      border: `1px dashed ${BRAND.lineStrong}`,
                    }}
                  >
                    Pick a dispensary + shift to plot the route.
                    <br />
                    Each day's stops run from the rep's hub in shift order.
                  </div>
                ) : (
                  dailyRoutes.map((dr) => {
                    const hub = REP_HUBS[dr.repId];
                    const poly = routePolylines[routeCacheKey(dr)];
                    const dayTotalMin = poly
                      ? Math.round(poly.totalSeconds / 60)
                      : 0;
                    return (
                      <div
                        key={dr.key}
                        style={{
                          border: `1px solid ${BRAND.line}`,
                          padding: 14,
                          marginBottom: 14,
                          background: BRAND.surface,
                        }}
                      >
                        {/* Route header: date + rep badge */}
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                            gap: 10,
                            marginBottom: 10,
                            paddingBottom: 8,
                            borderBottom: `1px solid ${BRAND.line}`,
                          }}
                        >
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 20,
                              letterSpacing: '0.08em',
                              textTransform: 'uppercase',
                              color: BRAND.white,
                            }}
                          >
                            {fmtDate(dr.date)}
                          </div>
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 12,
                              letterSpacing: '0.16em',
                              textTransform: 'uppercase',
                              padding: '3px 8px',
                              border: `1px solid ${hub.color}`,
                              color: hub.color,
                              whiteSpace: 'nowrap',
                            }}
                          >
                            {dr.repId === 'north' ? 'NJ-N' : 'NJ-S'} · {hub.hubCity.split(',')[0]}
                          </div>
                        </div>

                        {/* Hub origin row */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 10,
                            padding: '6px 0',
                            color: BRAND.gray,
                            fontSize: 13,
                          }}
                        >
                          <div
                            style={{
                              width: 22,
                              height: 22,
                              color: hub.color,
                              fontSize: 20,
                              lineHeight: '22px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              flexShrink: 0,
                            }}
                            title={hub.hubLabel}
                          >
                            ★
                          </div>
                          <div style={{flex: 1, minWidth: 0}}>
                            <div
                              style={{
                                fontFamily: TEKO,
                                fontSize: 16,
                                letterSpacing: '0.06em',
                                textTransform: 'uppercase',
                                color: BRAND.white,
                              }}
                            >
                              {hub.hubCity} Hub
                            </div>
                            <div style={{color: BRAND.gray, fontSize: 12}}>Start</div>
                          </div>
                        </div>

                        {/* Stops with drive legs between */}
                        {dr.stops.map((s, i) => {
                          const legSec =
                            poly && poly.legsSeconds[i] != null ? poly.legsSeconds[i] : 0;
                          const legMin = legSec > 0 ? Math.round(legSec / 60) : 0;
                          const hot = legMin > 45;
                          return (
                            <div key={`${s.name}-${s.city}-${s.shiftKey}-${i}`}>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '6px 0 6px 30px',
                                  color: hot ? BRAND.red : BRAND.gray,
                                  fontSize: 13,
                                  fontFamily: TEKO,
                                  letterSpacing: '0.08em',
                                }}
                              >
                                <span style={{color: hub.color}}>↓</span>
                                {legMin > 0
                                  ? `${legMin} min drive${hot ? ' · flagged' : ''}`
                                  : 'Drive time loading…'}
                              </div>
                              <div
                                style={{
                                  border: `1px solid ${BRAND.line}`,
                                  padding: '10px 12px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                }}
                              >
                                <div
                                  style={{
                                    width: 24,
                                    height: 24,
                                    background: s.pending ? BRAND.white : hub.color,
                                    color: BRAND.black,
                                    fontFamily: TEKO,
                                    fontSize: 16,
                                    fontWeight: 700,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexShrink: 0,
                                    borderRadius: '50%',
                                    border: s.pending ? `1px solid ${hub.color}` : 'none',
                                  }}
                                >
                                  {i + 1}
                                </div>
                                <div style={{flex: 1, minWidth: 0}}>
                                  <div
                                    style={{
                                      fontFamily: TEKO,
                                      fontSize: 17,
                                      letterSpacing: '0.04em',
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
                                          color: hub.color,
                                          fontSize: 11,
                                          letterSpacing: '0.1em',
                                          marginLeft: 8,
                                        }}
                                      >
                                        · PENDING
                                      </span>
                                    )}
                                  </div>
                                  <div style={{color: BRAND.gray, fontSize: 12}}>
                                    {s.city} · {shiftLabel(s.shiftKey)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {/* Day total */}
                        <div
                          style={{
                            marginTop: 10,
                            paddingTop: 8,
                            borderTop: `1px solid ${BRAND.line}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'baseline',
                          }}
                        >
                          <span
                            style={{
                              fontFamily: TEKO,
                              fontSize: 12,
                              letterSpacing: '0.18em',
                              color: BRAND.gray,
                              textTransform: 'uppercase',
                            }}
                          >
                            Day Drive
                          </span>
                          <span style={{fontFamily: TEKO, fontSize: 20, color: hub.color}}>
                            {dayTotalMin > 0 ? `${dayTotalMin} min` : '…'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
                {/* Grand total across all days (keeps the prior total-drive summary) */}
                {dailyRoutes.length > 0 && (
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
                      {(() => {
                        const totalSec = dailyRoutes.reduce((acc, dr) => {
                          const poly = routePolylines[routeCacheKey(dr)];
                          return acc + (poly ? poly.totalSeconds : 0);
                        }, 0);
                        return totalSec > 0
                          ? `${Math.round(totalSec / 60)} min`
                          : totalDrive > 0
                          ? `~${totalDrive} min`
                          : '—';
                      })()}
                    </span>
                  </div>
                )}
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

            {/* ── Rep on Duty banner (NJ coverage guardrail) ── */}
            {repCheck.status !== 'idle' && (
              <div
                style={{
                  marginTop: 20,
                  padding: '16px 20px',
                  border: `1px solid ${
                    repCheck.status === 'blocked'
                      ? repOverride.active &&
                        repCheck.reason === 'out_of_coverage'
                        ? BRAND.gold
                        : BRAND.red
                      : repCheck.status === 'assigned'
                        ? repCheck.color
                        : BRAND.lineStrong
                  }`,
                  background:
                    repCheck.status === 'blocked'
                      ? repOverride.active &&
                        repCheck.reason === 'out_of_coverage'
                        ? 'rgba(245,228,0,0.06)'
                        : 'rgba(220,53,69,0.08)'
                      : repCheck.status === 'assigned'
                        ? 'rgba(245,228,0,0.04)'
                        : 'rgba(255,255,255,0.03)',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 14,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color:
                      repCheck.status === 'blocked'
                        ? repOverride.active &&
                          repCheck.reason === 'out_of_coverage'
                          ? BRAND.gold
                          : BRAND.red
                        : repCheck.status === 'assigned'
                          ? BRAND.gold
                          : BRAND.gray,
                    marginBottom: 6,
                  }}
                >
                  {repCheck.status === 'checking' && 'Assigning rep…'}
                  {repCheck.status === 'assigned' &&
                    (repCheck.mode === 'doubleheader'
                      ? '✓ Rep on Duty · Doubleheader'
                      : '✓ Rep on Duty')}
                  {repCheck.status === 'blocked' &&
                    (repCheck.reason === 'doubleheader_too_far'
                      ? '✕ Doubleheader too far — booking blocked'
                      : repOverride.active
                        ? '⚠ Snr Staff Override — Out of Coverage'
                        : '✕ Out of NJ coverage — booking blocked')}
                  {repCheck.status === 'error' && 'Rep coverage check unavailable'}
                </div>
                <div
                  style={{
                    fontFamily: BODY,
                    fontSize: 15,
                    color: BRAND.white,
                    lineHeight: 1.5,
                  }}
                >
                  {repCheck.status === 'checking' && (
                    <>
                      Checking drive time from Newark &amp; Collingswood hubs…
                    </>
                  )}
                  {repCheck.status === 'assigned' && (
                    <>
                      <strong style={{color: BRAND.gold}}>
                        {repCheck.repName}
                      </strong>{' '}
                      runs this shift —{' '}
                      <strong>{repCheck.driveMin} min</strong>{' '}
                      {repCheck.mode === 'doubleheader' ? (
                        <>
                          from{' '}
                          <strong>
                            {repCheck.anchorName || 'earlier stop'}
                          </strong>{' '}
                          (doubleheader; same rep already in the field).
                        </>
                      ) : (
                        <>from {repCheck.hubLabel}.</>
                      )}
                    </>
                  )}
                  {repCheck.status === 'blocked' && <>{repCheck.message}</>}
                  {repCheck.status === 'error' && (
                    <>
                      {repCheck.message} Double-check rep coverage manually
                      before confirming.
                    </>
                  )}
                </div>

                {/* ── Snr Staff Override (out_of_coverage only) ── */}
                {repCheck.status === 'blocked' &&
                  repCheck.reason === 'out_of_coverage' && (
                    <div style={{marginTop: 14}}>
                      {repOverride.active ? (
                        <div
                          style={{
                            border: `1px solid ${BRAND.gold}`,
                            padding: '10px 14px',
                            background: 'rgba(245,228,0,0.06)',
                            fontFamily: BODY,
                            fontSize: 14,
                            color: BRAND.white,
                            lineHeight: 1.5,
                          }}
                        >
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 12,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: BRAND.gold,
                              marginBottom: 4,
                            }}
                          >
                            Override Approved
                          </div>
                          Approved by{' '}
                          <strong>{repOverride.approvedBy}</strong> —{' '}
                          <em>"{repOverride.reason}"</em>. This exception will
                          be stamped on the Zoho Event record.
                          <div style={{marginTop: 8}}>
                            <button
                              type="button"
                              onClick={() => {
                                setRepOverride({
                                  active: false,
                                  reason: '',
                                  approvedBy: '',
                                });
                                setOverrideOpen(false);
                                setOverrideReasonInput('');
                                setOverrideNameInput('');
                                setOverridePasswordInput('');
                                setOverrideError(null);
                              }}
                              style={{
                                background: 'transparent',
                                border: `1px solid ${BRAND.gray}`,
                                color: BRAND.gray,
                                padding: '4px 10px',
                                fontFamily: TEKO,
                                textTransform: 'uppercase',
                                letterSpacing: '0.14em',
                                fontSize: 12,
                                cursor: 'pointer',
                              }}
                            >
                              Revoke Override
                            </button>
                          </div>
                        </div>
                      ) : overrideOpen ? (
                        <div
                          style={{
                            border: `1px solid ${BRAND.lineStrong}`,
                            padding: '12px 14px',
                            background: 'rgba(255,255,255,0.03)',
                          }}
                        >
                          <div
                            style={{
                              fontFamily: TEKO,
                              fontSize: 12,
                              letterSpacing: '0.18em',
                              textTransform: 'uppercase',
                              color: BRAND.gold,
                              marginBottom: 8,
                            }}
                          >
                            Snr Staff Override
                          </div>
                          <div
                            style={{
                              display: 'grid',
                              gap: 8,
                              gridTemplateColumns: '1fr',
                            }}
                          >
                            <input
                              type="text"
                              value={overrideNameInput}
                              onChange={(e) =>
                                setOverrideNameInput(e.target.value)
                              }
                              placeholder="Your name (approver)"
                              style={{
                                background: BRAND.black,
                                border: `1px solid ${BRAND.lineStrong}`,
                                color: BRAND.white,
                                fontFamily: BODY,
                                fontSize: 14,
                                padding: '10px 12px',
                                outline: 'none',
                              }}
                            />
                            <input
                              type="text"
                              value={overrideReasonInput}
                              onChange={(e) =>
                                setOverrideReasonInput(e.target.value)
                              }
                              placeholder="Reason for override (logged to Zoho)"
                              style={{
                                background: BRAND.black,
                                border: `1px solid ${BRAND.lineStrong}`,
                                color: BRAND.white,
                                fontFamily: BODY,
                                fontSize: 14,
                                padding: '10px 12px',
                                outline: 'none',
                              }}
                            />
                            <input
                              type="password"
                              value={overridePasswordInput}
                              onChange={(e) =>
                                setOverridePasswordInput(e.target.value)
                              }
                              placeholder="Snr Staff password"
                              style={{
                                background: BRAND.black,
                                border: `1px solid ${BRAND.lineStrong}`,
                                color: BRAND.white,
                                fontFamily: BODY,
                                fontSize: 14,
                                padding: '10px 12px',
                                outline: 'none',
                              }}
                            />
                            {overrideError && (
                              <div
                                style={{
                                  color: BRAND.red,
                                  fontFamily: BODY,
                                  fontSize: 13,
                                }}
                              >
                                {overrideError}
                              </div>
                            )}
                            <div style={{display: 'flex', gap: 8}}>
                              <button
                                type="button"
                                onClick={() => {
                                  const name = overrideNameInput.trim();
                                  const reason = overrideReasonInput.trim();
                                  if (!name) {
                                    setOverrideError(
                                      'Enter your name so we can log who approved.',
                                    );
                                    return;
                                  }
                                  if (reason.length < 5) {
                                    setOverrideError(
                                      'Reason must be at least 5 characters — this goes in the CRM record.',
                                    );
                                    return;
                                  }
                                  if (overridePasswordInput !== 'hmexec2025$') {
                                    setOverrideError(
                                      'Password incorrect. Snr Staff only.',
                                    );
                                    return;
                                  }
                                  setRepOverride({
                                    active: true,
                                    reason,
                                    approvedBy: name,
                                  });
                                  setOverrideOpen(false);
                                  setOverridePasswordInput('');
                                  setOverrideError(null);
                                }}
                                style={{
                                  background: BRAND.gold,
                                  border: `1px solid ${BRAND.gold}`,
                                  color: BRAND.black,
                                  padding: '8px 14px',
                                  fontFamily: TEKO,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.14em',
                                  fontSize: 13,
                                  cursor: 'pointer',
                                }}
                              >
                                Approve Override
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setOverrideOpen(false);
                                  setOverridePasswordInput('');
                                  setOverrideError(null);
                                }}
                                style={{
                                  background: 'transparent',
                                  border: `1px solid ${BRAND.lineStrong}`,
                                  color: BRAND.gray,
                                  padding: '8px 14px',
                                  fontFamily: TEKO,
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.14em',
                                  fontSize: 13,
                                  cursor: 'pointer',
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setOverrideOpen(true)}
                          style={{
                            background: 'transparent',
                            border: `1px solid ${BRAND.gold}`,
                            color: BRAND.gold,
                            padding: '8px 14px',
                            fontFamily: TEKO,
                            textTransform: 'uppercase',
                            letterSpacing: '0.14em',
                            fontSize: 13,
                            cursor: 'pointer',
                          }}
                        >
                          Snr Staff Override
                        </button>
                      )}
                    </div>
                  )}
              </div>
            )}

            {/* ── Drive-time guardrail banner (weekend same-day rule) ── */}
            {driveCheck.status !== 'idle' && (
              <div
                style={{
                  marginTop: 20,
                  padding: '16px 20px',
                  border: `1px solid ${
                    driveCheck.status === 'blocked'
                      ? BRAND.red
                      : driveCheck.status === 'ok'
                        ? 'rgba(46,204,113,0.5)'
                        : BRAND.lineStrong
                  }`,
                  background:
                    driveCheck.status === 'blocked'
                      ? 'rgba(220,53,69,0.08)'
                      : driveCheck.status === 'ok'
                        ? 'rgba(46,204,113,0.06)'
                        : 'rgba(255,255,255,0.03)',
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 14,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color:
                      driveCheck.status === 'blocked'
                        ? BRAND.red
                        : driveCheck.status === 'ok'
                          ? BRAND.green
                          : BRAND.gray,
                    marginBottom: 6,
                  }}
                >
                  {driveCheck.status === 'checking' && 'Checking drive time…'}
                  {driveCheck.status === 'ok' && '✓ Route cleared'}
                  {driveCheck.status === 'blocked' && '✕ Drive too long — booking blocked'}
                  {driveCheck.status === 'error' && 'Drive-time check unavailable'}
                </div>
                <div
                  style={{
                    fontFamily: BODY,
                    fontSize: 15,
                    color: BRAND.white,
                    lineHeight: 1.5,
                  }}
                >
                  {driveCheck.status === 'checking' && (
                    <>
                      Verifying drive time between {driveCheck.otherName} and{' '}
                      {dispensary?.name} via Google Maps…
                    </>
                  )}
                  {driveCheck.status === 'ok' && (
                    <>
                      <strong>{driveCheck.text}</strong> between{' '}
                      {driveCheck.otherName} and {dispensary?.name}. One rep can
                      run both stops.
                    </>
                  )}
                  {driveCheck.status === 'blocked' && (
                    <>
                      Google Maps says <strong>{driveCheck.text}</strong> drive
                      between {driveCheck.otherName} and {dispensary?.name} —
                      over the 40-minute limit for same-day weekend pop-ups.
                      Pick a closer dispensary, a different day, or move one of
                      the bookings.
                    </>
                  )}
                  {driveCheck.status === 'error' && (
                    <>
                      Couldn't verify drive time right now
                      {driveCheck.message ? ` (${driveCheck.message})` : ''}.
                      Double-check the route manually before confirming.
                    </>
                  )}
                </div>
              </div>
            )}

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

      {/* Staff-edit toast */}
      <div
        style={{
          position: 'fixed',
          bottom: 30,
          left: '50%',
          transform: `translateX(-50%) translateY(${staffToast ? '0' : '120%'})`,
          background: BRAND.white,
          color: BRAND.black,
          padding: '18px 28px',
          fontFamily: TEKO,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          fontSize: 20,
          fontWeight: 700,
          boxShadow: '0 18px 40px rgba(0,0,0,0.5)',
          transition: 'transform .4s cubic-bezier(.22,1,.36,1)',
          zIndex: 100,
          pointerEvents: 'none',
        }}
      >
        ● Pop Up POC Updated in Zoho
      </div>
    </div>
  );
}
