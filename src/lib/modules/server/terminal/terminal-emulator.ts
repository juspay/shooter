/**
 * Server-side authoritative terminal emulator (Phase 1).
 *
 * Wraps a DOM-free @xterm/headless Terminal + @xterm/addon-serialize. Every
 * PTY output chunk is fed in via write(); snapshot() returns a VT-escape string
 * that reconstructs the CURRENT screen — including the alternate buffer (TUIs
 * like vim/htop) and modes — when written into a fresh terminal. This is what
 * a new or reconnecting client receives instead of a raw scrollback replay,
 * fixing late-join corruption (G2) and the scrollback/live duplication race (G3).
 *
 * Caveats handled here (see the keystone spike): @xterm/addon-serialize does
 * NOT serialize cursor visibility (DECTCEM ?25l), so we track it from the byte
 * stream and re-emit it; cursor position restores functionally but not
 * byte-exactly (do not assert byte-equality). Pinned to @xterm/headless@6.0.0
 * and @xterm/addon-serialize@0.14.0 (serialize() reaches into _core internals).
 *
 * Interop note: both packages export via CJS in a way tsx/Node cannot resolve
 * as named ESM imports, so the runtime values come through createRequire() while
 * the types are imported separately.
 */

import type { TerminalSnapshot } from '$lib/types';
import type { SerializeAddon as SerializeAddonInstance } from '@xterm/addon-serialize';
import type { Terminal as HeadlessTerminal } from '@xterm/headless';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Terminal } = require('@xterm/headless') as {
  Terminal: new (options?: object) => HeadlessTerminal;
};
const { SerializeAddon } = require('@xterm/addon-serialize') as {
  SerializeAddon: new () => SerializeAddonInstance;
};

/** Scrollback lines retained in the emulator and included in snapshots. */
const SNAPSHOT_SCROLLBACK_LINES = 1000;

const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';

export class TerminalEmulator {
  private cursorHidden = false;
  private readonly serializer: SerializeAddonInstance;
  private readonly term: HeadlessTerminal;

  constructor(cols: number, rows: number) {
    this.term = new Terminal({
      allowProposedApi: true,
      cols: cols > 0 ? cols : 80,
      rows: rows > 0 ? rows : 24,
      scrollback: SNAPSHOT_SCROLLBACK_LINES,
    });
    this.serializer = new SerializeAddon();
    // @xterm/addon-serialize types its addon against @xterm/xterm's Terminal,
    // but we run it on @xterm/headless's Terminal. Runtime-compatible; the cast
    // bridges the two structurally-different Terminal types at loadAddon only.
    this.term.loadAddon(this.serializer as unknown as Parameters<HeadlessTerminal['loadAddon']>[0]);
  }

  dispose(): void {
    try {
      this.serializer.dispose();
      this.term.dispose();
    } catch {
      // Already disposed — ignore.
    }
  }

  resize(cols: number, rows: number): void {
    if (cols > 0 && rows > 0) {
      this.term.resize(cols, rows);
    }
  }

  /**
   * Capture the current screen as a VT-escape string. Serialization runs inside
   * a write() callback so all previously-written bytes are parsed first.
   */
  snapshot(): Promise<TerminalSnapshot> {
    return new Promise<TerminalSnapshot>((resolve) => {
      this.term.write('', () => {
        let data = this.serializer.serialize({ scrollback: SNAPSHOT_SCROLLBACK_LINES });
        // SerializeAddon omits cursor visibility — re-emit when hidden.
        if (this.cursorHidden) {
          data += HIDE_CURSOR;
        }
        resolve({ cols: this.term.cols, data, rows: this.term.rows });
      });
    });
  }

  write(data: string): void {
    // Track cursor visibility (DECTCEM) from the stream; last toggle wins.
    const hideIdx = data.lastIndexOf(HIDE_CURSOR);
    const showIdx = data.lastIndexOf(SHOW_CURSOR);
    if (hideIdx !== -1 || showIdx !== -1) {
      this.cursorHidden = hideIdx > showIdx;
    }
    this.term.write(data);
  }
}
