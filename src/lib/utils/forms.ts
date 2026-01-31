/**
 * Form handling utilities for Svelte applications
 */

/**
 * Form field value types
 */
export type FormFieldValue = string | number | boolean | File | null;

/**
 * Form data structure with typed field values
 */
export type FormDataRecord = Record<string, FormFieldValue>;

/**
 * Extract form data from FormData object
 */
export function extractFormData<T extends FormDataRecord>(
  formData: FormData,
  fields: (keyof T)[]
): Partial<T> {
  const data: Partial<T> = {};

  for (const field of fields) {
    const value = formData.get(field as string);
    if (value !== null) {
      // Handle checkboxes and booleans
      const typedData = data as Record<keyof T, FormFieldValue>;
      if (value === 'on' || value === 'true') {
        typedData[field] = true;
      } else if (value === 'false') {
        typedData[field] = false;
      } else {
        typedData[field] = value.toString().trim();
      }
    }
  }

  return data;
}

/**
 * Create a form submission handler with validation
 */
export function createFormHandler<TData extends FormDataRecord, TErrors>(
  validateFn: (_data: Partial<TData>) => { isValid: boolean; errors: TErrors; data?: TData },
  submitFn: (_data: TData) => Promise<{ success: boolean; error?: string }>,
  onSuccess?: (_data: TData) => void,
  onError?: (_errors: TErrors, _generalError?: string) => void
) {
  return async (event: SubmitEvent) => {
    event.preventDefault();

    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);

    // Extract all form fields
    const fields = Array.from(form.elements)
      .filter(
        (element): element is HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement =>
          element instanceof HTMLInputElement ||
          element instanceof HTMLSelectElement ||
          element instanceof HTMLTextAreaElement
      )
      .map(element => element.name)
      .filter(name => name.length > 0);

    const data = extractFormData<TData>(formData, fields as (keyof TData)[]);

    // Validate
    const validation = validateFn(data);
    if (!validation.isValid) {
      onError?.(validation.errors);
      return;
    }

    // Submit
    try {
      const result = await submitFn(validation.data!);
      if (result.success) {
        onSuccess?.(validation.data!);
      } else {
        onError?.(validation.errors, result.error);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'An unexpected error occurred';
      onError?.(validation.errors, errorMessage);
    }
  };
}

/**
 * Debounce function for real-time validation
 */
export function debounce<T extends (..._args: readonly unknown[]) => unknown>(
  func: T,
  delay: number
): (..._args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;

  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func(...args), delay);
  };
}

/**
 * Focus management for forms
 */
export function focusFirstError(formElement: HTMLFormElement): void {
  const firstErrorField = formElement.querySelector('[aria-invalid="true"]') as HTMLElement;
  if (firstErrorField) {
    firstErrorField.focus();
  }
}

/**
 * Get client IP for rate limiting (best effort)
 */
export function getClientIdentifier(request: Request): string {
  // Try various headers for client identification
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }

  const realIP = request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const userAgent = request.headers.get('user-agent') || '';
  // Fallback to a hash of user agent for basic rate limiting
  return `ua_${btoa(userAgent).substring(0, 16)}`;
}

/**
 * Enhance form with loading states and error handling
 */
export function enhanceForm(form: HTMLFormElement) {
  const submitButton = form.querySelector('[type="submit"]') as HTMLButtonElement;
  const originalSubmitText = submitButton?.textContent || 'Submit';

  return {
    setLoading(loading: boolean) {
      if (submitButton) {
        submitButton.disabled = loading;
        submitButton.textContent = loading ? 'Loading...' : originalSubmitText;
      }

      // Disable all form inputs while loading
      const inputs = form.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        (input as HTMLInputElement).disabled = loading;
      });
    },

    setFieldError(fieldName: string, error: string) {
      const field = form.querySelector(`[name="${fieldName}"]`) as HTMLInputElement;
      const errorElement = form.querySelector(`[data-error-for="${fieldName}"]`) as HTMLElement;

      if (field) {
        field.setAttribute('aria-invalid', 'true');
        field.classList.add('error');
      }

      if (errorElement) {
        errorElement.textContent = error;
        errorElement.style.display = 'block';
      }
    },

    clearFieldError(fieldName: string) {
      const field = form.querySelector(`[name="${fieldName}"]`) as HTMLInputElement;
      const errorElement = form.querySelector(`[data-error-for="${fieldName}"]`) as HTMLElement;

      if (field) {
        field.removeAttribute('aria-invalid');
        field.classList.remove('error');
      }

      if (errorElement) {
        errorElement.textContent = '';
        errorElement.style.display = 'none';
      }
    },

    clearAllErrors() {
      const errorElements = form.querySelectorAll('[data-error-for]') as NodeListOf<HTMLElement>;
      const errorFields = form.querySelectorAll(
        '[aria-invalid="true"]'
      ) as NodeListOf<HTMLInputElement>;

      errorElements.forEach(element => {
        element.textContent = '';
        element.style.display = 'none';
      });

      errorFields.forEach(field => {
        field.removeAttribute('aria-invalid');
        field.classList.remove('error');
      });
    },

    setGeneralError(error: string) {
      const generalErrorElement = form.querySelector('[data-general-error]') as HTMLElement;
      if (generalErrorElement) {
        generalErrorElement.textContent = error;
        generalErrorElement.style.display = 'block';
      }
    },

    clearGeneralError() {
      const generalErrorElement = form.querySelector('[data-general-error]') as HTMLElement;
      if (generalErrorElement) {
        generalErrorElement.textContent = '';
        generalErrorElement.style.display = 'none';
      }
    }
  };
}

/**
 * Password strength indicator
 */
export function getPasswordStrength(password: string): {
  score: number;
  label: string;
  color: string;
  feedback: string[];
} {
  const feedback: string[] = [];
  let score = 0;

  if (password.length >= 8) {
score += 1;
} else {
feedback.push('Use at least 8 characters');
}

  if (/[a-z]/.test(password)) {
score += 1;
} else {
feedback.push('Add lowercase letters');
}

  if (/[A-Z]/.test(password)) {
score += 1;
} else {
feedback.push('Add uppercase letters');
}

  if (/[0-9]/.test(password)) {
score += 1;
} else {
feedback.push('Add numbers');
}

  if (/[^a-zA-Z0-9]/.test(password)) {
score += 1;
} else {
feedback.push('Add special characters');
}

  // Bonus points
  if (password.length >= 12) {
score += 1;
}
  if (!/(.)\1{2,}/.test(password)) {
score += 1;
} // No repeated characters

  const strengthMap = [
    { label: 'Very Weak', color: '#ef4444' },
    { label: 'Weak', color: '#f97316' },
    { label: 'Fair', color: '#eab308' },
    { label: 'Good', color: '#22c55e' },
    { label: 'Strong', color: '#16a34a' },
    { label: 'Very Strong', color: '#15803d' }
  ];

  const strength = Math.min(score, 5);

  return {
    score: strength,
    label: strengthMap[strength]!.label,
    color: strengthMap[strength]!.color,
    feedback
  };
}
