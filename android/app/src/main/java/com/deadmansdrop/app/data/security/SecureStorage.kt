package com.deadmansdrop.app.data.security

/**
 * Interface for secure credential storage.
 * Implementations should use encryption at rest to protect sensitive data.
 */
interface SecureStorage {

    /**
     * Store a string value securely.
     * @param key The key to store the value under
     * @param value The value to store (null to remove)
     */
    fun putString(key: String, value: String?)

    /**
     * Retrieve a string value.
     * @param key The key to retrieve
     * @return The stored value, or null if not found
     */
    fun getString(key: String): String?

    /**
     * Store a boolean value securely.
     * @param key The key to store the value under
     * @param value The value to store
     */
    fun putBoolean(key: String, value: Boolean)

    /**
     * Retrieve a boolean value.
     * @param key The key to retrieve
     * @param defaultValue The default value if key not found
     * @return The stored value, or defaultValue if not found
     */
    fun getBoolean(key: String, defaultValue: Boolean = false): Boolean

    /**
     * Store a long value securely.
     * @param key The key to store the value under
     * @param value The value to store
     */
    fun putLong(key: String, value: Long)

    /**
     * Retrieve a long value.
     * @param key The key to retrieve
     * @param defaultValue The default value if key not found
     * @return The stored value, or defaultValue if not found
     */
    fun getLong(key: String, defaultValue: Long = 0L): Long

    /**
     * Check if a key exists in storage.
     * @param key The key to check
     * @return true if the key exists
     */
    fun contains(key: String): Boolean

    /**
     * Remove a specific key from storage.
     * @param key The key to remove
     */
    fun remove(key: String)

    /**
     * Clear all stored data.
     * Use with caution - this removes all credentials.
     */
    fun clear()

    companion object {
        // Auth-related keys
        const val KEY_JWT_TOKEN = "jwt_token"
        const val KEY_JWT_EXPIRY = "jwt_expiry"
        const val KEY_USER_ID = "user_id"
        const val KEY_USERNAME = "username"
        const val KEY_IS_ADMIN = "is_admin"
        const val KEY_SERVER_URL = "server_url"
        const val KEY_FCM_TOKEN = "fcm_token"
        const val KEY_FCM_TOKEN_SYNCED = "fcm_token_synced"
    }
}
