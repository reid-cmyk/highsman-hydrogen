/**
 * api.training-signup.tsx
 *
 * Remix action endpoint used by BOTH:
 *   (a) QR-code landing page (training.join.$storeToken) — signup_method='self_serve'
 *   (b) Serena's in-app manual form in the VibesTrainingPanel modal — signup_method='live'
 *
 * Architecture:
 *   • Klaviyo is the source of truth (shared w/ /staff-dashboard).
 *   • This action writes the profile → list WBSrLZ → fires signup metric.
 *   • Supabase `budtender_training` gets a mirror row for per-visit attribution
 *     (Serena's audit trail, live-toast realtime listener). It is NOT the
 *     enrollment count — /vibes reads from Klaviyo via vibes-klaviyo-training.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

import {subscribeBudtender} from '~/lib/vibes-klaviyo-training';

type Env = {
  KLAVIYO_PRIVATE_KEY?: string;
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

function bad(msg: string, status = 400) {
  return json({ok: false, error: msg}, {status});
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') return bad('Method not allowed', 405);

  const env = context.env as Env;
  const apiKey = env.KLAVIYO_PRIVATE_KEY;
  if (!apiKey) return bad('Klaviyo not configured', 500);

  const body = await request.formData();
  const firstName = String(body.get('first_name') || '').trim();
  const lastName = String(body.get('last_name') || '').trim();
  const email = String(body.get('email') || '').trim().toLowerCase();
  const phone = String(body.get('phone') || '').trim() || null;
  const role = String(body.get('role') || 'Budtender').trim();
  const storeAccountId = String(body.get('store_account_id') || '').trim();
  const storeAccountName =
    String(body.get('store_account_name') || '').trim() || null;
  const state = String(body.get('state') || '').trim() || null;
  const method = (String(body.get('method') || 'self_serve').trim() as
    | 'self_serve'
    | 'live');
  const repId = String(body.get('rep_id') || '').trim() || null;

  if (!firstName || !lastName || !email) {
    return bad('First name, last name, and email are required.');
  }
  if (!storeAccountId) {
    return bad('Missing store attribution — this signup link is invalid.');
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return bad('Please enter a valid email.');
  }

  // 1) Klaviyo — source of truth
  let klaviyoProfileId: string | null = null;
  try {
    klaviyoProfileId = await subscribeBudtender(apiKey, {
      email,
      firstName,
      lastName,
      phone,
      role,
      storeAccountId,
      storeAccountName,
      state,
      signupMethod: method,
      signedUpByRepId: repId,
    });
  } catch (err: any) {
    console.error('Klaviyo subscribe failed', err);
    return bad(
      "We couldn't save your signup right now. Try again in a minute.",
      502,
    );
  }

  // 2) Supabase — mirror for Serena's live toast + per-visit attribution.
  //    Non-fatal: if Supabase blips, the Klaviyo signup still succeeded.
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    try {
      await fetch(`${env.SUPABASE_URL}/rest/v1/rpc/upsert_training_signup`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          p_store_account_id: storeAccountId,
          p_store_account_name: storeAccountName,
          p_budtender_name: `${firstName} ${lastName}`,
          p_budtender_email: email,
          p_method: method,
          p_module_slug: 'training-camp-signup',
          p_rep_id: repId,
          p_klaviyo_profile_id: klaviyoProfileId,
        }),
      });
    } catch (err) {
      console.warn('Supabase mirror failed (non-fatal)', err);
    }
  }

  return json({
    ok: true,
    budtender_name: firstName,
    store_name: storeAccountName ?? 'your store',
    klaviyo_profile_id: klaviyoProfileId,
  });
}

// This route has no UI — return a 405 on GET.
export async function loader() {
  return new Response('Method not allowed', {status: 405});
}
