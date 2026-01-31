package com.deadmansdrop.app.ui.screens.upload

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.work.WorkInfo
import com.deadmansdrop.app.data.repository.UploadProgress
import com.deadmansdrop.app.data.repository.VideoUploadRepository
import com.deadmansdrop.app.services.VideoUploadWorker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

/**
 * Represents the state of a single upload.
 */
data class UploadState(
    val workId: UUID,
    val fileName: String,
    val status: UploadStatus = UploadStatus.PENDING,
    val progress: UploadProgress = UploadProgress.ZERO,
    val errorMessage: String? = null,
    val videoId: String? = null
)

/**
 * Status of an upload.
 */
enum class UploadStatus {
    PENDING,
    UPLOADING,
    SUCCESS,
    FAILED,
    CANCELLED
}

/**
 * UI state for the upload screen.
 */
data class UploadUiState(
    val uploads: List<UploadState> = emptyList(),
    val hasActiveUploads: Boolean = false
)

/**
 * ViewModel for managing and displaying video upload progress.
 */
@HiltViewModel
class UploadViewModel @Inject constructor(
    private val videoUploadRepository: VideoUploadRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(UploadUiState())
    val uiState: StateFlow<UploadUiState> = _uiState.asStateFlow()

    // Track active upload observations
    private val activeUploads = mutableMapOf<UUID, UploadState>()

    init {
        // Observe all uploads
        observeAllUploads()
    }

    /**
     * Schedule a video for upload and track its progress.
     *
     * @param videoFilePath Path to the video file
     * @param title Optional title for the video
     * @return UUID of the upload work for tracking
     */
    fun scheduleUpload(videoFilePath: String, title: String?): UUID {
        val fileName = videoFilePath.substringAfterLast("/")
        val workId = videoUploadRepository.scheduleUpload(videoFilePath, title)

        // Add to tracking
        val uploadState = UploadState(
            workId = workId,
            fileName = fileName,
            status = UploadStatus.PENDING
        )
        activeUploads[workId] = uploadState
        updateUiState()

        // Observe this specific upload
        observeUpload(workId, fileName)

        return workId
    }

    /**
     * Observe a specific upload's progress.
     */
    private fun observeUpload(workId: UUID, fileName: String) {
        viewModelScope.launch {
            videoUploadRepository.getUploadStatus(workId).collect { workInfo ->
                workInfo?.let { info ->
                    val progress = videoUploadRepository.extractProgress(info)
                    val status = mapWorkInfoStateToUploadStatus(info)
                    val errorMessage = if (status == UploadStatus.FAILED) {
                        info.outputData.getString(VideoUploadWorker.KEY_ERROR_MESSAGE)
                    } else null
                    val videoId = if (status == UploadStatus.SUCCESS) {
                        info.outputData.getString(VideoUploadWorker.KEY_VIDEO_ID)
                    } else null

                    activeUploads[workId] = UploadState(
                        workId = workId,
                        fileName = fileName,
                        status = status,
                        progress = progress,
                        errorMessage = errorMessage,
                        videoId = videoId
                    )
                    updateUiState()
                }
            }
        }
    }

    /**
     * Observe all video uploads.
     */
    private fun observeAllUploads() {
        viewModelScope.launch {
            videoUploadRepository.getAllUploads().collect { workInfoList ->
                // Update states for any uploads we're tracking
                workInfoList.forEach { info ->
                    if (activeUploads.containsKey(info.id)) {
                        val current = activeUploads[info.id]!!
                        val progress = videoUploadRepository.extractProgress(info)
                        val status = mapWorkInfoStateToUploadStatus(info)
                        val errorMessage = if (status == UploadStatus.FAILED) {
                            info.outputData.getString(VideoUploadWorker.KEY_ERROR_MESSAGE)
                        } else null
                        val videoId = if (status == UploadStatus.SUCCESS) {
                            info.outputData.getString(VideoUploadWorker.KEY_VIDEO_ID)
                        } else null

                        activeUploads[info.id] = current.copy(
                            status = status,
                            progress = progress,
                            errorMessage = errorMessage,
                            videoId = videoId
                        )
                    }
                }
                updateUiState()
            }
        }
    }

    /**
     * Map WorkInfo state to UploadStatus.
     */
    private fun mapWorkInfoStateToUploadStatus(workInfo: WorkInfo): UploadStatus {
        return when (workInfo.state) {
            WorkInfo.State.ENQUEUED -> UploadStatus.PENDING
            WorkInfo.State.RUNNING -> UploadStatus.UPLOADING
            WorkInfo.State.SUCCEEDED -> UploadStatus.SUCCESS
            WorkInfo.State.FAILED -> UploadStatus.FAILED
            WorkInfo.State.BLOCKED -> UploadStatus.PENDING
            WorkInfo.State.CANCELLED -> UploadStatus.CANCELLED
        }
    }

    /**
     * Cancel a specific upload.
     */
    fun cancelUpload(workId: UUID) {
        videoUploadRepository.cancelUpload(workId)
    }

    /**
     * Remove a completed or failed upload from the list.
     */
    fun dismissUpload(workId: UUID) {
        activeUploads.remove(workId)
        updateUiState()
    }

    /**
     * Clear all completed uploads from the list.
     */
    fun clearCompletedUploads() {
        val toRemove = activeUploads.filter {
            it.value.status == UploadStatus.SUCCESS ||
            it.value.status == UploadStatus.FAILED ||
            it.value.status == UploadStatus.CANCELLED
        }.keys
        toRemove.forEach { activeUploads.remove(it) }
        updateUiState()
    }

    /**
     * Update the UI state from the tracked uploads.
     */
    private fun updateUiState() {
        _uiState.update {
            UploadUiState(
                uploads = activeUploads.values.toList().sortedByDescending {
                    // Show active uploads first, then pending, then completed
                    when (it.status) {
                        UploadStatus.UPLOADING -> 3
                        UploadStatus.PENDING -> 2
                        else -> 1
                    }
                },
                hasActiveUploads = activeUploads.values.any {
                    it.status == UploadStatus.UPLOADING || it.status == UploadStatus.PENDING
                }
            )
        }
    }
}
