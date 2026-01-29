package com.deadmansdrop.app.data.auth

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.RefreshTokenResponse

/**
 * Interface for managing JWT token operations.
 * This interface helps break circular dependencies between the network layer
 * and authentication components.
 */
interface TokenManager {

    /**
     * Get the current JWT token.
     * @return The JWT token or null if not authenticated
     */
    fun getToken(): String?

    /**
     * Get the token expiry timestamp in milliseconds.
     * @return The expiry timestamp or 0 if not set
     */
    fun getTokenExpiry(): Long

    /**
     * Check if the current token is expired or about to expire.
     * @return true if the token needs to be refreshed
     */
    fun isTokenExpiredOrExpiring(): Boolean

    /**
     * Update the stored token after a successful refresh.
     * @param newToken The new JWT token
     * @param newExpiry The expiry timestamp of the new token
     */
    fun updateToken(newToken: String, newExpiry: Long)

    /**
     * Attempt to refresh the token.
     * @return ApiResult containing the new token response or an error
     */
    suspend fun refreshToken(): ApiResult<RefreshTokenResponse>

    /**
     * Clear all authentication state.
     * Called when refresh fails and user needs to re-authenticate.
     */
    fun clearAuthState()

    /**
     * Check if the user is currently authenticated.
     * @return true if the user has a valid, non-expired token
     */
    fun isAuthenticated(): Boolean
}
