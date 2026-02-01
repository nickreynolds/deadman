package com.deadmansdrop.app.services

import android.util.Log
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
