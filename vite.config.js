import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    allowedHosts: ['shooter.breezehq.dev'],
  },
  ssr: {
    external: ['better-sqlite3', 'node-pty'],
  },
});
