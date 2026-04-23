/**
 * qr.ts — zero-dep QR helper.
 *
 * We don't want to pull the `qrcode` npm package into the worker bundle just
 * for Serena's in-store signup flow, so we lean on api.qrserver.com to
 * produce the PNG. From the rep's perspective it's a normal <img> they can
 * show on-screen or airdrop to a budtender. If the third-party goes down the
 * manual-entry tab on the same modal keeps the flow working — QR is a
 * convenience, not a hard dependency.
 *
 * `buildSignupUrl` canonicalizes the public URL so staff-dashboard, /vibes,
 * and any future campaign QR share the same shape.
 */

export function buildSignupUrl(origin: string, token: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/training/join/${encodeURIComponent(token)}`;
}

export function buildQrDataUrl(targetUrl: string, size = 512): string {
  const encoded = encodeURIComponent(targetUrl);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=12&ecc=M&data=${encoded}`;
}

/**
 * URL-safe random slug for training_signup_tokens. 22 chars is ~131 bits of
 * entropy — plenty for an unindexed token that only resolves server-side.
 */
export function makeSignupToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
