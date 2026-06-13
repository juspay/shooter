// Server-side LiteLLM client. Calls the OpenAI-compatible chat-completions API
// directly with the server-side key (process.env) — no proxy, no browser
// exposure. Used by the always-on autopilot engine.

const REQUEST_TIMEOUT_MS = 20_000;

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
  systemInstruction: string;
  userPrompt: string;
}): Promise<null | T> {
  const cfg = litellmConfig();
  if (!cfg) {
    return null;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${cfg.base}/chat/completions`, {
      body: JSON.stringify({
        max_tokens: opts.maxTokens ?? 400,
        messages: [
          { content: opts.systemInstruction, role: 'system' },
          { content: opts.userPrompt, role: 'user' },
        ],
        model: cfg.model,
      }),
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    });
    if (!res.ok) {
      return null;
    }
    const data: unknown = await res.json();
    return extractJsonContent(data) as null | T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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
    const start = cleaned.indexOf('{');
    if (start !== -1) {
      let depth = 0;
      for (let i = start; i < cleaned.length; i++) {
        if (cleaned[i] === '{') {
          depth++;
        } else if (cleaned[i] === '}') {
          depth--;
          if (depth === 0) {
            try {
              return JSON.parse(cleaned.slice(start, i + 1));
            } catch {
              return null;
            }
          }
        }
      }
    }
    return null;
  }
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
