import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import { config as dotenvConfig } from 'dotenv';

// Explicitly load .env file for Bun compatibility
dotenvConfig();

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory
  const env = loadEnv(mode, process.cwd(), '');

  // Make env variables available to process.env
  Object.assign(process.env, env);

  return {
  plugins: [sveltekit()],

  // Bun-optimized configuration
  optimizeDeps: {
    // Pre-bundle dependencies for faster dev server
    include: ['@sveltejs/kit', 'svelte']
  },

  server: {
    // Hard-coded port 7777 for consistency
    port: 7777,
    // Optimize dev server for Bun
    fs: {
      allow: ['..']
    }
  },

  build: {
    // Optimize build for production
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['svelte']
        }
      }
    }
  },

  // Enable Bun-compatible module resolution
  resolve: {
    conditions: ['bun', 'import', 'module', 'browser', 'default']
  }
};
});
