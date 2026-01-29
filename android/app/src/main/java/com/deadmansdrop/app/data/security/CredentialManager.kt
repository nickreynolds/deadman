package com.deadmansdrop.app.data.security

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication credentials using secure storage.
 * Provides a high-level API for storing and retrieving auth-related data.
 */
@Singleton
class CredentialManager @Inject constructor(
    private val secureStorage: SecureStorage
) {

    /**
     * Store authentication credentials after successful login.
     */
    fun saveAuthCredentials(
        jwtToken: String,
        jwtExpiry: Long,
        userId: String,
        username: String,
        isAdmin: Boolean
    ) {
        secureStorage.putString(SecureStorage.KEY_JWT_TOKEN, jwtToken)
        secureStorage.putLong(SecureStorage.KEY_JWT_EXPIRY, jwtExpiry)
        secureStorage.putString(SecureStorage.KEY_USER_ID, userId)
        secureStorage.putString(SecureStorage.KEY_USERNAME, username)
        secureStorage.putBoolean(SecureStorage.KEY_IS_ADMIN, isAdmin)
    }

    /**
     * Store the server URL the user connected to.
     */
    fun saveServerUrl(serverUrl: String) {
        secureStorage.putString(SecureStorage.KEY_SERVER_URL, serverUrl)
    }

    /**
     * Get the stored server URL.
     */
    fun getServerUrl(): String? {
        return secureStorage.getString(SecureStorage.KEY_SERVER_URL)
    }

    /**
     * Get the stored JWT token.
     */
    fun getJwtToken(): String? {
        return secureStorage.getString(SecureStorage.KEY_JWT_TOKEN)
    }

    /**
     * Get the JWT expiry timestamp.
     */
    fun getJwtExpiry(): Long {
        return secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L)
    }

    /**
     * Check if the JWT token has expired.
     * Includes a 5-minute buffer to allow for clock skew.
     */
    fun isTokenExpired(): Boolean {
        val expiry = getJwtExpiry()
        if (expiry == 0L) return true

        val bufferMs = 5 * 60 * 1000L // 5 minutes
        return System.currentTimeMillis() >= (expiry - bufferMs)
    }

    /**
     * Check if the user is currently authenticated (has a valid token).
     */
    fun isAuthenticated(): Boolean {
        val token = getJwtToken()
        return !token.isNullOrBlank() && !isTokenExpired()
    }

    /**
     * Get the current user ID.
     */
    fun getUserId(): String? {
        return secureStorage.getString(SecureStorage.KEY_USER_ID)
    }

    /**
     * Get the current username.
     */
    fun getUsername(): String? {
        return secureStorage.getString(SecureStorage.KEY_USERNAME)
    }

    /**
     * Check if the current user is an admin.
     */
    fun isAdmin(): Boolean {
        return secureStorage.getBoolean(SecureStorage.KEY_IS_ADMIN, false)
    }

    /**
     * Update the JWT token (e.g., after refresh).
     */
    fun updateJwtToken(newToken: String, newExpiry: Long) {
        secureStorage.putString(SecureStorage.KEY_JWT_TOKEN, newToken)
        secureStorage.putLong(SecureStorage.KEY_JWT_EXPIRY, newExpiry)
    }

    /**
     * Store the FCM token for push notifications.
     */
    fun saveFcmToken(fcmToken: String) {
        secureStorage.putString(SecureStorage.KEY_FCM_TOKEN, fcmToken)
        // Mark as not synced with server
        secureStorage.putBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, false)
    }

    /**
     * Get the stored FCM token.
     */
    fun getFcmToken(): String? {
        return secureStorage.getString(SecureStorage.KEY_FCM_TOKEN)
    }

    /**
     * Check if FCM token has been synced with the server.
     */
    fun isFcmTokenSynced(): Boolean {
        return secureStorage.getBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, false)
    }

    /**
     * Mark the FCM token as synced with the server.
     */
    fun markFcmTokenSynced() {
        secureStorage.putBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, true)
    }

    /**
     * Clear all credentials on logout.
     * Preserves server URL so user doesn't have to re-enter it.
     */
    fun logout() {
        val serverUrl = getServerUrl()
        secureStorage.clear()
        // Restore server URL for convenience
        serverUrl?.let { saveServerUrl(it) }
    }

    /**
     * Clear all stored data including server URL.
     * Use this for complete app reset.
     */
    fun clearAll() {
        secureStorage.clear()
    }
}
