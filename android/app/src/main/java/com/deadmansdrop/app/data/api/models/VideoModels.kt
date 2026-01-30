package com.deadmansdrop.app.data.api.models

import com.google.gson.annotations.SerializedName

/**
 * Video metadata returned from the server.
 * Based on PRD Section 4.2 Video data model.
 */
data class VideoResponse(
    @SerializedName("id") val id: String,
    @SerializedName("user_id") val userId: String,
    @SerializedName("title") val title: String,
    @SerializedName("file_path") val filePath: String,
    @SerializedName("file_size_bytes") val fileSizeBytes: Long,
    @SerializedName("mime_type") val mimeType: String,
    @SerializedName("status") val status: String,
    @SerializedName("distribute_at") val distributeAt: String,
    @SerializedName("distributed_at") val distributedAt: String?,
    @SerializedName("expires_at") val expiresAt: String?,
    @SerializedName("public_token") val publicToken: String,
    @SerializedName("created_at") val createdAt: String,
    @SerializedName("updated_at") val updatedAt: String
)

/**
 * Response from POST /api/videos/upload
 */
data class VideoUploadResponse(
    @SerializedName("video") val video: VideoResponse
)

/**
 * Response from GET /api/videos
 */
data class VideoListResponse(
    @SerializedName("videos") val videos: List<VideoResponse>,
    @SerializedName("total") val total: Int
)

/**
 * Response from GET /api/videos/:id
 */
data class VideoDetailResponse(
    @SerializedName("video") val video: VideoResponse
)

/**
 * Response from DELETE /api/videos/:id
 */
data class VideoDeleteResponse(
    @SerializedName("success") val success: Boolean
)

/**
 * Video status enum matching server-side VideoStatus.
 */
enum class VideoStatus {
    PENDING,
    ACTIVE,
    DISTRIBUTED,
    EXPIRED
}
