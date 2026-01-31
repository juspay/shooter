// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
import type { AuthService } from '$lib/auth/auth-service';
import type { User } from '$types';

declare global {
  namespace App {
    // interface Error {}
    interface Locals {
      user: User | null;
      isAuthenticated: boolean;
      authService: AuthService;
    }
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
