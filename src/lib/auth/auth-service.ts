import { JWTService } from './jwt';
import { CryptoService } from './crypto';
import { config } from '$lib/config';
import type {
  LoginCredentials,
  LoginResult,
  User,
  SessionData,
  AuthValidationResult,
  UserRegistration,
  RegistrationResult,
  AuthError,
  AuthErrorCode
} from '$types/auth';

// Helper function to create AuthError objects
function createAuthError(code: AuthErrorCode, message: string, details?: string): AuthError {
  return {
    code,
    message,
    details,
    timestamp: new Date()
  };
}

export class AuthService {
  private jwtService: JWTService;
  private cryptoService: CryptoService;

  // In-memory user store (in production, this would be a database)
  private users = new Map<string, User>();

  // Active sessions store (in production, this would be Redis/database)
  private sessions = new Map<string, SessionData>();

  constructor() {
    this.jwtService = new JWTService();
    this.cryptoService = new CryptoService();

    // Initialize with admin user if not exists
    this.initializeAdminUser();
  }

  /**
   * Initialize default admin user for dashboard access
   */
  private initializeAdminUser(): void {
    const adminUsername = config.auth.username;
    const adminPassword = config.auth.password;

    if (!this.users.has(adminUsername)) {
      const hashResult = this.cryptoService.hashPassword(adminPassword);

      if (hashResult.success) {
        const adminUser: User = {
          id: this.cryptoService.generateSecureToken(),
          username: adminUsername,
          email: `${adminUsername}@shooter.dev`,
          passwordHash: hashResult.hash!,
          salt: hashResult.salt!,
          role: 'admin',
          permissions: {
            manageUsers: true,
            manageSystem: true,
            viewLogs: true,
            configureSystem: true,
            accessAnalytics: true,
            viewReports: true,
            exportData: true,
            manageIntegrations: true,
            manageWebhooks: true,
            manageApiKeys: true,
            sendNotifications: true,
            manageNotifications: true,
            viewNotificationHistory: true,
            changeOwnPassword: true,
            manageOthersPasswords: true,
            viewAuditLogs: true
          },
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastLoginAt: undefined,
          loginAttempts: 0,
          lockedUntil: null
        };

        this.users.set(adminUsername, adminUser);
        console.log(`✅ Admin user initialized: ${adminUsername}`);
      } else {
        console.error('❌ Failed to initialize admin user:', hashResult.error);
      }
    }
  }

  /**
   * Authenticate user and create session
   */
  async login(credentials: LoginCredentials): Promise<LoginResult> {
    try {
      const { username, password } = credentials;

      if (!username || !password) {
        return {
          success: false,
          error: 'Username and password are required'
        };
      }

      // Get user from store
      const user = this.users.get(username);
      if (!user) {
        // Simulate password hashing to prevent timing attacks
        this.cryptoService.hashPassword('dummy-password');
        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Check if account is locked
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        return {
          success: false,
          error: 'Account is temporarily locked due to failed login attempts'
        };
      }

      // Check if account is active
      if (!user.isActive) {
        return {
          success: false,
          error: 'Account is disabled'
        };
      }

      // Check if user has password credentials
      if (!user.passwordHash || !user.salt) {
        return {
          success: false,
          error: 'Invalid authentication method'
        };
      }

      // Verify password
      const verifyResult = this.cryptoService.verifyPassword(
        password,
        user.passwordHash,
        user.salt
      );

      if (!verifyResult.success || !verifyResult.isValid) {
        // Increment login attempts
        user.loginAttempts = (user.loginAttempts || 0) + 1;

        // Lock account after 5 failed attempts for 15 minutes
        if (user.loginAttempts >= 5) {
          user.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        }

        user.updatedAt = new Date();
        this.users.set(username, user);

        return {
          success: false,
          error: 'Invalid username or password'
        };
      }

      // Reset login attempts on successful login
      user.loginAttempts = 0;
      user.lockedUntil = null;
      user.lastLoginAt = new Date();
      user.updatedAt = new Date();
      this.users.set(username, user);

      // Generate JWT token
      const sessionId = this.cryptoService.generateSecureToken();
      const tokenResult = this.jwtService.generateToken({
        sub: user.id,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60),
        jti: sessionId,
        aud: 'shooter-users',
        iss: 'shooter-dashboard',
        userId: user.id,
        username: user.username,
        role: user.role
      });

      if (!tokenResult.success) {
        return {
          success: false,
          error: tokenResult.error || 'Failed to generate session token'
        };
      }

      // Create session data
      const sessionData: SessionData = {
        id: sessionId,
        userId: user.id,
        username: user.username,
        role: user.role,
        token: tokenResult.token!,
        createdAt: new Date(),
        expiresAt: tokenResult.expiresAt!,
        isActive: true,
        ipAddress: null, // Would be set from request in route handler
        userAgent: null // Would be set from request in route handler
      };

      this.sessions.set(sessionId, sessionData);

      return {
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        },
        token: tokenResult.token!,
        expiresAt: tokenResult.expiresAt!,
        sessionId
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      console.error('Login error:', error);
      return {
        success: false,
        error: `Authentication failed: ${errorMessage}`
      };
    }
  }

  /**
   * Validate JWT token and return user info
   */
  validateToken(token: string): AuthValidationResult {
    try {
      const verifyResult = this.jwtService.verifyToken(token);

      if (!verifyResult.success || !verifyResult.payload) {
        return {
          success: false,
          error: createAuthError('TOKEN_INVALID', 'Invalid token', verifyResult.error)
        };
      }

      const { userId, username, role } = verifyResult.payload;

      // Ensure required fields exist
      if (!username || !userId || !role) {
        return {
          success: false,
          error: createAuthError('TOKEN_MALFORMED', 'Invalid token payload')
        };
      }

      // Check if user still exists and is active
      const user = this.users.get(username);
      if (!user || !user.isActive) {
        return {
          success: false,
          error: createAuthError('USER_DISABLED', 'User account not found or disabled')
        };
      }

      return {
        success: true,
        user,
        payload: verifyResult.payload
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      return {
        success: false,
        error: createAuthError('TOKEN_INVALID', 'Token validation failed', errorMessage)
      };
    }
  }

  /**
   * Logout user and invalidate session
   */
  logout(sessionId: string): boolean {
    try {
      const session = this.sessions.get(sessionId);
      if (session) {
        session.isActive = false;
        this.sessions.set(sessionId, session);
        return true;
      }
      return false;
    } catch (error: unknown) {
      console.error('Logout error:', error);
      return false;
    }
  }

  /**
   * Get session data by session ID
   */
  getSession(sessionId: string): SessionData | null {
    const session = this.sessions.get(sessionId);

    if (!session || !session.isActive) {
      return null;
    }

    // Check if session is expired
    if (session.expiresAt < new Date()) {
      session.isActive = false;
      this.sessions.set(sessionId, session);
      return null;
    }

    return session;
  }

  /**
   * Register a new user (admin only)
   */
  async registerUser(
    registration: UserRegistration,
    adminUserId: string
  ): Promise<RegistrationResult> {
    try {
      // Verify admin permissions
      const adminUser = Array.from(this.users.values()).find(u => u.id === adminUserId);
      if (!adminUser || adminUser.role !== 'admin') {
        return {
          success: false,
          error: 'Insufficient permissions'
        };
      }

      const { username, email, password, role = 'user' } = registration;

      // Check if username already exists
      if (this.users.has(username)) {
        return {
          success: false,
          error: 'Username already exists'
        };
      }

      // Validate password strength
      const passwordStrength = this.cryptoService.validatePasswordStrength(password);
      if (!passwordStrength.isValid) {
        return {
          success: false,
          error: 'Password does not meet security requirements',
          details: passwordStrength.feedback.join('; ')
        };
      }

      // Hash password
      const hashResult = this.cryptoService.hashPassword(password);
      if (!hashResult.success) {
        return {
          success: false,
          error: hashResult.error || 'Failed to hash password'
        };
      }

      // Create new user
      const newUser: User = {
        id: this.cryptoService.generateSecureToken(),
        username,
        email,
        passwordHash: hashResult.hash!,
        salt: hashResult.salt!,
        role,
        permissions: role === 'admin' ? {
          manageUsers: true,
          manageSystem: true,
          viewLogs: true,
          configureSystem: true,
          accessAnalytics: true,
          viewReports: true,
          exportData: true,
          manageIntegrations: true,
          manageWebhooks: true,
          manageApiKeys: true,
          sendNotifications: true,
          manageNotifications: true,
          viewNotificationHistory: true,
          changeOwnPassword: true,
          manageOthersPasswords: true,
          viewAuditLogs: true
        } : {
          manageUsers: false,
          manageSystem: false,
          viewLogs: false,
          configureSystem: false,
          accessAnalytics: role === 'user',
          viewReports: role === 'user',
          exportData: false,
          manageIntegrations: false,
          manageWebhooks: false,
          manageApiKeys: false,
          sendNotifications: role === 'user',
          manageNotifications: false,
          viewNotificationHistory: role === 'user',
          changeOwnPassword: true,
          manageOthersPasswords: false,
          viewAuditLogs: false
        },
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastLoginAt: undefined,
        loginAttempts: 0,
        lockedUntil: null
      };

      this.users.set(username, newUser);

      return {
        success: true,
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          role: newUser.role
        }
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      console.error('Registration error:', error);
      return {
        success: false,
        error: `Registration failed: ${errorMessage}`
      };
    }
  }

  /**
   * Change user password
   */
  async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Find user
      const user = Array.from(this.users.values()).find(u => u.id === userId);
      if (!user) {
        return { success: false, error: 'User not found' };
      }

      // Check if user has password credentials
      if (!user.passwordHash || !user.salt) {
        return { success: false, error: 'Invalid authentication method' };
      }

      // Verify old password
      const verifyResult = this.cryptoService.verifyPassword(
        oldPassword,
        user.passwordHash,
        user.salt
      );
      if (!verifyResult.success || !verifyResult.isValid) {
        return { success: false, error: 'Current password is incorrect' };
      }

      // Validate new password strength
      const passwordStrength = this.cryptoService.validatePasswordStrength(newPassword);
      if (!passwordStrength.isValid) {
        return {
          success: false,
          error: `New password does not meet security requirements: ${passwordStrength.feedback.join(', ')}`
        };
      }

      // Hash new password
      const hashResult = this.cryptoService.hashPassword(newPassword);
      if (!hashResult.success) {
        return { success: false, error: hashResult.error || 'Failed to hash new password' };
      }

      // Update user
      user.passwordHash = hashResult.hash!;
      user.salt = hashResult.salt!;
      user.updatedAt = new Date();
      this.users.set(user.username, user);

      return { success: true };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? (error as Error).message : 'Unknown error';
      console.error('Change password error:', error);
      return { success: false, error: `Password change failed: ${errorMessage}` };
    }
  }

  /**
   * Get all users (admin only)
   */
  getUsers(adminUserId: string): User[] | null {
    const adminUser = Array.from(this.users.values()).find(u => u.id === adminUserId);
    if (!adminUser || adminUser.role !== 'admin') {
      return null;
    }

    return Array.from(this.users.values()).map(user => ({
      ...user,
      passwordHash: '[REDACTED]',
      salt: '[REDACTED]'
    })) as User[];
  }

  /**
   * Clean up expired sessions (should be called periodically)
   */
  cleanupExpiredSessions(): number {
    const now = new Date();
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.expiresAt < now || !session.isActive) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }

  /**
   * Get active session count
   */
  getActiveSessionCount(): number {
    const now = new Date();
    return Array.from(this.sessions.values()).filter(
      session => session.isActive && session.expiresAt > now
    ).length;
  }
}
