import type {ActionFunctionArgs} from '@shopify/remix-oxygen';
import {json} from '@shopify/remix-oxygen';
import {getRepFromRequest} from '../lib/sales-floor-reps';
import {claudeTool} from '~/lib/anthropic';

// ─────────────────────────────────────────────────────────────────────────────
// /api/linkedin-intro
// ─────────────────────────────────────────────────────────────────────────────
// POST { leadId, name, company, city?, state?, notes? }
//   → { ok, intro: string, model }
//
// Generates a 2-line LinkedIn intro message in Highsman's brand voice (High
// Performer archetype — see project_highsman_brand_voice.md). Haiku 4.5 by
// default — schema-constrained synthesis over pre-summarized evidence is
// exactly Haiku's strike zone (feedback_brief_haiku_default.md). The rep
// copies this to their clipboard and pastes it into LinkedIn Sales Navigator
// or the free-tier message compose — we NEVER auto-send (LinkedIn TOS).
//
// Guardrails:
//   • 2 sentences, ≤ 280 chars total (LinkedIn connect-request note max is
//     300 on free-tier, 600 on Premium — we play it safe for both).
//   • Leads with "Hey Jamie" — first-name + brand casual, never "Dear Mr."
//   • Never uses the phrase "quick question" (hedging — banned in voice).
//   • Never mentions HIPAA, medical, or treating the reader like a patient.
//   • Mentions the shop name if we have it so the message looks researched.
//
// Companion memory: project_highsman_brand_voice.md, feedback_brief_haiku_default.md
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You write LinkedIn intro messages for Highsman, a premium cannabis CPG brand founded by Heisman Trophy winner Ricky Williams. Every message is sent by a Highsman sales rep (Sky or Pete) to a dispensary buyer, manager, or owner.

VOICE — "High Performer" archetype:
- Confident, warm, direct. Reads like a rep who already knows they belong.
- Never hedges ("quick question", "just checking in", "hope this finds you well", "sorry to bother").
- Never permission-seeks ("would you be open to", "if it's not too much trouble").
- Never over-explains the product. One concrete specific wins.
- Casual but professional — first name greetings, contractions fine.

HARD RULES:
- Exactly 2 sentences. Total length ≤ 280 characters.
- Start with first-name greeting ("Hey {first}," or "{first} —").
- Reference the shop by name if provided — shows research.
- End with a concrete next step (demo, drop-off, call), NOT a question like "interested?".
- NEVER mention HIPAA, treatment, medical, patients, or prescriptions.
- NEVER use emojis, hashtags, or "DM me".
- NEVER promise prices, discounts, or pet-specific claims.

Output ONLY the message body — no salutation signature, no "Best,", no name after.`;

export async function action({request, context}: ActionFunctionArgs) {
  const rep = getRepFromRequest(request);
  if (!rep) return json({ok: false, error: 'unauthorized'}, {status: 401});
  if (request.method !== 'POST') {
    return json({ok: false, error: 'method not allowed'}, {status: 405});
  }

  const env = (context as any).env || {};
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return json({ok: false, error: 'ANTHROPIC_API_KEY missing'}, {status: 500});
  }

  let body: any = {};
  try {
    body = await request.json();
  } catch {
    return json({ok: false, error: 'invalid JSON'}, {status: 400});
  }

  const name = String(body?.name || '').trim();
  const company = String(body?.company || '').trim();
  const city = String(body?.city || '').trim();
  const state = String(body?.state || '').trim();
  const notes = String(body?.notes || '').trim().slice(0, 600);

  if (!name) {
    return json({ok: false, error: 'name is required'}, {status: 400});
  }

  // First name only — LinkedIn greetings use first names exclusively.
  const firstName = name.split(/\s+/)[0] || name;

  const userContent = [
    `Recipient: ${firstName}`,
    company ? `Shop: ${company}` : '',
    city || state ? `Location: ${[city, state].filter(Boolean).join(', ')}` : '',
    `Sender: ${rep.displayName} (Highsman rep)`,
    notes ? `Context notes: ${notes}` : '',
    '',
    'Write the 2-sentence LinkedIn intro.',
  ]
    .filter(Boolean)
    .join('\n');

  try {
    const result = await claudeTool<{intro: string}>({
      apiKey,
      model: 'claude-haiku-4-5-20251001',
      system: SYSTEM_PROMPT,
      user: userContent,
      maxTokens: 400,
      temperature: 0.7,
      tool: {
        name: 'emit_intro',
        description:
          'Emit the final 2-sentence LinkedIn intro message (message body only, ≤280 chars).',
        input_schema: {
          type: 'object',
          properties: {
            intro: {
              type: 'string',
              description:
                'The 2-sentence intro, message body only. No signature, no hashtags, no emojis.',
            },
          },
          required: ['intro'],
        },
      },
    });

    let intro = (result?.input?.intro || '').trim();
    // Defensive trim — the tool schema is unreliable on length caps.
    if (intro.length > 300) intro = intro.slice(0, 297).trimEnd() + '...';

    if (!intro) {
      return json(
        {ok: false, error: 'Claude returned empty intro'},
        {status: 502},
      );
    }

    return json({
      ok: true,
      intro,
      model: 'claude-haiku-4-5-20251001',
    });
  } catch (e: any) {
    console.error('[linkedin-intro]', e?.message || e);
    return json(
      {ok: false, error: `intro generation failed: ${e?.message || 'unknown'}`},
      {status: 502},
    );
  }
}
