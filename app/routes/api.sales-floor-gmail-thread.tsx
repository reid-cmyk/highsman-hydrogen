import type {LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, type SalesRep} from '../lib/sales-floor-reps';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — Gmail Thread Reader (per-rep OAuth)
// ─────────────────────────────────────────────────────────────────────────────
// GET /api/sales-floor-gmail-thread?email=foo@bar.com&limit=8
//   → { ok, messages: [{id, threadId, date, direction, from, to, subject,
//                        snippet}], configured, queriedEmail }
//
// Powers the AI Pre-Call Brief: pulls the last N messages between the logged-in
// rep's inbox and a given counterparty email, so Claude can summarize the
// conversation history. Uses the rep's own Gmail OAuth (same env-var triple as
// api.sales-floor-send-email.tsx) — NOT a service account. This keeps the
// "from/to" mailbox boundaries honest: Sky sees Sky's inbox, not the whole org.
//
// We deliberately do NOT fetch full bodies — snippets + metadata are enough for
// Claude to build context, and skipping the body fetch keeps this inside the
// 25s worker budget even on threads with dozens of messages.
// ─────────────────────────────────────────────────────────────────────────────

// Per-rep token cache (shared with send route pattern, isolated cache).
// 55-min TTL matches Google's 1-hour token lifetime.
type TokenCacheEntry = {token: string; expiresAt: number};
const gmailTokenCache = new Map<string, TokenCacheEntry>();

type RepEnv = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  from: string;
};

function resolveRepEnv(
  rep: SalesRep,
  env: Record<string, string | undefined>,
): RepEnv | null {
  const clientId = env[rep.gmail.clientIdVar];
  const clientSecret = env[rep.gmail.clientSecretVar];
  const refreshToken = env[rep.gmail.refreshTokenVar];
  if (!clientId || !clientSecret || !refreshToken) return null;

  const fromOverride = rep.gmail.fromVar ? env[rep.gmail.fromVar] : undefined;
  const from = (fromOverride || rep.gmail.defaultFrom).trim();
  return {clientId, clientSecret, refreshToken, from};
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

// Gmail message metadata shape (only the fields we care about).
type GmailMessageMeta = {
  id: string;
  threadId: string;
  snippet?: string;
  internalDate?: string;        // ms epoch, as string
  labelIds?: string[];          // INBOX / SENT / …
  payload?: {
    headers?: Array<{name: string; value: string}>;
  };
};

// Shape returned to the Brief route.
type ShapedEmail = {
  id: string;
  threadId: string;
  date: string;                 // ISO
  direction: 'incoming' | 'outgoing';
  from: string;
  to: string;
  subject: string;
  snippet: string;
};

function headerValue(m: GmailMessageMeta, name: string): string {
  const hs = m.payload?.headers || [];
  const lname = name.toLowerCase();
  for (const h of hs) if (h.name.toLowerCase() === lname) return h.value || '';
  return '';
}

function isValidEmail(s: string | null | undefined): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

// Search for messages between the rep's mailbox and a counterparty email.
// Gmail's search operator `(from:X OR to:X)` matches either direction.
// We sort newest-first (Gmail default) and cap at `maxResults`.
async function listMessageIds(
  token: string,
  counterpartyEmail: string,
  maxResults: number,
): Promise<Array<{id: string; threadId: string}>> {
  const q = `(from:${counterpartyEmail} OR to:${counterpartyEmail})`;
  const url = new URL('https://gmail.googleapis.com/gmail/v1/users/me/messages');
  url.searchParams.set('q', q);
  url.searchParams.set('maxResults', String(maxResults));

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Gmail list ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = (await res.json().catch(() => ({}))) as {
    messages?: Array<{id: string; threadId: string}>;
  };
  return data.messages || [];
}

// Fetch metadata for a single message (From/To/Subject/Date headers + snippet).
// format=metadata + metadataHeaders=... returns just what we need — no body.
async function fetchMessageMeta(
  token: string,
  id: string,
): Promise<GmailMessageMeta | null> {
  const url = new URL(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}`,
  );
  url.searchParams.set('format', 'metadata');
  // metadataHeaders must be repeated for each header we want.
  url.searchParams.append('metadataHeaders', 'From');
  url.searchParams.append('metadataHeaders', 'To');
  url.searchParams.append('metadataHeaders', 'Cc');
  url.searchParams.append('metadataHeaders', 'Subject');
  url.searchParams.append('metadataHeaders', 'Date');

  const res = await fetch(url.toString(), {
    headers: {Authorization: `Bearer ${token}`},
  });
  if (!res.ok) {
    // Skip on individual fetch failures rather than failing the whole batch.
    return null;
  }
  return (await res.json().catch(() => null)) as GmailMessageMeta | null;
}

function decodeHtmlEntities(s: string): string {
  // Gmail snippets occasionally contain &#39;, &amp;, &quot; etc.
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

// Shape a raw Gmail metadata response + our rep/counterparty context into
// the structure the Brief route consumes.
function shape(
  m: GmailMessageMeta,
  repEmail: string,
  counterpartyEmail: string,
): ShapedEmail {
  const from = headerValue(m, 'From');
  const to = headerValue(m, 'To');
  const dateHdr = headerValue(m, 'Date');
  const subject = headerValue(m, 'Subject') || '(no subject)';

  // Prefer internalDate when present — canonical ms epoch, no parse ambiguity.
  let dateIso = '';
  if (m.internalDate) {
    const ms = Number(m.internalDate);
    if (Number.isFinite(ms)) dateIso = new Date(ms).toISOString();
  }
  if (!dateIso && dateHdr) {
    const parsed = new Date(dateHdr);
    if (!isNaN(parsed.getTime())) dateIso = parsed.toISOString();
  }
  if (!dateIso) dateIso = new Date().toISOString();

  // Direction = incoming if rep is in the To field (or cc), outgoing if rep
  // is in From. Label-based detection (SENT/INBOX) is more reliable for
  // threads the rep both sent AND received, so prefer labels when available.
  const labels = m.labelIds || [];
  let direction: 'incoming' | 'outgoing';
  if (labels.includes('SENT') && !labels.includes('INBOX')) {
    direction = 'outgoing';
  } else if (labels.includes('INBOX') && !labels.includes('SENT')) {
    direction = 'incoming';
  } else {
    // Fallback: match the rep's email against the From header.
    const fromLower = from.toLowerCase();
    direction = fromLower.includes(repEmail.toLowerCase()) ? 'outgoing' : 'incoming';
  }

  return {
    id: m.id,
    threadId: m.threadId,
    date: dateIso,
    direction,
    from,
    to,
    subject,
    snippet: decodeHtmlEntities(m.snippet || '').slice(0, 400),
  };
}

export async function loader({request, context}: LoaderFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) {
    return json({ok: false, error: 'Not logged in.', messages: []}, {status: 401});
  }

  const env = (context as any).env as Record<string, string | undefined>;
  const repEnv = resolveRepEnv(rep, env);
  if (!repEnv) {
    // Degraded mode: let the caller render the brief without email context
    // rather than hard-fail the whole Brief when Gmail isn't wired up.
    return json(
      {
        ok: false,
        configured: false,
        error: `Gmail not configured for ${rep.firstName}.`,
        messages: [],
        queriedEmail: null,
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  const url = new URL(request.url);
  const counterpartyEmail = String(url.searchParams.get('email') || '').trim();
  const rawLimit = Number(url.searchParams.get('limit') || '8');
  const limit = Math.max(1, Math.min(15, Number.isFinite(rawLimit) ? rawLimit : 8));

  if (!isValidEmail(counterpartyEmail)) {
    return json(
      {
        ok: true,
        configured: true,
        messages: [],
        queriedEmail: counterpartyEmail || null,
        note: 'No valid email provided — skipped Gmail lookup.',
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }

  try {
    const token = await getGmailAccessToken(rep.id, repEnv);
    const ids = await listMessageIds(token, counterpartyEmail, limit);

    if (ids.length === 0) {
      return json(
        {
          ok: true,
          configured: true,
          messages: [],
          queriedEmail: counterpartyEmail,
        },
        {status: 200, headers: {'Cache-Control': 'private, max-age=60'}},
      );
    }

    // Parallel metadata fetches — cheap, and it keeps us well within the
    // 25s worker budget even on threads of 15 messages.
    const metas = await Promise.all(
      ids.map((m) => fetchMessageMeta(token, m.id)),
    );

    const shaped: ShapedEmail[] = [];
    for (const meta of metas) {
      if (!meta) continue;
      shaped.push(shape(meta, repEnv.from, counterpartyEmail));
    }

    // Gmail's list API returns newest-first; re-sort for safety.
    shaped.sort((a, b) => +new Date(b.date) - +new Date(a.date));

    return json(
      {
        ok: true,
        configured: true,
        messages: shaped,
        queriedEmail: counterpartyEmail,
      },
      {
        headers: {
          // 60s cache — threads don't change often and this endpoint is called
          // once per Brief open.
          'Cache-Control': 'private, max-age=60',
        },
      },
    );
  } catch (err: any) {
    console.error('[sales-floor-gmail-thread] failed:', err.message);
    return json(
      {
        ok: false,
        configured: true,
        error: err.message || 'Gmail thread fetch failed.',
        messages: [],
        queriedEmail: counterpartyEmail,
      },
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
