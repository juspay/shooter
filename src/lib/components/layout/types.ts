/**
 * Layout Component Types
 * Type definitions for all layout components
 */

// Sidebar types
export interface NavigationItem {
  id: string;
  label: string;
  icon?: string;
  href?: string;
  badge?: {
    text: string;
    variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  };
  children?: NavigationItem[];
  disabled?: boolean;
  external?: boolean;
  onClick?: () => void;
}

// TopNavbar types
export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  role?: string;
}

export interface NavbarNotification {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'info' | 'success' | 'warning' | 'error';
}

// MobileNav types
export interface MobileNavItem {
  id: string;
  label: string;
  icon: string;
  href?: string;
  badge?: {
    text: string;
    variant?: 'primary' | 'success' | 'warning' | 'error' | 'info' | 'neutral';
  };
  disabled?: boolean;
  onClick?: () => void;
}

// Toast types
export interface ToastNotification {
  id: string;
  title: string;
  message?: string;
  type: 'success' | 'error' | 'warning' | 'info' | 'loading';
  duration?: number; // in milliseconds, 0 = no auto-dismiss
  dismissible?: boolean;
  actions?: Array<{
    id: string;
    label: string;
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    onClick?: () => void;
  }>;
  persistent?: boolean;
  progress?: boolean;
}

// StatusScreen types
export type StatusType = 'loading' | 'error' | 'empty' | 'success' | 'warning' | 'maintenance' | 'offline' | 'unauthorized' | 'not-found';
