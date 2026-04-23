/**
 * VibesTrainingPanel.tsx
 *
 * The pinned Training Camp module on every /vibes store card.
 * Shows enrolled/roster + % bar, inline roster editor, and a primary CTA
 * that opens the QR-or-manual signup modal.
 *
 * Drop this inside your store-card component on /vibes. It is self-contained
 * and uses only Tailwind + Highsman brand tokens already in the codebase
 * (yellow-400 / #F5E100, zinc-400 for Quarter Gray, teko/barlow fonts).
 *
 * Expected imports on the parent page:
 *   import {VibesTrainingPanel} from '~/components/vibes/VibesTrainingPanel';
 *
 * Parent must pass:
 *   - account: { id, name, city, state }
 *   - progress: row from store_training_progress view (can be null)
 *   - repId:   current logged-in vibes_rep id (for audit trail)
 *
 * Ship notes:
 *   • Uses Remix <Form> for roster edit + manual-entry fallback so everything
 *     works without JS. QR modal + realtime toasts are progressive enhancement.
 *   • Respects the "no Klaviyo popup on non-consumer pages" rule — this
 *     component never renders the consumer Klaviyo embed.
 */

import {useFetcher} from '@remix-run/react';
import {useEffect, useMemo, useRef, useState} from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type Account = {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
};

type StoreTrainingProgress = {
  account_id: string;
  account_name: string | null;
  roster: number | null;
  enrolled: number;
  self_serve_count: number;
  live_count: number;
  tier1_completed: number;
  last_signup_at: string | null;
  pct_enrolled: number | null;
  status:
    | 'no_roster'
    | 'not_started'
    | 'in_progress'
    | 'complete'
    | 'needs_attention'
    | 'stale';
};

type Props = {
  account: Account;
  progress: StoreTrainingProgress | null;
  repId: string;
  /** Pre-generated QR payload URL (highsman.com/training/join/{token}) */
  signupUrl: string;
  /** Pre-rendered QR code as a data-URL (generated server-side on /vibes). */
  qrDataUrl: string;
};

// ─── Component ────────────────────────────────────────────────────────────────

export function VibesTrainingPanel({
  account,
  progress,
  repId,
  signupUrl,
  qrDataUrl,
}: Props) {
  const enrolled = progress?.enrolled ?? 0;
  const roster = progress?.roster ?? null;
  const pct = progress?.pct_enrolled ?? null;
  const tier1 = progress?.tier1_completed ?? 0;
  const lastSignup = progress?.last_signup_at
    ? relativeTime(progress.last_signup_at)
    : null;

  const status = progress?.status ?? (roster ? 'not_started' : 'no_roster');

  const [isSignupOpen, setSignupOpen] = useState(false);
  const [isEditingRoster, setEditingRoster] = useState(false);

  return (
    <section
      aria-label={`Training Camp status for ${account.name}`}
      className="rounded-md border border-zinc-600 bg-[#0A0A0A] p-4"
    >
      {/* Heading */}
      <header className="mb-3 flex items-center justify-between">
        <h3 className="font-teko text-[14px] uppercase tracking-[0.15em] text-yellow-400">
          Training Camp
        </h3>
        <StatusChip status={status} />
      </header>

      {/* Fraction + progress bar */}
      <FractionLine enrolled={enrolled} roster={roster} pct={pct} />
      <ProgressBar pct={pct} status={status} />

      {/* Secondary line */}
      <p className="mt-2 font-barlow text-[13px] text-zinc-400">
        {tier1 > 0 ? (
          <>
            <span className="text-white">{tier1}</span> completed Tier 1
            {lastSignup ? <> · Last signup: {lastSignup}</> : null}
          </>
        ) : lastSignup ? (
          <>Last signup: {lastSignup}</>
        ) : (
          <>No budtenders enrolled yet.</>
        )}
      </p>

      {/* Primary CTA */}
      <button
        type="button"
        onClick={() => setSignupOpen(true)}
        className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-sm bg-yellow-400 font-teko text-[18px] uppercase tracking-wide text-black transition hover:bg-yellow-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300"
      >
        <PhoneIcon /> Sign up budtenders
        <ArrowRightIcon />
      </button>

      {/* Roster line (inline editor) */}
      <div className="mt-3">
        {isEditingRoster ? (
          <RosterEditor
            account={account}
            repId={repId}
            currentValue={roster}
            onDone={() => setEditingRoster(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingRoster(true)}
            className="group flex items-center gap-2 font-barlow text-[13px] text-zinc-400 hover:text-white focus:outline-none"
          >
            <span>
              Roster:{' '}
              <span className="text-white">
                {roster != null ? `${roster} budtenders` : 'not set'}
              </span>
            </span>
            <PencilIcon className="h-3 w-3 opacity-70 group-hover:opacity-100" />
            <span className="text-[11px] uppercase tracking-wider text-yellow-400">
              edit
            </span>
          </button>
        )}
      </div>

      {/* Signup modal */}
      {isSignupOpen ? (
        <SignupModal
          account={account}
          repId={repId}
          signupUrl={signupUrl}
          qrDataUrl={qrDataUrl}
          onClose={() => setSignupOpen(false)}
        />
      ) : null}
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FractionLine({
  enrolled,
  roster,
  pct,
}: {
  enrolled: number;
  roster: number | null;
  pct: number | null;
}) {
  if (roster == null) {
    return (
      <p className="font-barlow text-[20px] font-semibold text-white">
        {enrolled > 0 ? (
          <>
            <span className="text-yellow-400">{enrolled}</span> enrolled
            <span className="ml-2 text-[13px] font-normal text-zinc-400">
              · set roster to see %
            </span>
          </>
        ) : (
          <span className="text-zinc-400">No roster set yet</span>
        )}
      </p>
    );
  }

  return (
    <p className="font-barlow text-[20px] font-semibold text-white">
      <span className="text-yellow-400">{enrolled}</span>
      {' / '}
      {roster} enrolled
      {pct != null ? (
        <>
          {' · '}
          <span className="text-yellow-400">{pct}%</span>
        </>
      ) : null}
    </p>
  );
}

function ProgressBar({
  pct,
  status,
}: {
  pct: number | null;
  status: StoreTrainingProgress['status'];
}) {
  const width = pct != null ? Math.max(2, pct) : 0; // 2% floor so the bar shows
  const filled =
    status === 'complete'
      ? 'bg-yellow-400 ring-1 ring-yellow-300/50'
      : 'bg-yellow-400';
  return (
    <div
      className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-700"
      role="progressbar"
      aria-valuenow={pct ?? 0}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={`h-full ${filled} transition-[width] duration-300 ease-out`}
        style={{width: `${width}%`}}
      />
    </div>
  );
}

function StatusChip({status}: {status: StoreTrainingProgress['status']}) {
  const copy: Record<StoreTrainingProgress['status'], string> = {
    no_roster: 'NO ROSTER',
    not_started: 'NOT STARTED',
    in_progress: 'IN PROGRESS',
    needs_attention: '● NEEDS ATTN',
    stale: '⚠ STALE',
    complete: '★ COMPLETE',
  };
  const tone: Record<StoreTrainingProgress['status'], string> = {
    no_roster: 'bg-zinc-800 text-zinc-400',
    not_started: 'bg-zinc-800 text-zinc-300',
    in_progress: 'bg-zinc-800 text-yellow-400',
    needs_attention: 'bg-red-950 text-red-400',
    stale: 'bg-red-950 text-red-400',
    complete: 'bg-yellow-400 text-black',
  };
  return (
    <span
      className={`font-teko text-[11px] uppercase tracking-widest rounded-sm px-2 py-0.5 ${tone[status]}`}
    >
      {copy[status]}
    </span>
  );
}

// ─── Roster editor ────────────────────────────────────────────────────────────

function RosterEditor({
  account,
  repId,
  currentValue,
  onDone,
}: {
  account: Account;
  repId: string;
  currentValue: number | null;
  onDone: () => void;
}) {
  const fetcher = useFetcher();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data) onDone();
  }, [fetcher.state, fetcher.data, onDone]);

  return (
    <fetcher.Form
      method="post"
      action="/api/vibes-roster"
      className="flex items-center gap-2"
    >
      <input type="hidden" name="account_id" value={account.id} />
      <input type="hidden" name="account_name" value={account.name} />
      <input type="hidden" name="rep_id" value={repId} />

      <label className="font-barlow text-[13px] text-zinc-400">
        Roster:
        <input
          ref={inputRef}
          type="number"
          name="headcount"
          min={0}
          max={200}
          defaultValue={currentValue ?? ''}
          className="ml-2 w-16 rounded-sm border border-zinc-600 bg-black px-2 py-1 text-white focus:border-yellow-400 focus:outline-none"
          required
        />
      </label>

      <button
        type="submit"
        className="font-teko text-[12px] uppercase tracking-wider text-black bg-yellow-400 rounded-sm px-3 py-1 hover:bg-yellow-300"
        disabled={fetcher.state !== 'idle'}
      >
        {fetcher.state === 'submitting' ? 'Saving…' : 'Save'}
      </button>
      <button
        type="button"
        onClick={onDone}
        className="font-barlow text-[12px] text-zinc-400 hover:text-white"
      >
        ×
      </button>
    </fetcher.Form>
  );
}

// ─── Signup modal ─────────────────────────────────────────────────────────────

function SignupModal({
  account,
  repId,
  signupUrl,
  qrDataUrl,
  onClose,
}: {
  account: Account;
  repId: string;
  signupUrl: string;
  qrDataUrl: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<'qr' | 'manual'>('qr');

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 backdrop-blur"
      role="dialog"
      aria-modal="true"
      aria-label="Sign up budtenders"
    >
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="font-teko text-[24px] text-white hover:text-yellow-400"
          aria-label="Close"
        >
          ×
        </button>
        <div className="flex items-center gap-1 rounded-full bg-zinc-900 p-1">
          <ModePill active={mode === 'qr'} onClick={() => setMode('qr')}>
            QR Code
          </ModePill>
          <ModePill
            active={mode === 'manual'}
            onClick={() => setMode('manual')}
          >
            Manual
          </ModePill>
        </div>
        <div className="w-6" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center px-4 text-center">
        <h2 className="font-teko text-[28px] uppercase tracking-wide text-yellow-400">
          Sign Up Budtenders
        </h2>
        <p className="mt-1 font-barlow text-[14px] uppercase tracking-wider text-zinc-400">
          {account.name}
          {account.city ? ` · ${account.city}` : ''}
        </p>

        {mode === 'qr' ? (
          <QRPane signupUrl={signupUrl} qrDataUrl={qrDataUrl} />
        ) : (
          <ManualPane account={account} repId={repId} />
        )}
      </div>
    </div>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`font-teko text-[13px] uppercase tracking-wider rounded-full px-3 py-1 transition ${
        active
          ? 'bg-yellow-400 text-black'
          : 'text-zinc-400 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function QRPane({
  signupUrl,
  qrDataUrl,
}: {
  signupUrl: string;
  qrDataUrl: string;
}) {
  return (
    <div className="mt-8 flex flex-col items-center">
      <div className="rounded-lg bg-white p-4">
        <img src={qrDataUrl} alt="Training signup QR code" className="h-64 w-64" />
      </div>
      <p className="mt-6 max-w-xs font-barlow text-[15px] leading-snug text-white">
        Have them scan this with their phone. Takes 20 seconds.
        You'll see them pop up here as they join.
      </p>
      <p className="mt-4 font-barlow text-[11px] tracking-wider text-zinc-500">
        {signupUrl}
      </p>
    </div>
  );
}

function ManualPane({account, repId}: {account: Account; repId: string}) {
  const fetcher = useFetcher<{ok: boolean; budtender_name?: string}>();
  const formRef = useRef<HTMLFormElement>(null);
  const firstNameRef = useRef<HTMLInputElement>(null);
  const [lastToast, setLastToast] = useState<string | null>(null);

  useEffect(() => {
    if (fetcher.state === 'idle' && fetcher.data?.ok) {
      setLastToast(fetcher.data.budtender_name ?? 'Budtender');
      formRef.current?.reset();
      firstNameRef.current?.focus();
      const t = setTimeout(() => setLastToast(null), 2400);
      return () => clearTimeout(t);
    }
  }, [fetcher.state, fetcher.data]);

  return (
    <fetcher.Form
      ref={formRef}
      method="post"
      action="/api/training-signup"
      className="mt-6 w-full max-w-sm space-y-3 text-left"
    >
      <input type="hidden" name="store_account_id" value={account.id} />
      <input type="hidden" name="store_account_name" value={account.name} />
      <input type="hidden" name="method" value="live" />
      <input type="hidden" name="rep_id" value={repId} />

      <div className="grid grid-cols-2 gap-3">
        <TextField
          name="first_name"
          label="First name"
          required
          inputRef={firstNameRef}
        />
        <TextField name="last_name" label="Last name" required />
      </div>
      <TextField name="email" label="Email" type="email" required />
      <TextField name="phone" label="Phone (optional)" type="tel" />

      <fieldset className="pt-1">
        <legend className="font-barlow text-[12px] uppercase tracking-wider text-zinc-400">
          Role
        </legend>
        <div className="mt-2 flex gap-2">
          {(['Budtender', 'Manager', 'Owner'] as const).map((r) => (
            <label
              key={r}
              className="flex-1 cursor-pointer rounded-sm border border-zinc-700 bg-black px-3 py-2 text-center font-barlow text-[13px] text-white has-[:checked]:border-yellow-400 has-[:checked]:bg-yellow-400/10 has-[:checked]:text-yellow-400"
            >
              <input
                type="radio"
                name="role"
                value={r}
                className="sr-only"
                defaultChecked={r === 'Budtender'}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>

      <button
        type="submit"
        className="mt-2 h-12 w-full rounded-sm bg-yellow-400 font-teko text-[18px] uppercase tracking-wide text-black hover:bg-yellow-300 disabled:opacity-60"
        disabled={fetcher.state !== 'idle'}
      >
        {fetcher.state === 'submitting' ? 'Adding…' : 'Add budtender'}
      </button>

      {lastToast ? (
        <div
          role="status"
          className="rounded-sm border border-yellow-400/30 bg-yellow-400/10 px-3 py-2 text-center font-barlow text-[13px] text-yellow-400"
        >
          ✓ {lastToast} added — next one?
        </div>
      ) : null}
    </fetcher.Form>
  );
}

function TextField({
  name,
  label,
  type = 'text',
  required,
  inputRef,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  inputRef?: React.RefObject<HTMLInputElement>;
}) {
  return (
    <label className="block">
      <span className="font-barlow text-[12px] uppercase tracking-wider text-zinc-400">
        {label}
      </span>
      <input
        ref={inputRef}
        name={name}
        type={type}
        required={required}
        autoComplete="off"
        className="mt-1 block w-full rounded-sm border border-zinc-700 bg-black px-3 py-2 font-barlow text-white placeholder-zinc-600 focus:border-yellow-400 focus:outline-none"
      />
    </label>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function PhoneIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function PencilIcon({className}: {className?: string}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const secs = Math.max(1, Math.floor((now - then) / 1000));
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}
