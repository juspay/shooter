import type { Handle } from '@sveltejs/kit';
import { initializeStorages } from '$lib/storage';

// NOTE: Authentication has been removed from this application
// The authHandle middleware and all authentication checks have been disabled

// Initialize storage system on server startup
let storageInitialized = false;
async function ensureStorageInitialized() {
  if (!storageInitialized) {
    console.log('🔄 Initializing storage system...');
    await initializeStorages();
    storageInitialized = true;
    console.log('✅ Storage system initialized');
  }
}

// Initialize immediately
ensureStorageInitialized().catch(err => {
  console.error('❌ Failed to initialize storage:', err);
});

/**
 * SvelteKit configuration handle
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  return response;
};