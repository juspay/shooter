import { sveltekit } from '@sveltejs/kit/vite';
import { createRequire } from 'node:module';
import { defineConfig } from 'vite';

// @xterm/headless@6.0.0 declares a `module` field (lib/xterm.mjs) that does not
// exist in the package (the real ESM lives under lib-headless/), so vite's
// resolver fails on the bare specifier. Alias both to their actual resolved
// entry files so the server bundle can include them.
const require = createRequire(import.meta.url);

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    alias: {
      '@xterm/addon-serialize': require.resolve('@xterm/addon-serialize'),
      '@xterm/headless': require.resolve('@xterm/headless'),
    },
  },
  server: {
    allowedHosts: ['shooter.breezehq.dev'],
  },
  ssr: {
    external: ['better-sqlite3', 'node-pty'],
  },
});
