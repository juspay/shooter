// Shooter UI Component System
// Centralized exports for all Shooter components

// Original Shooter components
export { default as ShooterButton } from './ShooterButton.svelte';
export { default as ShooterInput } from './ShooterInput.svelte';
export { default as ShooterCheckbox } from './ShooterCheckbox.svelte';
export { default as ShooterSelect } from './ShooterSelect.svelte';
export { default as ShooterModal } from './ShooterModal.svelte';
export { default as ShooterTable } from './ShooterTable.svelte';
export { default as ShooterBadge } from './ShooterBadge.svelte';
export { default as ShooterCard } from './ShooterCard.svelte';

// Note: Components now use Juspay internally for enhanced functionality

// Type definitions for component props
export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type InputType = 'text' | 'email' | 'password' | 'tel' | 'url' | 'search' | 'number';
export type InputSize = 'sm' | 'md' | 'lg';

export type CheckboxSize = 'sm' | 'md' | 'lg';

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
};

export type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'fullscreen';

export type TableRow = Record<string, unknown>;

export type TableColumn<T extends TableRow = TableRow> = {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  render?: (_value: unknown, _row: T) => string;
};

export type BadgeVariant =
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'error'
  | 'info'
  | 'neutral';
export type BadgeSize = 'sm' | 'md' | 'lg';

// Component size type union
export type ComponentSize = 'sm' | 'md' | 'lg';

// Common event types
export interface ClickEvent {
  click: MouseEvent;
}

export interface ChangeEvent<T = unknown, P = Record<string, unknown>> {
  change: { value: T } & P;
}

export interface SelectEvent<T = unknown, P = Record<string, unknown>> {
  select: { value: T } & P;
}

// Utility functions for working with Shooter components
export const shooterSizes: ComponentSize[] = ['sm', 'md', 'lg'];

export const shooterButtonVariants: ButtonVariant[] = [
  'primary',
  'secondary',
  'danger',
  'ghost',
  'outline'
];

export const shooterBadgeVariants: BadgeVariant[] = [
  'primary',
  'secondary',
  'success',
  'warning',
  'error',
  'info',
  'neutral'
];

// Helper function to validate component props
export function validateSize(size: string): size is ComponentSize {
  return shooterSizes.includes(size as ComponentSize);
}

export function validateButtonVariant(variant: string): variant is ButtonVariant {
  return shooterButtonVariants.includes(variant as ButtonVariant);
}

export function validateBadgeVariant(variant: string): variant is BadgeVariant {
  return shooterBadgeVariants.includes(variant as BadgeVariant);
}

// CSS class helpers
export function getShooterSizeClass(component: string, size: ComponentSize): string {
  return `shooter-${component}--${size}`;
}

export function getShooterVariantClass(component: string, variant: string): string {
  return `shooter-${component}--${variant}`;
}

// Default props for components
export const defaultButtonProps = {
  variant: 'primary' as ButtonVariant,
  size: 'md' as ButtonSize,
  disabled: false,
  loading: false,
  fullWidth: false,
  type: 'button' as const
};

export const defaultInputProps = {
  type: 'text' as InputType,
  size: 'md' as InputSize,
  disabled: false,
  readonly: false,
  required: false,
  fullWidth: false
};

export const defaultCheckboxProps = {
  size: 'md' as CheckboxSize,
  disabled: false,
  checked: false,
  indeterminate: false
};

export const defaultSelectProps = {
  size: 'md' as InputSize,
  disabled: false,
  multiple: false,
  searchable: false,
  clearable: false,
  fullWidth: false
};

export const defaultModalProps = {
  size: 'md' as ModalSize,
  open: false,
  closable: true,
  closeOnBackdrop: true,
  closeOnEscape: true,
  centered: true,
  scrollable: false,
  persistent: false
};

export const defaultTableProps = {
  data: [],
  columns: [],
  sortBy: null,
  sortDirection: 'asc' as const,
  selectable: false,
  selectedRows: [],
  keyField: 'id',
  loading: false,
  striped: false,
  bordered: false,
  hoverable: true,
  compact: false,
  responsive: true,
  stickyHeader: false
};

export const defaultBadgeProps = {
  variant: 'neutral' as BadgeVariant,
  size: 'md' as BadgeSize,
  iconPosition: 'left' as const,
  removable: false,
  outlined: false,
  rounded: false,
  uppercase: false
};

// Theme utilities
export interface ShooterTheme {
  colors: {
    primary: string;
    secondary: string;
    success: string;
    warning: string;
    error: string;
    info: string;
    neutral: string;
  };
  spacing: {
    sm: string;
    md: string;
    lg: string;
  };
  borderRadius: {
    sm: string;
    md: string;
    lg: string;
    full: string;
  };
}

export const defaultShooterTheme: ShooterTheme = {
  colors: {
    primary: '#1f6feb',
    secondary: '#21262d',
    success: '#238636',
    warning: '#d29922',
    error: '#da3633',
    info: '#0969da',
    neutral: '#6e7681'
  },
  spacing: {
    sm: '0.5rem',
    md: '1rem',
    lg: '1.5rem'
  },
  borderRadius: {
    sm: '4px',
    md: '6px',
    lg: '8px',
    full: '50px'
  }
};

// Accessibility helpers
export function generateId(prefix = 'shooter'): string {
  return `${prefix}-${Math.random().toString(36).substr(2, 9)}`;
}

export function getAriaDescribedBy(...ids: (string | null | undefined)[]): string | null {
  const validIds = ids.filter(Boolean);
  return validIds.length > 0 ? validIds.join(' ') : null;
}

// Card component types
export type ShooterCardVariant = 'default' | 'outlined' | 'elevated' | 'filled';
export type ShooterCardSize = 'sm' | 'md' | 'lg';

// Re-export key Juspay types for advanced usage
export type {
  ButtonProperties,
  InputProperties,
  ModalProperties,
  SelectProperties,
  BadgeProperties,
} from '@juspay/svelte-ui-components';
