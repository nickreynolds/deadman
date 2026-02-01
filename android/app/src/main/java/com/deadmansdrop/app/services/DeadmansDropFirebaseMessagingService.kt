package com.deadmansdrop.app.services

import android.app.PendingIntent
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.deadmansdrop.app.DeadmansDropApplication
import com.deadmansdrop.app.MainActivity
import com.deadmansdrop.app.R
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Firebase Cloud Messaging service for handling push notifications.
 * Handles FCM token updates and incoming notification messages.
 * When a notification is tapped, navigates to the relevant video detail screen.
 */
@AndroidEntryPoint
class DeadmansDropFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var credentialManager: CredentialManager

    @Inject
    lateinit var fcmTokenManager: FcmTokenManager

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token received")
        credentialManager.saveFcmToken(token)
        Log.d(TAG, "FCM token saved locally, marked as unsynced")

        // Attempt to sync the new token with the server
        serviceScope.launch {
            fcmTokenManager.syncFcmTokenIfNeeded()
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "Message received from: ${remoteMessage.from}")

        val data = remoteMessage.data
        val videoId = data["videoId"]

        // Build notification title and body from either the notification payload or data payload
        val title = remoteMessage.notification?.title ?: data["title"] ?: getString(R.string.notification_checkin_default_title)
        val body = remoteMessage.notification?.body ?: data["body"] ?: getString(R.string.notification_checkin_default_body)

        Log.d(TAG, "Message data payload: $data")
        showNotification(title, body, videoId)
    }

    /**
     * Shows a local notification that, when tapped, opens the app and navigates
     * to the specified video's detail screen.
     */
    private fun showNotification(title: String, body: String, videoId: String?) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (videoId != null) {
                putExtra(MainActivity.EXTRA_VIDEO_ID, videoId)
            }
        }

        // Use videoId hashCode as request code so each video gets its own PendingIntent
        val requestCode = videoId?.hashCode() ?: 0
        val pendingIntent = PendingIntent.getActivity(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, DeadmansDropApplication.CHANNEL_CHECKIN_REMINDERS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(this).notify(requestCode, notification)
        } catch (e: SecurityException) {
            Log.w(TAG, "Notification permission not granted", e)
        }
    }

    companion object {
        private const val TAG = "FCMService"
    }
}
