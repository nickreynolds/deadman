package com.deadmansdrop.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

/**
 * Main Application class for Deadman's Drop.
 * Initializes Hilt dependency injection and notification channels.
 */
@HiltAndroidApp
class DeadmansDropApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val notificationManager = getSystemService(NotificationManager::class.java)

            // Check-in reminder channel
            val checkInChannel = NotificationChannel(
                CHANNEL_CHECKIN_REMINDERS,
                "Check-in Reminders",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Daily reminders to check in and prevent video distribution"
                enableVibration(true)
                enableLights(true)
            }

            // Upload progress channel
            val uploadChannel = NotificationChannel(
                CHANNEL_UPLOAD_PROGRESS,
                "Upload Progress",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows progress of video uploads"
                setShowBadge(false)
            }

            notificationManager.createNotificationChannels(
                listOf(checkInChannel, uploadChannel)
            )
        }
    }

    companion object {
        const val CHANNEL_CHECKIN_REMINDERS = "checkin_reminders"
        const val CHANNEL_UPLOAD_PROGRESS = "upload_progress"
    }
}
