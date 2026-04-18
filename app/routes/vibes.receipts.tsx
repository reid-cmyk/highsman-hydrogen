// ─────────────────────────────────────────────────────────────────────────────
// /vibes/receipts — Standalone goodies-receipt submission page
// ─────────────────────────────────────────────────────────────────────────────
// Works outside of the full Visit flow. Use case: Serena buys goodies in the
// morning before any visit is started (Costco run, Target swing), or needs to
// file a receipt after the fact. She picks a dispensary, snaps the receipt,
// taps File → the receipt hits Bill.com in seconds via spark@highsman.com.
//
// Same submit endpoint as the in-visit ReceiptsSubmitter block, minus the
// visit_id link (receipt will be unlinked from any specific visit).
// ─────────────────────────────────────────────────────────────────────────────
import type {LoaderFunctionArgs, MetaFunction} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Link, useLoaderData, useSearchParams} from '@remix-run/react';
import {useEffect, useRef, useState} from 'react';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

type VibesRep = {
  id: string;
  full_name: string;
  daily_goodie_budget: number;
};

type AccountHit = {
  id: string;
  name: string;
  city?: string;
  state?: string;
};

export async function loader({request, context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  const url = new URL(request.url);
  const repIdParam = url.searchParams.get('repId');

  let reps: VibesRep[] = [];
  let rep: VibesRep | null = null;

  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/vibes_reps?active=eq.true&select=id,full_name,daily_goodie_budget&order=start_date.asc`,
        {
          headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
          },
        },
      );
      if (res.ok) reps = await res.json();
      rep = reps.find((r) => r.id === repIdParam) || reps[0] || null;
    } catch (err) {
      console.warn('[vibes/receipts] Supabase fetch failed', err);
    }
  }

  return json({reps, rep});
}

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'File Receipt · Vibes · Highsman'},
  {name: 'robots', content: 'noindex, nofollow'},
];

// ─── Brand ──────────────────────────────────────────────────────────────────
const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gray: '#A9ACAF',
  gold: '#F5E400',
  green: '#2ECC71',
  red: '#FF3B30',
  orange: '#FF8A00',
  line: 'rgba(255,255,255,0.10)',
  chip: 'rgba(255,255,255,0.06)',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

// ─── Component ──────────────────────────────────────────────────────────────
export default function VibesReceiptsPage() {
  const {reps, rep: loaderRep} = useLoaderData<typeof loader>();
  const [params] = useSearchParams();

  // Suppress Klaviyo (this is a staff page)
  useEffect(() => {
    if (document.getElementById('vibes-font-link')) return;
    const l = document.createElement('link');
    l.id = 'vibes-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'klv-vr';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  // Selected rep — defaults to loader rep, switchable if Reid is logged in
  const [rep, setRep] = useState<VibesRep | null>(loaderRep);

  // Account lookup (re-uses /api/accounts?q=)
  const presetAccountId = params.get('accountId') || '';
  const presetAccountName = params.get('accountName') || '';
  const presetAccountState = params.get('accountState') || 'NJ';

  const [accountId, setAccountId] = useState(presetAccountId);
  const [accountName, setAccountName] = useState(presetAccountName);
  const [accountState, setAccountState] = useState(presetAccountState);
  const [accountQuery, setAccountQuery] = useState('');
  const [accountHits, setAccountHits] = useState<AccountHit[]>([]);
  const [searching, setSearching] = useState(false);
  const searchAbort = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!accountQuery || accountQuery.length < 3) {
      setAccountHits([]);
      return;
    }
    const t = setTimeout(async () => {
      if (searchAbort.current) searchAbort.current.abort();
      const ctrl = new AbortController();
      searchAbort.current = ctrl;
      setSearching(true);
      try {
        const res = await fetch(
          `/api/accounts?q=${encodeURIComponent(accountQuery)}`,
          {signal: ctrl.signal},
        );
        const data: {accounts?: AccountHit[]} = await res.json();
        setAccountHits(data.accounts || []);
      } catch (e: any) {
        if (e?.name !== 'AbortError') setAccountHits([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [accountQuery]);

  function selectAccount(a: AccountHit) {
    setAccountId(a.id);
    setAccountName(a.name);
    setAccountState((a.state || 'NJ').toUpperCase());
    setAccountQuery('');
    setAccountHits([]);
  }

  function clearAccount() {
    setAccountId('');
    setAccountName('');
  }

  // Receipt form
  const [photo, setPhoto] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filedReceipts, setFiledReceipts] = useState<
    Array<{
      id: string;
      amount: number;
      vendor: string;
      accountName: string;
      photoName: string;
      status: 'sending' | 'filed' | 'saved_no_email' | 'error';
      message?: string;
    }>
  >([]);

  const canFile =
    !sending &&
    !!rep &&
    !!accountName &&
    !!photo &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0;

  async function fileReceipt() {
    if (!canFile || !rep || !photo) return;
    setSending(true);
    setErrorMsg(null);
    const tempId = `r_${Date.now()}`;
    const snapshot = {
      id: tempId,
      amount: Number(amount),
      vendor: vendor.trim(),
      accountName,
      photoName: photo.name,
      status: 'sending' as const,
    };
    setFiledReceipts([snapshot, ...filedReceipts]);

    try {
      const fd = new FormData();
      fd.set('repId', rep.id);
      fd.set('repName', rep.full_name);
      fd.set('accountId', accountId || '');
      fd.set('accountName', accountName);
      fd.set('accountState', accountState || '');
      fd.set('amount', String(Number(amount)));
      if (vendor.trim()) fd.set('vendor', vendor.trim());
      if (notes.trim()) fd.set('notes', notes.trim());
      fd.set('receiptPhoto', photo);

      const res = await fetch('/api/goodies-receipt-submit', {
        method: 'POST',
        body: fd,
      });
      const data: {
        ok?: boolean;
        emailSent?: boolean;
        emailError?: string;
        message?: string;
      } = await res.json().catch(() => ({}));

      if (!res.ok || data.ok === false) {
        setFiledReceipts((prev) =>
          prev.map((r) =>
            r.id === tempId
              ? {
                  ...r,
                  status: 'error',
                  message: data.message || `HTTP ${res.status}`,
                }
              : r,
          ),
        );
        setErrorMsg(data.message || `Upload failed (HTTP ${res.status})`);
        return;
      }

      const nextStatus: 'filed' | 'saved_no_email' = data.emailSent
        ? 'filed'
        : 'saved_no_email';
      setFiledReceipts((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {
                ...r,
                status: nextStatus,
                message: data.emailError || undefined,
              }
            : r,
        ),
      );

      // Reset for the next receipt — keep rep + account so Serena can stack them
      setPhoto(null);
      setAmount('');
      setVendor('');
      setNotes('');
    } catch (e: any) {
      setFiledReceipts((prev) =>
        prev.map((r) =>
          r.id === tempId
            ? {...r, status: 'error', message: e?.message || 'Network error'}
            : r,
        ),
      );
      setErrorMsg(e?.message || 'Network error');
    } finally {
      setSending(false);
    }
  }

  if (!rep) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: BRAND.black,
          color: BRAND.white,
          fontFamily: BODY,
          padding: 20,
        }}
      >
        <div style={{maxWidth: 520, margin: '0 auto', textAlign: 'center'}}>
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 24, marginTop: 40, marginBottom: 20}}
          />
          <div style={{color: BRAND.red, fontSize: 14}}>
            No active Vibes rep found. Seed vibes_reps in Supabase first.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: BRAND.black,
        color: BRAND.white,
        fontFamily: BODY,
        padding: '16px 16px 40px',
      }}
    >
      <div style={{maxWidth: 520, margin: '0 auto'}}>
        {/* ─── Header ───────────────────────────────────────────────────── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 16,
          }}
        >
          <Link
            to="/vibes"
            style={{
              color: BRAND.gray,
              textDecoration: 'none',
              fontFamily: TEKO,
              fontSize: 14,
              letterSpacing: '0.12em',
            }}
          >
            ← VIBES
          </Link>
          <img src={LOGO_WHITE} alt="Highsman" style={{height: 18}} />
        </div>

        <div
          style={{
            fontFamily: TEKO,
            fontSize: 32,
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1,
            color: BRAND.white,
          }}
        >
          File receipt
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 4,
            marginBottom: 18,
          }}
        >
          Snap a goodies receipt → auto-emailed from spark@highsman.com →
          Bill.com for reimbursement.
        </div>

        {/* ─── Rep selector (auto-picked, editable) ────────────────────── */}
        {reps.length > 1 ? (
          <div style={{marginBottom: 14}}>
            <Label>Rep</Label>
            <select
              value={rep.id}
              onChange={(e) => {
                const next = reps.find((r) => r.id === e.target.value) || null;
                setRep(next);
              }}
              style={inputStyle()}
            >
              {reps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.full_name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div style={{marginBottom: 14}}>
            <Label>Rep</Label>
            <div
              style={{
                padding: '10px 12px',
                background: BRAND.chip,
                border: `1px solid ${BRAND.line}`,
                borderRadius: 6,
                color: BRAND.white,
                fontSize: 14,
              }}
            >
              {rep.full_name}
            </div>
          </div>
        )}

        {/* ─── Dispensary picker ────────────────────────────────────────── */}
        <div style={{marginBottom: 14}}>
          <Label>Dispensary (which store is this receipt for?)</Label>
          {accountName ? (
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '10px 12px',
                background: 'rgba(255,138,0,0.12)',
                border: `1px solid ${BRAND.orange}`,
                borderRadius: 6,
              }}
            >
              <div>
                <div style={{color: BRAND.white, fontSize: 14}}>{accountName}</div>
                <div style={{color: BRAND.gray, fontSize: 11}}>
                  {accountState}
                  {accountId ? ` · ${accountId.slice(-6)}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={clearAccount}
                style={{
                  background: 'transparent',
                  color: BRAND.gray,
                  border: `1px solid ${BRAND.line}`,
                  borderRadius: 4,
                  padding: '4px 10px',
                  fontFamily: TEKO,
                  fontSize: 11,
                  cursor: 'pointer',
                }}
              >
                CHANGE
              </button>
            </div>
          ) : (
            <div>
              <input
                type="text"
                value={accountQuery}
                onChange={(e) => setAccountQuery(e.target.value)}
                placeholder="Search dispensary…"
                style={inputStyle()}
              />
              {searching ? (
                <div style={{color: BRAND.gray, fontSize: 11, marginTop: 4}}>
                  Searching…
                </div>
              ) : null}
              {accountHits.length > 0 ? (
                <div
                  style={{
                    marginTop: 4,
                    border: `1px solid ${BRAND.line}`,
                    borderRadius: 6,
                    overflow: 'hidden',
                  }}
                >
                  {accountHits.slice(0, 6).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => selectAccount(a)}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 12px',
                        background: BRAND.chip,
                        border: 'none',
                        borderBottom: `1px solid ${BRAND.line}`,
                        color: BRAND.white,
                        cursor: 'pointer',
                      }}
                    >
                      <div style={{fontSize: 13}}>{a.name}</div>
                      <div style={{color: BRAND.gray, fontSize: 11}}>
                        {[a.city, a.state].filter(Boolean).join(', ')}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* ─── Receipt photo + amount ──────────────────────────────────── */}
        <div style={{marginBottom: 14}}>
          <Label>Receipt photo {photo ? '' : '(required)'}</Label>
          <PhotoPicker file={photo} setFile={setPhoto} label="Snap receipt" />
        </div>

        <div style={{display: 'flex', gap: 10, marginBottom: 14}}>
          <div style={{flex: 1}}>
            <Label>Amount ($)</Label>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              style={inputStyle()}
            />
          </div>
          <div style={{flex: 1}}>
            <Label>Vendor (optional)</Label>
            <input
              type="text"
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Target, Costco…"
              style={inputStyle()}
            />
          </div>
        </div>

        <div style={{marginBottom: 14}}>
          <Label>Notes (optional)</Label>
          <input
            type="text"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What was bought — pizza, donuts, swag…"
            style={inputStyle()}
          />
        </div>

        <button
          type="button"
          onClick={fileReceipt}
          disabled={!canFile}
          style={{
            width: '100%',
            padding: '14px 14px',
            background: canFile ? BRAND.orange : BRAND.line,
            color: canFile ? BRAND.black : BRAND.gray,
            border: 'none',
            borderRadius: 6,
            fontFamily: TEKO,
            fontSize: 20,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            cursor: canFile ? 'pointer' : 'not-allowed',
          }}
        >
          {sending ? 'Filing…' : 'File receipt → Bill.com'}
        </button>

        {errorMsg ? (
          <div style={{color: BRAND.red, fontSize: 12, marginTop: 8}}>
            {errorMsg}
          </div>
        ) : null}

        {/* ─── Filed list ─────────────────────────────────────────────── */}
        {filedReceipts.length > 0 ? (
          <div style={{marginTop: 24}}>
            <div
              style={{
                fontFamily: TEKO,
                fontSize: 18,
                color: BRAND.white,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                marginBottom: 8,
              }}
            >
              Filed this session ({filedReceipts.length})
            </div>
            <div style={{display: 'grid', gap: 6}}>
              {filedReceipts.map((r) => {
                const {color, label} = receiptStatusPresentation(r.status);
                return (
                  <div
                    key={r.id}
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
                          fontSize: 17,
                          color: BRAND.gold,
                        }}
                      >
                        ${r.amount.toFixed(2)}
                        {r.vendor ? (
                          <span
                            style={{
                              color: BRAND.gray,
                              marginLeft: 8,
                              fontSize: 12,
                            }}
                          >
                            · {r.vendor}
                          </span>
                        ) : null}
                      </div>
                      <div style={{color: BRAND.white, fontSize: 12}}>
                        {r.accountName}
                      </div>
                      <div style={{color: BRAND.gray, fontSize: 10}}>
                        {r.photoName}
                      </div>
                      {r.message ? (
                        <div style={{color: BRAND.red, fontSize: 10}}>
                          {r.message}
                        </div>
                      ) : null}
                    </div>
                    <div
                      style={{
                        fontFamily: TEKO,
                        fontSize: 11,
                        color,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                      }}
                    >
                      {label}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Presentational helpers ────────────────────────────────────────────────
function Label({children}: {children: React.ReactNode}) {
  return (
    <div
      style={{
        color: BRAND.gray,
        fontFamily: TEKO,
        fontSize: 12,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        marginBottom: 4,
      }}
    >
      {children}
    </div>
  );
}

function inputStyle(): React.CSSProperties {
  return {
    width: '100%',
    padding: '10px 12px',
    background: BRAND.chip,
    color: BRAND.white,
    border: `1px solid ${BRAND.line}`,
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
    fontFamily: BODY,
  };
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
        padding: 14,
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
            fontSize: 13,
          }}
        >
          <div style={{fontSize: 40, marginBottom: 4}}>📷</div>
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

function receiptStatusPresentation(status: string): {
  color: string;
  label: string;
} {
  switch (status) {
    case 'filed':
      return {color: BRAND.green, label: '✓ Filed'};
    case 'saved_no_email':
      return {color: BRAND.gold, label: '↻ Saved · Email retry'};
    case 'error':
      return {color: BRAND.red, label: '! Error'};
    case 'sending':
    default:
      return {color: BRAND.gray, label: 'Sending…'};
  }
}
