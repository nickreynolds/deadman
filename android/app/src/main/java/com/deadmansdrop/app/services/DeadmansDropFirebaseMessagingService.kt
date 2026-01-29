package com.deadmansdrop.app.services

import android.util.Log
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Firebase Cloud Messaging service for handling push notifications.
 * Handles FCM token updates and incoming notification messages.
 */
class DeadmansDropFirebaseMessagingService : FirebaseMessagingService() {

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token received")
        // TODO: Send token to backend via PATCH /api/user/settings
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        Log.d(TAG, "Message received from: ${remoteMessage.from}")

        // Handle data payload for deep linking
        remoteMessage.data.isNotEmpty().let {
            Log.d(TAG, "Message data payload: ${remoteMessage.data}")
            handleDataPayload(remoteMessage.data)
        }

        // Handle notification payload (when app is in foreground)
        remoteMessage.notification?.let {
            Log.d(TAG, "Message notification body: ${it.body}")
            // TODO: Show notification when app is in foreground
        }
    }

    private fun handleDataPayload(data: Map<String, String>) {
        val videoId = data["videoId"]
        val action = data["action"]
        val type = data["type"]

        Log.d(TAG, "Deep link data - type: $type, action: $action, videoId: $videoId")
        // TODO: Navigate to appropriate screen based on action
    }

    companion object {
        private const val TAG = "FCMService"
    }
}
