package com.deadmansdrop.app.data.auth

import android.util.Log
import com.deadmansdrop.app.data.api.ApiResult
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Authenticator
import okhttp3.Request
import okhttp3.Response
import okhttp3.Route
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp Authenticator that handles 401 Unauthorized responses by attempting
 * to refresh the JWT token.
 *
 * Thread-safe implementation that prevents multiple simultaneous refresh attempts.
 */
@Singleton
class TokenAuthenticator @Inject constructor(
    private val tokenManager: TokenManager
) : Authenticator {

    companion object {
        private const val TAG = "TokenAuthenticator"
        private const val MAX_RETRY_COUNT = 1
        private const val HEADER_RETRY_COUNT = "X-Retry-Count"
    }

    private val refreshMutex = Mutex()

    override fun authenticate(route: Route?, response: Response): Request? {
        // Check if this is a refresh endpoint to avoid infinite loops
        if (response.request.url.encodedPath.contains("auth/refresh")) {
            Log.d(TAG, "Token refresh endpoint returned 401, giving up")
            return null
        }

        // Check retry count to prevent infinite loops
        val retryCount = response.request.header(HEADER_RETRY_COUNT)?.toIntOrNull() ?: 0
        if (retryCount >= MAX_RETRY_COUNT) {
            Log.d(TAG, "Max retry count reached, giving up")
            return null
        }

        Log.d(TAG, "Received 401, attempting token refresh")

        return runBlocking {
            refreshMutex.withLock {
                // Double-check: another thread might have already refreshed the token
                val currentToken = tokenManager.getToken()
                val requestToken = response.request.header("Authorization")
                    ?.removePrefix("Bearer ")

                // If the token has changed since this request was made,
                // retry with the new token without refreshing
                if (currentToken != null && currentToken != requestToken) {
                    Log.d(TAG, "Token already refreshed by another thread, retrying with new token")
                    return@runBlocking retryRequestWithToken(response.request, currentToken, retryCount)
                }

                // Attempt to refresh the token
                when (val result = tokenManager.refreshToken()) {
                    is ApiResult.Success -> {
                        val newToken = result.data.token
                        val newExpiry = parseTokenExpiry(newToken)
                        tokenManager.updateToken(newToken, newExpiry)
                        Log.d(TAG, "Token refresh successful")
                        retryRequestWithToken(response.request, newToken, retryCount)
                    }
                    is ApiResult.Error -> {
                        Log.e(TAG, "Token refresh failed: ${result.message}")
                        // Clear auth state so user will be prompted to log in again
                        tokenManager.clearAuthState()
                        null
                    }
                }
            }
        }
    }

    /**
     * Create a new request with the refreshed token.
     */
    private fun retryRequestWithToken(
        originalRequest: Request,
        newToken: String,
        currentRetryCount: Int
    ): Request {
        return originalRequest.newBuilder()
            .header("Authorization", "Bearer $newToken")
            .header(HEADER_RETRY_COUNT, (currentRetryCount + 1).toString())
            .build()
    }

    /**
     * Parse the expiry timestamp from a JWT token.
     */
    private fun parseTokenExpiry(token: String): Long {
        return JwtUtils.parseExpiry(token)
    }
}
