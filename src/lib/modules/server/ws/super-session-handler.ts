// WebSocket handler for /ws/super-session/:id — the merged Session-Over-Sessions
// stream. On connect it replays the merged transcript (sos-history) and then
// streams live tagged messages from every member. Accepts human-driven control
// messages: relay-forward (inject into a member's terminal), member-add,
// member-remove. Mirrors session-handler.ts in shape.

import type { SessionSource, SosClientMessage, SosServerMessage } from '$lib/types';
import type { WebSocket } from 'ws';

import * as path from 'path';

import { PROVIDERS } from '../sessions/registry';
import { sosCoordinator } from '../sos/coordinator';

const MAX_RELAY_TEXT = 10240; // 10 KB, same cap as /ws/session send-input
// Stop streaming to a client whose outbound buffer exceeds this — bounds memory
// growth when a slow consumer can't drain sos-history replay or a live burst.
const MAX_WS_BUFFERED_BYTES = 1_000_000;
const VALID_SOURCES = new Set<string>(PROVIDERS.map((p) => p.source));

export function handleSuperSessionConnection(ws: WebSocket, id: string): void {
  const session = sosCoordinator.getSuperSession(id);
  if (!session) {
    safeSend(ws, { message: `Super-session not found: ${id}`, type: 'sos-error' });
    ws.close(1008, 'Super-session not found');
    return;
  }

  // subscribe() replays the current transcript as an sos-history message, then
  // streams live sos-message / sos-member-* events. If a send fails (socket
  // closed or buffer over cap), stop feeding this client to bound memory.
  let unsubscribe: (() => void) | null = null;
  unsubscribe = sosCoordinator.subscribe(id, (msg) => {
    if (!safeSend(ws, msg)) {
      unsubscribe?.();
      unsubscribe = null;
    }
  });

  ws.on('message', (raw: Buffer | string) => {
    const data = typeof raw === 'string' ? raw : raw.toString('utf-8');
    const msg = parseClientMessage(data);
    if (!msg) {
      // Surface schema drift instead of silently dropping the frame — a dead
      // control in the UI is much harder to debug than an explicit error.
      safeSend(ws, { message: 'Invalid super-session control message', type: 'sos-error' });
      return;
    }
    handleClientMessage(ws, id, msg);
  });

  ws.on('close', () => {
    unsubscribe?.();
  });
  ws.on('error', () => {
    // cleanup happens in 'close'
  });
}

/** True when the string is a known provider source. */
export function isValidProvider(value: string): value is SessionSource {
  return VALID_SOURCES.has(value);
}

/** True for a bare session id (OpenCode) or an absolute path under HOME. */
export function isValidSessionKey(key: string): boolean {
  if (/^[A-Za-z0-9_-]+$/.test(key)) {
    return true;
  }
  const home = process.env.HOME || '';
  if (home === '' || !path.isAbsolute(key)) {
    return false;
  }
  // Resolve before comparing so `..` segments cannot escape the HOME sandbox
  // (e.g. /home/user/../etc/passwd passes a raw prefix check but not this).
  const relative = path.relative(path.resolve(home), path.resolve(key));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function handleClientMessage(ws: WebSocket, superSessionId: string, msg: SosClientMessage): void {
  switch (msg.type) {
    case 'member-add': {
      const member = sosCoordinator.addMember(superSessionId, {
        capability: msg.capability,
        provider: msg.provider,
        sessionKey: msg.sessionKey,
        terminalId: msg.terminalId ?? null,
      });
      if (!member) {
        safeSend(ws, { message: 'Failed to add member', type: 'sos-error' });
      }
      break;
    }
    case 'member-remove': {
      const ok = sosCoordinator.removeMember(superSessionId, msg.memberId);
      if (!ok) {
        safeSend(ws, { message: 'Member not found', type: 'sos-error' });
      }
      break;
    }
    case 'relay-approve': {
      if (!sosCoordinator.approveRelay(superSessionId, msg.relayId)) {
        safeSend(ws, { message: 'Pending relay not found', type: 'sos-error' });
      }
      break;
    }
    case 'relay-deny': {
      if (!sosCoordinator.denyRelay(superSessionId, msg.relayId)) {
        safeSend(ws, { message: 'Pending relay not found', type: 'sos-error' });
      }
      break;
    }
    case 'relay-forward': {
      const error = sosCoordinator.relayForward(superSessionId, msg.toMemberId, msg.text);
      if (error) {
        safeSend(ws, { message: error, type: 'sos-error' });
      }
      break;
    }
  }
}

function parseClientMessage(raw: string): null | SosClientMessage {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return null;
  }
  const msg = parsed as Record<string, unknown>;

  switch (msg.type) {
    case 'member-add': {
      if (
        typeof msg.sessionKey !== 'string' ||
        !isValidSessionKey(msg.sessionKey) ||
        typeof msg.provider !== 'string' ||
        !isValidProvider(msg.provider)
      ) {
        return null;
      }
      return {
        capability: typeof msg.capability === 'string' ? msg.capability : undefined,
        provider: msg.provider,
        sessionKey: msg.sessionKey,
        terminalId: typeof msg.terminalId === 'string' ? msg.terminalId : undefined,
        type: 'member-add',
      };
    }
    case 'member-remove': {
      if (typeof msg.memberId !== 'string' || msg.memberId.length === 0) {
        return null;
      }
      return { memberId: msg.memberId, type: 'member-remove' };
    }
    case 'relay-approve': {
      if (typeof msg.relayId !== 'string' || msg.relayId.length === 0) {
        return null;
      }
      return { relayId: msg.relayId, type: 'relay-approve' };
    }
    case 'relay-deny': {
      if (typeof msg.relayId !== 'string' || msg.relayId.length === 0) {
        return null;
      }
      return { relayId: msg.relayId, type: 'relay-deny' };
    }
    case 'relay-forward': {
      if (
        typeof msg.toMemberId !== 'string' ||
        typeof msg.text !== 'string' ||
        msg.text.length === 0 ||
        msg.text.length > MAX_RELAY_TEXT
      ) {
        return null;
      }
      return { text: msg.text, toMemberId: msg.toMemberId, type: 'relay-forward' };
    }
    default:
      return null;
  }
}

function safeSend(ws: WebSocket, msg: SosServerMessage): boolean {
  try {
    if (ws.readyState !== 1 /* OPEN */) {
      return false;
    }
    if (ws.bufferedAmount > MAX_WS_BUFFERED_BYTES) {
      return false;
    }
    ws.send(JSON.stringify(msg));
    return true;
  } catch {
    return false;
  }
}
