// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (Claude) — Server-side Client
// ─────────────────────────────────────────────────────────────────────────────
// Minimal wrapper around `POST https://api.anthropic.com/v1/messages`.
//
// Usage:
//   const res = await claudeTool({
//     apiKey: env.ANTHROPIC_API_KEY,
//     model: 'claude-sonnet-4-6',
//     system: '...system prompt...',
//     user: '...user content...',
//     tool: { name: 'build_brief', description: '...', input_schema: {...} },
//   });
//   // res.input is the structured args the model called the tool with.
//
// We force a single tool call via `tool_choice: { type: 'tool', name }`, so the
// caller always gets a structured object back instead of free-form text.
//
// NOTE: model id. Anthropic's current named model id for Claude Sonnet 4.6 is
// `claude-sonnet-4-6`. If that string is rejected, the `messages` endpoint
// returns a clean 404 with a human-readable error; surface it verbatim.
// ─────────────────────────────────────────────────────────────────────────────

export const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
export const ANTHROPIC_VERSION = '2023-06-01';

export type ClaudeToolSchema = {
  name: string;
  description: string;
  input_schema: Record<string, any>;
};

export type ClaudeToolCall<T = any> = {
  name: string;
  input: T;
  stopReason: string | null;
  usage?: {input_tokens?: number; output_tokens?: number};
};

export type ClaudeToolInput = {
  apiKey: string;
  model?: string;          // default claude-sonnet-4-6
  system: string;          // system prompt
  user: string;            // user content (rendered context)
  tool: ClaudeToolSchema;
  maxTokens?: number;      // default 2048
  temperature?: number;    // default 0.4 (a little creative room for the Play)
  timeoutMs?: number;      // default 25000 — Oxygen worker budget is 30s
};

export async function claudeTool<T = any>(
  input: ClaudeToolInput,
): Promise<ClaudeToolCall<T>> {
  const model = input.model || 'claude-sonnet-4-6';
  const maxTokens = input.maxTokens ?? 2048;
  const temperature = input.temperature ?? 0.4;
  const timeoutMs = input.timeoutMs ?? 25000;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: input.system,
    messages: [{role: 'user', content: input.user}],
    tools: [input.tool],
    tool_choice: {type: 'tool', name: input.tool.name},
  };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${ANTHROPIC_API_BASE}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': input.apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Anthropic ${res.status}: ${text.slice(0, 400) || 'no body'}`,
      );
    }

    const data = (await res.json()) as any;

    // Claude returns content as an array of blocks. With tool_choice pinned,
    // exactly one `tool_use` block is expected.
    const blocks: any[] = Array.isArray(data?.content) ? data.content : [];
    const toolUse = blocks.find(
      (b) => b && b.type === 'tool_use' && b.name === input.tool.name,
    );

    if (!toolUse) {
      // Fall back: surface any text blocks so the caller can log/debug.
      const texts = blocks
        .filter((b) => b && b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .slice(0, 400);
      throw new Error(
        `Anthropic response missing tool_use for '${input.tool.name}'. Stop: ${
          data?.stop_reason || 'unknown'
        }. Text: ${texts}`,
      );
    }

    return {
      name: toolUse.name,
      input: toolUse.input as T,
      stopReason: data?.stop_reason || null,
      usage: data?.usage
        ? {
            input_tokens: data.usage.input_tokens,
            output_tokens: data.usage.output_tokens,
          }
        : undefined,
    };
  } finally {
    clearTimeout(timer);
  }
}

// Convenience: is the Anthropic key configured on this env bag?
export function isAnthropicConfigured(env: Record<string, string | undefined>): boolean {
  return !!env.ANTHROPIC_API_KEY && env.ANTHROPIC_API_KEY.length > 20;
}
