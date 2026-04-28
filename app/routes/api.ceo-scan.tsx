/**
 * app/routes/api.ceo-scan.tsx
 *
 * The /ceo dashboard scanner.
 *
 * Trigger model:
 *   - Cron (Cloudflare Worker cron / Supabase pg_cron / external scheduler)
 *     POSTs to /api/ceo-scan with header `x-ceo-scan-token: <CEO_SCAN_TOKEN>`.
 *   - Manual: same endpoint, same token. Pass `?mailbox=foo@highsman.com`
 *     to scope a single inbox (useful for smoke-testing).
 *   - Pass `?dry=1` to run analysis but skip the Supabase upsert.
 *
 * Hard guardrails:
 *   - Without the bearer token, returns 401. There is NO loader-level read
 *     of email content — the dashboard reads from Supabase only.
 *   - Caps per-run threads at CEO_SCAN_MAX_THREADS (default 200) so a misfire
 *     can't burn a budget on Claude.
 *   - Streams Claude responses (memory feedback_claude_streaming_default).
 *
 * Place in Hydrogen as: app/routes/api.ceo-scan.tsx
 */

import type {ActionFunctionArgs, LoaderFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';

import {
  analyzeThread,
  dedupeAlreadySeen,
  fetchRecentThreads,
  finishScanRun,
  getActiveMailboxes,
  markThreadsSeen,
  startScanRun,
  touchMailboxScan,
  upsertFlag,
} from '~/lib/ceo-sentiment';

const DEFAULT_LOOKBACK_DAYS = 90;
const DEFAULT_MAX_THREADS = 200;

function unauthorized() {
  return json({ok: false, error: 'unauthorized'}, {status: 401});
}

async function runScan(
  request: Request,
  context: any,
  trigger: 'cron' | 'manual',
) {
  const env = (context as any).env;

  // 1) Token gate
  const provided =
    request.headers.get('x-ceo-scan-token') ||
    new URL(request.url).searchParams.get('token');
  if (!env.CEO_SCAN_TOKEN || provided !== env.CEO_SCAN_TOKEN) {
    return unauthorized();
  }

  const url = new URL(request.url);
  const onlyMailbox = url.searchParams.get('mailbox');
  const dryRun = url.searchParams.get('dry') === '1';
  const days = Number(url.searchParams.get('days') || env.CEO_SCAN_DAYS || DEFAULT_LOOKBACK_DAYS);
  const maxThreads = Number(env.CEO_SCAN_MAX_THREADS || DEFAULT_MAX_THREADS);

  // 2) Mailbox list
  const allMailboxes = await getActiveMailboxes(env);
  const mailboxes = onlyMailbox ? [onlyMailbox] : allMailboxes;
  if (!mailboxes.length) {
    return json({ok: false, error: 'no active mailboxes — seed ceo_monitored_mailboxes'}, {status: 400});
  }

  // 3) Scan run row
  const runId = dryRun ? 'dry-run' : await startScanRun(env, trigger);

  let threadsExamined = 0;
  let threadsAnalyzed = 0;
  let flagsCreated = 0;
  let flagsUpdated = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const errors: any[] = [];

  for (const mailbox of mailboxes) {
    try {
      const recent = await fetchRecentThreads(env, mailbox, days);
      threadsExamined += recent.length;

      const fresh = await dedupeAlreadySeen(env, mailbox, recent);
      // Stop the bleeding: respect global cap across all mailboxes
      const remaining = Math.max(0, maxThreads - threadsAnalyzed);
      const slice = fresh.slice(0, remaining);

      for (const thread of slice) {
        try {
          const {verdict, usage, model} = await analyzeThread(env, thread);
          threadsAnalyzed += 1;
          inputTokens += usage.input;
          outputTokens += usage.output;
          if (!dryRun && verdict.flag) {
            const result = await upsertFlag(env, thread, mailbox, verdict, runId, model);
            if (result === 'inserted') flagsCreated += 1;
            if (result === 'updated') flagsUpdated += 1;
          }
        } catch (err: any) {
          console.error('[ceo-scan] analyzeThread failed', mailbox, thread.thread_id, err);
          errors.push({mailbox, thread_id: thread.thread_id, error: String(err?.message || err)});
        }
      }
      if (!dryRun) await markThreadsSeen(env, mailbox, slice);
      if (!dryRun) await touchMailboxScan(env, mailbox, 'ok');

      if (threadsAnalyzed >= maxThreads) break; // cost guardrail
    } catch (err: any) {
      console.error('[ceo-scan] mailbox failed', mailbox, err);
      errors.push({mailbox, error: String(err?.message || err)});
      if (!dryRun) await touchMailboxScan(env, mailbox, 'failed');
    }
  }

  if (!dryRun) {
    await finishScanRun(env, runId, {
      mailboxes_scanned: mailboxes.length,
      threads_examined: threadsExamined,
      threads_analyzed: threadsAnalyzed,
      flags_created: flagsCreated,
      flags_updated: flagsUpdated,
      claude_input_tokens: inputTokens,
      claude_output_tokens: outputTokens,
      error_count: errors.length,
      error_summary: errors.slice(0, 25),
      status: errors.length ? 'partial' : 'ok',
    });
  }

  return json({
    ok: true,
    run_id: runId,
    trigger,
    dry_run: dryRun,
    mailboxes_scanned: mailboxes.length,
    threads_examined: threadsExamined,
    threads_analyzed: threadsAnalyzed,
    flags_created: flagsCreated,
    flags_updated: flagsUpdated,
    claude_input_tokens: inputTokens,
    claude_output_tokens: outputTokens,
    error_count: errors.length,
    sample_errors: errors.slice(0, 5),
  });
}

// POST = cron (the canonical trigger)
export async function action({request, context}: ActionFunctionArgs) {
  return runScan(request, context, 'cron');
}

// GET = manual smoke test (still token-gated). Use ?dry=1 first.
export async function loader({request, context}: LoaderFunctionArgs) {
  return runScan(request, context, 'manual');
}
