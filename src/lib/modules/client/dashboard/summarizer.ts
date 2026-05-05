// Session summarizer for the live dashboard.
// Loads NeuroLink SDK from CDN and runs AI summarization client-side in the browser.
// Uses NeuroLink's createGoogleGenerativeAI + generateText bridge (AI SDK-compatible).
// The GOOGLE_AI_API_KEY is injected into window.process.env by +page.svelte before use.

// ── Types ────────────────────────────────────────────────────────────────────

import type { SummaryContext, SummaryResult } from '$lib/types';

import { NEUROLINK_CDN_URL } from '$lib/modules/client/neurolink/cdn';
import { installFetchProxy } from '$lib/modules/client/neurolink/fetch-proxy';
import { detectActiveProvider } from '$lib/modules/client/neurolink/provider-config';

// ── CDN loading ───────────────────────────────────────────────────────────────

// Significant event types that trigger conversational tone
const SIGNIFICANT_EVENT_TYPES = new Set(['agent-question', 'terminal-exited', 'tool-failed']);

// Singleton SDK promise — load once, reuse across all summarizer instances
let sdkPromise: null | Promise<unknown> = null;

// Cached NeuroLink instance
let cachedNL: unknown = null;
let cachedProvider: null | { model: string; provider: string } = null;

export class SessionSummarizer {
  /** Generate a summary for the given session context using NeuroLink client-side. */
  async summarize(context: SummaryContext): Promise<SummaryResult> {
    const tone = this.chooseTone(context);
    const prompt =
      tone === 'conversational'
        ? this.buildConversationalPrompt(context)
        : this.buildStatusReportPrompt(context);

    try {
      const nl = await getNeuroLink();

      if (!nl) {
        console.log('[SessionSummarizer] NeuroLink not available, using fallback.');
        return { generatedAt: new Date().toISOString(), text: this.fallbackText(context), tone };
      }

      const result = await (
        nl as Record<string, (opts: Record<string, unknown>) => Promise<{ content?: string }>>
      ).generate({
        input: { text: prompt },
        ...(cachedProvider
          ? { model: cachedProvider.model, provider: cachedProvider.provider }
          : {}),
      });
      const text = str(result.content ?? '').trim() || this.fallbackText(context);
      return { generatedAt: new Date().toISOString(), text, tone };
    } catch (err) {
      console.warn(
        '[SessionSummarizer] summarize failed:',
        err instanceof Error ? err.message : String(err)
      );
      return { generatedAt: new Date().toISOString(), text: this.fallbackText(context), tone };
    }
  }

  /** Build the conversational prompt. */
  private buildConversationalPrompt(context: SummaryContext): string {
    const goal = context.goal ?? 'unknown';
    const events = context.recentEvents
      .map((e) => {
        const parts: string[] = [e.type];
        if (e.tool) {
          parts.push(`tool=${e.tool}`);
        }
        if (e.error) {
          parts.push(`error=${e.error}`);
        }
        if (e.command) {
          parts.push(`command=${e.command}`);
        }
        return parts.join(' ');
      })
      .join(', ');

    return `You are monitoring a coding session. Based on the context below, write ONE sentence (max 100 chars) describing what's happening in plain English. Be specific about what Claude did or is doing.

Goal: ${goal}
Recent events: ${events}
Conversation excerpt: ${context.conversationExcerpt}
Status: ${context.status}

One sentence only, no quotes, no markdown.`;
  }

  /** Build the status-report prompt. */
  private buildStatusReportPrompt(context: SummaryContext): string {
    const toolNames = context.recentEvents.flatMap((e) => (e.tool ? [e.tool] : [])).join(', ');

    return `You are monitoring a coding session. Write a brief status update (max 60 chars) in the format "Doing X, Y done". Focus on the action.

Recent tool calls: ${toolNames || 'none'}
Status: ${context.status}

Short phrase only, no quotes.`;
  }

  /** Choose tone based on event severity. */
  private chooseTone(context: SummaryContext): 'conversational' | 'status-report' {
    if (context.status === 'error' || context.errorCount > 0) {
      return 'conversational';
    }
    const hasSignificantEvent = context.recentEvents.some((e) =>
      SIGNIFICANT_EVENT_TYPES.has(e.type)
    );
    if (hasSignificantEvent) {
      return 'conversational';
    }
    return 'status-report';
  }

  /** Produce a simple fallback when NeuroLink is unavailable. */
  private fallbackText(context: SummaryContext): string {
    const tools = context.recentEvents.flatMap((e) => (e.tool ? [e.tool] : []));
    const unique = [...new Set(tools)];
    if (unique.length > 0) {
      return `Running: ${unique.join(', ')} (${context.toolCallCount} tools)`;
    }
    return `Status: ${context.status} — ${context.toolCallCount} tool calls`;
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Get or create the NeuroLink instance with auto-detected provider. */
async function getNeuroLink(): Promise<unknown> {
  if (cachedNL) {
    return cachedNL;
  }

  installFetchProxy();

  const NL = (await getSdk()) as Record<string, unknown>;
  const NeuroLinkClass = NL.NeuroLink as
    | (new (opts: Record<string, unknown>) => unknown)
    | undefined;
  if (!NeuroLinkClass) {
    return null;
  }

  const serverFlags = (window as unknown as Record<string, Record<string, boolean>>).__aiProviders;
  const preferredProvider = (
    window as unknown as Record<string, Record<string, Record<string, string>>>
  ).process?.env?.NEUROLINK_PROVIDER;

  const active = detectActiveProvider(serverFlags, preferredProvider);
  if (!active) {
    console.warn('[SessionSummarizer] No AI provider configured');
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

  cachedNL = new NeuroLinkClass({ provider: active.provider });
  cachedProvider = active;
  console.log(`[SessionSummarizer] Using provider: ${active.provider}/${active.model}`);
  return cachedNL;
}

function getSdk(): Promise<unknown> {
  if (!sdkPromise) {
    sdkPromise = import(/* @vite-ignore */ NEUROLINK_CDN_URL).catch((err: unknown) => {
      console.warn('[SessionSummarizer] Failed to load NeuroLink SDK:', err);
      // Reset so next call retries
      sdkPromise = null;
      throw err;
    });
  }
  return sdkPromise;
}

// ── Utilities ────────────────────────────────────────────────────────────────

/** Safely coerce an unknown value to string, avoiding [object Object]. */
function str(v: unknown): string {
  if (typeof v === 'string') {
    return v;
  }
  if (typeof v === 'number' || typeof v === 'boolean') {
    return String(v);
  }
  return '';
}
