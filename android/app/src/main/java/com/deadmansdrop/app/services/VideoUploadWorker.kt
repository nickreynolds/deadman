package com.deadmansdrop.app.services

import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.Data
import androidx.work.ForegroundInfo
import androidx.work.WorkerParameters
import com.deadmansdrop.app.DeadmansDropApplication
import com.deadmansdrop.app.R
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.ProgressRequestBody
import com.deadmansdrop.app.data.api.VideoApiService
import com.deadmansdrop.app.data.security.CredentialManager
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.toRequestBody
import retrofit2.Retrofit
import java.io.File

/**
 * WorkManager Worker for uploading videos in the background.
 * Provides reliable uploads that survive app restarts and handles network constraints.
 *
 * Uses Hilt for dependency injection via @HiltWorker.
 */
@HiltWorker
class VideoUploadWorker @AssistedInject constructor(
    @Assisted appContext: Context,
    @Assisted workerParams: WorkerParameters,
    private val credentialManager: CredentialManager,
    private val retrofitBuilder: Retrofit.Builder
) : CoroutineWorker(appContext, workerParams) {

    private val notificationManager = appContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        val videoPath = inputData.getString(KEY_VIDEO_PATH)
        val title = inputData.getString(KEY_VIDEO_TITLE)

        if (videoPath.isNullOrBlank()) {
            Log.e(TAG, "Video path is missing")
            return@withContext Result.failure(createErrorData("Video path is missing"))
        }

        val videoFile = File(videoPath)
        if (!videoFile.exists()) {
            Log.e(TAG, "Video file does not exist: $videoPath")
            return@withContext Result.failure(createErrorData("Video file does not exist"))
        }

        val serverUrl = credentialManager.getServerUrl()
        if (serverUrl.isNullOrBlank()) {
            Log.e(TAG, "Not connected to server")
            return@withContext Result.failure(createErrorData("Not connected to server"))
        }

        // Show foreground notification for long-running upload
        setForeground(createForegroundInfo(videoFile.name))

        try {
            val result = uploadVideo(serverUrl, videoFile, title)

            when (result) {
                is ApiResult.Success -> {
                    Log.i(TAG, "Upload successful for ${videoFile.name}")
                    updateNotificationSuccess(videoFile.name)

                    // Clean up the local video file after successful upload
                    deleteLocalVideoFile(videoFile)

                    Result.success(createSuccessData(result.data.video.id))
                }
                is ApiResult.Error -> {
                    Log.e(TAG, "Upload failed: ${result.message}")

                    // Check if we should retry
                    if (shouldRetry(result.code)) {
                        Log.i(TAG, "Retrying upload for ${videoFile.name}, attempt ${runAttemptCount}")
                        updateNotificationRetry(videoFile.name)
                        Result.retry()
                    } else {
                        updateNotificationFailure(videoFile.name, result.message)
                        Result.failure(createErrorData(result.message))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload exception: ${e.message}", e)

            if (runAttemptCount < MAX_RETRY_ATTEMPTS) {
                updateNotificationRetry(videoFile.name)
                Result.retry()
            } else {
                updateNotificationFailure(videoFile.name, e.message ?: "Unknown error")
                Result.failure(createErrorData(e.message ?: "Unknown error"))
            }
        }
    }

    private suspend fun uploadVideo(
        serverUrl: String,
        videoFile: File,
        title: String?
    ): ApiResult<com.deadmansdrop.app.data.api.models.VideoUploadResponse> {
        val normalizedUrl = if (serverUrl.endsWith("/")) serverUrl else "$serverUrl/"
        val retrofit = retrofitBuilder
            .baseUrl(normalizedUrl)
            .build()
        val videoApiService = retrofit.create(VideoApiService::class.java)

        val fileSize = videoFile.length()
        Log.d(TAG, "Uploading video: ${videoFile.name}, size: $fileSize bytes")

        // Create progress-tracking request body
        val requestBody = ProgressRequestBody(
            file = videoFile,
            contentType = "video/mp4".toMediaType()
        ) { bytesWritten, totalBytes ->
            val progress = if (totalBytes > 0) {
                ((bytesWritten * 100) / totalBytes).toInt()
            } else {
                0
            }
            // Update notification with progress
            updateNotificationProgress(videoFile.name, progress)
            // Update WorkManager progress for UI observation
            setProgressAsync(
                Data.Builder()
                    .putInt(KEY_PROGRESS_PERCENT, progress)
                    .putLong(KEY_BYTES_UPLOADED, bytesWritten)
                    .putLong(KEY_TOTAL_BYTES, totalBytes)
                    .build()
            )
        }

        val videoPart = MultipartBody.Part.createFormData(
            "video",
            videoFile.name,
            requestBody
        )

        val titlePart = title?.toRequestBody("text/plain".toMediaType())

        return try {
            val response = videoApiService.uploadVideo(videoPart, titlePart)
            if (response.isSuccessful) {
                val body = response.body()
                if (body != null) {
                    ApiResult.Success(body)
                } else {
                    ApiResult.Error("Empty response from server", response.code())
                }
            } else {
                ApiResult.Error(
                    message = "Upload failed: ${response.message()}",
                    code = response.code()
                )
            }
        } catch (e: Exception) {
            ApiResult.Error(
                message = e.message ?: "Upload failed",
                cause = e
            )
        }
    }

    private fun updateNotificationProgress(fileName: String, progress: Int) {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Uploading Video")
            .setContentText("$fileName - $progress%")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setProgress(100, progress, false)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun shouldRetry(errorCode: Int?): Boolean {
        // Retry on server errors and timeouts, but not on client errors (4xx except 408, 429)
        return when (errorCode) {
            null -> runAttemptCount < MAX_RETRY_ATTEMPTS // Network errors
            408, 429 -> true // Request timeout, rate limited
            in 500..599 -> true // Server errors
            else -> false // Client errors (4xx) are not retryable
        }
    }

    private fun deleteLocalVideoFile(file: File) {
        try {
            if (file.exists() && file.delete()) {
                Log.d(TAG, "Deleted local video file: ${file.absolutePath}")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to delete local video file: ${e.message}")
        }
    }

    private fun createForegroundInfo(fileName: String): ForegroundInfo {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Uploading Video")
            .setContentText(fileName)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setProgress(100, 0, true)
            .build()

        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
            )
        } else {
            ForegroundInfo(NOTIFICATION_ID, notification)
        }
    }

    private fun updateNotificationSuccess(fileName: String) {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Upload Complete")
            .setContentText(fileName)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun updateNotificationFailure(fileName: String, error: String) {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Upload Failed")
            .setContentText("$fileName: $error")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setAutoCancel(true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun updateNotificationRetry(fileName: String) {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Retrying Upload")
            .setContentText("$fileName - Attempt ${runAttemptCount + 1}/$MAX_RETRY_ATTEMPTS")
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setOngoing(true)
            .setProgress(100, 0, true)
            .build()

        notificationManager.notify(NOTIFICATION_ID, notification)
    }

    private fun createSuccessData(videoId: String): Data {
        return Data.Builder()
            .putString(KEY_VIDEO_ID, videoId)
            .putBoolean(KEY_UPLOAD_SUCCESS, true)
            .build()
    }

    private fun createErrorData(errorMessage: String): Data {
        return Data.Builder()
            .putString(KEY_ERROR_MESSAGE, errorMessage)
            .putBoolean(KEY_UPLOAD_SUCCESS, false)
            .build()
    }

    companion object {
        const val TAG = "VideoUploadWorker"
        const val NOTIFICATION_ID = 1001

        // Input data keys
        const val KEY_VIDEO_PATH = "video_path"
        const val KEY_VIDEO_TITLE = "video_title"

        // Output data keys
        const val KEY_VIDEO_ID = "video_id"
        const val KEY_UPLOAD_SUCCESS = "upload_success"
        const val KEY_ERROR_MESSAGE = "error_message"

        // Progress data keys
        const val KEY_PROGRESS_PERCENT = "progress_percent"
        const val KEY_BYTES_UPLOADED = "bytes_uploaded"
        const val KEY_TOTAL_BYTES = "total_bytes"

        // Retry configuration
        const val MAX_RETRY_ATTEMPTS = 3
    }
}
