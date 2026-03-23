/**
 * bridge.js — Injected into the WebView by MainActivity on every page load.
 *
 * Creates a Promise-based API at `window.ShooterBridge.scanner.scan()` that
 * wraps the native callback-ID pattern:
 *
 *   1. JS generates a unique callbackId
 *   2. JS stores a { resolve, reject } pair keyed by callbackId
 *   3. JS calls  _nativeShooterBridge.nativeRequestScanner(callbackId)
 *   4. Native opens scanner, gets result
 *   5. Native calls  window.handleNativeResponse(callbackId, jsonString)
 *   6. handleNativeResponse resolves/rejects the stored Promise
 *
 * The bridge is intentionally extensible — the same `handleNativeResponse`
 * dispatcher will be reused for image picker and other native features.
 */
(function () {
  'use strict';

  // Guard against double-injection
  if (window.__shooterBridgeReady) return;
  window.__shooterBridgeReady = true;

  // ── Pending callbacks registry ──────────────────────────────────────

  var _pending = {};
  var _counter = 0;

  function nextCallbackId(prefix) {
    _counter += 1;
    return (prefix || 'cb') + '_' + _counter + '_' + Date.now();
  }

  // ── Global dispatcher (called from native) ─────────────────────────

  window.handleNativeResponse = function (callbackId, jsonString) {
    var entry = _pending[callbackId];
    if (!entry) {
      console.warn('[bridge] No pending callback for id:', callbackId);
      return;
    }
    delete _pending[callbackId];

    try {
      var response = typeof jsonString === 'string' ? JSON.parse(jsonString) : jsonString;

      if (response.success) {
        entry.resolve(response.data);
      } else {
        entry.reject(new Error(response.error || 'Unknown native error'));
      }
    } catch (e) {
      entry.reject(new Error('Failed to parse native response: ' + e.message));
    }
  };

  // ── Public API ──────────────────────────────────────────────────────

  // Ensure the ShooterBridge namespace exists (config bridge may have
  // already created it as a Java object — we extend, never replace).
  if (typeof window.ShooterBridge !== 'object' || window.ShooterBridge === null) {
    // ShooterBridge is a Java bridge object; we cannot overwrite it.
    // Attach the scanner namespace to a parallel object instead.
  }

  // Use a dedicated namespace that won't collide with the Java bridge
  window.ShooterNativeBridge = window.ShooterNativeBridge || {};

  window.ShooterNativeBridge.scanner = {
    /**
     * Opens the native QR scanner and returns a Promise that resolves
     * with the scanned string, or rejects on cancel / error.
     *
     * @returns {Promise<string>}
     */
    scan: function () {
      return new Promise(function (resolve, reject) {
        if (
          typeof window._nativeShooterBridge === 'undefined' ||
          typeof window._nativeShooterBridge.nativeRequestScanner !== 'function'
        ) {
          reject(new Error('Native scanner bridge not available'));
          return;
        }

        var callbackId = nextCallbackId('scan');
        _pending[callbackId] = { resolve: resolve, reject: reject };

        try {
          window._nativeShooterBridge.nativeRequestScanner(callbackId);
        } catch (e) {
          delete _pending[callbackId];
          reject(new Error('Failed to invoke native scanner: ' + e.message));
        }
      });
    },

    /**
     * @returns {boolean} Whether the native scanner is available.
     */
    isAvailable: function () {
      return (
        typeof window._nativeShooterBridge !== 'undefined' &&
        typeof window._nativeShooterBridge.nativeRequestScanner === 'function'
      );
    },
  };
})();
