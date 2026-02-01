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
                    Log.e(TAG, "Upload failed: ${result.message} (code: ${result.code})")
                    val userFriendlyMessage = getUserFriendlyErrorMessage(result.code, result.message)

                    // Check if we should retry
                    if (shouldRetry(result.code)) {
                        val nextAttempt = runAttemptCount + 1
                        Log.i(TAG, "Scheduling retry for ${videoFile.name}, attempt $nextAttempt/$MAX_RETRY_ATTEMPTS")
                        updateNotificationRetry(videoFile.name, nextAttempt)
                        Result.retry()
                    } else {
                        Log.e(TAG, "Upload permanently failed for ${videoFile.name}: $userFriendlyMessage")
                        updateNotificationFailure(videoFile.name, userFriendlyMessage)
                        Result.failure(createErrorData(userFriendlyMessage, result.code))
                    }
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Upload exception: ${e.message}", e)
            val userFriendlyMessage = getUserFriendlyErrorMessage(null, e.message ?: "Unknown error")

            if (runAttemptCount < MAX_RETRY_ATTEMPTS) {
                val nextAttempt = runAttemptCount + 1
                Log.i(TAG, "Scheduling retry after exception for ${videoFile.name}, attempt $nextAttempt/$MAX_RETRY_ATTEMPTS")
                updateNotificationRetry(videoFile.name, nextAttempt)
                Result.retry()
            } else {
                Log.e(TAG, "Upload permanently failed after $MAX_RETRY_ATTEMPTS attempts for ${videoFile.name}")
                updateNotificationFailure(videoFile.name, userFriendlyMessage)
                Result.failure(createErrorData(userFriendlyMessage, null))
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
        return shouldRetryForAttempt(errorCode, runAttemptCount)
    }

    private fun getUserFriendlyErrorMessage(errorCode: Int?, originalMessage: String): String {
        return getErrorMessage(errorCode, originalMessage)
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

    private fun updateNotificationRetry(fileName: String, attemptNumber: Int) {
        val notification = NotificationCompat.Builder(applicationContext, DeadmansDropApplication.CHANNEL_UPLOAD_PROGRESS)
            .setContentTitle("Retrying Upload")
            .setContentText("$fileName - Attempt $attemptNumber/$MAX_RETRY_ATTEMPTS")
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

    private fun createErrorData(errorMessage: String, errorCode: Int? = null): Data {
        return Data.Builder()
            .putString(KEY_ERROR_MESSAGE, errorMessage)
            .putBoolean(KEY_UPLOAD_SUCCESS, false)
            .apply {
                errorCode?.let { putInt(KEY_ERROR_CODE, it) }
            }
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
        const val KEY_ERROR_CODE = "error_code"

        // Progress data keys
        const val KEY_PROGRESS_PERCENT = "progress_percent"
        const val KEY_BYTES_UPLOADED = "bytes_uploaded"
        const val KEY_TOTAL_BYTES = "total_bytes"

        // Retry configuration
        const val MAX_RETRY_ATTEMPTS = 3

        /**
         * Determines if the upload should be retried based on error code and attempt count.
         *
         * Retry strategy:
         * - Network errors (null code): Retry with exponential backoff
         * - 408 Request Timeout: Always retry (transient)
         * - 429 Too Many Requests: Always retry (rate limited, backoff will help)
         * - 500-599 Server errors: Retry (server may recover)
         * - 401 Unauthorized: Don't retry (auth issue needs user action)
         * - 413 Payload Too Large: Don't retry (file won't shrink)
         * - Other 4xx: Don't retry (client error, won't change)
         */
        fun shouldRetryForAttempt(errorCode: Int?, attemptCount: Int): Boolean {
            if (attemptCount >= MAX_RETRY_ATTEMPTS) {
                return false
            }

            return when (errorCode) {
                null -> true // Network errors - retry with backoff
                408 -> true // Request timeout - transient, retry
                429 -> true // Rate limited - backoff will help
                in 500..599 -> true // Server errors - may recover
                401 -> false // Authentication error - user action required
                413 -> false // Payload too large - file exceeds server limit
                else -> false // Client error - not retryable
            }
        }

        /**
         * Get a user-friendly error message based on the error code.
         */
        fun getErrorMessage(errorCode: Int?, originalMessage: String): String {
            return when (errorCode) {
                null -> "Network connection failed. Please check your internet connection."
                401 -> "Authentication failed. Please log in again."
                403 -> "Permission denied. You don't have access to upload videos."
                408 -> "Request timed out. Please try again."
                413 -> "Video file is too large. Please record a shorter video."
                429 -> "Too many requests. Please wait and try again."
                in 500..599 -> "Server error. Please try again later."
                else -> originalMessage
            }
        }
    }
}
