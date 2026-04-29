// ─────────────────────────────────────────────────────────────────────────────
// NJ Menu Auth — Magic Link Session System
// ─────────────────────────────────────────────────────────────────────────────
// Purpose: gate /njmenu behind a lightweight, low-friction auth flow.
//   1. Buyer enters email on /njmenu/login
//   2. If email matches a Zoho Contact → magic link emailed from spark@highsman.com
//      If no match → signup form → creates Zoho Account + Contact → magic link
//   3. Buyer clicks link → /njmenu/verify validates token → 90-day session cookie set
//   4. /njmenu loader reads cookie → pulls buyer identity (name, email, account,
//      licence) → feeds LeafLink order push automatically
//
// Design notes:
//   * Tokens are HMAC-signed with SESSION_SECRET (no DB required). Payload is
//     base64url JSON with email + expiry + nonce. Valid for 15 minutes.
//   * Session cookie is the same shape but valid for 90 days and signed
//     separately so a compromised magic link can't be reused as a session.
//   * All emails sent through Gmail API (reuses OAuth refresh token pattern
//     already in api.leaflink-order.tsx). From address is spark@highsman.com.
//   * Zoho reads/writes reuse the proven helpers in api.accounts.tsx logic.
// ─────────────────────────────────────────────────────────────────────────────

import {encodeHeaderValue, encodeAddressHeader} from './email-headers';

const AUTH_COOKIE_NAME = 'njmenu_session';
const SESSION_MAX_AGE = 90 * 24 * 60 * 60; // 90 days
const MAGIC_LINK_TTL_SECONDS = 15 * 60; // 15 minutes
const FROM_EMAIL = 'spark@highsman.com';

// ── Types ────────────────────────────────────────────────────────────────────

export interface BuyerSession {
  email: string;
  firstName: string;
  lastName: string;
  contactId: string;
  accountId: string;
  accountName: string;
  licenseNumber: string | null;
  role: string | null;
  phone: string | null;
  iat: number; // issued-at (unix seconds)
}

export interface MagicLinkPayload {
  email: string;
  purpose: 'login'; // reserved for future purposes (password-reset, etc.)
  exp: number; // unix seconds
  nonce: string;
}

// ── Crypto helpers (HMAC-SHA256 via WebCrypto — runs in Oxygen/Cloudflare) ──

async function hmac(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    {name: 'HMAC', hash: 'SHA-256'},
    false,
    ['sign', 'verify'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return b64urlEncode(bin);
}

function b64urlEncode(input: string): string {
  return btoa(input).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(input: string): string {
  const pad = input.length % 4 === 0 ? '' : '='.repeat(4 - (input.length % 4));
  return atob(input.replace(/-/g, '+').replace(/_/g, '/') + pad);
}

// Constant-time string compare (avoids timing side channels on signature check)
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Magic link tokens ────────────────────────────────────────────────────────

/** Sign a magic-link payload. Token format: <base64url(json)>.<base64url(hmac)> */
export async function signMagicLinkToken(
  email: string,
  secret: string,
): Promise<string> {
  const payload: MagicLinkPayload = {
    email: email.toLowerCase(),
    purpose: 'login',
    exp: Math.floor(Date.now() / 1000) + MAGIC_LINK_TTL_SECONDS,
    nonce: crypto.randomUUID(),
  };
  const body = b64urlEncode(JSON.stringify(payload));
  const sig = await hmac(`magic:${secret}`, body);
  return `${body}.${sig}`;
}

/** Verify a magic-link token. Returns the email if valid, null otherwise. */
export async function verifyMagicLinkToken(
  token: string,
  secret: string,
): Promise<string | null> {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await hmac(`magic:${secret}`, body);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  try {
    const payload = JSON.parse(b64urlDecode(body)) as MagicLinkPayload;
    if (payload.purpose !== 'login') return null;
    if (Math.floor(Date.now() / 1000) > payload.exp) return null;
    return payload.email;
  } catch {
    return null;
  }
}

// ── Session tokens (90-day cookie payload) ──────────────────────────────────

/** Sign a buyer session into a compact signed string suitable for a cookie. */
export async function signSession(
  session: BuyerSession,
  secret: string,
): Promise<string> {
  const body = b64urlEncode(JSON.stringify(session));
  const sig = await hmac(`session:${secret}`, body);
  return `${body}.${sig}`;
}

export async function verifySession(
  cookieValue: string,
  secret: string,
): Promise<BuyerSession | null> {
  const parts = cookieValue.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expectedSig = await hmac(`session:${secret}`, body);
  if (!timingSafeEqual(sig, expectedSig)) return null;
  try {
    const session = JSON.parse(b64urlDecode(body)) as BuyerSession;
    // 90-day expiry is enforced by the cookie Max-Age; we also double-check
    // against the issued-at so a leaked long-lived signed value can't outlive
    // the intended window.
    const ageSec = Math.floor(Date.now() / 1000) - session.iat;
    if (ageSec < 0 || ageSec > SESSION_MAX_AGE) return null;
    return session;
  } catch {
    return null;
  }
}

// ── Cookie helpers ───────────────────────────────────────────────────────────

/** Build a Set-Cookie header for a successful login. Path=/ so the session
 *  is usable on /njmenu and any future buyer-only routes (account page, etc.). */
export function buildSessionCookie(signedValue: string): string {
  return `${AUTH_COOKIE_NAME}=${signedValue}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE}`;
}

export function buildLogoutCookie(): string {
  return `${AUTH_COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function readCookie(header: string | null | undefined, name: string): string | null {
  if (!header) return null;
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** Pull the current authed buyer from a request's cookie, or null. Used as the
 *  single source of truth by every loader/action that needs buyer identity. */
export async function getBuyerFromRequest(
  request: Request,
  secret: string,
): Promise<BuyerSession | null> {
  const raw = readCookie(request.headers.get('Cookie'), AUTH_COOKIE_NAME);
  if (!raw) return null;
  return verifySession(raw, secret);
}

// ── Zoho helpers (scoped to auth flow) ──────────────────────────────────────
// These mirror the patterns in api.accounts.tsx but are owned by the auth
// module so the login route doesn't have to import a resource route.

interface ZohoEnv {
  ZOHO_CLIENT_ID: string;
  ZOHO_CLIENT_SECRET: string;
  ZOHO_REFRESH_TOKEN: string;
}

let cachedZohoToken: string | null = null;
let zohoTokenExpiresAt = 0;

export async function getZohoAccessToken(env: ZohoEnv): Promise<string> {
  const now = Date.now();
  if (cachedZohoToken && now < zohoTokenExpiresAt) return cachedZohoToken;
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
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho token refresh failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  cachedZohoToken = data.access_token;
  zohoTokenExpiresAt = now + 55 * 60 * 1000;
  return cachedZohoToken!;
}

export interface ZohoBuyer {
  contactId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: string | null;
  accountId: string;
  accountName: string;
  licenseNumber: string | null;
}

/** Look up a Contact by email; when found, also pulls the linked Account so
 *  we can stamp Account info (name, license #) onto the session. Returns null
 *  if no Contact exists with that email — the caller swaps into signup mode. */
export async function findZohoBuyerByEmail(
  email: string,
  accessToken: string,
): Promise<ZohoBuyer | null> {
  const url = new URL('https://www.zohoapis.com/crm/v7/Contacts/search');
  url.searchParams.set('criteria', `(Email:equals:${email})`);
  url.searchParams.set(
    'fields',
    'First_Name,Last_Name,Email,Phone,Mobile,Title,Account_Name',
  );
  url.searchParams.set('per_page', '1');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Zoho-oauthtoken ${accessToken}`},
  });
  if (res.status === 204) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Zoho contact search failed (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  const c = (data.data || [])[0];
  if (!c) return null;

  // Account_Name is returned as a lookup object: {id, name}. Fetch the full
  // Account to get license # (custom field) for the session payload.
  const accountRef = c.Account_Name || {};
  const accountId = accountRef.id || '';
  const accountName = accountRef.name || '';

  let licenseNumber: string | null = null;
  if (accountId) {
    const acctRes = await fetch(
      `https://www.zohoapis.com/crm/v7/Accounts/${accountId}?fields=License_Number,License,Cannabis_License,Account_Name`,
      {headers: {Authorization: `Zoho-oauthtoken ${accessToken}`}},
    );
    if (acctRes.ok) {
      const acctData = await acctRes.json();
      const acct = (acctData.data || [])[0] || {};
      licenseNumber =
        acct.License_Number || acct.License || acct.Cannabis_License || null;
    }
  }

  return {
    contactId: c.id,
    email: c.Email,
    firstName: c.First_Name || '',
    lastName: c.Last_Name || '',
    phone: c.Phone || c.Mobile || null,
    role: c.Title || null,
    accountId,
    accountName,
    licenseNumber,
  };
}

/** Create a new Zoho Account + linked Contact for a self-registered buyer.
 *  License # is first-class so downstream LeafLink license-match works. */
export async function createZohoBuyer(
  data: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    dispensaryName: string;
    licenseNumber: string;
    role: string;
  },
  accessToken: string,
): Promise<ZohoBuyer> {
  // 1. Create the Account (tagged so it's easy to find later)
  const accountRes = await fetch('https://www.zohoapis.com/crm/v7/Accounts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [
        {
          Account_Name: data.dispensaryName,
          Account_State: 'NJ',
          Billing_State: 'NJ',
          Shipping_State: 'NJ',
          Billing_Country: 'United States',
          Shipping_Country: 'United States',
          Phone: data.phone || null,
          License_Number: data.licenseNumber || null,
          Account_Type: 'Prospect',
          Description: `Self-registered via /njmenu login. First buyer: ${data.firstName} ${data.lastName} (${data.role}). License: ${data.licenseNumber || 'not provided'}.`,
        },
      ],
      trigger: ['workflow'],
    }),
  });

  if (!accountRes.ok) {
    const text = await accountRes.text().catch(() => '');
    throw new Error(`Zoho account creation failed (${accountRes.status}): ${text.slice(0, 500)}`);
  }
  const accountData = await accountRes.json();
  const accountRecord = accountData.data?.[0];
  if (accountRecord?.status !== 'success') {
    throw new Error(`Zoho account creation rejected: ${JSON.stringify(accountRecord?.details || {})}`);
  }
  const accountId = accountRecord.details.id;

  // 2. Create the Contact linked to the Account
  const contactRes = await fetch('https://www.zohoapis.com/crm/v7/Contacts', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: [
        {
          First_Name: data.firstName,
          Last_Name: data.lastName || data.firstName, // Zoho requires Last_Name
          Email: data.email,
          Phone: data.phone || null,
          Title: data.role || null,
          Account_Name: {id: accountId},
          Description: `Self-registered via /njmenu login.`,
        },
      ],
      trigger: ['workflow'],
    }),
  });

  let contactId = '';
  if (contactRes.ok) {
    const contactData = await contactRes.json();
    const contactRecord = contactData.data?.[0];
    if (contactRecord?.status === 'success') {
      contactId = contactRecord.details.id;
    }
  }

  return {
    contactId,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    phone: data.phone || null,
    role: data.role || null,
    accountId,
    accountName: data.dispensaryName,
    licenseNumber: data.licenseNumber || null,
  };
}

// ── Gmail send (magic-link email) ────────────────────────────────────────────
// Reuses the same OAuth refresh-token pattern as api.leaflink-order.tsx so we
// don't introduce a new credential surface. Sender is forced to spark@ for
// auth email deliverability/branding.

interface GmailEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
}

async function getGmailAccessToken(env: GmailEnv): Promise<string | null> {
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded'},
      body: new URLSearchParams({
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: env.GOOGLE_REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) {
      console.error('[njmenu-auth] Gmail token refresh failed:', res.status, await res.text().catch(() => ''));
      return null;
    }
    const data = await res.json();
    return data.access_token || null;
  } catch (err) {
    console.error('[njmenu-auth] Gmail token refresh error:', err);
    return null;
  }
}

export async function sendMagicLinkEmail(
  env: GmailEnv,
  params: {to: string; firstName: string | null; magicLinkUrl: string},
): Promise<boolean> {
  const accessToken = await getGmailAccessToken(env);
  if (!accessToken) return false;

  const greeting = params.firstName ? `Hey ${params.firstName},` : 'Hey,';

  // Two-part MIME message: plaintext fallback + branded HTML.
  // HTML follows Highsman email standards (dark, Teko headline, gold CTA,
  // Shopify CDN header logo, Spark Greatness footer logo).
  const html = buildMagicLinkHtml({greeting, magicLinkUrl: params.magicLinkUrl});
  const text = [
    greeting,
    '',
    'Tap the link below to sign in to the Highsman NJ wholesale menu. This link is good for 15 minutes.',
    '',
    params.magicLinkUrl,
    '',
    'Spark Greatness.',
    '— Highsman',
  ].join('\n');

  const boundary = `highsman_boundary_${crypto.randomUUID().replace(/-/g, '')}`;
  // Headers via shared RFC 2047 encoders + body 8bit so future edits to the
  // subject or body that introduce em-dashes / smart quotes don't mojibake.
  const mime = [
    `From: ${encodeAddressHeader(FROM_EMAIL, 'Highsman')}`,
    `To: ${params.to}`,
    `Subject: ${encodeHeaderValue('Your Highsman sign-in link')}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
  ].join('\r\n');

  // Base64url encode (Gmail API requirement)
  // btoa requires binary-safe input; our HTML is ASCII (inline styles + emoji-free).
  const encoded = btoa(unescape(encodeURIComponent(mime)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({raw: encoded}),
    });
    if (!res.ok) {
      console.error('[njmenu-auth] Gmail send failed:', res.status, await res.text().catch(() => ''));
      return false;
    }
    return true;
  } catch (err) {
    console.error('[njmenu-auth] Gmail send error:', err);
    return false;
  }
}

// ── Magic link HTML template ────────────────────────────────────────────────
// Highsman brand: Space Black background, gold CTA, Teko headline.
// Uses Shopify CDN-hosted logos per feedback_highsman_email_logos memory.

const HEADER_LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Highsman_Logo_White.png?v=1775594430';
const FOOTER_LOGO_URL =
  'https://cdn.shopify.com/s/files/1/0752/8598/7491/files/Spark_Greatness_White.png?v=1775594430';

function buildMagicLinkHtml(params: {greeting: string; magicLinkUrl: string}): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your Highsman sign-in link</title>
</head>
<body style="margin:0;padding:0;background:#000000;font-family:'Helvetica Neue',Arial,sans-serif;color:#ffffff;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#000000;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:32px;">
              <img src="${HEADER_LOGO_URL}" alt="Highsman" width="160" style="display:block;border:0;max-width:160px;height:auto;">
            </td>
          </tr>
          <!-- Headline -->
          <tr>
            <td align="center" style="padding-bottom:8px;">
              <div style="font-family:'Teko','Oswald','Helvetica Neue',Arial,sans-serif;font-size:48px;font-weight:700;line-height:1;letter-spacing:0.02em;text-transform:uppercase;color:#ffffff;">
                Sign In
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding-bottom:28px;">
              <div style="font-family:'Teko','Oswald','Helvetica Neue',Arial,sans-serif;font-size:24px;font-weight:500;line-height:1;letter-spacing:0.1em;text-transform:uppercase;color:#F5E400;">
                NJ Wholesale Menu
              </div>
            </td>
          </tr>
          <!-- Greeting -->
          <tr>
            <td style="padding:0 24px 16px 24px;font-size:16px;line-height:1.5;color:#ffffff;">
              ${params.greeting}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 28px 24px;font-size:16px;line-height:1.6;color:rgba(255,255,255,0.85);">
              Tap the button below to sign in to the Highsman NJ wholesale menu. This link is good for 15 minutes and only works once.
            </td>
          </tr>
          <!-- CTA -->
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;">
              <a href="${params.magicLinkUrl}" style="display:inline-block;background:#F5E400;color:#000000;font-family:'Teko','Oswald','Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:700;line-height:1;letter-spacing:0.08em;text-transform:uppercase;text-decoration:none;padding:18px 40px;border:2px solid #F5E400;">
                Sign In to Menu
              </a>
            </td>
          </tr>
          <!-- Plaintext fallback URL -->
          <tr>
            <td style="padding:0 24px 24px 24px;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.55);">
              If the button doesn't work, paste this link into your browser:<br>
              <a href="${params.magicLinkUrl}" style="color:#F5E400;word-break:break-all;">${params.magicLinkUrl}</a>
            </td>
          </tr>
          <!-- Safety note -->
          <tr>
            <td style="padding:0 24px 32px 24px;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.55);">
              Didn't request this? Ignore this email — your account stays locked.
            </td>
          </tr>
          <!-- Divider -->
          <tr>
            <td style="padding:0 24px;">
              <div style="height:1px;background:rgba(169,172,175,0.2);width:100%;"></div>
            </td>
          </tr>
          <!-- Footer logo -->
          <tr>
            <td align="center" style="padding:32px 24px 8px 24px;">
              <img src="${FOOTER_LOGO_URL}" alt="Spark Greatness" width="180" style="display:block;border:0;max-width:180px;height:auto;">
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:0 24px 32px 24px;font-size:12px;line-height:1.6;color:rgba(169,172,175,0.75);">
              Highsman &nbsp;|&nbsp; NJ Wholesale &nbsp;|&nbsp; <a href="mailto:njsales@highsman.com" style="color:rgba(169,172,175,0.75);text-decoration:none;">njsales@highsman.com</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ── Public constants re-export ───────────────────────────────────────────────

export {AUTH_COOKIE_NAME, SESSION_MAX_AGE, FROM_EMAIL};
