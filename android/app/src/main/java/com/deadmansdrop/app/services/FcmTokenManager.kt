package com.deadmansdrop.app.services

import android.util.Log
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages FCM token registration and refresh.
 * Obtains the current FCM token from Firebase and stores it locally.
 */
@Singleton
class FcmTokenManager @Inject constructor(
    private val credentialManager: CredentialManager
) {

    /**
     * Registers for FCM by obtaining the current token.
     * Saves the token locally via CredentialManager and marks it as unsynced.
     * Should be called after successful login.
     *
     * @return the FCM token, or null if registration failed
     */
    suspend fun registerForFcm(): String? {
        return try {
            val token = FirebaseMessaging.getInstance().token.await()
            Log.d(TAG, "FCM token obtained successfully")

            val existingToken = credentialManager.getFcmToken()
            if (existingToken != token) {
                // Token is new or changed — save and mark unsynced
                credentialManager.saveFcmToken(token)
                Log.d(TAG, "New FCM token saved locally, marked as unsynced")
            } else if (!credentialManager.isFcmTokenSynced()) {
                Log.d(TAG, "FCM token unchanged but not yet synced with server")
            } else {
                Log.d(TAG, "FCM token unchanged and already synced")
            }

            token
        } catch (e: Exception) {
            Log.e(TAG, "Failed to obtain FCM token", e)
            null
        }
    }

    companion object {
        private const val TAG = "FcmTokenManager"
    }
}
