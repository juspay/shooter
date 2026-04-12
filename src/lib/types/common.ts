import type { Snippet } from 'svelte';

export interface CardProps {
  children: Snippet;
  class?: string;
  description?: string;
  title?: string;
}

export interface EmptyStateProps {
  children?: Snippet;
  description: string;
  icon: IconName;
  title: string;
}

/** Icon names available in the Icon component. */
export type IconName =
  | 'alert-triangle'
  | 'bell'
  | 'check-circle'
  | 'file'
  | 'folder'
  | 'play'
  | 'refresh'
  | 'settings'
  | 'terminal'
  | 'tool'
  | 'x-circle';

export interface IconProps {
  class?: string;
  name: IconName;
  size?: number;
}

export interface StatusBadgeProps {
  status: 'degraded' | 'error' | 'healthy' | 'unknown';
}
