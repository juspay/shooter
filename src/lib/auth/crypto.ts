import { createHash, randomBytes, pbkdf2Sync, timingSafeEqual } from 'crypto';
import type { HashResult, VerifyPasswordResult, GenerateSaltResult } from '$types/auth';

export class CryptoService {
  // PBKDF2 configuration
  private readonly iterations = 100000; // OWASP recommended minimum
  private readonly keyLength = 64; // 512 bits
  private readonly algorithm = 'sha512';
  private readonly saltLength = 32; // 256 bits

  /**
   * Generate a cryptographically secure random salt
   */
  generateSalt(): GenerateSaltResult {
    try {
      const salt = randomBytes(this.saltLength);
      return {
        success: true,
        salt: salt.toString('hex')
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      return {
        success: false,
        error: `Failed to generate salt: ${errorMessage}`
      };
    }
  }

  /**
   * Hash a password using PBKDF2 with secure defaults
   */
  hashPassword(password: string, salt?: string): HashResult {
    try {
      if (!password || password.length === 0) {
        return {
          success: false,
          error: 'Password is required'
        };
      }

      if (password.length < 8) {
        return {
          success: false,
          error: 'Password must be at least 8 characters long'
        };
      }

      // Generate salt if not provided
      let finalSalt = salt;
      if (!finalSalt) {
        const saltResult = this.generateSalt();
        if (!saltResult.success) {
          return {
            success: false,
            error: saltResult.error
          };
        }
        finalSalt = saltResult.salt!;
      }

      // Convert hex salt to buffer
      const saltBuffer = Buffer.from(finalSalt, 'hex');

      // Hash password with PBKDF2
      const hashBuffer = pbkdf2Sync(
        password,
        saltBuffer,
        this.iterations,
        this.keyLength,
        this.algorithm
      );

      const hash = hashBuffer.toString('hex');

      return {
        success: true,
        hash,
        salt: finalSalt,
        iterations: this.iterations,
        algorithm: this.algorithm
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      return {
        success: false,
        error: `Password hashing failed: ${errorMessage}`
      };
    }
  }

  /**
   * Verify a password against a stored hash using timing-safe comparison
   */
  verifyPassword(password: string, storedHash: string, salt: string): VerifyPasswordResult {
    try {
      if (!password || !storedHash || !salt) {
        return {
          success: false,
          isValid: false,
          error: 'Password, hash, and salt are required'
        };
      }

      // Hash the provided password with the stored salt
      const hashResult = this.hashPassword(password, salt);

      if (!hashResult.success) {
        return {
          success: false,
          isValid: false,
          error: hashResult.error
        };
      }

      // Convert hex strings to buffers for timing-safe comparison
      const providedHashBuffer = Buffer.from(hashResult.hash!, 'hex');
      const storedHashBuffer = Buffer.from(storedHash, 'hex');

      // Perform timing-safe comparison
      const isValid =
        providedHashBuffer.length === storedHashBuffer.length &&
        timingSafeEqual(providedHashBuffer, storedHashBuffer);

      return {
        success: true,
        isValid
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      return {
        success: false,
        isValid: false,
        error: `Password verification failed: ${errorMessage}`
      };
    }
  }

  /**
   * Generate a secure random token for session IDs, CSRF tokens, etc.
   */
  generateSecureToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate a cryptographically secure random string for API keys
   */
  generateApiKey(length: number = 48): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const bytes = randomBytes(length);

    for (let i = 0; i < length; i++) {
      result += chars[bytes[i]! % chars.length];
    }

    return result;
  }

  /**
   * Create a SHA-256 hash of a string (for checksums, etc.)
   */
  sha256(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create a HMAC-SHA256 hash with a secret key
   */
  hmacSha256(data: string, secret: string): string {
    return createHash('sha256')
      .update(data + secret)
      .digest('hex');
  }

  /**
   * Validate password strength
   */
  validatePasswordStrength(password: string): {
    isValid: boolean;
    score: number;
    feedback: string[];
  } {
    const feedback: string[] = [];
    let score = 0;

    if (password.length < 8) {
      feedback.push('Password must be at least 8 characters long');
    } else if (password.length >= 12) {
      score += 2;
    } else {
      score += 1;
    }

    if (/[a-z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain uppercase letters');
    }

    if (/[0-9]/.test(password)) {
      score += 1;
    } else {
      feedback.push('Password should contain numbers');
    }

    if (/[^a-zA-Z0-9]/.test(password)) {
      score += 2;
    } else {
      feedback.push('Password should contain special characters');
    }

    // Check for common patterns
    if (/(.)\1{2,}/.test(password)) {
      score -= 1;
      feedback.push('Avoid repeating characters');
    }

    if (
      /(?:012|123|234|345|456|567|678|789|890|abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(
        password
      )
    ) {
      score -= 1;
      feedback.push('Avoid sequential characters');
    }

    const isValid = score >= 4 && password.length >= 8;

    return {
      isValid,
      score: Math.max(0, Math.min(5, score)),
      feedback
    };
  }

  /**
   * Generate a secure backup code (for 2FA recovery)
   */
  generateBackupCode(): string {
    // Generate 8-digit backup code
    const code = randomBytes(4).toString('hex').toUpperCase();
    return code.match(/.{2}/g)?.join('-') || code;
  }

  /**
   * Generate multiple backup codes
   */
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(this.generateBackupCode());
    }
    return codes;
  }

  /**
   * Constant-time string comparison to prevent timing attacks
   */
  constantTimeCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);

    return timingSafeEqual(bufferA, bufferB);
  }
}
