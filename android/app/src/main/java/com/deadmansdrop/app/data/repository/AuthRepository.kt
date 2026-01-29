package com.deadmansdrop.app.data.repository

import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.AuthApiService
import com.deadmansdrop.app.data.api.models.LoginRequest
import com.deadmansdrop.app.data.api.models.LoginResponse
import com.deadmansdrop.app.data.api.models.RefreshTokenRequest
import com.deadmansdrop.app.data.api.models.RefreshTokenResponse
import com.deadmansdrop.app.data.security.CredentialManager
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for authentication operations.
 * Handles API calls for login and token refresh.
 */
@Singleton
class AuthRepository @Inject constructor(
    private val retrofitBuilder: Retrofit.Builder,
    private val credentialManager: CredentialManager
) {

    private var currentServerUrl: String? = null
    private var authApiService: AuthApiService? = null

    /**
     * Get or create AuthApiService for the given server URL.
     * Reuses existing service if URL hasn't changed.
     */
    private fun getApiService(serverUrl: String): AuthApiService {
        val normalizedUrl = normalizeBaseUrl(serverUrl)

        if (authApiService == null || currentServerUrl != normalizedUrl) {
            currentServerUrl = normalizedUrl
            authApiService = retrofitBuilder
                .baseUrl(normalizedUrl)
                .build()
                .create(AuthApiService::class.java)
        }

        return authApiService!!
    }

    /**
     * Normalize the base URL to ensure it ends with a trailing slash.
     */
    private fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }

    /**
     * Attempt to login with username and password.
     *
     * @param serverUrl The server URL to authenticate against
     * @param username The username
     * @param password The password
     * @return ApiResult containing LoginResponse on success or error details
     */
    suspend fun login(
        serverUrl: String,
        username: String,
        password: String
    ): ApiResult<LoginResponse> {
        val apiService = getApiService(serverUrl)
        val request = LoginRequest(username = username, password = password)

        return ApiClient.safeApiCall {
            apiService.login(request)
        }
    }

    /**
     * Refresh the JWT token.
     *
     * @param serverUrl The server URL (optional, uses stored URL if not provided)
     * @param currentToken The current JWT token to refresh
     * @return ApiResult containing RefreshTokenResponse on success or error details
     */
    suspend fun refreshToken(
        serverUrl: String? = null,
        currentToken: String
    ): ApiResult<RefreshTokenResponse> {
        val url = serverUrl ?: credentialManager.getServerUrl()
            ?: return ApiResult.Error("No server URL configured")

        val apiService = getApiService(url)
        val request = RefreshTokenRequest(token = currentToken)

        return ApiClient.safeApiCall {
            apiService.refreshToken(request)
        }
    }

    /**
     * Clear the cached API service.
     * Call this on logout or when server URL changes.
     */
    fun clearCache() {
        authApiService = null
        currentServerUrl = null
    }
}
