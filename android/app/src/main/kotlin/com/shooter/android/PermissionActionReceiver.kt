package com.shooter.android

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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

class PermissionActionReceiver : BroadcastReceiver() {

    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()

    override fun onReceive(context: Context, intent: Intent) {
        val requestId = intent.getStringExtra(EXTRA_REQUEST_ID) ?: return
        val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, -1)

        val decision = when (intent.action) {
            ACTION_ALLOW -> "allow"
            ACTION_DENY -> "deny"
            else -> return
        }

        // Cancel the notification immediately
        if (notificationId != -1) {
            val manager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.cancel(notificationId)
        }

        val prefs = AppPreferences(context)
        val serverUrl = prefs.serverUrl?.trimEnd('/') ?: return
        val apiKey = prefs.apiKey ?: return

        // Use goAsync() to keep the receiver alive during the network call
        val pendingResult = goAsync()

        val json = JSONObject().apply {
            put("requestId", requestId)
            put("decision", decision)
        }

        val body = json.toString()
            .toRequestBody("application/json; charset=utf-8".toMediaType())

        val request = Request.Builder()
            .url("$serverUrl/api/response")
            .header("Authorization", "Bearer $apiKey")
            .post(body)
            .build()

        sendWithRetry(request, pendingResult, attempt = 1)
    }

    private fun sendWithRetry(
        request: Request,
        pendingResult: PendingResult,
        attempt: Int
    ) {
        client.newCall(request).enqueue(object : Callback {
            override fun onFailure(call: Call, e: IOException) {
                if (attempt < MAX_RETRIES) {
                    val delayMs = INITIAL_BACKOFF_MS * (1L shl (attempt - 1))
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        sendWithRetry(request, pendingResult, attempt + 1)
                    }, delayMs)
                } else {
                    pendingResult.finish()
                }
            }

            override fun onResponse(call: Call, response: Response) {
                response.close()
                if (!response.isSuccessful && attempt < MAX_RETRIES) {
                    val delayMs = INITIAL_BACKOFF_MS * (1L shl (attempt - 1))
                    android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                        sendWithRetry(request, pendingResult, attempt + 1)
                    }, delayMs)
                } else {
                    pendingResult.finish()
                }
            }
        })
    }

    companion object {
        private const val MAX_RETRIES = 3
        private const val INITIAL_BACKOFF_MS = 1000L
        const val ACTION_ALLOW = "com.shooter.android.ACTION_ALLOW"
        const val ACTION_DENY = "com.shooter.android.ACTION_DENY"
        const val EXTRA_REQUEST_ID = "extra_request_id"
        const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
    }
}
