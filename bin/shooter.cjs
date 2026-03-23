#!/usr/bin/env node

// CLI entry point for the Shooter server.
// Usage: shooter [command]
//   shooter start    — Start the server (default)
//   shooter setup    — Interactive setup wizard
//   shooter version  — Show version
//   shooter help     — Show usage

'use strict';

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// ── Resolve the package root ────────────────────────────────────────
// Whether installed globally via npm or run from a local clone, the
// package root is always one directory above this bin/ script.
const PKG_ROOT = path.resolve(__dirname, '..');

const pkg = require(path.join(PKG_ROOT, 'package.json'));

// ── CLI argument parsing ────────────────────────────────────────────
const args = process.argv.slice(2);
const command = args[0] || 'start';

switch (command) {
	case 'start':
		startServer();
		break;
	case 'setup':
		runSetup();
		break;
	case 'version':
	case '--version':
	case '-v':
		console.log(`shooter v${pkg.version}`);
		break;
	case 'help':
	case '--help':
	case '-h':
		showHelp();
		break;
	default:
		console.error(`Unknown command: ${command}\n`);
		showHelp();
		process.exit(1);
}

// ── Commands ────────────────────────────────────────────────────────

function startServer() {
	const serverEntry = path.join(PKG_ROOT, 'server.ts');

	if (!fs.existsSync(serverEntry)) {
		console.error('Error: server.ts not found at', serverEntry);
		console.error('The Shooter package may not be installed correctly.');
		process.exit(1);
	}

	// Spawn tsx with the server entry point, inheriting stdio so the
	// user sees logs directly. Run from PKG_ROOT so relative imports
	// (like ./build/handler.js) resolve correctly.
	const child = spawn(
		process.execPath,
		['--import', 'tsx', serverEntry, ...args.slice(1)],
		{
			cwd: PKG_ROOT,
			stdio: 'inherit',
			env: {
				...process.env,
				// If the user has a .env in their cwd, dotenv in server.ts
				// will pick it up. But also hint where the package lives so
				// the server can find its own assets if needed.
				SHOOTER_PKG_ROOT: PKG_ROOT,
			},
		}
	);

	child.on('error', (err) => {
		console.error('Failed to start Shooter server:', err.message);
		process.exit(1);
	});

	child.on('exit', (code) => {
		process.exit(code ?? 0);
	});

	// Forward signals to the child so graceful shutdown works
	for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
		process.on(sig, () => child.kill(sig));
	}
}

function runSetup() {
	const setupScript = path.join(PKG_ROOT, 'scripts', 'setup.cjs');

	if (!fs.existsSync(setupScript)) {
		console.error('Error: Setup wizard not found at', setupScript);
		console.error('The setup script (scripts/setup.cjs) has not been created yet.');
		process.exit(1);
	}

	const child = spawn(process.execPath, [setupScript, ...args.slice(1)], {
		cwd: process.cwd(),
		stdio: 'inherit',
		env: {
			...process.env,
			SHOOTER_PKG_ROOT: PKG_ROOT,
		},
	});

	child.on('error', (err) => {
		console.error('Failed to run setup wizard:', err.message);
		process.exit(1);
	});

	child.on('exit', (code) => {
		process.exit(code ?? 0);
	});
}

function showHelp() {
	console.log(`
Shooter v${pkg.version}

Usage: shooter [command]

Commands:
  start     Start the Shooter server (default)
  setup     Run the interactive setup wizard
  version   Show version number
  help      Show this help message

Examples:
  shooter              Start the server
  shooter start        Start the server (explicit)
  shooter setup        Run setup wizard
  shooter --version    Show version
`.trim());
}
