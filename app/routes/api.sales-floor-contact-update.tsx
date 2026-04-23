import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Inline contact field update (phone / mobile / email)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-contact-update
//   body: { module: 'Leads' | 'Contacts',
//           recordId: string,
//           patch: { Phone?: string, Mobile?: string, Email?: string } }
//   → { ok, module, recordId, patch }
//
// Lets a rep capture a phone number or email mid-call without leaving the
// Floor PWA. The card renderer shows "+ Add phone" / "+ Add email" pills in
// place of the disabled Call/Text/Email buttons whenever the field is empty;
// those pills open a bottom sheet that POSTs here.
//
// Only phone / mobile / email writes are allowed — this is intentional.
// Anything else (role, account linkage, notes) is low-frequency and belongs
// in the full Zoho record UI; the Brief drawer has an "Open in Zoho"
// deep-link for that path.
//
// Auth: same /sales-floor cookie as the rest of the dashboard. Returns 401
// unauthenticated, 400 for malformed input, 502 if Zoho rejects.
// ─────────────────────────────────────────────────────────────────────────────

// Shared token cache (Zoho rate-limits /oauth/v2/token aggressively without this)
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function getZohoToken(env: any): Promise<string> {
  if (!env.ZOHO_CLIENT_ID || !env.ZOHO_CLIENT_SECRET || !env.ZOHO_REFRESH_TOKEN) {
    throw new Error('Zoho not configured');
  }
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) return cachedToken;
  const res = await fetch('https://accounts.zoho.com/oauth/v2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.ZOHO_CLIENT_ID,
      client_secret: env.ZOHO_CLIENT_SECRET,
      refresh_token: env.ZOHO_REFRESH_TOKEN,
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Zoho token (${res.status}): ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + 55 * 60 * 1000;
  return cachedToken!;
}

// Very permissive validation — we trust reps to not typo their way into
// garbage data, but we reject clearly-broken input so Zoho doesn't 400 us.
function isLikelyPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}
function isLikelyEmail(raw: string): boolean {
  // Minimal: has an @ with at least one char on each side and a dot after it.
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw.trim());
}

// Light-touch phone canonicalization. Zoho accepts whatever string you send,
// but we write the formatted version so prettyPhone() picks it up consistently
// on the next sync and so clicking Call produces a working tel: link.
function canonicalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+1 (${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    const d = digits.slice(1);
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  // Non-US — leave as-is, just strip doubled spaces.
  return raw.trim().replace(/\s+/g, ' ');
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env || {};
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'unauthorized'}, {status: 401});
  }
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const mod = String(body?.module || '').trim();
  const recordId = String(body?.recordId || '').trim();
  const patch = body?.patch || {};

  if (mod !== 'Leads' && mod !== 'Contacts') {
    return json({ok: false, error: 'invalid module'}, {status: 400});
  }
  if (!/^\d{6,}$/.test(recordId)) {
    return json({ok: false, error: 'invalid recordId'}, {status: 400});
  }
  if (!patch || typeof patch !== 'object') {
    return json({ok: false, error: 'missing patch'}, {status: 400});
  }

  // Whitelist + validate fields. Anything outside Phone/Mobile/Email is
  // rejected — this route is not a general-purpose Zoho writer.
  const cleaned: Record<string, string> = {};
  for (const key of ['Phone', 'Mobile', 'Email'] as const) {
    if (patch[key] === undefined || patch[key] === null) continue;
    const raw = String(patch[key]).trim();
    if (!raw) continue;
    if (key === 'Email') {
      if (!isLikelyEmail(raw)) {
        return json({ok: false, error: `invalid email format`}, {status: 400});
      }
      cleaned.Email = raw;
    } else {
      if (!isLikelyPhone(raw)) {
        return json({ok: false, error: `invalid phone format`}, {status: 400});
      }
      cleaned[key] = canonicalizePhone(raw);
    }
  }

  if (Object.keys(cleaned).length === 0) {
    return json({ok: false, error: 'no valid fields to update'}, {status: 400});
  }

  try {
    const token = await getZohoToken(env);

    const res = await fetch(`https://www.zohoapis.com/crm/v7/${mod}/${recordId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data: [cleaned],
        // Skip workflow on inline field edits — reps are catching missing
        // data, not signaling a lead-stage change. Workflows on Mobile/Email
        // tend to fire welcome/re-engagement mails we do not want here.
        trigger: [],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.error('[contact-update]', mod, recordId, res.status, t.slice(0, 300));
      return json(
        {ok: false, error: `Zoho ${mod} update (${res.status})`, detail: t.slice(0, 300)},
        {status: 502},
      );
    }

    return json({ok: true, module: mod, recordId, patch: cleaned});
  } catch (err: any) {
    console.error('[contact-update] failed', mod, recordId, err.message);
    return json(
      {ok: false, error: err.message || 'Zoho update failed'},
      {status: 502},
    );
  }
}
