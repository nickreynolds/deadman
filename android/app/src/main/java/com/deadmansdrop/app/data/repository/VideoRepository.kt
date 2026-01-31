package com.deadmansdrop.app.data.repository

import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.VideoApiService
import com.deadmansdrop.app.data.api.models.CheckInRequest
import com.deadmansdrop.app.data.api.models.VideoCheckInResponse
import com.deadmansdrop.app.data.api.models.VideoDeleteResponse
import com.deadmansdrop.app.data.api.models.VideoDetailResponse
import com.deadmansdrop.app.data.api.models.VideoListResponse
import com.deadmansdrop.app.data.security.CredentialManager
import retrofit2.Retrofit

/**
 * Repository for fetching and managing videos from the server.
 * Provided by [com.deadmansdrop.app.di.RepositoryModule].
 */
class VideoRepository(
    private val credentialManager: CredentialManager,
    private val retrofitBuilder: Retrofit.Builder
) {
    private var videoApiService: VideoApiService? = null
    private var currentServerUrl: String? = null

    /**
     * Fetch the list of videos for the current user.
     *
     * @param status Optional filter by video status (PENDING, ACTIVE, DISTRIBUTED, EXPIRED)
     * @param limit Number of videos to return (default: 50)
     * @param offset Pagination offset (default: 0)
     * @return ApiResult containing the video list or error
     */
    suspend fun getVideos(
        status: String? = null,
        limit: Int = 50,
        offset: Int = 0
    ): ApiResult<VideoListResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateVideoApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.getVideos(status, limit, offset)
        }
    }

    /**
     * Fetch a single video's details by ID.
     *
     * @param videoId The ID of the video to retrieve
     * @return ApiResult containing the video details or error
     */
    suspend fun getVideoDetail(videoId: String): ApiResult<VideoDetailResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateVideoApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.getVideoDetail(videoId)
        }
    }

    /**
     * Delete a video by ID.
     *
     * @param videoId The ID of the video to delete
     * @return ApiResult containing success status or error
     */
    suspend fun deleteVideo(videoId: String): ApiResult<VideoDeleteResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateVideoApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.deleteVideo(videoId)
        }
    }

    /**
     * Perform a check-in action on a video.
     *
     * @param videoId The ID of the video to check in
     * @param action The check-in action (PREVENT_DISTRIBUTION or ALLOW_DISTRIBUTION)
     * @return ApiResult containing the updated video and check-in record, or error
     */
    suspend fun checkInVideo(videoId: String, action: String): ApiResult<VideoCheckInResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateVideoApiService(serverUrl)

        return ApiClient.safeApiCall {
            service.checkInVideo(videoId, CheckInRequest(action))
        }
    }

    /**
     * Get or create VideoApiService for the given server URL.
     * Caches the service and recreates if the server URL changes.
     */
    private fun getOrCreateVideoApiService(serverUrl: String): VideoApiService {
        // Recreate service if server URL changed
        if (currentServerUrl != serverUrl) {
            videoApiService = null
            currentServerUrl = serverUrl
        }

        return videoApiService ?: run {
            val normalizedUrl = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
            val retrofit = retrofitBuilder
                .baseUrl(normalizedUrl)
                .build()
            retrofit.create(VideoApiService::class.java).also {
                videoApiService = it
            }
        }
    }

    /**
     * Clear cached API service (useful when server URL changes or on logout).
     */
    fun clearApiServiceCache() {
        videoApiService = null
        currentServerUrl = null
    }
}
