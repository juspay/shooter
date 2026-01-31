// Settings Components
// Centralized exports for all settings-related components

export { default as SettingsModal } from './SettingsModal.svelte';
export { default as NotificationSettingsModal } from './NotificationSettingsModal.svelte';

// Settings-related types and interfaces
export interface SettingsData {
  notifications: {
    enabled: boolean;
    sound: boolean;
    desktop: boolean;
    mobile: boolean;
    frequency: string;
  };
  appearance: {
    theme: string;
    fontSize: string;
    layout: string;
  };
  account: {
    username: string;
    email: string;
    autoLogout: boolean;
    sessionTimeout: string;
  };
}

export interface NotificationSettings {
  general: {
    enabled: boolean;
    sound: boolean;
    badge: boolean;
    vibration: boolean;
  };
  categories: {
    coding: boolean;
    debugging: boolean;
    testing: boolean;
    deployment: boolean;
    collaboration: boolean;
  };
  delivery: {
    desktop: boolean;
    mobile: boolean;
    email: boolean;
    slack: boolean;
  };
  scheduling: {
    quietHours: boolean;
    startTime: string;
    endTime: string;
    weekendsOnly: boolean;
  };
  filtering: {
    priority: string;
    keywords: string;
    excludeKeywords: string;
    maxPerHour: string;
  };
}

// Default settings values
export const defaultSettings: SettingsData = {
  notifications: {
    enabled: true,
    sound: true,
    desktop: true,
    mobile: true,
    frequency: 'realtime'
  },
  appearance: {
    theme: 'dark',
    fontSize: 'medium',
    layout: 'compact'
  },
  account: {
    username: '',
    email: '',
    autoLogout: true,
    sessionTimeout: '30'
  }
};

export const defaultNotificationSettings: NotificationSettings = {
  general: {
    enabled: true,
    sound: true,
    badge: true,
    vibration: false
  },
  categories: {
    coding: true,
    debugging: true,
    testing: false,
    deployment: true,
    collaboration: true
  },
  delivery: {
    desktop: true,
    mobile: true,
    email: false,
    slack: false
  },
  scheduling: {
    quietHours: false,
    startTime: '22:00',
    endTime: '08:00',
    weekendsOnly: false
  },
  filtering: {
    priority: 'normal',
    keywords: '',
    excludeKeywords: '',
    maxPerHour: '10'
  }
};

// Settings validation utilities
export function validateSettings(settings: Partial<SettingsData>): boolean {
  // Basic validation - ensure required fields are present
  if (settings.account) {
    if (settings.account.username && settings.account.username.length < 3) {
      return false;
    }
    if (settings.account.email && !isValidEmail(settings.account.email)) {
      return false;
    }
  }

  return true;
}

export function validateNotificationSettings(settings: Partial<NotificationSettings>): boolean {
  // Validate time format for quiet hours
  if (settings.scheduling?.quietHours) {
    const timePattern = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
    if (settings.scheduling.startTime && !timePattern.test(settings.scheduling.startTime)) {
      return false;
    }
    if (settings.scheduling.endTime && !timePattern.test(settings.scheduling.endTime)) {
      return false;
    }
  }

  return true;
}

// Helper functions
function isValidEmail(email: string): boolean {
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailPattern.test(email);
}

export function mergeSettings(current: SettingsData, updates: Partial<SettingsData>): SettingsData {
  return {
    notifications: { ...current.notifications, ...updates.notifications },
    appearance: { ...current.appearance, ...updates.appearance },
    account: { ...current.account, ...updates.account }
  };
}

export function mergeNotificationSettings(
  current: NotificationSettings,
  updates: Partial<NotificationSettings>
): NotificationSettings {
  return {
    general: { ...current.general, ...updates.general },
    categories: { ...current.categories, ...updates.categories },
    delivery: { ...current.delivery, ...updates.delivery },
    scheduling: { ...current.scheduling, ...updates.scheduling },
    filtering: { ...current.filtering, ...updates.filtering }
  };
}
