// Session-Over-Sessions (SoS) types — the coordinator that merges N running
// agent sessions into one source-tagged super-session and relays messages
// between them. See docs/SESSION-OVER-SESSIONS.md.
//
// A member's `sessionKey` is exactly what the server's session-watcher adapter
// keys on: a JSONL/JSON file path for file-backed providers, or a bare session
// id for OpenCode. That lets the coordinator reuse the same watcher routing the
// WS session handler uses, covering all providers with no new watching code.

import type { SessionSource } from './generated';
import type { ConversationMessage } from './sessions';

/** An escalated relay awaiting human approve/deny (Phase 2 HITL). */
export interface PendingRelay {
  createdAt: string;
  expiresAt: string;
  fromMemberId: string;
  id: string;
  text: string;
  timer: null | ReturnType<typeof setTimeout>;
  toMemberId: string;
}

/** A control message sent from a SoS client to the coordinator over /ws/super-session/:id. */
export type SosClientMessage =
  | {
      capability?: string;
      provider: SessionSource;
      sessionKey: string;
      terminalId?: string;
      type: 'member-add';
    }
  | { memberId: string; type: 'member-remove' }
  | { relayId: string; type: 'relay-approve' }
  | { relayId: string; type: 'relay-deny' }
  | { text: string; toMemberId: string; type: 'relay-forward' };

/**
 * Injects relay text into a Shooter-owned terminal's stdin. Supplied by
 * server.ts (which owns PtyManager) so the coordinator stays free of PTY deps.
 * Performs the ownership check (terminal exists + running) and returns the
 * outcome.
 */
export type SosInjector = (terminalId: string, text: string) => { error?: string; ok: boolean };

/** A WS listener registered against a super-session. */
export type SosListener = (msg: SosServerMessage) => void;

export interface SosMember {
  /** Free-text capability tag, e.g. 'frontend' | 'backend' | '' (unused in MVP routing). */
  capability: string;
  /** Random hex id, primary key in sos_sessions. */
  id: string;
  provider: SessionSource;
  registeredAt: string;
  /** Watcher key: file path for file-backed providers, session id for OpenCode. */
  sessionKey: string;
  status: SosMemberStatus;
  /** PtyManager terminal id when launched via Shooter; null for externally-observed sessions. */
  terminalId: null | string;
}

// ── WebSocket protocol (/ws/super-session/:id) ──────────────────────────

/** Lifecycle status of a SoS member's underlying agent session. */
export type SosMemberStatus = 'Compacting' | 'Finished' | 'Idle' | 'Waiting' | 'Working';

/**
 * A static routing rule (Phase 2). The coordinator evaluates these in ascending
 * `priority` against each new member message; the first match decides the
 * action. `fromMemberId` may be 'ANY'; an empty `matchPattern` matches all text.
 */
export interface SosRoutingRule {
  action: 'block' | 'escalate' | 'relay';
  fromMemberId: string;
  id: string;
  matchPattern: string;
  priority: number;
  toMemberId: string;
}

/** A message broadcast from the coordinator to subscribed SoS clients. */
export type SosServerMessage =
  | {
      decision: 'approved' | 'denied' | 'expired';
      relayId: string;
      type: 'sos-relay-resolved';
    }
  | { entries: SosTranscriptEntry[]; type: 'sos-history' }
  | { entry: SosTranscriptEntry; type: 'sos-message' }
  | {
      expiresAt: string;
      fromMemberId: string;
      preview: string;
      relayId: string;
      toMemberId: string;
      type: 'sos-relay-pending';
    }
  | { member: SosMember; type: 'sos-member-added' }
  | { memberId: string; status: SosMemberStatus; type: 'sos-member-status' }
  | { memberId: string; type: 'sos-member-removed' }
  | { message: string; type: 'sos-error' };

/** One message in the merged transcript, tagged with its origin member. */
export interface SosTranscriptEntry {
  memberId: string;
  message: ConversationMessage;
  provider: SessionSource;
  /** True when the coordinator injected this message (loop-guard marker). */
  relayed: boolean;
}

/** A super-session: N merged agent sessions coordinated as one. */
export interface SuperSession {
  createdAt: string;
  id: string;
  label: string;
  members: SosMember[];
  routingRules: SosRoutingRule[];
  status: 'active' | 'archived' | 'paused';
  /** Source-tagged merged transcript; in-memory ring buffer (capped). */
  transcript: SosTranscriptEntry[];
}

/** Coordinator-internal runtime state for one live super-session. */
export interface SuperSessionRuntime {
  /** `${fromMemberId}:${toMemberId}` -> last auto-relay epoch ms (cooldown guard). */
  cooldowns: Map<string, number>;
  listeners: Set<SosListener>;
  /** Escalated relays awaiting human decision, keyed by relayId. */
  pending: Map<string, PendingRelay>;
  session: SuperSession;
  unsubscribes: Map<string, () => void>;
}
