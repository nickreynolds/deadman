package com.deadmansdrop.app.ui.screens.camera

import android.Manifest
import android.view.ViewGroup
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.background
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
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
 * @param viewModel The camera view model
 */
@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun CameraScreen(
    onClose: () -> Unit,
    viewModel: CameraViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
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
                    // Show camera preview
                    CameraPreviewContent(
                        selectedLens = uiState.selectedLens,
                        isRecording = uiState.isRecording,
                        onToggleCamera = viewModel::toggleCamera,
                        onClose = onClose
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
 * Camera preview content with CameraX integration.
 */
@Composable
private fun CameraPreviewContent(
    selectedLens: CameraLens,
    isRecording: Boolean,
    onToggleCamera: () -> Unit,
    onClose: () -> Unit
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

                    try {
                        // Unbind all use cases before rebinding
                        cameraProvider.unbindAll()

                        // Bind the camera to the lifecycle
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            cameraSelector,
                            preview
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

        // Top bar with close button
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
                .align(Alignment.TopStart),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(
                onClick = onClose,
                modifier = Modifier
                    .size(48.dp)
                    .background(
                        color = Color.Black.copy(alpha = 0.5f),
                        shape = CircleShape
                    )
            ) {
                Icon(
                    imageVector = Icons.Filled.Close,
                    contentDescription = stringResource(R.string.camera_close),
                    tint = Color.White
                )
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
