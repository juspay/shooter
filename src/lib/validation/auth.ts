/**
 * Authentication form validation schemas and utilities
 */

import type {
  LoginCredentials as LoginFormData,
  UserRegistration as RegistrationFormData
} from '$types';

// Form validation result type
export interface FormValidationResult<T = Record<string, string>, D = unknown> {
  isValid: boolean;
  errors: T;
  data?: D | undefined;
}

// Form-specific error interfaces
export interface LoginFormErrors {
  username?: string;
  password?: string;
  general?: string;
}

export interface ChangePasswordFormData {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

export interface ChangePasswordFormErrors {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
  general?: string;
}

export interface RegistrationFormErrors {
  username?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
  general?: string;
}

// Re-export centralized types
export type { LoginFormData, RegistrationFormData };

/**
 * Validate login form data
 */
export function validateLoginForm(data: Partial<LoginFormData>): FormValidationResult<LoginFormErrors> {
  const errors: LoginFormErrors = {};
  let isValid = true;

  // Username validation
  if (!data.username || data.username.trim().length === 0) {
    errors.username = 'Username is required';
    isValid = false;
  } else if (data.username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters long';
    isValid = false;
  } else if (data.username.trim().length > 50) {
    errors.username = 'Username must be less than 50 characters';
    isValid = false;
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(data.username.trim())) {
    errors.username = 'Username can only contain letters, numbers, dots, hyphens, and underscores';
    isValid = false;
  }

  // Password validation
  if (!data.password || data.password.length === 0) {
    errors.password = 'Password is required';
    isValid = false;
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters long';
    isValid = false;
  } else if (data.password.length > 128) {
    errors.password = 'Password must be less than 128 characters';
    isValid = false;
  }

  return {
    isValid,
    errors,
    data: isValid
      ? {
          username: data.username?.trim(),
          password: data.password,
          remember: data.remember || false
        }
      : undefined
  };
}

/**
 * Validate change password form data
 */
export function validateChangePasswordForm(
  data: Partial<ChangePasswordFormData>
): FormValidationResult<ChangePasswordFormErrors> {
  const errors: ChangePasswordFormErrors = {};
  let isValid = true;

  // Current password validation
  if (!data.currentPassword || data.currentPassword.length === 0) {
    errors.currentPassword = 'Current password is required';
    isValid = false;
  }

  // New password validation
  if (!data.newPassword || data.newPassword.length === 0) {
    errors.newPassword = 'New password is required';
    isValid = false;
  } else if (data.newPassword.length < 8) {
    errors.newPassword = 'New password must be at least 8 characters long';
    isValid = false;
  } else if (data.newPassword.length > 128) {
    errors.newPassword = 'New password must be less than 128 characters';
    isValid = false;
  } else {
    // Password strength validation
    const strengthChecks = {
      hasLowercase: /[a-z]/.test(data.newPassword),
      hasUppercase: /[A-Z]/.test(data.newPassword),
      hasNumbers: /\d/.test(data.newPassword),
      hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(data.newPassword)
    };

    const passedChecks = Object.values(strengthChecks).filter(Boolean).length;
    if (passedChecks < 3) {
      errors.newPassword =
        'Password must contain at least 3 of: lowercase, uppercase, numbers, special characters';
      isValid = false;
    }

    // Check for same as current password
    if (data.currentPassword && data.newPassword === data.currentPassword) {
      errors.newPassword = 'New password must be different from current password';
      isValid = false;
    }
  }

  // Confirm password validation
  if (!data.confirmPassword || data.confirmPassword.length === 0) {
    errors.confirmPassword = 'Please confirm your new password';
    isValid = false;
  } else if (data.newPassword && data.confirmPassword !== data.newPassword) {
    errors.confirmPassword = 'Passwords do not match';
    isValid = false;
  }

  return {
    isValid,
    errors,
    data: isValid
      ? {
          currentPassword: data.currentPassword,
          newPassword: data.newPassword,
          confirmPassword: data.confirmPassword
        }
      : undefined
  };
}

/**
 * Validate registration form data
 */
export function validateRegistrationForm(
  data: Partial<RegistrationFormData>
): FormValidationResult<RegistrationFormErrors> {
  const errors: RegistrationFormErrors = {};
  let isValid = true;

  // Username validation
  if (!data.username || data.username.trim().length === 0) {
    errors.username = 'Username is required';
    isValid = false;
  } else if (data.username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters long';
    isValid = false;
  } else if (data.username.trim().length > 50) {
    errors.username = 'Username must be less than 50 characters';
    isValid = false;
  } else if (!/^[a-zA-Z0-9_.-]+$/.test(data.username.trim())) {
    errors.username = 'Username can only contain letters, numbers, dots, hyphens, and underscores';
    isValid = false;
  }

  // Email validation
  if (!data.email || data.email.trim().length === 0) {
    errors.email = 'Email is required';
    isValid = false;
  } else {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email.trim())) {
      errors.email = 'Please enter a valid email address';
      isValid = false;
    } else if (data.email.trim().length > 254) {
      errors.email = 'Email must be less than 254 characters';
      isValid = false;
    }
  }

  // Password validation
  if (!data.password || data.password.length === 0) {
    errors.password = 'Password is required';
    isValid = false;
  } else if (data.password.length < 8) {
    errors.password = 'Password must be at least 8 characters long';
    isValid = false;
  } else if (data.password.length > 128) {
    errors.password = 'Password must be less than 128 characters';
    isValid = false;
  } else {
    // Password strength validation
    const strengthChecks = {
      hasLowercase: /[a-z]/.test(data.password),
      hasUppercase: /[A-Z]/.test(data.password),
      hasNumbers: /\d/.test(data.password),
      hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(data.password)
    };

    const passedChecks = Object.values(strengthChecks).filter(Boolean).length;
    if (passedChecks < 3) {
      errors.password =
        'Password must contain at least 3 of: lowercase, uppercase, numbers, special characters';
      isValid = false;
    }
  }

  // Confirm password validation
  if (!data.confirmPassword || data.confirmPassword.length === 0) {
    errors.confirmPassword = 'Please confirm your password';
    isValid = false;
  } else if (data.password && data.confirmPassword !== data.password) {
    errors.confirmPassword = 'Passwords do not match';
    isValid = false;
  }

  return {
    isValid,
    errors,
    data: isValid
      ? {
          username: data.username?.trim(),
          email: data.email?.trim().toLowerCase(),
          password: data.password,
          confirmPassword: data.confirmPassword
        }
      : undefined
  };
}

/**
 * Sanitize form input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>'"]/g, '') // Remove potentially dangerous characters
    .substring(0, 1000); // Limit length
}

/**
 * Rate limiting check for login attempts
 */
export class LoginRateLimit {
  private attempts = new Map<string, { count: number; lastAttempt: number }>();
  private readonly maxAttempts = 5;
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes

  isRateLimited(identifier: string): boolean {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier);

    if (!userAttempts) {
      return false;
    }

    // Reset if window has passed
    if (now - userAttempts.lastAttempt > this.windowMs) {
      this.attempts.delete(identifier);
      return false;
    }

    return userAttempts.count >= this.maxAttempts;
  }

  recordAttempt(identifier: string): void {
    const now = Date.now();
    const userAttempts = this.attempts.get(identifier);

    if (!userAttempts || now - userAttempts.lastAttempt > this.windowMs) {
      this.attempts.set(identifier, { count: 1, lastAttempt: now });
    } else {
      userAttempts.count++;
      userAttempts.lastAttempt = now;
    }
  }

  getRemainingTime(identifier: string): number {
    const userAttempts = this.attempts.get(identifier);
    if (!userAttempts) {
return 0;
}

    const timeLeft = this.windowMs - (Date.now() - userAttempts.lastAttempt);
    return Math.max(0, timeLeft);
  }

  reset(identifier: string): void {
    this.attempts.delete(identifier);
  }
}

// Global rate limiter instance
export const loginRateLimit = new LoginRateLimit();
