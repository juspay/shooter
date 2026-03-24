import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      manifest: {
        background_color: '#0a0a0a',
        description: 'Remote terminal and notification system for your system',
        display: 'standalone',
        icons: [
          {
            sizes: '192x192',
            src: 'pwa-192x192.png',
            type: 'image/png',
          },
          {
            sizes: '512x512',
            src: 'pwa-512x512.png',
            type: 'image/png',
          },
          {
            purpose: 'maskable',
            sizes: '512x512',
            src: 'pwa-512x512.png',
            type: 'image/png',
          },
        ],
        name: 'Shooter',
        short_name: 'Shooter',
        theme_color: '#0a0a0a',
      },
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2}'],
      },
    }),
  ],
  server: {
    allowedHosts: ['shooter.breezehq.dev'],
  },
  ssr: {
    external: ['better-sqlite3', 'node-pty'],
  },
});
