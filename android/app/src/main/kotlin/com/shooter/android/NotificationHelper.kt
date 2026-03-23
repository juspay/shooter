package com.shooter.android

import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import androidx.core.app.NotificationCompat

object NotificationHelper {

    private var notificationId = 1000

    fun showPermissionNotification(
        context: Context,
        title: String,
        body: String,
        requestId: String
    ) {
        val id = nextNotificationId()

        val allowIntent = Intent(context, PermissionActionReceiver::class.java).apply {
            action = PermissionActionReceiver.ACTION_ALLOW
            putExtra(PermissionActionReceiver.EXTRA_REQUEST_ID, requestId)
            putExtra(PermissionActionReceiver.EXTRA_NOTIFICATION_ID, id)
        }
        val allowPending = PendingIntent.getBroadcast(
            context,
            id * 10 + 1,
            allowIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val denyIntent = Intent(context, PermissionActionReceiver::class.java).apply {
            action = PermissionActionReceiver.ACTION_DENY
            putExtra(PermissionActionReceiver.EXTRA_REQUEST_ID, requestId)
            putExtra(PermissionActionReceiver.EXTRA_NOTIFICATION_ID, id)
        }
        val denyPending = PendingIntent.getBroadcast(
            context,
            id * 10 + 2,
            denyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val contentIntent = PendingIntent.getActivity(
            context,
            id * 10 + 3,
            Intent(context, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, ShooterApplication.CHANNEL_PERMISSIONS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .addAction(0, "Allow", allowPending)
            .addAction(0, "Deny", denyPending)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(id, notification)
    }

    fun showEventNotification(context: Context, title: String, body: String) {
        val id = nextNotificationId()

        val contentIntent = PendingIntent.getActivity(
            context,
            id,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, ShooterApplication.CHANNEL_EVENTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .setContentIntent(contentIntent)
            .build()

        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(id, notification)
    }

    @Synchronized
    private fun nextNotificationId(): Int {
        return notificationId++
    }
}
