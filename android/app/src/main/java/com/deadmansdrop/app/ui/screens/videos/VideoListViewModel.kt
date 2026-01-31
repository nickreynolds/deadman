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
 * UI state for the video list screen.
 */
data class VideoListUiState(
    val videos: List<VideoResponse> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
    val totalCount: Int = 0,
    val videoToDelete: VideoResponse? = null,
    val isDeleting: Boolean = false,
    val deleteError: String? = null
)

/**
 * ViewModel for the video list screen.
 * Manages fetching and displaying the user's videos.
 */
@HiltViewModel
class VideoListViewModel @Inject constructor(
    private val videoRepository: VideoRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(VideoListUiState())
    val uiState: StateFlow<VideoListUiState> = _uiState.asStateFlow()

    init {
        loadVideos()
    }

    /**
     * Load videos from the server.
     * Shows loading indicator on initial load.
     */
    fun loadVideos() {
        if (_uiState.value.isLoading) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            when (val result = videoRepository.getVideos()) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            videos = result.data.videos,
                            totalCount = result.data.total,
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
     * Refresh videos from the server.
     * Shows refresh indicator (for pull-to-refresh).
     */
    fun refreshVideos() {
        if (_uiState.value.isRefreshing) return

        viewModelScope.launch {
            _uiState.update { it.copy(isRefreshing = true, error = null) }

            when (val result = videoRepository.getVideos()) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            videos = result.data.videos,
                            totalCount = result.data.total,
                            isRefreshing = false,
                            error = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isRefreshing = false,
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
     * Request to delete a video (shows confirmation dialog).
     */
    fun requestDeleteVideo(video: VideoResponse) {
        _uiState.update { it.copy(videoToDelete = video) }
    }

    /**
     * Cancel the delete operation.
     */
    fun cancelDelete() {
        _uiState.update { it.copy(videoToDelete = null, deleteError = null) }
    }

    /**
     * Confirm and execute the video deletion.
     */
    fun confirmDelete() {
        val video = _uiState.value.videoToDelete ?: return
        if (_uiState.value.isDeleting) return

        viewModelScope.launch {
            _uiState.update { it.copy(isDeleting = true, deleteError = null) }

            when (val result = videoRepository.deleteVideo(video.id)) {
                is ApiResult.Success -> {
                    // Remove the video from the list
                    _uiState.update { state ->
                        state.copy(
                            videos = state.videos.filter { it.id != video.id },
                            totalCount = state.totalCount - 1,
                            isDeleting = false,
                            videoToDelete = null,
                            deleteError = null
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
