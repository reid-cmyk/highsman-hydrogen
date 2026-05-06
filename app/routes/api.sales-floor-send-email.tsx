import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, findRepById} from '../lib/sales-floor-reps';
import {isGmailSAConfigured, sendEmailFromUser} from '../lib/gmail-sa';
import {isStagingAuthed} from '~/lib/staging-auth';
import {getSFToken} from '~/lib/sf-auth.server';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Send Email (Service Account, Domain-Wide Delegation)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-send-email
//   body (JSON): { to, subject, body, cc?, replyTo? }
//   → { ok: true, messageId, from } | { ok: false, error }
//
// History:
//   v1 — per-rep OAuth refresh tokens. Each rep had GMAIL_CLIENT_ID /
//        SECRET / REFRESH_TOKEN env vars pointing at their personal mailbox.
//        Worked, but had two failure modes:
//          a) The refresh token gets issued from the wrong mailbox (e.g.
//             spark@ instead of sky@) and Gmail silently rewrites the From
//             header back to the authenticated mailbox — resulting in Sky's
//             customer emails arriving as `spark@highsman.com`.
//          b) Adding a new rep meant provisioning a new OAuth consent flow
//             + three new env vars + waiting for someone with that mailbox's
//             password to complete the dance.
//   v2 — switched to gmail-sa.ts. The Workspace SA
//        `highsman-brief-reader@highsman.iam.gserviceaccount.com` (Client
//        ID 102137292617151899463) already has gmail.send via domain-wide
//        delegation in admin.google.com. It can impersonate ANY active
//        @highsman.com mailbox — no per-rep tokens, no rewrite, no consent
//        flow per rep. Adding a new rep = one entry in sales-floor-reps.ts.
//
// Auth: rep cookie (sales_floor_rep). The cookie identifies WHO is sending,
// the rep's `email` is what we impersonate. The body signature still uses
// rep.signature so plain-text clients see the rep's name.
// ─────────────────────────────────────────────────────────────────────────────

function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

/** Escape the minimal set needed to preserve text inside an HTML body. */
function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Convert plain-text template body → lightly-styled HTML (newlines → <br>).
 *  Preserves the styling the v1 endpoint used so existing emails render the
 *  same after the SA swap — recipients shouldn't notice the backend change.
 *  We pass this as `htmlBody` to sendEmailFromUser instead of relying on the
 *  helper's default plainToHtml, so nothing about the visible message changes. */
function bodyToHtml(plain: string): string {
  const safe = escapeHtml(plain || '').replace(/\n/g, '<br>');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:640px;">${safe}</div>`;
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  // Try old sales-floor cookie first; fall back to staging auth (sf_token / staging password)
  const cookie = request.headers.get('Cookie') || '';
  let rep = getRepFromRequest(request);
  if (!rep && (isStagingAuthed(cookie) || getSFToken(cookie))) {
    rep = findRepById('sky'); // staging defaults to Sky's mailbox
  }
  if (!rep) {
    return json(
      {ok: false, error: 'Not logged in as a sales rep. Reload /sales-floor to sign in.'},
      {status: 401},
    );
  }

  const env = context.env as Record<string, string | undefined>;

  // SA configuration check — surface a clean 503 if GOOGLE_SA_CLIENT_EMAIL /
  // GOOGLE_SA_PRIVATE_KEY are missing in this deploy. Saves callers from
  // chasing cryptic Google JWT errors.
  if (!isGmailSAConfigured(env)) {
    return json(
      {
        ok: false,
        error:
          'Gmail service account not configured on this deploy (missing GOOGLE_SA_CLIENT_EMAIL or GOOGLE_SA_PRIVATE_KEY).',
      },
      {status: 503},
    );
  }

  // Resolve the impersonation target. We prefer the rep's primary email
  // (`rep.email`) over anything in rep.gmail.* — the gmail.* config
  // exists for legacy v1 OAuth tokens which we no longer need, but
  // `rep.email` is the canonical "who is this rep" mailbox.
  const fromUser = rep.email.trim().toLowerCase();
  if (!isValidEmail(fromUser)) {
    return json(
      {ok: false, error: `Rep ${rep.id} has no usable email on file.`},
      {status: 500},
    );
  }

  // Display name — keeps the existing "Sky Lima — Highsman" treatment so
  // the From header in the recipient inbox reads as a person, not a brand.
  const fromName = rep.gmail.fromName || rep.displayName;

  // Accept JSON or form-encoded bodies.
  let payload: any;
  try {
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      payload = await request.json();
    } else {
      const form = await request.formData();
      payload = Object.fromEntries(form.entries());
    }
  } catch {
    return json({ok: false, error: 'Invalid request body.'}, {status: 400});
  }

  const to = String(payload.to || '').trim();
  const subject = String(payload.subject || '').trim();
  const body = String(payload.body || '').trim();
  const cc = String(payload.cc || '').trim() || null;
  const replyTo = String(payload.replyTo || '').trim() || null;

  if (!isValidEmail(to)) {
    return json({ok: false, error: 'A valid "to" email is required.'}, {status: 400});
  }
  if (!subject) {
    return json({ok: false, error: 'Subject is required.'}, {status: 400});
  }
  if (!body) {
    return json({ok: false, error: 'Message body is required.'}, {status: 400});
  }
  if (cc && !isValidEmail(cc)) {
    return json({ok: false, error: 'Invalid "cc" email.'}, {status: 400});
  }
  if (replyTo && !isValidEmail(replyTo)) {
    return json({ok: false, error: 'Invalid "replyTo" email.'}, {status: 400});
  }

  try {
    const messageId = await sendEmailFromUser(
      fromUser,
      {
        to,
        subject,
        textBody: body,
        htmlBody: bodyToHtml(body),
        cc,
        replyTo,
        fromName,
      },
      env,
    );
    return json({
      ok: true,
      messageId,
      from: fromUser,
      rep: {id: rep.id, firstName: rep.firstName},
    });
  } catch (err: any) {
    console.error('[sales-floor-send-email] send error:', err.message);
    // Surface the Google error verbatim — typical causes (still possible
    // even with SA path):
    //   • Domain-wide delegation not authorized for gmail.send → admin
    //     console fix, not code.
    //   • fromUser mailbox doesn't exist or was suspended → check Workspace.
    //   • Daily Gmail quota exceeded → wait, or split sends across mailboxes.
    return json(
      {ok: false, error: err.message || 'Gmail send failed.'},
      {status: 502},
    );
  }
}
