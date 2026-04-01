// IMPORTANT: This module must NEVER be imported at module top level in a Svelte component.
// Always call createTerminal() inside onMount() only.

import type { FitAddon } from '@xterm/addon-fit';
import type { Terminal } from '@xterm/xterm';

interface TerminalInstance {
  dispose: () => void;
  fitAddon: FitAddon | null;
  sendInput: (data: string) => void;
  term: Terminal;
}

interface TerminalOptions {
  apiKey?: string;
  container: HTMLElement;
  fontSize?: number;
  getTicket: () => Promise<string>;
  onActivity?: (active: boolean) => void;
  onCwd?: (path: string) => void;
  onDisconnect?: () => void;
  onExit?: (code: number) => void;
  onReconnect?: () => void;
  terminalId?: string;
  wsUrl: string;
}

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
  fitAddon.fit();

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
  if (options.terminalId && options.apiKey) {
    const pasteTermId = options.terminalId;
    const pasteApiKey = options.apiKey;

    pasteListener = (e: ClipboardEvent) => {
      void (async () => {
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
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              resolve(reader.result as string);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });

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

  async function connect() {
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
        reconnectTimer = setTimeout(() => {
          reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
          void connect();
        }, reconnectDelay);
      }
      return;
    }

    if (disposed) {
      return;
    }

    ws = new WebSocket(`${options.wsUrl}?ticket=${ticket}`);

    ws.onopen = () => {
      reconnectDelay = 1000; // Reset backoff
      options.onReconnect?.();
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'output') {
        term.write(msg.data);
      } else if (msg.type === 'scrollback') {
        term.write(msg.data);
      } else if (msg.type === 'exit') {
        term.write(`\r\n\x1b[90m[Process exited with code ${msg.code}]\x1b[0m\r\n`);
        // Process exited — stop reconnection and notify parent
        disposed = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
        }
        options.onExit?.(msg.code);
      } else if (msg.type === 'output-dropped') {
        term.write(`\r\n\x1b[33m[${msg.bytes} bytes dropped]\x1b[0m\r\n`);
      } else if (msg.type === 'activity') {
        options.onActivity?.(msg.active);
      } else if (msg.type === 'cwd') {
        options.onCwd?.(msg.path);
      }
    };

    ws.onclose = () => {
      if (disposed) {
        return;
      }
      options.onDisconnect?.();
      // Exponential backoff reconnect
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
        void connect();
      }, reconnectDelay);
    };
  }

  void connect();

  // Terminal input -> WebSocket
  term.onData((data) => {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data, type: 'input' }));
    }
  });

  // Handle resize — skip when container is hidden (display:none → size 0)
  const resizeObserver = new ResizeObserver(() => {
    if (!options.container.offsetWidth || !options.container.offsetHeight) {
      return;
    }
    fitAddon.fit();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ cols: term.cols, rows: term.rows, type: 'resize' }));
    }
  });
  resizeObserver.observe(options.container);

  function dispose() {
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

  function sendInput(data: string) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ data, type: 'input' }));
    }
  }

  return { dispose, fitAddon, sendInput, term };
}

// Helper to send signals
export function sendSignal(ws: WebSocket, signal: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ signal, type: 'signal' }));
  }
}
