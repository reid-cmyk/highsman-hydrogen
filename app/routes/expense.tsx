// ─────────────────────────────────────────────────────────────────────────────
// /expense — Staff travel expense submission page
// ─────────────────────────────────────────────────────────────────────────────
// Any Highsman staff member on the road (trade shows, flights, hotels, Ubers,
// dinners) can snap a receipt, type their name + amount, and File →
// receipt hits Bill.com in seconds via spark@highsman.com with an "EXPENSE ·"
// subject so Bill.com routes it to Travel instead of Goodies.
//
// Mirrors /vibes/receipts UX but strips out the rep/dispensary concepts
// (this is for anyone on the team, not just brand reps).
// ─────────────────────────────────────────────────────────────────────────────
import type {MetaFunction} from '@shopify/remix-oxygen';
import {Link} from '@remix-run/react';
import {useEffect, useState} from 'react';

export const handle = {hideHeader: true, hideFooter: true};

export const meta: MetaFunction = () => [
  {title: 'File Expense · Highsman'},
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

// Remember staff name on this device so repeat submissions are one-tap
const LS_NAME_KEY = 'hm_expense_staff_name';

// ─── Component ──────────────────────────────────────────────────────────────
export default function StaffExpensePage() {
  // Suppress Klaviyo (staff page) + load brand fonts
  useEffect(() => {
    if (document.getElementById('exp-font-link')) return;
    const l = document.createElement('link');
    l.id = 'exp-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@300;400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);
    const s = document.createElement('style');
    s.id = 'klv-exp';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  // Staff name — persisted in localStorage so "Sean Connor" doesn't re-type it
  const [staffName, setStaffName] = useState('');
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LS_NAME_KEY);
      if (saved) setStaffName(saved);
    } catch (_e) {
      // localStorage unavailable — fine
    }
  }, []);
  useEffect(() => {
    try {
      if (staffName.trim()) {
        window.localStorage.setItem(LS_NAME_KEY, staffName.trim());
      }
    } catch (_e) {
      // ignore
    }
  }, [staffName]);

  // Expense form
  const [photo, setPhoto] = useState<File | null>(null);
  const [amount, setAmount] = useState('');
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [sending, setSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [filed, setFiled] = useState<
    Array<{
      id: string;
      amount: number;
      vendor: string;
      staffName: string;
      photoName: string;
      status: 'sending' | 'filed' | 'saved_no_email' | 'error';
      message?: string;
    }>
  >([]);

  const canFile =
    !sending &&
    !!staffName.trim() &&
    !!photo &&
    Number.isFinite(Number(amount)) &&
    Number(amount) > 0;

  async function fileExpense() {
    if (!canFile || !photo) return;
    setSending(true);
    setErrorMsg(null);
    const tempId = `e_${Date.now()}`;
    const snapshot = {
      id: tempId,
      amount: Number(amount),
      vendor: vendor.trim(),
      staffName: staffName.trim(),
      photoName: photo.name,
      status: 'sending' as const,
    };
    setFiled([snapshot, ...filed]);

    try {
      const fd = new FormData();
      fd.set('staffName', staffName.trim());
      fd.set('amount', String(Number(amount)));
      if (vendor.trim()) fd.set('vendor', vendor.trim());
      if (notes.trim()) fd.set('notes', notes.trim());
      fd.set('receiptPhoto', photo);

      const res = await fetch('/api/staff-expense-submit', {
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
        setFiled((prev) =>
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
      setFiled((prev) =>
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

      // Reset for next expense — keep the staff name so they can stack submissions
      setPhoto(null);
      setAmount('');
      setVendor('');
      setNotes('');
    } catch (e: any) {
      setFiled((prev) =>
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
            to="/"
            style={{
              color: BRAND.gray,
              textDecoration: 'none',
              fontFamily: TEKO,
              fontSize: 14,
              letterSpacing: '0.12em',
            }}
          >
            ← HIGHSMAN
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
          File expense
        </div>
        <div
          style={{
            color: BRAND.gray,
            fontSize: 13,
            marginTop: 4,
            marginBottom: 18,
          }}
        >
          Snap a receipt → auto-emailed from spark@highsman.com → Bill.com for
          reimbursement.
        </div>

        {/* ─── Staff name ───────────────────────────────────────────────── */}
        <div style={{marginBottom: 14}}>
          <Label>Your name</Label>
          <input
            type="text"
            value={staffName}
            onChange={(e) => setStaffName(e.target.value)}
            placeholder="First Last"
            autoComplete="name"
            style={inputStyle()}
          />
        </div>

        {/* ─── Receipt photo ────────────────────────────────────────────── */}
        <div style={{marginBottom: 14}}>
          <Label>Receipt photo {photo ? '' : '(required)'}</Label>
          <PhotoPicker file={photo} setFile={setPhoto} label="Snap receipt" />
        </div>

        {/* ─── Amount + vendor ──────────────────────────────────────────── */}
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
              placeholder="Hotel, Airline, Uber…"
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
            placeholder="What was this for — hotel, flight, dinner…"
            style={inputStyle()}
          />
        </div>

        <button
          type="button"
          onClick={fileExpense}
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
          {sending ? 'Filing…' : 'File expense → Bill.com'}
        </button>

        {errorMsg ? (
          <div style={{color: BRAND.red, fontSize: 12, marginTop: 8}}>
            {errorMsg}
          </div>
        ) : null}

        {/* ─── Filed list ─────────────────────────────────────────────── */}
        {filed.length > 0 ? (
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
              Filed this session ({filed.length})
            </div>
            <div style={{display: 'grid', gap: 6}}>
              {filed.map((r) => {
                const {color, label} = expenseStatusPresentation(r.status);
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
                        {r.staffName}
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

function expenseStatusPresentation(status: string): {
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
