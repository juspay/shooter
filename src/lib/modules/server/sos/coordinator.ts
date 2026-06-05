/**
 * SuperSessionCoordinator — the Session-Over-Sessions meta-layer.
 *
 * Subscribes to N running agent sessions (any provider) by reusing the very
 * same session-watcher adapter the WS session handler uses, so it inherits
 * support for all eight providers with no new watching code. It merges each
 * member's messages into one source-tagged transcript and fans live updates
 * out to WebSocket listeners. Phase 1: observe + merge + human-driven
 * relay-forward. Phase 2 (this file): static routing rules auto-relay messages
 * between members (relay/block/escalate) and a human approve/deny path for
 * escalations.
 *
 * Loop guards: an injected (relayed) entry is never itself re-evaluated;
 * self-relay rules are rejected; and a per-pair cooldown rate-limits a chatty
 * rule. NOTE these stop self-cascade and throttle but do NOT stop a bidirectional
 * ping-pong: with both A→B and B→A rules, the target's genuine response arrives
 * via the watcher (relayed=false) and is evaluated, so the pair can exchange one
 * volley per cooldown indefinitely. Full cycle detection is future work.
 *
 * Dependencies (watcher + injector) are injected from server.ts so this module
 * has no direct PTY/watcher imports and is trivially testable with fakes.
 */

import type {
  SessionSource,
  SessionWatcherLike,
  SosInjector,
  SosListener,
  SosMember,
  SosRoutingRule,
  SosServerMessage,
  SosTranscriptEntry,
  SuperSession,
  SuperSessionRuntime,
} from '$lib/types';

import { randomBytes } from 'crypto';

import { evaluateRelayRule, isValidRoutingRule } from './policy-gate';
import { relayStore } from './relay-store';

const MAX_TRANSCRIPT = 500;
const MAX_LABEL_LEN = 200;
const RELAY_COOLDOWN_MS = 5000;
const ESCALATE_TIMEOUT_MS = 120_000;
const MAX_RELAY_TEXT = 10240; // 10 KB — same cap manual forward enforces at the route/WS layer

class SuperSessionCoordinator {
  private injector: null | SosInjector = null;
  private runtimes = new Map<string, SuperSessionRuntime>();
  private watcher: null | SessionWatcherLike = null;

  /**
   * Add a member to a super-session: persist it, replay its history into the
   * merged transcript, and subscribe for live updates. Returns the new member,
   * or null if the super-session does not exist.
   */
  addMember(
    superSessionId: string,
    spec: {
      capability?: string;
      provider: SessionSource;
      sessionKey: string;
      terminalId?: null | string;
    }
  ): null | SosMember {
    const rt = this.runtimes.get(superSessionId);
    if (!rt) {
      return null;
    }
    const member: SosMember = {
      capability: spec.capability ?? '',
      id: randomBytes(8).toString('hex'),
      provider: spec.provider,
      registeredAt: new Date().toISOString(),
      sessionKey: spec.sessionKey,
      status: 'Idle',
      terminalId: spec.terminalId ?? null,
    };
    rt.session.members.push(member);
    relayStore.addMember(superSessionId, member);
    this.subscribeMember(rt, member);
    this.emit(rt, { member, type: 'sos-member-added' });
    return member;
  }

  /** Human approves an escalated relay: inject it now, then resolve. */
  approveRelay(superSessionId: string, relayId: string): boolean {
    const rt = this.runtimes.get(superSessionId);
    const pending = rt?.pending.get(relayId);
    if (!rt || !pending) {
      return false;
    }
    const result = this.doRelay(rt, pending.toMemberId, pending.text);
    if (!result.ok) {
      this.emit(rt, { message: result.error ?? 'Injection failed', type: 'sos-error' });
      return false;
    }
    this.resolvePending(rt, relayId, 'approved');
    return true;
  }

  createSuperSession(label: string): SuperSession {
    const session: SuperSession = {
      createdAt: new Date().toISOString(),
      id: randomBytes(8).toString('hex'),
      label: label.slice(0, MAX_LABEL_LEN),
      members: [],
      routingRules: [],
      status: 'active',
      transcript: [],
    };
    relayStore.createSuperSession(session);
    this.runtimes.set(session.id, {
      cooldowns: new Map(),
      listeners: new Set(),
      pending: new Map(),
      session,
      unsubscribes: new Map(),
    });
    return session;
  }

  deleteSuperSession(id: string): boolean {
    const rt = this.runtimes.get(id);
    if (!rt) {
      return false;
    }
    for (const unsub of rt.unsubscribes.values()) {
      unsub();
    }
    rt.unsubscribes.clear();
    for (const p of rt.pending.values()) {
      if (p.timer) {
        clearTimeout(p.timer);
      }
    }
    rt.pending.clear();
    relayStore.deleteSuperSession(id);
    this.runtimes.delete(id);
    return true;
  }

  /** Human denies an escalated relay: drop it. */
  denyRelay(superSessionId: string, relayId: string): boolean {
    const rt = this.runtimes.get(superSessionId);
    if (!rt?.pending.has(relayId)) {
      return false;
    }
    this.resolvePending(rt, relayId, 'denied');
    return true;
  }

  getRoutingRules(superSessionId: string): null | SosRoutingRule[] {
    return this.runtimes.get(superSessionId)?.session.routingRules ?? null;
  }

  getSuperSession(id: string): SuperSession | undefined {
    return this.runtimes.get(id)?.session;
  }

  listSuperSessions(): SuperSession[] {
    return [...this.runtimes.values()].map((rt) => rt.session);
  }

  /** Rebuild persisted super-sessions and re-subscribe members. Call once on boot. */
  reconnectAll(): void {
    // Idempotent: tear down any existing runtimes (subscriptions + timers) so a
    // second call cannot double-subscribe watchers or leak pending timers.
    for (const rt of this.runtimes.values()) {
      for (const unsub of rt.unsubscribes.values()) {
        unsub();
      }
      for (const p of rt.pending.values()) {
        if (p.timer) {
          clearTimeout(p.timer);
        }
      }
    }
    this.runtimes.clear();

    for (const session of relayStore.loadAll()) {
      const rt: SuperSessionRuntime = {
        cooldowns: new Map(),
        listeners: new Set(),
        pending: new Map(),
        session: { ...session, transcript: [] },
        unsubscribes: new Map(),
      };
      this.runtimes.set(session.id, rt);
      for (const member of rt.session.members) {
        this.subscribeMember(rt, member);
      }
    }
  }

  /**
   * Human-driven relay: inject text into a member's Shooter-owned terminal and
   * record it as a relayed entry in the transcript. Returns an error string on
   * failure, or null on success.
   */
  relayForward(superSessionId: string, toMemberId: string, text: string): null | string {
    const rt = this.runtimes.get(superSessionId);
    if (!rt) {
      return 'Super-session not found';
    }
    const member = rt.session.members.find((m) => m.id === toMemberId);
    if (!member) {
      return 'Target member not found';
    }
    if (!member.terminalId) {
      return 'Target member has no Shooter-owned terminal (cannot inject into an observed session)';
    }
    if (!this.injector) {
      return 'Injector not configured';
    }
    const result = this.doRelay(rt, toMemberId, text);
    return result.ok ? null : (result.error ?? 'Injection failed');
  }

  removeMember(superSessionId: string, memberId: string): boolean {
    const rt = this.runtimes.get(superSessionId);
    if (!rt) {
      return false;
    }
    const idx = rt.session.members.findIndex((m) => m.id === memberId);
    if (idx === -1) {
      return false;
    }
    rt.unsubscribes.get(memberId)?.();
    rt.unsubscribes.delete(memberId);
    rt.session.members.splice(idx, 1);
    relayStore.removeMember(memberId);
    this.emit(rt, { memberId, type: 'sos-member-removed' });
    return true;
  }

  /** Inject the relay function (server.ts owns PtyManager). */
  setInjector(injector: SosInjector): void {
    this.injector = injector;
  }

  /**
   * Replace a super-session's routing rules (Phase 2). Rejects self-relay rules.
   * Returns an error string on invalid input, or null on success.
   */
  setRoutingRules(superSessionId: string, rules: SosRoutingRule[]): null | string {
    const rt = this.runtimes.get(superSessionId);
    if (!rt) {
      return 'Super-session not found';
    }
    for (const rule of rules) {
      if (!isValidRoutingRule(rule)) {
        return `Invalid rule ${rule.id}: a rule may not relay a member to itself or to ANY`;
      }
    }
    rt.session.routingRules = rules;
    relayStore.createSuperSession(rt.session); // INSERT OR REPLACE rewrites routing_rules
    return null;
  }

  /** Update a super-session's lifecycle status. Returns false if unknown id. */
  setStatus(id: string, status: SuperSession['status']): boolean {
    const rt = this.runtimes.get(id);
    if (!rt) {
      return false;
    }
    rt.session.status = status;
    relayStore.updateSuperSessionStatus(id, status);
    return true;
  }

  /** Inject the session-watcher adapter (same one the WS session handler uses). */
  setWatcher(watcher: SessionWatcherLike): void {
    this.watcher = watcher;
  }

  /**
   * Register a WS listener for a super-session and replay the current merged
   * transcript to it. Returns an unsubscribe function, or null if unknown id.
   */
  subscribe(superSessionId: string, listener: SosListener): (() => void) | null {
    const rt = this.runtimes.get(superSessionId);
    if (!rt) {
      return null;
    }
    rt.listeners.add(listener);
    listener({ entries: [...rt.session.transcript], type: 'sos-history' });
    return () => {
      rt.listeners.delete(listener);
    };
  }

  private appendEntry(rt: SuperSessionRuntime, entry: SosTranscriptEntry): void {
    rt.session.transcript.push(entry);
    if (rt.session.transcript.length > MAX_TRANSCRIPT) {
      rt.session.transcript.splice(0, rt.session.transcript.length - MAX_TRANSCRIPT);
    }
    this.emit(rt, { entry, type: 'sos-message' });
  }

  /** Run Tier-1 routing for one new message and dispatch the matched action. */
  private applyPolicy(rt: SuperSessionRuntime, fromMemberId: string, text: string): void {
    if (!text) {
      return;
    }
    const rule = evaluateRelayRule(rt.session.routingRules, fromMemberId, text);
    if (!rule) {
      return;
    }
    if (rule.action === 'relay') {
      this.autoRelay(rt, fromMemberId, rule.toMemberId, text);
    } else if (rule.action === 'escalate') {
      this.escalate(rt, fromMemberId, rule.toMemberId, text);
    }
    // 'block' → intentionally do nothing (the message merges but is not relayed).
  }

  /** Rule-driven relay, suppressed by the per-pair cooldown. */
  private autoRelay(
    rt: SuperSessionRuntime,
    fromMemberId: string,
    toMemberId: string,
    text: string
  ): void {
    const key = `${fromMemberId}:${toMemberId}`;
    const now = Date.now();
    if (now - (rt.cooldowns.get(key) ?? 0) < RELAY_COOLDOWN_MS) {
      return; // cooldown active — bound the blast radius of a chatty rule
    }
    rt.cooldowns.set(key, now);
    this.doRelay(rt, toMemberId, text);
  }

  /**
   * Inject text into a member's terminal and record a relayed transcript entry
   * (relayed=true is the primary loop guard). Shared by manual + auto relay.
   */
  private doRelay(
    rt: SuperSessionRuntime,
    toMemberId: string,
    text: string
  ): { error?: string; ok: boolean } {
    const member = rt.session.members.find((m) => m.id === toMemberId);
    if (!member) {
      return { error: 'Target member not found', ok: false };
    }
    if (!member.terminalId) {
      return {
        error:
          'Target member has no Shooter-owned terminal (cannot inject into an observed session)',
        ok: false,
      };
    }
    if (!this.injector) {
      return { error: 'Injector not configured', ok: false };
    }
    // Cap injected text so auto-relay can't dump an oversized agent message into
    // a PTY — matches the 10 KB limit manual forward enforces at the boundary.
    const capped = text.length > MAX_RELAY_TEXT ? text.slice(0, MAX_RELAY_TEXT) : text;
    const result = this.injector(member.terminalId, capped);
    if (!result.ok) {
      return { error: result.error ?? 'Injection failed', ok: false };
    }
    this.appendEntry(rt, {
      memberId: toMemberId,
      message: {
        id: `relay-${randomBytes(6).toString('hex')}`,
        parts: [{ content: capped, type: 'text' }],
        role: 'user',
        timestamp: new Date().toISOString(),
      },
      provider: member.provider,
      relayed: true,
    });
    return { ok: true };
  }

  private emit(rt: SuperSessionRuntime, msg: SosServerMessage): void {
    for (const listener of rt.listeners) {
      try {
        listener(msg);
      } catch (err) {
        console.error('[sos] listener error:', err);
      }
    }
  }

  /** Queue an escalated relay for human approval and notify listeners. */
  private escalate(
    rt: SuperSessionRuntime,
    fromMemberId: string,
    toMemberId: string,
    text: string
  ): void {
    const relayId = randomBytes(8).toString('hex');
    const expiresAt = new Date(Date.now() + ESCALATE_TIMEOUT_MS).toISOString();
    const timer = setTimeout(() => {
      this.resolvePending(rt, relayId, 'expired');
    }, ESCALATE_TIMEOUT_MS);
    if (typeof timer.unref === 'function') {
      timer.unref();
    }
    rt.pending.set(relayId, {
      createdAt: new Date().toISOString(),
      expiresAt,
      fromMemberId,
      id: relayId,
      text,
      timer,
      toMemberId,
    });
    this.emit(rt, {
      expiresAt,
      fromMemberId,
      preview: text.slice(0, 200),
      relayId,
      toMemberId,
      type: 'sos-relay-pending',
    });
  }

  private resolvePending(
    rt: SuperSessionRuntime,
    relayId: string,
    decision: 'approved' | 'denied' | 'expired'
  ): void {
    const pending = rt.pending.get(relayId);
    if (!pending) {
      return;
    }
    if (pending.timer) {
      clearTimeout(pending.timer);
    }
    rt.pending.delete(relayId);
    this.emit(rt, { decision, relayId, type: 'sos-relay-resolved' });
  }

  /** Replay history + subscribe a single member to the merged transcript. */
  private subscribeMember(rt: SuperSessionRuntime, member: SosMember): void {
    if (!this.watcher) {
      return;
    }
    // Replay current history as tagged entries.
    try {
      for (const message of this.watcher.getHistory(member.sessionKey)) {
        this.appendEntry(rt, {
          memberId: member.id,
          message,
          provider: member.provider,
          relayed: false,
        });
      }
    } catch (err) {
      console.error(`[sos] history replay failed for ${member.sessionKey}:`, err);
    }
    // Subscribe for live updates (the watcher emits only post-subscribe messages).
    try {
      const unsub = this.watcher.subscribe(member.sessionKey, (messages) => {
        for (const message of messages) {
          this.appendEntry(rt, {
            memberId: member.id,
            message,
            provider: member.provider,
            relayed: false,
          });
          // Phase 2: evaluate routing rules against genuinely-new member output.
          this.applyPolicy(rt, member.id, textOf(message));
        }
      });
      rt.unsubscribes.set(member.id, unsub);
    } catch (err) {
      console.error(`[sos] subscribe failed for ${member.sessionKey}:`, err);
    }
  }
}

/** Concatenate the text parts of a message (the basis for rule matching). */
function textOf(message: SosTranscriptEntry['message']): string {
  return message.parts
    .filter((p) => p.type === 'text')
    .map((p) => (p.type === 'text' ? p.content : ''))
    .join(' ')
    .trim();
}

// Single shared instance across module loaders.
const SC_GLOBAL_KEY = '__shooter_sos_coordinator';
export const sosCoordinator: SuperSessionCoordinator =
  ((globalThis as Record<string, unknown>)[SC_GLOBAL_KEY] as SuperSessionCoordinator) ||
  new SuperSessionCoordinator();
(globalThis as Record<string, unknown>)[SC_GLOBAL_KEY] = sosCoordinator;
