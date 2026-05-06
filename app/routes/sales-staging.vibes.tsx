/**
 * app/routes/sales-staging.vibes.tsx
 * /sales-staging/vibes — Serena's Route Schedule (reference panel for Sky)
 *
 * 100% client-side. No API calls, no Zoho, no Supabase.
 * Pure date math mirroring app/lib/nj-regions.ts schedule rules.
 *
 * Shows Sky:
 *   • Region reference (Tue=North, Wed=Central, Thu=South)
 *   • Rolling 4-week calendar with region labels + TODAY pill
 *   • Launch / ramp banner (auto-hides once normal schedule is live)
 *   • Outlier notes (Shore cities, pinned-time trainings)
 */

import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json, redirect} from '@shopify/remix-oxygen';
import {useLoaderData} from '@remix-run/react';
import {useMemo} from 'react';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';
import {SalesFloorLayout} from '~/components/SalesFloorLayout';

export const handle = {hideHeader: true, hideFooter: true};
export const meta: MetaFunction = () => [
  {title: "Serena's Schedule | Sales Floor"},
  {name: 'robots', content: 'noindex'},
];

// ─── Design tokens ────────────────────────────────────────────────────────────
const T = {
  bg:           '#0A0A0A',
  surface:      '#141414',
  surfaceElev:  '#1A1A1A',
  border:       '#1F1F1F',
  borderStrong: '#2F2F2F',
  text:         '#F5F5F5',
  textMuted:    '#C8C8C8',
  textSubtle:   '#9C9C9C',
  textFaint:    '#6A6A6A',
  yellow:       '#FFD500',
  cyan:         '#00D4FF',   // North
  green:        '#00E676',   // Central
  statusWarn:   '#FFB300',   // South
};

// ─── Schedule anchors — keep in sync with app/lib/nj-regions.ts ──────────────
const SERENA_LAUNCH_ISO  = '2026-05-14'; // Thu — first day Serena rolls out
const SERENA_NORMAL_ISO  = '2026-05-19'; // Tue — Tue/Wed/Thu rhythm starts
const RAMP_BY_REGION: Record<string, string> = {
  north:   '2026-05-14', // Thu
  central: '2026-05-15', // Fri
  south:   '2026-05-17', // Sun
};
const RAMP_DAYS = ['2026-05-14','2026-05-15','2026-05-16','2026-05-17'];

// ─── Region config ────────────────────────────────────────────────────────────
type Region = 'north' | 'central' | 'south';

const REGION_META: Record<Region, {label: string; day: string; color: string; cities: string}> = {
  north:   {label:'North NJ',   day:'Tuesday',   color:T.cyan,       cities:'Newark · Jersey City · Paterson · Union'},
  central: {label:'Central NJ', day:'Wednesday', color:T.green,      cities:'New Brunswick · Princeton · Edison · Asbury Park'},
  south:   {label:'South NJ',   day:'Thursday',  color:T.statusWarn, cities:'Cherry Hill · Camden · Toms River · Vineland'},
};

// ─── Date helpers ─────────────────────────────────────────────────────────────
function isoToDate(iso: string): Date {
  return new Date(iso + 'T00:00:00-04:00'); // ET anchor
}
function isoOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d.getTime());
  c.setDate(c.getDate() + n);
  return c;
}
function fmtFull(d: Date): string {
  const DAYS  = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function mondayOf(d: Date): Date {
  const c = new Date(d.getTime());
  const dow = c.getDay(); // 0=Sun
  c.setDate(c.getDate() + (dow === 0 ? -6 : 1 - dow));
  c.setHours(0, 0, 0, 0);
  return c;
}

function regionForDay(iso: string): Region | null {
  if (RAMP_DAYS.includes(iso)) {
    for (const [r, rIso] of Object.entries(RAMP_BY_REGION)) {
      if (rIso === iso) return r as Region;
    }
    return null; // May 16 (Sat) — overflow only
  }
  if (iso >= SERENA_NORMAL_ISO) {
    const dow = isoToDate(iso).getDay();
    if (dow === 2) return 'north';
    if (dow === 3) return 'central';
    if (dow === 4) return 'south';
  }
  return null;
}

type DayInfo = {iso: string; label: string; region: Region | null; isToday: boolean; isRamp: boolean};
type WeekInfo = {startIso: string; days: DayInfo[]};

function buildWeeks(count = 4): WeekInfo[] {
  const todayIso = isoOf(new Date());
  let monday = mondayOf(new Date());

  // If before launch, anchor first rendered week to launch week so Sky sees the ramp
  const launch = isoToDate(SERENA_LAUNCH_ISO);
  if (monday.getTime() < new Date(launch.getTime() - 6 * 86400000).getTime()) {
    monday = mondayOf(launch);
  }

  const DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weeks: WeekInfo[] = [];
  for (let w = 0; w < count; w++) {
    const startIso = isoOf(addDays(monday, w * 7));
    const start = isoToDate(startIso);
    const days: DayInfo[] = [];
    for (let i = 0; i < 7; i++) {
      const d = addDays(start, i);
      const iso = isoOf(d);
      const region = regionForDay(iso);
      const isRamp = RAMP_DAYS.includes(iso);
      days.push({iso, label: DAYS[d.getDay()], region, isToday: iso === todayIso, isRamp});
    }
    weeks.push({startIso, days});
  }
  return weeks;
}

function bannerContent(): {type: 'pre'|'ramp'|null; days?: number} {
  const now = Date.now();
  const launch = isoToDate(SERENA_LAUNCH_ISO).getTime();
  const normal = isoToDate(SERENA_NORMAL_ISO).getTime();
  if (now < launch) {
    return {type: 'pre', days: Math.ceil((launch - now) / 86400000)};
  }
  if (now < normal) {
    return {type: 'ramp'};
  }
  return {type: null};
}

// ─── Loader ───────────────────────────────────────────────────────────────────
export async function loader({request, context}: LoaderFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  const sfUser = await getSFUser(cookie, env);
  if (!sfUser && !isStagingAuthed(cookie)) return redirect('/sales-staging/login');
  return json({sfUser});
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function VibesSchedulePage() {
  const {sfUser} = useLoaderData<typeof loader>() as any;

  const weeks  = useMemo(() => buildWeeks(4), []);
  const banner = useMemo(() => bannerContent(), []);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  return (
    <SalesFloorLayout current="Vibes" sfUser={sfUser}>

      {/* ── Page header ───────────────────────────────────────────────── */}
      <div className="hs-sweep" style={{padding:'20px 28px 0', borderBottom:`1px solid ${T.borderStrong}`, background:`linear-gradient(180deg,rgba(255,213,0,0.03) 0%,transparent 100%)`}}>
        <div style={{marginBottom:16}}>
          <h1 style={{margin:0, fontFamily:'Teko,sans-serif', fontSize:36, fontWeight:500, letterSpacing:'0.06em', textTransform:'uppercase', lineHeight:1}}>
            Serena's Route Schedule
          </h1>
          <div style={{fontFamily:'JetBrains Mono,monospace', fontSize:10.5, color:T.textFaint, marginTop:4, letterSpacing:'0.12em'}}>
            Reference only.&nbsp; North → <span style={{color:T.cyan}}>Tuesday</span>&nbsp;·&nbsp;
            Central → <span style={{color:T.green}}>Wednesday</span>&nbsp;·&nbsp;
            South → <span style={{color:T.statusWarn}}>Thursday</span>&nbsp;·&nbsp;
            Bookings auto-pin to the right day.
          </div>
        </div>
      </div>

      <div style={{padding:'24px 28px', display:'flex', flexDirection:'column', gap:24, maxWidth:900}}>

        {/* ── Launch / ramp banner ─────────────────────────────────────── */}
        {banner.type === 'pre' && (
          <div style={{background:'linear-gradient(135deg,rgba(255,213,0,0.10),rgba(255,213,0,0.03))', border:`1px solid ${T.yellow}`, padding:'16px 20px'}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:24, letterSpacing:'0.10em', color:T.text, marginBottom:6}}>
              Vibes launches in {banner.days} day{banner.days === 1 ? '' : 's'}
            </div>
            <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textSubtle, lineHeight:1.6}}>
              Serena rolls out <strong style={{color:T.text}}>Thu, May 14</strong>. Pushes booked today land inside the launch week ramp (Thu–Sun).
            </div>
          </div>
        )}
        {banner.type === 'ramp' && (
          <div style={{background:`rgba(255,213,0,0.06)`, border:`1px solid ${T.yellow}`, padding:'16px 20px'}}>
            <div style={{fontFamily:'Teko,sans-serif', fontSize:24, letterSpacing:'0.10em', color:T.text, marginBottom:6}}>
              Launch Week — every day is in play
            </div>
            <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textSubtle, lineHeight:1.6}}>
              May 14–17 is flexible. Tue/Wed/Thu rhythm locks in <strong style={{color:T.text}}>Tue, May 19</strong>.
            </div>
          </div>
        )}

        {/* ── Region reference cards ───────────────────────────────────── */}
        <div style={{display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12}}>
          {(Object.entries(REGION_META) as [Region, typeof REGION_META[Region]][]).map(([key, meta]) => (
            <div key={key} style={{background:T.surface, borderLeft:`3px solid ${meta.color}`, padding:'14px 16px'}}>
              <div style={{fontFamily:'Teko,sans-serif', fontSize:11, letterSpacing:'0.26em', color:T.textFaint, textTransform:'uppercase', marginBottom:5}}>
                {meta.day} — {meta.label}
              </div>
              <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textMuted, lineHeight:1.5}}>
                {meta.cities}
              </div>
            </div>
          ))}
        </div>

        {/* ── Week calendar ────────────────────────────────────────────── */}
        <div style={{display:'flex', flexDirection:'column', gap:20}}>
          {weeks.map(wk => {
            const d = isoToDate(wk.startIso);
            // Skip Monday — show Tue-Sun (Mon is never a work day)
            const workDays = wk.days.filter(day => day.region || day.isRamp);
            if (workDays.length === 0) return null;
            return (
              <div key={wk.startIso}>
                {/* Week label */}
                <div style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.26em', textTransform:'uppercase', color:T.yellow, marginBottom:8}}>
                  Week of {MONTHS[d.getMonth()]} {d.getDate()}
                </div>
                {/* Day rows */}
                <div style={{display:'flex', flexDirection:'column', gap:5}}>
                  {wk.days
                    .filter(day => day.region || day.isRamp)
                    .map(day => {
                      const regionMeta = day.region ? REGION_META[day.region] : null;
                      const color = regionMeta ? regionMeta.color : T.textFaint;
                      const regionLabel = regionMeta ? regionMeta.label : 'Off / Ramp';
                      return (
                        <div key={day.iso} style={{
                          display:'flex', alignItems:'center', gap:14,
                          padding:'10px 14px',
                          background: day.isToday ? `${T.yellow}08` : T.surface,
                          borderLeft:`3px solid ${color}`,
                        }}>
                          {/* Day name */}
                          <div style={{minWidth:80, display:'flex', alignItems:'center', gap:8}}>
                            <span style={{fontFamily:'Teko,sans-serif', fontSize:20, letterSpacing:'0.06em', color: day.isToday ? T.yellow : T.text, lineHeight:1}}>
                              {day.label}
                            </span>
                            {day.isToday && (
                              <span style={{fontFamily:'JetBrains Mono,monospace', fontSize:8.5, letterSpacing:'0.14em', background:T.yellow, color:'#000', padding:'2px 6px', fontWeight:700}}>
                                TODAY
                              </span>
                            )}
                          </div>
                          {/* Date */}
                          <div style={{flex:1, fontFamily:'JetBrains Mono,monospace', fontSize:11, color:T.textSubtle, letterSpacing:'0.04em'}}>
                            {fmtFull(isoToDate(day.iso))}
                          </div>
                          {/* Region */}
                          <div style={{fontFamily:'Teko,sans-serif', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', color, fontWeight:600}}>
                            {regionLabel}
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── Outlier / notes footer ───────────────────────────────────── */}
        <div style={{borderTop:`1px dashed ${T.borderStrong}`, paddingTop:16}}>
          <div style={{fontFamily:'Inter,sans-serif', fontSize:12, color:T.textFaint, lineHeight:1.7}}>
            <span style={{color:T.textMuted, fontWeight:600}}>Outliers / Shore:</span>{' '}
            Cape May, Ocean City, LBI, Wildwood — quarterly drop-in only, never weekly.{' '}
            <span style={{color:T.textMuted, fontWeight:600}}>Atlantic City</span> rides along on Thursday's South route.
            Sky's Training button flags true outliers so Serena arranges direct.
            <br/>
            <span style={{color:T.textMuted, fontWeight:600}}>Pinned-time trainings:</span>{' '}
            If a buyer asks for an exact window (e.g. 2–5pm), the booking still lands on the region's anchor day — Serena confirms the exact slot with the store.
          </div>
        </div>

      </div>
    </SalesFloorLayout>
  );
}
