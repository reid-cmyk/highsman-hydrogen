/**
 * app/routes/api.contact-create.tsx
 * POST /api/contact-create
 * Creates a new contact linked to an org.
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const _sfCk = request.headers.get('Cookie')||''; if (!isStagingAuthed(_sfCk) && !getSFToken(_sfCk)) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
  const fd = await request.formData();
  const org_id = String(fd.get('org_id') || '').trim();
  const first_name = String(fd.get('first_name') || '').trim();
  const last_name = String(fd.get('last_name') || '').trim();
  const email = String(fd.get('email') || '').trim();
  const phone = String(fd.get('phone') || '').trim();
  const job_role = String(fd.get('job_role') || '').trim();
  const is_primary = fd.get('is_primary') === 'true';

  if (!org_id || !first_name) return json({ok: false, error: 'org_id and first_name required'}, {status: 400});

  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contacts`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      organization_id: org_id,
      first_name, last_name,
      email: email || null,
      phone: phone || null,
      job_role: job_role || null,
      is_primary_buyer: is_primary,
      do_not_contact: false,
      responsible_for: [],
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    return json({ok: false, error: `${res.status}: ${txt}`}, {status: 500});
  }
  const contact = await res.json();
  return json({ok: true, contact: Array.isArray(contact) ? contact[0] : contact});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
