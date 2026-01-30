package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.VideoUploadResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part

/**
 * Retrofit API service interface for video endpoints.
 * Defined according to PRD Section 5.2 Video Endpoints.
 */
interface VideoApiService {

    /**
     * Upload a video file.
     * POST /api/videos/upload
     *
     * Request: multipart/form-data
     * - video: file (video file)
     * - title: string (optional, auto-generated if empty)
     */
    @Multipart
    @POST("api/videos/upload")
    suspend fun uploadVideo(
        @Part video: MultipartBody.Part,
        @Part("title") title: RequestBody?
    ): Response<VideoUploadResponse>
}
