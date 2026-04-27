import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {AwsClient} from 'aws4fetch';
import {encodeHeaderValue, encodeAddressHeader} from '~/lib/email-headers';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/goodies-receipt-submit
// ─────────────────────────────────────────────────────────────────────────────
// When Serena (or any Vibes rep) buys goodies for a specific dispensary, she
// snaps the receipt on her phone, types the amount + tags the dispensary,
// and submits. This endpoint:
//
//   1. Uploads the receipt photo to Cloudflare R2
//   2. Inserts a row in Supabase `goodie_receipts` (audit trail)
//   3. Sends the receipt via Gmail API from spark@highsman.com →
//      greensparkllc@bill.com (with rep + dispensary tagged in the subject
//      so Bill.com's inbox parser can auto-file it for reimbursement).
//      Sent mail lands in spark@highsman.com's real Sent folder so replies
//      route back to a monitored mailbox.
//
// Works in two contexts:
//   A. Mid-visit (Drop step) — `visitId` is included so we can link receipt
//      → visit for later reporting
//   B. Standalone page `/vibes/receipts` — ad-hoc upload before any visit
//      starts (Serena buys early, hands out across multiple stores)
//
// Email send is non-fatal — if Gmail API returns non-2xx, we still persist
// the row (with `email_error` set) so ops can retry manually. The rep's
// upload always succeeds as long as R2 + Supabase are healthy.
// ─────────────────────────────────────────────────────────────────────────────

type Env = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
  R2_ACCOUNT_ID?: string;
  R2_ACCESS_KEY_ID?: string;
  R2_SECRET_ACCESS_KEY?: string;
  R2_BUCKET?: string;
  R2_PUBLIC_URL?: string;
  // Gmail OAuth (same pattern as ZOHO_* creds). Client issued in GCP with
  // https://www.googleapis.com/auth/gmail.send scope for spark@highsman.com.
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
};

// Bill.com inbox parser endpoint for Green Spark LLC reimbursements.
const BILL_DOT_COM_EMAIL = 'greensparkllc@bill.com';
const FROM_NAME = 'Highsman Spark Team';
const FROM_ADDRESS = 'spark@highsman.com';
// Keep a CC copy on the Highsman side so Reid can audit from his inbox.
const AUDIT_CC = 'reid@highsman.com';

// Module-scope Gmail access-token cache (per worker instance). Same pattern
// as the Zoho token cache elsewhere — avoids 400 "too many requests" on
// rapid consecutive submits.
let cachedGmailToken: string | null = null;
let gmailTokenExpiresAt = 0;

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, message: 'Method not allowed'}, {status: 405});
  }

  const env = context.env as Env;
  const storageReady = Boolean(
    env.SUPABASE_URL &&
      env.SUPABASE_SERVICE_KEY &&
      env.R2_ACCOUNT_ID &&
      env.R2_ACCESS_KEY_ID &&
      env.R2_SECRET_ACCESS_KEY &&
      env.R2_BUCKET &&
      env.R2_PUBLIC_URL,
  );

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ok: false, message: 'Could not parse form data'}, {status: 400});
  }

  // ─── Validate required fields ──────────────────────────────────────────────
  const repId = String(form.get('repId') || '').trim();
  const repName = String(form.get('repName') || '').trim();
  const accountId = String(form.get('accountId') || '').trim();
  const accountName = String(form.get('accountName') || '').trim();
  const accountState =
    String(form.get('accountState') || '').trim().toUpperCase() || null;
  const amountRaw = form.get('amount');
  const amount = amountRaw != null ? Number(amountRaw) : NaN;
  const vendor = String(form.get('vendor') || '').trim() || null;
  const notes = String(form.get('notes') || '').trim() || null;
  const visitId = String(form.get('visitId') || '').trim() || null;

  if (!repId || !repName) {
    return json({ok: false, message: 'Missing rep info.'}, {status: 400});
  }
  if (!accountName) {
    return json(
      {ok: false, message: 'Tag which dispensary this receipt is for.'},
      {status: 400},
    );
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return json({ok: false, message: 'Enter the receipt amount.'}, {status: 400});
  }

  const photoField = form.get('receiptPhoto');
  const photoFile =
    photoField instanceof File && photoField.size > 0 ? photoField : null;
  if (!photoFile) {
    return json({ok: false, message: 'Attach the receipt photo.'}, {status: 400});
  }

  // ─── STUB mode (no storage configured) ─────────────────────────────────────
  if (!storageReady) {
    console.log('[goodies-receipt] stub submission', {
      repName,
      accountName,
      amount,
      vendor,
      photo: {name: photoFile.name, size: photoFile.size},
    });
    return json({
      ok: true,
      id: `stub-${Date.now()}`,
      message: 'Logged in stub mode (Supabase/R2 not yet configured).',
    });
  }

  const receiptId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  // ─── Upload receipt to R2 ──────────────────────────────────────────────────
  let receiptUrl: string;
  let photoBytes: ArrayBuffer;
  let photoMime: string;
  try {
    photoBytes = await photoFile.arrayBuffer();
    photoMime = photoFile.type || 'image/jpeg';
    receiptUrl = await uploadReceiptToR2(env, receiptId, photoFile, photoBytes);
  } catch (err) {
    console.error('[goodies-receipt] R2 upload failed', err);
    return json(
      {ok: false, message: 'Photo upload failed — try again.'},
      {status: 502},
    );
  }

  // ─── Insert row in Supabase (pre-email) ────────────────────────────────────
  const row = {
    id: receiptId,
    visit_id: visitId && isUuid(visitId) ? visitId : null,
    rep_id: repId,
    rep_name: repName,
    account_id: accountId || null,
    account_name: accountName,
    account_state: accountState,
    amount,
    vendor,
    notes,
    receipt_photo_url: receiptUrl,
  };
  try {
    const r = await supaPost(env, 'goodie_receipts', row);
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      console.error('[goodies-receipt] insert failed', r.status, text);
      return json(
        {
          ok: false,
          message:
            'Upload succeeded but DB insert failed. Ref: ' + receiptId.slice(-8),
        },
        {status: 502},
      );
    }
  } catch (err) {
    console.error('[goodies-receipt] insert threw', err);
    return json({ok: false, message: 'Could not save receipt.'}, {status: 502});
  }

  // ─── Send via Gmail API (non-fatal) ────────────────────────────────────────
  let emailId: string | null = null;
  let emailError: string | null = null;
  const gmailReady =
    env.GMAIL_CLIENT_ID && env.GMAIL_CLIENT_SECRET && env.GMAIL_REFRESH_TOKEN;
  if (gmailReady) {
    try {
      emailId = await sendReceiptViaGmail(env, {
        repName,
        accountName,
        accountState,
        amount,
        vendor,
        notes,
        receiptUrl,
        photoBytes,
        photoMime,
        photoFilename: photoFile.name || `receipt-${receiptId.slice(-8)}.jpg`,
      });
    } catch (err: any) {
      emailError = err?.message ? String(err.message).slice(0, 500) : 'unknown';
      console.warn('[goodies-receipt] Gmail send failed (non-fatal)', err);
    }
  } else {
    emailError = 'GMAIL_* env vars not configured';
    console.warn('[goodies-receipt] skipping email — GMAIL_* env vars missing');
  }

  // Patch the row with email audit info
  try {
    await supaPatch(env, 'goodie_receipts', receiptId, {
      emailed_to: BILL_DOT_COM_EMAIL,
      emailed_at: emailId ? new Date().toISOString() : null,
      email_id: emailId,
      email_error: emailError,
    });
  } catch (err) {
    console.warn('[goodies-receipt] audit patch failed (non-fatal)', err);
  }

  return json({
    ok: true,
    id: receiptId,
    receiptUrl,
    emailSent: Boolean(emailId),
    emailError,
    message: emailId
      ? `Receipt sent to Bill.com and filed.`
      : `Receipt saved — email will be retried by ops.`,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────
function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}

async function supaPost(env: Env, table: string, body: any) {
  return fetch(`${env.SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: env.SUPABASE_SERVICE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
      prefer: 'return=minimal',
    },
    body: JSON.stringify(body),
  });
}

async function supaPatch(env: Env, table: string, id: string, body: any) {
  return fetch(
    `${env.SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: {
        'content-type': 'application/json',
        apikey: env.SUPABASE_SERVICE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
        prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
    },
  );
}

async function uploadReceiptToR2(
  env: Env,
  receiptId: string,
  file: File,
  body: ArrayBuffer,
): Promise<string> {
  const client = new AwsClient({
    accessKeyId: env.R2_ACCESS_KEY_ID!,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY!,
    service: 's3',
    region: 'auto',
  });

  const bucket = env.R2_BUCKET!;
  const accountId = env.R2_ACCOUNT_ID!;
  const publicBase = env.R2_PUBLIC_URL!.replace(/\/+$/, '');
  const yyyyMm = new Date().toISOString().slice(0, 7);
  const ext = pickExtension(file);
  const key = `goodie-receipts/${yyyyMm}/${receiptId}.${ext}`;
  const putUrl = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeURI(key)}`;
  const signed = await client.sign(putUrl, {
    method: 'PUT',
    body,
    headers: {
      'content-type': file.type || 'application/octet-stream',
      'content-length': String(body.byteLength),
    },
  });
  const res = await fetch(signed);
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`R2 PUT failed (${res.status}) for ${key}: ${errText}`);
  }
  return `${publicBase}/${key}`;
}

function pickExtension(file: File): string {
  const name = (file.name || '').toLowerCase();
  const dot = name.lastIndexOf('.');
  if (dot > -1 && dot < name.length - 1) {
    const ext = name.slice(dot + 1).replace(/[^a-z0-9]/g, '');
    if (ext.length <= 5) return ext;
  }
  const mime = (file.type || '').toLowerCase();
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('heic')) return 'heic';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('pdf')) return 'pdf';
  return 'bin';
}

// ─── Gmail API ──────────────────────────────────────────────────────────────
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
  // Google returns a fresh ~1hr token. Cache for 55 min to leave headroom.
  gmailTokenExpiresAt = now + 55 * 60 * 1000;
  return cachedGmailToken!;
}

async function sendReceiptViaGmail(
  env: Env,
  payload: {
    repName: string;
    accountName: string;
    accountState: string | null;
    amount: number;
    vendor: string | null;
    notes: string | null;
    receiptUrl: string;
    photoBytes: ArrayBuffer;
    photoMime: string;
    photoFilename: string;
  },
): Promise<string> {
  const token = await getGmailAccessToken(env);

  // Bill.com's parser keys off the subject. Short + consistent so they can
  // write rules that auto-categorize to the right dispensary GL code.
  const stateTag = payload.accountState ? ` (${payload.accountState})` : '';
  const subject = `Goodies Receipt — ${payload.repName} — ${payload.accountName}${stateTag} — $${payload.amount.toFixed(2)}`;

  const html = buildReceiptHtml(payload);
  const mime = buildMimeMessage({
    fromName: FROM_NAME,
    fromAddress: FROM_ADDRESS,
    to: BILL_DOT_COM_EMAIL,
    cc: AUDIT_CC,
    subject,
    html,
    attachment: {
      filename: payload.photoFilename,
      mime: payload.photoMime,
      bytes: payload.photoBytes,
    },
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

function buildReceiptHtml(payload: {
  repName: string;
  accountName: string;
  accountState: string | null;
  amount: number;
  vendor: string | null;
  notes: string | null;
  receiptUrl: string;
}): string {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #111;">
      <div style="border-bottom: 3px solid #FC4C02; padding-bottom: 12px; margin-bottom: 24px;">
        <div style="font-size: 24px; font-weight: 700; letter-spacing: 0.02em;">HIGHSMAN · GOODIES RECEIPT</div>
        <div style="font-size: 12px; color: #666; margin-top: 4px;">Auto-filed for Bill.com reimbursement</div>
      </div>

      <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
        <tr><td style="padding: 6px 0; color: #666; width: 140px;">Rep</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(payload.repName)}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Dispensary</td><td style="padding: 6px 0; font-weight: 600;">${escapeHtml(payload.accountName)}${payload.accountState ? ` <span style="color: #999;">(${escapeHtml(payload.accountState)})</span>` : ''}</td></tr>
        <tr><td style="padding: 6px 0; color: #666;">Amount</td><td style="padding: 6px 0; font-weight: 700; font-size: 20px; color: #FC4C02;">$${payload.amount.toFixed(2)}</td></tr>
        ${payload.vendor ? `<tr><td style="padding: 6px 0; color: #666;">Bought at</td><td style="padding: 6px 0;">${escapeHtml(payload.vendor)}</td></tr>` : ''}
        <tr><td style="padding: 6px 0; color: #666;">Submitted</td><td style="padding: 6px 0;">${new Date().toLocaleString('en-US', {timeZone: 'America/New_York'})} ET</td></tr>
      </table>

      ${
        payload.notes
          ? `<div style="margin-top: 16px; padding: 12px; background: #f7f7f7; border-left: 3px solid #999; font-size: 13px; color: #333;">${escapeHtml(payload.notes)}</div>`
          : ''
      }

      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #eee; font-size: 12px; color: #999;">
        Receipt photo attached · <a href="${payload.receiptUrl}" style="color: #FC4C02; text-decoration: none;">view online</a>
      </div>
    </div>
  `.trim();
}

// Builds an RFC 822 multipart/mixed message with an HTML body + binary attachment.
// Returns a Uint8Array (we base64url the whole thing before sending).
function buildMimeMessage(m: {
  fromName: string;
  fromAddress: string;
  to: string;
  cc?: string;
  subject: string;
  html: string;
  attachment: {filename: string; mime: string; bytes: ArrayBuffer};
}): Uint8Array {
  const boundary = `hm_${Math.random().toString(36).slice(2, 14)}`;
  // Headers run through shared RFC 2047 encoders so non-ASCII in subject /
  // From display name renders correctly. Body is 8bit so UTF-8 in the HTML
  // body survives 8BITMIME-aware transports.
  const headerLines = [
    `From: ${encodeAddressHeader(m.fromAddress, m.fromName)}`,
    `To: ${m.to}`,
    ...(m.cc ? [`Cc: ${m.cc}`] : []),
    `Subject: ${encodeHeaderValue(m.subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
  ];

  // HTML part
  const htmlPartLines = [
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: 8bit`,
    '',
    m.html,
    '',
  ];

  // Attachment part header
  const attHeaderLines = [
    `--${boundary}`,
    `Content-Type: ${m.attachment.mime}; name="${m.attachment.filename}"`,
    `Content-Disposition: attachment; filename="${m.attachment.filename}"`,
    `Content-Transfer-Encoding: base64`,
    '',
    '',
  ];

  const closingLines = ['', `--${boundary}--`, ''];

  const header = new TextEncoder().encode(headerLines.join('\r\n'));
  const htmlPart = new TextEncoder().encode(htmlPartLines.join('\r\n'));
  const attHeader = new TextEncoder().encode(attHeaderLines.join('\r\n'));

  // Base64 the attachment with 76-char line wrapping (RFC 2045).
  const attB64 = arrayBufferToBase64(m.attachment.bytes);
  const wrapped = attB64.match(/.{1,76}/g)?.join('\r\n') || attB64;
  const attBody = new TextEncoder().encode(wrapped + '\r\n');

  const closing = new TextEncoder().encode(closingLines.join('\r\n'));

  // Concat
  const total =
    header.length + htmlPart.length + attHeader.length + attBody.length + closing.length;
  const out = new Uint8Array(total);
  let off = 0;
  out.set(header, off); off += header.length;
  out.set(htmlPart, off); off += htmlPart.length;
  out.set(attHeader, off); off += attHeader.length;
  out.set(attBody, off); off += attBody.length;
  out.set(closing, off);
  return out;
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunk) as unknown as number[],
    );
  }
  return btoa(binary);
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
