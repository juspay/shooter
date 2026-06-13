// Server-side LiteLLM client. Calls the OpenAI-compatible chat-completions API
// directly with the server-side key (process.env) — no proxy, no browser
// exposure. Used by the always-on autopilot engine.

const REQUEST_TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 2;
const BACKOFF_MS = [800]; // backoff before the single retry (rate-limit / transient failures)

/** Pull the model's JSON out of an OpenAI-shaped chat-completion response. */
export function extractJsonContent(data: unknown): unknown {
  const content = (data as { choices?: { message?: { content?: string } }[] })?.choices?.[0]
    ?.message?.content;
  if (typeof content !== 'string') {
    return null;
  }
  return parseJsonResponse(content);
}

/** True when LITELLM_BASE_URL and LITELLM_API_KEY are both configured server-side. */
export function isLiteLLMConfigured(): boolean {
  return litellmConfig() !== null;
}

/**
 * Run a structured-JSON prompt against LiteLLM. Returns the parsed object, or
 * null when LiteLLM is unconfigured / unreachable / the response is not JSON.
 */
export async function litellmJson<T>(opts: {
  maxTokens?: number;
  /** Override the model for this call (e.g. the autopilot engine pins a non-reasoning model). */
  model?: string;
  systemInstruction: string;
  userPrompt: string;
}): Promise<null | T> {
  const cfg = litellmConfig();
  if (!cfg) {
    return null;
  }
  // Attempt with JSON mode (forces the model to emit ONLY valid JSON — verbose/reasoning models
  // otherwise wrap prose around it), retrying with backoff for rate-limit / transient burst
  // failures. If every JSON-mode attempt fails, fall back ONCE without response_format in case the
  // gateway rejects it — so a non-supporting backend degrades to prior behavior instead of breaking.
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const result = await attemptCompletion<T>(cfg, opts, true);
    if (result !== null) {
      return result;
    }
    if (attempt < MAX_ATTEMPTS - 1) {
      await delay(BACKOFF_MS[attempt]);
    }
  }
  return attemptCompletion<T>(cfg, opts, false);
}

/**
 * Strip optional markdown fences and parse JSON. If the whole string is not
 * valid JSON, extract the FIRST balanced {...} object (a single forward scan
 * tracking brace depth — correct across nested braces and multiple objects,
 * unlike a greedy regex which would span to the last closing brace).
 */
export function parseJsonResponse(raw: string): unknown {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  if (!cleaned) {
    return null;
  }
  try {
    return JSON.parse(cleaned);
  } catch {
    // Scan for the FIRST balanced {...} region that actually parses. A reasoning model often emits
    // an invalid brace region (e.g. "{not: valid}") in its preamble BEFORE the real JSON, so on a
    // failed candidate we must advance to the next "{" and keep scanning — not give up (the old
    // `return null` here discarded every later region and collapsed consensus to empty).
    let start = cleaned.indexOf('{');
    while (start !== -1) {
      let depth = 0;
      let end = -1;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
          depth++;
        } else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) {
            end = i;
            break;
          }
        }
      }
      if (end === -1) {
        return null; // unbalanced through end of string — nothing more to try
      }
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        start = cleaned.indexOf('{', start + 1);
      }
    }
    return null;
  }
}

async function attemptCompletion<T>(
  cfg: { base: string; key: string; model: string },
  opts: { maxTokens?: number; model?: string; systemInstruction: string; userPrompt: string },
  jsonMode: boolean
): Promise<null | T> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const body: Record<string, unknown> = {
      max_tokens: opts.maxTokens ?? 400,
      messages: [
        { content: opts.systemInstruction, role: 'system' },
        { content: opts.userPrompt, role: 'user' },
      ],
      model: opts.model?.trim() || cfg.model,
      temperature: 0,
    };
    if (jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    const res = await fetch(`${cfg.base}/chat/completions`, {
      body: JSON.stringify(body),
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });
    if (!res.ok) {
      // Surface the failure — silently returning null here made the whole autopilot pipeline
      // produce empty consensus invisibly (no log, no signal). 429 = the LiteLLM key's
      // max_parallel_requests is exhausted (often by other processes sharing the key).
      const detail = await res.text().catch(() => '');
      console.warn(
        `[litellm] HTTP ${res.status} (model=${body.model as string}, jsonMode=${jsonMode}): ${detail.slice(0, 200)}`
      );
      return null;
    }
    const data: unknown = await res.json();
    return extractJsonContent(data) as null | T;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    // AbortError = our REQUEST_TIMEOUT_MS fired (the gateway hung). Anything else = network/parse.
    console.warn(`[litellm] request failed (model=${opts.model?.trim() || cfg.model}): ${reason}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function litellmConfig(): null | { base: string; key: string; model: string } {
  const base = process.env.LITELLM_BASE_URL?.trim();
  const key = process.env.LITELLM_API_KEY?.trim();
  if (!base || !key) {
    return null;
  }
  return {
    base: base.replace(/\/+$/, ''),
    key,
    model: process.env.LITELLM_MODEL?.trim() || 'open-large',
  };
}
