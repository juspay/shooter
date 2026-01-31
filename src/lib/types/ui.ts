/**
 * UI Component and Theme Types
 * Comprehensive type definitions for UI components, themes, and responsive design
 */

// Base component props
export interface BaseComponentProps {
  id?: string;
  className?: string;
  'data-testid'?: string;
  'aria-label'?: string;
  'aria-describedby'?: string;
  style?: Record<string, string | number>;
  disabled?: boolean;
  hidden?: boolean;
}

// Theme and color system
export interface ThemeConfig {
  mode: 'light' | 'dark' | 'system';
  colors: ColorPalette;
  typography: Typography;
  spacing: Spacing;
  breakpoints: Breakpoints;
  shadows: Shadows;
  borders: Borders;
  transitions: Transitions;
  zIndex: ZIndexScale;
}

export interface ColorPalette {
  // Primary brand colors
  primary: ColorScale;
  secondary: ColorScale;
  accent: ColorScale;
  
  // Semantic colors
  success: ColorScale;
  warning: ColorScale;
  error: ColorScale;
  info: ColorScale;
  
  // Neutral colors
  gray: ColorScale;
  
  // Background colors
  background: {
    primary: string;
    secondary: string;
    tertiary: string;
    overlay: string;
    modal: string;
  };
  
  // Text colors
  text: {
    primary: string;
    secondary: string;
    tertiary: string;
    inverse: string;
    link: string;
    linkHover: string;
  };
  
  // Border colors
  border: {
    default: string;
    subtle: string;
    strong: string;
    focus: string;
  };
}

export interface ColorScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;  // Base color
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

export interface Typography {
  fontFamily: {
    sans: string[];
    serif: string[];
    mono: string[];
  };
  
  fontSize: {
    xs: string;
    sm: string;
    base: string;
    lg: string;
    xl: string;
    '2xl': string;
    '3xl': string;
    '4xl': string;
    '5xl': string;
    '6xl': string;
  };
  
  fontWeight: {
    thin: number;
    light: number;
    normal: number;
    medium: number;
    semibold: number;
    bold: number;
    extrabold: number;
  };
  
  lineHeight: {
    tight: number;
    normal: number;
    relaxed: number;
    loose: number;
  };
  
  letterSpacing: {
    tight: string;
    normal: string;
    wide: string;
  };
}

export interface Spacing {
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
  6: string;
  8: string;
  10: string;
  12: string;
  16: string;
  20: string;
  24: string;
  32: string;
  40: string;
  48: string;
  56: string;
  64: string;
}

export interface Breakpoints {
  sm: string;   // 640px
  md: string;   // 768px
  lg: string;   // 1024px
  xl: string;   // 1280px
  '2xl': string; // 1536px
}

export interface Shadows {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  xl: string;
  '2xl': string;
  inner: string;
}

export interface Borders {
  width: {
    0: string;
    1: string;
    2: string;
    4: string;
    8: string;
  };
  
  radius: {
    none: string;
    sm: string;
    md: string;
    lg: string;
    xl: string;
    full: string;
  };
}

export interface Transitions {
  duration: {
    75: string;
    100: string;
    150: string;
    200: string;
    300: string;
    500: string;
    700: string;
    1000: string;
  };
  
  timing: {
    linear: string;
    easeIn: string;
    easeOut: string;
    easeInOut: string;
  };
}

export interface ZIndexScale {
  0: number;
  10: number;
  20: number;
  30: number;
  40: number;
  50: number;
  dropdown: number;
  sticky: number;
  fixed: number;
  overlay: number;
  modal: number;
  popover: number;
  tooltip: number;
  toast: number;
}

// Button component types
export interface ButtonProps extends BaseComponentProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  color?: ButtonColor;
  loading?: boolean;
  loadingText?: string;
  leftIcon?: string;
  rightIcon?: string;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  onClick?: (_event: MouseEvent) => void;
  children?: unknown;
}

export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'link' | 'unstyled';
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ButtonColor = 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'gray';

// Input component types
export interface InputProps extends BaseComponentProps {
  type?: InputType;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  size?: InputSize;
  variant?: InputVariant;
  state?: InputState;
  leftAddon?: string;
  rightAddon?: string;
  leftIcon?: string;
  rightIcon?: string;
  helperText?: string;
  errorMessage?: string;
  required?: boolean;
  readOnly?: boolean;
  maxLength?: number;
  minLength?: number;
  pattern?: string;
  autoComplete?: string;
  autoFocus?: boolean;
  onChange?: (_value: string, _event: Event) => void;
  onFocus?: (_event: FocusEvent) => void;
  onBlur?: (_event: FocusEvent) => void;
  onKeyDown?: (_event: KeyboardEvent) => void;
}

export type InputType = 
  | 'text' 
  | 'email' 
  | 'password' 
  | 'number' 
  | 'tel' 
  | 'url' 
  | 'search' 
  | 'date' 
  | 'time' 
  | 'datetime-local';

export type InputSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type InputVariant = 'outline' | 'filled' | 'flushed' | 'unstyled';
export type InputState = 'default' | 'error' | 'success' | 'warning';

// Card component types
export interface CardProps extends BaseComponentProps {
  variant?: CardVariant;
  padding?: CardPadding;
  shadow?: CardShadow;
  bordered?: boolean;
  hoverable?: boolean;
  clickable?: boolean;
  loading?: boolean;
  children?: unknown;
  onClick?: (_event: MouseEvent) => void;
}

export type CardVariant = 'elevated' | 'outlined' | 'filled';
export type CardPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type CardShadow = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Modal component types
export interface ModalProps extends BaseComponentProps {
  open: boolean;
  size?: ModalSize;
  placement?: ModalPlacement;
  backdrop?: ModalBackdrop;
  closeOnEscape?: boolean;
  closeOnBackdrop?: boolean;
  showCloseButton?: boolean;
  lockScroll?: boolean;
  children?: unknown;
  onClose?: () => void;
  onOpen?: () => void;
}

export type ModalSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | 'full';
export type ModalPlacement = 'center' | 'top' | 'bottom' | 'left' | 'right';
export type ModalBackdrop = 'blur' | 'opaque' | 'transparent';

export interface ModalHeaderProps extends BaseComponentProps {
  children?: unknown;
}

export interface ModalBodyProps extends BaseComponentProps {
  children?: unknown;
}

export interface ModalFooterProps extends BaseComponentProps {
  children?: unknown;
}

// Toast/Notification component types
export interface ToastProps {
  id: string;
  title?: string;
  description?: string;
  type?: ToastType;
  duration?: number;
  dismissible?: boolean;
  position?: ToastPosition;
  action?: ToastAction;
  icon?: string | unknown;
  onDismiss?: (_id: string) => void;
}

export type ToastType = 'success' | 'error' | 'warning' | 'info' | 'loading';
export type ToastPosition = 
  | 'top-left' 
  | 'top-center' 
  | 'top-right' 
  | 'bottom-left' 
  | 'bottom-center' 
  | 'bottom-right';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

// Loading and skeleton types
export interface LoadingSpinnerProps extends BaseComponentProps {
  size?: LoadingSize;
  color?: string;
  thickness?: number;
  speed?: string;
}

export type LoadingSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface SkeletonProps extends BaseComponentProps {
  width?: string | number;
  height?: string | number;
  variant?: SkeletonVariant;
  animation?: SkeletonAnimation;
  lines?: number;
  spacing?: string;
}

export type SkeletonVariant = 'text' | 'rectangular' | 'circular' | 'rounded';
export type SkeletonAnimation = 'pulse' | 'wave' | 'none';

// Form and validation types
export interface FormFieldProps extends BaseComponentProps {
  label?: string;
  required?: boolean;
  description?: string;
  error?: string;
  success?: string;
  warning?: string;
  children?: unknown;
}

export interface FormValidation {
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  email?: boolean;
  url?: boolean;
  custom?: (_value: unknown) => string | null;
}

export interface FormFieldState {
  value: unknown;
  touched: boolean;
  error: string | null;
  valid: boolean;
}

export interface FormState {
  [fieldName: string]: FormFieldState;
}

// Layout component types
export interface ContainerProps extends BaseComponentProps {
  maxWidth?: ContainerMaxWidth;
  padding?: ContainerPadding;
  centered?: boolean;
  fluid?: boolean;
  children?: unknown;
}

export type ContainerMaxWidth = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl' | '7xl' | 'full';
export type ContainerPadding = 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl';

export interface FlexProps extends BaseComponentProps {
  direction?: FlexDirection;
  wrap?: FlexWrap;
  justify?: FlexJustify;
  align?: FlexAlign;
  gap?: FlexGap;
  children?: unknown;
}

export type FlexDirection = 'row' | 'row-reverse' | 'column' | 'column-reverse';
export type FlexWrap = 'nowrap' | 'wrap' | 'wrap-reverse';
export type FlexJustify = 'start' | 'end' | 'center' | 'between' | 'around' | 'evenly';
export type FlexAlign = 'start' | 'end' | 'center' | 'baseline' | 'stretch';
export type FlexGap = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | '12' | '16' | '20' | '24';

export interface GridProps extends BaseComponentProps {
  columns?: GridColumns;
  rows?: GridRows;
  gap?: GridGap;
  rowGap?: GridGap;
  columnGap?: GridGap;
  children?: unknown;
}

export type GridColumns = '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | '11' | '12' | 'none' | 'subgrid';
export type GridRows = '1' | '2' | '3' | '4' | '5' | '6' | 'none' | 'subgrid';
export type GridGap = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '8' | '10' | '12' | '16' | '20' | '24';

// Navigation component types
export interface NavbarProps extends BaseComponentProps {
  variant?: NavbarVariant;
  position?: NavbarPosition;
  bordered?: boolean;
  compact?: boolean;
  maxWidth?: ContainerMaxWidth;
  children?: unknown;
}

export type NavbarVariant = 'default' | 'floating' | 'sticky';
export type NavbarPosition = 'static' | 'sticky' | 'fixed';

export interface SidebarProps extends BaseComponentProps {
  open?: boolean;
  variant?: SidebarVariant;
  size?: SidebarSize;
  position?: SidebarPosition;
  backdrop?: boolean;
  closeOnSelect?: boolean;
  children?: unknown;
  onOpenChange?: (_open: boolean) => void;
}

export type SidebarVariant = 'default' | 'bordered' | 'compact';
export type SidebarSize = 'sm' | 'md' | 'lg' | 'xl';
export type SidebarPosition = 'left' | 'right';

// Table component types
export interface TableProps extends BaseComponentProps {
  variant?: TableVariant;
  size?: TableSize;
  striped?: boolean;
  bordered?: boolean;
  hoverable?: boolean;
  compact?: boolean;
  stickyHeader?: boolean;
  children?: unknown;
}

export type TableVariant = 'default' | 'unstyled';
export type TableSize = 'sm' | 'md' | 'lg';

export interface TableColumn<T = Record<string, unknown>> {
  key: string;
  label: string;
  width?: string | number;
  minWidth?: string | number;
  maxWidth?: string | number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  filterable?: boolean;
  render?: (_value: unknown, _record: T, _index: number) => unknown;
}

export interface TableData<T = Record<string, unknown>> {
  columns: TableColumn<T>[];
  rows: T[];
  loading?: boolean;
  empty?: unknown;
  pagination?: TablePagination;
  sorting?: TableSorting;
  filtering?: TableFiltering;
}

export interface TablePagination {
  page: number;
  pageSize: number;
  total: number;
  showSizeChanger?: boolean;
  showQuickJumper?: boolean;
  showTotal?: boolean;
  onPageChange?: (_page: number, _pageSize: number) => void;
}

export interface TableSorting {
  field?: string;
  direction?: 'asc' | 'desc';
  onSortChange?: (_field: string, _direction: 'asc' | 'desc') => void;
}

export interface TableFiltering {
  filters: Record<string, unknown>;
  onFilterChange?: (_field: string, _value: unknown) => void;
}

// Responsive design types
export interface ResponsiveValue<T> {
  base?: T;
  sm?: T;
  md?: T;
  lg?: T;
  xl?: T;
  '2xl'?: T;
}

export interface ViewportSize {
  width: number;
  height: number;
  breakpoint: keyof Breakpoints;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
}

// Animation and transition types
export interface AnimationConfig {
  duration?: number | string;
  delay?: number | string;
  easing?: string;
  fill?: 'none' | 'forwards' | 'backwards' | 'both';
  direction?: 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';
  iterations?: number | 'infinite';
}

export interface TransitionConfig {
  property?: string | string[];
  duration?: number | string;
  timing?: string;
  delay?: number | string;
}

// Icon and image types
export interface IconProps extends BaseComponentProps {
  name: string;
  size?: IconSize;
  color?: string;
  variant?: IconVariant;
  spin?: boolean;
  flip?: IconFlip;
  rotate?: IconRotate;
}

export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type IconVariant = 'outline' | 'solid' | 'mini';
export type IconFlip = 'horizontal' | 'vertical' | 'both';
export type IconRotate = 90 | 180 | 270;

export interface ImageProps extends BaseComponentProps {
  src: string;
  alt: string;
  width?: number | string;
  height?: number | string;
  aspectRatio?: string;
  objectFit?: 'contain' | 'cover' | 'fill' | 'none' | 'scale-down';
  loading?: 'lazy' | 'eager';
  placeholder?: string | unknown;
  fallback?: string | unknown;
  onLoad?: () => void;
  onError?: () => void;
}

// Accessibility types
export interface AccessibilityProps {
  role?: string;
  tabIndex?: number;
  'aria-label'?: string;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-expanded'?: boolean;
  'aria-hidden'?: boolean;
  'aria-disabled'?: boolean;
  'aria-required'?: boolean;
  'aria-invalid'?: boolean;
  'aria-checked'?: boolean;
  'aria-selected'?: boolean;
  'aria-pressed'?: boolean;
  'aria-live'?: 'off' | 'assertive' | 'polite';
  'aria-atomic'?: boolean;
  'aria-busy'?: boolean;
  'aria-controls'?: string;
  'aria-owns'?: string;
  'aria-haspopup'?: boolean | 'false' | 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
}

// Component state types
export interface ComponentState<T = unknown> {
  loading: boolean;
  error: string | null;
  data: T;
  initialized: boolean;
}

export interface InteractionState {
  hovered: boolean;
  focused: boolean;
  pressed: boolean;
  selected: boolean;
  disabled: boolean;
}

// Type guards and utilities
export function isResponsiveValue<T>(value: unknown): value is ResponsiveValue<T> {
  return typeof value === 'object' && value !== null && ('base' in value || 'sm' in value || 'md' in value || 'lg' in value);
}

export function isValidColorScale(colors: unknown): colors is ColorScale {
  if (typeof colors !== 'object' || colors === null) {
    return false;
  }
  const requiredKeys = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950'];
  return requiredKeys.every(key => key in colors && typeof (colors as Record<string, unknown>)[key] === 'string');
}

// Utility functions
export function getResponsiveValue<T>(
  value: T | ResponsiveValue<T>,
  breakpoint: keyof Breakpoints
): T {
  if (!isResponsiveValue(value)) {
    return value;
  }
  
  // Return the most specific breakpoint value, falling back to base
  const breakpointOrder: (keyof ResponsiveValue<T>)[] = ['2xl', 'xl', 'lg', 'md', 'sm', 'base'];
  const currentBreakpointIndex = breakpointOrder.indexOf(breakpoint);

  for (let i = currentBreakpointIndex; i < breakpointOrder.length; i++) {
    const bp = breakpointOrder[i];
    if (bp && value[bp] !== undefined) {
      return value[bp]!;
    }
  }

  return value.base!;
}

export function combineClassNames(...classes: (string | undefined | null | false)[]): string {
  return classes.filter(Boolean).join(' ');
}

export function createThemeVariables(theme: ThemeConfig): Record<string, string> {
  const variables: Record<string, string> = {};
  
  // Convert theme values to CSS custom properties
  Object.entries(theme.colors.primary).forEach(([key, value]) => {
    variables[`--color-primary-${key}`] = value;
  });
  
  Object.entries(theme.spacing).forEach(([key, value]) => {
    variables[`--spacing-${key}`] = value;
  });
  
  return variables;
}

export function generateComponentClasses(
  baseClass: string,
  variants: Record<string, Record<string, string>>,
  props: Record<string, string | undefined>
): string {
  const classes = [baseClass];

  Object.entries(variants).forEach(([key, value]) => {
    const propValue = props[key];
    if (propValue && value[propValue]) {
      classes.push(value[propValue]);
    }
  });

  if (props.className) {
    classes.push(props.className);
  }

  return classes.join(' ');
}

export function getContrastColor(backgroundColor: string): 'white' | 'black' {
  // Simple contrast calculation - in a real implementation, you'd use a proper algorithm
  const hex = backgroundColor.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  
  return brightness > 128 ? 'black' : 'white';
}

export function parseSize(size: string | number): { value: number; unit: string } {
  if (typeof size === 'number') {
    return { value: size, unit: 'px' };
  }
  
  const match = size.match(/^(\d+(?:\.\d+)?)(.*)$/);
  if (match) {
    return { value: parseFloat(match[1]!), unit: match[2]! || 'px' };
  }
  
  return { value: 0, unit: 'px' };
}