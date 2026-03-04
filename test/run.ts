/**
 * CLIRunner - A class for running and interacting with CLI processes via PTY
 */

import { pathToFileURL } from 'node:url';
import pty, { type IPty } from 'node-pty';

// Configuration for spawning a CLI process
type CLIRunnerConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  cols?: number;
  rows?: number;
  useLoginShell?: boolean;
};

// Callback type for output events
type OutputCallback = (data: string) => void;

// Callback type for exit events
type ExitCallback = (code: number, signal?: number) => void;

class CLIRunner {
  private process: IPty | null = null;
  private config: Required<Omit<CLIRunnerConfig, 'useLoginShell'>> & { useLoginShell: boolean };
  private onOutputCallback: OutputCallback | null = null;
  private onExitCallback: ExitCallback | null = null;

  constructor(config: CLIRunnerConfig) {
    this.config = {
      command: config.command,
      args: config.args ?? [],
      cwd: config.cwd ?? process.cwd(),
      env: config.env ?? process.env,
      cols: config.cols ?? 80,
      rows: config.rows ?? 30,
      useLoginShell: config.useLoginShell ?? true,
    };
  }

  // Set output callback
  onOutput(callback: OutputCallback): this {
    this.onOutputCallback = callback;
    return this;
  }

  // Set exit callback
  onExit(callback: ExitCallback): this {
    this.onExitCallback = callback;
    return this;
  }

  // Start the process
  start(): this {
    if (this.process) {
      throw new Error('Process already running');
    }

    const { command, args, cwd, env, cols, rows, useLoginShell } = this.config;

    if (useLoginShell) {
      const shell = process.env.SHELL || '/bin/zsh';
      const shellEscape = (arg: string): string => `'${arg.replace(/'/g, "'\\''")}'`;
      const fullCommand = [command, ...args].map(shellEscape).join(' ');
      this.process = pty.spawn(shell, ['-l', '-c', fullCommand], {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env,
      });
    } else {
      this.process = pty.spawn(command, args, {
        name: 'xterm-color',
        cols,
        rows,
        cwd,
        env,
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

  // Stop the process
  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  // Check if process is running
  isRunning(): boolean {
    return this.process !== null;
  }

  // Write raw data to the process
  write(data: string): this {
    this.process?.write(data);
    return this;
  }

  // Navigation actions
  moveUp(): this {
    return this.write('\x1b[A');
  }

  moveDown(): this {
    return this.write('\x1b[B');
  }

  moveRight(): this {
    return this.write('\x1b[C');
  }

  moveLeft(): this {
    return this.write('\x1b[D');
  }

  // Selection actions
  enter(): this {
    return this.write('\r');
  }

  space(): this {
    return this.write(' ');
  }

  tab(): this {
    return this.write('\t');
  }

  escape(): this {
    return this.write('\x1b');
  }

  // Control sequences
  ctrlC(): this {
    return this.write('\x03');
  }

  ctrlD(): this {
    return this.write('\x04');
  }

  ctrlZ(): this {
    return this.write('\x1a');
  }

  // Type text
  type(text: string): this {
    return this.write(text);
  }

  // Resize terminal
  resize(cols: number, rows: number): this {
    this.process?.resize(cols, rows);
    return this;
  }
}

// Helper to wait
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export { CLIRunner, sleep };
export type { CLIRunnerConfig, OutputCallback, ExitCallback };

// Example usage
async function main() {
  const runner = new CLIRunner({
    command: 'claude',
  });

  runner
    .onOutput((data) => console.log(data))
    .onExit((code) => {
      console.log(`\nProcess exited with code: ${code}`);
      process.exit(code);
    })
    .start();

  // Automated steps
  await sleep(2000);
  runner.moveDown();
  await sleep(500);
  runner.enter();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main();
}
