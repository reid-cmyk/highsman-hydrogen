/**
 * app/routes/api.org-note-add.tsx
 *
 * POST /api/org-note-add
 * Adds a note to an org. Called from the account detail page.
 * Requires sales_staging_auth cookie.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  if (!isStagingAuthed(cookie) && !getSFToken(cookie)) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  const formData = await request.formData();
  const org_id = String(formData.get('org_id') || '').trim();
  const body = String(formData.get('body') || '').trim();

  if (!org_id || !body) {
    return json({ok: false, error: 'org_id and body required'}, {status: 400});
  }

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/org_notes`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      organization_id: org_id,
      author_name: 'Sky Lima',   // default until per-user logins exist
      body,
      pinned: false,
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return json({ok: false, error: `Supabase error: ${res.status} ${txt}`}, {status: 500});
  }

  const note = await res.json();
  return json({ok: true, note: Array.isArray(note) ? note[0] : note});
}

// No loader — POST only
export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
