// Retry utility with exponential backoff for APNs and other services

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (_attempt: number, _error: Error) => void;
}

const defaultOptions: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
  onRetry: () => {}
};

/**
 * Retry a function with exponential backoff
 * @param fn Function to retry
 * @param options Retry configuration
 * @returns Promise with the result of the function
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultOptions, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt === opts.maxAttempts) {
        throw lastError;
      }

      // Call retry callback
      opts.onRetry(attempt, lastError);

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelay * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelay
      );

      console.log(`⏳ Retry attempt ${attempt}/${opts.maxAttempts} after ${delay}ms delay...`);

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

/**
 * Check if an error is retryable
 * @param error Error to check
 * @returns true if error should be retried
 */
export function isRetryableError(error: unknown): boolean {
  if (!(error instanceof Error)) {
return false;
}

  const message = error.message.toLowerCase();

  // Network errors that should be retried
  const retryableErrors = [
    'econnrefused',
    'econnreset',
    'etimedout',
    'enotfound',
    'network',
    'timeout',
    'socket hang up',
    'epipe'
  ];

  return retryableErrors.some(retryable => message.includes(retryable));
}

/**
 * Circuit breaker pattern for APNs connection
 */
export class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';

  constructor(
    private _failureThreshold: number = 5,
    private _resetTimeout: number = 60000 // 1 minute
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if we should try half-open
      if (Date.now() - this.lastFailureTime > this._resetTimeout) {
        console.log('🔄 Circuit breaker: Attempting half-open state');
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open - service temporarily unavailable');
      }
    }

    try {
      const result = await fn();

      // Success - reset circuit breaker
      if (this.state === 'half-open') {
        console.log('✅ Circuit breaker: Resetting to closed state');
      }
      this.failures = 0;
      this.state = 'closed';

      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();

      if (this.failures >= this._failureThreshold) {
        console.error(`❌ Circuit breaker: Opening circuit after ${this.failures} failures`);
        this.state = 'open';
      }

      throw error;
    }
  }

  getState(): 'closed' | 'open' | 'half-open' {
    return this.state;
  }

  getFailureCount(): number {
    return this.failures;
  }

  reset(): void {
    this.failures = 0;
    this.state = 'closed';
    console.log('🔄 Circuit breaker manually reset');
  }
}
