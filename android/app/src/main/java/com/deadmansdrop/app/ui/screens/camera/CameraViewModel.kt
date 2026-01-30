package com.deadmansdrop.app.ui.screens.camera

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import androidx.camera.video.FileOutputOptions
import androidx.camera.video.Recorder
import androidx.camera.video.Recording
import androidx.camera.video.VideoCapture
import androidx.camera.video.VideoRecordEvent
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.io.File
import java.text.SimpleDateFormat
import java.util.Locale
import javax.inject.Inject

/**
 * Enum representing which camera lens is currently selected.
 */
enum class CameraLens {
    BACK,
    FRONT
}

/**
 * Recording state for tracking the current recording session.
 */
sealed class RecordingState {
    data object Idle : RecordingState()
    data object Starting : RecordingState()
    data class Active(val recording: Recording) : RecordingState()
    data object Stopping : RecordingState()
}

/**
 * UI state for the camera screen.
 */
data class CameraUiState(
    val selectedLens: CameraLens = CameraLens.BACK,
    val isRecording: Boolean = false,
    val hasPermissions: Boolean = false,
    val showPermissionRationale: Boolean = false,
    val errorMessage: String? = null,
    val recordingDurationMs: Long = 0L,
    val recordedBytesCount: Long = 0L,
    val recordedFilePath: String? = null
)

/**
 * ViewModel for the camera screen.
 * Manages camera state including lens selection, recording state, and permissions.
 */
@HiltViewModel
class CameraViewModel @Inject constructor(
    @ApplicationContext private val context: Context
) : ViewModel() {

    private val _uiState = MutableStateFlow(CameraUiState())
    val uiState: StateFlow<CameraUiState> = _uiState.asStateFlow()

    private val _recordingState = MutableStateFlow<RecordingState>(RecordingState.Idle)
    val recordingState: StateFlow<RecordingState> = _recordingState.asStateFlow()

    companion object {
        private const val FILENAME_FORMAT = "yyyy-MM-dd-HH-mm-ss-SSS"
    }

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
     * Create output options for video recording.
     * Uses app-specific storage for videos pending upload.
     */
    fun createOutputOptions(): FileOutputOptions {
        val videoDir = File(context.filesDir, "videos")
        if (!videoDir.exists()) {
            videoDir.mkdirs()
        }

        val name = SimpleDateFormat(FILENAME_FORMAT, Locale.US)
            .format(System.currentTimeMillis())
        val videoFile = File(videoDir, "deadman_$name.mp4")

        return FileOutputOptions.Builder(videoFile).build()
    }

    /**
     * Mark recording as starting.
     */
    fun onRecordingStarting() {
        _recordingState.value = RecordingState.Starting
    }

    /**
     * Set recording state to active with the recording handle.
     */
    fun onRecordingStarted(recording: Recording) {
        _recordingState.value = RecordingState.Active(recording)
        _uiState.update {
            it.copy(
                isRecording = true,
                errorMessage = null,
                recordingDurationMs = 0L,
                recordedBytesCount = 0L
            )
        }
    }

    /**
     * Update recording duration and file size.
     */
    fun onRecordingStatsUpdate(durationMs: Long, bytesRecorded: Long) {
        _uiState.update {
            it.copy(
                recordingDurationMs = durationMs,
                recordedBytesCount = bytesRecorded
            )
        }
    }

    /**
     * Mark recording as stopping.
     */
    fun onRecordingStopping() {
        _recordingState.value = RecordingState.Stopping
    }

    /**
     * Set recording state to idle after recording stopped.
     */
    fun onRecordingStopped(filePath: String? = null) {
        _recordingState.value = RecordingState.Idle
        _uiState.update {
            it.copy(
                isRecording = false,
                recordedFilePath = filePath,
                recordingDurationMs = 0L,
                recordedBytesCount = 0L
            )
        }
    }

    /**
     * Start recording video with the given VideoCapture use case.
     */
    @androidx.annotation.OptIn(androidx.camera.video.ExperimentalPersistentRecording::class)
    fun startRecording(videoCapture: VideoCapture<Recorder>) {
        // Check if already recording
        if (_recordingState.value !is RecordingState.Idle) return

        // Mark as starting
        onRecordingStarting()

        // Create output file and options
        val videoDir = File(context.filesDir, "videos")
        if (!videoDir.exists()) {
            videoDir.mkdirs()
        }
        val name = SimpleDateFormat(FILENAME_FORMAT, Locale.US)
            .format(System.currentTimeMillis())
        val outputFile = File(videoDir, "deadman_$name.mp4")
        val outputOptions = FileOutputOptions.Builder(outputFile).build()

        // Prepare recording
        val pendingRecording = videoCapture.output
            .prepareRecording(context, outputOptions)

        // Add audio if permission is granted
        if (ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.RECORD_AUDIO
            ) == PackageManager.PERMISSION_GRANTED
        ) {
            pendingRecording.withAudioEnabled()
        }

        // Start recording
        val recording = pendingRecording.start(
            ContextCompat.getMainExecutor(context)
        ) { event ->
            handleVideoRecordEvent(event, outputFile)
        }

        // Update state with active recording
        onRecordingStarted(recording)
    }

    /**
     * Stop the current recording.
     */
    fun stopRecording() {
        val currentState = _recordingState.value
        if (currentState is RecordingState.Active) {
            onRecordingStopping()
            currentState.recording.stop()
        }
    }

    /**
     * Handle recording error.
     */
    fun onRecordingError(message: String) {
        _recordingState.value = RecordingState.Idle
        _uiState.update {
            it.copy(
                isRecording = false,
                errorMessage = message,
                recordingDurationMs = 0L,
                recordedBytesCount = 0L
            )
        }
    }

    /**
     * Clear error message after it has been shown.
     */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    /**
     * Clear recorded file path after it has been processed.
     */
    fun clearRecordedFile() {
        _uiState.update { it.copy(recordedFilePath = null) }
    }

    /**
     * Process video record event from CameraX.
     */
    fun handleVideoRecordEvent(event: VideoRecordEvent, outputFile: File) {
        when (event) {
            is VideoRecordEvent.Start -> {
                // Recording has started - duration updates will come via Status events
            }
            is VideoRecordEvent.Status -> {
                val stats = event.recordingStats
                onRecordingStatsUpdate(
                    durationMs = stats.recordedDurationNanos / 1_000_000,
                    bytesRecorded = stats.numBytesRecorded
                )
            }
            is VideoRecordEvent.Finalize -> {
                if (event.hasError()) {
                    val errorMessage = when (event.error) {
                        VideoRecordEvent.Finalize.ERROR_INSUFFICIENT_STORAGE ->
                            "Insufficient storage space"
                        VideoRecordEvent.Finalize.ERROR_FILE_SIZE_LIMIT_REACHED ->
                            "File size limit reached"
                        VideoRecordEvent.Finalize.ERROR_ENCODING_FAILED ->
                            "Encoding failed"
                        VideoRecordEvent.Finalize.ERROR_NO_VALID_DATA ->
                            "No valid data recorded"
                        else -> "Recording failed: ${event.cause?.message ?: "Unknown error"}"
                    }
                    onRecordingError(errorMessage)
                    // Clean up failed recording file
                    if (outputFile.exists()) {
                        outputFile.delete()
                    }
                } else {
                    onRecordingStopped(outputFile.absolutePath)
                }
            }
        }
    }
}
