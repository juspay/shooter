/**
 * Codex CLI rollout JSONL parser.
 *
 * Codex writes one "rollout" JSONL file per session under
 * ~/.codex/sessions/YYYY/MM/DD/rollout-<ts>-<uuid>.jsonl. Each line is a
 * record `{ timestamp, type, payload }`. The `response_item` records are the
 * conversation source of truth (event_msg/turn_context/compacted are UI/control
 * noise). This converts them into the canonical ConversationMessage[] shape,
 * mirroring jsonl-parser.ts (Claude) and opencode-reader.ts (OpenCode).
 *
 * Grouping uses "role runs": consecutive parts of the same category
 * (user | assistant-content | tool-result) are merged into one message and
 * flushed when the category changes, producing clean chronological bubbles.
 */

import type {
  CodexParseResult,
  CodexSessionMeta,
  ConversationMessage,
  MessagePart,
} from '$lib/types';

/** Accumulates parts into role-runs, flushing completed messages on category change. */
class TurnBuilder {
  private current: null | {
    category: 'assistant' | 'system' | 'user';
    parts: MessagePart[];
    role: ConversationMessage['role'];
    timestamp: string;
  } = null;
  private readonly messages: ConversationMessage[] = [];

  /** Messages flushed so far (excludes the still-open run). */
  completed(): ConversationMessage[] {
    return this.messages;
  }

  flush(): void {
    if (this.current && this.current.parts.length > 0) {
      this.messages.push({
        id: `codex-${this.messages.length}`,
        parts: this.current.parts,
        role: this.current.role,
        timestamp: this.current.timestamp,
      });
    }
    this.current = null;
  }

  push(role: 'assistant' | 'user', part: MessagePart, timestamp: string): void {
    const category: 'assistant' | 'system' | 'user' =
      role === 'user' ? 'user' : part.type === 'tool_result' ? 'system' : 'assistant';
    const messageRole: ConversationMessage['role'] = category === 'system' ? 'system' : role;
    if (this.current?.category !== category) {
      this.flush();
      this.current = { category, parts: [], role: messageRole, timestamp };
    }
    this.current.parts.push(part);
  }

  result(): ConversationMessage[] {
    this.flush();
    return this.messages;
  }
}

/**
 * Incremental Codex parser for live streaming. Feed raw JSONL lines as they are
 * appended to a rollout file; returns messages that became *complete* on each
 * call (a run completes when the next run of a different category begins).
 * Call flushOpen() when the session goes idle to emit the final open run.
 */
export class CodexStreamParser {
  private readonly builder = new TurnBuilder();
  private emitted = 0;

  /** Emit the final open run when the session goes idle (no more lines are coming). */
  flushOpen(): ConversationMessage[] {
    this.builder.flush();
    return this.drain();
  }

  /** Feed one raw JSONL line; returns any messages that became complete as a result. */
  pushLine(rawLine: string): ConversationMessage[] {
    const trimmed = rawLine.trim();
    if (trimmed) {
      try {
        const entry: unknown = JSON.parse(trimmed);
        if (isRecord(entry) && entry.type === 'response_item' && isRecord(entry.payload)) {
          const mapped = responseItemToPart(entry.payload);
          if (mapped) {
            this.builder.push(mapped.role, mapped.part, str(entry, 'timestamp'));
          }
        }
      } catch {
        // skip malformed line
      }
    }
    return this.drain();
  }

  private drain(): ConversationMessage[] {
    const all = this.builder.completed();
    const fresh = all.slice(this.emitted);
    this.emitted = all.length;
    return fresh;
  }
}

/** Parse the `session_meta` payload (the first line of a rollout file). */
export function parseCodexMeta(line: string): CodexSessionMeta | null {
  try {
    const entry: unknown = JSON.parse(line);
    if (!isRecord(entry) || entry.type !== 'session_meta' || !isRecord(entry.payload)) {
      return null;
    }
    const p = entry.payload;
    if (!str(p, 'id') || !str(p, 'cwd')) {
      return null;
    }
    return {
      cliVersion: str(p, 'cli_version'),
      cwd: str(p, 'cwd'),
      id: str(p, 'id'),
      model: str(p, 'model') || str(p, 'model_provider'),
      startedAt: str(p, 'timestamp') || str(entry, 'timestamp'),
    };
  } catch {
    return null;
  }
}

/** Parse a full Codex rollout file's text into meta + canonical messages. */
export function parseCodexRollout(text: string): CodexParseResult {
  const builder = new TurnBuilder();
  let meta: CodexSessionMeta | null = null;

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    let entry: unknown;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!isRecord(entry)) {
      continue;
    }

    const ts = str(entry, 'timestamp');

    if (entry.type === 'session_meta') {
      meta = parseCodexMeta(trimmed);
      continue;
    }
    if (entry.type !== 'response_item' || !isRecord(entry.payload)) {
      continue; // event_msg, turn_context, compacted — not conversation content
    }

    const mapped = responseItemToPart(entry.payload);
    if (mapped) {
      builder.push(mapped.role, mapped.part, ts);
    }
  }

  return { messages: builder.result(), meta };
}

/** Narrow an unknown value to a plain object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Join the text blocks of a Codex `message` content array. */
function joinMessageText(content: unknown): string {
  if (!Array.isArray(content)) {
    return typeof content === 'string' ? content : '';
  }
  return content
    .filter((c): c is Record<string, unknown> => isRecord(c))
    .filter((c) => c.type === 'input_text' || c.type === 'output_text' || c.type === 'text')
    .map((c) => str(c, 'text'))
    .join('\n')
    .trim();
}

/** Coerce a tool-call argument (JSON string, raw string, or object) into a record. */
function parseToolInput(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) {
    return raw;
  }
  if (typeof raw === 'string') {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : { raw };
    } catch {
      return { raw };
    }
  }
  return {};
}

/** Extract the visible reasoning text (Codex reasoning is usually encrypted-only). */
function reasoningText(payload: Record<string, unknown>): string {
  const summary = payload.summary;
  if (Array.isArray(summary) && summary.length > 0) {
    const text = summary
      .map((s) => (typeof s === 'string' ? s : isRecord(s) ? str(s, 'text') : ''))
      .join('\n')
      .trim();
    if (text) {
      return text;
    }
  }
  return typeof payload.content === 'string' ? payload.content.trim() : '';
}

/** Map one Codex `response_item` payload to a canonical role + MessagePart, or null to skip. */
function responseItemToPart(
  p: Record<string, unknown>
): null | { part: MessagePart; role: 'assistant' | 'user' } {
  switch (p.type) {
    case 'custom_tool_call':
    case 'function_call': {
      const args = p.type === 'function_call' ? p.arguments : p.input;
      return {
        part: {
          id: str(p, 'call_id'),
          input: parseToolInput(args),
          toolName: str(p, 'name') || 'tool',
          type: 'tool_use',
        },
        role: 'assistant',
      };
    }
    case 'custom_tool_call_output':
    case 'function_call_output':
    case 'tool_search_output': {
      const output = typeof p.output === 'string' ? p.output : JSON.stringify(p.output ?? '');
      return {
        part: {
          isError: /exit code:\s*[1-9]/i.test(output),
          output: output.slice(0, 2000),
          toolUseId: str(p, 'call_id'),
          type: 'tool_result',
        },
        role: 'assistant',
      };
    }
    case 'message': {
      if (p.role === 'developer') {
        return null; // instructions/permissions preamble — skip (like Claude skips system)
      }
      const content = joinMessageText(p.content);
      return content
        ? { part: { content, type: 'text' }, role: p.role === 'user' ? 'user' : 'assistant' }
        : null;
    }
    case 'reasoning': {
      const think = reasoningText(p);
      return think ? { part: { content: think, type: 'thinking' }, role: 'assistant' } : null;
    }
    case 'tool_search_call':
    case 'web_search_call':
      return {
        part: {
          id: str(p, 'call_id'),
          input: parseToolInput(p.action ?? p.query),
          toolName: str(p, 'type'),
          type: 'tool_use',
        },
        role: 'assistant',
      };
    default:
      return null;
  }
}

/** Safely read a string property from a record (returns '' on miss). */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}
