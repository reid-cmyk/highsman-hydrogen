/**
 * app/routes/api.org-update.tsx
 *
 * PATCH /api/org-update
 * Handles all org field updates + onboarding step toggles.
 * Requires sales_staging_auth cookie.
 *
 * Body params:
 *   org_id        — required, UUID
 *   intent        — 'patch_field' | 'toggle_onboarding' | 'delete_note'
 *   field         — (patch_field) field name
 *   value         — (patch_field) new value
 *   step_key      — (toggle_onboarding) e.g. 'visual_merch_shipped'
 *   status        — (toggle_onboarding) 'complete' | 'not_started'
 *   note_id       — (delete_note) UUID
 */

import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';

const ALLOWED_FIELDS = new Set([
  'name','legal_name','phone','website','lifecycle_stage','tier',
  'payment_terms','do_not_contact','tags','online_menus',
  'budtender_count','sparkplug_enabled','allow_split_promos',
  'reorder_status','last_order_date','license_number','ein',
  'billing_street','billing_city','billing_state','billing_zip',
  'street_address','city','zip','market_state',
  'legal_name','preferred_contact_channel','reorder_cadence_days','reorder_suppressed',
  'pop_up_email','pop_up_link','last_pop_up_date',
  'staff_training_email','staff_training_link','last_staff_training_date','allow_split_promos',
]);

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;
  const cookie = request.headers.get('Cookie') || '';
  if (!isStagingAuthed(cookie)) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }

  const fd = await request.formData();
  const intent = String(fd.get('intent') || 'patch_field');
  const org_id = String(fd.get('org_id') || '').trim();
  if (!org_id) return json({ok: false, error: 'org_id required'}, {status: 400});

  const sbHeaders = {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
  };

  // ── Patch a single field ─────────────────────────────────────────────────
  if (intent === 'patch_field') {
    const field = String(fd.get('field') || '');
    if (!ALLOWED_FIELDS.has(field)) {
      return json({ok: false, error: `Field '${field}' not patchable`}, {status: 400});
    }
    let value: any = fd.get('value');
    // Type coercion
    if (field === 'do_not_contact' || field === 'sparkplug_enabled' || field === 'allow_split_promos') {
      value = value === 'true' || value === true;
    } else if (field === 'budtender_count') {
      value = value ? Number(value) : null;
    } else if (field === 'tags' || field === 'online_menus') {
      value = String(value).split(',').map((s: string) => s.trim()).filter(Boolean);
    } else if (value === '' || value === 'null') {
      value = null;
    }

    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`,
      {method: 'PATCH', headers: sbHeaders, body: JSON.stringify({[field]: value, updated_at: new Date().toISOString()})},
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return json({ok: false, error: `${res.status}: ${txt}`}, {status: 500});
    }
    return json({ok: true, field, value});
  }

  // ── Toggle onboarding step ───────────────────────────────────────────────
  if (intent === 'toggle_onboarding') {
    const step_key = String(fd.get('step_key') || '');
    const status = String(fd.get('status') || 'complete');
    if (!step_key) return json({ok: false, error: 'step_key required'}, {status: 400});

    const patch: any = {
      status,
      updated_at: new Date().toISOString(),
      completed_at: status === 'complete' ? new Date().toISOString() : null,
      completed_by_name: 'Sky Lima',
    };

    // Upsert — step might not exist yet
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/onboarding_steps?organization_id=eq.${org_id}&step_key=eq.${step_key}`,
      {method: 'PATCH', headers: {...sbHeaders, Prefer: 'return=representation,resolution=merge-duplicates'}, body: JSON.stringify(patch)},
    );
    const rows = await res.json().catch(() => []);

    // If no row existed, insert it
    if (!Array.isArray(rows) || rows.length === 0) {
      await fetch(`${env.SUPABASE_URL}/rest/v1/onboarding_steps`, {
        method: 'POST',
        headers: sbHeaders,
        body: JSON.stringify({organization_id: org_id, step_key, ...patch}),
      });
    }

    return json({ok: true, step_key, status});
  }

  // ── Delete a note ────────────────────────────────────────────────────────
  if (intent === 'delete_note') {
    const note_id = String(fd.get('note_id') || '');
    if (!note_id) return json({ok: false, error: 'note_id required'}, {status: 400});
    await fetch(`${env.SUPABASE_URL}/rest/v1/org_notes?id=eq.${note_id}`, {
      method: 'DELETE',
      headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`},
    });
    return json({ok: true, note_id});
  }

  // ── Delete account ───────────────────────────────────────────────────────
  if (intent === 'delete_account') {
    await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'DELETE',
      headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'return=minimal'},
    });
    return json({ok: true, intent: 'delete_account'});
  }

  // ── Update contact ────────────────────────────────────────────────────────
  if (intent === 'update_contact') {
    const contact_id = String(fd.get('contact_id') || '');
    if (!contact_id) return json({ok: false, error: 'contact_id required'}, {status: 400});
    const patch: any = {updated_at: new Date().toISOString()};
    for (const f of ['first_name','last_name','email','phone','job_role']) {
      const v = fd.get(f);
      if (v !== null) patch[f] = String(v).trim() || null;
    }
    const isPrimary = fd.get('is_primary');
    if (isPrimary !== null) patch.is_primary_buyer = isPrimary === 'true';
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/contacts?id=eq.${contact_id}`, {
      method: 'PATCH', headers: sbHeaders, body: JSON.stringify(patch),
    });
    if (!res.ok) { const txt = await res.text().catch(()=>''); return json({ok:false,error:`${res.status}: ${txt}`},{status:500}); }
    return json({ok: true, contact_id});
  }

  // ── Delete contact ────────────────────────────────────────────────────────
  if (intent === 'delete_contact') {
    const contact_id = String(fd.get('contact_id') || '');
    if (!contact_id) return json({ok: false, error: 'contact_id required'}, {status: 400});
    await fetch(`${env.SUPABASE_URL}/rest/v1/contacts?id=eq.${contact_id}`, {
      method: 'DELETE',
      headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`, Prefer: 'return=minimal'},
    });
    return json({ok: true, contact_id});
  }

  // ── Flag Pete ─────────────────────────────────────────────────────────────
  if (intent === 'flag_pete') {
    const orgRes = await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}&select=tags`, {
      headers: {apikey: env.SUPABASE_SERVICE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`},
    });
    const rows = await orgRes.json().catch(() => []);
    const currentTags: string[] = rows?.[0]?.tags || [];
    const hasPete = currentTags.includes('pete-followup');
    const newTags = hasPete ? currentTags.filter((t: string) => t !== 'pete-followup') : [...currentTags, 'pete-followup'];
    await fetch(`${env.SUPABASE_URL}/rest/v1/organizations?id=eq.${org_id}`, {
      method: 'PATCH',
      headers: sbHeaders,
      body: JSON.stringify({tags: newTags, updated_at: new Date().toISOString()}),
    });
    return json({ok: true, flagged: !hasPete});
  }

  return json({ok: false, error: 'unknown intent'}, {status: 400});
}

export async function loader() {
  return json({error: 'POST only'}, {status: 405});
}
