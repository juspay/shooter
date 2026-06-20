package com.shooter.android

import android.annotation.SuppressLint
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.util.Log
import android.view.Menu
import android.view.MenuItem
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.firebase.messaging.FirebaseMessaging
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning
import org.json.JSONObject

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private var webAppInterface: WebAppInterface? = null

    private fun getSavedServerUrl(): String {
        return AppPreferences(this).serverUrl?.takeIf { it.isNotBlank() } ?: BuildConfig.DEFAULT_SERVER_URL
    }

    private fun saveServerUrl(url: String) {
        AppPreferences(this).serverUrl = url
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        installSplashScreen()
        setContentView(R.layout.activity_main)
        setupWebView()
        loadDashboard(intent)

        // Proactively fetch the FCM token on every launch and re-register it
        // with the server. onNewToken() in ShooterFirebaseService only fires
        // when the token changes (first install, rotation), so if the API key
        // wasn't set at that moment the token would otherwise never reach the
        // server. Re-POSTing on every launch is idempotent on the server side.
        FirebaseMessaging.getInstance().token
            .addOnSuccessListener { token ->
                AppPreferences(this).fcmToken = token
                ShooterFirebaseService.registerTokenWithServer(this, token)
            }

        // Pre-download scanner module so first scan is instant
        ensureScannerModule()
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        handleDeepLink(intent)
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
        swipeRefresh = findViewById(R.id.swipe_refresh)
        webView = findViewById(R.id.web_view)

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            userAgentString = "$userAgentString ShooterApp/Android"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(
                view: WebView?,
                request: WebResourceRequest?
            ): Boolean {
                // Keep all navigation in-app
                return false
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                swipeRefresh.isRefreshing = false

                // Inject bridge.js to set up window.ShooterBridge.scanner Promise API
                injectBridgeScript(view)

                // Check if web portal has a different server URL saved
                view?.evaluateJavascript(
                    "(function(){ try { var c = JSON.parse(localStorage.getItem('shooter_config') || '{}'); return c.serverUrl || ''; } catch(e) { return ''; } })()"
                ) { result ->
                    val savedUrl = result?.trim('"') ?: ""
                    if (savedUrl.isNotEmpty()) {
                        saveServerUrl(savedUrl)
                    }
                }
            }
        }

        // Match web dashboard background (#0a0a0a) to prevent white flash
        webView.setBackgroundColor(Color.parseColor("#0A0A0A"))
        webView.webChromeClient = WebChromeClient()

        // Expose native bridge so the WebView can trigger reconfiguration
        webView.addJavascriptInterface(object {
            @JavascriptInterface
            fun openSettings() {
                runOnUiThread { navigateToConfig() }
            }
        }, "ShooterNative")

        // Expose config bridge for web <-> native preference sync
        webView.addJavascriptInterface(ShooterBridge(), "ShooterBridge")

        // Expose callback-ID bridge for scanner (and future native features)
        webAppInterface = WebAppInterface(this, webView)
        webView.addJavascriptInterface(webAppInterface!!, "_nativeShooterBridge")

        swipeRefresh.setOnRefreshListener {
            webView.reload()
        }

        // Disable pull-to-refresh entirely. Shooter's mobile layout uses a
        // fixed header + bottom nav, so the actual list scrolls inside an
        // internal container — webView.scrollY is always 0. That makes it
        // impossible for SwipeRefreshLayout to distinguish "user wants to
        // refresh" from "user wants to scroll up through the list", and it
        // intercepts every upward swipe. The Refresh button in the app header
        // covers the refresh UX.
        swipeRefresh.isEnabled = false
    }

    private fun loadDashboard(intent: Intent) {
        val deepLinkUrl = intent.getStringExtra(EXTRA_URL)
        if (deepLinkUrl != null && isUrlAllowed(deepLinkUrl)) {
            webView.loadUrl(deepLinkUrl)
        } else {
            loadDefaultUrl()
        }
    }

    private fun handleDeepLink(intent: Intent) {
        val deepLinkUrl = intent.getStringExtra(EXTRA_URL)
        if (deepLinkUrl != null && isUrlAllowed(deepLinkUrl)) {
            webView.loadUrl(deepLinkUrl)
        }
    }

    private fun loadDefaultUrl() {
        val serverUrl = getSavedServerUrl().trimEnd('/')
        webView.loadUrl("$serverUrl/")
    }

    private fun isUrlAllowed(url: String): Boolean {
        val serverUrl = getSavedServerUrl().trimEnd('/')
        return url.startsWith(serverUrl)
    }

    override fun onCreateOptionsMenu(menu: Menu): Boolean {
        menu.add(Menu.NONE, MENU_SETTINGS, Menu.NONE, "Settings")
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            MENU_SETTINGS -> {
                navigateToConfig()
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun navigateToConfig() {
        val serverUrl = getSavedServerUrl().trimEnd('/')
        webView.loadUrl("$serverUrl/config")
    }

    @Deprecated("Use onBackPressedDispatcher instead")
    override fun onBackPressed() {
        if (::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            @Suppress("DEPRECATION")
            super.onBackPressed()
        }
    }

    // ── QR Scanner (Google Code Scanner API) ───────────────────────────

    /**
     * Called from [WebAppInterface.nativeRequestScanner] on the main thread.
     * Opens the Google Code Scanner UI and delivers the result back to JS.
     */
    fun requestScannerFromBridge(callbackId: String) {
        val options = GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .enableAutoZoom()
            .build()

        val scanner = GmsBarcodeScanning.getClient(this, options)

        scanner.startScan()
            .addOnSuccessListener { barcode ->
                Log.d(TAG, "Scanner success: ${barcode.rawValue?.take(40)}...")
                webAppInterface?.sendNativeResponse(callbackId, barcode.rawValue, null)
            }
            .addOnCanceledListener {
                Log.d(TAG, "Scanner cancelled")
                webAppInterface?.sendNativeResponse(callbackId, null, "cancelled")
            }
            .addOnFailureListener { e ->
                Log.e(TAG, "Scanner failed", e)
                webAppInterface?.sendNativeResponse(callbackId, null, e.message ?: "Scanner error")
            }
    }

    /**
     * Pre-download the scanner module so the first scan is fast.
     * Called once at startup; failure is non-fatal.
     */
    private fun ensureScannerModule() {
        val moduleInstallClient = ModuleInstall.getClient(this)
        val optionalApi = GmsBarcodeScanning.getClient(this)

        moduleInstallClient.areModulesAvailable(optionalApi)
            .addOnSuccessListener { response ->
                if (!response.areModulesAvailable()) {
                    val request = ModuleInstallRequest.newBuilder()
                        .addApi(optionalApi)
                        .build()
                    moduleInstallClient.installModules(request)
                        .addOnSuccessListener { Log.d(TAG, "Scanner module installed") }
                        .addOnFailureListener { Log.w(TAG, "Scanner module install failed", it) }
                }
            }

    }

    // ── Bridge.js injection ─────────────────────────────────────────────

    private var bridgeScript: String? = null

    /**
     * Loads bridge.js from assets (cached after first read) and injects it
     * into the WebView via evaluateJavascript.
     */
    private fun injectBridgeScript(webView: WebView?) {
        webView ?: return
        if (bridgeScript == null) {
            bridgeScript = try {
                assets.open("bridge.js").bufferedReader().use { it.readText() }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load bridge.js from assets", e)
                return
            }
        }
        webView.evaluateJavascript(bridgeScript!!, null)
    }

    inner class ShooterBridge {
        @JavascriptInterface
        fun getConfig(): String {
            val prefs = AppPreferences(this@MainActivity)
            // Read the stable id once: each access is an EncryptedSharedPreferences
            // decrypt, and re-reading risks logging a different value than the JSON.
            val deviceId = prefs.stableDeviceId
            val json = JSONObject().apply {
                put("serverUrl", prefs.serverUrl ?: "")
                put("apiKey", prefs.apiKey ?: "")
                put("fcmToken", prefs.fcmToken ?: "")
                put("deviceId", deviceId)
                put("deviceName", android.os.Build.MODEL)
            }
            val result = json.toString()
            // Never log the API key or push token to logcat (readable via adb /
            // READ_LOGS). Log only non-sensitive fields.
            android.util.Log.d(
                TAG,
                "ShooterBridge.getConfig() → serverUrl=${prefs.serverUrl ?: ""}, " +
                    "apiKey=${if (prefs.apiKey.isNullOrBlank()) "unset" else "[redacted]"}, " +
                    "deviceId=$deviceId"
            )
            return result
        }

        @JavascriptInterface
        fun getDeviceId(): String {
            return AppPreferences(this@MainActivity).stableDeviceId
        }

        @JavascriptInterface
        fun saveConfig(json: String) {
            // Do not log the raw payload — it carries the API key.
            android.util.Log.d(TAG, "ShooterBridge.saveConfig(...)")
            try {
                val obj = JSONObject(json)
                val prefs = AppPreferences(this@MainActivity)
                if (obj.has("serverUrl")) prefs.serverUrl = obj.getString("serverUrl")
                if (obj.has("apiKey")) prefs.apiKey = obj.getString("apiKey")
                android.util.Log.d(TAG, "ShooterBridge.saveConfig: saved successfully")

                // The API key may have just been entered for the first time.
                // Re-POST the cached FCM token so the server can push to this
                // device (onNewToken fired earlier when no key was set).
                val cachedToken = prefs.fcmToken
                if (!cachedToken.isNullOrBlank()) {
                    ShooterFirebaseService.registerTokenWithServer(this@MainActivity, cachedToken)
                }
            } catch (e: Exception) {
                android.util.Log.e(TAG, "ShooterBridge.saveConfig failed", e)
            }
        }

        @JavascriptInterface
        fun getFcmToken(): String {
            val token = AppPreferences(this@MainActivity).fcmToken ?: ""
            android.util.Log.d(TAG, "ShooterBridge.getFcmToken() → ${token.take(10)}...")
            return token
        }

        @JavascriptInterface
        fun getPlatform(): String {
            android.util.Log.d(TAG, "ShooterBridge.getPlatform() → android")
            return "android"
        }
    }

    companion object {
        private const val TAG = "ShooterApp"
        const val EXTRA_URL = "extra_url"
        private const val MENU_SETTINGS = 1001
    }
}
