package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.GetUserSettingsResponse
import com.deadmansdrop.app.data.api.models.UpdateUserSettingsRequest
import com.deadmansdrop.app.data.api.models.UpdateUserSettingsResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.PATCH

/**
 * Retrofit API service interface for user settings endpoints.
 * Defined according to PRD Section 5.3 User Settings Endpoints.
 */
interface UserApiService {

    /**
     * Get current user settings.
     * GET /api/user/settings
     */
    @GET("api/user/settings")
    suspend fun getUserSettings(): Response<GetUserSettingsResponse>

    /**
     * Update user settings including FCM token.
     * PATCH /api/user/settings
     */
    @PATCH("api/user/settings")
    suspend fun updateUserSettings(
        @Body request: UpdateUserSettingsRequest
    ): Response<UpdateUserSettingsResponse>
}
