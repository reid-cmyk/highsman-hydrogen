import {useEffect, useMemo, useRef, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData, useFetcher, useSearchParams} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /shift-report — Spark Team End-of-Shift Report
// ─────────────────────────────────────────────────────────────────────────────
// Mirrors Zoho Forms "Closer Shift Report" (CloserShiftReport1) but in the
// Highsman app shell (dark, brand-aligned, mobile-first). Rep fills this at
// end of shift from /ops → "End of Shift" link, or directly from the booking
// flow via a follow-up email/SMS.
//
// Data target: Supabase (shift_reports table) — deliberately kept OUT of Zoho
// so grading/rolling analytics live in SQL, not CRM custom modules. Photos
// go to Cloudflare R2 and we store signed URLs.
//
// Prefill: ?rep, ?accountId, ?accountName, ?date — populated by /ops when the
// rep taps "End of Shift" next to a confirmed visit.
//
// Typos from Zoho form were corrected in the UI. The submission payload uses
// clean field names (see SHIFT_REPORT_FIELDS in /api/shift-report-submit.ts).
// ─────────────────────────────────────────────────────────────────────────────

export async function loader({context}: LoaderFunctionArgs) {
  const env = context.env as any;
  return json({
    // Maps JS key not needed here, but keeping parity with other staff pages.
    hasZoho: Boolean(
      env?.ZOHO_CLIENT_ID &&
        env?.ZOHO_CLIENT_SECRET &&
        env?.ZOHO_REFRESH_TOKEN,
    ),
    // Submission backend readiness — false means /api/shift-report-submit will
    // accept payloads but only log (not persist). Toggles true once the full
    // Supabase + R2 env set is wired in Oxygen. Must mirror the storageReady
    // check in api.shift-report-submit.tsx.
    submitReady: Boolean(
      env?.SUPABASE_URL &&
        env?.SUPABASE_SERVICE_KEY &&
        env?.R2_ACCOUNT_ID &&
        env?.R2_ACCESS_KEY_ID &&
        env?.R2_SECRET_ACCESS_KEY &&
        env?.R2_BUCKET &&
        env?.R2_PUBLIC_URL,
    ),
  });
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'Shift Report · Spark Team · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
  {
    description:
      'End-of-shift report for Highsman Spark Team — sales, retail intel, and self-assessment.',
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND TOKENS — identical to /ops and /njpopups
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  goldDark: '#D4C700',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  surface: '#0B0B0B',
  line: 'rgba(255,255,255,0.10)',
  lineStrong: 'rgba(255,255,255,0.22)',
  chip: 'rgba(255,255,255,0.06)',
} as const;

const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;

const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

// ─────────────────────────────────────────────────────────────────────────────
// STAFF ROSTER — hard-coded per Reid 2026-04-17.
// Move to Zoho Users lookup once the full team is hired.
// ─────────────────────────────────────────────────────────────────────────────
const STAFF_ROSTER = ['Sky Lima', 'Reid Stewart', 'Matt Cohen'] as const;

// ─────────────────────────────────────────────────────────────────────────────
// PICKLISTS — mirror the Zoho form options. TBD values marked where Reid
// still owes final values; leaving as opt-in placeholders for now.
// ─────────────────────────────────────────────────────────────────────────────
const PRIMARY_OBJECTIONS = [
  'Price',
  'Already loyal to another brand',
  'Quality skepticism',
  'Just browsing / not buying today',
  'Dietary / medical',
  'Potency concern',
  'Format preference',
  'Other',
] as const;

const EXTRA_NOTES_OPTIONS = [
  'High foot traffic',
  'Low foot traffic',
  'Customer complaints',
  'Staffing issues',
] as const;

const MENU_VISIBILITY_OPTIONS = [
  'Yes — correct placement',
  'Yes — wrong section',
  'Partial (digital only)',
  'Partial (physical only)',
  'No',
  'Not applicable',
] as const;

const MERCH_SETUP_OPTIONS = [
  'Yes — fully set up',
  'Partial',
  'No',
] as const;

const PROMOS_SETUP_OPTIONS = [
  'Yes — all promos live',
  'Partial — some missing',
  'No — nothing set up',
  'Not applicable',
] as const;

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────
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

type Dispensary = {id: string; name: string; city: string};

// ─────────────────────────────────────────────────────────────────────────────
// ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
export default function ShiftReportPage() {
  const {submitReady} = useLoaderData<typeof loader>();
  const [params] = useSearchParams();

  // ─── Prefill from /ops ────────────────────────────────────────────────────
  const prefillRep = params.get('rep') || '';
  const prefillAccountId = params.get('accountId') || '';
  const prefillAccountName = params.get('accountName') || '';
  const prefillAccountCity = params.get('accountCity') || '';
  const prefillDate = params.get('date') || todayIso();

  // ─── Section 1: Shift Logistics ───────────────────────────────────────────
  const [repName, setRepName] = useState<string>(
    STAFF_ROSTER.includes(prefillRep as any) ? prefillRep : '',
  );
  const [dispensary, setDispensary] = useState<Dispensary | null>(
    prefillAccountId && prefillAccountName
      ? {
          id: prefillAccountId,
          name: prefillAccountName,
          city: prefillAccountCity,
        }
      : null,
  );
  const [dispensaryQuery, setDispensaryQuery] = useState('');
  const [shiftDate, setShiftDate] = useState(prefillDate);
  const [setupPhoto, setSetupPhoto] = useState<File | null>(null);

  // ─── Section 2: Sales Performance ─────────────────────────────────────────
  const [intercepts, setIntercepts] = useState<string>('');
  const [closes, setCloses] = useState<string>('');
  const [primaryObjection, setPrimaryObjection] = useState<string>('');
  const [objectionHandling, setObjectionHandling] = useState('');
  const [extraNotes, setExtraNotes] = useState<string[]>([]);
  const [salesFeedback, setSalesFeedback] = useState('');

  // ─── Section 3: Retail Intelligence ───────────────────────────────────────
  const [menuVisibility, setMenuVisibility] = useState('');
  const [merchSetup, setMerchSetup] = useState('');
  const [merchPhotos, setMerchPhotos] = useState<File[]>([]);
  const [merchOpportunity, setMerchOpportunity] = useState('');
  const [opportunityPhotos, setOpportunityPhotos] = useState<File[]>([]);
  const [promosSetup, setPromosSetup] = useState('');
  const [managerFirst, setManagerFirst] = useState('');
  const [managerLast, setManagerLast] = useState('');
  const [budtenderRating, setBudtenderRating] = useState(0);
  const [productNotes, setProductNotes] = useState('');

  // ─── Section 4: Rep Self-Assessment ───────────────────────────────────────
  const [aggression, setAggression] = useState(0);
  const [improvementNotes, setImprovementNotes] = useState('');

  // ─── Dispensary live search (Accounts + Leads, merged) ────────────────────
  // A rep's shift might be at a dispensary that's still a prospect (Zoho Lead,
  // e.g. Nova Farms, The Apothecarium) OR an active customer (Zoho Account).
  // Query both in parallel and merge — dedupe by lowercased name so a
  // Lead that's mid-conversion to an Account doesn't appear twice.
  const accountFetcher = useFetcher<{accounts?: ApiAccount[]; error?: string}>();
  const leadFetcher = useFetcher<{
    leads?: Array<{
      id: string;
      company: string;
      city: string | null;
      state: string | null;
      street: string | null;
      phone: string | null;
    }>;
    error?: string;
  }>();
  useEffect(() => {
    const q = dispensaryQuery.trim();
    if (q.length < 2 || dispensary) return;
    const t = setTimeout(() => {
      accountFetcher.load(`/api/accounts?scope=nj&q=${encodeURIComponent(q)}`);
      leadFetcher.load(`/api/leads?scope=nj&q=${encodeURIComponent(q)}`);
    }, 200);
    return () => clearTimeout(t);
  }, [dispensaryQuery, dispensary]);

  // Merge Accounts + Leads into a single ApiAccount-shaped list. Leads carry
  // a `lead_` prefix on their id so downstream (/api/shift-report-submit)
  // keeps the two CRM sources distinguishable in Supabase. Dedupe matches
  // Account name (case-insensitive) against Lead company — Accounts win on
  // collision since they're the richer record.
  const searchResults = useMemo<ApiAccount[]>(() => {
    const accounts = accountFetcher.data?.accounts || [];
    const leads = leadFetcher.data?.leads || [];
    const accountNames = new Set(
      accounts.map((a) => (a.name || '').trim().toLowerCase()),
    );
    const leadsAsAccounts: ApiAccount[] = leads
      .filter((l) => !accountNames.has((l.company || '').trim().toLowerCase()))
      .map((l) => ({
        id: `lead_${l.id}`,
        name: l.company,
        city: l.city,
        state: l.state,
        street: l.street,
        phone: l.phone,
        popUpEmail: null,
        popUpLink: null,
        lastVisitDate: null,
      }));
    // Show accounts first (active customers prioritized in the list), then leads.
    return [...accounts, ...leadsAsAccounts].slice(0, 15);
  }, [accountFetcher.data, leadFetcher.data]);

  const searchLoading =
    accountFetcher.state === 'loading' || leadFetcher.state === 'loading';

  // ─── Suppress Klaviyo popup (staff-only page) ────────────────────────────
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

  // ─── Load Google Fonts once ──────────────────────────────────────────────
  useEffect(() => {
    if (document.getElementById('hs-shift-report-fonts')) return;
    const link = document.createElement('link');
    link.id = 'hs-shift-report-fonts';
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(link);
  }, []);

  // ─── Submission ───────────────────────────────────────────────────────────
  const submitFetcher = useFetcher<{
    ok: boolean;
    id?: string;
    message?: string;
  }>();
  const submitting = submitFetcher.state !== 'idle';
  const submitted = submitFetcher.data?.ok === true;

  // Required-field gate. Matches the Zoho form's required markers (*) plus
  // intercepts/closes being numeric and > 0 checks deferred to action.
  const canSubmit = useMemo(() => {
    if (submitting || submitted) return false;
    if (!repName) return false;
    if (!dispensary?.id) return false;
    if (!shiftDate) return false;
    if (!setupPhoto) return false;
    if (intercepts === '' || Number.isNaN(Number(intercepts))) return false;
    if (closes === '' || Number.isNaN(Number(closes))) return false;
    if (aggression < 1) return false;
    return true;
  }, [
    submitting,
    submitted,
    repName,
    dispensary,
    shiftDate,
    setupPhoto,
    intercepts,
    closes,
    aggression,
  ]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const fd = new FormData();
    fd.append('repName', repName);
    fd.append('accountId', dispensary!.id);
    fd.append('accountName', dispensary!.name);
    fd.append('accountCity', dispensary!.city || '');
    fd.append('shiftDate', shiftDate);
    fd.append('intercepts', intercepts);
    fd.append('closes', closes);
    fd.append('primaryObjection', primaryObjection);
    fd.append('objectionHandling', objectionHandling);
    fd.append('extraNotes', extraNotes.join(','));
    fd.append('salesFeedback', salesFeedback);
    fd.append('menuVisibility', menuVisibility);
    fd.append('merchSetup', merchSetup);
    fd.append('merchOpportunity', merchOpportunity);
    fd.append('promosSetup', promosSetup);
    fd.append('managerFirst', managerFirst);
    fd.append('managerLast', managerLast);
    fd.append('budtenderRating', String(budtenderRating));
    fd.append('productNotes', productNotes);
    fd.append('aggression', String(aggression));
    fd.append('improvementNotes', improvementNotes);
    if (setupPhoto) fd.append('setupPhoto', setupPhoto);
    merchPhotos.slice(0, 3).forEach((f, i) => fd.append(`merchPhoto${i}`, f));
    opportunityPhotos
      .slice(0, 3)
      .forEach((f, i) => fd.append(`opportunityPhoto${i}`, f));
    submitFetcher.submit(fd, {
      method: 'post',
      action: '/api/shift-report-submit',
      encType: 'multipart/form-data',
    });
  }

  const closeRate =
    Number(intercepts) > 0
      ? Math.round((Number(closes) / Number(intercepts)) * 100)
      : null;

  // ─── Live grade preview (mirrors gradeShift in /api/shift-report-submit) ──
  // Runs client-side on every keystroke so the rep sees their projected
  // letter tick as they fill the form. Intel count uses the same thresholds
  // as countIntelFilled() server-side (10-char floors on the two free-text
  // intel fields). jobScore is flat 15 — you earn it the moment you submit.
  const gradePreview = useMemo(() => {
    const i = Number(intercepts) || 0;
    const c = Number(closes) || 0;
    const rate = i > 0 ? c / i : 0;
    const closeScore = Math.min(rate / 0.5, 1) * 35;
    const volScore = Math.min(c / 50, 1) * 20;
    const aggScore = aggression > 0 ? (aggression / 10) * 15 : 0;
    const jobScore = 15;
    const intelCount =
      (menuVisibility ? 1 : 0) +
      (merchSetup ? 1 : 0) +
      (merchOpportunity.trim().length >= 10 ? 1 : 0) +
      (promosSetup ? 1 : 0) +
      (managerFirst || managerLast ? 1 : 0) +
      (budtenderRating > 0 ? 1 : 0) +
      (productNotes.trim().length >= 10 ? 1 : 0);
    const intelScore = Math.min(intelCount / 7, 1) * 15;
    const total = closeScore + volScore + aggScore + jobScore + intelScore;
    const letter =
      total >= 90 ? 'A' : total >= 80 ? 'B' : total >= 70 ? 'C' : total >= 60 ? 'D' : 'F';
    const touched =
      i > 0 || c > 0 || aggression > 0 || intelCount > 0;
    return {
      total: Math.round(total),
      letter,
      intelCount,
      touched,
      closeScore,
      volScore,
      aggScore,
      jobScore,
      intelScore,
    };
  }, [
    intercepts,
    closes,
    aggression,
    menuVisibility,
    merchSetup,
    merchOpportunity,
    promosSetup,
    managerFirst,
    managerLast,
    budtenderRating,
    productNotes,
  ]);

  // ────────────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
        paddingBottom: 120,
      }}
    >
      {/* Top bar — tight header so the form has max screen real-estate */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
          position: 'sticky',
          top: 0,
          zIndex: 30,
        }}
      >
        <Link
          to="/ops"
          style={{
            color: BRAND.gray,
            fontFamily: TEKO,
            fontSize: 18,
            textDecoration: 'none',
            letterSpacing: '0.06em',
          }}
        >
          ← OPS
        </Link>
        <img
          src={LOGO_WHITE}
          alt="Highsman"
          style={{height: 22, width: 'auto'}}
        />
        <div style={{width: 40}} />
      </header>

      {/* Hero */}
      <div style={{padding: '20px 16px 4px'}}>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 32,
            lineHeight: 1,
            letterSpacing: '0.02em',
            color: BRAND.white,
            textTransform: 'uppercase',
          }}
        >
          Spark Team
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 48,
            lineHeight: 0.95,
            letterSpacing: '0.02em',
            color: BRAND.gold,
            textTransform: 'uppercase',
            marginTop: 2,
          }}
        >
          Shift Report
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 8,
            letterSpacing: '0.02em',
          }}
        >
          End of shift recap. Log what went down, what you saw, and where you
          can sharpen the next one.
        </div>
      </div>

      {submitted ? (
        <SuccessPanel id={submitFetcher.data?.id} />
      ) : (
        <form onSubmit={handleSubmit} style={{padding: '0 16px'}}>
          {/* Sticky grade meter — updates live as rep fills intercepts/closes/intel/agg */}
          <LiveGradeMeter g={gradePreview} />

          {/* ───────────── SECTION 1: Shift Logistics ───────────── */}
          <Section title="Shift Logistics" index="01">
            <Field label="Rep name" required>
              <SelectPill
                value={repName}
                onChange={setRepName}
                options={STAFF_ROSTER as unknown as string[]}
                placeholder="Who's closing?"
              />
            </Field>

            <Field label="Dispensary" required>
              {dispensary ? (
                <PickedChip
                  label={dispensary.name}
                  sub={dispensary.city}
                  onClear={() => {
                    setDispensary(null);
                    setDispensaryQuery('');
                  }}
                />
              ) : (
                <DispensaryPicker
                  query={dispensaryQuery}
                  setQuery={setDispensaryQuery}
                  results={searchResults}
                  loading={searchLoading}
                  onPick={(acct) =>
                    setDispensary({
                      id: acct.id,
                      name: acct.name,
                      city: acct.city || '',
                    })
                  }
                />
              )}
            </Field>

            <Field label="Date of shift" required>
              <input
                type="date"
                value={shiftDate}
                onChange={(e) => setShiftDate(e.target.value)}
                style={inputStyle}
              />
            </Field>

            <Field
              label="Setup photo"
              required
              hint="Snap the display before the doors open. Shows us the setup as customers see it."
            >
              <FileInput
                accept="image/*"
                capture="environment"
                multiple={false}
                files={setupPhoto ? [setupPhoto] : []}
                onChange={(files) => setSetupPhoto(files[0] || null)}
              />
            </Field>
          </Section>

          {/* ───────────── SECTION 2: Sales Performance ───────────── */}
          <Section title="Sales Performance" index="02">
            <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12}}>
              <Field label="Intercepts" required>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={intercepts}
                  onChange={(e) => setIntercepts(e.target.value)}
                  style={inputStyle}
                  placeholder="0"
                />
              </Field>
              <Field label="Closes" required>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={closes}
                  onChange={(e) => setCloses(e.target.value)}
                  style={inputStyle}
                  placeholder="0"
                />
              </Field>
            </div>

            {closeRate !== null && (
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 28,
                  letterSpacing: '0.04em',
                  color: closeRate >= 35 ? BRAND.green : closeRate >= 20 ? BRAND.gold : BRAND.red,
                  marginTop: -4,
                  marginBottom: 4,
                }}
              >
                {closeRate}% CLOSE RATE
              </div>
            )}

            <Field label="Primary objection">
              <SelectPill
                value={primaryObjection}
                onChange={setPrimaryObjection}
                options={PRIMARY_OBJECTIONS as unknown as string[]}
                placeholder="Pick the one you heard most"
              />
            </Field>

            <Field
              label="How'd you handle it?"
              hint="One or two sentences — what worked, what didn't."
            >
              <textarea
                rows={3}
                value={objectionHandling}
                onChange={(e) => setObjectionHandling(e.target.value)}
                style={{...inputStyle, resize: 'vertical', minHeight: 76}}
              />
            </Field>

            <Field label="Flag anything at the dispensary">
              <CheckboxGrid
                options={EXTRA_NOTES_OPTIONS as unknown as string[]}
                selected={extraNotes}
                onChange={setExtraNotes}
              />
            </Field>

            <Field label="Feedback for management on sales activity">
              <textarea
                rows={3}
                value={salesFeedback}
                onChange={(e) => setSalesFeedback(e.target.value)}
                style={{...inputStyle, resize: 'vertical', minHeight: 76}}
                placeholder="Blockers, wins, or anything the team should know."
              />
            </Field>
          </Section>

          {/* ───────────── SECTION 3: Retail Intelligence ───────────── */}
          <Section title="Retail Intelligence" index="03">
            <Field
              label="Is the brand visible on the digital + physical menu, in the right section?"
            >
              <SelectPill
                value={menuVisibility}
                onChange={setMenuVisibility}
                options={MENU_VISIBILITY_OPTIONS as unknown as string[]}
                placeholder="Pick one"
              />
            </Field>

            <Field label="Is Highsman merchandise set up in the store?">
              <SelectPill
                value={merchSetup}
                onChange={setMerchSetup}
                options={MERCH_SETUP_OPTIONS as unknown as string[]}
                placeholder="Pick one"
              />
            </Field>

            <Field
              label="Pictures of current Highsman merchandise in store"
              hint="Up to 3 clear shots of what's currently set up."
            >
              <FileInput
                accept="image/*"
                capture="environment"
                multiple
                files={merchPhotos}
                onChange={(files) => setMerchPhotos(files.slice(0, 3))}
                max={3}
              />
            </Field>

            <Field
              label="Merchandising opportunities"
              hint="Any permanent visibility wins: neon signs, cabinet displays, wall art, door wraps."
            >
              <textarea
                rows={3}
                value={merchOpportunity}
                onChange={(e) => setMerchOpportunity(e.target.value)}
                style={{...inputStyle, resize: 'vertical', minHeight: 76}}
              />
            </Field>

            <Field
              label="Pictures of the merchandising opportunity area"
              hint="1–3 pics of the area where we could place something permanent."
            >
              <FileInput
                accept="image/*"
                capture="environment"
                multiple
                files={opportunityPhotos}
                onChange={(files) => setOpportunityPhotos(files.slice(0, 3))}
                max={3}
              />
            </Field>

            <Field label="Were promotions set up and working when you arrived?">
              <SelectPill
                value={promosSetup}
                onChange={setPromosSetup}
                options={PROMOS_SETUP_OPTIONS as unknown as string[]}
                placeholder="Pick one"
              />
            </Field>

            <Field label="Store manager on duty">
              <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10}}>
                <input
                  type="text"
                  placeholder="First"
                  value={managerFirst}
                  onChange={(e) => setManagerFirst(e.target.value)}
                  style={inputStyle}
                />
                <input
                  type="text"
                  placeholder="Last"
                  value={managerLast}
                  onChange={(e) => setManagerLast(e.target.value)}
                  style={inputStyle}
                />
              </div>
            </Field>

            <Field
              label="Budtender brand + product awareness"
              hint="How sharp were the budtenders on Highsman today?"
            >
              <StarRating
                value={budtenderRating}
                onChange={setBudtenderRating}
                icon="star"
              />
            </Field>

            <Field label="Customer or staff comments worth noting">
              <textarea
                rows={3}
                value={productNotes}
                onChange={(e) => setProductNotes(e.target.value)}
                style={{...inputStyle, resize: 'vertical', minHeight: 76}}
              />
            </Field>
          </Section>

          {/* ───────────── SECTION 4: Self-Assessment ───────────── */}
          <Section title="Self-Assessment" index="04">
            <Field
              label="Aggression level"
              required
              hint="Rate your closing energy today — honestly."
            >
              <StarRating
                value={aggression}
                onChange={setAggression}
                icon="flame"
              />
            </Field>

            <Field
              label="Where you want to sharpen next shift"
              hint="What's the one thing you'll do differently?"
            >
              <textarea
                rows={3}
                value={improvementNotes}
                onChange={(e) => setImprovementNotes(e.target.value)}
                style={{...inputStyle, resize: 'vertical', minHeight: 76}}
              />
            </Field>
          </Section>

          {/* Submission bar */}
          <div style={{padding: '12px 0 20px'}}>
            {!submitReady && (
              <div
                style={{
                  background: 'rgba(245,228,0,0.08)',
                  border: `1px solid ${BRAND.gold}`,
                  color: BRAND.gold,
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 12,
                  letterSpacing: '0.02em',
                }}
              >
                HEADS UP: submission backend (Supabase) isn't live yet. Your
                answers will be logged server-side but not persisted until we
                flip the switch.
              </div>
            )}
            {submitFetcher.data?.ok === false && submitFetcher.data?.message && (
              <div
                style={{
                  background: 'rgba(255,59,48,0.1)',
                  border: `1px solid ${BRAND.red}`,
                  color: BRAND.red,
                  fontSize: 12,
                  padding: '8px 12px',
                  borderRadius: 8,
                  marginBottom: 12,
                }}
              >
                {submitFetcher.data.message}
              </div>
            )}
            <button
              type="submit"
              disabled={!canSubmit}
              style={{
                width: '100%',
                padding: '16px 20px',
                borderRadius: 999,
                border: 'none',
                background: canSubmit ? BRAND.gold : BRAND.chip,
                color: canSubmit ? BRAND.black : BRAND.gray,
                fontFamily: TEKO,
                fontSize: 24,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'background 120ms ease',
              }}
            >
              {submitting ? 'Submitting…' : 'Submit Shift Report'}
            </button>
            <div
              style={{
                fontSize: 11,
                color: BRAND.gray,
                textAlign: 'center',
                marginTop: 8,
                letterSpacing: '0.04em',
              }}
            >
              REQUIRED · Rep · Dispensary · Date · Setup photo · Intercepts · Closes · Aggression
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LIVE GRADE METER — sticky card showing projected A/B/C as the rep fills the
// form. Mirrors gradeShift() in /api/shift-report-submit exactly. Shows the
// per-line breakdown so reps can SEE which buckets are leaving points on the
// table (intel is usually the easy jumpball). Pre-touch state shows an empty
// scorecard with a short "let's go" line instead of an F — no reason to shame
// a blank form.
// ─────────────────────────────────────────────────────────────────────────────
type GradePreview = {
  total: number;
  letter: string;
  intelCount: number;
  touched: boolean;
  closeScore: number;
  volScore: number;
  aggScore: number;
  jobScore: number;
  intelScore: number;
};

function LiveGradeMeter({g}: {g: GradePreview}) {
  // Letter color maps: green for A, gold for B/C, orange for D, red for F.
  const letterColor =
    g.letter === 'A'
      ? BRAND.green
      : g.letter === 'B' || g.letter === 'C'
        ? BRAND.gold
        : g.letter === 'D'
          ? BRAND.orange
          : BRAND.red;

  // Soft copy when the form hasn't been touched — encourage, don't shame.
  const coachLine = !g.touched
    ? 'Projected grade locks in as you log intercepts, closes, intel.'
    : g.letter === 'A'
      ? 'Scoreboard territory. Don\'t let up — close the intel fields for the bonus.'
      : g.letter === 'B'
        ? 'Solid shift. Push close rate or finish the intel block to move up.'
        : g.letter === 'C'
          ? 'On pace. One more close or full intel gets you to B.'
          : g.letter === 'D'
            ? 'Below the line. Tighten the pitch, fill the intel, recover with volume.'
            : 'Off the board. Reset — pitch harder, handle the top objection, log intel.';

  return (
    <div
      style={{
        position: 'sticky',
        top: 62, // sits flush under the sticky header (~50px) + some breathing room
        zIndex: 20,
        background: BRAND.surface,
        border: `1px solid ${BRAND.lineStrong}`,
        borderRadius: 14,
        padding: '12px 14px',
        marginTop: 14,
        marginBottom: 6,
        boxShadow: '0 10px 30px rgba(0,0,0,0.45)',
      }}
    >
      {/* Top row: letter + numeric + coach line */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div
          aria-label={`Projected grade ${g.touched ? g.letter : 'pending'}`}
          style={{
            minWidth: 58,
            height: 58,
            borderRadius: 14,
            background: g.touched ? letterColor : BRAND.chip,
            color: g.touched ? BRAND.black : BRAND.gray,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: TEKO,
            fontSize: 42,
            lineHeight: 1,
            letterSpacing: '0.02em',
            border: g.touched ? 'none' : `1px dashed ${BRAND.lineStrong}`,
          }}
        >
          {g.touched ? g.letter : '—'}
        </div>
        <div style={{flex: 1, minWidth: 0}}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 8,
              fontFamily: TEKO,
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{color: BRAND.white, fontSize: 22}}>
              {g.touched ? g.total : 0}
              <span style={{color: BRAND.gray, fontSize: 14}}>/100</span>
            </span>
            <span style={{color: BRAND.gray, fontSize: 12}}>
              · LIVE PROJECTION
            </span>
          </div>
          <div
            style={{
              color: BRAND.gray,
              fontSize: 12,
              marginTop: 2,
              lineHeight: 1.35,
            }}
          >
            {coachLine}
          </div>
        </div>
        <Link
          to="/grading-rubric"
          target="_blank"
          rel="noreferrer"
          style={{
            fontFamily: TEKO,
            fontSize: 13,
            color: BRAND.gray,
            textDecoration: 'none',
            letterSpacing: '0.1em',
            padding: '6px 10px',
            borderRadius: 999,
            border: `1px solid ${BRAND.line}`,
            whiteSpace: 'nowrap',
          }}
        >
          RUBRIC ↗
        </Link>
      </div>

      {/* Breakdown strip — 5 tiny bars showing each component's contribution */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: 6,
          marginTop: 10,
        }}
      >
        <ScoreChip label="CLOSE" pts={g.closeScore} max={35} />
        <ScoreChip label="VOL" pts={g.volScore} max={20} />
        <ScoreChip label="AGG" pts={g.aggScore} max={15} />
        <ScoreChip label="JOB" pts={g.jobScore} max={15} />
        <ScoreChip label="INTEL" pts={g.intelScore} max={15} />
      </div>
    </div>
  );
}

function ScoreChip({
  label,
  pts,
  max,
}: {
  label: string;
  pts: number;
  max: number;
}) {
  const pct = Math.max(0, Math.min(1, pts / max));
  const bar =
    pct >= 0.85 ? BRAND.green : pct >= 0.55 ? BRAND.gold : pct > 0 ? BRAND.orange : BRAND.chip;
  return (
    <div
      style={{
        background: BRAND.chip,
        borderRadius: 8,
        padding: '6px 8px',
        border: `1px solid ${BRAND.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontFamily: TEKO,
          letterSpacing: '0.08em',
        }}
      >
        <span style={{color: BRAND.gray, fontSize: 10}}>{label}</span>
        <span style={{color: BRAND.white, fontSize: 13}}>
          {Math.round(pts)}
          <span style={{color: BRAND.gray, fontSize: 10}}>/{max}</span>
        </span>
      </div>
      <div
        style={{
          marginTop: 4,
          height: 4,
          borderRadius: 4,
          background: 'rgba(255,255,255,0.08)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.round(pct * 100)}%`,
            height: '100%',
            background: bar,
            transition: 'width 220ms ease',
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUCCESS STATE
// ─────────────────────────────────────────────────────────────────────────────
function SuccessPanel({id}: {id?: string}) {
  return (
    <div style={{padding: '40px 20px', textAlign: 'center'}}>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 64,
          lineHeight: 1,
          color: BRAND.gold,
          letterSpacing: '0.04em',
        }}
      >
        LOGGED.
      </div>
      <div
        style={{
          color: BRAND.white,
          fontSize: 15,
          marginTop: 12,
          maxWidth: 320,
          marginInline: 'auto',
        }}
      >
        Shift report received. Your grade + team scoreboard update tonight.
      </div>
      {id && (
        <div
          style={{
            color: BRAND.gray,
            fontSize: 11,
            marginTop: 10,
            letterSpacing: '0.1em',
          }}
        >
          REPORT #{id.slice(-8).toUpperCase()}
        </div>
      )}
      <div style={{marginTop: 28, display: 'flex', gap: 10, justifyContent: 'center'}}>
        <Link
          to="/ops"
          style={{
            fontFamily: TEKO,
            fontSize: 18,
            padding: '12px 22px',
            borderRadius: 999,
            background: BRAND.gold,
            color: BRAND.black,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          BACK TO OPS
        </Link>
        <Link
          to="/njpopups"
          style={{
            fontFamily: TEKO,
            fontSize: 18,
            padding: '12px 22px',
            borderRadius: 999,
            background: 'transparent',
            border: `1px solid ${BRAND.lineStrong}`,
            color: BRAND.white,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          BOOK NEXT VISIT
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED LAYOUT PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────
function Section({
  title,
  index,
  children,
}: {
  title: string;
  index: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        marginTop: 24,
        padding: 16,
        background: BRAND.surface,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 14,
      }}
    >
      <div style={{display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14}}>
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 14,
            color: BRAND.gold,
            letterSpacing: '0.14em',
          }}
        >
          {index}
        </span>
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 22,
            color: BRAND.white,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          {title}
        </span>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', gap: 14}}>{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{display: 'block'}}>
      <div
        style={{
          fontSize: 12,
          color: BRAND.white,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginBottom: 6,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span>{label}</span>
        {required && <span style={{color: BRAND.gold}}>*</span>}
      </div>
      {hint && (
        <div style={{fontSize: 12, color: BRAND.gray, marginBottom: 8, lineHeight: 1.35}}>
          {hint}
        </div>
      )}
      {children}
    </label>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// FORM CONTROLS
// ─────────────────────────────────────────────────────────────────────────────
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: BRAND.chip,
  border: `1px solid ${BRAND.line}`,
  color: BRAND.white,
  padding: '12px 14px',
  borderRadius: 10,
  fontFamily: BODY,
  fontSize: 15,
  outline: 'none',
  boxSizing: 'border-box',
};

function SelectPill({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
}) {
  return (
    <div style={{position: 'relative'}}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          ...inputStyle,
          appearance: 'none',
          paddingRight: 36,
          cursor: 'pointer',
        }}
      >
        <option value="" disabled style={{background: BRAND.surface}}>
          {placeholder || 'Pick one'}
        </option>
        {options.map((opt) => (
          <option key={opt} value={opt} style={{background: BRAND.surface}}>
            {opt}
          </option>
        ))}
      </select>
      <span
        style={{
          position: 'absolute',
          right: 14,
          top: '50%',
          transform: 'translateY(-50%)',
          color: BRAND.gray,
          pointerEvents: 'none',
          fontSize: 12,
        }}
      >
        ▼
      </span>
    </div>
  );
}

function CheckboxGrid({
  options,
  selected,
  onChange,
}: {
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  function toggle(opt: string) {
    if (selected.includes(opt)) {
      onChange(selected.filter((x) => x !== opt));
    } else {
      onChange([...selected, opt]);
    }
  }
  return (
    <div style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8}}>
      {options.map((opt) => {
        const active = selected.includes(opt);
        return (
          <button
            key={opt}
            type="button"
            onClick={() => toggle(opt)}
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              background: active ? BRAND.gold : BRAND.chip,
              color: active ? BRAND.black : BRAND.white,
              border: `1px solid ${active ? BRAND.gold : BRAND.line}`,
              fontFamily: BODY,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 120ms ease',
            }}
          >
            {opt}
          </button>
        );
      })}
    </div>
  );
}

function StarRating({
  value,
  onChange,
  icon,
}: {
  value: number;
  onChange: (v: number) => void;
  icon: 'star' | 'flame';
}) {
  const glyph = icon === 'flame' ? '🔥' : '★';
  const inactiveGlyph = icon === 'flame' ? '🔥' : '☆';
  return (
    <div style={{display: 'flex', flexDirection: 'column', gap: 10}}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(10, 1fr)',
          gap: 4,
        }}
      >
        {Array.from({length: 10}).map((_, i) => {
          const n = i + 1;
          const active = n <= value;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              aria-label={`${n} / 10`}
              style={{
                height: 42,
                borderRadius: 8,
                background: active ? 'rgba(245,228,0,0.14)' : BRAND.chip,
                border: `1px solid ${active ? BRAND.gold : BRAND.line}`,
                color: BRAND.white,
                fontSize: 20,
                cursor: 'pointer',
                padding: 0,
                filter: active ? 'none' : 'grayscale(1) opacity(0.35)',
                transition: 'all 120ms ease',
              }}
            >
              {active ? glyph : inactiveGlyph}
            </button>
          );
        })}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 22,
          color: value ? BRAND.gold : BRAND.gray,
          letterSpacing: '0.04em',
        }}
      >
        {value ? `${value} / 10` : 'Tap to rate'}
      </div>
    </div>
  );
}

function FileInput({
  accept,
  capture,
  multiple,
  files,
  onChange,
  max,
}: {
  accept: string;
  capture?: 'environment' | 'user';
  multiple: boolean;
  files: File[];
  onChange: (files: File[]) => void;
  max?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  function handlePick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files || []);
    if (multiple) {
      const combined = [...files, ...picked];
      onChange(max ? combined.slice(0, max) : combined);
    } else {
      onChange(picked.slice(0, 1));
    }
    // allow re-selecting same file
    if (ref.current) ref.current.value = '';
  }
  function removeAt(idx: number) {
    const next = files.slice();
    next.splice(idx, 1);
    onChange(next);
  }
  const canAddMore = !max || files.length < max;
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept={accept}
        capture={capture}
        multiple={multiple}
        onChange={handlePick}
        style={{display: 'none'}}
      />
      {canAddMore && (
        <button
          type="button"
          onClick={() => ref.current?.click()}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 10,
            background: BRAND.chip,
            border: `1px dashed ${BRAND.lineStrong}`,
            color: BRAND.white,
            fontFamily: BODY,
            fontSize: 14,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          <span style={{fontSize: 18}}>📷</span>
          <span>
            {files.length === 0
              ? multiple
                ? `Tap to add photos${max ? ` (up to ${max})` : ''}`
                : 'Tap to take a photo'
              : multiple
                ? `Add another${max ? ` — ${files.length}/${max}` : ''}`
                : 'Retake photo'}
          </span>
        </button>
      )}
      {files.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: multiple ? 'repeat(3, 1fr)' : '1fr',
            gap: 8,
            marginTop: 10,
          }}
        >
          {files.map((f, i) => (
            <FilePreview key={i} file={f} onRemove={() => removeAt(i)} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilePreview({file, onRemove}: {file: File; onRemove: () => void}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <div
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: BRAND.chip,
        borderRadius: 8,
        overflow: 'hidden',
        border: `1px solid ${BRAND.line}`,
      }}
    >
      {url && (
        <img
          src={url}
          alt={file.name}
          style={{width: '100%', height: '100%', objectFit: 'cover'}}
        />
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove photo"
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: BRAND.black,
          color: BRAND.white,
          border: `1px solid ${BRAND.lineStrong}`,
          borderRadius: 999,
          width: 26,
          height: 26,
          fontSize: 14,
          cursor: 'pointer',
          lineHeight: 1,
          padding: 0,
        }}
      >
        ×
      </button>
    </div>
  );
}

function DispensaryPicker({
  query,
  setQuery,
  results,
  loading,
  onPick,
}: {
  query: string;
  setQuery: (v: string) => void;
  results: ApiAccount[];
  loading: boolean;
  onPick: (acct: ApiAccount) => void;
}) {
  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search NJ dispensaries…"
        style={inputStyle}
      />
      {query.trim().length >= 2 && (
        <div
          style={{
            marginTop: 8,
            maxHeight: 260,
            overflowY: 'auto',
            background: BRAND.surface,
            border: `1px solid ${BRAND.line}`,
            borderRadius: 10,
          }}
        >
          {loading && (
            <div style={{padding: 14, color: BRAND.gray, fontSize: 13}}>Searching…</div>
          )}
          {!loading && results.length === 0 && (
            <div style={{padding: 14, color: BRAND.gray, fontSize: 13}}>
              No matches. Try another spelling.
            </div>
          )}
          {results.map((acct) => (
            <button
              key={acct.id}
              type="button"
              onClick={() => onPick(acct)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '12px 14px',
                background: 'transparent',
                border: 'none',
                borderBottom: `1px solid ${BRAND.line}`,
                color: BRAND.white,
                cursor: 'pointer',
              }}
            >
              <div style={{fontFamily: TEKO, fontSize: 18, letterSpacing: '0.04em'}}>
                {acct.name}
              </div>
              <div style={{fontSize: 12, color: BRAND.gray, marginTop: 2}}>
                {[acct.city, acct.state].filter(Boolean).join(', ')}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PickedChip({
  label,
  sub,
  onClear,
}: {
  label: string;
  sub?: string;
  onClear: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '12px 14px',
        background: BRAND.chip,
        border: `1px solid ${BRAND.line}`,
        borderRadius: 10,
      }}
    >
      <div>
        <div style={{fontFamily: TEKO, fontSize: 20, letterSpacing: '0.04em'}}>
          {label}
        </div>
        {sub && <div style={{fontSize: 12, color: BRAND.gray, marginTop: 2}}>{sub}</div>}
      </div>
      <button
        type="button"
        onClick={onClear}
        style={{
          background: 'transparent',
          border: `1px solid ${BRAND.lineStrong}`,
          color: BRAND.white,
          borderRadius: 999,
          padding: '6px 12px',
          fontSize: 12,
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        CHANGE
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────────────────────────────────────
function todayIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}
