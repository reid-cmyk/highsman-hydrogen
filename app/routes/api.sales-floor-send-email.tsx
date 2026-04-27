import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, type SalesRep} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Send Email (per-rep Gmail OAuth)
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/sales-floor-send-email
//   body (JSON): { to, subject, body, cc?, replyTo? }
//   → { ok: true, messageId, from } | { ok: false, error }
//
// Each logged-in rep has their own Gmail OAuth credential triple pointed to
// their personal @highsman.com mailbox (see app/lib/sales-floor-reps.ts). The
// resolver:
//   1. Reads `sales_floor_rep` cookie → rep registry entry
//   2. Looks up the env var NAMES in that entry
//   3. Pulls the actual credentials off context.env (set in Oxygen)
//   4. Sends the message as that rep's mailbox
//
// No rep = 401. No env vars for a configured rep = 503 (tells the caller
// the deploy is missing their credentials). Any other failure surfaces the
// Google error message verbatim so debugging stays easy.
// ─────────────────────────────────────────────────────────────────────────────

// Per-rep token cache: one entry per rep id. Without this we'd hammer
// Google's token endpoint on every send AND leak one rep's token to another
// in the cross-rep case. 55-min TTL mirrors the Zoho pattern.
type TokenCacheEntry = {token: string; expiresAt: number};
const gmailTokenCache = new Map<string, TokenCacheEntry>();

type RepEnv = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
  fromName: string;
};

// Resolve the logged-in rep's Gmail environment from the Oxygen env bag.
// Returns null if any required credential is missing so the caller can
// surface a clean "not configured" error instead of a cryptic Google failure.
function resolveRepEnv(rep: SalesRep, env: Record<string, string | undefined>): RepEnv | null {
  const clientId = env[rep.gmail.clientIdVar];
  const clientSecret = env[rep.gmail.clientSecretVar];
  const refreshToken = env[rep.gmail.refreshTokenVar];
  if (!clientId || !clientSecret || !refreshToken) return null;

  const fromOverride = rep.gmail.fromVar ? env[rep.gmail.fromVar] : undefined;
  const from = (fromOverride || rep.gmail.defaultFrom).trim();

  return {
    clientId,
    clientSecret,
    refreshToken,
    from,
    fromName: rep.gmail.fromName,
  };
}

async function getGmailAccessToken(repId: string, cfg: RepEnv): Promise<string> {
  const now = Date.now();
  const cached = gmailTokenCache.get(repId);
  if (cached && now < cached.expiresAt) return cached.token;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: cfg.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Gmail token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = (await res.json()) as {access_token: string; expires_in?: number};
  gmailTokenCache.set(repId, {
    token: data.access_token,
    expiresAt: now + 55 * 60 * 1000,
  });
  return data.access_token;
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

// ─── RFC 2047 header encoding ────────────────────────────────────────────────
// Email headers (Subject, From display name, etc.) are spec'd as ASCII. Any
// non-ASCII byte that ships raw can be re-decoded by downstream relays as
// Latin-1 and end up as mojibake — that's how an em-dash "—" arrived in
// Reid's inbox as "Ã¢Â€Â—" (UTF-8 → cp1252 → UTF-8 double round-trip).
// RFC 2047 fixes this with =?UTF-8?B?<base64>?= encoded-words.
function isAscii(s: string): boolean {
  // eslint-disable-next-line no-control-regex
  return !/[^\x20-\x7E]/.test(s);
}

function utf8ToBase64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** RFC 2047 encoded-word for a single header value (Subject etc.). Pass-through
 *  if the value is already ASCII so plain English subjects stay readable in
 *  the raw MIME for ops debugging. */
function encodeHeaderValue(value: string): string {
  const v = String(value || '');
  if (!v) return '';
  if (isAscii(v)) return v;
  return `=?UTF-8?B?${utf8ToBase64(v)}?=`;
}

/** Encode an address with optional display name. Quoted form for ASCII names
 *  with special chars; encoded-word for non-ASCII display names. */
function encodeAddressHeader(addr: string, displayName?: string | null): string {
  const a = String(addr || '').trim();
  const dn = (displayName || '').trim();
  if (!dn) return a;
  if (!isAscii(dn)) return `${encodeHeaderValue(dn)} <${a}>`;
  // ASCII name with RFC 5322 specials (parens, commas, etc.) needs quoting.
  if (/[(),;:\\<>@[\]"]/.test(dn)) return `"${dn.replace(/"/g, '\\"')}" <${a}>`;
  return `${dn} <${a}>`;
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
  // Headers that may carry non-ASCII (Subject, From display name) get RFC 2047
  // encoded-words so downstream clients render UTF-8 correctly. Body parts
  // declare 8bit so em-dashes and other UTF-8 chars in the body don't get
  // mangled by transports that assumed 7bit-only.
  const lines = [
    `From: ${encodeAddressHeader(m.fromAddress, m.fromName)}`,
    `To: ${m.to}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    ...(m.replyTo ? [`Reply-To: ${m.replyTo}`] : []),
    `Subject: ${encodeHeaderValue(m.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    '',
    m.textBody,
    '',
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    '',
    m.htmlBody,
    '',
    `--${boundary}--`,
    '',
  ];
  return new TextEncoder().encode(lines.join('\r\n'));
}

async function sendViaGmail(
  repId: string,
  cfg: RepEnv,
  payload: {
    to: string;
    subject: string;
    textBody: string;
    cc?: string | null;
    replyTo?: string | null;
  },
): Promise<string> {
  const token = await getGmailAccessToken(repId, cfg);

  const mime = buildMimeMessage({
    fromName: cfg.fromName,
    fromAddress: cfg.from,
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

  const rep = getRepFromRequest(request);
  if (!rep) {
    return json(
      {ok: false, error: 'Not logged in as a sales rep. Reload /sales-floor to sign in.'},
      {status: 401},
    );
  }

  const env = context.env as Record<string, string | undefined>;
  const repEnv = resolveRepEnv(rep, env);
  if (!repEnv) {
    return json(
      {
        ok: false,
        error: `Gmail not configured for ${rep.firstName} on this deploy (missing ${rep.gmail.clientIdVar} / ${rep.gmail.clientSecretVar} / ${rep.gmail.refreshTokenVar}).`,
      },
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

  try {
    const messageId = await sendViaGmail(rep.id, repEnv, {
      to,
      subject,
      textBody: body,
      cc,
      replyTo,
    });
    return json({
      ok: true,
      messageId,
      from: repEnv.from,
      rep: {id: rep.id, firstName: rep.firstName},
    });
  } catch (err: any) {
    console.error('[sales-floor-send-email] send error:', err.message);
    return json(
      {ok: false, error: err.message || 'Gmail send failed.'},
      {status: 502},
    );
  }
}
