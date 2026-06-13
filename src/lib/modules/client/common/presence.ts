// Client presence reporter: heartbeats the dashboard's foreground/background state to
// POST /api/presence so the server pushes only when the user is AWAY (not watching the
// live view). Runs whenever the dashboard is open, independent of the autonomy toggle.

const HEARTBEAT_MS = 20_000;

/**
 * Start reporting viewer presence. Returns a stop function that reports `background` and
 * removes listeners. No-op outside the browser.
 */
export function startPresenceReporting(apiKey: string): () => void {
  if (typeof document === 'undefined') {
    return (): void => {
      // no-op (SSR)
    };
  }

  const tick = (): void => {
    postPresence(apiKey, document.visibilityState === 'visible' ? 'foreground' : 'background');
  };
  const onHide = (): void => {
    postPresence(apiKey, 'background');
  };

  tick();
  const timer = setInterval(tick, HEARTBEAT_MS);
  document.addEventListener('visibilitychange', tick);
  window.addEventListener('pagehide', onHide);

  return (): void => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', tick);
    window.removeEventListener('pagehide', onHide);
    postPresence(apiKey, 'background');
  };
}

function postPresence(apiKey: string, state: 'background' | 'foreground'): void {
  void fetch('/api/presence', {
    body: JSON.stringify({ state }),
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    keepalive: true,
    method: 'POST',
  }).catch(() => {
    // best-effort heartbeat
  });
}
