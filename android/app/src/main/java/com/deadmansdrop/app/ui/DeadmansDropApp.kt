package com.deadmansdrop.app.ui

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.R
import com.deadmansdrop.app.ui.auth.AuthViewModel
import com.deadmansdrop.app.ui.screens.camera.CameraScreen
import com.deadmansdrop.app.ui.screens.camera.VideoTitleDialog
import com.deadmansdrop.app.ui.screens.login.LoginScreen
import com.deadmansdrop.app.ui.screens.upload.UploadProgressList
import com.deadmansdrop.app.ui.screens.upload.UploadStatus
import com.deadmansdrop.app.ui.screens.upload.UploadViewModel

/**
 * Main composable for Deadman's Drop app.
 * Handles navigation between login and main app screens.
 *
 * Uses AuthViewModel to manage authentication state across the app,
 * persisting login state across configuration changes and reacting
 * to auth state changes (e.g., when token refresh fails).
 */
@Composable
fun DeadmansDropApp(
    authViewModel: AuthViewModel = hiltViewModel(),
    uploadViewModel: UploadViewModel = hiltViewModel()
) {
    val authState by authViewModel.authState.collectAsState()
    val uploadUiState by uploadViewModel.uiState.collectAsState()

    when {
        authState.isLoading -> {
            // Show loading indicator while checking auth state
            Box(
                modifier = Modifier.fillMaxSize(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator()
            }
        }
        authState.isAuthenticated -> {
            // Main app content (to be implemented in later tasks)
            MainAppContent(
                username = authState.username,
                onLogout = { authViewModel.logout() },
                uploadViewModel = uploadViewModel,
                uploadUiState = uploadUiState
            )
        }
        else -> {
            // Show login screen
            LoginScreen(
                onLoginSuccess = {
                    authViewModel.onLoginSuccess()
                }
            )
        }
    }
}

/**
 * Main app content after login.
 * Handles navigation to camera screen and other features.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainAppContent(
    username: String?,
    onLogout: () -> Unit,
    uploadViewModel: UploadViewModel,
    uploadUiState: com.deadmansdrop.app.ui.screens.upload.UploadUiState
) {
    // Track whether camera screen is shown
    var showCamera by rememberSaveable { mutableStateOf(false) }
    // Track whether upload progress sheet is shown
    var showUploadSheet by rememberSaveable { mutableStateOf(false) }
    val sheetState = rememberModalBottomSheetState()
    // Track video path for title dialog
    var pendingVideoPath by rememberSaveable { mutableStateOf<String?>(null) }

    // Count of active uploads for badge
    val activeUploadCount = uploadUiState.uploads.count {
        it.status == UploadStatus.UPLOADING || it.status == UploadStatus.PENDING
    }
    // Get current progress for single active upload
    val currentUploadProgress = uploadUiState.uploads
        .firstOrNull { it.status == UploadStatus.UPLOADING }
        ?.progress?.progressPercent

    // Show title dialog when a video is recorded
    pendingVideoPath?.let { videoPath ->
        VideoTitleDialog(
            onConfirm = { title ->
                // Schedule the video for upload with the provided title
                val finalTitle = title.ifBlank { null }
                uploadViewModel.scheduleUpload(videoPath, finalTitle)
                pendingVideoPath = null
            },
            onSkip = {
                // Schedule the video for upload without a title (auto-generate)
                uploadViewModel.scheduleUpload(videoPath, null)
                pendingVideoPath = null
            },
            onDismiss = {
                // User dismissed the dialog - still upload with auto-generated title
                uploadViewModel.scheduleUpload(videoPath, null)
                pendingVideoPath = null
            }
        )
    }

    if (showCamera) {
        CameraScreen(
            onClose = { showCamera = false },
            onVideoRecorded = { videoPath ->
                // Store the video path and show title dialog
                pendingVideoPath = videoPath
                showCamera = false
            }
        )
    } else {
        Scaffold(
            modifier = Modifier.fillMaxSize()
        ) { innerPadding ->
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(innerPadding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(
                        text = "Welcome${username?.let { ", $it" } ?: ""}!",
                        textAlign = TextAlign.Center,
                        style = MaterialTheme.typography.headlineSmall
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "(Main content coming soon)",
                        textAlign = TextAlign.Center
                    )
                    Spacer(modifier = Modifier.height(24.dp))
                    Button(onClick = { showCamera = true }) {
                        Text(stringResource(R.string.main_record_video))
                    }
                    Spacer(modifier = Modifier.height(16.dp))

                    // Upload progress button with badge
                    if (uploadUiState.uploads.isNotEmpty()) {
                        BadgedBox(
                            badge = {
                                if (activeUploadCount > 0) {
                                    Badge {
                                        Text(activeUploadCount.toString())
                                    }
                                }
                            }
                        ) {
                            TextButton(
                                onClick = { showUploadSheet = true }
                            ) {
                                Icon(
                                    imageVector = Icons.Filled.CloudUpload,
                                    contentDescription = null,
                                    modifier = Modifier.padding(end = 8.dp)
                                )
                                Text(
                                    text = when {
                                        activeUploadCount > 0 && currentUploadProgress != null ->
                                            "Uploading... $currentUploadProgress%"
                                        activeUploadCount > 0 ->
                                            "Uploading..."
                                        else -> "View uploads"
                                    }
                                )
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                    }

                    Button(onClick = onLogout) {
                        Text("Logout")
                    }
                }
            }
        }

        // Upload progress bottom sheet
        if (showUploadSheet) {
            ModalBottomSheet(
                onDismissRequest = { showUploadSheet = false },
                sheetState = sheetState
            ) {
                UploadProgressList(
                    uploads = uploadUiState.uploads,
                    onCancel = { workId -> uploadViewModel.cancelUpload(workId) },
                    onDismiss = { workId -> uploadViewModel.dismissUpload(workId) },
                    onClearCompleted = { uploadViewModel.clearCompletedUploads() },
                    modifier = Modifier.fillMaxWidth()
                )
                Spacer(modifier = Modifier.height(32.dp))
            }
        }
    }
}
