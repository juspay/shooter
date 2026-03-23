/**
 * Holder Client
 *
 * Communicates with a PTY holder process over a Unix domain socket using
 * ndjson (newline-delimited JSON). Exposes the same duck-typed interface
 * that terminal-handler.ts and session-handler.ts expect (write, resize, pid),
 * so PtyManager can slot it in as `ManagedTerminal.pty`.
 */

import * as net from 'net';

// ── Local Protocol Types ──────────────────────────────────────────────
// The generated union types (HolderClientMessage, HolderServerMessage)
// use numbered interfaces without const discriminants, making them hard
// to narrow. We define simple local types matching the ndjson protocol
// from the design spec instead.

interface ConnectResult {
	exitCode: null | number;
	exited: boolean;
	pid: number;
	scrollback: string;
}

/** Messages received from the holder process. */
type IncomingMessage =
	| { code: null | number; signal: null | string; type: 'exit'; }
	| { data: string; type: 'output'; }
	| { data: string; type: 'scrollback'; }
	| { exitCode: null | number; exited: boolean; pid: number; type: 'info'; };

// ── Connect Result ────────────────────────────────────────────────────

/** Messages sent to the holder process. */
type OutgoingMessage =
	| { cols: number; rows: number; type: 'resize'; }
	| { data: string; type: 'input'; }
	| { signal?: string; type: 'kill'; };

// ── HolderClient ──────────────────────────────────────────────────────

export class HolderClient {
	connected = false;
	pid = 0;

	private disconnectCb: (() => void) | null = null;
	private exitCb: ((code: null | number) => void) | null = null;

	private lineBuf = '';
	private outputCb: ((data: string) => void) | null = null;
	private socket: net.Socket | null = null;

	/**
	 * Connect to a holder process via its Unix domain socket.
	 * Resolves once the initial `info` and `scrollback` handshake messages
	 * have been received.
	 */
	connect(socketPath: string): Promise<ConnectResult> {
		return new Promise<ConnectResult>((resolve, reject) => {
			let settled = false;
			let info: null | { exitCode: null | number; exited: boolean; pid: number; } = null;
			let scrollback = '';

			const socket = net.createConnection(socketPath);
			this.socket = socket;

			socket.setEncoding('utf8');

			socket.on('connect', () => {
				this.connected = true;
			});

			socket.on('data', (chunk: string) => {
				this.lineBuf += chunk;
				const lines = this.lineBuf.split('\n');
				// Keep the last element — it is either empty (complete line)
				// or a partial line still being received.
				this.lineBuf = lines.pop()!;

				for (const line of lines) {
					if (line.length === 0) {continue;}

					let msg: IncomingMessage;
					try {
						msg = JSON.parse(line) as IncomingMessage;
					} catch {
						continue;
					}

					if (!settled) {
						// During handshake, collect info + scrollback.
						if (msg.type === 'info') {
							info = { exitCode: msg.exitCode, exited: msg.exited, pid: msg.pid };
							this.pid = msg.pid;
						} else if (msg.type === 'scrollback') {
							scrollback = msg.data;
						}

						// Handshake complete once we have info.
						if (info !== null) {
							if (msg.type === 'scrollback' || info.exited) {
								// Got scrollback or PTY already exited — resolve immediately.
								settled = true;
								resolve({
									exitCode: info.exitCode,
									exited: info.exited,
									pid: info.pid,
									scrollback
								});
							} else if (msg.type === 'info') {
								// Got info but no scrollback yet. The holder only sends
								// scrollback if there IS data. Use a microtask to give
								// scrollback a chance to arrive in the same data chunk,
								// then resolve if it doesn't.
								Promise.resolve().then(() => {
									if (!settled) {
										settled = true;
										resolve({
											exitCode: info!.exitCode,
											exited: info!.exited,
											pid: info!.pid,
											scrollback
										});
									}
								});
							}
						}
					} else {
						this.handleMessage(msg);
					}
				}
			});

			socket.on('error', (err) => {
				if (!settled) {
					settled = true;
					this.connected = false;
					this.socket = null;
					reject(err);
				}
			});

			socket.on('close', () => {
				const wasConnected = this.connected;
				this.connected = false;
				this.socket = null;
				this.lineBuf = '';

				if (!settled) {
					settled = true;
					reject(new Error('Socket closed before handshake completed'));
					return;
				}

				// Unexpected disconnect after successful handshake.
				if (wasConnected && this.disconnectCb) {
					this.disconnectCb();
				}
			});
		});
	}

	/** Gracefully disconnect from the holder (does NOT kill the holder). */
	disconnect(): void {
		this.connected = false;
		if (this.socket) {
			this.socket.destroy();
			this.socket = null;
		}
		this.lineBuf = '';
	}

	/** Send a signal to the PTY process (default SIGTERM). */
	kill(signal?: string): void {
		const msg: OutgoingMessage = { type: 'kill' };
		if (signal) {
			msg.signal = signal;
		}
		this.send(msg);
	}

	/** Register callback for unexpected disconnect from holder. */
	onDisconnect(cb: () => void): void {
		this.disconnectCb = cb;
	}

	/** Register callback for PTY exit. */
	onExit(cb: (code: null | number) => void): void {
		this.exitCb = cb;
	}

	/** Register callback for PTY output data. */
	onOutput(cb: (data: string) => void): void {
		this.outputCb = cb;
	}

	/** Resize the PTY. */
	resize(cols: number, rows: number): void {
		this.send({ cols, rows, type: 'resize' });
	}

	/** Write data to the PTY stdin. */
	write(data: string): void {
		this.send({ data, type: 'input' });
	}

	// ── Private Helpers ────────────────────────────────────────────────

	/** Dispatch a post-handshake message from the holder. */
	private handleMessage(msg: IncomingMessage): void {
		switch (msg.type) {
			case 'exit':
				if (this.exitCb) {
					this.exitCb(msg.code);
				}
				break;

			case 'output':
				if (this.outputCb) {
					this.outputCb(msg.data);
				}
				break;

			// info / scrollback after handshake are ignored.
			default:
				break;
		}
	}

	/** Send an ndjson message to the holder. */
	private send(msg: OutgoingMessage): void {
		if (!this.socket || !this.connected) {
			return;
		}
		this.socket.write(`${JSON.stringify(msg)  }\n`);
	}
}
