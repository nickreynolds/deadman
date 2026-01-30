package com.deadmansdrop.app.ui.screens.camera

import android.Manifest
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.video.Quality
import androidx.camera.video.QualitySelector
import androidx.camera.video.Recorder
import androidx.camera.video.VideoCapture
import androidx.camera.view.PreviewView
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cameraswitch
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.R
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.rememberMultiplePermissionsState

/**
 * Camera screen composable that displays a live camera preview using CameraX.
 *
 * @param onClose Callback invoked when user wants to close the camera screen
 * @param onVideoRecorded Callback invoked when a video is successfully recorded
 * @param viewModel The camera view model
 */
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraScreen(
    onClose: () -> Unit,
    onVideoRecorded: (String) -> Unit = {},
    viewModel: CameraViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val recordingState by viewModel.recordingState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Request camera and audio permissions
    val permissionsState = rememberMultiplePermissionsState(
        permissions = listOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
    )

    // Update ViewModel with permission state
    LaunchedEffect(permissionsState.allPermissionsGranted, permissionsState.shouldShowRationale) {
        viewModel.onPermissionsResult(
            granted = permissionsState.allPermissionsGranted,
            shouldShowRationale = permissionsState.shouldShowRationale
        )
    }

    // Request permissions on first launch
    LaunchedEffect(Unit) {
        if (!permissionsState.allPermissionsGranted) {
            permissionsState.launchMultiplePermissionRequest()
        }
    }

    // Show error messages in snackbar
    LaunchedEffect(uiState.errorMessage) {
        uiState.errorMessage?.let { message ->
            snackbarHostState.showSnackbar(message)
            viewModel.clearError()
        }
    }

    // Handle recorded video
    LaunchedEffect(uiState.recordedFilePath) {
        uiState.recordedFilePath?.let { path ->
            onVideoRecorded(path)
            viewModel.clearRecordedFile()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .background(Color.Black)
        ) {
            when {
                uiState.hasPermissions -> {
                    // Show camera preview with recording controls
                    CameraPreviewContent(
                        selectedLens = uiState.selectedLens,
                        isRecording = uiState.isRecording,
                        recordingState = recordingState,
                        recordingDurationMs = uiState.recordingDurationMs,
                        onToggleCamera = viewModel::toggleCamera,
                        onStartRecording = { videoCapture ->
                            viewModel.startRecording(videoCapture)
                        },
                        onStopRecording = viewModel::stopRecording,
                        onClose = onClose,
                        viewModel = viewModel
                    )
                }
                uiState.showPermissionRationale -> {
                    // Show rationale for why we need permissions
                    PermissionRationaleContent(
                        onRequestPermission = { permissionsState.launchMultiplePermissionRequest() },
                        onClose = onClose
                    )
                }
                else -> {
                    // Permissions denied permanently - show settings prompt
                    PermissionDeniedContent(
                        onClose = onClose
                    )
                }
            }
        }
    }
}

/**
 * Camera preview content with CameraX integration and recording controls.
 */
@Composable
private fun CameraPreviewContent(
    selectedLens: CameraLens,
    isRecording: Boolean,
    recordingState: RecordingState,
    recordingDurationMs: Long,
    onToggleCamera: () -> Unit,
    onStartRecording: (VideoCapture<Recorder>) -> Unit,
    onStopRecording: () -> Unit,
    onClose: () -> Unit,
    viewModel: CameraViewModel
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    // Camera selector based on selected lens
    val cameraSelector = remember(selectedLens) {
        when (selectedLens) {
            CameraLens.BACK -> CameraSelector.DEFAULT_BACK_CAMERA
            CameraLens.FRONT -> CameraSelector.DEFAULT_FRONT_CAMERA
        }
    }

    // Video capture use case - remember to avoid recreating on recomposition
    var videoCapture by remember { mutableStateOf<VideoCapture<Recorder>?>(null) }

    Box(modifier = Modifier.fillMaxSize()) {
        // Camera preview using AndroidView to embed PreviewView
        AndroidView(
            factory = { ctx ->
                PreviewView(ctx).apply {
                    layoutParams = ViewGroup.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                }
            },
            modifier = Modifier.fillMaxSize(),
            update = { previewView ->
                val cameraProviderFuture = ProcessCameraProvider.getInstance(context)

                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()

                    // Build the preview use case
                    val preview = Preview.Builder()
                        .build()
                        .also {
                            it.surfaceProvider = previewView.surfaceProvider
                        }

                    // Build the video capture use case
                    val qualitySelector = QualitySelector.from(Quality.HD)
                    val recorder = Recorder.Builder()
                        .setQualitySelector(qualitySelector)
                        .build()
                    val newVideoCapture = VideoCapture.withOutput(recorder)
                    videoCapture = newVideoCapture

                    try {
                        // Unbind all use cases before rebinding
                        cameraProvider.unbindAll()

                        // Bind the camera to the lifecycle with both preview and video capture
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview,
                            newVideoCapture
                        )
                    } catch (e: Exception) {
                        // Handle camera binding errors
                        e.printStackTrace()
                    }
                }, ContextCompat.getMainExecutor(context))
            }
        )

        // Cleanup when composable leaves composition
        DisposableEffect(Unit) {
            onDispose {
                val cameraProviderFuture = ProcessCameraProvider.getInstance(context)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    cameraProvider.unbindAll()
                }, ContextCompat.getMainExecutor(context))
            }
        }

        // Top bar with close button and recording indicator
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .align(Alignment.TopStart),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Close button (disabled while recording)
            IconButton(
                onClick = { if (!isRecording) onClose() },
                enabled = !isRecording,
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = Color.Black.copy(alpha = if (isRecording) 0.3f else 0.5f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.camera_close),
                    tint = if (isRecording) Color.White.copy(alpha = 0.5f) else Color.White
                )
            }

            // Recording indicator
            if (isRecording) {
                RecordingIndicator(durationMs = recordingDurationMs)
            }

            // Camera switch button (only show if not recording)
            if (!isRecording) {
                IconButton(
                    onClick = onToggleCamera,
                    modifier = Modifier
                        .size(48.dp)
                        .background(
                            color = Color.Black.copy(alpha = 0.5f),
                            shape = CircleShape
                        )
                ) {
                    Icon(
                        imageVector = Icons.Filled.Cameraswitch,
                        contentDescription = stringResource(R.string.camera_switch),
                        tint = Color.White
                    )
                }
            } else {
                // Placeholder to maintain layout spacing
                Spacer(modifier = Modifier.size(48.dp))
            }
        }

        // Bottom recording controls
        Box(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 48.dp)
        ) {
            RecordButton(
                isRecording = isRecording,
                recordingState = recordingState,
                onStartRecording = {
                    videoCapture?.let { capture ->
                        onStartRecording(capture)
                    }
                },
                onStopRecording = onStopRecording
            )
        }
    }
}

/**
 * Recording indicator showing a red dot and duration timer.
 */
@Composable
private fun RecordingIndicator(durationMs: Long) {
    val seconds = (durationMs / 1000) % 60
    val minutes = (durationMs / 1000) / 60
    val timeString = String.format("%02d:%02d", minutes, seconds)

    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .background(
                color = Color.Black.copy(alpha = 0.5f),
                shape = RoundedCornerShape(16.dp)
            )
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        // Pulsing red dot
        Box(
            modifier = Modifier
                .size(12.dp)
                .background(Color.Red, CircleShape)
        )
        Spacer(modifier = Modifier.size(8.dp))
        Text(
            text = timeString,
            color = Color.White,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

/**
 * Record button with start/stop functionality.
 * Shows a red circle when idle, a red square (stop) when recording.
 */
@Composable
private fun RecordButton(
    isRecording: Boolean,
    recordingState: RecordingState,
    onStartRecording: () -> Unit,
    onStopRecording: () -> Unit
) {
    val isTransitioning = recordingState is RecordingState.Starting ||
            recordingState is RecordingState.Stopping

    // Animate the inner shape scale
    val innerScale by animateFloatAsState(
        targetValue = if (isRecording) 0.5f else 1f,
        animationSpec = tween(durationMillis = 200),
        label = "recordButtonScale"
    )

    // Animate the inner shape corner radius (percentage of size)
    val cornerRadiusPercent by animateFloatAsState(
        targetValue = if (isRecording) 20f else 50f,
        animationSpec = tween(durationMillis = 200),
        label = "recordButtonCorner"
    )

    Box(
        contentAlignment = Alignment.Center,
        modifier = Modifier
            .size(80.dp)
            .clip(CircleShape)
            .background(Color.Transparent)
            .border(4.dp, Color.White, CircleShape)
            .clickable(enabled = !isTransitioning) {
                if (isRecording) {
                    onStopRecording()
                } else {
                    onStartRecording()
                }
            }
            .padding(8.dp)
    ) {
        Box(
            modifier = Modifier
                .size(56.dp * innerScale)
                .clip(RoundedCornerShape(cornerRadiusPercent.toInt()))
                .background(Color.Red)
        )
    }
}

/**
 * Content shown when permission rationale should be displayed.
 */
@Composable
private fun PermissionRationaleContent(
    onRequestPermission: () -> Unit,
    onClose: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.camera_permission_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.camera_permission_rationale),
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = onRequestPermission) {
            Text(stringResource(R.string.camera_grant_permission))
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = onClose) {
            Text(stringResource(R.string.camera_go_back))
        }
    }
}

/**
 * Content shown when permissions are permanently denied.
 */
@Composable
private fun PermissionDeniedContent(
    onClose: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text(
            text = stringResource(R.string.camera_permission_denied_title),
            style = MaterialTheme.typography.headlineSmall,
            color = Color.White,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = stringResource(R.string.camera_permission_denied_message),
            style = MaterialTheme.typography.bodyMedium,
            color = Color.White.copy(alpha = 0.8f),
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(32.dp))

        Button(onClick = onClose) {
            Text(stringResource(R.string.camera_go_back))
        }
    }
}
