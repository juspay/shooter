/**
 * Test script for CLIRunner
 * Run with: npx tsx scripts/test-runner.ts
 */

import pty, { type IPty } from 'node-pty';

interface ExitCallback {
  (code: number, signal?: number): void;
}

interface OutputCallback {
  (data: string): void;
}

interface RunnerConfig {
  args?: string[];
  cols?: number;
  command: string;
  cwd?: string;
  rows?: number;
  useLoginShell?: boolean;
}

class CLIRunner {
  private config: Required<Omit<RunnerConfig, 'useLoginShell'>> & { useLoginShell: boolean; env: NodeJS.ProcessEnv };
  private onExitCallback: null | ExitCallback = null;
  private onOutputCallback: null | OutputCallback = null;
  private process: IPty | null = null;

  constructor(config: RunnerConfig) {
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

  onExit(callback: ExitCallback): this {
    this.onExitCallback = callback;
    return this;
  }

  onOutput(callback: OutputCallback): this {
    this.onOutputCallback = callback;
    return this;
  }

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

  ctrlC(): this {
    return this.write('\x03');
  }

  ctrlD(): this {
    return this.write('\x04');
  }

  enter(): this {
    return this.write('\r');
  }

  isRunning(): boolean {
    return this.process !== null;
  }

  stop(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  type(text: string): this {
    return this.write(text);
  }

  write(data: string): this {
    this.process?.write(data);
    return this;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Test with echo command
async function testWithEcho() {
  console.log('=== Testing CLIRunner with echo ===\n');

  const runner = new CLIRunner({
    command: 'echo',
    args: ['Hello from CLIRunner!'],
    useLoginShell: false,
  });

  runner.onOutput((data) => {
    process.stdout.write(`📤 Output: ${data}`);
  });

  runner.onExit((code) => {
    console.log(`\n✅ Process exited with code ${code}`);
  });

  runner.start();
  await sleep(1000);
}

// Test with interactive bash
async function testWithBash() {
  console.log('\n=== Testing CLIRunner with bash ===\n');

  const runner = new CLIRunner({
    command: 'bash',
    useLoginShell: false,
  });

  runner.onOutput((data) => {
    process.stdout.write(data);
  });

  runner.onExit((code) => {
    console.log(`\n✅ Bash exited with code ${code}`);
  });

  runner.start();

  await sleep(500);
  runner.type('echo "Hello from bash!"');
  runner.enter();

  await sleep(500);
  runner.type('pwd');
  runner.enter();

  await sleep(500);
  runner.type('exit');
  runner.enter();

  await sleep(1000);
}

// Test with node REPL
async function testWithNode() {
  console.log('\n=== Testing CLIRunner with node REPL ===\n');

  const runner = new CLIRunner({
    command: 'node',
    useLoginShell: false,
  });

  runner.onOutput((data) => {
    process.stdout.write(data);
  });

  runner.onExit((code) => {
    console.log(`\n✅ Node exited with code ${code}`);
  });

  runner.start();

  await sleep(500);
  runner.type('console.log("Hello from Node REPL!")');
  runner.enter();

  await sleep(300);
  runner.type('2 + 2');
  runner.enter();

  await sleep(300);
  runner.type('const msg = "CLIRunner works!"');
  runner.enter();

  await sleep(300);
  runner.type('msg');
  runner.enter();

  await sleep(300);
  runner.ctrlD(); // Exit node

  await sleep(500);
}

async function main() {
  try {
    await testWithEcho();
    await testWithBash();
    await testWithNode();
    console.log('\n✅ All tests completed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

main();
