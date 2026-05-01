/**
 * app/routes/api.ceo-search.tsx
 *
 * /ceo dashboard event-search backend.
 *
 * What it does:
 *   • Auth: requires the same `ceo_auth=1` cookie the dashboard sets (Path=/).
 *   • Takes a natural-language question ("did the Acme demo happen?",
 *     "did legal sign the new vendor agreement?", "did Marcus get back to
 *     the Hudson buyer?") and a lookback window (default 60d).
 *   • Fans out across every active mailbox in ceo_monitored_mailboxes via
 *     searchMailboxThreads(), pulling top N matches per inbox.
 *   • Caps total threads at MAX_THREADS to control Haiku spend.
 *   • Calls answerEventQuery() — Haiku 4.5 streaming, structured tool-use —
 *     to render a verdict (yes/no/unclear), confidence, summary, and citation
 *     indexes.
 *   • Returns JSON the dashboard renders inline.
 *
 * Privacy:
 *   • This endpoint NEVER reads or writes Supabase. It is a one-shot live
 *     search; results are not persisted.
 *   • Same noindex/cookie-gate posture as the dashboard.
 *
 * Memory anchors:
 *   • feedback_brief_haiku_default — Haiku 4.5 by default.
 *   • feedback_claude_streaming_default — streaming on the Anthropic call.
 *   • reference_sales_floor_cookie_path — auth cookie must be Path=/ to reach
 *     XHR routes.
 *
 * Place in Hydrogen as: app/routes/api.ceo-search.tsx
 */

import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

import {
  answerEventQuery,
  getActiveMailboxes,
  searchMailboxThreads,
  type SearchHit,
} from '~/lib/ceo-sentiment';

const MAX_THREADS_DEFAULT = 30;
const MAX_PER_MAILBOX_DEFAULT = 6;

function unauthorized() {
  return json({ok: false, error: 'unauthorized'}, {status: 401});
}

export async function loader(_args: LoaderFunctionArgs) {
  // Force POST — never expose search params via GET.
  return json({ok: false, error: 'method_not_allowed'}, {status: 405});
}

export async function action({request, context}: ActionFunctionArgs) {
  const env = (context as any).env;

  // 1) Auth gate — same cookie the /ceo dashboard sets
  const cookie = request.headers.get('Cookie') || '';
  if (!cookie.includes('ceo_auth=1')) return unauthorized();

  // 2) Parse input — accept JSON or form-encoded
  let query = '';
  let days = 60;
  let perMailbox = MAX_PER_MAILBOX_DEFAULT;
  let mailboxFilter: string | null = null;

  const ct = (request.headers.get('content-type') || '').toLowerCase();
  try {
    if (ct.includes('application/json')) {
      const body = (await request.json()) as Record<string, unknown>;
      query = String(body.query ?? '').trim();
      days = clampInt(body.days, 1, 365, 60);
      perMailbox = clampInt(body.maxPerMailbox, 1, 25, MAX_PER_MAILBOX_DEFAULT);
      if (typeof body.mailbox === 'string' && body.mailbox.includes('@')) {
        mailboxFilter = body.mailbox.trim().toLowerCase();
      }
    } else {
      const fd = await request.formData();
      query = String(fd.get('query') ?? '').trim();
      days = clampInt(fd.get('days'), 1, 365, 60);
      perMailbox = clampInt(fd.get('maxPerMailbox'), 1, 25, MAX_PER_MAILBOX_DEFAULT);
      const m = String(fd.get('mailbox') ?? '').trim().toLowerCase();
      if (m && m.includes('@')) mailboxFilter = m;
    }
  } catch (err: any) {
    return json({ok: false, error: `bad_request: ${String(err?.message || err)}`}, {status: 400});
  }

  if (!query || query.length < 3) {
    return json({ok: false, error: 'query must be at least 3 characters'}, {status: 400});
  }
  if (query.length > 500) {
    return json({ok: false, error: 'query too long (max 500 chars)'}, {status: 400});
  }

  // 3) Mailbox set
  let mailboxes: string[];
  try {
    mailboxes = await getActiveMailboxes(env);
  } catch (err: any) {
    return json({ok: false, error: `mailbox_lookup_failed: ${String(err?.message || err)}`}, {status: 500});
  }
  if (mailboxFilter) mailboxes = mailboxes.filter((m) => m.toLowerCase() === mailboxFilter);
  if (!mailboxes.length) {
    return json({ok: false, error: 'no active mailboxes match'}, {status: 400});
  }

  // 4) Fan out search across mailboxes (sequential to be polite to Gmail)
  const startedAt = Date.now();
  const errors: Array<{mailbox: string; error: string}> = [];
  const allHits: SearchHit[] = [];
  const maxTotal = Number(env.CEO_SEARCH_MAX_THREADS || MAX_THREADS_DEFAULT);

  for (const mailbox of mailboxes) {
    if (allHits.length >= maxTotal) break;
    try {
      const remaining = Math.max(0, maxTotal - allHits.length);
      const cap = Math.min(perMailbox, remaining);
      if (cap <= 0) break;
      const hits = await searchMailboxThreads(env, mailbox, query, {days, maxResults: cap});
      allHits.push(...hits);
    } catch (err: any) {
      console.warn('[ceo-search] mailbox failed', mailbox, err);
      errors.push({mailbox, error: String(err?.message || err)});
    }
  }

  // 5) Empty short-circuit — don't waste a Claude call
  if (!allHits.length) {
    return json({
      ok: true,
      query,
      days,
      mailboxes_scanned: mailboxes.length,
      hits_found: 0,
      verdict: {
        verdict: 'unclear' as const,
        confidence: 0,
        summary:
          'No matching emails were found in the connected inboxes for this query in the chosen window. Either the event was not discussed by email, was discussed using different wording, or it falls outside the lookback window.',
        citation_indexes: [],
      },
      citations: [],
      elapsed_ms: Date.now() - startedAt,
      errors,
    });
  }

  // 6) Ask Haiku
  let verdict;
  let usage;
  let model;
  try {
    const result = await answerEventQuery(env, query, allHits);
    verdict = result.verdict;
    usage = result.usage;
    model = result.model;
  } catch (err: any) {
    return json(
      {
        ok: false,
        error: `claude_failed: ${String(err?.message || err)}`,
        // Still return the raw hits so the user can read them themselves
        query,
        days,
        mailboxes_scanned: mailboxes.length,
        hits_found: allHits.length,
        citations: allHits.map(toCitation),
        errors,
      },
      {status: 502},
    );
  }

  // 7) Resolve citation_indexes → full citation objects
  const citationsAll = allHits.map(toCitation);
  const citations =
    verdict.citation_indexes.length > 0
      ? verdict.citation_indexes.map((i) => citationsAll[i]).filter(Boolean)
      : citationsAll.slice(0, 6); // fallback: show top 6 hits even if model didn't cite

  return json({
    ok: true,
    query,
    days,
    mailboxes_scanned: mailboxes.length,
    hits_found: allHits.length,
    verdict,
    citations,
    all_hits: citationsAll, // useful for "show all matches" disclosure in UI
    model,
    claude_input_tokens: usage.input,
    claude_output_tokens: usage.output,
    elapsed_ms: Date.now() - startedAt,
    errors,
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────
function clampInt(raw: unknown, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function toCitation(h: SearchHit) {
  return {
    mailbox_email: h.mailbox_email,
    thread_id: h.thread_id,
    subject: h.subject,
    from: h.from,
    to: h.to,
    message_date: h.message_date,
    thread_url: h.thread_url,
    snippet: h.snippet,
  };
}
