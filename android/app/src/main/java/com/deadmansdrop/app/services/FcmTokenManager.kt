package com.deadmansdrop.app.services

import android.util.Log
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.repository.UserRepository
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages FCM token registration, refresh, and server synchronization.
 * Obtains the current FCM token from Firebase, stores it locally,
 * and sends it to the backend via PATCH /api/user/settings.
 */
@Singleton
class FcmTokenManager @Inject constructor(
    private val credentialManager: CredentialManager,
    private val userRepository: UserRepository
) {

    /**
     * Registers for FCM by obtaining the current token.
     * Saves the token locally via CredentialManager and marks it as unsynced.
     * Then attempts to sync the token with the server.
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

            // Sync with server if not yet synced
            syncFcmTokenIfNeeded()

            token
        } catch (e: Exception) {
            Log.e(TAG, "Failed to obtain FCM token", e)
            null
        }
    }

    /**
     * Sends the FCM token to the backend if it hasn't been synced yet.
     * Called after token registration and can also be called independently
     * to retry a previously failed sync.
     */
    suspend fun syncFcmTokenIfNeeded() {
        if (credentialManager.isFcmTokenSynced()) {
            Log.d(TAG, "FCM token already synced, skipping")
            return
        }

        val token = credentialManager.getFcmToken()
        if (token.isNullOrBlank()) {
            Log.w(TAG, "No FCM token available to sync")
            return
        }

        if (!credentialManager.isAuthenticated()) {
            Log.d(TAG, "Not authenticated, deferring FCM token sync")
            return
        }

        try {
            Log.d(TAG, "Syncing FCM token with server...")
            when (val result = userRepository.updateUserSettings(fcmToken = token)) {
                is ApiResult.Success -> {
                    credentialManager.markFcmTokenSynced()
                    Log.d(TAG, "FCM token synced with server successfully")
                }
                is ApiResult.Error -> {
                    Log.e(TAG, "Failed to sync FCM token: ${result.message}")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Exception syncing FCM token with server", e)
        }
    }

    companion object {
        private const val TAG = "FcmTokenManager"
    }
}
