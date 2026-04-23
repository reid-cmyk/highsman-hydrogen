// ─────────────────────────────────────────────────────────────────────────────
// Gmail Service Account — Domain-Wide Delegation helper
// ─────────────────────────────────────────────────────────────────────────────
// Replaces the per-rep OAuth refresh-token flow with a single Google Workspace
// service account that can impersonate any @highsman.com mailbox. Setup:
//
//   1. GCP project (highsman) → Service Account `highsman-brief-reader`
//      • Unique ID / OAuth 2 Client ID: 102137292617151899463
//   2. admin.google.com → Security → API controls → Domain-wide delegation
//      • Client ID 102137292617151899463 authorized for scopes:
//        - https://www.googleapis.com/auth/gmail.readonly
//        - https://www.googleapis.com/auth/gmail.send
//   3. Oxygen env vars (production, marked secret):
//      • GOOGLE_SA_CLIENT_EMAIL — highsman-brief-reader@highsman.iam.gserviceaccount.com
//      • GOOGLE_SA_PRIVATE_KEY  — full PEM from JSON key's `private_key` field
//
// Why JWT-from-scratch in Workers: Oxygen runs in a Workers-like runtime where
// `google-auth-library` isn't an option (no Node `crypto` module). We hand-sign
// an RS256 JWT with Web Crypto, then exchange it at Google's token endpoint.
// ─────────────────────────────────────────────────────────────────────────────

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',
];

// Per-user token cache — 55min TTL matches Google's 1hr lifetime with buffer.
// Cached at module scope so warm workers reuse tokens across requests; the
// Zoho cache pattern caught us before (see feedback_zoho_token_caching.md)
// and Google's oauth2/token rate-limits just as eagerly on repeat asks.
type TokenCacheEntry = {token: string; expiresAt: number};
const tokenCache = new Map<string, TokenCacheEntry>();

type SAConfig = {
  clientEmail: string;
  privateKeyPem: string;
};

function resolveSAConfig(
  env: Record<string, string | undefined>,
): SAConfig | null {
  const clientEmail = env.GOOGLE_SA_CLIENT_EMAIL?.trim();
  const rawKey = env.GOOGLE_SA_PRIVATE_KEY;
  if (!clientEmail || !rawKey) return null;
  // Oxygen stores multi-line env vars with literal "\n" sequences. Convert
  // them back to real newlines before PEM parsing, otherwise the base64
  // payload stays glued to the header line and PKCS8 import blows up.
  const privateKeyPem = rawKey.replace(/\\n/g, '\n').trim();
  if (!privateKeyPem.includes('BEGIN PRIVATE KEY')) return null;
  return {clientEmail, privateKeyPem};
}

export function isGmailSAConfigured(
  env: Record<string, string | undefined>,
): boolean {
  return resolveSAConfig(env) !== null;
}

// base64url encode — JWTs are base64url (no padding, `-_` instead of `+/`).
function b64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=+$/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// PEM → ArrayBuffer (PKCS8 DER). Strips BEGIN/END and whitespace, base64-decodes.
function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(pem),
    {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'},
    false,
    ['sign'],
  );
}

// Build and sign the JWT assertion consumed by grant_type=jwt-bearer.
// `sub` is the mailbox to impersonate — must be a Workspace user in the
// same domain the SA's Client ID was authorized for in Admin console.
async function buildAssertion(
  sa: SAConfig,
  subject: string,
  scopes: string[],
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = {alg: 'RS256', typ: 'JWT'};
  const payload = {
    iss: sa.clientEmail,
    sub: subject,
    scope: scopes.join(' '),
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600, // Google caps JWT lifetime at 1h.
  };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(
    JSON.stringify(payload),
  )}`;
  const key = await importPrivateKey(sa.privateKeyPem);
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}

/**
 * Acquire a Gmail access token scoped to the given Workspace mailbox via
 * domain-wide delegation. Cached per-user for 55 minutes.
 *
 * Usage:
 *   const token = await getGmailAccessTokenForUser('sky@highsman.com', env);
 *   fetch('https://gmail.googleapis.com/...', {headers: {Authorization: `Bearer ${token}`}});
 */
export async function getGmailAccessTokenForUser(
  userEmail: string,
  env: Record<string, string | undefined>,
  scopes: string[] = DEFAULT_SCOPES,
): Promise<string> {
  const sa = resolveSAConfig(env);
  if (!sa) {
    throw new Error(
      'Gmail service account not configured — set GOOGLE_SA_CLIENT_EMAIL and GOOGLE_SA_PRIVATE_KEY.',
    );
  }
  const target = userEmail.trim().toLowerCase();
  if (!target) {
    throw new Error('getGmailAccessTokenForUser: userEmail required.');
  }

  const cacheKey = `${target}:${scopes.join(',')}`;
  const now = Date.now();
  const cached = tokenCache.get(cacheKey);
  if (cached && now < cached.expiresAt) return cached.token;

  const assertion = await buildAssertion(sa, target, scopes);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(
      `Gmail SA token exchange failed (${res.status}) for ${target}: ${txt.slice(0, 300)}`,
    );
  }
  const data = (await res.json()) as {access_token: string; expires_in?: number};
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: now + 55 * 60 * 1000,
  });
  return data.access_token;
}
