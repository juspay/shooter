package com.shooter.android

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

class AppPreferences(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val prefs: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    var serverUrl: String?
        get() = prefs.getString(KEY_SERVER_URL, null)
        set(value) = prefs.edit().putString(KEY_SERVER_URL, value).apply()

    var apiKey: String?
        get() = prefs.getString(KEY_API_KEY, null)
        set(value) = prefs.edit().putString(KEY_API_KEY, value).apply()

    var fcmToken: String?
        get() = prefs.getString(KEY_FCM_TOKEN, null)
        set(value) = prefs.edit().putString(KEY_FCM_TOKEN, value).apply()

    /**
     * A stable per-install device identifier, generated once and persisted, so
     * the server upserts by device on token rotation instead of accumulating
     * duplicate rows. Lazily created on first access.
     */
    val stableDeviceId: String
        get() = synchronized(deviceIdLock) {
            val existing = prefs.getString(KEY_DEVICE_ID, null)
            if (!existing.isNullOrBlank()) return@synchronized existing
            val generated = java.util.UUID.randomUUID().toString()
            // commit() (synchronous) inside the shared lock guarantees a second
            // concurrent caller reads this persisted id rather than generating a
            // competing one — otherwise the server gets two ids for one install.
            prefs.edit().putString(KEY_DEVICE_ID, generated).commit()
            generated
        }

    fun isConfigured(): Boolean {
        return !serverUrl.isNullOrBlank() && !apiKey.isNullOrBlank()
    }

    fun clear() {
        prefs.edit().clear().apply()
    }

    companion object {
        // Shared across all AppPreferences instances so concurrent first-launch
        // callers (the Firebase onNewToken thread and the WebView bridge thread)
        // cannot each generate a different device id and create duplicate rows.
        private val deviceIdLock = Any()
        private const val PREFS_NAME = "shooter_prefs"
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_API_KEY = "api_key"
        private const val KEY_FCM_TOKEN = "fcm_token"
        private const val KEY_DEVICE_ID = "device_id"
    }
}
