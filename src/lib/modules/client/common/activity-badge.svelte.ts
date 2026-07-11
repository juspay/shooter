import { browser } from '$app/environment';

import { getApiKey } from './config-guard';

/**
 * Lightweight "new activity" signal for the root NavBar bell. Polls the
 * sessions endpoint for the single most-recently-modified project and compares
 * its timestamp against the last time the user opened the Activity screen.
 * A dot (not a count) is shown when something changed since — honest and native.
 * SSR-safe: polling only runs in the browser.
 */

const SEEN_KEY = 'shooter_activity_seen';
const POLL_MS = 30_000;

let hasNew = $state(false);
let poller: null | ReturnType<typeof setInterval> = null;

const noop = (): void => undefined;

/** Reactive: true when session activity is newer than the last Activity visit. */
export function getHasNewActivity(): boolean {
  return hasNew;
}

/** Record that the user has seen the current activity; clears the badge. */
export function markActivitySeen(): void {
  if (!browser) {
    return;
  }
  localStorage.setItem(SEEN_KEY, String(Date.now()));
  hasNew = false;
}

/** Begin polling for new activity every 30s. Returns a stop function. No-op during SSR. */
export function startActivityBadgePolling(): () => void {
  if (!browser) {
    return noop;
  }
  void check();
  poller ??= setInterval((): void => {
    void check();
  }, POLL_MS);
  return (): void => {
    if (poller) {
      clearInterval(poller);
      poller = null;
    }
  };
}

async function check(): Promise<void> {
  const apiKey = getApiKey();
  if (!apiKey) {
    return;
  }
  try {
    const response = await fetch('/api/sessions?limit=1&offset=0', {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!response.ok) {
      return;
    }
    const data = (await response.json()) as { projects?: { lastModified?: string }[] };
    const projects = data.projects ?? [];
    let newest = 0;
    for (const project of projects) {
      const ts = project.lastModified ? new Date(project.lastModified).getTime() : 0;
      if (Number.isFinite(ts) && ts > newest) {
        newest = ts;
      }
    }
    hasNew = newest > readSeen();
  } catch {
    // Best effort — a badge must never surface fetch errors.
  }
}

function readSeen(): number {
  if (!browser) {
    return 0;
  }
  const raw = localStorage.getItem(SEEN_KEY);
  const parsed = raw ? Number(raw) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}
