/**
 * State Service for Global Application State Management
 * Adapted from claude-code-templates with TypeScript and Shooter-specific features
 */

import { writable, derived, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import type { NotificationSession, ConversationData } from './data-service';
import type { ConnectionStatus } from '$lib/realtime/websocket-service';

export interface AppState {
  // UI State
  sidebarOpen: boolean;
  currentView: 'dashboard' | 'notifications' | 'settings';
  theme: 'light' | 'dark' | 'system';

  // Data State
  notifications: NotificationSession[];
  conversations: ConversationData[];
  selectedNotification: string | null;

  // Connection State
  websocketStatus: ConnectionStatus;
  apiStatus: 'online' | 'offline' | 'error';

  // Performance State
  loading: boolean;
  error: string | null;
  lastUpdate: Date | null;
}

export interface StateConfig {
  persistKey?: string;
  persistToLocalStorage?: boolean;
  debounceMs?: number;
}

export class StateService {
  private state: Writable<AppState>;
  private config: StateConfig;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(config: StateConfig = {}) {
    this.config = {
      persistKey: 'shooter-app-state',
      persistToLocalStorage: true,
      debounceMs: 500,
      ...config
    };

    // Initialize state with defaults
    const initialState: AppState = {
      sidebarOpen: false,
      currentView: 'dashboard',
      theme: 'system',
      notifications: [],
      conversations: [],
      selectedNotification: null,
      websocketStatus: {
        connected: false,
        connecting: false,
        reconnecting: false,
        reconnectAttempts: 0
      },
      apiStatus: 'online',
      loading: false,
      error: null,
      lastUpdate: null
    };

    // Load persisted state if available
    const persistedState = this.loadPersistedState();
    const finalState = { ...initialState, ...persistedState };

    this.state = writable(finalState);

    // Setup persistence
    if (this.config.persistToLocalStorage && browser) {
      this.state.subscribe(this.debouncedPersist.bind(this));
    }
  }

  /**
   * Get the main state store
   */
  getStore(): Writable<AppState> {
    return this.state;
  }

  /**
   * Update state
   */
  update(updater: (_current: AppState) => AppState): void {
    this.state.update(updater);
  }

  /**
   * Set state
   */
  set(newState: AppState): void {
    this.state.set(newState);
  }

  /**
   * Get current state value
   */
  getValue(): AppState {
    let currentState: AppState;
    this.state.subscribe(state => (currentState = state))();
    return currentState!;
  }

  // UI Actions
  toggleSidebar(): void {
    this.update(state => ({
      ...state,
      sidebarOpen: !state.sidebarOpen
    }));
  }

  setSidebarOpen(open: boolean): void {
    this.update(state => ({
      ...state,
      sidebarOpen: open
    }));
  }

  setCurrentView(view: AppState['currentView']): void {
    this.update(state => ({
      ...state,
      currentView: view,
      lastUpdate: new Date()
    }));
  }

  setTheme(theme: AppState['theme']): void {
    this.update(state => ({
      ...state,
      theme
    }));

    // Apply theme to document
    if (browser) {
      this.applyTheme(theme);
    }
  }

  // Data Actions
  setNotifications(notifications: NotificationSession[]): void {
    this.update(state => ({
      ...state,
      notifications,
      lastUpdate: new Date()
    }));
  }

  addNotification(notification: NotificationSession): void {
    this.update(state => ({
      ...state,
      notifications: [notification, ...state.notifications].slice(0, 100), // Keep last 100
      lastUpdate: new Date()
    }));
  }

  updateNotification(id: string, updates: Partial<NotificationSession>): void {
    this.update(state => ({
      ...state,
      notifications: state.notifications.map(n => (n.id === id ? { ...n, ...updates } : n)),
      lastUpdate: new Date()
    }));
  }

  removeNotification(id: string): void {
    this.update(state => ({
      ...state,
      notifications: state.notifications.filter(n => n.id !== id),
      selectedNotification: state.selectedNotification === id ? null : state.selectedNotification,
      lastUpdate: new Date()
    }));
  }

  setSelectedNotification(id: string | null): void {
    this.update(state => ({
      ...state,
      selectedNotification: id
    }));
  }

  setConversations(conversations: ConversationData[]): void {
    this.update(state => ({
      ...state,
      conversations,
      lastUpdate: new Date()
    }));
  }

  addConversation(conversation: ConversationData): void {
    this.update(state => ({
      ...state,
      conversations: [conversation, ...state.conversations].slice(0, 50), // Keep last 50
      lastUpdate: new Date()
    }));
  }

  // Connection Actions
  setWebSocketStatus(status: ConnectionStatus): void {
    this.update(state => ({
      ...state,
      websocketStatus: status,
      lastUpdate: new Date()
    }));
  }

  setApiStatus(status: AppState['apiStatus']): void {
    this.update(state => ({
      ...state,
      apiStatus: status,
      lastUpdate: new Date()
    }));
  }

  // Loading and Error Actions
  setLoading(loading: boolean): void {
    this.update(state => ({
      ...state,
      loading
    }));
  }

  setError(error: string | null): void {
    this.update(state => ({
      ...state,
      error,
      lastUpdate: new Date()
    }));
  }

  clearError(): void {
    this.setError(null);
  }

  // Derived Stores
  createDerivedStores() {
    const state = this.state;

    return {
      // UI Derived Stores
      currentNotification: derived(state, $state =>
        $state.selectedNotification
          ? $state.notifications.find(n => n.id === $state.selectedNotification) || null
          : null
      ),

      // Data Derived Stores
      notificationsByType: derived(state, $state => {
        const groups: Record<string, NotificationSession[]> = {};
        $state.notifications.forEach(notification => {
          if (!groups[notification.type]) {
            groups[notification.type] = [];
          }
          groups[notification.type]!.push(notification);
        });
        return groups;
      }),

      notificationsByStatus: derived(state, $state => {
        const groups: Record<string, NotificationSession[]> = {};
        $state.notifications.forEach(notification => {
          if (!groups[notification.status]) {
            groups[notification.status] = [];
          }
          groups[notification.status]!.push(notification);
        });
        return groups;
      }),

      // Connection Derived Stores
      isConnected: derived(
        state,
        $state => $state.websocketStatus.connected && $state.apiStatus === 'online'
      ),

      hasErrors: derived(state, $state => !!$state.error || $state.apiStatus === 'error'),

      // Stats Derived Stores
      notificationStats: derived(state, $state => ({
        total: $state.notifications.length,
        pending: $state.notifications.filter(n => n.status === 'pending').length,
        sent: $state.notifications.filter(n => n.status === 'sent').length,
        failed: $state.notifications.filter(n => n.status === 'failed').length,
        filtered: $state.notifications.filter(n => n.status === 'filtered').length
      }))
    };
  }

  // Persistence
  private loadPersistedState(): Partial<AppState> {
    if (!browser || !this.config.persistToLocalStorage) {
      return {};
    }

    try {
      const saved = localStorage.getItem(this.config.persistKey!);
      if (saved) {
        const parsed = JSON.parse(saved);

        // Only restore UI preferences, not data
        return {
          sidebarOpen: parsed.sidebarOpen,
          currentView: parsed.currentView,
          theme: parsed.theme
        };
      }
    } catch (error) {
      console.warn('Failed to load persisted state:', error);
    }

    return {};
  }

  private debouncedPersist = (state: AppState): void => {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }

    this.persistTimer = setTimeout(() => {
      this.persistState(state);
    }, this.config.debounceMs);
  };

  private persistState(state: AppState): void {
    if (!browser || !this.config.persistToLocalStorage) {
      return;
    }

    try {
      // Only persist UI preferences, not sensitive data
      const toSave = {
        sidebarOpen: state.sidebarOpen,
        currentView: state.currentView,
        theme: state.theme
      };

      localStorage.setItem(this.config.persistKey!, JSON.stringify(toSave));
    } catch (error) {
      console.warn('Failed to persist state:', error);
    }
  }

  private applyTheme(theme: AppState['theme']): void {
    if (!browser) {
      return;
    }

    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldUseDark = theme === 'dark' || (theme === 'system' && prefersDark);

    document.documentElement.classList.toggle('dark', shouldUseDark);
    document.documentElement.setAttribute('data-theme', shouldUseDark ? 'dark' : 'light');
  }

  // Actions for batch operations
  batchUpdate(updates: (_current: AppState) => AppState[]): void {
    this.state.update(state => {
      const newStates = updates(state);
      return newStates.reduce((acc, newState) => ({ ...acc, ...newState }), state);
    });
  }

  // Cleanup
  destroy(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
    }
  }
}

// Global state service instance
let globalStateService: StateService | null = null;

/**
 * Get global state service instance
 */
export function getStateService(config?: StateConfig): StateService {
  if (!globalStateService) {
    globalStateService = new StateService(config);
  }

  return globalStateService;
}

/**
 * Initialize state service with default configuration
 */
export function initializeStateService(): StateService {
  return getStateService();
}

// Export derived stores for easy access
export const createAppStores = () => {
  const stateService = getStateService();
  const state = stateService.getStore();
  const derived = stateService.createDerivedStores();

  return {
    state,
    ...derived,
    actions: {
      toggleSidebar: () => stateService.toggleSidebar(),
      setSidebarOpen: (open: boolean) => stateService.setSidebarOpen(open),
      setCurrentView: (view: AppState['currentView']) => stateService.setCurrentView(view),
      setTheme: (theme: AppState['theme']) => stateService.setTheme(theme),
      setNotifications: (notifications: NotificationSession[]) =>
        stateService.setNotifications(notifications),
      addNotification: (notification: NotificationSession) =>
        stateService.addNotification(notification),
      updateNotification: (id: string, updates: Partial<NotificationSession>) =>
        stateService.updateNotification(id, updates),
      removeNotification: (id: string) => stateService.removeNotification(id),
      setSelectedNotification: (id: string | null) => stateService.setSelectedNotification(id),
      setWebSocketStatus: (status: ConnectionStatus) => stateService.setWebSocketStatus(status),
      setApiStatus: (status: AppState['apiStatus']) => stateService.setApiStatus(status),
      setLoading: (loading: boolean) => stateService.setLoading(loading),
      setError: (error: string | null) => stateService.setError(error),
      clearError: () => stateService.clearError()
    }
  };
};
