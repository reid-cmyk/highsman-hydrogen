/**
 * app/lib/ceo-sentiment.ts
 *
 * Shared helpers for the /ceo Sentiment Dashboard.
 *
 * Memory anchors:
 *   • feedback_brief_haiku_default — Haiku 4.5 is the right model for
 *     schema-constrained synthesis. Don't reach for Sonnet.
 *   • feedback_claude_streaming_default — Server Claude calls in Worker/Oxygen
 *     runtimes stream by default.
 */

import {getGmailAccessTokenForUser} from '~/lib/gmail-sa';

// ─── Types ────────────────────────────────────────────────────────────────
export type SentimentCategory =
  | 'customer_frustration'
  | 'internal_tension'
  | 'staff_burnout';

export type SentimentSeverity = 1 | 2 | 3;

export interface ThreadSummary {
  thread_id: string;
  message_id: string;
  subject: string;
  snippet: string;
  participants: Array<{email: string; name?: string; role: 'internal' | 'external'}>;
  is_internal_only: boolean;
  message_date: string;
  message_count: number;
  thread_url: string;
  body_for_analysis: string;
}

export interface SentimentVerdict {
  flag: boolean;
  category?: SentimentCategory;
  severity?: SentimentSeverity;
  sentiment_score?: number;
  reasoning?: string;
  evidence_quote?: string;
  recommended_action?: string;
}

type Env = Record<string, string | undefined>;

// ─── Supabase REST helpers ─────────────────────────────────────────────────
function supabaseHeaders(env: Env, prefer?: string): Record<string, string> {
  const key = env.SUPABASE_SERVICE_KEY!;
  const h: Record<string, string> = {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
  if (prefer) h.prefer = prefer;
  return h;
}

async function sbSelect<T = any>(env: Env, table: string, query: string): Promise<T[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}${query}`;
  const res = await fetch(url, {headers: supabaseHeaders(env)});
  if (!res.ok) throw new Error(`Supabase ${table} GET ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T[]>;
}

async function sbInsert<T = any>(env: Env, table: string, rows: any, prefer = 'return=representation'): Promise<T[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env, prefer),
    body: JSON.stringify(Array.isArray(rows) ? rows : [rows]),
  });
  if (!res.ok) throw new Error(`Supabase ${table} POST ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res.json() as Promise<T[]>;
}

async function sbUpsert<T = any>(env: Env, table: string, rows: any[], onConflict: string, prefer = 'resolution=merge-duplicates,return=representation'): Promise<T[]> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: supabaseHeaders(env, prefer),
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Supabase ${table} upsert ${res.status}: ${(await res.text()).slice(0, 300)}`);
  if (prefer.includes('return=minimal')) return [] as T[];
  return res.json() as Promise<T[]>;
}

async function sbUpdate(env: Env, table: string, filter: string, patch: any): Promise<void> {
  const url = `${env.SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: supabaseHeaders(env),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const t = await res.text();
    console.warn(`Supabase ${table} PATCH ${res.status}: ${t.slice(0, 300)}`);
  }
}

// ─── Mailbox listing ───────────────────────────────────────────────────────
export async function getActiveMailboxes(env: Env): Promise<string[]> {
  const rows = await sbSelect<{email: string}>(env, 'ceo_monitored_mailboxes', '?select=email&active=eq.true');
  return rows.map((r) => r.email);
}

// ─── Gmail thread fetch ────────────────────────────────────────────────────
const HIGHSMAN_DOMAIN = '@highsman.com';
function isInternal(email: string): boolean { return email.toLowerCase().endsWith(HIGHSMAN_DOMAIN); }

function decodeBase64Url(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  try { return atob(padded); } catch { return ''; }
}

function extractTextFromPayload(payload: any, depth = 0): string {
  if (!payload || depth > 6) return '';
  if (payload.body?.data && payload.mimeType?.startsWith('text/plain')) {
    return decodeBase64Url(payload.body.data);
  }
  if (Array.isArray(payload.parts)) {
    return payload.parts.map((p: any) => extractTextFromPayload(p, depth + 1)).join('\n');
  }
  if (payload.body?.data && payload.mimeType?.startsWith('text/html')) {
    const html = decodeBase64Url(payload.body.data);
    return html
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ');
  }
  return '';
}

function parseAddressList(headerValue: string | undefined): Array<{email: string; name?: string}> {
  if (!headerValue) return [];
  return headerValue.split(',').map((raw) => {
    const m = raw.trim().match(/^"?([^"<]*)"?\s*<([^>]+)>$/) || raw.trim().match(/^([^\s]+@[^\s]+)$/);
    if (!m) return {email: raw.trim()};
    if (m.length === 3) return {name: m[1].trim() || undefined, email: m[2].trim()};
    return {email: m[1].trim()};
  }).filter((a) => a.email && a.email.includes('@'));
}

function scrubText(s: string): string {
  return s
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[SSN]')
    .replace(/\b(?:\d[ -]?){13,19}\b/g, '[CARD]')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[TOKEN]')
    .slice(0, 12000);
}

export async function fetchRecentThreads(env: Env, mailbox: string, days: number, maxFetch = 100, analyzeBudget = 10): Promise<ThreadSummary[]> {
  const token = await getGmailAccessTokenForUser(mailbox, env);
  const after = Math.floor((Date.now() - days * 86400_000) / 1000);
  const query = `after:${after} -in:drafts -category:promotions -category:updates -from:noreply -from:no-reply -from:notifications`;

  const listUrl = new URL('https://gmail.googleapis.com/gmail/v1/users/me/threads');
  listUrl.searchParams.set('q', query);
  // List as many thread IDs as Gmail allows (cheap), then dedupe BEFORE fetching details.
  listUrl.searchParams.set('maxResults', String(Math.min(500, Math.max(10, maxFetch))));

  const listRes = await fetch(listUrl.toString(), {headers: {Authorization: `Bearer ${token}`}});
  if (!listRes.ok) {
    throw new Error(`Gmail threads.list ${listRes.status} for ${mailbox}: ${(await listRes.text()).slice(0, 200)}`);
  }
  const listData = (await listRes.json()) as {threads?: Array<{id: string}>};
  const allListedIds = (listData.threads ?? []).map((t) => t.id).filter(Boolean);

  // Pre-dedupe: drop thread IDs we've already analyzed at any message_count.
  // (We can't tell here whether a thread has new replies — that needs message_count from the
  //  detail fetch — so this is a best-effort skip. Threads with new messages will be
  //  re-fetched on a later pass once the seen-ledger has matching rows pruned.)
  let unseen = allListedIds;
  try {
    const inList = allListedIds.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
    if (inList) {
      const seen = await sbSelect<{thread_id: string}>(
        env,
        'ceo_thread_seen',
        `?select=thread_id&mailbox_email=eq.${encodeURIComponent(mailbox)}&thread_id=in.(${encodeURIComponent(inList)})`
      );
      const seenSet = new Set(seen.map((r) => r.thread_id));
      unseen = allListedIds.filter((id) => !seenSet.has(id));
    }
  } catch (err) {
    console.warn('[ceo-scan] pre-dedupe lookup failed (proceeding with full list)', err);
  }

  // Now only fetch details for the first analyzeBudget*1.2 un-seen IDs (small headroom for any
  // post-dedupe drops e.g. message_count mismatches), capped at maxFetch.
  const fetchTarget = Math.min(maxFetch, Math.ceil(analyzeBudget * 1.2));
  const threadIds = unseen.slice(0, fetchTarget);
  const summaries: ThreadSummary[] = [];

  for (const tid of threadIds) {
    try {
      const detailRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/threads/${tid}?format=full`,
        {headers: {Authorization: `Bearer ${token}`}}
      );
      if (!detailRes.ok) continue;
      const t = (await detailRes.json()) as any;
      const messages: any[] = t.messages ?? [];
      if (!messages.length) continue;

      const last = messages[messages.length - 1];
      const headers: Record<string, string> = {};
      for (const h of last.payload?.headers ?? []) {
        if (h.name) headers[h.name.toLowerCase()] = h.value ?? '';
      }
      const subject = headers['subject'] ?? '(no subject)';
      const allAddrs = [
        ...parseAddressList(headers['from']),
        ...parseAddressList(headers['to']),
        ...parseAddressList(headers['cc']),
      ];
      const seen = new Set<string>();
      const participants: Array<{email: string; name?: string; role: 'internal' | 'external'}> = [];
      for (const a of allAddrs) {
        const e = a.email.toLowerCase();
        if (seen.has(e)) continue;
        seen.add(e);
        participants.push({...a, role: isInternal(e) ? 'internal' : 'external'});
      }
      const internalOnly = participants.length > 0 && participants.every((p) => p.role === 'internal');
      const dateMs = Number(last.internalDate ?? Date.now());
      const lastBody = scrubText(extractTextFromPayload(last.payload));
      const tailBodies = messages
        .slice(-3)
        .map((m: any) => scrubText(extractTextFromPayload(m.payload)))
        .filter(Boolean)
        .join('\n\n--- previous message ---\n\n')
        .slice(0, 6000);

      summaries.push({
        thread_id: tid!,
        message_id: last.id ?? '',
        subject,
        snippet: (last.snippet ?? lastBody).slice(0, 1500),
        participants,
        is_internal_only: internalOnly,
        message_date: new Date(dateMs).toISOString(),
        message_count: messages.length,
        thread_url: `https://mail.google.com/mail/u/0/#inbox/${tid}`,
        body_for_analysis: tailBodies || lastBody.slice(0, 6000),
      });
    } catch (err) {
      console.warn('[ceo-scan] thread fetch failed', mailbox, tid, err);
    }
  }
  return summaries;
}

// ─── Dedupe ─────────────────────────────────────────────────────────────────
export async function dedupeAlreadySeen(env: Env, mailbox: string, threads: ThreadSummary[]): Promise<ThreadSummary[]> {
  if (!threads.length) return threads;
  const ids = threads.map((t) => t.thread_id);
  const inList = ids.map((id) => `"${id.replace(/"/g, '')}"`).join(',');
  try {
    const rows = await sbSelect<{thread_id: string; message_count: number}>(
      env,
      'ceo_thread_seen',
      `?select=thread_id,message_count&mailbox_email=eq.${encodeURIComponent(mailbox)}&thread_id=in.(${encodeURIComponent(inList)})`
    );
    const seen = new Map<string, number>();
    for (const r of rows) seen.set(r.thread_id, r.message_count);
    return threads.filter((t) => (seen.get(t.thread_id) ?? -1) < t.message_count);
  } catch (err) {
    console.warn('[ceo-scan] dedupe lookup failed (proceeding without)', err);
    return threads;
  }
}

export async function markThreadsSeen(env: Env, mailbox: string, threads: ThreadSummary[]): Promise<void> {
  if (!threads.length) return;
  const rows = threads.map((t) => ({
    mailbox_email: mailbox,
    thread_id: t.thread_id,
    message_count: t.message_count,
    last_seen_at: new Date().toISOString(),
  }));
  try {
    await sbUpsert(env, 'ceo_thread_seen', rows, 'mailbox_email,thread_id,message_count', 'resolution=merge-duplicates,return=minimal');
  } catch (err) {
    console.warn('[ceo-scan] mark-seen upsert failed', err);
  }
}

// ─── Claude analysis ────────────────────────────────────────────────────────
const ANALYSIS_TOOL = {
  name: 'record_sentiment_finding',
  description: 'Record whether this email thread reflects a meaningful negative-sentiment signal worth surfacing on the CEO dashboard.',
  input_schema: {
    type: 'object',
    properties: {
      flag: {type: 'boolean'},
      category: {type: 'string', enum: ['customer_frustration', 'internal_tension', 'staff_burnout', 'none']},
      severity: {type: 'integer', minimum: 0, maximum: 3},
      sentiment_score: {type: 'number', minimum: -1, maximum: 1},
      reasoning: {type: 'string'},
      evidence_quote: {type: 'string'},
      recommended_action: {type: 'string'},
    },
    required: ['flag', 'category', 'severity', 'sentiment_score', 'reasoning', 'evidence_quote', 'recommended_action'],
  },
} as const;

const COMPLAINTS_PROMPT = `You are scanning Highsman email threads for SOFT signals of internal complaining, venting, or friction. The CEO specifically wants to know what's being said about coworkers, leadership, or company decisions — both inside and outside the company.

FLAG these patterns even when mild:
1. Staff complaining about a coworker by name or implication ("I had to redo what X did", "X dropped the ball", "they always…")
2. Staff venting about leadership, pay, hours, decisions, or workload
3. Passive-aggressive or sarcastic remarks about teammates or company
4. Staff badmouthing the company, products, or colleagues to anyone OUTSIDE Highsman
5. "Between us…", "don't tell X", or other gossip/secrecy framing
6. Frustration with company processes, tools, or chain of command
7. Tone of resignation, "I'm tired of…", "this is ridiculous", "I can't believe…"

Be LIBERAL — flag if it could be useful CEO context. Better to over-flag here than miss something.

Categorization:
- internal_tension: complaints about coworkers, internal processes, friction, gossip
- staff_burnout: exhaustion, "I'm done", overwork, pay frustration, despair
- customer_frustration: ONLY use if the thread is genuinely about an external party complaining to us. NOT for staff complaining to external parties about Highsman — that's internal_tension.

Severity (relaxed):
- 1 (watch): mild complaint or one-line vent
- 2 (warning): clear pointed complaint, named criticism, or sustained venting
- 3 (critical): serious bad-mouthing, undermining a colleague, external complaints to clients/vendors about our team, or anything that would embarrass the company if it leaked

Skip threads that are purely logistical/operational with no human friction.
Skip pure customer-service threads where the customer is the complainer.

Respond ONLY by calling the record_sentiment_finding tool. NEVER fabricate quotes — evidence_quote must be verbatim.`;

const SYSTEM_PROMPT = `You are a Highsman internal-comms analyst grading email threads for the CEO dashboard. You ONLY flag threads that show meaningful negative sentiment in one of three buckets:

1. customer_frustration — an external customer (anyone NOT @highsman.com) is unhappy, frustrated, escalating, or hinting at churn. Mere logistics questions or normal complaints already resolved do not qualify.
2. internal_tension — staff-to-staff friction, passive-aggression, blame-shifting, or visible conflict between @highsman.com colleagues.
3. staff_burnout — a staff member shows exhaustion, disengagement, despair, or sustained frustration with workload, leadership, or company direction.

Be conservative. Most threads are normal work and should be flag=false. Only flag when a reasonable manager would want to know.

Severity calibration:
- 1 (watch): mild signal, may pass on its own.
- 2 (warning): clear unhappiness needing attention this week.
- 3 (critical): escalation, threat, churn risk, conflict, or burnout language that needs same-day attention.

If a thread is purely customer service that was resolved positively, return flag=false.
If a thread is ambiguous, lean toward flag=false.
NEVER fabricate quotes — evidence_quote must be verbatim from the thread.

Respond ONLY by calling the record_sentiment_finding tool.`;

export async function analyzeThread(env: Env, thread: ThreadSummary, mode: 'default' | 'complaints' = 'default'): Promise<{verdict: SentimentVerdict; usage: {input: number; output: number}; model: string}> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY missing — cannot run /ceo scan.');
  }
  const model = env.CEO_SENTIMENT_MODEL || 'claude-haiku-4-5-20251001';
  const userContent = [
    `Mailbox under review: ${thread.participants[0]?.email ?? '(unknown)'}`,
    `Subject: ${thread.subject}`,
    `Internal-only thread: ${thread.is_internal_only ? 'YES' : 'no'}`,
    `Message count: ${thread.message_count}`,
    `Most recent message date: ${thread.message_date}`,
    `Participants: ${thread.participants.map((p) => `${p.email} (${p.role})`).join(', ')}`,
    '',
    '--- THREAD CONTENT (last messages) ---',
    thread.body_for_analysis,
  ].join('\n');

  const systemPrompt = mode === 'complaints' ? COMPLAINTS_PROMPT : SYSTEM_PROMPT;
  const body = {
    model,
    max_tokens: 600,
    system: systemPrompt,
    tools: [ANALYSIS_TOOL],
    tool_choice: {type: 'tool', name: 'record_sentiment_finding'},
    stream: true,
    messages: [{role: 'user', content: userContent}],
  };

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    const text = await res.text();
    throw new Error(`Anthropic ${res.status}: ${text.slice(0, 400)}`);
  }

  let toolJson = '';
  let inputTokens = 0;
  let outputTokens = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const {value, done} = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, {stream: true});
    let nl: number;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === 'content_block_delta' && ev.delta?.type === 'input_json_delta') {
          toolJson += ev.delta.partial_json ?? '';
        } else if (ev.type === 'message_start') {
          inputTokens = ev.message?.usage?.input_tokens ?? 0;
        } else if (ev.type === 'message_delta') {
          outputTokens = ev.usage?.output_tokens ?? outputTokens;
        }
      } catch { /* ignore malformed */ }
    }
  }

  let parsed: any = {};
  try { parsed = JSON.parse(toolJson || '{}'); }
  catch { parsed = {flag: false, severity: 0, category: 'none', reasoning: 'parse_error'}; }

  const verdict: SentimentVerdict = parsed.flag
    ? {
        flag: true,
        category: (parsed.category === 'none' ? undefined : parsed.category) as SentimentCategory,
        severity: Math.min(3, Math.max(1, Number(parsed.severity) || 1)) as SentimentSeverity,
        sentiment_score: typeof parsed.sentiment_score === 'number' ? Math.max(-1, Math.min(1, parsed.sentiment_score)) : undefined,
        reasoning: String(parsed.reasoning ?? '').slice(0, 800),
        evidence_quote: String(parsed.evidence_quote ?? '').slice(0, 250),
        recommended_action: String(parsed.recommended_action ?? '').slice(0, 300),
      }
    : {flag: false};

  return {verdict, usage: {input: inputTokens, output: outputTokens}, model};
}

// ─── Persist a flag ─────────────────────────────────────────────────────────
export async function upsertFlag(env: Env, thread: ThreadSummary, mailbox: string, verdict: SentimentVerdict, scanRunId: string, modelUsed: string): Promise<'inserted' | 'updated' | 'skipped'> {
  if (!verdict.flag || !verdict.category || !verdict.severity) return 'skipped';
  const row = {
    mailbox_email: mailbox,
    thread_id: thread.thread_id,
    message_id: thread.message_id,
    subject: thread.subject,
    snippet: thread.snippet,
    thread_url: thread.thread_url,
    participants: thread.participants,
    is_internal_only: thread.is_internal_only,
    category: verdict.category,
    severity: verdict.severity,
    sentiment_score: verdict.sentiment_score ?? null,
    reasoning: verdict.reasoning ?? null,
    evidence_quote: verdict.evidence_quote ?? null,
    recommended_action: verdict.recommended_action ?? null,
    message_date: thread.message_date,
    flagged_at: new Date().toISOString(),
    resolved: false,
    hidden: false,
    scan_run_id: scanRunId === 'dry-run' ? null : scanRunId,
    model_used: modelUsed,
  };
  try {
    const result = await sbUpsert<any>(env, 'ceo_sentiment_flags', [row], 'mailbox_email,thread_id', 'resolution=merge-duplicates,return=representation');
    return result && result.length ? 'updated' : 'inserted';
  } catch (err) {
    console.error('[ceo-scan] upsert flag failed', err);
    return 'skipped';
  }
}

// ─── Scan-run lifecycle ─────────────────────────────────────────────────────
export async function startScanRun(env: Env, trigger: 'cron' | 'manual' | 'backfill'): Promise<string> {
  const result = await sbInsert<{id: string}>(env, 'ceo_scan_runs', {trigger, status: 'running'});
  if (!result.length) throw new Error('startScanRun: empty insert response');
  return result[0].id;
}

export async function finishScanRun(
  env: Env,
  id: string,
  patch: Partial<{
    mailboxes_scanned: number;
    threads_examined: number;
    threads_analyzed: number;
    flags_created: number;
    flags_updated: number;
    claude_input_tokens: number;
    claude_output_tokens: number;
    error_count: number;
    error_summary: any;
    status: 'ok' | 'partial' | 'failed';
  }>
): Promise<void> {
  await sbUpdate(env, 'ceo_scan_runs', `id=eq.${id}`, {...patch, finished_at: new Date().toISOString()});
}

export async function touchMailboxScan(env: Env, mailbox: string, status: 'ok' | 'failed'): Promise<void> {
  await sbUpdate(env, 'ceo_monitored_mailboxes', `email=eq.${encodeURIComponent(mailbox)}`, {
    last_scanned_at: new Date().toISOString(),
    last_scan_status: status,
  });
}

// ─── Dashboard read helpers ─────────────────────────────────────────────────
export interface FlagRow {
  id: string;
  mailbox_email: string;
  thread_id: string;
  subject: string | null;
  snippet: string | null;
  thread_url: string | null;
  participants: Array<{email: string; name?: string; role: 'internal' | 'external'}>;
  is_internal_only: boolean;
  category: 'customer_frustration' | 'internal_tension' | 'staff_burnout';
  severity: 1 | 2 | 3;
  sentiment_score: number | null;
  reasoning: string | null;
  evidence_quote: string | null;
  recommended_action: string | null;
  message_date: string;
  flagged_at: string;
  resolved: boolean;
  resolved_at: string | null;
}

export async function readFlags(env: Env, includeResolved: boolean): Promise<FlagRow[]> {
  const select = 'id,mailbox_email,thread_id,subject,snippet,thread_url,participants,is_internal_only,category,severity,sentiment_score,reasoning,evidence_quote,recommended_action,message_date,flagged_at,resolved,resolved_at';
  const filters = ['hidden=eq.false'];
  if (!includeResolved) filters.push('resolved=eq.false');
  const order = '&order=severity.desc,message_date.desc&limit=400';
  return sbSelect<FlagRow>(env, 'ceo_sentiment_flags', `?select=${select}&${filters.join('&')}${order}`);
}

export async function setFlagResolved(env: Env, id: string, note: string): Promise<void> {
  await sbUpdate(env, 'ceo_sentiment_flags', `id=eq.${id}`, {
    resolved: true,
    resolved_at: new Date().toISOString(),
    resolved_note: note || null,
  });
}

export async function setFlagHidden(env: Env, id: string): Promise<void> {
  await sbUpdate(env, 'ceo_sentiment_flags', `id=eq.${id}`, {hidden: true});
}

export async function reopenFlag(env: Env, id: string): Promise<void> {
  await sbUpdate(env, 'ceo_sentiment_flags', `id=eq.${id}`, {
    resolved: false,
    resolved_at: null,
    resolved_note: null,
  });
}

export async function readLastScan(env: Env): Promise<{finished_at: string | null; status: string | null} | null> {
  const rows = await sbSelect<{finished_at: string | null; status: string | null}>(
    env,
    'ceo_scan_runs',
    '?select=finished_at,status&order=started_at.desc&limit=1'
  );
  return rows[0] ?? null;
}
