package com.deadmansdrop.app.ui.screens.videos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.VideoResponse
import com.deadmansdrop.app.data.repository.VideoRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * UI state for the video detail screen.
 */
data class VideoDetailUiState(
    val video: VideoResponse? = null,
    val isLoading: Boolean = false,
    val error: String? = null,
    val showDeleteConfirmation: Boolean = false,
    val isDeleting: Boolean = false,
    val deleteError: String? = null,
    val isDeleted: Boolean = false,
    // Check-in state
    val isCheckingIn: Boolean = false,
    val checkInError: String? = null,
    val checkInSuccess: Boolean = false
)

/**
 * ViewModel for the video detail screen.
 * Manages fetching and displaying a single video's details.
 *
 * Call [loadVideoDetail] with the video ID when the screen is shown.
 */
@HiltViewModel
class VideoDetailViewModel @Inject constructor(
    private val videoRepository: VideoRepository
) : ViewModel() {

    private var currentVideoId: String? = null

    private val _uiState = MutableStateFlow(VideoDetailUiState())
    val uiState: StateFlow<VideoDetailUiState> = _uiState.asStateFlow()

    /**
     * Load video details from the server.
     * Call this when the screen is shown with a video ID.
     */
    fun loadVideoDetail(videoId: String) {
        if (_uiState.value.isLoading) return
        currentVideoId = videoId

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            when (val result = videoRepository.getVideoDetail(videoId)) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            video = result.data.video,
                            isLoading = false,
                            error = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            error = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Clear error message.
     */
    fun clearError() {
        _uiState.update { it.copy(error = null) }
    }

    /**
     * Request to delete the video (shows confirmation dialog).
     */
    fun requestDelete() {
        _uiState.update { it.copy(showDeleteConfirmation = true) }
    }

    /**
     * Cancel the delete operation.
     */
    fun cancelDelete() {
        _uiState.update { it.copy(showDeleteConfirmation = false, deleteError = null) }
    }

    /**
     * Confirm and execute the video deletion.
     */
    fun confirmDelete() {
        if (_uiState.value.isDeleting) return

        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true, deleteError = null) }

            val id = currentVideoId ?: return@launch
            when (val result = videoRepository.deleteVideo(id)) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            isDeleting = false,
                            showDeleteConfirmation = false,
                            isDeleted = true
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isDeleting = false,
                            deleteError = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Clear delete error message.
     */
    fun clearDeleteError() {
        _uiState.update { it.copy(deleteError = null) }
    }

    /**
     * Perform a check-in to prevent distribution.
     * This extends the distribution timer.
     */
    fun checkIn() {
        if (_uiState.value.isCheckingIn) return

        viewModelScope.launch {
            _uiState.update { it.copy(isCheckingIn = true, checkInError = null, checkInSuccess = false) }

            val id = currentVideoId ?: return@launch
            when (val result = videoRepository.checkInVideo(id, "PREVENT_DISTRIBUTION")) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            video = result.data.video,
                            isCheckingIn = false,
                            checkInError = null,
                            checkInSuccess = true
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isCheckingIn = false,
                            checkInError = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Clear check-in error message.
     */
    fun clearCheckInError() {
        _uiState.update { it.copy(checkInError = null) }
    }

    /**
     * Clear check-in success message.
     */
    fun clearCheckInSuccess() {
        _uiState.update { it.copy(checkInSuccess = false) }
    }
}
