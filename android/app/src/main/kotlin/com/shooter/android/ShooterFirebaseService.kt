package com.shooter.android

import android.content.Context
import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class ShooterFirebaseService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        val prefs = AppPreferences(this)
        prefs.fcmToken = token
        registerTokenWithServer(this, token)
    }

    companion object {
        private const val TAG = "ShooterFCM"

        private val client = OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build()

        /**
         * POST the FCM token to /api/device-token so the server can push to this
         * device. Safe to call from any thread. Returns silently if server URL or
         * API key is not yet configured — callers should re-invoke whenever those
         * change.
         */
        fun registerTokenWithServer(context: Context, token: String) {
            val prefs = AppPreferences(context)
            val serverUrl = prefs.serverUrl?.trimEnd('/')
            val apiKey = prefs.apiKey
            if (serverUrl.isNullOrBlank() || apiKey.isNullOrBlank()) {
                Log.d(TAG, "registerTokenWithServer: skipping — url=${!serverUrl.isNullOrBlank()} key=${!apiKey.isNullOrBlank()}")
                return
            }

            val json = JSONObject().apply {
                put("token", token)
                put("platform", "android")
                put("deviceId", prefs.stableDeviceId)
                put("deviceName", android.os.Build.MODEL)
            }

            val body = json.toString()
                .toRequestBody("application/json; charset=utf-8".toMediaType())

            val request = Request.Builder()
                .url("$serverUrl/api/device-token")
                .header("Authorization", "Bearer $apiKey")
                .post(body)
                .build()

            // Do not log token material — even a prefix is a stable device identifier.
            Log.d(TAG, "POST $serverUrl/api/device-token (tokenLength=${token.length})")
            client.newCall(request).enqueue(object : Callback {
                override fun onFailure(call: Call, e: IOException) {
                    Log.w(TAG, "device-token POST failed: ${e.message}")
                }

                override fun onResponse(call: Call, response: Response) {
                    Log.d(TAG, "device-token POST → HTTP ${response.code}")
                    response.close()
                }
            })
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        val data = message.data
        val title = data["title"] ?: return
        val body = data["body"] ?: ""
        val category = data["category"] ?: ""
        val requestId = data["requestId"]

        if (category == "CLAUDE_PERMISSION" && requestId != null) {
            NotificationHelper.showPermissionNotification(this, title, body, requestId)
        } else {
            NotificationHelper.showEventNotification(this, title, body)
        }
    }
}
