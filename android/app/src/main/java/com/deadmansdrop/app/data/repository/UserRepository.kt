package com.deadmansdrop.app.data.repository

import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.UserApiService
import com.deadmansdrop.app.data.api.models.UpdateUserSettingsRequest
import com.deadmansdrop.app.data.api.models.UpdateUserSettingsResponse
import com.deadmansdrop.app.data.security.CredentialManager
import retrofit2.Retrofit

/**
 * Repository for user settings operations.
 * Handles API calls for reading and updating user settings.
 */
class UserRepository(
    private val credentialManager: CredentialManager,
    private val retrofitBuilder: Retrofit.Builder
) {
    private var userApiService: UserApiService? = null
    private var currentServerUrl: String? = null

    /**
     * Update user settings on the server.
     *
     * @param fcmToken Optional FCM token to update
     * @param defaultTimerDays Optional default timer value to update
     * @return ApiResult containing the updated settings or error
     */
    suspend fun updateUserSettings(
        fcmToken: String? = null,
        defaultTimerDays: Int? = null
    ): ApiResult<UpdateUserSettingsResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateUserApiService(serverUrl)
        val request = UpdateUserSettingsRequest(
            fcmToken = fcmToken,
            defaultTimerDays = defaultTimerDays
        )

        return ApiClient.safeApiCall {
            service.updateUserSettings(request)
        }
    }

    /**
     * Get or create UserApiService for the given server URL.
     * Caches the service and recreates if the server URL changes.
     */
    private fun getOrCreateUserApiService(serverUrl: String): UserApiService {
        if (currentServerUrl != serverUrl) {
            userApiService = null
            currentServerUrl = serverUrl
        }

        return userApiService ?: run {
            val normalizedUrl = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
            val retrofit = retrofitBuilder
                .baseUrl(normalizedUrl)
                .build()
            retrofit.create(UserApiService::class.java).also {
                userApiService = it
            }
        }
    }

    /**
     * Clear cached API service (useful when server URL changes or on logout).
     */
    fun clearApiServiceCache() {
        userApiService = null
        currentServerUrl = null
    }
}
