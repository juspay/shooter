// IMPORTANT: This module must NEVER be imported at module top level in a Svelte component.
// Always call createTerminal() inside onMount() only.

import type { TerminalInstance, TerminalOptions, WsTerminalInboundMessage } from '$lib/types';

export async function createTerminal(options: TerminalOptions): Promise<TerminalInstance> {
  // Dynamic imports — only loaded client-side
  const { Terminal } = await import('@xterm/xterm');
  const { FitAddon } = await import('@xterm/addon-fit');
  const { WebLinksAddon } = await import('@xterm/addon-web-links');

  // Also need to import the CSS
  await import('@xterm/xterm/css/xterm.css');

  const fitAddon = new FitAddon();

  const term = new Terminal({
    allowTransparency: true,
    cursorBlink: true,
    cursorStyle: 'block',
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    fontSize: options.fontSize || 14,
    theme: {
      background: '#0a0a0f',
      black: '#0a0a0f',
      blue: '#3b82f6',
      brightBlack: '#64748b',
      brightBlue: '#60a5fa',
      brightCyan: '#67e8f9',
      brightGreen: '#4ade80',
      brightMagenta: '#c4b5fd',
      brightRed: '#f87171',
      brightWhite: '#f8fafc',
      brightYellow: '#fbbf24',
      cursor: '#e2e8f0',
      cursorAccent: '#0a0a0f',
      cyan: '#38bdf8',
      foreground: '#e2e8f0',
      green: '#22c55e',
      magenta: '#a78bfa',
      red: '#ef4444',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
      white: '#e2e8f0',
      yellow: '#f59e0b',
    },
  });

  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(options.container);
  if (options.readOnly && options.initialCols && options.initialRows) {
    // View-only: render at the PTY's size (we may not resize the shared PTY).
    term.resize(options.initialCols, options.initialRows);
  } else {
    fitAddon.fit();
  }

  // Block browser-level Cmd/Ctrl shortcuts from reaching the PTY.
  // Allow Ctrl+<letter> terminal signals (Ctrl+C/D/L/R/Z etc.) through.
  const browserShortcuts = new Set(['f', 'g', 'h', 'j', 'n', 'o', 'p', 'q', 's', 't', 'u', 'w']);
  term.attachCustomKeyEventHandler((e) => {
    const key = e.key.toLowerCase();
    // Cmd+key on Mac: block known browser shortcuts, allow the rest
    if (e.metaKey) {
      if (key === 'c' || key === 'v') {
        return true;
      } // allow copy/paste
      if (browserShortcuts.has(key)) {
        return false;
      } // block browser shortcuts
      return true;
    }
    // Ctrl+key (non-Mac modifier): allow all through to PTY (Ctrl+C/D/L/R/Z etc.)
    return true;
  });

  // Clipboard image paste interception
  let pasteListener: ((e: ClipboardEvent) => void) | null = null;
  if (options.terminalId && options.apiKey && !options.readOnly) {
    const pasteTermId = options.terminalId;
    const pasteApiKey = options.apiKey;

    pasteListener = (e: ClipboardEvent): void => {
      void (async (): Promise<void> => {
        try {
          if (!e.clipboardData) {
            return;
          }
          const items = Array.from(e.clipboardData.items);
          const imageItem = items.find((item) => item.type.startsWith('image/'));
          if (!imageItem) {
            return;
          } // No image — let normal paste proceed

          const blob = imageItem.getAsFile();
          if (!blob) {
            return;
          }
          e.preventDefault();

          // Read image as base64
          const reader = new FileReader();
          const base64 = await new Promise<string>(
            (resolve, reject: (reason?: unknown) => void) => {
              reader.onload = (): void => {
                resolve(reader.result as string);
              };
              reader.onerror = reject;
              reader.readAsDataURL(blob);
            }
          );

          // Upload to server
          const res = await fetch(`/api/terminals/${pasteTermId}/paste-image`, {
            body: JSON.stringify({ image: base64 }),
            headers: {
              Authorization: `Bearer ${pasteApiKey}`,
              'Content-Type': 'application/json',
            },
            method: 'POST',
          });

          // Send Ctrl+V (0x16) to PTY only after a successful upload
          if (res.ok && ws?.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ data: '\x16', type: 'input' }));
          }
        } catch {
          // Silent failure — don't break text paste
        }
      })();
    };

    options.container.addEventListener('paste', pasteListener as EventListener);
  }

  // WebSocket connection
  let ws: null | WebSocket = null;
  let reconnectTimer: null | ReturnType<typeof setTimeout> = null;
  let reconnectDelay = 1000;
  let disposed = false;
  let lastSeq = 0; // highest output seq seen; sent on reconnect by Phase 2

  // Reconnect with exponential backoff + jitter. The jitter spreads a fleet of
  // clients out so they don't reconnect in lockstep after a server restart.
  function scheduleReconnect(): void {
    if (disposed) {
      return;
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    const jitter = Math.random() * reconnectDelay * 0.5;
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      void connect();
    }, reconnectDelay + jitter);
  }

  async function connect(): Promise<void> {
    if (disposed) {
      return;
    }

    let ticket: string;
    try {
      ticket = await options.getTicket();
    } catch {
      // Ticket fetch failed — schedule a retry
      if (!disposed) {
        options.onDisconnect?.();
        scheduleReconnect();
      }
      return;
    }

    if (disposed) {
      return;
    }

    // Advertise snapshot capability so the server sends a serialized
    // current-screen {snapshot} on join (correct for alt-screen TUIs) instead
    // of a raw scrollback replay. On a reconnect (lastSeq > 0) also pass the
    // last applied seq so the server replays only the missing frames from its
    // ring — a seamless catch-up — falling back to a snapshot if the gap is
    // too old to bridge.
    const resume = lastSeq > 0 ? `&lastSeq=${String(lastSeq)}` : '';
    ws = new WebSocket(`${options.wsUrl}?ticket=${ticket}&caps=snapshot${resume}`);

    ws.onopen = (): void => {
      reconnectDelay = 1000; // Reset backoff
      options.onReconnect?.();
    };

    ws.onmessage = (event: MessageEvent): void => {
      const msg = JSON.parse(event.data as string) as WsTerminalInboundMessage;
      if (msg.type === 'output') {
        if (typeof msg.seq === 'number') {
          // Drop frames already covered by a snapshot or reconnect replay —
          // the snapshot's seq is the high-water mark (foundation contract §1.1).
          if (msg.seq <= lastSeq) {
            return;
          }
          lastSeq = msg.seq;
        }
        term.write(msg.data ?? '');
      } else if (msg.type === 'snapshot') {
        // Authoritative current-screen snapshot — clear and restore, then the
        // live tail (output frames with seq > this) applies on top.
        term.reset();
        if (typeof msg.seq === 'number') {
          lastSeq = msg.seq;
        }
        term.write(msg.data ?? '');
      } else if (msg.type === 'scrollback') {
        term.write(msg.data ?? '');
      } else if (msg.type === 'exit') {
        term.write(`\r\n\x1b[90m[Process exited with code ${String(msg.code)}]\x1b[0m\r\n`);
        // Process exited — stop reconnection and notify parent
        disposed = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }
        options.onExit?.(msg.code ?? 0);
      } else if (msg.type === 'output-dropped') {
        // The server withholds further frames and resnapshots us to the current
        // screen once our socket drains (Phase 2). Show a transient notice; the
        // incoming snapshot resets the screen and clears it.
        const note =
          typeof msg.bytes === 'number' && msg.bytes > 0
            ? `[${String(msg.bytes)} bytes dropped — resyncing…]`
            : '[resyncing…]';
        term.write(`\r\n\x1b[33m${note}\x1b[0m\r\n`);
      } else if (msg.type === 'activity') {
        options.onActivity?.(msg.active ?? false);
      } else if (msg.type === 'cwd') {
        options.onCwd?.(msg.path ?? '');
      } else if (msg.type === 'resize') {
        // PTY was resized by another client (e.g. the owner). View-only
        // terminals follow it; interactive ones are governed by their fit.
        if (options.readOnly && msg.cols && msg.rows) {
          term.resize(msg.cols, msg.rows);
        }
      }
    };

    ws.onclose = (): void => {
      if (disposed) {
        return;
      }
      options.onDisconnect?.();
      scheduleReconnect();
    };
  }

  void connect();

  // Terminal input -> WebSocket
  term.onData((data) => {
    if (options.readOnly) {
      return;
    }
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data, type: 'input' }));
    }
  });

  // Handle resize — skip when container is hidden (display:none → size 0)
  const resizeObserver = new ResizeObserver((): void => {
    if (options.readOnly) {
      return; // View-only terminals keep the PTY's dimensions.
    }
    if (!options.container.offsetWidth || !options.container.offsetHeight) {
      return;
    }
    fitAddon.fit();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cols: term.cols, rows: term.rows, type: 'resize' }));
    }
  });
  resizeObserver.observe(options.container);

  function dispose(): void {
    disposed = true;
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }
    if (pasteListener) {
      options.container.removeEventListener('paste', pasteListener as EventListener);
    }
    resizeObserver.disconnect();
    ws?.close();
    term.dispose();
  }

  function sendInput(data: string): void {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data, type: 'input' }));
    }
  }

  return { dispose, fitAddon, getLastSeq: () => lastSeq, sendInput, term };
}

// Helper to send signals
export function sendSignal(ws: WebSocket, signal: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ signal, type: 'signal' }));
  }
}
