// IMPORTANT: This module must NEVER be imported at module top level in a Svelte component.
// Always call createTerminal() inside onMount() only.

import type { Terminal } from '@xterm/xterm';

interface TerminalInstance {
  term: Terminal;
  fitAddon: any; // FitAddon type
  dispose: () => void;
  sendInput: (data: string) => void;
}

interface TerminalOptions {
  container: HTMLElement;
  wsUrl: string;
  getTicket: () => Promise<string>;
  fontSize?: number;
  onDisconnect?: () => void;
  onReconnect?: () => void;
  onExit?: (code: number) => void;
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
    fontSize: options.fontSize || 14,
    fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    theme: {
      background: '#0a0a0f',
      foreground: '#e2e8f0',
      cursor: '#e2e8f0',
      cursorAccent: '#0a0a0f',
      selectionBackground: 'rgba(99, 102, 241, 0.3)',
      black: '#0a0a0f',
      red: '#ef4444',
      green: '#22c55e',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#a78bfa',
      cyan: '#38bdf8',
      white: '#e2e8f0',
      brightBlack: '#64748b',
      brightRed: '#f87171',
      brightGreen: '#4ade80',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#c4b5fd',
      brightCyan: '#67e8f9',
      brightWhite: '#f8fafc',
    },
    cursorBlink: true,
    cursorStyle: 'block',
    allowTransparency: true,
  });

  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(options.container);
  fitAddon.fit();

  // WebSocket connection
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectDelay = 1000;
  let disposed = false;

  async function connect() {
    if (disposed) return;

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

    if (disposed) return;

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
        if (reconnectTimer) clearTimeout(reconnectTimer);
        options.onExit?.(msg.code);
      } else if (msg.type === 'output-dropped') {
        term.write(`\r\n\x1b[33m[${msg.bytes} bytes dropped]\x1b[0m\r\n`);
      }
    };

    ws.onclose = () => {
      if (disposed) return;
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
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  });

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
    }
  });
  resizeObserver.observe(options.container);

  function dispose() {
    disposed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    resizeObserver.disconnect();
    ws?.close();
    term.dispose();
  }

  function sendInput(data: string) {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'input', data }));
    }
  }

  return { term, fitAddon, dispose, sendInput };
}

// Helper to send signals
export function sendSignal(ws: WebSocket, signal: string): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'signal', signal }));
  }
}
