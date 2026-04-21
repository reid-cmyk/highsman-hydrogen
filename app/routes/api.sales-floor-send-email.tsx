import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Send Email via Gmail (sky@highsman.com)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-send-email
//   body (JSON): { to, subject, body, cc?, replyTo? }
//   → { ok: true, messageId } | { ok: false, error }
//
// Uses the same server-side Gmail refresh-token pattern as
// api.staff-expense-submit.tsx / api.goodies-receipt-submit.tsx. OAuth
// credentials stay on Oxygen as env vars — never touch the browser.
//
// Env vars used:
//   GMAIL_CLIENT_ID       — Google OAuth client ID for sky@highsman.com
//   GMAIL_CLIENT_SECRET   — OAuth client secret
//   GMAIL_REFRESH_TOKEN   — long-lived refresh token granted by sky@
//   GMAIL_SALES_FROM      — optional override, defaults to sky@highsman.com
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_SALES_FROM?: string;
};

const FROM_NAME = 'Highsman Sales';
const DEFAULT_FROM = 'sky@highsman.com';

// Module-scope Gmail access-token cache — avoids hammering Google's token
// endpoint (same 55-min TTL pattern used across the app).
let cachedGmailToken: string | null = null;
let gmailTokenExpiresAt = 0;

async function getGmailAccessToken(env: Env): Promise<string> {
  const now = Date.now();
  if (cachedGmailToken && now < gmailTokenExpiresAt) return cachedGmailToken;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID!,
      client_secret: env.GMAIL_CLIENT_SECRET!,
      refresh_token: env.GMAIL_REFRESH_TOKEN!,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {access_token: string; expires_in?: number};
  cachedGmailToken = data.access_token;
  gmailTokenExpiresAt = now + 55 * 60 * 1000;
  return cachedGmailToken!;
}

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

/** Convert plain-text template body → lightly-styled HTML (newlines → <br>). */
function bodyToHtml(plain: string): string {
  const safe = escapeHtml(plain || '').replace(/\n/g, '<br>');
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:15px;line-height:1.55;color:#111;max-width:640px;">${safe}</div>`;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Multipart/alternative MIME: plain + HTML so all clients render correctly. */
function buildMimeMessage(m: {
  fromName: string;
  fromAddress: string;
  to: string;
  cc?: string | null;
  replyTo?: string | null;
  subject: string;
  textBody: string;
  htmlBody: string;
}): Uint8Array {
  const boundary = `hm_${Math.random().toString(36).slice(2, 14)}`;
  const lines = [
    `From: ${m.fromName} <${m.fromAddress}>`,
    `To: ${m.to}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${m.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    m.textBody,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 7bit`,
    '',
    m.htmlBody,
    '',
    `--${boundary}--`,
    '',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

async function sendViaGmail(
  env: Env,
  payload: {
    to: string;
    subject: string;
    textBody: string;
    cc?: string | null;
    replyTo?: string | null;
    from: string;
  },
): Promise<string> {
  const token = await getGmailAccessToken(env);

  const mime = buildMimeMessage({
    fromName: FROM_NAME,
    fromAddress: payload.from,
    to: payload.to,
    cc: payload.cc || null,
    replyTo: payload.replyTo || null,
    subject: payload.subject,
    textBody: payload.textBody,
    htmlBody: bodyToHtml(payload.textBody),
  });

  const raw = base64UrlEncode(mime);
  const res = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({raw}),
    },
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail send ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as {id?: string};
  return data.id || '';
}

// ─── Action ──────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as Env;
  const configured =
    env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN;
  if (!configured) {
    return json(
      {ok: false, error: 'Gmail not configured on this deploy (missing GMAIL_* env vars).'},
      {status: 503},
    );
  }

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

  const from = (env.GMAIL_SALES_FROM || DEFAULT_FROM).trim();

  try {
    const messageId = await sendViaGmail(env, {
      to,
      subject,
      textBody: body,
      cc,
      replyTo,
      from,
    });
    return json({ok: true, messageId, from});
  } catch (err: any) {
    console.error('[sales-floor-send-email] send error:', err.message);
    return json(
      {ok: false, error: err.message || 'Gmail send failed.'},
      {status: 502},
    );
  }
}
