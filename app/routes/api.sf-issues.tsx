/**
 * app/routes/api.sf-issues.tsx
 * /api/sf-issues — Customer issue CRUD for staging Sales Floor
 *
 * GET                         → list all issues, newest first
 * POST intent=create          → create new issue (generates ISS-XXXX ticket id)
 * POST intent=resolve         → mark an issue resolved
 *
 * Requires staging auth. No Zoho — issues stored in Supabase `customer_issues`.
 *
 * ── SQL to run once in Supabase SQL Editor ───────────────────────────────────
 *   CREATE TABLE customer_issues (
 *     id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     ticket_id    text UNIQUE NOT NULL,
 *     org_id       uuid,
 *     org_name     text,
 *     contact_name text,
 *     issue_type   text NOT NULL,
 *     severity     text NOT NULL DEFAULT 'Medium',
 *     description  text NOT NULL,
 *     date_of_issue date NOT NULL,
 *     reporter     text,
 *     status       text NOT NULL DEFAULT 'Open',
 *     resolved_at  timestamptz,
 *     created_at   timestamptz DEFAULT now(),
 *     updated_at   timestamptz DEFAULT now()
 *   );
 */

import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken, getSFUser} from '~/lib/sf-auth.server';

function auth(request: Request) {
  const cookie = request.headers.get('Cookie') || '';
  return isStagingAuthed(cookie) || !!getSFToken(cookie);
}

const sbH = (env: any) => ({
  apikey: env.SUPABASE_SERVICE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
  'Content-Type': 'application/json',
});

export async function loader({request, context}: LoaderFunctionArgs) {
  if (!auth(request)) return json({ok:false,error:'unauthorized'},{status:401});
  const env = (context as any).env;
  try {
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_issues?order=created_at.desc&limit=200`,
      {headers: sbH(env)},
    );
    const issues = res.ok ? await res.json().catch(() => []) : [];
    return json({ok:true, issues: Array.isArray(issues) ? issues : []});
  } catch {
    return json({ok:true, issues:[]});
  }
}

export async function action({request, context}: ActionFunctionArgs) {
  if (!auth(request)) return json({ok:false,error:'unauthorized'},{status:401});
  const env = (context as any).env;
  const h = sbH(env);

  const fd = await request.formData();
  const intent = String(fd.get('intent') || '');

  // ── Create issue ───────────────────────────────────────────────────────────
  if (intent === 'create') {
    const orgId       = String(fd.get('org_id')       || '').trim() || null;
    const orgName     = String(fd.get('org_name')     || '').trim();
    const contactName = String(fd.get('contact_name') || '').trim();
    const issueType   = String(fd.get('issue_type')   || '').trim();
    const severity    = String(fd.get('severity')     || 'Medium').trim();
    const description = String(fd.get('description')  || '').trim();
    const dateOfIssue = String(fd.get('date_of_issue')|| '').trim();
    const reporter    = String(fd.get('reporter')     || '').trim();

    if (!issueType || !description || !dateOfIssue) {
      return json({ok:false,error:'issue_type, description, date_of_issue required'},{status:400});
    }

    // Generate ticket id: count existing + 1
    let nextNum = 1;
    try {
      const countRes = await fetch(
        `${env.SUPABASE_URL}/rest/v1/customer_issues?select=id`,
        {headers: {...h, Prefer:'count=exact', Range:'0-0'}},
      );
      const cr = countRes.headers.get('Content-Range') || '';
      const total = parseInt(cr.split('/')[1] || '0', 10);
      if (!isNaN(total)) nextNum = total + 1;
    } catch { /* use 1 */ }
    const ticketId = 'ISS-' + String(nextNum).padStart(4, '0');

    const payload = {
      ticket_id: ticketId, org_id: orgId, org_name: orgName || null,
      contact_name: contactName || null, issue_type: issueType,
      severity, description, date_of_issue: dateOfIssue,
      reporter: reporter || null, status: 'Open',
    };

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/customer_issues`, {
      method:'POST',
      headers:{...h, Prefer:'return=representation'},
      body: JSON.stringify(payload),
    });
    const created = await res.json().catch(() => null);
    return json({ok: res.ok, issue: Array.isArray(created) ? created[0] : created, ticketId});
  }

  // ── Resolve issue ──────────────────────────────────────────────────────────
  if (intent === 'resolve') {
    const id = String(fd.get('id') || '').trim();
    if (!id) return json({ok:false,error:'id required'},{status:400});
    const res = await fetch(
      `${env.SUPABASE_URL}/rest/v1/customer_issues?id=eq.${id}`,
      {method:'PATCH', headers:h, body: JSON.stringify({status:'Resolved', resolved_at: new Date().toISOString(), updated_at: new Date().toISOString()})},
    );
    return json({ok: res.ok});
  }

  return json({ok:false,error:'unknown intent'},{status:400});
}
