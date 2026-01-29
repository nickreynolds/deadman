package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.LoginRequest
import com.deadmansdrop.app.data.api.models.LoginResponse
import com.deadmansdrop.app.data.api.models.RefreshTokenRequest
import com.deadmansdrop.app.data.api.models.RefreshTokenResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.POST

/**
 * Retrofit API service interface for authentication endpoints.
 * Defined according to PRD Section 5.1 Authentication Endpoints.
 */
interface AuthApiService {

    /**
     * Authenticate user and return JWT token.
     * POST /api/auth/login
     */
    @POST("api/auth/login")
    suspend fun login(@Body request: LoginRequest): Response<LoginResponse>

    /**
     * Refresh JWT token.
     * POST /api/auth/refresh
     */
    @POST("api/auth/refresh")
    suspend fun refreshToken(@Body request: RefreshTokenRequest): Response<RefreshTokenResponse>
}
