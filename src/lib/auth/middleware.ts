import type { Handle, RequestEvent } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { AuthService } from './auth-service';
import type { AuthValidationResult, User, AuthError, AuthErrorCode } from '$types/auth';

// Helper function to create AuthError objects
function createAuthError(code: AuthErrorCode, message: string, details?: string): AuthError {
  return {
    code,
    message,
    details,
    timestamp: new Date()
  };
}

// Initialize auth service
const authService = new AuthService();

/**
 * Authentication middleware for SvelteKit
 */
export const authHandle: Handle = async ({ event, resolve }) => {
  // Add auth service to locals for route handlers
  event.locals.authService = authService;

  // Extract session token from cookies
  const sessionId = event.cookies.get('session_id');
  const authToken = event.cookies.get('auth_token');

  // Validate authentication for protected routes
  const isProtectedRoute = isRouteProtected(event.url.pathname);
  const authResult = await validateAuthentication(event, sessionId, authToken);

  // Add user info to locals if authenticated
  if (authResult.success && authResult.user) {
    event.locals.user = authResult.user;
    event.locals.isAuthenticated = true;
  } else {
    event.locals.user = null;
    event.locals.isAuthenticated = false;
  }

  // Redirect to login if accessing protected route without auth
  if (isProtectedRoute && !authResult.success) {
    throw redirect(302, '/authentication/login?redirect=' + encodeURIComponent(event.url.pathname));
  }

  // Redirect authenticated users away from auth pages
  if (authResult.success && isAuthRoute(event.url.pathname)) {
    throw redirect(302, '/');
  }

  const response = await resolve(event);

  // Clean up expired sessions
  cleanupExpiredSessions();

  return response;
};

/**
 * Validate authentication using session ID and token
 */
async function validateAuthentication(
  event: RequestEvent,
  sessionId?: string,
  authToken?: string
): Promise<AuthValidationResult & { user?: User }> {
  try {
    // No session or token provided
    if (!sessionId || !authToken) {
      return { success: false, error: createAuthError('SESSION_INVALID', 'No authentication credentials provided') };
    }

    // Validate session
    const session = authService.getSession(sessionId);
    if (!session) {
      // Clear invalid session cookies
      event.cookies.delete('session_id', { path: '/' });
      event.cookies.delete('auth_token', { path: '/' });
      return { success: false, error: createAuthError('SESSION_EXPIRED', 'Invalid or expired session') };
    }

    // Validate JWT token
    const tokenResult = authService.validateToken(authToken);
    if (!tokenResult.success) {
      // Clear invalid token cookies
      event.cookies.delete('session_id', { path: '/' });
      event.cookies.delete('auth_token', { path: '/' });
      return { success: false, error: tokenResult.error };
    }

    // Check if session and token match
    if (session.userId !== tokenResult.user?.id) {
      // Clear mismatched session/token
      event.cookies.delete('session_id', { path: '/' });
      event.cookies.delete('auth_token', { path: '/' });
      return { success: false, error: createAuthError('SESSION_INVALID', 'Session and token mismatch') };
    }

    // Update session with request metadata
    session.ipAddress = getClientIP(event);
    session.userAgent = event.request.headers.get('user-agent');

    return {
      success: true,
      user: tokenResult.user!
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
    console.error('Authentication validation error:', error);
    return { success: false, error: createAuthError('SESSION_INVALID', 'Authentication validation failed', errorMessage) };
  }
}

/**
 * Check if route requires authentication
 */
function isRouteProtected(pathname: string): boolean {
  const protectedRoutes = [
    '/settings',
    '/admin',
    '/authentication/change-password',
    '/authentication/register' // Admin only route
  ];

  return protectedRoutes.some(route => pathname.startsWith(route));
}

/**
 * Check if route is an authentication page
 */
function isAuthRoute(pathname: string): boolean {
  const authRoutes = ['/authentication/login', '/authentication/logout'];

  return authRoutes.some(route => pathname.startsWith(route));
}

/**
 * Extract client IP address from request
 */
function getClientIP(event: RequestEvent): string | null {
  // Check various headers for IP address
  const forwardedFor = event.request.headers.get('x-forwarded-for');
  if (forwardedFor) {
    return forwardedFor.split(',')[0]!.trim();
  }

  const realIP = event.request.headers.get('x-real-ip');
  if (realIP) {
    return realIP;
  }

  const clientIP = event.request.headers.get('x-client-ip');
  if (clientIP) {
    return clientIP;
  }

  // Fallback to connection remote address if available
  return event.getClientAddress();
}

/**
 * Periodic cleanup of expired sessions
 */
let lastCleanup = Date.now();
function cleanupExpiredSessions(): void {
  const now = Date.now();
  // Run cleanup every 5 minutes
  if (now - lastCleanup > 5 * 60 * 1000) {
    const cleaned = authService.cleanupExpiredSessions();
    if (cleaned > 0) {
      console.log(`🧹 Cleaned up ${cleaned} expired sessions`);
    }
    lastCleanup = now;
  }
}

/**
 * Helper to require authentication in route handlers
 */
export function requireAuth(event: RequestEvent): User {
  if (!event.locals.isAuthenticated || !event.locals.user) {
    throw redirect(302, '/authentication/login?redirect=' + encodeURIComponent(event.url.pathname));
  }
  return event.locals.user;
}

/**
 * Helper to require admin role in route handlers
 */
export function requireAdmin(event: RequestEvent): User {
  const user = requireAuth(event);
  if (user.role !== 'admin') {
    throw redirect(302, '/?error=insufficient_permissions');
  }
  return user;
}

/**
 * Helper to set authentication cookies
 */
export function setAuthCookies(
  event: { cookies: RequestEvent['cookies']; getClientAddress: RequestEvent['getClientAddress'] },
  sessionId: string,
  token: string,
  expiresAt: Date
): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    expires: expiresAt
  };

  event.cookies.set('session_id', sessionId, cookieOptions);
  event.cookies.set('auth_token', token, cookieOptions);
}

/**
 * Helper to clear authentication cookies
 */
export function clearAuthCookies(event: {
  cookies: RequestEvent['cookies'];
  getClientAddress: RequestEvent['getClientAddress'];
}): void {
  const cookieOptions = {
    path: '/',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const
  };

  event.cookies.delete('session_id', cookieOptions);
  event.cookies.delete('auth_token', cookieOptions);
}

/**
 * Global auth service instance for use in routes
 */
export { authService };
