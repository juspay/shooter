/**
 * Client-side authentication store for Svelte
 */
import { writable, derived, type Writable } from 'svelte/store';
import { browser } from '$app/environment';
import { goto, invalidateAll } from '$app/navigation';
import type { 
  User, 
  LoginCredentials, 
  AuthState,
  LoginResult as AuthResult
} from '$types';

// Create the authentication store
const createAuthStore = () => {
  const initialState: AuthState = {
    isAuthenticated: false,
    user: null,
    isLoading: false,
    error: null
  };

  const { subscribe, set, update }: Writable<AuthState> = writable(initialState);

  return {
    subscribe,

    /**
     * Set loading state
     */
    setLoading: (loading: boolean) => update(state => ({ ...state, isLoading: loading })),

    /**
     * Set error state
     */
    setError: (error: string | null) => update(state => ({ ...state, error })),

    /**
     * Clear error state
     */
    clearError: () => update(state => ({ ...state, error: null })),

    /**
     * Set authenticated user
     */
    setUser: (user: User) =>
      update(state => ({
        ...state,
        isAuthenticated: true,
        user,
        error: null
      })),

    /**
     * Clear authentication state
     */
    clearAuth: () => set(initialState),

    /**
     * Login user
     */
    login: async (credentials: LoginCredentials): Promise<AuthResult> => {
      if (!browser) {
return { success: false, error: 'Not in browser context' };
}

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const response = await fetch('/authentication/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(credentials),
          credentials: 'include' // Include cookies
        });

        const result = await response.json();

        if (response.ok && result.success) {
          const user: User = result.user as User;

          update(state => ({
            ...state,
            isAuthenticated: true,
            user,
            isLoading: false,
            error: null
          }));

          // Invalidate all data to refresh with new auth state
          await invalidateAll();

          return { success: true, user };
        } else {
          const error = result.error || 'Login failed';
          update(state => ({
            ...state,
            isLoading: false,
            error
          }));
          return { success: false, error };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? (error as Error).message : 'Network error';
        update(state => ({
          ...state,
          isLoading: false,
          error: errorMessage
        }));
        return { success: false, error: errorMessage };
      }
    },

    /**
     * Logout user
     */
    logout: async (): Promise<void> => {
      if (!browser) {
return;
}

      update(state => ({ ...state, isLoading: true }));

      try {
        await fetch('/authentication/logout', {
          method: 'POST',
          credentials: 'include'
        });
      } catch (error) {
        console.error('Logout request failed:', error);
        // Continue with client-side logout even if server request fails
      }

      // Clear client-side state
      set(initialState);

      // Invalidate all data and redirect
      await invalidateAll();
      await goto('/authentication/login');
    },

    /**
     * Check authentication status
     */
    checkAuth: async (): Promise<boolean> => {
      if (!browser) {
return false;
}

      update(state => ({ ...state, isLoading: true }));

      try {
        const response = await fetch('/authentication/session', {
          credentials: 'include'
        });

        if (response.ok) {
          const result = await response.json();

          if (result.success && result.user) {
            update(state => ({
              ...state,
              isAuthenticated: true,
              user: result.user,
              isLoading: false,
              error: null
            }));
            return true;
          }
        }

        // Not authenticated
        update(state => ({
          ...state,
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: null
        }));
        return false;
      } catch (error) {
        console.error('Auth check failed:', error);
        update(state => ({
          ...state,
          isAuthenticated: false,
          user: null,
          isLoading: false,
          error: null
        }));
        return false;
      }
    },

    /**
     * Change password
     */
    changePassword: async (currentPassword: string, newPassword: string): Promise<AuthResult> => {
      if (!browser) {
return { success: false, error: 'Not in browser context' };
}

      update(state => ({ ...state, isLoading: true, error: null }));

      try {
        const response = await fetch('/authentication/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ currentPassword, newPassword }),
          credentials: 'include'
        });

        const result = await response.json();

        if (response.ok && result.success) {
          update(state => ({ ...state, isLoading: false, error: null }));
          return { success: true };
        } else {
          const error = result.error || 'Password change failed';
          update(state => ({ ...state, isLoading: false, error }));
          return { success: false, error };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? (error as Error).message : 'Network error';
        update(state => ({ ...state, isLoading: false, error: errorMessage }));
        return { success: false, error: errorMessage };
      }
    }
  };
};

// Export the store instance
export const auth = createAuthStore();

// Derived stores for convenience
export const isAuthenticated = derived(auth, $auth => $auth.isAuthenticated);
export const currentUser = derived(auth, $auth => $auth.user);
export const authLoading = derived(auth, $auth => $auth.isLoading);
export const authError = derived(auth, $auth => $auth.error);
export const isAdmin = derived(auth, $auth => $auth.user?.role === 'admin');

// Initialize auth check on app load
// TEMPORARY: Disable auto auth check for development
// TODO: Re-enable once /authentication/session endpoint is created
// if (browser) {
//   auth.checkAuth();
// }
