import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface Config {
  apiKey: string;
  deviceToken?: string;
}

function createConfigStore() {
  const { subscribe, set, update } = writable<Config>({
    apiKey: '',
    deviceToken: ''
  });

  // Load config from localStorage on initialization
  if (browser) {
    const stored = localStorage.getItem('shooter_config');
    if (stored) {
      try {
        set(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to load config from localStorage:', e);
      }
    }
  }

  return {
    subscribe,
    set: (value: Config) => {
      set(value);
      if (browser) {
        localStorage.setItem('shooter_config', JSON.stringify(value));
      }
    },
    update: (updater: (_value: Config) => Config) => {
      update(value => {
        const newValue = updater(value);
        if (browser) {
          localStorage.setItem('shooter_config', JSON.stringify(newValue));
        }
        return newValue;
      });
    }
  };
}

export const config = createConfigStore();
