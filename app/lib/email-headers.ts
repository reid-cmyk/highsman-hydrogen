// ─────────────────────────────────────────────────────────────────────────────
// app/lib/email-headers.ts
// ─────────────────────────────────────────────────────────────────────────────
// Shared RFC 2047 header encoders for every Gmail sender we run.
//
// Why this lives here:
// Email headers are defined as ASCII (RFC 5322). When a sender ships a raw
// UTF-8 byte sequence in `Subject:` or a From display name, downstream relays
// can re-decode the bytes as Latin-1 / cp1252 and the recipient sees mojibake
// (an em-dash "—" arrives as "Ã¢Â€Â—"). RFC 2047 fixes this with
// =?UTF-8?B?<base64>?= encoded-words.
//
// Every sender route in this app was reinventing its own MIME builder, so a
// fix in one didn't help the others. Now every sender imports from here.
//
// Pure ASCII passes through unchanged so plain English subjects stay
// readable in raw MIME for ops debugging.
// ─────────────────────────────────────────────────────────────────────────────

// eslint-disable-next-line no-control-regex
const NON_ASCII = /[^\x20-\x7E]/;

export function isAsciiHeader(value: string): boolean {
  return !NON_ASCII.test(value);
}

function utf8ToBase64(s: string): string {
  // Workers runtime exposes both TextEncoder and btoa. Encode to UTF-8 bytes,
  // re-read each byte as a binary char, then btoa it — same dance every Gmail
  // sender already does for its raw MIME body.
  const bytes = new TextEncoder().encode(s);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Encode a single header value (Subject, etc.). Pass-through if ASCII. */
export function encodeHeaderValue(value: string | null | undefined): string {
  const v = String(value || '');
  if (!v) return '';
  if (isAsciiHeader(v)) return v;
  return `=?UTF-8?B?${utf8ToBase64(v)}?=`;
}

/** Encode a `Display Name <addr@host>` header. Quotes ASCII display names
 *  with RFC 5322 specials, encoded-word for non-ASCII. Returns the bare
 *  address when no display name is provided. */
export function encodeAddressHeader(
  address: string,
  displayName?: string | null,
): string {
  const a = String(address || '').trim();
  const dn = (displayName || '').trim();
  if (!dn) return a;
  if (!isAsciiHeader(dn)) return `${encodeHeaderValue(dn)} <${a}>`;
  if (/[(),;:\\<>@[\]"]/.test(dn)) {
    return `"${dn.replace(/"/g, '\\"')}" <${a}>`;
  }
  return `${dn} <${a}>`;
}
