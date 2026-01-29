package com.deadmansdrop.app.data.auth

import android.util.Log
import com.deadmansdrop.app.data.api.ApiResult
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import okhttp3.Interceptor
import okhttp3.Response
import javax.inject.Inject
import javax.inject.Singleton

/**
 * OkHttp Interceptor that proactively refreshes the JWT token before it expires.
 *
 * This interceptor checks the token expiry before each request and refreshes it
 * if it's about to expire, preventing unnecessary 401 errors.
 */
@Singleton
class TokenRefreshInterceptor @Inject constructor(
    private val tokenManager: TokenManager
) : Interceptor {

    companion object {
        private const val TAG = "TokenRefreshInterceptor"

        // Paths that should skip token refresh logic
        private val SKIP_PATHS = listOf(
            "auth/login",
            "auth/refresh",
            "public/"
        )
    }

    private val refreshMutex = Mutex()

    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()

        // Skip token refresh for auth and public endpoints
        if (shouldSkipRefresh(request.url.encodedPath)) {
            return chain.proceed(request)
        }

        // Check if we have a token and if it needs refresh
        val token = tokenManager.getToken()
        if (token != null && tokenManager.isTokenExpiredOrExpiring()) {
            Log.d(TAG, "Token is expired or expiring, attempting proactive refresh")
            attemptProactiveRefresh()
        }

        // Continue with the request - the AuthInterceptor will add the auth header
        return chain.proceed(request)
    }

    private fun shouldSkipRefresh(path: String): Boolean {
        return SKIP_PATHS.any { path.contains(it) }
    }

    /**
     * Attempt to proactively refresh the token.
     * Uses a mutex to prevent multiple simultaneous refresh attempts.
     */
    private fun attemptProactiveRefresh() {
        runBlocking {
            refreshMutex.withLock {
                // Double-check: token might have been refreshed by another thread
                if (!tokenManager.isTokenExpiredOrExpiring()) {
                    Log.d(TAG, "Token already refreshed by another thread")
                    return@withLock
                }

                when (val result = tokenManager.refreshToken()) {
                    is ApiResult.Success -> {
                        val newToken = result.data.token
                        val newExpiry = parseTokenExpiry(newToken)
                        tokenManager.updateToken(newToken, newExpiry)
                        Log.d(TAG, "Proactive token refresh successful")
                    }
                    is ApiResult.Error -> {
                        // Log but don't clear auth state - let the authenticator handle 401
                        Log.w(TAG, "Proactive token refresh failed: ${result.message}")
                    }
                }
            }
        }
    }

    /**
     * Parse the expiry timestamp from a JWT token.
     */
    private fun parseTokenExpiry(token: String): Long {
        return JwtUtils.parseExpiry(token)
    }
}
