package com.deadmansdrop.app.ui.screens.camera

import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject

/**
 * Enum representing which camera lens is currently selected.
 */
enum class CameraLens {
    BACK,
    FRONT
}

/**
 * UI state for the camera screen.
 */
data class CameraUiState(
    val selectedLens: CameraLens = CameraLens.BACK,
    val isRecording: Boolean = false,
    val hasPermissions: Boolean = false,
    val showPermissionRationale: Boolean = false,
    val errorMessage: String? = null
)

/**
 * ViewModel for the camera screen.
 * Manages camera state including lens selection, recording state, and permissions.
 */
@HiltViewModel
class CameraViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(CameraUiState())
    val uiState: StateFlow<CameraUiState> = _uiState.asStateFlow()

    /**
     * Update permission state.
     */
    fun onPermissionsResult(granted: Boolean, shouldShowRationale: Boolean = false) {
        _uiState.update {
            it.copy(
                hasPermissions = granted,
                showPermissionRationale = shouldShowRationale
            )
        }
    }

    /**
     * Toggle between front and back camera.
     */
    fun toggleCamera() {
        // Don't allow camera switch while recording
        if (_uiState.value.isRecording) return

        _uiState.update {
            it.copy(
                selectedLens = if (it.selectedLens == CameraLens.BACK) {
                    CameraLens.FRONT
                } else {
                    CameraLens.BACK
                }
            )
        }
    }

    /**
     * Set recording state to true (recording started).
     */
    fun onRecordingStarted() {
        _uiState.update { it.copy(isRecording = true, errorMessage = null) }
    }

    /**
     * Set recording state to false (recording stopped).
     */
    fun onRecordingStopped() {
        _uiState.update { it.copy(isRecording = false) }
    }

    /**
     * Handle recording error.
     */
    fun onRecordingError(message: String) {
        _uiState.update {
            it.copy(
                isRecording = false,
                errorMessage = message
            )
        }
    }

    /**
     * Clear error message after it has been shown.
     */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }
}
