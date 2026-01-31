import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async () => {
  // NOTE: Authentication has been removed from this application
  // Load notification-specific settings
  return {
    notificationSettings: {
      enabled: true,
      soundEnabled: true,
      vibrationEnabled: true,
      categories: ['debug', 'feature', 'testing', 'learning', 'system']
    }
  };
};