import {useEffect, useMemo, useState} from 'react';
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData, useSearchParams, useFetcher} from '@remix-run/react';

// ─────────────────────────────────────────────────────────────────────────────
// /vibes/visit/new — Vibes Team Check-In Flow (5 screens)
// ─────────────────────────────────────────────────────────────────────────────
// Sequence: Arrive → Audit → Train → Drop → Vibes → Submit
// Designed for phone, one-thumb friendly. Submits to /api/vibes-visit-submit.
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

type MerchItem = {
  id: string;
  item_slug: string;
  item_label: string;
  qty_on_hand: number;
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
  let merch: MerchItem[] = [];

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

      if (rep) {
        const mRes = await fetch(
          `${env.SUPABASE_URL}/rest/v1/merch_inventory?rep_id=eq.${rep.id}&select=id,item_slug,item_label,qty_on_hand&order=item_label.asc`,
          {
            headers: {
              apikey: env.SUPABASE_SERVICE_KEY,
              Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            },
          },
        );
        if (mRes.ok) merch = await mRes.json();
      }
    } catch (err) {
      console.warn('[vibes/visit/new] Supabase fetch failed', err);
    }
  }

  return json({decks, reps, rep, merch});
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

const SKUS = [
  'Hit Stick 0.5g — Indica',
  'Hit Stick 0.5g — Sativa',
  'Hit Stick 0.5g — Hybrid',
  'Pre-Roll 1.2g — Hall Pass',
  'Pre-Roll 1.2g — Triple Infusion',
  'Ground Game 7g',
];

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
  const {decks, reps, rep, merch} = useLoaderData<typeof loader>();
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
  const [skusOnShelf, setSkusOnShelf] = useState<string[]>([]);
  const [skusMissing, setSkusMissing] = useState<string[]>([]);
  const [shelfRating, setShelfRating] = useState<number | null>(null);
  const [shelfPhoto, setShelfPhoto] = useState<File | null>(null);
  const [beforePhoto, setBeforePhoto] = useState<File | null>(null);

  // Train
  const [decksTaught, setDecksTaught] = useState<string[]>([]);
  const [budtenders, setBudtenders] = useState<Array<{name: string; email: string}>>(
    [],
  );
  const [budName, setBudName] = useState('');
  const [budEmail, setBudEmail] = useState('');

  // Drop
  const [goodieItems, setGoodieItems] = useState<Array<{item: string; cost: number}>>(
    [],
  );
  const [goodItem, setGoodItem] = useState('');
  const [goodCost, setGoodCost] = useState('');
  const [merchInstalled, setMerchInstalled] = useState<Record<string, number>>({});
  const [afterPhoto, setAfterPhoto] = useState<File | null>(null);

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
        return Boolean(shelfPhoto);
      case 'train':
        return true;
      case 'drop':
        return true;
      case 'vibes':
        return vibesScore !== null;
    }
  }, [step, accountId, accountName, rep, checkedInAt, shelfPhoto, vibesScore]);

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
    form.set('skusOnShelf', JSON.stringify(skusOnShelf));
    form.set('skusMissing', JSON.stringify(skusMissing));
    if (shelfRating) form.set('shelfPositionRating', String(shelfRating));
    form.set('decksTaught', JSON.stringify(decksTaught));
    form.set('budtendersTrained', JSON.stringify(budtenders));
    form.set('goodieItems', JSON.stringify(goodieItems));
    form.set('merchInstalled', JSON.stringify(merchInstalled));
    if (vibesScore !== null) form.set('vibesScore', String(vibesScore));
    form.set('notesToSales', notesToSales);
    form.set('spokeWithManager', spokeWithManager ? 'true' : 'false');
    form.set('ugcPostUrl', ugcPostUrl);
    if (shelfPhoto) form.set('shelfPhoto', shelfPhoto);
    if (beforePhoto) form.set('beforePhoto', beforePhoto);
    if (afterPhoto) form.set('afterPhoto', afterPhoto);
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
                skusOnShelf={skusOnShelf}
                setSkusOnShelf={setSkusOnShelf}
                skusMissing={skusMissing}
                setSkusMissing={setSkusMissing}
                shelfRating={shelfRating}
                setShelfRating={setShelfRating}
                shelfPhoto={shelfPhoto}
                setShelfPhoto={setShelfPhoto}
                beforePhoto={beforePhoto}
                setBeforePhoto={setBeforePhoto}
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
                merch={merch}
                merchInstalled={merchInstalled}
                setMerchInstalled={setMerchInstalled}
                afterPhoto={afterPhoto}
                setAfterPhoto={setAfterPhoto}
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
function StepAudit(props: {
  skusOnShelf: string[];
  setSkusOnShelf: (v: string[]) => void;
  skusMissing: string[];
  setSkusMissing: (v: string[]) => void;
  shelfRating: number | null;
  setShelfRating: (n: number | null) => void;
  shelfPhoto: File | null;
  setShelfPhoto: (f: File | null) => void;
  beforePhoto: File | null;
  setBeforePhoto: (f: File | null) => void;
}) {
  function toggleOn(sku: string) {
    const set = new Set(props.skusOnShelf);
    set.has(sku) ? set.delete(sku) : set.add(sku);
    props.setSkusOnShelf(Array.from(set));
    const mset = new Set(props.skusMissing);
    mset.delete(sku);
    props.setSkusMissing(Array.from(mset));
  }
  function toggleMissing(sku: string) {
    const set = new Set(props.skusMissing);
    set.has(sku) ? set.delete(sku) : set.add(sku);
    props.setSkusMissing(Array.from(set));
    const oset = new Set(props.skusOnShelf);
    oset.delete(sku);
    props.setSkusOnShelf(Array.from(oset));
  }

  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="02" title="Audit" color={BRAND.purple} />
      <Field label="SKUs on shelf">
        <div style={{display: 'grid', gap: 4}}>
          {SKUS.map((sku) => {
            const isOn = props.skusOnShelf.includes(sku);
            const isMissing = props.skusMissing.includes(sku);
            return (
              <div
                key={sku}
                style={{
                  display: 'flex',
                  gap: 4,
                  alignItems: 'center',
                }}
              >
                <div style={{flex: 1, fontSize: 13}}>{sku}</div>
                <button
                  type="button"
                  onClick={() => toggleOn(sku)}
                  style={{
                    ...chipStyle(isOn),
                    padding: '4px 10px',
                    fontSize: 11,
                    borderColor: isOn ? BRAND.green : BRAND.line,
                    background: isOn ? BRAND.green : 'transparent',
                    color: isOn ? BRAND.black : BRAND.gray,
                  }}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => toggleMissing(sku)}
                  style={{
                    ...chipStyle(isMissing),
                    padding: '4px 10px',
                    fontSize: 11,
                    borderColor: isMissing ? BRAND.red : BRAND.line,
                    background: isMissing ? BRAND.red : 'transparent',
                    color: isMissing ? BRAND.white : BRAND.gray,
                  }}
                >
                  MISSING
                </button>
              </div>
            );
          })}
        </div>
      </Field>

      <Field label="Shelf position rating (1–5)">
        <div style={{display: 'flex', gap: 6}}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              type="button"
              key={n}
              onClick={() => props.setShelfRating(n)}
              style={chipStyle(props.shelfRating === n)}
            >
              {n}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Shelf photo" required>
        <PhotoPicker
          file={props.shelfPhoto}
          setFile={props.setShelfPhoto}
          label="Snap the Highsman shelf"
        />
      </Field>

      <Field label="Before photo (merch / display state)">
        <PhotoPicker
          file={props.beforePhoto}
          setFile={props.setBeforePhoto}
          label="Before anything gets reset"
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

  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="03" title="Train" color={BRAND.green} />
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

      <Field label="Budtenders trained (live)">
        <div style={{display: 'flex', gap: 6}}>
          <input
            type="text"
            value={props.budName}
            onChange={(e) => props.setBudName(e.target.value)}
            placeholder="Name"
            style={{...inputStyle(), flex: 2}}
          />
          <input
            type="email"
            value={props.budEmail}
            onChange={(e) => props.setBudEmail(e.target.value)}
            placeholder="Email (opt)"
            style={{...inputStyle(), flex: 3}}
          />
          <button type="button" onClick={addBud} style={secondaryBtn()}>
            Add
          </button>
        </div>
        {props.budtenders.length > 0 ? (
          <div style={{marginTop: 8, display: 'grid', gap: 4}}>
            {props.budtenders.map((b, i) => (
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
                <span>
                  <span style={{color: BRAND.white, fontWeight: 600}}>
                    {b.name}
                  </span>
                  {b.email ? (
                    <span style={{color: BRAND.gray, marginLeft: 8}}>
                      {b.email}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => rmBud(i)}
                  style={{
                    background: 'transparent',
                    color: BRAND.gray,
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: TEKO,
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 · Drop (goodies + merch + after photo)
// ─────────────────────────────────────────────────────────────────────────────
function StepDrop(props: {
  goodieItems: Array<{item: string; cost: number}>;
  setGoodieItems: (v: Array<{item: string; cost: number}>) => void;
  goodItem: string;
  setGoodItem: (v: string) => void;
  goodCost: string;
  setGoodCost: (v: string) => void;
  merch: MerchItem[];
  merchInstalled: Record<string, number>;
  setMerchInstalled: (v: Record<string, number>) => void;
  afterPhoto: File | null;
  setAfterPhoto: (f: File | null) => void;
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

  function setMerchQty(slug: string, qty: number) {
    const next = {...props.merchInstalled};
    if (qty <= 0) delete next[slug];
    else next[slug] = qty;
    props.setMerchInstalled(next);
  }

  const over = props.total > props.dailyBudget;

  return (
    <div style={{display: 'grid', gap: 14}}>
      <SectionTitle index="04" title="Drop" color={BRAND.orange} />

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

      <Field label="Merch installed (from your car stock)">
        {props.merch.length === 0 ? (
          <div
            style={{
              color: BRAND.gray,
              fontSize: 12,
              fontStyle: 'italic',
            }}
          >
            Your inventory is empty — seed merch_inventory in Supabase.
          </div>
        ) : (
          <div style={{display: 'grid', gap: 4}}>
            {props.merch.map((m) => {
              const q = props.merchInstalled[m.item_slug] || 0;
              const maxAvail = m.qty_on_hand;
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    background: BRAND.chip,
                    border: `1px solid ${BRAND.line}`,
                    borderRadius: 4,
                  }}
                >
                  <div style={{fontSize: 13}}>
                    <div style={{color: BRAND.white}}>{m.item_label}</div>
                    <div style={{color: BRAND.gray, fontSize: 10}}>
                      {maxAvail} on hand
                    </div>
                  </div>
                  <div style={{display: 'flex', gap: 4, alignItems: 'center'}}>
                    <button
                      type="button"
                      onClick={() => setMerchQty(m.item_slug, Math.max(0, q - 1))}
                      style={qtyBtn()}
                    >
                      −
                    </button>
                    <span
                      style={{
                        width: 26,
                        textAlign: 'center',
                        fontFamily: TEKO,
                        fontSize: 16,
                      }}
                    >
                      {q}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setMerchQty(m.item_slug, Math.min(maxAvail, q + 1))
                      }
                      style={qtyBtn()}
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Field>

      <Field label="After photo (display reset)">
        <PhotoPicker
          file={props.afterPhoto}
          setFile={props.setAfterPhoto}
          label="Snap what looks fresh"
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
