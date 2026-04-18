import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData, useSearchParams, useFetcher} from '@remix-run/react';
import {STRAINS, FORMATS} from '~/data/highsman-skus';
import {MERCH_ITEMS, CATEGORIES} from '~/data/merch-catalog';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/visit/new — Vibes Team Check-In Flow (5 screens)
// ─────────────────────────────────────────────────────────────────────────────
// Sequence: Arrive → Audit → Train → Drop → Vibes → Submit
//
// Designed for phone, one-thumb friendly. Submits to /api/vibes-visit-submit.
// Because dispensaries do not display live cannabis product on open shelves,
// the Audit step focuses on:
//   (1) SKUs in stock  — what the store has on hand, per format × strain
//   (2) Merchandising  — which Highsman POP/merch items are visible on floor
//   (3) Photos         — 1-3 shots of the merchandising in the store
// The Drop step then tracks what the rep physically dropped off, so per-store
// merch inventory stays accurate.
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

type Deck = {
  id: string;
  title: string;
  module_slug: string;
  duration_minutes: number;
};

type VibesRep = {
  id: string;
  full_name: string;
  daily_goodie_budget: number;
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  const url = new URL(request.url);
  const repIdParam = url.searchParams.get('repId');

  let decks: Deck[] = [];
  let reps: VibesRep[] = [];
  let rep: VibesRep | null = null;

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      const [decksRes, repsRes] = await Promise.all([
        fetch(
          `${env.SUPABASE_URL}/rest/v1/training_decks?active=eq.true&select=id,title,module_slug,duration_minutes&order=sort_order.asc`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          },
        ),
        fetch(
          `${env.SUPABASE_URL}/rest/v1/vibes_reps?active=eq.true&select=id,full_name,daily_goodie_budget&order=start_date.asc`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          },
        ),
      ]);
      if (decksRes.ok) decks = await decksRes.json();
      if (repsRes.ok) reps = await repsRes.json();
      rep = reps.find((r) => r.id === repIdParam) || reps[0] || null;
    } catch (err) {
      console.warn('[vibes/visit/new] Supabase fetch failed', err);
    }
  }

  return json({decks, reps, rep});
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'New Visit · Vibes · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─────────────────────────────────────────────────────────────────────────────
// BRAND
// ─────────────────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  purple: '#B884FF',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

// SKU stock is now tracked as a nested map: { [formatSlug]: { [strainSlug]: true } }
// Source of truth lives in app/data/highsman-skus.ts.
type SkuStockMap = Record<string, Record<string, boolean>>;

// Merch visible / drop-off counts are keyed by MerchItem.id.
type MerchCountMap = Record<string, number>;

const STEPS = [
  {key: 'arrive', label: 'Arrive', color: BRAND.gold},
  {key: 'audit', label: 'Audit', color: BRAND.purple},
  {key: 'train', label: 'Train', color: BRAND.green},
  {key: 'drop', label: 'Drop', color: BRAND.orange},
  {key: 'vibes', label: 'Vibes', color: BRAND.gold},
] as const;

type StepKey = (typeof STEPS)[number]['key'];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export default function VibesVisitNew() {
  const {decks, rep} = useLoaderData<typeof loader>();
  const [params] = useSearchParams();
  const fetcher = useFetcher<{ok: boolean; id?: string; message?: string; goodieTotal?: number}>();

  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l = document.createElement('link');
    l.id = 'vibes-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'klv-vs';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  const presetAccountId = params.get('accountId') || '';
  const presetAccountName = params.get('accountName') || '';
  const presetAccountCity = params.get('accountCity') || '';
  const presetAccountState = params.get('accountState') || 'NJ';
  const presetBudtenderCountRaw = params.get('budtenderCount') || '';
  const presetBudtenderCount = presetBudtenderCountRaw
    ? Number(presetBudtenderCountRaw)
    : null;

  // Step state
  const [step, setStep] = useState<StepKey>('arrive');

  // Arrive
  const [accountId, setAccountId] = useState(presetAccountId);
  const [accountName, setAccountName] = useState(presetAccountName);
  const [accountCity, setAccountCity] = useState(presetAccountCity);
  const [accountState, setAccountState] = useState(presetAccountState);
  const [accountQuery, setAccountQuery] = useState('');
  const [visitType, setVisitType] =
    useState<'first_visit' | 'rotation' | 'target_sample' | 'training' | 'other'>(
      'rotation',
    );
  const [gps, setGps] = useState<{lat: number; lng: number; ts: string} | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [checkedInAt, setCheckedInAt] = useState<string | null>(null);

  // Audit
  // SKUs in stock — nested map of format → strain → true
  const [skuStock, setSkuStock] = useState<SkuStockMap>({});
  // Merchandising visible in-store — count per MerchItem.id
  const [merchVisible, setMerchVisible] = useState<MerchCountMap>({});
  // Photos of Highsman merchandising visible in the store — min 1, max 3
  const [merchVisiblePhotos, setMerchVisiblePhotos] = useState<File[]>([]);

  // Train
  const [decksTaught, setDecksTaught] = useState<string[]>([]);
  const [budtenders, setBudtenders] = useState<Array<{name: string; email: string}>>(
    [],
  );
  const [budName, setBudName] = useState('');
  const [budEmail, setBudEmail] = useState('');
  // Training goal: pulled from Zoho Account "Number of Budtenders". Editable by
  // the rep if she finds the real number is different. We persist both the
  // original and the edited value so the submit action can PATCH Zoho iff it
  // actually changed.
  const [numberOfBudtenders, setNumberOfBudtenders] = useState<number | null>(
    Number.isFinite(presetBudtenderCount) ? presetBudtenderCount : null,
  );
  const [numberOfBudtendersOrig, setNumberOfBudtendersOrig] = useState<
    number | null
  >(Number.isFinite(presetBudtenderCount) ? presetBudtenderCount : null);

  // Drop
  const [goodieItems, setGoodieItems] = useState<Array<{item: string; cost: number}>>(
    [],
  );
  const [goodItem, setGoodItem] = useState('');
  const [goodCost, setGoodCost] = useState('');
  // Dropped off merch — per MerchItem.id count of physically handed to store today
  const [dropoffs, setDropoffs] = useState<MerchCountMap>({});
  // Photos of what was dropped off — up to 3 shots for inventory-tracking
  const [dropoffPhotos, setDropoffPhotos] = useState<File[]>([]);

  // Vibes
  const [vibesScore, setVibesScore] = useState<number | null>(null);
  const [notesToSales, setNotesToSales] = useState('');
  const [spokeWithManager, setSpokeWithManager] = useState(false);
  const [selfiePhoto, setSelfiePhoto] = useState<File | null>(null);
  const [ugcPostUrl, setUgcPostUrl] = useState('');

  // Account search fetcher
  const accountFetcher = useFetcher<{accounts: any[]}>();
  useEffect(() => {
    if (!accountQuery || accountQuery.length < 3) return;
    const t = setTimeout(() => {
      accountFetcher.load(`/api/accounts?q=${encodeURIComponent(accountQuery)}`);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountQuery]);

  // If the rep arrived with a preset accountId but no budtender count (e.g.
  // deep-linked from the /vibes/store/:accountId "Start Visit" button without
  // the count param), fetch the account once so Step Train can show the goal.
  const budtenderFetcher = useFetcher<{account: {numberOfBudtenders: number | null} | null}>();
  useEffect(() => {
    if (
      accountId &&
      numberOfBudtenders == null &&
      budtenderFetcher.state === 'idle' &&
      !budtenderFetcher.data
    ) {
      budtenderFetcher.load(
        `/api/accounts?accountId=${encodeURIComponent(accountId)}`,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId]);
  useEffect(() => {
    const n = budtenderFetcher.data?.account?.numberOfBudtenders;
    if (typeof n === 'number' && Number.isFinite(n)) {
      setNumberOfBudtenders(n);
      setNumberOfBudtendersOrig(n);
    }
  }, [budtenderFetcher.data]);

  // GPS check-in
  function captureGps() {
    if (!navigator.geolocation) {
      setGpsError('Geolocation not supported on this device');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          ts: new Date().toISOString(),
        });
        setCheckedInAt(new Date().toISOString());
        setGpsError(null);
      },
      (err) => setGpsError(err.message || 'Could not get location'),
      {enableHighAccuracy: true, timeout: 10000},
    );
  }

  // Step advance guards
  const canAdvance = useMemo(() => {
    switch (step) {
      case 'arrive':
        return Boolean(accountId && accountName && rep && checkedInAt);
      case 'audit':
        // Require at least one Highsman-merch-in-store photo.
        return merchVisiblePhotos.length >= 1;
      case 'train':
        // Hard gate: we MUST know how many budtenders work at this store so
        // the Vibes program has a real training target and can measure
        // coverage. If Zoho didn't have a value and the rep hasn't entered
        // one, block advance until she does.
        return (
          numberOfBudtenders != null &&
          Number.isFinite(numberOfBudtenders) &&
          numberOfBudtenders > 0
        );
      case 'drop':
        return true;
      case 'vibes':
        return vibesScore !== null;
    }
  }, [
    step,
    accountId,
    accountName,
    rep,
    checkedInAt,
    merchVisiblePhotos.length,
    vibesScore,
    numberOfBudtenders,
  ]);

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  function advance() {
    if (stepIdx < STEPS.length - 1) {
      setStep(STEPS[stepIdx + 1].key);
      window.scrollTo({top: 0, behavior: 'smooth'});
    } else {
      submit();
    }
  }
  function back() {
    if (stepIdx > 0) setStep(STEPS[stepIdx - 1].key);
  }

  function submit() {
    if (!rep) return;
    const form = new FormData();
    form.set('repId', rep.id);
    form.set('repName', rep.full_name);
    form.set('accountId', accountId);
    form.set('accountName', accountName);
    form.set('accountCity', accountCity);
    form.set('accountState', accountState);
    form.set('visitDate', new Date().toISOString().slice(0, 10));
    form.set('visitType', visitType);
    if (checkedInAt) form.set('checkedInAt', checkedInAt);
    form.set('checkedOutAt', new Date().toISOString());
    if (gps) {
      form.set('gpsLat', String(gps.lat));
      form.set('gpsLng', String(gps.lng));
    }
    // SKU stock + merch audit
    form.set('skuStock', JSON.stringify(skuStock));
    form.set('merchVisible', JSON.stringify(merchVisible));
    // Training
    form.set('decksTaught', JSON.stringify(decksTaught));
    form.set('budtendersTrained', JSON.stringify(budtenders));
    // Store staffing — current vs. originally loaded from Zoho. The action uses
    // the pair to decide whether to PATCH Zoho with an updated count.
    if (numberOfBudtenders != null)
      form.set('budtenderCount', String(numberOfBudtenders));
    if (numberOfBudtendersOrig != null)
      form.set('budtenderCountOriginal', String(numberOfBudtendersOrig));
    // Drop
    form.set('goodieItems', JSON.stringify(goodieItems));
    form.set('dropoffs', JSON.stringify(dropoffs));
    // Vibes
    if (vibesScore !== null) form.set('vibesScore', String(vibesScore));
    form.set('notesToSales', notesToSales);
    form.set('spokeWithManager', spokeWithManager ? 'true' : 'false');
    form.set('ugcPostUrl', ugcPostUrl);
    // Photos — multi-slot append
    merchVisiblePhotos.forEach((f, i) => form.append(`merchVisiblePhoto_${i}`, f));
    dropoffPhotos.forEach((f, i) => form.append(`dropoffPhoto_${i}`, f));
    if (selfiePhoto) form.set('selfiePhoto', selfiePhoto);

    fetcher.submit(form, {
      method: 'POST',
      action: '/api/vibes-visit-submit',
      encType: 'multipart/form-data',
    });
  }

  const submitted = fetcher.data?.ok;
  const submitting = fetcher.state === 'submitting' || fetcher.state === 'loading';

  // Goodie total
  const goodieTotal = goodieItems.reduce((s, g) => s + (g.cost || 0), 0);
  const dailyBudget = rep?.daily_goodie_budget || 60;
  const overBudget = goodieTotal > dailyBudget;

  return (
    <Shell>
      {!rep ? (
        <div style={{padding: 40, color: BRAND.gray}}>
          <div style={{fontFamily: TEKO, fontSize: 28, color: BRAND.white}}>
            No rep selected
          </div>
          <div style={{marginTop: 8}}>
            Seed vibes_reps in Supabase before running a check-in.
          </div>
        </div>
      ) : submitted ? (
        <SuccessPanel id={fetcher.data?.id} goodieTotal={fetcher.data?.goodieTotal ?? goodieTotal} />
      ) : (
        <>
          {/* Step tracker */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${STEPS.length}, 1fr)`,
              gap: 4,
              padding: '12px 12px 0',
            }}
          >
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                style={{
                  textAlign: 'center',
                  padding: '6px 4px',
                  borderRadius: 4,
                  background: i <= stepIdx ? s.color : BRAND.chip,
                  color: i <= stepIdx ? BRAND.black : BRAND.gray,
                  fontFamily: TEKO,
                  fontSize: 11,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  transition: 'background 0.2s',
                }}
              >
                {s.label}
              </div>
            ))}
          </div>

          <div style={{padding: '16px'}}>
            {/* Rep name + goodie budget tracker (persistent) */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 10px',
                background: BRAND.chip,
                border: `1px solid ${BRAND.line}`,
                borderRadius: 6,
                marginBottom: 14,
                fontSize: 12,
                fontFamily: BODY,
              }}
            >
              <div>
                <span style={{color: BRAND.gray}}>Rep:</span>{' '}
                <span style={{color: BRAND.white}}>{rep.full_name}</span>
              </div>
              <div>
                <span style={{color: BRAND.gray}}>Goodies:</span>{' '}
                <span
                  style={{
                    color: overBudget ? BRAND.red : BRAND.white,
                    fontFamily: TEKO,
                    fontSize: 14,
                  }}
                >
                  ${goodieTotal.toFixed(0)} / ${dailyBudget}
                </span>
              </div>
            </div>

            {/* Step content */}
            {step === 'arrive' && (
              <StepArrive
                accountId={accountId}
                accountName={accountName}
                accountCity={accountCity}
                accountState={accountState}
                accountQuery={accountQuery}
                setAccountQuery={setAccountQuery}
                accountResults={accountFetcher.data?.accounts || []}
                onPickAccount={(a) => {
                  setAccountId(a.id);
                  setAccountName(a.name);
                  setAccountCity(a.city || '');
                  setAccountState(a.state || 'NJ');
                  setAccountQuery('');
                  // Capture the budtender count from the Zoho search result so
                  // Step Train can render the live-training goal. Falls back to
                  // the useEffect fetcher if the search didn't include it.
                  const n =
                    typeof a.numberOfBudtenders === 'number'
                      ? a.numberOfBudtenders
                      : null;
                  setNumberOfBudtenders(n);
                  setNumberOfBudtendersOrig(n);
                }}
                visitType={visitType}
                setVisitType={setVisitType}
                gps={gps}
                gpsError={gpsError}
                checkedInAt={checkedInAt}
                onCheckIn={captureGps}
              />
            )}
            {step === 'audit' && (
              <StepAudit
                skuStock={skuStock}
                setSkuStock={setSkuStock}
                merchVisible={merchVisible}
                setMerchVisible={setMerchVisible}
                merchVisiblePhotos={merchVisiblePhotos}
                setMerchVisiblePhotos={setMerchVisiblePhotos}
              />
            )}
            {step === 'train' && (
              <StepTrain
                decks={decks}
                decksTaught={decksTaught}
                setDecksTaught={setDecksTaught}
                budtenders={budtenders}
                setBudtenders={setBudtenders}
                budName={budName}
                setBudName={setBudName}
                budEmail={budEmail}
                setBudEmail={setBudEmail}
                numberOfBudtenders={numberOfBudtenders}
                setNumberOfBudtenders={setNumberOfBudtenders}
                accountId={accountId}
                accountName={accountName}
              />
            )}
            {step === 'drop' && (
              <StepDrop
                goodieItems={goodieItems}
                setGoodieItems={setGoodieItems}
                goodItem={goodItem}
                setGoodItem={setGoodItem}
                goodCost={goodCost}
                setGoodCost={setGoodCost}
                dropoffs={dropoffs}
                setDropoffs={setDropoffs}
                dropoffPhotos={dropoffPhotos}
                setDropoffPhotos={setDropoffPhotos}
                dailyBudget={dailyBudget}
                total={goodieTotal}
              />
            )}
            {step === 'vibes' && (
              <StepVibes
                vibesScore={vibesScore}
                setVibesScore={setVibesScore}
                notesToSales={notesToSales}
                setNotesToSales={setNotesToSales}
                spokeWithManager={spokeWithManager}
                setSpokeWithManager={setSpokeWithManager}
                selfiePhoto={selfiePhoto}
                setSelfiePhoto={setSelfiePhoto}
                ugcPostUrl={ugcPostUrl}
                setUgcPostUrl={setUgcPostUrl}
              />
            )}

            {/* Why-blocked hint — lives just above the sticky action bar so
                Serena always sees *why* Continue is grey. */}
            {!canAdvance && !submitting ? (
              <div
                style={{
                  marginTop: 14,
                  padding: '8px 10px',
                  background: 'rgba(255,59,48,0.1)',
                  border: `1px solid ${BRAND.red}`,
                  borderRadius: 6,
                  color: BRAND.red,
                  fontFamily: BODY,
                  fontSize: 12,
                  fontWeight: 600,
                }}
              >
                {step === 'arrive'
                  ? 'Pick a store and tap Check In to continue.'
                  : step === 'audit'
                    ? 'Take at least 1 photo of Highsman merch in-store to continue.'
                    : step === 'train'
                      ? "Enter the number of budtenders on staff above — we can't continue without it."
                      : step === 'vibes'
                        ? 'Give this store a Vibes Score (0–10) to submit.'
                        : 'Please complete this step to continue.'}
              </div>
            ) : null}

            {/* Action bar */}
            <div
              style={{
                display: 'flex',
                gap: 8,
                marginTop: 22,
                position: 'sticky',
                bottom: 0,
                paddingBottom: 16,
                paddingTop: 8,
                background:
                  'linear-gradient(to top, rgba(0,0,0,1) 60%, rgba(0,0,0,0))',
              }}
            >
              {stepIdx > 0 ? (
                <button
                  type="button"
                  onClick={back}
                  style={secondaryBtn()}
                  disabled={submitting}
                >
                  ← Back
                </button>
              ) : null}
              <button
                type="button"
                onClick={advance}
                disabled={!canAdvance || submitting}
                style={primaryBtn(canAdvance && !submitting)}
              >
                {submitting
                  ? 'Submitting…'
                  : stepIdx === STEPS.length - 1
                    ? 'Submit Visit →'
                    : 'Continue →'}
              </button>
            </div>

            {fetcher.data && !fetcher.data.ok ? (
              <div
                style={{
                  marginTop: 10,
                  padding: 10,
                  background: 'rgba(255,59,48,0.1)',
                  border: `1px solid ${BRAND.red}`,
                  borderRadius: 6,
                  color: BRAND.red,
                  fontSize: 13,
                }}
              >
                {fetcher.data.message || 'Submit failed.'}
              </div>
            ) : null}
          </div>
        </>
      )}
    </Shell>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 · Arrive
// ─────────────────────────────────────────────────────────────────────────────
function StepArrive(props: {
  accountId: string;
  accountName: string;
  accountCity: string;
  accountState: string;
  accountQuery: string;
  setAccountQuery: (v: string) => void;
  accountResults: any[];
  onPickAccount: (a: any) => void;
  visitType:
    | 'first_visit'
    | 'rotation'
    | 'target_sample'
    | 'training'
    | 'other';
  setVisitType: (v: any) => void;
  gps: {lat: number; lng: number; ts: string} | null;
  gpsError: string | null;
  checkedInAt: string | null;
  onCheckIn: () => void;
}) {
  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="01" title="Arrive" color={BRAND.gold} />
      {/* Account */}
      <Field label="Dispensary" required>
        {props.accountName ? (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px 12px',
              background: BRAND.chip,
              border: `1px solid ${BRAND.line}`,
              borderRadius: 6,
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: TEKO,
                  fontSize: 20,
                  color: BRAND.white,
                  lineHeight: 1,
                }}
              >
                {props.accountName}
              </div>
              <div style={{color: BRAND.gray, fontSize: 11, marginTop: 2}}>
                {[props.accountCity, props.accountState].filter(Boolean).join(', ')}
              </div>
            </div>
            <button
              type="button"
              onClick={() =>
                props.onPickAccount({
                  id: '',
                  name: '',
                  city: '',
                  state: 'NJ',
                })
              }
              style={{
                background: 'transparent',
                color: BRAND.gray,
                border: `1px solid ${BRAND.line}`,
                padding: '4px 10px',
                borderRadius: 4,
                fontFamily: TEKO,
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              CHANGE
            </button>
          </div>
        ) : (
          <>
            <input
              type="search"
              value={props.accountQuery}
              onChange={(e) => props.setAccountQuery(e.target.value)}
              placeholder="Search NJ dispensary…"
              style={inputStyle()}
            />
            {props.accountResults.length > 0 && props.accountQuery.length >= 3 ? (
              <div
                style={{
                  marginTop: 6,
                  maxHeight: 220,
                  overflowY: 'auto',
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 6,
                  background: BRAND.chip,
                }}
              >
                {props.accountResults.slice(0, 10).map((a: any) => (
                  <button
                    type="button"
                    key={a.id}
                    onClick={() => props.onPickAccount(a)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '8px 10px',
                      background: 'transparent',
                      color: BRAND.white,
                      border: 'none',
                      borderBottom: `1px solid ${BRAND.line}`,
                      cursor: 'pointer',
                      fontFamily: BODY,
                    }}
                  >
                    <div style={{fontFamily: TEKO, fontSize: 16}}>{a.name}</div>
                    <div style={{fontSize: 11, color: BRAND.gray}}>
                      {[a.city, a.state].filter(Boolean).join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            ) : null}
          </>
        )}
      </Field>

      {/* Visit type */}
      <Field label="Visit type" required>
        <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
          {[
            ['rotation', 'Rotation'],
            ['first_visit', 'First Visit'],
            ['target_sample', 'Sampling Target'],
            ['training', 'Training'],
            ['other', 'Other'],
          ].map(([k, l]) => (
            <button
              type="button"
              key={k}
              onClick={() => props.setVisitType(k as any)}
              style={chipStyle(props.visitType === k)}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>

      {/* GPS check-in */}
      <Field label="GPS check-in" required>
        {props.checkedInAt && props.gps ? (
          <div
            style={{
              padding: 12,
              background: 'rgba(46,204,113,0.1)',
              border: `1px solid ${BRAND.green}`,
              borderRadius: 6,
            }}
          >
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 18,
                color: BRAND.green,
                letterSpacing: '0.08em',
              }}
            >
              ✓ CHECKED IN
            </div>
            <div
              style={{
                fontSize: 11,
                color: BRAND.gray,
                marginTop: 4,
                fontFamily: BODY,
              }}
            >
              {new Date(props.checkedInAt).toLocaleTimeString()} ·{' '}
              {props.gps.lat.toFixed(4)}, {props.gps.lng.toFixed(4)}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={props.onCheckIn}
            style={primaryBtn(true)}
          >
            Drop Pin Here
          </button>
        )}
        {props.gpsError ? (
          <div style={{color: BRAND.red, fontSize: 12, marginTop: 6}}>
            {props.gpsError}
          </div>
        ) : null}
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 · Audit
// ─────────────────────────────────────────────────────────────────────────────
// Two audit blocks, since dispensaries don't display live cannabis on open
// shelves:
//   1. SKUs in Stock      — format × strain, what the store has on hand
//   2. Merchandising      — Highsman POP/merch visible in-store (live list)
//   3. Merch Visible Pics — 1-3 photos of what's actually on the floor
// ─────────────────────────────────────────────────────────────────────────────
function StepAudit(props: {
  skuStock: SkuStockMap;
  setSkuStock: (v: SkuStockMap) => void;
  merchVisible: MerchCountMap;
  setMerchVisible: (v: MerchCountMap) => void;
  merchVisiblePhotos: File[];
  setMerchVisiblePhotos: (v: File[]) => void;
}) {
  function toggleStrain(formatSlug: string, strainSlug: string) {
    const next: SkuStockMap = {...props.skuStock};
    const row = {...(next[formatSlug] || {})};
    if (row[strainSlug]) delete row[strainSlug];
    else row[strainSlug] = true;
    if (Object.keys(row).length === 0) delete next[formatSlug];
    else next[formatSlug] = row;
    props.setSkuStock(next);
  }

  function setMerchCount(itemId: string, n: number) {
    const next: MerchCountMap = {...props.merchVisible};
    if (n <= 0) delete next[itemId];
    else next[itemId] = n;
    props.setMerchVisible(next);
  }

  const merchTotal = Object.values(props.merchVisible).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );

  return (
    <div style={{display: 'grid', gap: 18}}>
      <SectionTitle index="02" title="Audit" color={BRAND.purple} />

      {/* ─── SKUs in Stock ─────────────────────────────────────────────────── */}
      <div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 22,
            color: BRAND.white,
            textTransform: 'uppercase',
            letterSpacing: '0.02em',
            marginBottom: 4,
          }}
        >
          SKUs in Stock
        </div>
        <div style={{fontSize: 12, color: BRAND.gray, marginBottom: 10}}>
          Tap every strain the store has on hand today — what they can sell.
        </div>

        <div style={{display: 'grid', gap: 12}}>
          {FORMATS.map((fmt) => {
            const row = props.skuStock[fmt.slug] || {};
            const stockedCount = Object.values(row).filter(Boolean).length;
            return (
              <div
                key={fmt.slug}
                style={{
                  padding: '10px 12px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    marginBottom: 8,
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontFamily: TEKO,
                        fontSize: 20,
                        color: BRAND.white,
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em',
                        lineHeight: 1,
                      }}
                    >
                      {fmt.name}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: BRAND.gray,
                        marginTop: 2,
                      }}
                    >
                      {fmt.sizeLabel}
                    </div>
                  </div>
                  <div
                    style={{
                      fontFamily: TEKO,
                      fontSize: 14,
                      color: stockedCount > 0 ? BRAND.gold : BRAND.gray,
                      letterSpacing: '0.12em',
                    }}
                  >
                    {stockedCount}/{STRAINS.length} IN
                  </div>
                </div>

                <div style={{display: 'grid', gap: 4}}>
                  {STRAINS.map((s) => {
                    const on = Boolean(row[s.slug]);
                    return (
                      <button
                        type="button"
                        key={s.slug}
                        onClick={() => toggleStrain(fmt.slug, s.slug)}
                        style={{
                          textAlign: 'left',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          padding: '8px 10px',
                          background: on
                            ? 'rgba(46,204,113,0.15)'
                            : 'transparent',
                          border: `1px solid ${on ? BRAND.green : BRAND.line}`,
                          borderRadius: 6,
                          color: BRAND.white,
                          cursor: 'pointer',
                          fontFamily: BODY,
                          fontSize: 13,
                        }}
                      >
                        <span style={{display: 'flex', gap: 6, alignItems: 'center'}}>
                          <span
                            style={{
                              display: 'inline-block',
                              width: 16,
                              textAlign: 'center',
                              color: on ? BRAND.green : BRAND.gray,
                              fontFamily: TEKO,
                              fontSize: 14,
                            }}
                          >
                            {on ? '✓' : ''}
                          </span>
                          <span style={{color: BRAND.white}}>{s.name}</span>
                          <span
                            style={{
                              color: BRAND.gray,
                              fontSize: 11,
                              fontFamily: TEKO,
                              letterSpacing: '0.1em',
                              marginLeft: 4,
                            }}
                          >
                            {s.profile.toUpperCase()}
                          </span>
                        </span>
                        <span
                          style={{
                            fontFamily: TEKO,
                            fontSize: 11,
                            color: on ? BRAND.green : BRAND.gray,
                            letterSpacing: '0.12em',
                          }}
                        >
                          {on ? 'STOCKED' : 'TAP TO MARK'}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Merchandising Visible ──────────────────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 22,
              color: BRAND.white,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Merchandising Visible
          </div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 14,
              color: merchTotal > 0 ? BRAND.gold : BRAND.gray,
              letterSpacing: '0.12em',
            }}
          >
            {merchTotal} TOTAL
          </div>
        </div>
        <div style={{fontSize: 12, color: BRAND.gray, marginBottom: 10}}>
          Count every Highsman merch piece you can see on the floor. Live list
          — stays in sync with /retail.
        </div>

        <div style={{display: 'grid', gap: 12}}>
          {CATEGORIES.map((cat) => {
            const items = MERCH_ITEMS.filter((i) => i.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div
                key={cat.id}
                style={{
                  padding: '10px 12px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    color: BRAND.purple,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  {cat.label}
                </div>
                <div style={{display: 'grid', gap: 4}}>
                  {items.map((m) => {
                    const q = props.merchVisible[m.id] || 0;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 10px',
                          background: q > 0 ? 'rgba(184,132,255,0.10)' : 'transparent',
                          border: `1px solid ${q > 0 ? BRAND.purple : BRAND.line}`,
                          borderRadius: 6,
                        }}
                      >
                        <div style={{fontSize: 13, flex: 1}}>
                          <div style={{color: BRAND.white}}>{m.name}</div>
                          {m.dimensions ? (
                            <div style={{color: BRAND.gray, fontSize: 10}}>
                              {m.dimensions}
                            </div>
                          ) : null}
                        </div>
                        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                          <button
                            type="button"
                            onClick={() => setMerchCount(m.id, Math.max(0, q - 1))}
                            style={qtyBtn()}
                          >
                            −
                          </button>
                          <span
                            style={{
                              width: 26,
                              textAlign: 'center',
                              fontFamily: TEKO,
                              fontSize: 18,
                              color: q > 0 ? BRAND.white : BRAND.gray,
                            }}
                          >
                            {q}
                          </span>
                          <button
                            type="button"
                            onClick={() => setMerchCount(m.id, q + 1)}
                            style={qtyBtn()}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Merch Visible Photos ───────────────────────────────────────────── */}
      <Field
        label={`Merch visible photos (${props.merchVisiblePhotos.length}/3)`}
        required
      >
        <div style={{fontSize: 11, color: BRAND.gray, marginBottom: 6, fontFamily: BODY}}>
          Snap at least 1, up to 3 pics of Highsman merchandising in this store —
          stands, cutouts, signs, banners. Proof it's on the floor.
        </div>
        <MultiPhotoPicker
          files={props.merchVisiblePhotos}
          setFiles={props.setMerchVisiblePhotos}
          minRequired={1}
          maxAllowed={3}
          label="Snap merch in-store"
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 · Train
// ─────────────────────────────────────────────────────────────────────────────
function StepTrain(props: {
  decks: Deck[];
  decksTaught: string[];
  setDecksTaught: (v: string[]) => void;
  budtenders: Array<{name: string; email: string}>;
  setBudtenders: (v: Array<{name: string; email: string}>) => void;
  budName: string;
  setBudName: (v: string) => void;
  budEmail: string;
  setBudEmail: (v: string) => void;
  numberOfBudtenders: number | null;
  setNumberOfBudtenders: (n: number | null) => void;
  accountId: string;
  accountName: string;
}) {
  function toggleDeck(slug: string) {
    const set = new Set(props.decksTaught);
    set.has(slug) ? set.delete(slug) : set.add(slug);
    props.setDecksTaught(Array.from(set));
  }

  function addBud() {
    if (!props.budName.trim()) return;
    props.setBudtenders([
      ...props.budtenders,
      {name: props.budName.trim(), email: props.budEmail.trim()},
    ]);
    props.setBudName('');
    props.setBudEmail('');
  }
  function rmBud(i: number) {
    props.setBudtenders(props.budtenders.filter((_, j) => j !== i));
  }

  // Progress: Trained X / Y, Emails captured Z / Y
  const trainedCount = props.budtenders.length;
  const emailCount = props.budtenders.filter((b) =>
    b.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),
  ).length;
  const goal = props.numberOfBudtenders ?? 0;
  const goalKnown = typeof props.numberOfBudtenders === 'number';
  const emailPct = goal > 0 ? Math.min(100, (emailCount / goal) * 100) : 0;
  const trainedPct = goal > 0 ? Math.min(100, (trainedCount / goal) * 100) : 0;

  // Per-store self-signup link — budtenders you couldn't catch in person can
  // sign themselves up and get credited to this store.
  const selfSignupLink = props.accountId
    ? `https://www.highsman.com/budtender-training?store=${encodeURIComponent(
        props.accountId,
      )}&storeName=${encodeURIComponent(props.accountName || '')}`
    : null;

  function copySignupLink() {
    if (!selfSignupLink) return;
    try {
      navigator.clipboard.writeText(selfSignupLink);
    } catch {
      // ignore — fallback is below (manual select)
    }
  }

  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="03" title="Train" color={BRAND.green} />

      {/* ─── Training Goal + Progress ──────────────────────────────────────── */}
      {/*
        Required gate: if Zoho didn't return a budtender count we go full red
        to make it impossible to miss. The parent canAdvance() also blocks
        Continue until this is filled in.
      */}
      <div
        style={{
          padding: 14,
          background: goalKnown
            ? 'rgba(46,204,113,0.08)'
            : 'rgba(255,59,48,0.12)',
          border: `2px solid ${goalKnown ? BRAND.green : BRAND.red}`,
          borderRadius: 8,
          boxShadow: goalKnown
            ? 'none'
            : `0 0 0 4px rgba(255,59,48,0.15)`,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              color: goalKnown ? BRAND.green : BRAND.red,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Training Goal
          </div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 11,
              color: goalKnown ? BRAND.gray : BRAND.red,
              letterSpacing: '0.1em',
              fontWeight: goalKnown ? 400 : 700,
            }}
          >
            {goalKnown ? 'EDITABLE' : '★ REQUIRED'}
          </div>
        </div>

        {!goalKnown ? (
          <div
            style={{
              marginBottom: 10,
              padding: '8px 10px',
              background: 'rgba(0,0,0,0.35)',
              border: `1px dashed ${BRAND.red}`,
              borderRadius: 6,
              color: BRAND.white,
              fontFamily: BODY,
              fontSize: 13,
              lineHeight: 1.4,
            }}
          >
            <strong style={{color: BRAND.red}}>
              Ask the manager how many budtenders work here.
            </strong>{' '}
            We need this number to set a training target — it saves back to
            Zoho automatically. You can't continue until it's filled in.
          </div>
        ) : null}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 10,
          }}
        >
          <div style={{color: BRAND.gray, fontSize: 12, fontFamily: BODY}}>
            Budtenders on staff:
          </div>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={99}
            value={props.numberOfBudtenders ?? ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === '') {
                props.setNumberOfBudtenders(null);
                return;
              }
              const n = Math.max(0, Math.min(99, Number(v)));
              props.setNumberOfBudtenders(Number.isFinite(n) ? n : null);
            }}
            placeholder="?"
            autoFocus={!goalKnown}
            style={{
              width: 64,
              padding: '6px 8px',
              background: BRAND.black,
              border: `2px solid ${goalKnown ? BRAND.green : BRAND.red}`,
              color: BRAND.white,
              borderRadius: 6,
              fontFamily: TEKO,
              fontSize: 22,
              textAlign: 'center',
              outline: 'none',
            }}
          />
          {!goalKnown ? (
            <div
              style={{
                fontSize: 12,
                color: BRAND.red,
                fontFamily: BODY,
                fontWeight: 600,
              }}
            >
              ← required before Continue
            </div>
          ) : null}
        </div>

        {/* Progress bars */}
        <ProgressBar
          label="Trained live"
          current={trainedCount}
          goal={goal}
          pct={trainedPct}
          color={BRAND.green}
          fallback={!goalKnown ? `${trainedCount} trained` : undefined}
        />
        <div style={{height: 8}} />
        <ProgressBar
          label="Emails captured"
          current={emailCount}
          goal={goal}
          pct={emailPct}
          color={BRAND.gold}
          fallback={!goalKnown ? `${emailCount} emails` : undefined}
        />

        <div
          style={{
            marginTop: 10,
            fontSize: 11,
            color: BRAND.gray,
            fontFamily: BODY,
            lineHeight: 1.4,
          }}
        >
          Push for every budtender email you can get — they go{' '}
          <span style={{color: BRAND.gold}}>straight into Budtender Training Camp</span>.
          No email = no long-term relationship.
        </div>
      </div>

      {/* ─── Decks taught ──────────────────────────────────────────────────── */}
      <Field label="Decks taught (select any)">
        <div style={{display: 'grid', gap: 6}}>
          {props.decks.map((d) => {
            const on = props.decksTaught.includes(d.module_slug);
            return (
              <button
                type="button"
                key={d.id}
                onClick={() => toggleDeck(d.module_slug)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  background: on ? 'rgba(46,204,113,0.15)' : BRAND.chip,
                  border: `1px solid ${on ? BRAND.green : BRAND.line}`,
                  color: BRAND.white,
                  borderRadius: 6,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'baseline',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <span
                  style={{
                    fontFamily: TEKO,
                    fontSize: 16,
                    textTransform: 'uppercase',
                  }}
                >
                  {d.title}
                </span>
                <span
                  style={{
                    fontFamily: TEKO,
                    fontSize: 11,
                    color: on ? BRAND.green : BRAND.gray,
                    letterSpacing: '0.12em',
                  }}
                >
                  {on ? 'TAUGHT ✓' : `${d.duration_minutes} MIN`}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      {/* ─── Budtenders trained (live) + email capture ──────────────────────── */}
      <Field label="Budtenders trained (capture every email)">
        <div style={{display: 'grid', gap: 6}}>
          <input
            type="text"
            value={props.budName}
            onChange={(e) => props.setBudName(e.target.value)}
            placeholder="First name (or nickname)"
            style={inputStyle()}
          />
          <input
            type="email"
            inputMode="email"
            autoCapitalize="off"
            autoCorrect="off"
            value={props.budEmail}
            onChange={(e) => props.setBudEmail(e.target.value)}
            placeholder="Email — auto-enrolls in Training Camp"
            style={{
              ...inputStyle(),
              borderColor: props.budEmail ? BRAND.gold : BRAND.line,
            }}
          />
          <button
            type="button"
            onClick={addBud}
            disabled={!props.budName.trim()}
            style={{
              ...secondaryBtn(),
              borderColor: props.budName.trim() ? BRAND.green : BRAND.line,
              color: props.budName.trim() ? BRAND.green : BRAND.gray,
              cursor: props.budName.trim() ? 'pointer' : 'not-allowed',
            }}
          >
            + Add Budtender
          </button>
        </div>

        {props.budtenders.length > 0 ? (
          <div style={{marginTop: 10, display: 'grid', gap: 4}}>
            {props.budtenders.map((b, i) => {
              const hasEmail = Boolean(
                b.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email),
              );
              return (
                <div
                  key={i}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 10px',
                    background: hasEmail
                      ? 'rgba(245,228,0,0.08)'
                      : BRAND.chip,
                    border: `1px solid ${hasEmail ? BRAND.gold : BRAND.line}`,
                    borderRadius: 6,
                    fontSize: 12,
                  }}
                >
                  <div style={{flex: 1, minWidth: 0}}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <span style={{color: BRAND.white, fontWeight: 600}}>
                        {b.name}
                      </span>
                      {hasEmail ? (
                        <span
                          style={{
                            fontFamily: TEKO,
                            fontSize: 10,
                            color: BRAND.gold,
                            letterSpacing: '0.14em',
                            padding: '1px 6px',
                            background: 'rgba(245,228,0,0.15)',
                            borderRadius: 3,
                          }}
                        >
                          TRAINING CAMP ✓
                        </span>
                      ) : (
                        <span
                          style={{
                            fontFamily: TEKO,
                            fontSize: 10,
                            color: BRAND.gray,
                            letterSpacing: '0.14em',
                          }}
                        >
                          NO EMAIL
                        </span>
                      )}
                    </div>
                    {b.email ? (
                      <div
                        style={{
                          color: BRAND.gray,
                          fontSize: 11,
                          marginTop: 2,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {b.email}
                      </div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => rmBud(i)}
                    style={{
                      background: 'transparent',
                      color: BRAND.gray,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: TEKO,
                      marginLeft: 8,
                    }}
                    aria-label="Remove budtender"
                  >
                    ✕
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
      </Field>

      {/* ─── Self-signup link for budtenders not on shift ──────────────────── */}
      {selfSignupLink ? (
        <div
          style={{
            padding: 12,
            background: BRAND.chip,
            border: `1px dashed ${BRAND.line}`,
            borderRadius: 8,
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 13,
              color: BRAND.gold,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}
          >
            Couldn't catch everyone?
          </div>
          <div
            style={{
              fontSize: 11,
              color: BRAND.gray,
              marginBottom: 8,
              fontFamily: BODY,
            }}
          >
            Share this link with the manager or drop it in the breakroom —
            signups credit this store.
          </div>
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
            }}
          >
            <input
              type="text"
              readOnly
              value={selfSignupLink}
              onFocus={(e) => e.currentTarget.select()}
              style={{
                ...inputStyle(),
                flex: 1,
                fontSize: 11,
                color: BRAND.gray,
              }}
            />
            <button
              type="button"
              onClick={copySignupLink}
              style={{
                ...secondaryBtn(),
                padding: '10px 14px',
                fontSize: 13,
              }}
            >
              Copy
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// Training-goal progress bar for Step Train.
function ProgressBar({
  label,
  current,
  goal,
  pct,
  color,
  fallback,
}: {
  label: string;
  current: number;
  goal: number;
  pct: number;
  color: string;
  fallback?: string;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 4,
        }}
      >
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 12,
            color: BRAND.gray,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: TEKO,
            fontSize: 16,
            color,
            letterSpacing: '0.04em',
          }}
        >
          {fallback || `${current} / ${goal}`}
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 3,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${Math.max(0, Math.min(100, pct))}%`,
            height: '100%',
            background: color,
            transition: 'width 0.25s ease',
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 · Drop (goodies + dropped-off merch + dropoff photos)
// ─────────────────────────────────────────────────────────────────────────────
// Tracks what the rep physically handed over today so we can keep per-store
// merch inventory accurate over time. Items + categories come from the shared
// MERCH_ITEMS catalog in app/data/merch-catalog.ts, so anything added to
// /retail automatically shows up here.
// ─────────────────────────────────────────────────────────────────────────────
function StepDrop(props: {
  goodieItems: Array<{item: string; cost: number}>;
  setGoodieItems: (v: Array<{item: string; cost: number}>) => void;
  goodItem: string;
  setGoodItem: (v: string) => void;
  goodCost: string;
  setGoodCost: (v: string) => void;
  dropoffs: MerchCountMap;
  setDropoffs: (v: MerchCountMap) => void;
  dropoffPhotos: File[];
  setDropoffPhotos: (v: File[]) => void;
  dailyBudget: number;
  total: number;
}) {
  function addGoodie() {
    const cost = Number(props.goodCost);
    if (!props.goodItem.trim() || !Number.isFinite(cost) || cost < 0) return;
    props.setGoodieItems([
      ...props.goodieItems,
      {item: props.goodItem.trim(), cost},
    ]);
    props.setGoodItem('');
    props.setGoodCost('');
  }
  function rmGoodie(i: number) {
    props.setGoodieItems(props.goodieItems.filter((_, j) => j !== i));
  }

  function setDropoffCount(itemId: string, n: number) {
    const next: MerchCountMap = {...props.dropoffs};
    if (n <= 0) delete next[itemId];
    else next[itemId] = n;
    props.setDropoffs(next);
  }

  const over = props.total > props.dailyBudget;
  const dropoffTotal = Object.values(props.dropoffs).reduce(
    (s, n) => s + (Number(n) || 0),
    0,
  );

  return (
    <div style={{display: 'grid', gap: 18}}>
      <SectionTitle index="04" title="Drop" color={BRAND.orange} />

      {/* ─── Goodies ────────────────────────────────────────────────────────── */}
      <Field label={`Goodies dropped ($${props.total.toFixed(0)} / $${props.dailyBudget})`}>
        <div style={{display: 'flex', gap: 6}}>
          <input
            type="text"
            value={props.goodItem}
            onChange={(e) => props.setGoodItem(e.target.value)}
            placeholder="Pizza, donuts, bagels…"
            style={{...inputStyle(), flex: 3}}
          />
          <input
            type="number"
            inputMode="decimal"
            value={props.goodCost}
            onChange={(e) => props.setGoodCost(e.target.value)}
            placeholder="$"
            style={{...inputStyle(), flex: 1}}
          />
          <button type="button" onClick={addGoodie} style={secondaryBtn()}>
            Add
          </button>
        </div>
        {over ? (
          <div
            style={{
              marginTop: 6,
              fontSize: 11,
              color: BRAND.red,
              fontFamily: BODY,
            }}
          >
            Over daily budget — note it for Reid in Vibes step.
          </div>
        ) : null}
        {props.goodieItems.length > 0 ? (
          <div style={{marginTop: 8, display: 'grid', gap: 4}}>
            {props.goodieItems.map((g, i) => (
              <div
                key={i}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                <span style={{color: BRAND.white}}>{g.item}</span>
                <span>
                  <span style={{color: BRAND.gold, fontFamily: TEKO, fontSize: 14}}>
                    ${g.cost.toFixed(2)}
                  </span>
                  <button
                    type="button"
                    onClick={() => rmGoodie(i)}
                    style={{
                      background: 'transparent',
                      color: BRAND.gray,
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: TEKO,
                      marginLeft: 8,
                    }}
                  >
                    ✕
                  </button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </Field>

      {/* ─── Dropped Off ────────────────────────────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 4,
          }}
        >
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 22,
              color: BRAND.white,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
            }}
          >
            Dropped Off
          </div>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 14,
              color: dropoffTotal > 0 ? BRAND.orange : BRAND.gray,
              letterSpacing: '0.12em',
            }}
          >
            {dropoffTotal} DROPPED
          </div>
        </div>
        <div style={{fontSize: 12, color: BRAND.gray, marginBottom: 10}}>
          What you handed off today. Counts update this store's merch inventory
          so we always know who has what on the floor.
        </div>

        <div style={{display: 'grid', gap: 12}}>
          {CATEGORIES.map((cat) => {
            const items = MERCH_ITEMS.filter((i) => i.category === cat.id);
            if (items.length === 0) return null;
            return (
              <div
                key={cat.id}
                style={{
                  padding: '10px 12px',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    fontFamily: TEKO,
                    fontSize: 13,
                    color: BRAND.orange,
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    marginBottom: 8,
                  }}
                >
                  {cat.label}
                </div>
                <div style={{display: 'grid', gap: 4}}>
                  {items.map((m) => {
                    const q = props.dropoffs[m.id] || 0;
                    return (
                      <div
                        key={m.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 8,
                          padding: '8px 10px',
                          background: q > 0 ? 'rgba(255,138,0,0.12)' : 'transparent',
                          border: `1px solid ${q > 0 ? BRAND.orange : BRAND.line}`,
                          borderRadius: 6,
                        }}
                      >
                        <div style={{fontSize: 13, flex: 1}}>
                          <div style={{color: BRAND.white}}>{m.name}</div>
                          {m.dimensions ? (
                            <div style={{color: BRAND.gray, fontSize: 10}}>
                              {m.dimensions}
                            </div>
                          ) : null}
                        </div>
                        <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                          <button
                            type="button"
                            onClick={() => setDropoffCount(m.id, Math.max(0, q - 1))}
                            style={qtyBtn()}
                          >
                            −
                          </button>
                          <span
                            style={{
                              width: 26,
                              textAlign: 'center',
                              fontFamily: TEKO,
                              fontSize: 18,
                              color: q > 0 ? BRAND.white : BRAND.gray,
                            }}
                          >
                            {q}
                          </span>
                          <button
                            type="button"
                            onClick={() => setDropoffCount(m.id, q + 1)}
                            style={qtyBtn()}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ─── Dropoff Photos ─────────────────────────────────────────────────── */}
      <Field label={`Dropoff photos (${props.dropoffPhotos.length}/3)`}>
        <div style={{fontSize: 11, color: BRAND.gray, marginBottom: 6, fontFamily: BODY}}>
          Optional — up to 3 shots of what was dropped off. Helps Reid verify
          per-store inventory.
        </div>
        <MultiPhotoPicker
          files={props.dropoffPhotos}
          setFiles={props.setDropoffPhotos}
          maxAllowed={3}
          label="Snap what you dropped"
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 · Vibes (score, notes, selfie, UGC)
// ─────────────────────────────────────────────────────────────────────────────
function StepVibes(props: {
  vibesScore: number | null;
  setVibesScore: (n: number | null) => void;
  notesToSales: string;
  setNotesToSales: (v: string) => void;
  spokeWithManager: boolean;
  setSpokeWithManager: (b: boolean) => void;
  selfiePhoto: File | null;
  setSelfiePhoto: (f: File | null) => void;
  ugcPostUrl: string;
  setUgcPostUrl: (v: string) => void;
}) {
  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="05" title="Vibes" color={BRAND.gold} />
      <Field label="Vibes score (1–10)" required>
        <div style={{display: 'flex', gap: 4, flexWrap: 'wrap'}}>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => props.setVibesScore(n)}
              style={{
                width: 36,
                height: 36,
                borderRadius: 6,
                border: `1px solid ${props.vibesScore === n ? BRAND.gold : BRAND.line}`,
                background: props.vibesScore === n ? BRAND.gold : BRAND.chip,
                color: props.vibesScore === n ? BRAND.black : BRAND.white,
                fontFamily: TEKO,
                fontSize: 18,
                cursor: 'pointer',
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Spoke with manager?">
        <div style={{display: 'flex', gap: 6}}>
          <button
            type="button"
            onClick={() => props.setSpokeWithManager(true)}
            style={chipStyle(props.spokeWithManager)}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => props.setSpokeWithManager(false)}
            style={chipStyle(!props.spokeWithManager)}
          >
            No
          </button>
        </div>
      </Field>

      <Field label="Notes for sales team">
        <textarea
          value={props.notesToSales}
          onChange={(e) => props.setNotesToSales(e.target.value)}
          rows={4}
          placeholder="Anything the Spark Team / Reid needs to know — reorders, objections, new buyer…"
          style={{
            ...inputStyle(),
            height: 'auto',
            resize: 'vertical',
            fontFamily: BODY,
          }}
        />
      </Field>

      <Field label="Selfie with the team (optional)">
        <PhotoPicker
          file={props.selfiePhoto}
          setFile={props.setSelfiePhoto}
          label="Quick team pic"
        />
      </Field>

      <Field label="Tagged @highsman in a post? paste link →">
        <input
          type="url"
          value={props.ugcPostUrl}
          onChange={(e) => props.setUgcPostUrl(e.target.value)}
          placeholder="https://instagram.com/p/…"
          style={inputStyle()}
        />
        <div
          style={{
            fontSize: 10,
            color: BRAND.gray,
            marginTop: 4,
            fontFamily: BODY,
          }}
        >
          Only posts that tag <span style={{color: BRAND.gold}}>@highsman</span> go into
          the review queue for reshare — posts on your own handle are 100% yours.
        </div>
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Success
// ─────────────────────────────────────────────────────────────────────────────
function SuccessPanel({
  id,
  goodieTotal,
}: {
  id?: string;
  goodieTotal: number;
}) {
  return (
    <div style={{padding: 28}}>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 64,
          color: BRAND.gold,
          lineHeight: 0.9,
          letterSpacing: '0.02em',
        }}
      >
        VIBES
        <br />
        LOGGED.
      </div>
      <div
        style={{
          color: BRAND.gray,
          fontSize: 14,
          marginTop: 12,
          fontFamily: BODY,
        }}
      >
        Visit saved. Photos live in R2. Training + goodie logs posted to
        Supabase. Ref: {id ? id.slice(-8) : '—'}.
      </div>
      <div style={{marginTop: 22, display: 'grid', gap: 8}}>
        <Link to="/vibes" style={{...primaryBtn(true), textAlign: 'center'}}>
          Back to Route
        </Link>
        <Link
          to="/vibes/visit/new"
          reloadDocument
          style={{...secondaryBtn(), textAlign: 'center'}}
        >
          Start Another Visit
        </Link>
      </div>
      {goodieTotal > 0 ? (
        <div
          style={{
            marginTop: 20,
            padding: 12,
            background: BRAND.chip,
            border: `1px solid ${BRAND.line}`,
            borderRadius: 6,
            color: BRAND.gray,
            fontSize: 12,
          }}
        >
          Goodie spend on this stop:{' '}
          <span style={{color: BRAND.gold, fontFamily: TEKO, fontSize: 16}}>
            ${goodieTotal.toFixed(2)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shell + primitives
// ─────────────────────────────────────────────────────────────────────────────
function Shell({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
      }}
    >
      <header
        style={{
          padding: '10px 16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderBottom: `1px solid ${BRAND.line}`,
          background: BRAND.black,
          position: 'sticky',
          top: 0,
          zIndex: 10,
        }}
      >
        <Link
          to="/vibes"
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 18,
            textDecoration: 'none',
            letterSpacing: '0.08em',
          }}
        >
          ← VIBES
        </Link>
        <img src={LOGO_WHITE} alt="Highsman" style={{height: 40, width: 'auto'}} />
        <div style={{width: 40}} />
      </header>
      {children}
    </div>
  );
}

function SectionTitle({
  index,
  title,
  color,
}: {
  index: string;
  title: string;
  color: string;
}) {
  return (
    <div>
      <div
        style={{
          color,
          fontFamily: TEKO,
          fontSize: 11,
          letterSpacing: '0.2em',
        }}
      >
        STEP {index}
      </div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 36,
          color: BRAND.white,
          textTransform: 'uppercase',
          letterSpacing: '0.02em',
          lineHeight: 1,
          marginTop: 2,
        }}
      >
        {title}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          fontFamily: TEKO,
          fontSize: 13,
          color: BRAND.gray,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}{' '}
        {required ? <span style={{color: BRAND.gold}}>*</span> : null}
      </div>
      {children}
    </div>
  );
}

function PhotoPicker({
  file,
  setFile,
  label,
}: {
  file: File | null;
  setFile: (f: File | null) => void;
  label: string;
}) {
  return (
    <div
      style={{
        padding: 12,
        background: BRAND.chip,
        border: `1px dashed ${BRAND.line}`,
        borderRadius: 6,
        textAlign: 'center',
      }}
    >
      {file ? (
        <div>
          <div style={{color: BRAND.green, fontSize: 13, marginBottom: 6}}>
            ✓ {file.name}
          </div>
          <button
            type="button"
            onClick={() => setFile(null)}
            style={{
              background: 'transparent',
              color: BRAND.gray,
              border: `1px solid ${BRAND.line}`,
              padding: '4px 12px',
              borderRadius: 4,
              fontFamily: TEKO,
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            REPLACE
          </button>
        </div>
      ) : (
        <label
          style={{
            display: 'block',
            cursor: 'pointer',
            color: BRAND.gray,
            fontSize: 12,
          }}
        >
          <div style={{fontSize: 32, marginBottom: 4}}>📷</div>
          <div>{label}</div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
            style={{display: 'none'}}
          />
        </label>
      )}
    </div>
  );
}

function MultiPhotoPicker({
  files,
  setFiles,
  minRequired,
  maxAllowed,
  label,
}: {
  files: File[];
  setFiles: (f: File[]) => void;
  minRequired?: number;
  maxAllowed: number;
  label: string;
}) {
  const canAddMore = files.length < maxAllowed;

  function addFiles(newFiles: FileList | null) {
    if (!newFiles || newFiles.length === 0) return;
    const toAdd = Array.from(newFiles).slice(0, maxAllowed - files.length);
    setFiles([...files, ...toAdd]);
  }

  function removeAt(i: number) {
    setFiles(files.filter((_, j) => j !== i));
  }

  return (
    <div style={{display: 'grid', gap: 8}}>
      {files.length > 0 ? (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 6,
          }}
        >
          {files.map((f, i) => {
            const url = typeof URL !== 'undefined' ? URL.createObjectURL(f) : '';
            return (
              <div
                key={`${f.name}-${i}`}
                style={{
                  position: 'relative',
                  aspectRatio: '1 / 1',
                  background: BRAND.chip,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 6,
                  overflow: 'hidden',
                }}
              >
                {url ? (
                  <img
                    src={url}
                    alt={f.name}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : null}
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    border: 'none',
                    background: 'rgba(0,0,0,0.7)',
                    color: BRAND.white,
                    fontFamily: TEKO,
                    fontSize: 14,
                    cursor: 'pointer',
                    lineHeight: 1,
                  }}
                  aria-label="Remove photo"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {canAddMore ? (
        <label
          style={{
            display: 'block',
            padding: 12,
            background: BRAND.chip,
            border: `1px dashed ${
              minRequired && files.length < minRequired ? BRAND.gold : BRAND.line
            }`,
            borderRadius: 6,
            textAlign: 'center',
            cursor: 'pointer',
            color: BRAND.gray,
            fontSize: 12,
          }}
        >
          <div style={{fontSize: 28, marginBottom: 2}}>📷</div>
          <div>
            {label}{' '}
            <span style={{color: BRAND.gray, fontSize: 11}}>
              ({files.length}/{maxAllowed})
            </span>
          </div>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            onChange={(e) => {
              addFiles(e.target.files);
              // Reset so re-picking same file still triggers change
              e.target.value = '';
            }}
            style={{display: 'none'}}
          />
        </label>
      ) : (
        <div
          style={{
            padding: 8,
            background: BRAND.chip,
            border: `1px solid ${BRAND.line}`,
            borderRadius: 6,
            textAlign: 'center',
            color: BRAND.gray,
            fontSize: 11,
            fontFamily: BODY,
          }}
        >
          Max {maxAllowed} photos reached — remove one to add another.
        </div>
      )}

      {minRequired && files.length < minRequired ? (
        <div style={{fontSize: 11, color: BRAND.gold, fontFamily: BODY}}>
          Need at least {minRequired} photo{minRequired > 1 ? 's' : ''} to
          continue.
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    background: BRAND.chip,
    border: `1px solid ${BRAND.line}`,
    color: BRAND.white,
    borderRadius: 6,
    fontFamily: BODY,
    fontSize: 14,
    outline: 'none',
  };
}

function chipStyle(active: boolean): React.CSSProperties {
  return {
    background: active ? BRAND.gold : BRAND.chip,
    color: active ? BRAND.black : BRAND.white,
    border: `1px solid ${active ? BRAND.gold : BRAND.line}`,
    padding: '6px 12px',
    borderRadius: 4,
    fontFamily: TEKO,
    fontSize: 13,
    letterSpacing: '0.06em',
    cursor: 'pointer',
  };
}

function primaryBtn(enabled: boolean): React.CSSProperties {
  return {
    flex: 1,
    padding: '12px 14px',
    background: enabled ? BRAND.gold : BRAND.chip,
    color: enabled ? BRAND.black : BRAND.gray,
    border: 'none',
    borderRadius: 6,
    fontFamily: TEKO,
    fontSize: 18,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: enabled ? 'pointer' : 'not-allowed',
    textDecoration: 'none',
    textAlign: 'center',
    display: 'block',
  };
}

function secondaryBtn(): React.CSSProperties {
  return {
    padding: '12px 14px',
    background: 'transparent',
    color: BRAND.white,
    border: `1px solid ${BRAND.line}`,
    borderRadius: 6,
    fontFamily: TEKO,
    fontSize: 16,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    cursor: 'pointer',
  };
}

function qtyBtn(): React.CSSProperties {
  return {
    width: 28,
    height: 28,
    borderRadius: 4,
    border: `1px solid ${BRAND.line}`,
    background: BRAND.chip,
    color: BRAND.white,
    fontFamily: TEKO,
    fontSize: 16,
    cursor: 'pointer',
  };
}
