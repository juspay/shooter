/**
 * Native bridge utilities for detecting and communicating with
 * the ShooterBridge injected by native WebView wrappers (iOS/Android).
 *
 * The native side injects window.ShooterBridge at documentStart with its own
 * callback-ID system (window.ShooterBridge._callbacks + window.handleNativeResponse).
 * This module MUST NOT override handleNativeResponse — the native version handles
 * resolving scanner/picker promises using its own callback registry.
 */

/** True when the native bridge exposes a QR scanner */
export function hasScanner(): boolean {
  return getScanFn() !== null;
}

/** True when the page is running inside a native WebView with a bridge */
export function isNativeBridge(): boolean {
  if (typeof window === 'undefined') {return false;}
  // iOS injects window.ShooterBridge, Android injects window.ShooterNativeBridge
  return (
    (typeof window.ShooterBridge === 'object' && window.ShooterBridge !== null) ||
    (typeof (window as any).ShooterNativeBridge === 'object' && (window as any).ShooterNativeBridge !== null)
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
  if (typeof window === 'undefined') {return null;}
  // Check iOS bridge first, then Android
  if (typeof window.ShooterBridge?.scanner?.scan === 'function') {
    return () => window.ShooterBridge!.scanner!.scan();
  }
  if (typeof (window as any).ShooterNativeBridge?.scanner?.scan === 'function') {
    return () => (window as any).ShooterNativeBridge.scanner.scan();
  }
  return null;
}
