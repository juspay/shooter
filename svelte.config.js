import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  kit: {
    adapter: adapter({ precompress: true }),
    alias: {
      $generated: './src/generated',
    },
    serviceWorker: {
      register: false,
    },
  },
  preprocess: vitePreprocess(),
};

export default config;
