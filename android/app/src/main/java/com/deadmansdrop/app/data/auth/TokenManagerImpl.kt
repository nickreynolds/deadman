package com.deadmansdrop.app.data.auth

import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.AuthApiService
import com.deadmansdrop.app.data.api.models.RefreshTokenRequest
import com.deadmansdrop.app.data.api.models.RefreshTokenResponse
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.gson.Gson
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implementation of TokenManager that handles JWT token refresh operations.
 *
 * Uses a separate OkHttpClient for token refresh to avoid circular dependencies
 * with the main authenticated client.
 */
@Singleton
class TokenManagerImpl @Inject constructor(
    private val credentialManager: CredentialManager,
    private val gson: Gson,
    private val loggingInterceptor: HttpLoggingInterceptor,
    private val authStateManager: AuthStateManager
) : TokenManager {

    companion object {
        // Buffer time before expiry to trigger proactive refresh (5 minutes)
        private const val EXPIRY_BUFFER_MS = 5 * 60 * 1000L

        // Timeout settings for refresh requests
        private const val CONNECT_TIMEOUT_SECONDS = 30L
        private const val READ_TIMEOUT_SECONDS = 30L
    }

    // Lazy-initialized refresh client to avoid creating it unnecessarily
    private val refreshClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(CONNECT_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .readTimeout(READ_TIMEOUT_SECONDS, TimeUnit.SECONDS)
            .addInterceptor(loggingInterceptor)
            .build()
    }

    private var cachedAuthService: AuthApiService? = null
    private var cachedServerUrl: String? = null

    override fun getToken(): String? {
        return credentialManager.getJwtToken()
    }

    override fun getTokenExpiry(): Long {
        return credentialManager.getJwtExpiry()
    }

    override fun isTokenExpiredOrExpiring(): Boolean {
        val expiry = getTokenExpiry()
        if (expiry == 0L) return true

        val currentTime = System.currentTimeMillis()
        return currentTime >= (expiry - EXPIRY_BUFFER_MS)
    }

    override fun updateToken(newToken: String, newExpiry: Long) {
        credentialManager.updateJwtToken(newToken, newExpiry)
    }

    override suspend fun refreshToken(): ApiResult<RefreshTokenResponse> {
        val currentToken = getToken()
            ?: return ApiResult.Error("No token available for refresh")

        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("No server URL configured")

        val authService = getOrCreateAuthService(serverUrl)
        val request = RefreshTokenRequest(token = currentToken)

        return ApiClient.safeApiCall {
            authService.refreshToken(request)
        }
    }

    override fun clearAuthState() {
        credentialManager.logout()
        cachedAuthService = null
        cachedServerUrl = null
        // Notify UI components that user has been logged out
        authStateManager.notifyLoggedOut()
    }

    override fun isAuthenticated(): Boolean {
        return credentialManager.isAuthenticated()
    }

    /**
     * Get or create the AuthApiService for token refresh.
     * Uses a separate OkHttpClient without the auth interceptor to avoid circular dependency.
     */
    private fun getOrCreateAuthService(serverUrl: String): AuthApiService {
        val normalizedUrl = normalizeBaseUrl(serverUrl)

        if (cachedAuthService == null || cachedServerUrl != normalizedUrl) {
            cachedServerUrl = normalizedUrl
            cachedAuthService = Retrofit.Builder()
                .baseUrl(normalizedUrl)
                .client(refreshClient)
                .addConverterFactory(GsonConverterFactory.create(gson))
                .build()
                .create(AuthApiService::class.java)
        }

        return cachedAuthService!!
    }

    private fun normalizeBaseUrl(url: String): String {
        val trimmed = url.trim()
        return if (trimmed.endsWith("/")) trimmed else "$trimmed/"
    }
}
