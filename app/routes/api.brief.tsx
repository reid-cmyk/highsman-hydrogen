import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest, type SalesRep} from '../lib/sales-floor-reps';
import {
  fetchCallsForParticipant,
  listMessagesWith,
  formatPhoneE164,
  isQuoConfigured,
  type QuoCall,
  type QuoMessage,
} from '../lib/quo';
import {claudeTool, isAnthropicConfigured, type ClaudeToolSchema} from '../lib/anthropic';

// ─────────────────────────────────────────────────────────────────────────────
// Sales Floor — AI Pre-Call Brief
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/brief
//   body (JSON): { lead: { First_Name, Last_Name, _fullName, Company,
//                          Phone, Email, _status, Lead_Source, Description } }
//   → { ok, brief: {...}, mode: 'cold'|'warm', sources: {...}, debug?: {...} }
//
// What the brief gives the rep, in order:
//   1. Last-contact summary block — distilled from whichever channel pinged
//      this lead most recently (call / SMS / email).
//   2. Sky's Play — one-paragraph coaching recommendation on what to sell /
//      push on this specific call, grounded in prior conversation context.
//   3. Talking points — 3–5 concrete items Sky can lead with.
//   4. Likely objections + pre-baked flips.
//   5. Suggested opener — exact words, assumptive (no permissioning).
//   6. Expandable history timeline — last ~6 interactions across channels.
//
// Data sources:
//   • Quo calls (with AI summaries) — /calls?participants[]=E.164
//   • Quo SMS messages — /messages?participants[]=E.164
//   • Gmail (per-rep OAuth) — /api/sales-floor-gmail-thread internal call
//     folded into the merged context before Claude sees it.
//
// We run a SINGLE Claude call with tool_choice pinned to `build_brief`, so the
// model always returns a structured object. Claude does the dedup + narrative
// sense-making across channels; we just feed it raw evidence.
//
// Degradation path:
//   • No Anthropic key → static cold template (same as legacy behavior).
//   • Quo or Gmail individually failing → we continue with whatever IS
//     available; Claude is told which channels were empty vs unavailable.
// ─────────────────────────────────────────────────────────────────────────────

type LeadPayload = {
  First_Name?: string;
  Last_Name?: string;
  _fullName?: string;
  Company?: string;
  Phone?: string;
  Mobile?: string;
  Email?: string;
  _status?: string;
  Lead_Source?: string;
  Description?: string;
};

// ─── Claude tool schema ─────────────────────────────────────────────────────
// Pinned via tool_choice so the model is forced to return this exact shape.
// Every field is required EXCEPT where the model might legitimately have
// nothing to say (e.g. likelyObjections can be []). Keep descriptions terse —
// they ARE the prompt for each field.
const BUILD_BRIEF_TOOL: ClaudeToolSchema = {
  name: 'build_brief',
  description:
    'Produce a structured pre-call brief for a sales rep calling a lead. Ground every claim in the provided history; do not invent facts.',
  input_schema: {
    type: 'object',
    properties: {
      mode: {
        type: 'string',
        enum: ['cold', 'warm'],
        description:
          "'cold' = no prior contact found. 'warm' = at least one call, text, or email exists.",
      },
      lastContact: {
        type: 'object',
        properties: {
          channel: {
            type: 'string',
            enum: ['call', 'sms', 'email', 'none'],
            description: "Channel of the most recent interaction, or 'none' for cold.",
          },
          when: {
            type: 'string',
            description:
              "Human-readable relative timestamp, e.g. '3 days ago', 'yesterday', '2 hours ago'.",
          },
          summary: {
            type: 'string',
            description:
              '2–3 sentence distillation of what actually happened in the last interaction. Factual, no embellishment.',
          },
        },
        required: ['channel', 'when', 'summary'],
      },
      skysPlay: {
        type: 'string',
        description:
          "One-paragraph coaching tip for this specific call. Tell Sky what to sell/push and how, grounded in prior conversation context. Use Highsman Training voice: declarative, no hedging. Reference specific Highsman products only where warranted (Hit Stick, Triple Infused Pre-Rolls, Ground Game).",
      },
      talkingPoints: {
        type: 'array',
        minItems: 2,
        maxItems: 5,
        items: {type: 'string'},
        description:
          "3–5 concrete, short talking points. Each under 18 words. No hedging verbs ('could', 'might'). Prefer specifics over generalities.",
      },
      likelyObjections: {
        type: 'array',
        maxItems: 4,
        items: {
          type: 'object',
          properties: {
            objection: {type: 'string'},
            response: {
              type: 'string',
              description:
                'Sky\'s one-line flip. Assumptive, value-first, never apologetic.',
            },
          },
          required: ['objection', 'response'],
        },
        description:
          '2–4 likely objections with pre-baked flips. If no objections are inferable from history, return an empty array — do NOT invent generic ones.',
      },
      suggestedOpener: {
        type: 'string',
        description:
          'Exact words to open the call with. Assumptive, NOT permissioning. Never ask "do you have two minutes?" — open with a reason to talk. Reference something concrete from the last contact when warm.',
      },
      history: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          properties: {
            channel: {type: 'string', enum: ['call', 'sms', 'email']},
            when: {
              type: 'string',
              description: "Relative time, e.g. '3 days ago'.",
            },
            direction: {type: 'string', enum: ['incoming', 'outgoing']},
            summary: {
              type: 'string',
              description:
                '1–2 sentence summary. For SMS, paraphrase — do not quote verbatim.',
            },
          },
          required: ['channel', 'when', 'direction', 'summary'],
        },
        description:
          'Timeline of prior interactions, newest first. Max 6. Empty array for cold leads.',
      },
    },
    required: [
      'mode',
      'lastContact',
      'skysPlay',
      'talkingPoints',
      'likelyObjections',
      'suggestedOpener',
      'history',
    ],
  },
};

// ─── System prompt — Highsman Training register ────────────────────────────
// This is the voice Sky hears inside our own playbook: declarative, no
// hedging, assumptive close, Highsman-specific terminology. We also tell
// Claude to NEVER invent facts — the strongest prompt injection guard we
// can ship is "if history is empty, say so."
const SYSTEM_PROMPT = `You are the Highsman Sales Floor AI Coach.

Your job is to produce pre-call briefs for Sky Lima, a Highsman sales rep, based on verified conversation history (calls, texts, emails).

VOICE — Highsman Training Register:
- Declarative, confident, no hedging. Never use "could", "might", "maybe", "perhaps", "would you like".
- Assumptive close style: "Start with the two-pack" not "You might want to try the two-pack."
- Ricky Williams founded Highsman. Spark Greatness™ is our tagline.
- Product shorthand: Hit Stick (0.5g disposable), Triple Infused Pre-Rolls (1.2g, sharing/heavy), Ground Game (7g shake, roll-your-own). The "Triple Threat" is three Triple Infused pre-rolls.
- Never call products "artisan" or "small batch". Never use medical framing.
- "Microstructure infusion" is our signature technical term for Triple Infused.

COACHING DISCIPLINE:
- Ground EVERY claim in provided history. If no history exists, say so — do not invent past interactions.
- Sky's Play is a concrete recommendation: which SKU to lead with, which objection to pre-empt, what to close on. Tied to last-contact context.
- Openers never ask permission. "Hey Mark, following up on the Hit Stick conversation — I want to get you the 12-pack sample in this week."
- Objections must be inferred from actual prior context (price was raised, timing was an issue, buyer needs boss sign-off). Do not fabricate generic objections.
- Relative timestamps: calculate from the "Today" date in the context block.

OUTPUT: Call the build_brief tool exactly once. Do not produce free-form text.`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function fullNameOf(lead: LeadPayload): string {
  if (lead._fullName) return lead._fullName;
  const parts = [lead.First_Name, lead.Last_Name].filter(Boolean);
  return parts.join(' ').trim() || 'this lead';
}

function cleanPhone(p?: string): string {
  return formatPhoneE164(p || '') || '';
}

function isValidEmail(s?: string | null): boolean {
  if (!s) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

function shortIso(iso: string): string {
  try {
    return new Date(iso).toISOString();
  } catch {
    return iso;
  }
}

// Render a call into a compact line Claude can reason over.
function renderCallForContext(c: QuoCall): string {
  const dir = c.direction === 'outgoing' ? 'OUT' : 'IN';
  const dur = c.duration ? `${c.duration}s` : 'no connect';
  const summary = c.ai?.summary ? ` | summary: ${c.ai.summary.trim()}` : '';
  return `  • [${shortIso(c.createdAt)}] CALL ${dir} ${c.status} ${dur}${summary}`;
}

function renderSmsForContext(m: QuoMessage): string {
  const dir = m.direction === 'outgoing' ? 'OUT' : 'IN';
  const text = (m.text || '').replace(/\s+/g, ' ').trim().slice(0, 280);
  return `  • [${shortIso(m.createdAt)}] SMS ${dir}: ${text}`;
}

type EmailForContext = {
  date: string;
  direction: 'incoming' | 'outgoing';
  from: string;
  subject: string;
  snippet: string;
};
function renderEmailForContext(e: EmailForContext): string {
  const dir = e.direction === 'outgoing' ? 'OUT' : 'IN';
  const subj = (e.subject || '(no subject)').slice(0, 120);
  const snip = (e.snippet || '').replace(/\s+/g, ' ').trim().slice(0, 300);
  return `  • [${shortIso(e.date)}] EMAIL ${dir} — "${subj}" — ${snip}`;
}

// Pull Gmail messages by calling our own /api/sales-floor-gmail-thread route.
// We do this instead of inlining Gmail here so the OAuth token cache stays
// in one module, not two. Internal fetch (same-origin) picks up the cookie.
async function fetchGmailThread(
  request: Request,
  counterpartyEmail: string,
  limit: number,
): Promise<{messages: EmailForContext[]; configured: boolean; error?: string}> {
  if (!isValidEmail(counterpartyEmail)) {
    return {messages: [], configured: true};
  }
  try {
    const origin = new URL(request.url).origin;
    const target = new URL(`${origin}/api/sales-floor-gmail-thread`);
    target.searchParams.set('email', counterpartyEmail);
    target.searchParams.set('limit', String(limit));

    const res = await fetch(target.toString(), {
      headers: {
        // Forward the rep's cookie so the internal loader resolves the rep.
        Cookie: request.headers.get('Cookie') || '',
      },
    });
    if (!res.ok) return {messages: [], configured: false, error: `http ${res.status}`};
    const data = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      configured?: boolean;
      error?: string;
      messages?: Array<{
        date: string;
        direction: 'incoming' | 'outgoing';
        from: string;
        subject: string;
        snippet: string;
      }>;
    };
    return {
      messages: (data.messages || []).map((m) => ({
        date: m.date,
        direction: m.direction,
        from: m.from,
        subject: m.subject,
        snippet: m.snippet,
      })),
      configured: data.configured !== false,
      error: data.error,
    };
  } catch (err: any) {
    return {messages: [], configured: false, error: err.message || 'gmail fetch failed'};
  }
}

// Build the user-content block for Claude — all evidence, nothing else.
function buildClaudeContext(args: {
  rep: SalesRep;
  lead: LeadPayload;
  calls: QuoCall[];
  sms: QuoMessage[];
  emails: EmailForContext[];
  quoConfigured: boolean;
  gmailConfigured: boolean;
}): string {
  const {rep, lead, calls, sms, emails, quoConfigured, gmailConfigured} = args;
  const today = new Date().toISOString();
  const leadName = fullNameOf(lead);
  const company = lead.Company || '(no company on record)';
  const status = (lead._status || 'new').toLowerCase();
  const source = lead.Lead_Source || 'unknown';
  const phone = cleanPhone(lead.Phone || lead.Mobile);
  const email = (lead.Email || '').trim();

  const hasCalls = calls.length > 0;
  const hasSms = sms.length > 0;
  const hasEmails = emails.length > 0;

  const lines: string[] = [];
  lines.push(`TODAY: ${today}`);
  lines.push(`REP: ${rep.displayName} (${rep.email}) — Highsman Sales`);
  lines.push('');
  lines.push('LEAD:');
  lines.push(`  name: ${leadName}`);
  lines.push(`  company: ${company}`);
  lines.push(`  phone: ${phone || '(none)'}`);
  lines.push(`  email: ${email || '(none)'}`);
  lines.push(`  status: ${status}`);
  lines.push(`  source: ${source}`);
  if (lead.Description && lead.Description.trim()) {
    lines.push(`  crm_notes: ${lead.Description.trim().slice(0, 800)}`);
  }
  lines.push('');

  // Call history
  lines.push('CALL HISTORY (Quo):');
  if (!quoConfigured) {
    lines.push('  (Quo not configured — no call data available)');
  } else if (!phone) {
    lines.push('  (no phone on lead — skipped call lookup)');
  } else if (!hasCalls) {
    lines.push('  (no prior calls with this number)');
  } else {
    for (const c of calls.slice(0, 12)) lines.push(renderCallForContext(c));
  }
  lines.push('');

  // SMS history
  lines.push('SMS HISTORY (Quo):');
  if (!quoConfigured) {
    lines.push('  (Quo not configured — no SMS data available)');
  } else if (!phone) {
    lines.push('  (no phone on lead — skipped SMS lookup)');
  } else if (!hasSms) {
    lines.push('  (no prior texts with this number)');
  } else {
    for (const m of sms.slice(0, 15)) lines.push(renderSmsForContext(m));
  }
  lines.push('');

  // Email history
  lines.push('EMAIL HISTORY (Gmail):');
  if (!gmailConfigured) {
    lines.push('  (Gmail not configured for this rep — no email data available)');
  } else if (!email) {
    lines.push('  (no email on lead — skipped inbox lookup)');
  } else if (!hasEmails) {
    lines.push('  (no prior emails with this address)');
  } else {
    for (const e of emails.slice(0, 8)) lines.push(renderEmailForContext(e));
  }
  lines.push('');

  // Mode hint — makes Claude's job easier but doesn't override its judgment.
  const anyHistory = hasCalls || hasSms || hasEmails;
  lines.push(`DERIVED MODE HINT: ${anyHistory ? 'warm' : 'cold'}`);
  lines.push('');
  lines.push(
    'TASK: Call the build_brief tool once. Ground every claim in the evidence above. If a channel was unavailable, do not invent content for it.',
  );

  return lines.join('\n');
}

// Deterministic cold-lead fallback when Anthropic isn't configured. Mirrors
// the old ai-brief.js template so nothing regresses while the key is being
// added to Oxygen.
function buildFallbackBrief(lead: LeadPayload, rep: SalesRep): any {
  const status = (lead._status || 'new').toLowerCase();
  const name = fullNameOf(lead);
  const company = lead.Company || 'their company';
  const source = lead.Lead_Source || 'unknown';

  return {
    mode: 'cold',
    lastContact: {
      channel: 'none',
      when: 'no prior contact',
      summary:
        'No prior call, text, or email found for this lead. This is a cold open — earn the next conversation.',
    },
    skysPlay:
      "Open with a reason to talk, not a permission ask. Lead with the Hit Stick — it's the easiest first yes. If they're a shop, offer a sample pack and a floor-set visit this week.",
    talkingPoints: [
      `Introduce Highsman in one sentence — Ricky Williams' brand, Spark Greatness`,
      'Ask: what flower is moving on their shelf right now',
      'Lead with the Hit Stick as the easiest first SKU',
      'Close on a sample pack + a visit this week',
    ],
    likelyObjections: [
      {
        objection: 'Never heard of you',
        response:
          "Ricky Williams' brand — Heisman-winning NFL running back. The Hit Stick is our entry SKU and it's moving fast in every state we're in.",
      },
      {
        objection: 'Already have enough brands',
        response:
          'That\'s why we lead with the Hit Stick — 0.5g, sharp price point, proven turn. It fills a shelf gap, doesn\'t duplicate one.',
      },
    ],
    suggestedOpener: `Hey ${lead.First_Name || name}, this is ${rep.firstName} at Highsman — Ricky Williams' brand. I want to get the Hit Stick in your shop this week. What's your best day for a drop-by?`,
    history: [],
    _fallback: true,
    _fallbackReason: 'Anthropic API key not configured on this deploy.',
  };
}

// ─── Action ─────────────────────────────────────────────────────────────────

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'Method not allowed'}, {status: 405});
  }

  const rep = getRepFromRequest(request);
  if (!rep) {
    return json(
      {ok: false, error: 'Not logged in as a sales rep.'},
      {status: 401},
    );
  }

  const env = (context as any).env as Record<string, string | undefined>;

  // Parse body — accept JSON or form.
  let body: any = {};
  try {
    const ct = request.headers.get('Content-Type') || '';
    if (ct.includes('application/json')) {
      body = await request.json();
    } else {
      const form = await request.formData();
      body = Object.fromEntries(form.entries());
    }
  } catch {
    return json({ok: false, error: 'Invalid body.'}, {status: 400});
  }

  const lead: LeadPayload = body.lead || body || {};
  if (!lead || (!lead.First_Name && !lead.Last_Name && !lead._fullName)) {
    return json({ok: false, error: 'Missing lead in body.'}, {status: 400});
  }

  const phoneE164 = cleanPhone(lead.Phone || lead.Mobile);
  const emailAddr = (lead.Email || '').trim();

  const quoOk = isQuoConfigured(env);

  // ─── Pull evidence in parallel ────────────────────────────────────────────
  const callsPromise: Promise<QuoCall[]> =
    quoOk && phoneE164 && env.QUO_API_KEY && env.QUO_PHONE_NUMBER_ID
      ? fetchCallsForParticipant(
          env.QUO_API_KEY,
          env.QUO_PHONE_NUMBER_ID,
          phoneE164,
          12,
        ).catch((err) => {
          console.warn('[brief] Quo calls fetch failed:', err.message);
          return [];
        })
      : Promise.resolve([]);

  const smsPromise: Promise<QuoMessage[]> =
    quoOk && phoneE164 && env.QUO_API_KEY && env.QUO_PHONE_NUMBER_ID
      ? listMessagesWith(
          env.QUO_API_KEY,
          env.QUO_PHONE_NUMBER_ID,
          phoneE164,
          15,
        ).catch((err) => {
          console.warn('[brief] Quo SMS fetch failed:', err.message);
          return [];
        })
      : Promise.resolve([]);

  const gmailPromise = emailAddr
    ? fetchGmailThread(request, emailAddr, 8)
    : Promise.resolve({messages: [], configured: false});

  const [calls, sms, gmail] = await Promise.all([
    callsPromise,
    smsPromise,
    gmailPromise,
  ]);

  const sources = {
    quoConfigured: quoOk,
    gmailConfigured: gmail.configured,
    anthropicConfigured: isAnthropicConfigured(env),
    callCount: calls.length,
    smsCount: sms.length,
    emailCount: gmail.messages.length,
    phoneQueried: phoneE164 || null,
    emailQueried: emailAddr || null,
  };

  // ─── If Claude isn't configured, return the deterministic fallback ───────
  if (!isAnthropicConfigured(env)) {
    const brief = buildFallbackBrief(lead, rep);
    return json(
      {ok: true, brief, mode: brief.mode, sources},
      {headers: {'Cache-Control': 'no-store'}},
    );
  }

  // ─── Build context + call Claude ──────────────────────────────────────────
  const userContent = buildClaudeContext({
    rep,
    lead,
    calls,
    sms,
    emails: gmail.messages,
    quoConfigured: quoOk,
    gmailConfigured: gmail.configured,
  });

  try {
    const result = await claudeTool<any>({
      apiKey: env.ANTHROPIC_API_KEY!,
      model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
      system: SYSTEM_PROMPT,
      user: userContent,
      tool: BUILD_BRIEF_TOOL,
      maxTokens: 1800,
      temperature: 0.35,
      timeoutMs: 24000,
    });

    const brief = result.input || {};

    // Carry through what we know for the UI — don't trust Claude to repeat
    // our own config flags.
    return json(
      {
        ok: true,
        brief,
        mode: brief.mode || (calls.length || sms.length || gmail.messages.length ? 'warm' : 'cold'),
        sources,
        usage: result.usage,
      },
      {headers: {'Cache-Control': 'no-store'}},
    );
  } catch (err: any) {
    console.error('[brief] Claude call failed:', err.message);
    // Soft-fall to the deterministic brief rather than 500 — rep still needs
    // a usable panel even if the model hiccuped.
    const brief = buildFallbackBrief(lead, rep);
    brief._fallbackReason = `Claude error: ${err.message}`;
    return json(
      {ok: true, brief, mode: brief.mode, sources, warning: err.message},
      {status: 200, headers: {'Cache-Control': 'no-store'}},
    );
  }
}
