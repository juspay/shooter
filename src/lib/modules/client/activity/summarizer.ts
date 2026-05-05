// NeuroLink-powered event summarizer.
// Loads the NeuroLink SDK from CDN on first use, then generates
// rolling summaries of coding activity events.

import type { ActivityEvent, ActivitySummaryResult } from '$lib/types';

import { NEUROLINK_CDN_URL } from '$lib/modules/client/neurolink/cdn';
import { installFetchProxy } from '$lib/modules/client/neurolink/fetch-proxy';
import { detectActiveProvider } from '$lib/modules/client/neurolink/provider-config';

const LOAD_FAILURE_COOLDOWN_MS = 60_000;
const MAX_LOAD_ATTEMPTS = 3;

// Lazy-loaded SDK instance
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let sdk: null | { generate: (opts: Record<string, unknown>) => Promise<any> } = null;
let sdkPromise: null | Promise<typeof sdk> = null;
let loadAttempts = 0;
let nextRetryAt = 0;

/** Summarize a batch of events using NeuroLink. */
export async function summarizeEvents(
  events: ActivityEvent[],
  projectName?: string
): Promise<ActivitySummaryResult> {
  if (events.length === 0) {
    return { error: null, text: '' };
  }

  let nlSdk: typeof sdk;
  try {
    nlSdk = await getSDK();
  } catch {
    const mapped: string[] = events.map((e) => str(e.data.tool) || e.type);
    const tools = Array.from(new Set(mapped));
    return {
      error: 'AI SDK failed to load',
      text: `${events.length} events: ${tools.join(', ')}`,
    };
  }

  // Fallback: no SDK available — return raw count
  if (!nlSdk) {
    const mapped: string[] = events.map((e) => str(e.data.tool) || e.type);
    const tools = Array.from(new Set(mapped));
    return {
      error: 'No AI provider configured',
      text: `${events.length} events: ${tools.join(', ')}`,
    };
  }

  const formatted = formatEvents(events);
  const projectCtx = projectName ? `Project: ${projectName}\n` : '';
  const prompt = `You are a coding activity summarizer. Given these events from active Claude Code sessions, write a 1-2 sentence summary (max 150 chars) of what's happening. Be specific — mention tool names, file names, and what's being accomplished.

${projectCtx}Events:
${formatted}

Summary:`;

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result: Record<string, unknown> = await nlSdk.generate({
      input: { text: prompt },
      maxTokens: 300,
      ...(activeModel ? { model: activeModel } : {}),
      ...(activeProvider ? { provider: activeProvider } : {}),
    });
    const text = str(result.content ?? result.text);
    return { error: null, text: text.trim() || `${events.length} events processed` };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : String(err),
      text: `${events.length} events (summary unavailable)`,
    };
  }
}

function formatEventLine(e: ActivityEvent): string {
  const d = e.data;
  const project = e.projectName ? `[${e.projectName}] ` : '';
  const tool = str(d.tool) || str(d.name) || '';
  const filePath = str(d.filePath);
  const command = str(d.command);
  const pattern = str(d.pattern);

  switch (e.type) {
    case 'agent-idle':
    case 'agent-question':
      return `${project}${e.type}: ${str(d.message).slice(0, 80)}`;
    case 'error':
      return `${project}Error: ${str(d.error || d.message).slice(0, 100)}`;
    case 'session_end':
      return `${project}Session ended`;
    case 'tool-completed':
      return `${project}[${tool}] completed`;
    case 'tool-failed':
      return `${project}[${tool}] FAILED: ${str(d.error).slice(0, 80)}`;
    case 'tool-started':
      return `${project}[${tool}] started${filePath ? `: ${filePath}` : ''}`;
    case 'tool_result': {
      const status = d.is_error ? 'FAILED' : 'done';
      return `${project}${tool ? `[${tool}] → ` : ''}${status}`;
    }
    case 'tool_use': {
      const target = filePath || command || pattern || '';
      return tool ? `${project}[${tool}] ${target}`.trim() : `${project}[tool] ${target}`.trim();
    }
    case 'user_message':
      return `${project}User: ${str(d.text).slice(0, 80)}`;
    default:
      return `${project}${e.type}`;
  }
}

/** Format events into a prompt string. */
function formatEvents(events: ActivityEvent[]): string {
  return events.map(formatEventLine).join('\n');
}

// Track detected provider for generate() calls
let activeModel = '';
let activeProvider = '';

/** Load the NeuroLink SDK from CDN (once), using auto-detected provider. */
async function getSDK(): Promise<typeof sdk> {
  if (sdk) {
    return sdk;
  }
  // De-duplicate concurrent calls — share the in-flight load promise
  if (sdkPromise) {
    return sdkPromise;
  }
  // Cool down after repeated failures so a transient CDN blip doesn't
  // permanently disable summaries. Once the cooldown expires, reset the
  // attempt counter and try again.
  if (loadAttempts >= MAX_LOAD_ATTEMPTS) {
    if (Date.now() < nextRetryAt) {
      return null;
    }
    loadAttempts = 0;
  }
  loadAttempts++;

  sdkPromise = (async (): Promise<typeof sdk> => {
    try {
      // Install fetch proxy for CORS providers (anthropic, openai, mistral)
      installFetchProxy();

      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const mod = await import(/* @vite-ignore */ NEUROLINK_CDN_URL);

      // Detect which provider has credentials available
      const serverFlags = (window as unknown as Record<string, Record<string, boolean>>)
        .__aiProviders;
      const preferredProvider = (
        window as unknown as Record<string, Record<string, Record<string, string>>>
      ).process?.env?.NEUROLINK_PROVIDER;

      const active = detectActiveProvider(serverFlags, preferredProvider);
      if (!active) {
        console.warn('[ActivityFeed] No AI provider configured');
        return null;
      }

      // Proxy providers: inject dummy env vars so SDK validation passes.
      // The fetch proxy strips these and injects real keys server-side.
      const proc = (window as unknown as { process?: { env?: Record<string, string> } }).process;
      if (proc?.env && serverFlags) {
        if (serverFlags['google-ai'] && !proc.env.GOOGLE_AI_API_KEY) {
          proc.env.GOOGLE_AI_API_KEY = 'proxy-via-server';
        }
        if (serverFlags.anthropic && !proc.env.ANTHROPIC_API_KEY) {
          proc.env.ANTHROPIC_API_KEY = 'proxy-via-server';
        }
        if (serverFlags.openai && !proc.env.OPENAI_API_KEY) {
          proc.env.OPENAI_API_KEY = 'proxy-via-server';
        }
        if (serverFlags.mistral && !proc.env.MISTRAL_API_KEY) {
          proc.env.MISTRAL_API_KEY = 'proxy-via-server';
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      sdk = new mod.NeuroLink({ provider: active.provider }) as typeof sdk;
      activeModel = active.model;
      activeProvider = active.provider;
      loadAttempts = 0; // reset on success
      console.log(`[ActivityFeed] NeuroLink SDK loaded: ${active.provider}/${active.model}`);
      return sdk;
    } catch (err) {
      console.warn(
        '[ActivityFeed] NeuroLink SDK load failed (attempt',
        loadAttempts,
        '):',
        err instanceof Error ? err.message : String(err)
      );
      // On the final attempt, start the cooldown window before allowing
      // fresh retries. Earlier attempts can retry immediately on next call.
      if (loadAttempts >= MAX_LOAD_ATTEMPTS) {
        nextRetryAt = Date.now() + LOAD_FAILURE_COOLDOWN_MS;
      }
      return null;
    } finally {
      sdkPromise = null;
    }
  })();

  return sdkPromise;
}

/** Coerce an unknown value to a plain string (never '[object Object]'). */
function str(v: unknown): string {
  if (v === null || v === undefined) {
    return '';
  }
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return JSON.stringify(v);
}
