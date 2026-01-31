package com.deadmansdrop.app.data.api

import com.deadmansdrop.app.data.api.models.VideoDeleteResponse
import com.deadmansdrop.app.data.api.models.VideoListResponse
import com.deadmansdrop.app.data.api.models.VideoUploadResponse
import okhttp3.MultipartBody
import okhttp3.RequestBody
import retrofit2.Response
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Path
import retrofit2.http.Query

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

    /**
     * List user's videos.
     * GET /api/videos
     *
     * @param status Optional filter by video status
     * @param limit Number of videos to return (default: 50)
     * @param offset Pagination offset (default: 0)
     */
    @GET("api/videos")
    suspend fun getVideos(
        @Query("status") status: String? = null,
        @Query("limit") limit: Int = 50,
        @Query("offset") offset: Int = 0
    ): Response<VideoListResponse>

    /**
     * Delete a video.
     * DELETE /api/videos/:id
     *
     * @param id Video ID to delete
     */
    @DELETE("api/videos/{id}")
    suspend fun deleteVideo(
        @Path("id") id: String
    ): Response<VideoDeleteResponse>
}
