package com.shooter.android

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context

class ShooterApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        val permissionsChannel = NotificationChannel(
            CHANNEL_PERMISSIONS,
            "Permission Requests",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Allow/Deny permission requests from coding sessions"
            enableVibration(true)
            setShowBadge(true)
        }

        val eventsChannel = NotificationChannel(
            CHANNEL_EVENTS,
            "Session Events",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Notifications for coding session events"
            setShowBadge(true)
        }

        manager.createNotificationChannel(permissionsChannel)
        manager.createNotificationChannel(eventsChannel)
    }

    companion object {
        const val CHANNEL_PERMISSIONS = "permissions"
        const val CHANNEL_EVENTS = "events"
    }
}
