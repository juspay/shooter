package com.shooter.android

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

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onNewToken(token: String) {
        val prefs = AppPreferences(this)
        prefs.fcmToken = token
        registerTokenWithServer(prefs, token)
    }

    private fun registerTokenWithServer(prefs: AppPreferences, token: String) {
        val serverUrl = prefs.serverUrl?.trimEnd('/') ?: return
        val apiKey = prefs.apiKey ?: return

        val json = JSONObject().apply {
            put("token", token)
            put("platform", "android")
        }

        val body = json.toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url("$serverUrl/api/device-token")
            .header("Authorization", "Bearer $apiKey")
            .post(body)
            .build()

        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                // Token will be re-sent on next refresh or app startup
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
            }
        })
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
