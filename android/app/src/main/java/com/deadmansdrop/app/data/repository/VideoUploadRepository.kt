package com.deadmansdrop.app.data.repository

import android.content.Context
import androidx.work.Constraints
import androidx.work.Data
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import com.deadmansdrop.app.data.api.ApiClient
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.VideoApiService
import com.deadmansdrop.app.data.api.models.VideoUploadResponse
import com.deadmansdrop.app.data.security.CredentialManager
import com.deadmansdrop.app.services.VideoUploadWorker
import com.google.gson.Gson
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import java.io.File
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Repository for managing video uploads using WorkManager.
 * Provides reliable background upload functionality that survives app restarts.
 */
@Singleton
class VideoUploadRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val credentialManager: CredentialManager,
    private val retrofitBuilder: Retrofit.Builder,
    private val gson: Gson
) {
    private val workManager = WorkManager.getInstance(context)
    private var videoApiService: VideoApiService? = null

    /**
     * Schedule a video for upload using WorkManager.
     * The upload will happen in the background and survive app restarts.
     *
     * @param videoFilePath Absolute path to the video file
     * @param title Optional title for the video
     * @return UUID of the upload work request for tracking
     */
    fun scheduleUpload(videoFilePath: String, title: String?): UUID {
        val inputData = Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_PATH, videoFilePath)
            .apply {
                if (!title.isNullOrBlank()) {
                    putString(VideoUploadWorker.KEY_VIDEO_TITLE, title)
                }
            }
            .build()

        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()

        val uploadRequest = OneTimeWorkRequestBuilder<VideoUploadWorker>()
            .setInputData(inputData)
            .setConstraints(constraints)
            .addTag(TAG_VIDEO_UPLOAD)
            .addTag("upload_$videoFilePath")
            .build()

        // Use unique work to prevent duplicate uploads of the same file
        workManager.enqueueUniqueWork(
            "upload_${videoFilePath.hashCode()}",
            ExistingWorkPolicy.KEEP,
            uploadRequest
        )

        return uploadRequest.id
    }

    /**
     * Get the status of an upload by its work request ID.
     *
     * @param workId UUID of the work request
     * @return Flow of WorkInfo for observing upload state
     */
    fun getUploadStatus(workId: UUID): Flow<WorkInfo?> {
        return workManager.getWorkInfoByIdFlow(workId)
    }

    /**
     * Get all pending and running uploads.
     *
     * @return Flow of all video upload work info
     */
    fun getAllUploads(): Flow<List<WorkInfo>> {
        return workManager.getWorkInfosByTagFlow(TAG_VIDEO_UPLOAD)
    }

    /**
     * Get all pending uploads that haven't started yet.
     */
    fun getPendingUploads(): Flow<List<WorkInfo>> {
        return getAllUploads().map { workInfoList ->
            workInfoList.filter { it.state == WorkInfo.State.ENQUEUED }
        }
    }

    /**
     * Get all currently running uploads.
     */
    fun getRunningUploads(): Flow<List<WorkInfo>> {
        return getAllUploads().map { workInfoList ->
            workInfoList.filter { it.state == WorkInfo.State.RUNNING }
        }
    }

    /**
     * Cancel a specific upload by its work request ID.
     *
     * @param workId UUID of the work request to cancel
     */
    fun cancelUpload(workId: UUID) {
        workManager.cancelWorkById(workId)
    }

    /**
     * Cancel all pending and running video uploads.
     */
    fun cancelAllUploads() {
        workManager.cancelAllWorkByTag(TAG_VIDEO_UPLOAD)
    }

    /**
     * Direct upload method for immediate uploads (not using WorkManager).
     * Use scheduleUpload() for reliable background uploads instead.
     *
     * @param videoFile The video file to upload
     * @param title Optional title for the video
     * @return ApiResult containing the upload response or error
     */
    suspend fun uploadVideoDirect(
        videoFile: File,
        title: String?
    ): ApiResult<VideoUploadResponse> {
        val serverUrl = credentialManager.getServerUrl()
            ?: return ApiResult.Error("Not connected to server")

        val service = getOrCreateVideoApiService(serverUrl)

        val requestBody = videoFile.asRequestBody("video/mp4".toMediaType())
        val videoPart = MultipartBody.Part.createFormData(
            "video",
            videoFile.name,
            requestBody
        )

        val titlePart = title?.toRequestBody("text/plain".toMediaType())

        return ApiClient.safeApiCall {
            service.uploadVideo(videoPart, titlePart)
        }
    }

    /**
     * Get or create VideoApiService for the given server URL.
     */
    private fun getOrCreateVideoApiService(serverUrl: String): VideoApiService {
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
     * Clear cached API service (useful when server URL changes).
     */
    fun clearApiServiceCache() {
        videoApiService = null
    }

    companion object {
        const val TAG_VIDEO_UPLOAD = "video_upload"
    }
}
