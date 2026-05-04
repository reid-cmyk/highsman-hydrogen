/**
 * app/routes/api.org-search.tsx
 * GET /api/org-search?q=premo  → returns up to 6 matching orgs from Supabase
 * Uses service key (server-side only). Called by New Account modal.
 */

import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

export async function loader({request, context}: LoaderFunctionArgs) {
  const _sfCk = request.headers.get('Cookie')||''; if (!isStagingAuthed(_sfCk) && !getSFToken(_sfCk)) {
    return json({results: []}, {status: 401});
  }
  const env = (context as any).env;
  const url = new URL(request.url);
  const q = (url.searchParams.get('q') || '').trim();
  if (q.length < 2) return json({results: []});

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,market_state,city,lifecycle_stage&name=ilike.*${encodeURIComponent(q)}*&limit=6`,
      {headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`}},
    );
    const rows = await res.json();
    return json({results: Array.isArray(rows) ? rows : []});
  } catch {
    return json({results: []});
  }
}
