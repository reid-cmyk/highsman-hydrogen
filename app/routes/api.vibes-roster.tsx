/**
 * api.vibes-roster.tsx
 *
 * POST /api/vibes-roster
 *
 * Inline roster editor on the VibesTrainingPanel posts here. Writes the
 * budtender headcount for a store into Supabase via the set_store_headcount()
 * RPC, which also captures the previous value in vibes_store_profile_audit
 * for recoverable fat-finger edits.
 *
 * Roster is the DENOMINATOR for the /vibes "% enrolled" bar. It lives in
 * Postgres — not Klaviyo — because Klaviyo has no concept of "total staff on
 * payroll." Enrollment (the numerator) still comes from Klaviyo via
 * vibes-klaviyo-training.ts.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
};

function bad(msg: string, status = 400) {
  return json({ok: false, error: msg}, {status});
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') return bad('Method not allowed', 405);

  const env = context.env as Env;
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) {
    return bad('Supabase not configured', 500);
  }

  const form = await request.formData();
  const accountId = String(form.get('account_id') || '').trim();
  const accountName = String(form.get('account_name') || '').trim() || null;
  const headcountRaw = String(form.get('headcount') || '').trim();
  const repId = String(form.get('rep_id') || '').trim() || null;

  if (!accountId) return bad('Missing account_id');

  const headcount = Number(headcountRaw);
  if (!Number.isFinite(headcount) || headcount < 0 || headcount > 200) {
    return bad('Headcount must be between 0 and 200.');
  }

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/rpc/set_store_headcount`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: env.SUPABASE_SERVICE_KEY,
          Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
        },
        body: JSON.stringify({
          p_account_id: accountId,
          p_account_name: accountName,
          p_headcount: Math.floor(headcount),
          p_rep_id: repId,
        }),
      },
    );

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error('set_store_headcount failed', res.status, text.slice(0, 200));
      return bad("Couldn't save roster. Try again.", 502);
    }

    const row = await res.json().catch(() => null);
    return json({ok: true, profile: row});
  } catch (err) {
    console.error('api.vibes-roster error', err);
    return bad('Unexpected error saving roster.', 500);
  }
}

export async function loader() {
  return new Response('Method not allowed', {status: 405});
}
