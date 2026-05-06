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
  const orgId = url.searchParams.get('orgId') || '';
  const h = {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`};

  // ?orgId=<uuid> — fetch contacts for a specific org (used by email page)
  if (orgId) {
    try {
      const res = await fetch(
        `${env.SUPABASE_URL}/rest/v1/contacts?organization_id=eq.${orgId}&select=id,first_name,last_name,full_name,email,phone,mobile,is_primary_buyer,job_title,roles&order=is_primary_buyer.desc`,
        {headers: h},
      );
      const contacts = await res.json().catch(() => []);
      return json({contacts: Array.isArray(contacts) ? contacts : []});
    } catch {
      return json({contacts: []});
    }
  }

  if (q.length < 2) return json({results: []});

  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?select=id,name,market_state,city,lifecycle_stage&name=ilike.*${encodeURIComponent(q)}*&limit=6`,
      {headers: h},
    );
    const rows = await res.json();
    return json({results: Array.isArray(rows) ? rows : []});
  } catch {
    return json({results: []});
  }
}
