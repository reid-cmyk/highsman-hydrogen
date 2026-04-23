import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {claudeTool, isAnthropicConfigured, type ClaudeToolSchema} from '../lib/anthropic';
import {getZohoAccessToken as getZohoToken} from '~/lib/zoho-auth';

// ─────────────────────────────────────────────────────────────────────────────
// Vibes — Post-Visit Voice Note Parser
// ─────────────────────────────────────────────────────────────────────────────
// POST /api/vibes-note-parse
//   body: {
//     accountId:    string,
//     accountName?: string,
//     tier:         'onboarding' | 'training' | 'checkin',
//     note:         string,         // free-form text (browser-transcribed voice or typed)
//   }
//   → { ok, parsed: { summary, nextAction, reschedule, intel, sentiment,
//                     reorderSignal, budtenderCalledOut, escalateToSky },
//       noteId?: string, visitDateStamped: boolean }
//
// Flow:
//   1. Claude parses the free-form note into a structured payload using the
//      build_visit_parse tool (tool_choice pinned).
//   2. We write a [VIBES-VISIT] Zoho Note tying the raw note + structured
//      summary to the Account (audit trail).
//   3. We stamp `Visit_Date` = today on the Account so the check-in cadence
//      resets cleanly (next auto-check-in is 30 days out from this visit).
//
// Degradation:
//   • No Anthropic key → write a plain Note with the raw text, skip structure.
//   • Claude errors → write a plain Note + return warning.
//   • Zoho Note write fails → still return the parsed structure so the UI can
//     show Serena what was captured; surface the write error.
// ─────────────────────────────────────────────────────────────────────────────

const VIBES_NOTE_SUBJECT_PREFIX = '[VIBES-VISIT]';

type Tier = 'onboarding' | 'training' | 'checkin';

// ─── Claude tool schema ─────────────────────────────────────────────────────
const PARSE_VISIT_TOOL: ClaudeToolSchema = {
  name: 'build_visit_parse',
  description:
    'Extract structured fields from a Vibes rep post-visit note. Ground every field in the note text; if a field is not supported, use the "empty" value per the schema.',
  input_schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          '2-sentence crisp summary of what actually happened on this visit. Factual. No embellishment.',
      },
      nextAction: {
        type: 'string',
        description:
          'The single most important next action. One sentence, assumptive/imperative. Example: "Send Triple Threat sample pack to Marco by Friday." Empty string if the note contains no actionable follow-up.',
      },
      reschedule: {
        type: 'object',
        properties: {
          needed: {
            type: 'boolean',
            description: 'True if the visit was cut short, missed, or the buyer asked to reschedule.',
          },
          reason: {
            type: 'string',
            description: 'Short reason for reschedule, or empty string.',
          },
          targetWindow: {
            type: 'string',
            description:
              'When Serena should return: "next Tuesday", "in 2 weeks", or empty string if not specified.',
          },
        },
        required: ['needed', 'reason', 'targetWindow'],
      },
      intel: {
        type: 'array',
        minItems: 0,
        maxItems: 5,
        items: {type: 'string'},
        description:
          'Short intel bullets Sky needs to know (competitor mentions, buyer change, shelf movement, price pushback). 0–5 items, each under 20 words. Empty array if nothing notable.',
      },
      sentiment: {
        type: 'string',
        enum: ['hot', 'warm', 'neutral', 'cool', 'cold'],
        description:
          "Buyer/store sentiment on Highsman. 'hot' = pushing reorders, selling hard; 'cold' = dead weight / no engagement.",
      },
      reorderSignal: {
        type: 'string',
        enum: ['placed', 'imminent', 'discussed', 'not_ready', 'none'],
        description:
          "'placed' = order was placed on the visit; 'imminent' = buyer will order within 7 days; 'discussed' = reorder came up but no commitment; 'not_ready' = buyer pushed back; 'none' = reorder not discussed.",
      },
      budtenderCalledOut: {
        type: 'string',
        description:
          'Name of any specific budtender mentioned positively (someone Serena can tag as point-person). Empty string if none.',
      },
      escalateToSky: {
        type: 'boolean',
        description:
          'True when Sky needs to personally call this account within 48 hours (buyer dissatisfied, competitor displacing us, account risk, reorder hot enough to close by phone).',
      },
    },
    required: [
      'summary',
      'nextAction',
      'reschedule',
      'intel',
      'sentiment',
      'reorderSignal',
      'budtenderCalledOut',
      'escalateToSky',
    ],
  },
};

const SYSTEM_PROMPT = `You are the Highsman Vibes Team AI Coach.

Your job: parse Serena's post-visit note into structured fields so Sky's floor board stays current and the route builder can react.

Serena is a Highsman brand rep working NJ dispensaries Tue/Wed/Thu. She types or dictates a quick note after each visit: who she saw, what happened, what's next. The note is terse and human — expect shorthand.

VOICE DISCIPLINE WHEN WRITING FIELDS:
- Declarative, no hedging. No "could", "might", "maybe".
- Assumptive close style: "Lock the reorder." not "Suggest the reorder."
- Highsman product names used correctly: Hit Stick, Triple Infused Pre-Rolls, Ground Game, Triple Threat.

DISCIPLINE:
- Ground EVERY field in the note text. Do not invent. If a field isn't supported by the note, return the schema's "empty" value (empty string, empty array, 'neutral', 'none', false).
- Escalate to Sky ONLY when the note contains clear signal: buyer dissatisfied, competitor moving in, reorder so hot Sky should call to close, account at risk.
- Rescheduling: if Serena was turned away, cut short, or the buyer asked for a different time, flag it.
- Intel: capture competitor mentions by name, new buyer info, shelf-movement observations, price complaints. Skip generic "went well" fluff.

OUTPUT: Call the build_visit_parse tool exactly once. No free-form text.`;

function isValidTier(v: any): v is Tier {
  return v === 'onboarding' || v === 'training' || v === 'checkin';
}

async function writeVibesNote(args: {
  token: string;
  accountId: string;
  accountName: string;
  tier: Tier;
  rawNote: string;
  parsed: any | null;
  repLabel: string;
}): Promise<string | null> {
  const {token, accountId, accountName, tier, rawNote, parsed, repLabel} = args;
  const today = new Date().toISOString().slice(0, 10);
  const tierLabel = tier.toUpperCase();
  const noteTitle = `${VIBES_NOTE_SUBJECT_PREFIX} ${tierLabel} ${today} — ${repLabel}`;

  const sections: string[] = [];
  sections.push(`Vibes ${tierLabel} visit logged by ${repLabel} on ${today}.`);
  if (accountName) sections.push(`Account: ${accountName}`);
  sections.push('');
  sections.push('— Raw note —');
  sections.push(rawNote.trim());
  if (parsed) {
    sections.push('');
    sections.push('— Structured —');
    sections.push(`Summary: ${parsed.summary || '(none)'}`);
    sections.push(`Sentiment: ${parsed.sentiment || 'neutral'}`);
    sections.push(`Reorder signal: ${parsed.reorderSignal || 'none'}`);
    if (parsed.nextAction) sections.push(`Next action: ${parsed.nextAction}`);
    if (parsed.reschedule?.needed) {
      sections.push(
        `Reschedule: needed — ${parsed.reschedule.reason || 'no reason given'} (target ${parsed.reschedule.targetWindow || 'unspecified'})`,
      );
    }
    if (parsed.budtenderCalledOut) {
      sections.push(`Budtender called out: ${parsed.budtenderCalledOut}`);
    }
    if (Array.isArray(parsed.intel) && parsed.intel.length > 0) {
      sections.push('Intel:');
      for (const item of parsed.intel) sections.push(`  • ${item}`);
    }
    if (parsed.escalateToSky) {
      sections.push('⚠ ESCALATE TO SKY within 48 hours.');
    }
  }

  const payload = {
    data: [
      {
        Note_Title: noteTitle.slice(0, 120),
        Note_Content: sections.join('\n').slice(0, 9000),
        Parent_Id: accountId,
        $se_module: 'Accounts',
      },
    ],
  };

  const res = await fetch('https://www.zohoapis.com/crm/v7/Notes', {
    method: 'POST',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const text = await res.text().catch(() => '');
  if (!res.ok) {
    throw new Error(`Zoho Notes create (${res.status}): ${text.slice(0, 300)}`);
  }
  let j: any = {};
  try {
    j = JSON.parse(text);
  } catch {}
  return j?.data?.[0]?.details?.id || j?.data?.[0]?.id || null;
}

// Stamp Visit_Date = today on the Account so the Check-In cadence resets.
async function stampVisitDate(
  accountId: string,
  token: string,
): Promise<boolean> {
  const today = new Date().toISOString().slice(0, 10);
  const payload = {
    data: [{id: accountId, Visit_Date: today}],
  };
  const res = await fetch('https://www.zohoapis.com/crm/v7/Accounts', {
    method: 'PUT',
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    console.warn(`[vibes-note-parse] Visit_Date stamp failed (${res.status}): ${t.slice(0, 200)}`);
    return false;
  }
  return true;
}

export async function action({request, context}: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});

  const env = (context as any).env || {};

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const accountId = String(body?.accountId || '').trim();
  const accountName = String(body?.accountName || '').trim();
  const rawNote = String(body?.note || '').trim();
  const tier = isValidTier(body?.tier) ? (body.tier as Tier) : null;

  if (!accountId || !/^\d{6,}$/.test(accountId)) {
    return json({ok: false, error: 'invalid accountId'}, {status: 400});
  }
  if (!tier) {
    return json(
      {ok: false, error: 'tier must be onboarding|training|checkin'},
      {status: 400},
    );
  }
  if (rawNote.length < 3) {
    return json({ok: false, error: 'note too short'}, {status: 400});
  }
  if (rawNote.length > 6000) {
    return json({ok: false, error: 'note too long (6000 char max)'}, {status: 400});
  }

  const repLabel =
    (rep as any).displayName || (rep as any).name || rep.email || 'rep';

  let parsed: any = null;
  let parseWarning: string | null = null;

  if (isAnthropicConfigured(env)) {
    try {
      const today = new Date().toISOString();
      const userContent = [
        `TODAY: ${today}`,
        `REP: Serena (Highsman Vibes Team)`,
        `TIER: ${tier.toUpperCase()}`,
        `STORE: ${accountName || '(unknown)'}`,
        '',
        'NOTE:',
        rawNote,
        '',
        'TASK: Call build_visit_parse once. Ground every field in the note text.',
      ].join('\n');

      const result = await claudeTool<any>({
        apiKey: env.ANTHROPIC_API_KEY!,
        model: env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
        system: SYSTEM_PROMPT,
        user: userContent,
        tool: PARSE_VISIT_TOOL,
        maxTokens: 900,
        temperature: 0.25,
        timeoutMs: 22000,
      });
      parsed = result.input || null;
    } catch (err: any) {
      parseWarning = err.message || 'Claude parse failed';
      console.warn('[vibes-note-parse] Claude failed:', parseWarning);
    }
  } else {
    parseWarning = 'Anthropic not configured — note saved raw without structure.';
  }

  // Write Zoho artifacts regardless of parse success.
  let noteId: string | null = null;
  let visitDateStamped = false;
  let writeWarning: string | null = null;

  try {
    const token = await getZohoToken(env);
    noteId = await writeVibesNote({
      token,
      accountId,
      accountName,
      tier,
      rawNote,
      parsed,
      repLabel,
    });
    visitDateStamped = await stampVisitDate(accountId, token);
  } catch (err: any) {
    writeWarning = err.message || 'Zoho write failed';
    console.error('[vibes-note-parse] Zoho write failed:', writeWarning);
  }

  return json(
    {
      ok: true,
      parsed,
      noteId,
      visitDateStamped,
      warnings: [parseWarning, writeWarning].filter(Boolean),
    },
    {headers: {'Cache-Control': 'no-store'}},
  );
}
