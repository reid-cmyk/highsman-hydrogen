// ─────────────────────────────────────────────────────────────────────────────
// Anthropic (Claude) — Server-side Client (streaming)
// ─────────────────────────────────────────────────────────────────────────────
// Minimal wrapper around `POST https://api.anthropic.com/v1/messages` with
// `stream: true`. Parses the SSE event stream, reassembles the tool_use block,
// and returns the same structured `{name, input, stopReason, usage}` shape as
// a blocking call — callers don't change.
//
// Why streaming is the default here (do NOT revert to blocking):
//   Oxygen workers have a ~30s wall-clock budget. Sonnet 4.6 with a tool_use
//   structured output legitimately runs 20–30s on warm accounts (Anthropic
//   API variance). A blocking POST aborts ~10–20% of runs with "operation was
//   aborted" and there's no context-trim or timeout bump that reliably fixes
//   it. Streaming returns first bytes in ~1s and keeps the connection alive
//   through the full synthesis, so the worker never thinks it died. Same cost,
//   same tokens, same quality — higher reliability. See
//   .auto-memory/feedback_claude_streaming_default.md for the rule.
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
// We pin `tool_choice: { type: 'tool', name }` so the caller always gets a
// structured object back, never free-form text.
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
  temperature?: number;    // default 0.4 (a little creative room)
  // Overall wall-clock for the full stream. Default 45s — safe because
  // streaming keeps the connection alive; the Oxygen worker sees continuous
  // bytes and won't preempt us before the final event.
  timeoutMs?: number;
};

// SSE helpers ────────────────────────────────────────────────────────────────

// An Anthropic SSE event. Event name is on the `event:` line, JSON payload
// is on the `data:` line(s). Events are separated by a blank line.
type SSEEvent = {event: string; data: any};

// Parse a chunk of raw SSE text into discrete events. Pass back any trailing
// incomplete event so the next chunk can prepend to it.
function parseSSEChunk(
  buffer: string,
): {events: SSEEvent[]; remainder: string} {
  const events: SSEEvent[] = [];
  // Normalize CRLF → LF, then split on blank lines (event boundary).
  const normalized = buffer.replace(/\r\n/g, '\n');
  const parts = normalized.split('\n\n');
  // Last part may be incomplete — carry it over.
  const remainder = parts.pop() ?? '';
  for (const raw of parts) {
    if (!raw.trim()) continue;
    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of raw.split('\n')) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trim());
      }
      // Ignore `id:` and comment lines.
    }
    const dataStr = dataLines.join('\n');
    if (!dataStr) continue;
    let data: any;
    try {
      data = JSON.parse(dataStr);
    } catch {
      // Anthropic only sends JSON; a parse failure means a malformed chunk
      // which we skip rather than throw (next chunk usually recovers).
      continue;
    }
    events.push({event: eventName, data});
  }
  return {events, remainder};
}

// Streaming tool call ────────────────────────────────────────────────────────

export async function claudeTool<T = any>(
  input: ClaudeToolInput,
): Promise<ClaudeToolCall<T>> {
  const model = input.model || 'claude-sonnet-4-6';
  const maxTokens = input.maxTokens ?? 2048;
  const temperature = input.temperature ?? 0.4;
  const timeoutMs = input.timeoutMs ?? 45000;

  const body = {
    model,
    max_tokens: maxTokens,
    temperature,
    system: input.system,
    messages: [{role: 'user', content: input.user}],
    tools: [input.tool],
    tool_choice: {type: 'tool', name: input.tool.name},
    stream: true,
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
        Accept: 'text/event-stream',
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
    if (!res.body) {
      throw new Error('Anthropic stream missing response body');
    }

    // State we accumulate across events. With tool_choice pinned, we expect
    // exactly one tool_use block. We track by content-block index so stray
    // text blocks (shouldn't happen but belt+suspenders) don't poison the
    // tool_use buffer.
    let toolUseName: string | null = null;
    let toolUseIndex: number | null = null;
    let toolInputJson = '';
    const textFallbackParts: string[] = [];
    let stopReason: string | null = null;
    const usage: {input_tokens?: number; output_tokens?: number} = {};

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const {value, done} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream: true});

      const {events, remainder} = parseSSEChunk(buffer);
      buffer = remainder;

      for (const {event, data} of events) {
        switch (event) {
          case 'message_start': {
            const u = data?.message?.usage;
            if (u?.input_tokens != null) usage.input_tokens = u.input_tokens;
            if (u?.output_tokens != null) usage.output_tokens = u.output_tokens;
            break;
          }
          case 'content_block_start': {
            const block = data?.content_block;
            const idx = data?.index;
            if (block?.type === 'tool_use' && block?.name === input.tool.name) {
              toolUseName = block.name;
              toolUseIndex = typeof idx === 'number' ? idx : toolUseIndex;
            }
            break;
          }
          case 'content_block_delta': {
            const delta = data?.delta;
            const idx = data?.index;
            if (delta?.type === 'input_json_delta' && idx === toolUseIndex) {
              // Anthropic streams the tool input as incremental JSON chunks
              // via `partial_json`. Concatenate; parse once at the end.
              toolInputJson += String(delta.partial_json ?? '');
            } else if (delta?.type === 'text_delta') {
              // Only reached if tool_choice is ignored (shouldn't happen).
              textFallbackParts.push(String(delta.text ?? ''));
            }
            break;
          }
          case 'content_block_stop':
            // Nothing to do — we parse the accumulated JSON in message_stop.
            break;
          case 'message_delta': {
            if (data?.delta?.stop_reason) stopReason = data.delta.stop_reason;
            const u = data?.usage;
            if (u?.output_tokens != null) usage.output_tokens = u.output_tokens;
            break;
          }
          case 'message_stop':
            // Terminal event — outer reader will hit done shortly.
            break;
          case 'error': {
            // Anthropic mid-stream error — surface it clearly.
            const msg =
              data?.error?.message ||
              data?.error?.type ||
              JSON.stringify(data).slice(0, 400);
            throw new Error(`Anthropic stream error: ${msg}`);
          }
          case 'ping':
          default:
            // Ignore keep-alives and any unknown event types.
            break;
        }
      }
    }

    if (!toolUseName) {
      const text = textFallbackParts.join('').slice(0, 400);
      throw new Error(
        `Anthropic response missing tool_use for '${input.tool.name}'. Stop: ${
          stopReason || 'unknown'
        }. Text: ${text}`,
      );
    }

    // Parse the streamed JSON. Anthropic guarantees well-formed JSON on
    // `message_stop`; a parse failure at this point means a truncated stream
    // (usually caused by worker preemption).
    let parsed: any;
    try {
      parsed = toolInputJson ? JSON.parse(toolInputJson) : {};
    } catch (e: any) {
      throw new Error(
        `Anthropic tool_use JSON parse failed: ${e?.message || e}. Raw: ${toolInputJson.slice(
          0,
          300,
        )}`,
      );
    }

    return {
      name: toolUseName,
      input: parsed as T,
      stopReason,
      usage:
        usage.input_tokens != null || usage.output_tokens != null
          ? usage
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
