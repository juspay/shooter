/**
 * Native bridge utilities for detecting and communicating with
 * the ShooterBridge injected by native WebView wrappers (iOS/Android).
 *
 * The native side injects window.ShooterBridge at documentStart with its own
 * callback-ID system (window.ShooterBridge._callbacks + window.handleNativeResponse).
 * This module MUST NOT override handleNativeResponse — the native version handles
 * resolving scanner/picker promises using its own callback registry.
 */

import type { HapticKind } from '$lib/types';

/** True when the native bridge exposes a QR scanner */
export function hasScanner(): boolean {
  return getScanFn() !== null;
}

/** True when the page is running inside a native WebView with a bridge */
export function isNativeBridge(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  // iOS injects window.ShooterBridge, Android injects window.ShooterNativeBridge
  return (
    (typeof window.ShooterBridge === 'object' && window.ShooterBridge !== null) ||
    (typeof window.ShooterNativeBridge === 'object' && window.ShooterNativeBridge !== null)
  );
}

/**
 * Invoke the native QR scanner.
 * Returns the scanned string on success, throws on cancel/error.
 * The Promise is managed entirely by the native bridge's callback system.
 */
export async function scanQR(): Promise<string> {
  const scan = getScanFn();
  if (!scan) {
    throw new Error('Scanner not available');
  }
  return scan();
}

/** Get the scanner.scan function from whichever bridge exists */
function getScanFn(): (() => Promise<string>) | null {
  if (typeof window === 'undefined') {
    return null;
  }
  // Check iOS bridge first, then Android.
  // Capture the scanner object (not the bare function) to preserve `this` binding
  // when the native side implements scan() as a method on the scanner object.
  const iosScanner = window.ShooterBridge?.scanner;
  if (iosScanner && typeof iosScanner.scan === 'function') {
    return () => iosScanner.scan();
  }
  const androidScanner = window.ShooterNativeBridge?.scanner;
  if (androidScanner && typeof androidScanner.scan === 'function') {
    return () => androidScanner.scan();
  }
  return null;
}

/** navigator.vibrate() fallback durations (ms) per haptic kind, for browsers/PWA with no native bridge. */
const VIBRATION_MS: Record<HapticKind, number> = {
  error: 40,
  heavy: 30,
  light: 10,
  medium: 20,
  selection: 5,
  success: 15,
  warning: 25,
};

/**
 * Fire a haptic tick.
 * Resolution order: window.ShooterBridge.haptic (iOS) → window.ShooterNativeBridge.haptic
 * (Android) → navigator.vibrate (web/PWA) → no-op. SSR/desktop-safe — never throws.
 */
export function haptic(kind: HapticKind = 'light'): void {
  if (typeof window === 'undefined') {
    return;
  }
  try {
    if (typeof window.ShooterBridge?.haptic === 'function') {
      window.ShooterBridge.haptic(kind);
      return;
    }
    if (typeof window.ShooterNativeBridge?.haptic === 'function') {
      window.ShooterNativeBridge.haptic(kind);
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATION_MS[kind]);
    }
  } catch {
    // Haptics are best-effort — never let a native-bridge exception surface to callers.
  }
}
