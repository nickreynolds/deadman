package com.deadmansdrop.app.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * Request body for POST /api/auth/login
 */
data class LoginRequest(
    @SerializedName("username") val username: String,
    @SerializedName("password") val password: String
)

/**
 * Response from POST /api/auth/login
 */
data class LoginResponse(
    @SerializedName("token") val token: String,
    @SerializedName("user") val user: UserInfo
)

/**
 * User info returned in login response
 */
data class UserInfo(
    @SerializedName("id") val id: String,
    @SerializedName("username") val username: String,
    @SerializedName("is_admin") val isAdmin: Boolean
)

/**
 * Request body for POST /api/auth/refresh
 */
data class RefreshTokenRequest(
    @SerializedName("token") val token: String
)

/**
 * Response from POST /api/auth/refresh
 */
data class RefreshTokenResponse(
    @SerializedName("token") val token: String
)

/**
 * Generic API error response
 */
data class ApiError(
    @SerializedName("error") val error: String?,
    @SerializedName("message") val message: String?,
    @SerializedName("statusCode") val statusCode: Int?
)
