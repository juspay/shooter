package com.shooter.android

import android.os.Handler
import android.os.Looper
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

/**
 * JavaScript bridge exposed as `window._nativeShooterBridge`.
 *
 * Uses the lighthouse callback-ID pattern:
 *   1. JS calls  nativeRequestScanner(callbackId)
 *   2. Native opens scanner UI, gets result
 *   3. Native calls  window.handleNativeResponse(callbackId, json)
 *
 * The bridge is intentionally extensible — the same pattern will be reused
 * for image picker and other native features.
 */
class WebAppInterface(
    private val activity: MainActivity,
    private val webView: WebView,
) {
    private val mainHandler = Handler(Looper.getMainLooper())

    // ── Scanner ─────────────────────────────────────────────────────────

    @JavascriptInterface
    fun nativeRequestScanner(callbackId: String) {
        Log.d(TAG, "nativeRequestScanner(callbackId=$callbackId)")
        mainHandler.post { activity.requestScannerFromBridge(callbackId) }
    }

    /**
     * Sends a native response back to the web layer via evaluateJavascript.
     *
     * @param callbackId  The callback ID originally sent by JavaScript.
     * @param data        The result payload (e.g. scanned QR text), or null on failure.
     * @param error       An error message, or null on success.
     */
    fun sendNativeResponse(callbackId: String, data: String?, error: String?) {
        val payload = JSONObject().apply {
            put("success", data != null)
            put("data", data ?: JSONObject.NULL)
            put("error", error ?: JSONObject.NULL)
        }

        val escaped = JSONObject.quote(payload.toString())
        val script = "window.handleNativeResponse('$callbackId', $escaped);"

        Log.d(TAG, "sendNativeResponse → $script")
        mainHandler.post { webView.evaluateJavascript(script, null) }
    }

    companion object {
        private const val TAG = "WebAppInterface"
    }
}
