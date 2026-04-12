/**
 * Shared JSONL parsing utilities for Claude Code session files.
 *
 * Both the REST API (jsonl-reader.ts) and the live file watcher
 * (session-watcher.ts) use these functions to convert raw JSONL lines
 * into ConversationMessage objects. Keeping one canonical parser
 * eliminates drift between the two code paths.
 */

import type { ConversationMessage, MessagePart } from '$lib/types';

/* ------------------------------------------------------------------ */
/*  Type guards & helpers for untyped parsed JSON                     */
/* ------------------------------------------------------------------ */

/** Extract text from a tool-result content field (string or array of {type,text}). */
function extractToolResultText(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return (content as unknown[])
      .filter((c): c is Record<string, unknown> => isRecord(c) && c.type === 'text')
      .map((c) => {
        const text = c.text;
        return typeof text === 'string' ? text : '';
      })
      .join('\n');
  }
  return '';
}

/** Narrow an unknown value to a plain object with string keys. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Safely read a string property from a record (returns '' on miss). */
function str(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : '';
}

/** Coerce unknown array-ish content into Record<string, unknown>[]. */
function toContentBlocks(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) {
    return (raw as unknown[]).filter((item): item is Record<string, unknown> => isRecord(item));
  }
  // Single value — wrap it
  if (isRecord(raw)) {
    return [raw];
  }
  return [];
}

/**
 * Internal event types that should be skipped during parsing.
 * These are control/metadata entries that don't represent conversation content.
 */
export const SKIP_EVENT_TYPES = new Set([
  'config',
  'heartbeat',
  'metadata',
  'result',
  'summary',
  'system',
]);

/**
 * Parse a single assistant content block into a MessagePart.
 */
export function parseAssistantBlock(block: Record<string, unknown>): MessagePart | null {
  if (!block || typeof block !== 'object') {
    return null;
  }

  switch (block.type) {
    case 'text':
      return { content: (block.text as string) || '', type: 'text' };
    case 'thinking':
      return { content: (block.thinking as string) || '', type: 'thinking' };
    case 'tool_use':
      return {
        id: (block.id as string) || '',
        input: (block.input as Record<string, unknown>) || {},
        toolName: (block.name as string) || 'Unknown',
        type: 'tool_use',
      };
    default:
      return null;
  }
}

/**
 * Parse a single JSONL line into zero or more ConversationMessage entries.
 *
 * For assistant entries, partial accumulation is handled by the caller
 * using the assistantTurns map. When an assistant entry includes a
 * stop_reason, the accumulated turn is flushed into assistantCompleted.
 */
export function parseJsonlLine(
  line: string,
  assistantTurns: Map<string, { parts: MessagePart[]; timestamp: string }>,
  messageIndex: number
): { assistantCompleted: ConversationMessage[]; messages: ConversationMessage[] } {
  const messages: ConversationMessage[] = [];
  const assistantCompleted: ConversationMessage[] = [];

  const entry: unknown = JSON.parse(line);
  if (!isRecord(entry)) {
    return { assistantCompleted, messages };
  }

  const entryType = str(entry, 'type');

  // Skip known internal event types that don't represent conversation content
  if (SKIP_EVENT_TYPES.has(entryType)) {
    return { assistantCompleted, messages };
  }

  const entryTimestamp = str(entry, 'timestamp');
  const entryUuid = str(entry, 'uuid');

  if (entryType === 'user') {
    const msg = isRecord(entry.message) ? entry.message : null;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const parts: MessagePart[] = [];
    const blocks = toContentBlocks(msg.content);

    // Handle bare-string content items (not wrapped in a block)
    if (Array.isArray(msg.content)) {
      for (const item of msg.content as unknown[]) {
        if (typeof item === 'string') {
          parts.push({ content: item, type: 'text' });
        }
      }
    } else if (typeof msg.content === 'string') {
      parts.push({ content: msg.content, type: 'text' });
    }

    for (const block of blocks) {
      const blockType = str(block, 'type');
      if (!blockType) {
        continue;
      }
      if (blockType === 'text') {
        parts.push({ content: str(block, 'text'), type: 'text' });
      } else if (blockType === 'tool_result') {
        let output = extractToolResultText(block.content);

        // Check for toolUseResult override
        const toolUseResult = isRecord(entry.toolUseResult) ? entry.toolUseResult : null;
        if (toolUseResult?.content !== undefined) {
          output = extractToolResultText(toolUseResult.content);
        }

        parts.push({
          isError: typeof block.is_error === 'boolean' ? block.is_error : false,
          output: output.slice(0, 2000),
          toolUseId: str(block, 'tool_use_id'),
          type: 'tool_result',
        });
      }
    }

    if (parts.length > 0 && parts.some((p) => p.type === 'text')) {
      messages.push({
        id: entryUuid || `user-${messageIndex}`,
        parts: parts.filter((p) => p.type === 'text'),
        role: 'user',
        timestamp: entryTimestamp,
      });
    }

    const toolResults = parts.filter((p) => p.type === 'tool_result');
    if (toolResults.length > 0) {
      messages.push({
        id: `tool-result-${entryUuid || messageIndex}`,
        parts: toolResults,
        role: 'system',
        timestamp: entryTimestamp,
      });
    }
  } else if (entryType === 'assistant') {
    const msg = isRecord(entry.message) ? entry.message : null;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const blocks = toContentBlocks(msg.content);
    const msgId = str(msg, 'id') || entryUuid;

    for (const block of blocks) {
      const part = parseAssistantBlock(block);
      if (!part) {
        continue;
      }

      if (!assistantTurns.has(msgId)) {
        assistantTurns.set(msgId, { parts: [], timestamp: entryTimestamp });
      }
      const turn = assistantTurns.get(msgId);
      if (turn) {
        turn.parts.push(part);
      }
    }

    if (msg.stop_reason) {
      const turn = assistantTurns.get(msgId);
      if (turn && turn.parts.length > 0) {
        assistantCompleted.push({
          id: msgId,
          parts: turn.parts,
          role: 'assistant',
          timestamp: turn.timestamp,
        });
        assistantTurns.delete(msgId);
      }
    }
  }

  return { assistantCompleted, messages };
}

/**
 * Parse raw JSONL text into ConversationMessage entries.
 * Handles multi-entry assistant turns that span multiple JSONL lines.
 */
export function parseJsonlText(
  text: string,
  assistantTurns: Map<string, { parts: MessagePart[]; timestamp: string }>,
  startIndex: number
): ConversationMessage[] {
  const lines = text.split('\n').filter((line) => line.trim());
  const allMessages: ConversationMessage[] = [];
  let idx = startIndex;

  for (const line of lines) {
    try {
      const { assistantCompleted, messages } = parseJsonlLine(line, assistantTurns, idx);
      allMessages.push(...messages, ...assistantCompleted);
      idx++;
    } catch {
      // Skip malformed lines
    }
  }

  return allMessages;
}
