import type { NotificationSession } from '$generated/types';

import { getNotifications, type NotificationRecord } from './notification-history';

export type Session = NotificationSession;

const SESSION_GAP_MS = 30 * 60 * 1000; // 30 min gap = new session
const ACTIVE_THRESHOLD_MS = 5 * 60 * 1000; // active if last event < 5 min ago

export function getSessionById(id: string): null | Session {
  return getSessions().find((s) => s.id === id) || null;
}

export function getSessions(): Session[] {
  const notifications = getNotifications(100);
  if (notifications.length === 0) {
    return [];
  }

  // Sort by timestamp ascending for grouping
  const sorted = [...notifications].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  const sessions: Session[] = [];
  let currentGroup: NotificationRecord[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = new Date(sorted[i - 1].timestamp).getTime();
    const curr = new Date(sorted[i].timestamp).getTime();

    if (curr - prev > SESSION_GAP_MS) {
      // Gap too large — start new session
      sessions.push(buildSession(currentGroup, sessions.length + 1));
      currentGroup = [sorted[i]];
    } else {
      currentGroup.push(sorted[i]);
    }
  }

  // Don't forget last group
  if (currentGroup.length > 0) {
    sessions.push(buildSession(currentGroup, sessions.length + 1));
  }

  // Return newest first
  return sessions.reverse();
}

function buildSession(events: NotificationRecord[], index: number): Session {
  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  const startMs = new Date(startTime).getTime();
  const endMs = new Date(endTime).getTime();
  const now = Date.now();

  // Extract tools from events
  const tools = new Set<string>();
  const files = new Set<string>();
  let project = 'unknown';
  let runtime = 'claude-code';

  for (const event of events) {
    if (event.tool) {
      tools.add(event.tool);
    }
    if (event.data?.tool && typeof event.data.tool === 'string') {
      tools.add(event.data.tool);
    }
    if (event.project) {
      project = event.project;
    }
    if (event.data?.project && typeof event.data.project === 'string') {
      project = event.data.project;
    }
    if (event.data?.runtime && typeof event.data.runtime === 'string') {
      runtime = event.data.runtime;
    }
    // Extract files from data
    if (event.data?.file && typeof event.data.file === 'string') {
      files.add(event.data.file);
    }
    if (event.data?.files && typeof event.data.files === 'string') {
      event.data.files.split(',').forEach((f: string) => {
        if (f.trim()) {
          files.add(f.trim());
        }
      });
    }
  }

  const isActive = now - endMs < ACTIVE_THRESHOLD_MS;

  return {
    duration: Math.round((endMs - startMs) / 1000),
    endTime,
    eventCount: events.length,
    events, // already sorted ascending
    filesModified: [...files],
    id: `session-${index}`,
    project,
    runtime,
    startTime,
    status: isActive ? 'active' : 'complete',
    toolsUsed: [...tools],
  };
}
