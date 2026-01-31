package com.deadmansdrop.app.ui.screens.videos

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.VideoResponse
import com.deadmansdrop.app.data.repository.VideoRepository
import dagger.assisted.Assisted
import dagger.assisted.AssistedFactory
import dagger.assisted.AssistedInject
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

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
    val isDeleted: Boolean = false
)

/**
 * ViewModel for the video detail screen.
 * Manages fetching and displaying a single video's details.
 *
 * Uses assisted injection to receive the videoId at runtime.
 */
@HiltViewModel(assistedFactory = VideoDetailViewModel.Factory::class)
class VideoDetailViewModel @AssistedInject constructor(
    private val videoRepository: VideoRepository,
    @Assisted private val videoId: String
) : ViewModel() {

    @AssistedFactory
    interface Factory {
        fun create(videoId: String): VideoDetailViewModel
    }

    private val _uiState = MutableStateFlow(VideoDetailUiState())
    val uiState: StateFlow<VideoDetailUiState> = _uiState.asStateFlow()

    init {
        loadVideoDetail()
    }

    /**
     * Load video details from the server.
     */
    fun loadVideoDetail() {
        if (_uiState.value.isLoading) return

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

            when (val result = videoRepository.deleteVideo(videoId)) {
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
}
