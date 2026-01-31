import jwt, { type Algorithm } from 'jsonwebtoken';
import { config } from '$lib/config';
import type { JWTPayload, JWTResult, JWTVerifyResult } from '$types/auth';

export class JWTService {
  private readonly secret: string;
  private readonly expiresIn: string;
  private readonly algorithm: Algorithm = 'HS256';

  constructor() {
    this.secret = config.auth.jwtSecret;
    this.expiresIn = config.auth.expiresIn; // Default: 30d

    if (!this.secret) {
      throw new Error('JWT_SECRET is required but not provided');
    }

    if (this.secret.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long');
    }
  }

  /**
   * Generate a JWT token with 30-day expiration
   */
  generateToken(payload: JWTPayload): JWTResult {
    try {
      const now = Math.floor(Date.now() / 1000);

      const tokenPayload = {
        ...payload,
        iat: now,
        iss: 'shooter-dashboard',
        aud: 'shooter-users'
      };

      const token = jwt.sign(tokenPayload, this.secret, {
        algorithm: this.algorithm,
        expiresIn: this.expiresIn
      } as jwt.SignOptions);

      // Calculate expiration time based on expiresIn
      const expirationTime = now + (30 * 24 * 60 * 60); // 30 days in seconds

      return {
        success: true,
        token,
        expiresAt: new Date(expirationTime * 1000),
        expiresIn: this.expiresIn
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';

      return {
        success: false,
        error: `Failed to generate JWT token: ${errorMessage}`
      };
    }
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): JWTVerifyResult {
    try {
      if (!token) {
        return {
          success: false,
          error: 'Token is required'
        };
      }

      // Remove 'Bearer ' prefix if present
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;

      const decoded = jwt.verify(cleanToken, this.secret, {
        algorithms: [this.algorithm],
        issuer: 'shooter-dashboard',
        audience: 'shooter-users'
      }) as JWTPayload & jwt.JwtPayload;

      // Check if token is expired (extra safety check)
      if (decoded.exp && decoded.exp < Math.floor(Date.now() / 1000)) {
        return {
          success: false,
          error: 'Token has expired'
        };
      }

      return {
        success: true,
        payload: decoded,
        issuedAt: decoded.iat ? new Date(decoded.iat * 1000) : undefined,
        expiresAt: decoded.exp ? new Date(decoded.exp * 1000) : undefined
      };
    } catch (error: unknown) {
      if (error instanceof jwt.TokenExpiredError) {
        return {
          success: false,
          error: 'Token has expired'
        };
      }

      if (error instanceof jwt.JsonWebTokenError) {
        return {
          success: false,
          error: 'Invalid token'
        };
      }

      if (error instanceof jwt.NotBeforeError) {
        return {
          success: false,
          error: 'Token not active yet'
        };
      }

      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      return {
        success: false,
        error: `Token verification failed: ${errorMessage}`
      };
    }
  }

  /**
   * Check if a token is expired without full verification
   */
  isTokenExpired(token: string): boolean {
    try {
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
      const decoded = jwt.decode(cleanToken) as jwt.JwtPayload;

      if (!decoded || !decoded.exp) {
        return true; // Consider invalid tokens as expired
      }

      return decoded.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true; // Consider invalid tokens as expired
    }
  }

  /**
   * Refresh a token if it's close to expiry (within 7 days)
   */
  refreshTokenIfNeeded(token: string): JWTResult | null {
    const verifyResult = this.verifyToken(token);

    if (!verifyResult.success || !verifyResult.payload || !verifyResult.expiresAt) {
      return null;
    }

    const now = new Date();
    const expiresAt = verifyResult.expiresAt;
    const daysUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);

    // Refresh if token expires within 7 days
    if (daysUntilExpiry <= 7) {
      // Create new token with same payload (excluding JWT standard claims)
      const userPayload = { ...verifyResult.payload } as Record<string, unknown>;
      delete userPayload.iat;
      delete userPayload.exp;
      delete userPayload.iss;
      delete userPayload.aud;
      return this.generateToken(userPayload as unknown as JWTPayload);
    }

    return null; // No refresh needed
  }

  /**
   * Extract user ID from token without full verification (for logging/debugging)
   */
  extractUserId(token: string): string | null {
    try {
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
      const decoded = jwt.decode(cleanToken) as JWTPayload;
      return decoded?.userId || null;
    } catch {
      return null;
    }
  }

  /**
   * Get token expiration time without verification
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const cleanToken = token.startsWith('Bearer ') ? token.substring(7) : token;
      const decoded = jwt.decode(cleanToken) as jwt.JwtPayload;
      return decoded?.exp ? new Date(decoded.exp * 1000) : null;
    } catch {
      return null;
    }
  }
}
