// Gemini CLI session types (hand-written: the on-disk formats are
// provider-specific and not worth round-tripping through the YAML codegen).
// Gemini CLI stores user messages in ~/.gemini/tmp/<projectHash>/logs.json
// and full conversation records in
// ~/.gemini/tmp/<projectHash>/chats/session-*.json (newer versions only).

// ---------------------------------------------------------------------------
// logs.json — user-messages-only format (all versions)
// ---------------------------------------------------------------------------

/** Union of all part shapes that appear in a ConversationRecord message. */
export type GeminiContentPart = GeminiFunctionCallPart | GeminiTextPart | GeminiThoughtPart;

// ---------------------------------------------------------------------------
// chats/session-*.json — full ConversationRecord (newer versions)
// ---------------------------------------------------------------------------

/** Full conversation record stored in chats/session-*.json. */
export interface GeminiConversationRecord {
  directories?: string[];
  kind?: 'main' | 'subagent';
  lastUpdated: string;
  messages: GeminiMessageRecord[];
  projectHash: string;
  sessionId: string;
  startTime: string;
  summary?: string;
}

/** Inline function-call part from the Google GenAI SDK. */
export interface GeminiFunctionCallPart {
  functionCall: {
    args: Record<string, unknown>;
    id?: string;
    name: string;
  };
}

/** A single entry in ~/.gemini/tmp/<projectHash>/logs.json. */
export interface GeminiLogEntry {
  message: string;
  messageId: number;
  sessionId: string;
  timestamp: string;
  type: 'user';
}

/** A single message record in a full ConversationRecord. */
export type GeminiMessageRecord =
  | {
      content: GeminiContentPart[] | string;
      id: string;
      thoughts?: GeminiThoughtSummary[];
      timestamp: string;
      toolCalls?: GeminiToolCallRecord[];
      type: 'gemini';
    }
  | {
      content: GeminiContentPart[] | string;
      id: string;
      timestamp: string;
      type: 'error' | 'info' | 'user' | 'warning';
    };

/** Contents of ~/.gemini/projects.json (present only in newer gemini-cli). */
export type GeminiProjectsJson = Record<string, string>;

/** Plain-text content part from the Google GenAI SDK. */
export interface GeminiTextPart {
  text: string;
  thought?: false;
}

/** Inline thinking/reasoning part from the Google GenAI SDK. */
export interface GeminiThoughtPart {
  text: string;
  thought: true;
}

/** A thought-summary entry attached to a 'gemini'-type message. */
export interface GeminiThoughtSummary {
  summary?: string;
  timestamp: string;
}

// ---------------------------------------------------------------------------
// projects.json — project slug → absolute path registry (newer versions)
// ---------------------------------------------------------------------------

/** A single tool-call record attached to a 'gemini'-type message. */
export interface GeminiToolCallRecord {
  args: Record<string, unknown>;
  description?: string;
  displayName?: string;
  id: string;
  name: string;
  result?: unknown;
  status: 'cancelled' | 'error' | 'pending' | 'success';
  timestamp: string;
}
