/**
 * Shared JSONL parsing utilities for Claude Code session files.
 *
 * Both the REST API (jsonl-reader.ts) and the live file watcher
 * (session-watcher.ts) use these functions to convert raw JSONL lines
 * into ConversationMessage objects. Keeping one canonical parser
 * eliminates drift between the two code paths.
 */

import type { ConversationMessage, MessagePart } from './types';

/**
 * Internal event types that should be skipped during parsing.
 * These are control/metadata entries that don't represent conversation content.
 */
export const SKIP_EVENT_TYPES = new Set([
  'system',
  'config',
  'summary',
  'result',
  'heartbeat',
  'metadata',
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

  const entry = JSON.parse(line);
  const entryType = entry.type;

  // Skip known internal event types that don't represent conversation content
  if (SKIP_EVENT_TYPES.has(entryType)) {
    return { assistantCompleted, messages };
  }

  if (entryType === 'user') {
    const msg = entry.message;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const parts: MessagePart[] = [];
    const content = Array.isArray(msg.content) ? msg.content : [msg.content];

    for (const block of content) {
      if (typeof block === 'string') {
        parts.push({ content: block, type: 'text' });
      } else if (block.type === 'text') {
        parts.push({ content: block.text || '', type: 'text' });
      } else if (block.type === 'tool_result') {
        let output = '';
        if (typeof block.content === 'string') {
          output = block.content;
        } else if (Array.isArray(block.content)) {
          output = block.content
            .filter((c: { type: string }) => c.type === 'text')
            .map((c: { text: string }) => c.text)
            .join('\n');
        }
        if (entry.toolUseResult?.content) {
          const trc = entry.toolUseResult.content;
          if (typeof trc === 'string') {
            output = trc;
          } else if (Array.isArray(trc)) {
            output = trc
              .filter((c: { type: string }) => c.type === 'text')
              .map((c: { text: string }) => c.text)
              .join('\n');
          }
        }
        parts.push({
          isError: block.is_error || false,
          output: output.slice(0, 2000),
          toolUseId: block.tool_use_id || '',
          type: 'tool_result',
        });
      }
    }

    if (parts.length > 0 && parts.some((p) => p.type === 'text')) {
      messages.push({
        id: entry.uuid || `user-${messageIndex}`,
        parts: parts.filter((p) => p.type === 'text'),
        role: 'user',
        timestamp: entry.timestamp || '',
      });
    }

    const toolResults = parts.filter((p) => p.type === 'tool_result');
    if (toolResults.length > 0) {
      messages.push({
        id: `tool-result-${entry.uuid || messageIndex}`,
        parts: toolResults,
        role: 'system',
        timestamp: entry.timestamp || '',
      });
    }
  } else if (entryType === 'assistant') {
    const msg = entry.message;
    if (!msg?.content) {
      return { assistantCompleted, messages };
    }

    const content = Array.isArray(msg.content) ? msg.content : [msg.content];
    const msgId = msg.id || entry.uuid;

    for (const block of content) {
      const part = parseAssistantBlock(block);
      if (!part) {
        continue;
      }

      if (!assistantTurns.has(msgId)) {
        assistantTurns.set(msgId, { parts: [], timestamp: entry.timestamp || '' });
      }
      assistantTurns.get(msgId)!.parts.push(part);
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
