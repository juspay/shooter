import type {
  CLIRunnerConfig,
  ExitCallback,
  CLIRunnerInternalConfig as InternalConfig,
  OutputCallback,
} from '$lib/types';

import pty, { type IPty } from 'node-pty';

export class CLIRunner {
  private config: InternalConfig;
  private onExitCallback: ExitCallback | null = null;
  private onOutputCallback: null | OutputCallback = null;
  private process: IPty | null = null;

  constructor(config: CLIRunnerConfig) {
    this.config = {
      args: config.args ?? [],
      cols: config.cols ?? 80,
      command: config.command,
      cwd: config.cwd ?? process.cwd(),
      env: process.env,
      rows: config.rows ?? 30,
      useLoginShell: config.useLoginShell ?? true,
    };
  }

  ctrlC(): this {
    return this.write('\x03');
  }

  ctrlD(): this {
    return this.write('\x04');
  }

  ctrlZ(): this {
    return this.write('\x1a');
  }

  enter(): this {
    return this.write('\r');
  }

  escape(): this {
    return this.write('\x1b');
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  moveDown(): this {
    return this.write('\x1b[B');
  }

  moveLeft(): this {
    return this.write('\x1b[D');
  }

  moveRight(): this {
    return this.write('\x1b[C');
  }

  moveUp(): this {
    return this.write('\x1b[A');
  }

  onExit(callback: ExitCallback): this {
    this.onExitCallback = callback;
    return this;
  }

  onOutput(callback: OutputCallback): this {
    this.onOutputCallback = callback;
    return this;
  }

  resize(cols: number, rows: number): this {
    this.process?.resize(cols, rows);
    return this;
  }

  space(): this {
    return this.write(' ');
  }

  start(): this {
    if (this.process) {
      throw new Error('Process already running');
    }

    const { args, cols, command, cwd, env, rows, useLoginShell } = this.config;

    if (useLoginShell) {
      const shell = process.env.SHELL || '/bin/zsh';
      const shellEscape = (arg: string): string => `'${arg.replace(/'/g, "'\\''")}'`;
      const fullCommand = [command, ...args].map(shellEscape).join(' ');
      this.process = pty.spawn(shell, ['-l', '-c', fullCommand], {
        cols,
        cwd,
        env,
        name: 'xterm-color',
        rows,
      });
    } else {
      this.process = pty.spawn(command, args, {
        cols,
        cwd,
        env,
        name: 'xterm-color',
        rows,
      });
    }

    this.process.onData((data) => {
      this.onOutputCallback?.(data);
    });

    this.process.onExit(({ exitCode, signal }) => {
      this.onExitCallback?.(exitCode, signal);
      this.process = null;
    });

    return this;
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  tab(): this {
    return this.write('\t');
  }

  type(text: string): this {
    return this.write(text);
  }

  write(data: string): this {
    this.process?.write(data);
    return this;
  }
}

export function createRunner(config: CLIRunnerConfig): CLIRunner {
  return new CLIRunner(config);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
