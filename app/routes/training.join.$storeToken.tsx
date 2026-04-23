/**
 * training.join.$storeToken.tsx
 *
 * Public mobile-first landing page reached by scanning the QR code Serena
 * shows in-store. The token resolves to a Zoho Account ID via
 * training_signup_tokens — the budtender never sees the store ID directly,
 * which keeps the URL short and stops copy/paste tampering.
 *
 * On success we render the "You're in" state in place with a link to the
 * 5-deck library. Failure mode is the same form with an inline error.
 *
 * Meta:
 *   • noindex, nofollow — this is a staff flow, not a consumer page.
 *   • No Klaviyo embed — respects the "no popup on non-consumer pages" rule.
 */

import {useEffect} from 'react';
import type {
  ActionFunctionArgs,
  LoaderFunctionArgs,
  MetaFunction,
} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {Form, Link, useActionData, useLoaderData, useNavigation} from '@remix-run/react';

import {subscribeBudtender} from '~/lib/vibes-klaviyo-training';

type Env = {
  KLAVIYO_PRIVATE_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

type TokenRow = {
  token: string;
  account_id: string;
  revoked_at: string | null;
};

type StoreProfile = {
  account_id: string;
  account_name: string | null;
};

// ─── Loader ──────────────────────────────────────────────────────────────────

export async function loader({params, context}: LoaderFunctionArgs) {
  const env = context.env as Env;
  const token = params.storeToken || '';

  if (!token || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    throw new Response('Link invalid.', {status: 404});
  }

  // Resolve token → account_id
  const tokRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/training_signup_tokens?token=eq.${encodeURIComponent(token)}&select=token,account_id,revoked_at&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );

  if (!tokRes.ok) throw new Response('Link lookup failed.', {status: 500});
  const rows = (await tokRes.json()) as TokenRow[];
  const row = rows[0];

  if (!row) throw new Response('Link invalid.', {status: 404});
  if (row.revoked_at) throw new Response('This link has been revoked.', {status: 410});

  // Fetch the store name for display
  const storeRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/vibes_store_profiles?account_id=eq.${encodeURIComponent(row.account_id)}&select=account_id,account_name&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  const stores = storeRes.ok ? ((await storeRes.json()) as StoreProfile[]) : [];
  const storeName = stores[0]?.account_name || 'your store';

  return json({
    token,
    accountId: row.account_id,
    storeName,
  });
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({request, params, context}: ActionFunctionArgs) {
  const env = context.env as Env;
  const token = params.storeToken || '';

  if (!env.KLAVIYO_PRIVATE_KEY) {
    return json({ok: false, error: 'Klaviyo not configured.'}, {status: 500});
  }
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return json({ok: false, error: 'Supabase not configured.'}, {status: 500});
  }

  // Re-resolve the token server-side (don't trust the client-submitted account_id)
  const tokRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/training_signup_tokens?token=eq.${encodeURIComponent(token)}&select=token,account_id,revoked_at&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  const rows = tokRes.ok ? ((await tokRes.json()) as TokenRow[]) : [];
  const row = rows[0];
  if (!row || row.revoked_at) {
    return json({ok: false, error: 'This link is no longer valid.'}, {status: 410});
  }
  const accountId = row.account_id;

  // Fetch store name for attribution
  const storeRes = await fetch(
    `${env.SUPABASE_URL}/rest/v1/vibes_store_profiles?account_id=eq.${encodeURIComponent(accountId)}&select=account_id,account_name&limit=1`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
    },
  );
  const stores = storeRes.ok ? ((await storeRes.json()) as StoreProfile[]) : [];
  const storeName = stores[0]?.account_name || null;

  const form = await request.formData();
  const firstName = String(form.get('first_name') || '').trim();
  const lastName = String(form.get('last_name') || '').trim();
  const email = String(form.get('email') || '').trim().toLowerCase();
  const phone = String(form.get('phone') || '').trim() || null;
  const role = String(form.get('role') || 'Budtender').trim();

  if (!firstName || !lastName || !email) {
    return json(
      {ok: false, error: 'First name, last name, and email are all required.'},
      {status: 400},
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json({ok: false, error: 'Please enter a valid email.'}, {status: 400});
  }

  // Klaviyo — source of truth
  let klaviyoProfileId: string | null = null;
  try {
    klaviyoProfileId = await subscribeBudtender(env.KLAVIYO_PRIVATE_KEY, {
      email,
      firstName,
      lastName,
      phone,
      role,
      storeAccountId: accountId,
      storeAccountName: storeName,
      state: null,
      signupMethod: 'self_serve',
      signedUpByRepId: null,
    });
  } catch (err) {
    console.error('[training.join] Klaviyo subscribe failed', err);
    return json(
      {ok: false, error: "We couldn't save your signup. Try again in a minute."},
      {status: 502},
    );
  }

  // Supabase mirror — non-fatal
  try {
    await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_training_signup`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        p_store_account_id: accountId,
        p_store_account_name: storeName,
        p_budtender_name: `${firstName} ${lastName}`,
        p_budtender_email: email,
        p_method: 'self_serve',
        p_module_slug: 'training-camp-signup',
        p_rep_id: null,
        p_klaviyo_profile_id: klaviyoProfileId,
      }),
    });
  } catch (err) {
    console.warn('[training.join] Supabase mirror failed (non-fatal)', err);
  }

  return json({
    ok: true,
    budtenderName: firstName,
    storeName: storeName ?? 'your store',
  });
}

// ─── Meta (noindex) ──────────────────────────────────────────────────────────

export const meta: MetaFunction<typeof loader> = ({data}) => {
  const store = (data as any)?.storeName ?? 'Highsman';
  return [
    {title: `Join Training Camp · ${store}`},
    {name: 'robots', content: 'noindex, nofollow'},
    {name: 'viewport', content: 'width=device-width, initial-scale=1'},
  ];
};

export const handle = {hideHeader: true, hideFooter: true};

// ─── UI ──────────────────────────────────────────────────────────────────────

const BRAND = {
  black: '#000000',
  white: '#FFFFFF',
  gold: '#F5E100',
  gray: '#A9ACAF',
} as const;
const TEKO = `'Teko', sans-serif`;
const BODY = `'Barlow Semi Condensed', system-ui, -apple-system, sans-serif`;
const CDN = 'https://cdn.shopify.com/s/files/1/0752/8598/7491/files';
const LOGO_WHITE = `${CDN}/Highsman_Logo_White.png?v=1775594430`;

export default function TrainingJoin() {
  const {storeName} = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>() as
    | {ok: true; budtenderName: string; storeName: string}
    | {ok: false; error: string}
    | undefined;
  const nav = useNavigation();
  const submitting = nav.state === 'submitting';

  useEffect(() => {
    if (document.getElementById('training-font-link')) return;
    const l = document.createElement('link');
    l.id = 'training-font-link';
    l.rel = 'stylesheet';
    l.href =
      'https://fonts.googleapis.com/css2?family=Teko:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';
    document.head.appendChild(l);

    const s = document.createElement('style');
    s.id = 'training-klaviyo-suppress';
    s.innerHTML = `.klaviyo-form, [class*="needsclick"], [class*="kl-private"] { display:none !important; }`;
    document.head.appendChild(s);
  }, []);

  if (actionData && actionData.ok) {
    return (
      <Shell>
        <div style={{textAlign: 'center', padding: '48px 20px 24px'}}>
          <div
            style={{
              fontFamily: TEKO,
              fontSize: 44,
              color: BRAND.gold,
              textTransform: 'uppercase',
              letterSpacing: '0.02em',
              lineHeight: 1,
            }}
          >
            You're in, {actionData.budtenderName}.
          </div>
          <p
            style={{
              marginTop: 18,
              fontFamily: BODY,
              fontSize: 15,
              color: BRAND.white,
              lineHeight: 1.45,
            }}
          >
            You've joined Training Camp for {actionData.storeName}. We'll email
            you the first deck, <strong>Meet Ricky</strong>, in a minute.
            Finish all 5 to reach <strong>Hall of Flame</strong> and earn the
            Rushing Bonus.
          </p>
          <Link
            to="/vibes/decks"
            style={{
              display: 'inline-block',
              marginTop: 26,
              padding: '12px 24px',
              backgroundColor: BRAND.gold,
              color: BRAND.black,
              fontFamily: TEKO,
              fontSize: 20,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              textDecoration: 'none',
              borderRadius: 2,
            }}
          >
            View the 5 Decks →
          </Link>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div
        style={{
          padding: '24px 20px 12px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: BRAND.gold,
            fontFamily: TEKO,
            fontSize: 12,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
          }}
        >
          Training Camp
        </div>
        <div
          style={{
            fontFamily: TEKO,
            fontSize: 38,
            color: BRAND.white,
            textTransform: 'uppercase',
            lineHeight: 1,
            marginTop: 4,
          }}
        >
          Join the Roster
        </div>
        <div
          style={{
            marginTop: 6,
            color: BRAND.gray,
            fontFamily: BODY,
            fontSize: 14,
          }}
        >
          for {storeName}
        </div>
      </div>

      <Form method="post" style={{padding: '18px 20px 32px'}}>
        <Field name="first_name" label="First name" required />
        <Field name="last_name" label="Last name" required />
        <Field name="email" label="Email" type="email" required />
        <Field name="phone" label="Phone (optional)" type="tel" />

        <fieldset style={{border: 'none', padding: 0, marginTop: 18}}>
          <legend
            style={{
              fontFamily: BODY,
              fontSize: 12,
              color: BRAND.gray,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 8,
            }}
          >
            Role
          </legend>
          <div style={{display: 'flex', gap: 8}}>
            {(['Budtender', 'Manager', 'Owner'] as const).map((r) => (
              <label
                key={r}
                style={{
                  flex: 1,
                  display: 'block',
                  padding: '10px 8px',
                  textAlign: 'center',
                  border: `1px solid rgba(255,255,255,0.2)`,
                  borderRadius: 2,
                  fontFamily: BODY,
                  fontSize: 14,
                  color: BRAND.white,
                  cursor: 'pointer',
                }}
              >
                <input
                  type="radio"
                  name="role"
                  value={r}
                  defaultChecked={r === 'Budtender'}
                  style={{marginRight: 6}}
                />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        {actionData && !actionData.ok ? (
          <div
            style={{
              marginTop: 16,
              padding: '10px 12px',
              background: 'rgba(255, 59, 48, 0.12)',
              border: '1px solid rgba(255, 59, 48, 0.4)',
              color: '#FF3B30',
              fontFamily: BODY,
              fontSize: 13,
              borderRadius: 2,
            }}
            role="alert"
          >
            {actionData.error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: 22,
            width: '100%',
            height: 52,
            backgroundColor: BRAND.gold,
            color: BRAND.black,
            fontFamily: TEKO,
            fontSize: 22,
            textTransform: 'uppercase',
            letterSpacing: '0.04em',
            border: 'none',
            borderRadius: 2,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Joining…' : "I'm in →"}
        </button>

        <p
          style={{
            marginTop: 14,
            fontFamily: BODY,
            fontSize: 12,
            color: BRAND.gray,
            textAlign: 'center',
          }}
        >
          You'll get 5 short decks by email — one every few days. Unsubscribe
          anytime.
        </p>
      </Form>
    </Shell>
  );
}

function Field({
  name,
  label,
  type = 'text',
  required,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
}) {
  return (
    <label style={{display: 'block', marginTop: 12}}>
      <span
        style={{
          display: 'block',
          fontFamily: BODY,
          fontSize: 12,
          color: BRAND.gray,
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete="off"
        style={{
          width: '100%',
          height: 44,
          padding: '0 12px',
          background: BRAND.black,
          color: BRAND.white,
          border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 2,
          fontFamily: BODY,
          fontSize: 16,
          outline: 'none',
        }}
      />
    </label>
  );
}

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
      <div style={{maxWidth: 440, margin: '0 auto'}}>
        <header
          style={{
            padding: '20px 20px 0',
            display: 'flex',
            justifyContent: 'center',
          }}
        >
          <img
            src={LOGO_WHITE}
            alt="Highsman"
            style={{height: 28, width: 'auto'}}
          />
        </header>
        {children}
      </div>
    </div>
  );
}
