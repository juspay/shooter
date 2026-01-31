// Layout Components
// Centralized exports for all layout-related components

export { default as Sidebar } from './Sidebar.svelte';
export { default as TopNavbar } from './TopNavbar.svelte';
export { default as MobileNav } from './MobileNav.svelte';
export { default as Toast } from './Toast.svelte';
export { default as StatusScreen } from './StatusScreen.svelte';
export { default as DashboardLayout } from './DashboardLayout.svelte';

// Layout component types and interfaces
export type { NavigationItem, User, NavbarNotification, MobileNavItem, ToastNotification, StatusType } from './types';

// Import types for use within this file
import type { NavigationItem, User, NavbarNotification, MobileNavItem, ToastNotification } from './types';

// Layout utilities and constants
export const LAYOUT_BREAKPOINTS = {
  sm: '640px',
  md: '768px',
  lg: '1024px',
  xl: '1280px',
  '2xl': '1536px'
} as const;

export const SIDEBAR_WIDTHS = {
  collapsed: '72px',
  expanded: '280px',
  mobile: '320px'
} as const;

export const Z_INDEX_LAYERS = {
  dropdown: 1000,
  sticky: 1010,
  modal: 1020,
  toast: 1030,
  tooltip: 1040
} as const;

// Navigation helpers
export function createNavigationItem(
  id: string,
  label: string,
  options: Partial<Omit<NavigationItem, 'id' | 'label'>> = {}
): NavigationItem {
  return {
    id,
    label,
    ...options
  };
}

export function createMobileNavItem(
  id: string,
  label: string,
  icon: string,
  options: Partial<Omit<MobileNavItem, 'id' | 'label' | 'icon'>> = {}
): MobileNavItem {
  return {
    id,
    label,
    icon,
    ...options
  };
}

// Toast helpers
export function createToast(
  id: string,
  title: string,
  type: ToastNotification['type'],
  options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = {}
): ToastNotification {
  return {
    id,
    title,
    type,
    duration: type === 'loading' ? 0 : 5000,
    dismissible: type !== 'loading',
    ...options
  };
}

export function createSuccessToast(title: string, message?: string): ToastNotification {
  const options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = { duration: 4000 };
  if (message !== undefined) {
options.message = message;
}
  return createToast(`success_${Date.now()}`, title, 'success', options);
}

export function createErrorToast(title: string, message?: string): ToastNotification {
  const options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = { duration: 6000 };
  if (message !== undefined) {
options.message = message;
}
  return createToast(`error_${Date.now()}`, title, 'error', options);
}

export function createWarningToast(title: string, message?: string): ToastNotification {
  const options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = { duration: 5000 };
  if (message !== undefined) {
options.message = message;
}
  return createToast(`warning_${Date.now()}`, title, 'warning', options);
}

export function createInfoToast(title: string, message?: string): ToastNotification {
  const options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = { duration: 4000 };
  if (message !== undefined) {
options.message = message;
}
  return createToast(`info_${Date.now()}`, title, 'info', options);
}

export function createLoadingToast(title: string, message?: string): ToastNotification {
  const options: Partial<Omit<ToastNotification, 'id' | 'title' | 'type'>> = {
    duration: 0,
    dismissible: false
  };
  if (message !== undefined) {
options.message = message;
}
  return createToast(`loading_${Date.now()}`, title, 'loading', options);
}

// Layout state management
export interface LayoutState {
  sidebarCollapsed: boolean;
  sidebarMobile: boolean;
  currentBreakpoint: keyof typeof LAYOUT_BREAKPOINTS | 'xs';
  toasts: ToastNotification[];
  user: User | null;
  notifications: NavbarNotification[];
}

export function createDefaultLayoutState(): LayoutState {
  return {
    sidebarCollapsed: false,
    sidebarMobile: false,
    currentBreakpoint: 'lg',
    toasts: [],
    user: null,
    notifications: []
  };
}

// Responsive helpers
export function getBreakpoint(width: number): keyof typeof LAYOUT_BREAKPOINTS | 'xs' {
  if (width >= 1536) {
return '2xl';
}
  if (width >= 1280) {
return 'xl';
}
  if (width >= 1024) {
return 'lg';
}
  if (width >= 768) {
return 'md';
}
  if (width >= 640) {
return 'sm';
}
  return 'xs';
}

export function isMobileBreakpoint(breakpoint: string): boolean {
  return ['xs', 'sm'].includes(breakpoint);
}

export function isTabletBreakpoint(breakpoint: string): boolean {
  return breakpoint === 'md';
}

export function isDesktopBreakpoint(breakpoint: string): boolean {
  return ['lg', 'xl', '2xl'].includes(breakpoint);
}

// Theme helpers
export interface ThemeConfig {
  colorScheme: 'light' | 'dark' | 'auto';
  primaryColor: string;
  borderRadius: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  density: 'compact' | 'normal' | 'comfortable';
  animations: boolean;
}

export function createDefaultThemeConfig(): ThemeConfig {
  return {
    colorScheme: 'auto',
    primaryColor: '#3b82f6',
    borderRadius: 'md',
    density: 'normal',
    animations: true
  };
}

// Layout validation
export function validateNavigationItems(items: NavigationItem[]): boolean {
  const ids = new Set<string>();

  function validateItem(item: NavigationItem): boolean {
    if (!item.id || !item.label) {
return false;
}
    if (ids.has(item.id)) {
return false;
}

    ids.add(item.id);

    if (item.children) {
      return item.children.every(validateItem);
    }

    return true;
  }

  return items.every(validateItem);
}

export function validateMobileNavItems(items: MobileNavItem[]): boolean {
  const ids = new Set<string>();

  return items.every(item => {
    if (!item.id || !item.label || !item.icon) {
return false;
}
    if (ids.has(item.id)) {
return false;
}

    ids.add(item.id);
    return true;
  });
}

// Mock data generators for development
export function generateMockUser(): User {
  return {
    id: 'user_123',
    name: 'John Doe',
    email: 'john.doe@example.com',
    avatar: '',
    role: 'Developer'
  };
}

export function generateMockNotifications(count: number = 5): NavbarNotification[] {
  const types: NavbarNotification['type'][] = ['info', 'success', 'warning', 'error'];
  const titles = [
    'New notification received',
    'Deployment completed',
    'System maintenance scheduled',
    'Error in processing',
    'Welcome to the dashboard'
  ];

  const messages = [
    'Your request has been processed successfully.',
    'The latest version has been deployed to production.',
    'Scheduled maintenance will begin at 2 AM UTC.',
    'An error occurred while processing your request.',
    'You now have access to all dashboard features.'
  ];

  return Array.from({ length: count }, (_, index) => {
    const now = new Date();
    const timestamp = new Date(now.getTime() - Math.random() * 24 * 60 * 60 * 1000);

    return {
      id: `notification_${index + 1}_${Date.now()}`,
      title: titles[Math.floor(Math.random() * titles.length)]!,
      message: messages[Math.floor(Math.random() * messages.length)]!,
      timestamp: timestamp.toISOString(),
      read: Math.random() > 0.4,
      type: types[Math.floor(Math.random() * types.length)]!
    };
  });
}

export function generateMockNavigation(): NavigationItem[] {
  return [
    createNavigationItem('dashboard', 'Dashboard', {
      icon: '📊',
      href: '/dashboard'
    }),
    createNavigationItem('notifications', 'Notifications', {
      icon: '🔔',
      href: '/notifications',
      badge: { text: '3', variant: 'primary' }
    }),
    createNavigationItem('analytics', 'Analytics', {
      icon: '📈',
      href: '/analytics'
    }),
    createNavigationItem('settings', 'Settings', {
      icon: '⚙️',
      children: [
        createNavigationItem('general', 'General', {
          href: '/settings/general'
        }),
        createNavigationItem('security', 'Security', {
          href: '/settings/security'
        }),
        createNavigationItem('integrations', 'Integrations', {
          href: '/settings/integrations'
        })
      ]
    }),
    createNavigationItem('help', 'Help & Support', {
      icon: '❓',
      href: '/help'
    })
  ];
}

export function generateMockMobileNavigation(): MobileNavItem[] {
  return [
    createMobileNavItem('home', 'Home', '🏠', { href: '/' }),
    createMobileNavItem('dashboard', 'Dashboard', '📊', { href: '/dashboard' }),
    createMobileNavItem('notifications', 'Notifications', '🔔', {
      href: '/notifications',
      badge: { text: '3', variant: 'primary' }
    }),
    createMobileNavItem('settings', 'Settings', '⚙️', { href: '/settings' }),
    createMobileNavItem('profile', 'Profile', '👤', { href: '/profile' })
  ];
}
