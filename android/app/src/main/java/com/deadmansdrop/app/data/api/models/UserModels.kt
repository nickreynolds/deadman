package com.deadmansdrop.app.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * Response from GET /api/user/settings.
 * Returns settings directly (not wrapped in a "settings" key).
 */
data class GetUserSettingsResponse(
    @SerializedName("default_timer_days") val defaultTimerDays: Int,
    @SerializedName("storage_quota_bytes") val storageQuotaBytes: Long,
    @SerializedName("storage_used_bytes") val storageUsedBytes: Long,
    @SerializedName("fcm_token") val fcmToken: String?
)

/**
 * Request body for PATCH /api/user/settings.
 * All fields are optional — only provided fields are updated.
 */
data class UpdateUserSettingsRequest(
    @SerializedName("default_timer_days") val defaultTimerDays: Int? = null,
    @SerializedName("fcm_token") val fcmToken: String? = null
)

/**
 * Response from PATCH /api/user/settings.
 */
data class UpdateUserSettingsResponse(
    @SerializedName("settings") val settings: UserSettings
)

/**
 * User settings data.
 */
data class UserSettings(
    @SerializedName("default_timer_days") val defaultTimerDays: Int,
    @SerializedName("storage_quota_bytes") val storageQuotaBytes: Long,
    @SerializedName("storage_used_bytes") val storageUsedBytes: Long,
    @SerializedName("fcm_token") val fcmToken: String?
)
