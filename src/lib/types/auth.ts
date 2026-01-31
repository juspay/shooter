/**
 * Authentication and User Management Types
 * Comprehensive type definitions for authentication system
 */

// User related types
export interface User {
  id: string;
  username: string;
  email?: string | undefined;
  displayName?: string | undefined;
  avatar?: string | undefined;
  role: UserRole;
  permissions: UserPermissions;
  isActive: boolean;
  lastLoginAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  updated?: Date | undefined; // Backward compatibility alias for updatedAt
  preferences?: UserPreferences | undefined;
  metadata?: Record<string, unknown> | undefined;

  // Auth-related properties (server-side only)
  passwordHash?: string | undefined;
  salt?: string | undefined;
  loginAttempts?: number | undefined;
  lockedUntil: Date | null | undefined;

  // Device management
  devices?: string[] | undefined; // Array of device IDs
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: NotificationPreferences;
  language: string;
  timezone: string;
  dashboard: DashboardPreferences;
}

export interface NotificationPreferences {
  email: boolean;
  push: boolean;
  desktop: boolean;
  sound: boolean;
  types: {
    system: boolean;
    security: boolean;
    updates: boolean;
    mentions: boolean;
  };
}

export interface DashboardPreferences {
  layout: 'grid' | 'list';
  density: 'compact' | 'comfortable' | 'spacious';
  widgets: string[];
  refreshInterval: number; // in seconds
}

export type UserRole = 'admin' | 'user' | 'viewer' | 'service';

export interface UserPermissions {
  // System management
  manageUsers: boolean;
  manageSystem: boolean;
  viewLogs: boolean;
  configureSystem: boolean;
  
  // Analytics and monitoring
  accessAnalytics: boolean;
  viewReports: boolean;
  exportData: boolean;
  
  // Integration management
  manageIntegrations: boolean;
  manageWebhooks: boolean;
  manageApiKeys: boolean;
  
  // Notification management
  sendNotifications: boolean;
  manageNotifications: boolean;
  viewNotificationHistory: boolean;
  
  // Security
  changeOwnPassword: boolean;
  manageOthersPasswords: boolean;
  viewAuditLogs: boolean;
  
  // Custom permissions
  custom?: Record<string, boolean> | undefined;
}

// Client-side authentication state
export interface AuthState {
  isAuthenticated: boolean;
  user: User | null;
  isLoading: boolean;
  error: string | null;
}

// Authentication session types
export interface Session {
  id: string;
  userId: string;
  token: string;
  refreshToken?: string;
  expiresAt: Date;
  createdAt: Date;
  lastAccessAt: Date;
  deviceInfo?: DeviceInfo;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  metadata?: SessionMetadata;
}

export interface DeviceInfo {
  type: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  os?: string;
  browser?: string;
  version?: string;
  isTrusted: boolean;
}

export interface SessionMetadata {
  loginMethod: 'password' | 'token' | 'sso';
  mfa?: boolean;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  riskScore?: number;
}

// Authentication request/response types
export interface LoginRequest {
  username: string;
  password: string;
  remember?: boolean;
  deviceFingerprint?: string;
  captcha?: string;
}

export interface LoginResponse {
  success: boolean;
  user?: User;
  session?: Pick<Session, 'id' | 'token' | 'expiresAt'>;
  message?: string;
  redirectUrl?: string;
  requiresMFA?: boolean;
  error?: AuthError;
}

export interface RegisterRequest {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
  displayName?: string;
  inviteCode?: string;
}

export interface RegisterResponse {
  success: boolean;
  user?: Omit<User, 'permissions'>;
  message?: string;
  requiresVerification?: boolean;
  error?: AuthError;
}

export interface PasswordChangeRequest {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  logoutOtherSessions?: boolean;
}

export interface PasswordResetRequest {
  username?: string;
  email?: string;
  captcha?: string;
}

export interface PasswordResetConfirmRequest {
  token: string;
  newPassword: string;
  confirmPassword: string;
}

// Authentication validation types
export interface AuthValidationResult {
  success: boolean;
  user?: User | undefined;
  session?: Session | undefined;
  payload?: JWTPayload | undefined;
  error?: AuthError | undefined;
  warnings?: string[] | undefined;
}

export interface TokenValidation {
  valid: boolean;
  expired: boolean;
  payload?: JWTPayload;
  error?: string;
}

export interface JWTPayload {
  sub: string; // user id
  iat: number; // issued at
  exp: number; // expires at
  jti: string; // session id
  aud: string; // audience
  iss: string; // issuer
  scope?: string[];
  permissions?: UserPermissions;
  sessionMetadata?: SessionMetadata;

  // Backward compatibility properties
  userId?: string; // Alias for sub
  username?: string;
  role?: UserRole;
}

// Authentication error types
export interface AuthError {
  code: AuthErrorCode;
  message: string;
  details?: string | undefined;
  field?: string | undefined;
  timestamp: Date;
  requestId?: string | undefined;
}

export type AuthErrorCode = 
  // Authentication errors
  | 'INVALID_CREDENTIALS'
  | 'USER_NOT_FOUND'
  | 'USER_DISABLED'
  | 'USER_LOCKED'
  | 'SESSION_EXPIRED'
  | 'SESSION_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'TOKEN_MALFORMED'
  
  // Authorization errors
  | 'INSUFFICIENT_PERMISSIONS'
  | 'ACCESS_DENIED'
  | 'ROLE_REQUIRED'
  
  // Validation errors
  | 'MISSING_CREDENTIALS'
  | 'WEAK_PASSWORD'
  | 'PASSWORD_MISMATCH'
  | 'USERNAME_TAKEN'
  | 'EMAIL_TAKEN'
  | 'INVALID_EMAIL'
  | 'INVALID_USERNAME'
  
  // Rate limiting and security
  | 'RATE_LIMITED'
  | 'TOO_MANY_ATTEMPTS'
  | 'SUSPICIOUS_ACTIVITY'
  | 'CAPTCHA_REQUIRED'
  | 'CAPTCHA_INVALID'
  
  // System errors
  | 'SERVER_ERROR'
  | 'SERVICE_UNAVAILABLE'
  | 'DATABASE_ERROR'
  | 'NETWORK_ERROR';

// Authentication configuration types
export interface AuthConfig {
  // JWT settings
  jwt: {
    secret: string;
    algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256';
    expiresIn: number; // seconds
    refreshExpiresIn: number; // seconds
    issuer: string;
    audience: string;
  };
  
  // Session settings
  session: {
    maxDuration: number; // seconds (30 days default)
    slidingExpiration: boolean;
    maxConcurrentSessions: number;
    secureCookies: boolean;
    sameSite: 'strict' | 'lax' | 'none';
    domain?: string;
  };
  
  // Password policy
  password: {
    minLength: number;
    maxLength: number;
    requireUppercase: boolean;
    requireLowercase: boolean;
    requireNumbers: boolean;
    requireSymbols: boolean;
    preventReuse: number; // number of previous passwords to remember
    maxAge: number; // seconds before forced change
  };
  
  // Security settings
  security: {
    maxLoginAttempts: number;
    lockoutDuration: number; // seconds
    requireEmailVerification: boolean;
    enableMFA: boolean;
    passwordResetTokenExpiry: number; // seconds
    sessionTimeout: number; // seconds of inactivity
  };
  
  // Registration settings
  registration: {
    enabled: boolean;
    requireInvite: boolean;
    defaultRole: UserRole;
    autoActivate: boolean;
    emailVerificationRequired: boolean;
  };
}

// Middleware types
export interface AuthMiddlewareOptions {
  requireAuth?: boolean;
  requiredRole?: UserRole;
  requiredPermissions?: (keyof UserPermissions)[];
  allowAnonymous?: boolean;
  redirectTo?: string;
}

// Authentication event types
export interface AuthEvent {
  type: AuthEventType;
  userId?: string;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  error?: AuthError;
}

export type AuthEventType = 
  | 'login_attempt'
  | 'login_success'
  | 'login_failure'
  | 'logout'
  | 'session_created'
  | 'session_expired'
  | 'session_revoked'
  | 'password_changed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'user_registered'
  | 'user_activated'
  | 'user_deactivated'
  | 'permissions_changed'
  | 'suspicious_activity'
  | 'account_locked'
  | 'account_unlocked';

// JWT Service Types
export interface JWTResult {
  success: boolean;
  token?: string | undefined;
  expiresAt?: Date | undefined;
  expiresIn?: string | undefined;
  error?: string | undefined;
}

export interface JWTVerifyResult {
  success: boolean;
  payload?: JWTPayload & { exp?: number; iat?: number } | undefined;
  issuedAt?: Date | undefined;
  expiresAt?: Date | undefined;
  error?: string | undefined;
}

// Crypto Service Types
export interface GenerateSaltResult {
  success: boolean;
  salt?: string | undefined;
  error?: string | undefined;
}

export interface HashResult {
  success: boolean;
  hash?: string | undefined;
  salt?: string | undefined;
  iterations?: number | undefined;
  algorithm?: string | undefined;
  error?: string | undefined;
}

export interface VerifyPasswordResult {
  success: boolean;
  isValid: boolean;
  error?: string | undefined;
}

// Auth Service Types
export interface LoginCredentials {
  username: string;
  password: string;
  remember?: boolean;
}

export interface LoginResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    email?: string | undefined;
    role: UserRole;
  } | undefined;
  token?: string | undefined;
  expiresAt?: Date | undefined;
  sessionId?: string | undefined;
  error?: string | undefined;
}

export interface SessionData {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  token: string;
  createdAt: Date;
  expiresAt: Date;
  isActive: boolean;
  ipAddress: string | null;
  userAgent: string | null;
}

export interface UserRegistration {
  username: string;
  password: string;
  confirmPassword: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
}

export interface RegistrationResult {
  success: boolean;
  user?: {
    id: string;
    username: string;
    email?: string | undefined;
    role: UserRole;
  } | undefined;
  error?: string | undefined;
  details?: string | undefined;
}

// Authentication store types (for frontend)
export interface AuthStore {
  user: User | null;
  session: Pick<Session, 'id' | 'token' | 'expiresAt'> | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  permissions: UserPermissions | null;
  error: AuthError | null;
  lastActivity: Date | null;
}

export interface AuthActions {
  login: (_credentials: LoginRequest) => Promise<LoginResponse>;
  logout: () => Promise<void>;
  register: (_userData: RegisterRequest) => Promise<RegisterResponse>;
  changePassword: (_passwordData: PasswordChangeRequest) => Promise<{ success: boolean; error?: AuthError }>;
  validateSession: () => Promise<AuthValidationResult>;
  refreshToken: () => Promise<{ success: boolean; error?: AuthError }>;
  updateProfile: (_updates: Partial<User>) => Promise<{ success: boolean; error?: AuthError }>;
  updatePreferences: (_preferences: Partial<UserPreferences>) => Promise<{ success: boolean; error?: AuthError }>;
}

// Type guards
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isUser(obj: any): obj is User {
  return obj && typeof obj.id === 'string' && typeof obj.username === 'string' && typeof obj.role === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSession(obj: any): obj is Session {
  return obj && typeof obj.id === 'string' && typeof obj.userId === 'string' && typeof obj.token === 'string';
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isAuthError(obj: any): obj is AuthError {
  return obj && typeof obj.code === 'string' && typeof obj.message === 'string';
}

export function hasPermission(user: User | null, permission: keyof UserPermissions): boolean {
  return user?.permissions?.[permission] === true;
}

export function hasRole(user: User | null, role: UserRole): boolean {
  return user?.role === role;
}

export function hasAnyRole(user: User | null, roles: UserRole[]): boolean {
  return user ? roles.includes(user.role) : false;
}