import type { SystemStatus } from '$lib/types';

/**
 * Shared system-status state (health polling), read by the root NavBar so the
 * ONLINE/Offline pill lives in one place instead of the old global header.
 * SSR-safe: polling only starts in the browser.
 */
import { browser } from '$app/environment';

let status = $state<SystemStatus>('unknown');
let poller: null | ReturnType<typeof setInterval> = null;

const noop = (): void => undefined;

/** Current health status. Reactive when read in a component/`$derived` context. */
export function getSystemStatus(): SystemStatus {
  return status;
}

/** Begin polling /api/health every 30s. Returns a stop function. No-op during SSR. */
export function startSystemStatusPolling(): () => void {
  if (!browser) {
    return noop;
  }
  void check();
  poller ??= setInterval((): void => {
    void check();
  }, 30000);
  return (): void => {
    if (poller) {
      clearInterval(poller);
      poller = null;
    }
  };
}

async function check(): Promise<void> {
  try {
    const response = await fetch('/api/health');
    if (!response.ok) {
      status = 'error';
      return;
    }
    const data = (await response.json()) as { status?: string };
    status =
      data.status === 'healthy' || data.status === 'degraded' || data.status === 'error'
        ? data.status
        : 'unknown';
  } catch {
    status = 'error';
  }
}
