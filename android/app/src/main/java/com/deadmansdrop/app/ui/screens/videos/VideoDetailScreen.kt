package com.deadmansdrop.app.ui.screens.videos

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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CalendarToday
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.data.api.models.VideoResponse
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

/**
 * Screen displaying detailed information about a single video.
 *
 * @param videoId The ID of the video to display
 * @param onBack Callback invoked when user navigates back
 * @param modifier Modifier for the root composable
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VideoDetailScreen(
    videoId: String,
    onBack: () -> Unit,
    onVideoUpdated: () -> Unit = {},
    modifier: Modifier = Modifier,
    viewModel: VideoDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Load video when screen is shown
    LaunchedEffect(videoId) {
        viewModel.loadVideoDetail(videoId)
    }

    // Navigate back after successful deletion
    LaunchedEffect(uiState.isDeleted) {
        if (uiState.isDeleted) {
            onBack()
        }
    }

    // Show check-in success message with new distribution date
    LaunchedEffect(uiState.checkInSuccess) {
        if (uiState.checkInSuccess) {
            val newDate = uiState.video?.distributeAt?.let { formatDateTime(it) }
            val message = if (newDate != null) {
                "Check-in successful! New distribution: $newDate"
            } else {
                "Check-in successful! Timer has been reset."
            }
            snackbarHostState.showSnackbar(message)
            onVideoUpdated()
            viewModel.clearCheckInSuccess()
        }
    }

    // Show check-in error message
    LaunchedEffect(uiState.checkInError) {
        uiState.checkInError?.let { error ->
            snackbarHostState.showSnackbar("Check-in failed: $error")
            viewModel.clearCheckInError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("Video Details") },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                }
            )
        },
        modifier = modifier
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            when {
                uiState.isLoading -> {
                    // Loading state
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                uiState.error != null && uiState.video == null -> {
                    // Error state
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.padding(16.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Filled.Info,
                                contentDescription = null,
                                modifier = Modifier.size(48.dp),
                                tint = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Text(
                                text = uiState.error ?: "Failed to load video",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedButton(onClick = { viewModel.loadVideoDetail(videoId) }) {
                                Text("Retry")
                            }
                        }
                    }
                }
                uiState.video != null -> {
                    // Video details
                    VideoDetailContent(
                        video = uiState.video!!,
                        isCheckingIn = uiState.isCheckingIn,
                        onCheckIn = { viewModel.requestCheckIn() },
                        onDelete = { viewModel.requestDelete() }
                    )
                }
            }
        }
    }

    // Check-in confirmation dialog
    if (uiState.showCheckInConfirmation) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelCheckIn() },
            title = { Text("Prevent Distribution?") },
            text = {
                Column {
                    Text("This will reset the distribution timer for \"${uiState.video?.title ?: "this video"}\".")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "The video will not be distributed until the timer expires again.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = { viewModel.checkIn() }) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelCheckIn() }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Delete confirmation dialog
    if (uiState.showDeleteConfirmation) {
        AlertDialog(
            onDismissRequest = { if (!uiState.isDeleting) viewModel.cancelDelete() },
            title = { Text("Delete Video?") },
            text = {
                Column {
                    Text("Are you sure you want to delete \"${uiState.video?.title ?: "this video"}\"?")
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        "This action cannot be undone.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                    if (uiState.deleteError != null) {
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = uiState.deleteError!!,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error
                        )
                    }
                }
            },
            confirmButton = {
                TextButton(
                    onClick = { viewModel.confirmDelete() },
                    enabled = !uiState.isDeleting
                ) {
                    if (uiState.isDeleting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            strokeWidth = 2.dp
                        )
                    } else {
                        Text("Delete", color = MaterialTheme.colorScheme.error)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { viewModel.cancelDelete() },
                    enabled = !uiState.isDeleting
                ) {
                    Text("Cancel")
                }
            }
        )
    }
}

/**
 * Content of the video detail screen.
 */
@Composable
private fun VideoDetailContent(
    video: VideoResponse,
    isCheckingIn: Boolean,
    onCheckIn: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val isActive = video.status.uppercase() == "ACTIVE"
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Video Title Card
        Card(
            modifier = Modifier.fillMaxWidth(),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
            )
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Filled.Videocam,
                        contentDescription = null,
                        modifier = Modifier.size(32.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = video.title,
                        style = MaterialTheme.typography.headlineSmall,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
                VideoStatusBadge(status = video.status)
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Distribution Information Section
        SectionHeader(title = "Distribution")
        Spacer(modifier = Modifier.height(8.dp))
        Card(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                DetailRow(
                    icon = Icons.Filled.Schedule,
                    label = getDistributionLabel(video.status),
                    value = getDistributionValue(video)
                )
                if (video.distributedAt != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    DetailRow(
                        icon = Icons.Filled.Send,
                        label = "Distributed",
                        value = formatDateTime(video.distributedAt)
                    )
                }
                if (video.expiresAt != null) {
                    Spacer(modifier = Modifier.height(12.dp))
                    DetailRow(
                        icon = Icons.Filled.AccessTime,
                        label = "Expires",
                        value = formatDateTime(video.expiresAt)
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // File Information Section
        SectionHeader(title = "File Details")
        Spacer(modifier = Modifier.height(8.dp))
        Card(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                DetailRow(
                    icon = Icons.Filled.Storage,
                    label = "Size",
                    value = formatFileSize(video.fileSizeBytes)
                )
                Spacer(modifier = Modifier.height(12.dp))
                DetailRow(
                    icon = Icons.Filled.Videocam,
                    label = "Format",
                    value = video.mimeType
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Timestamps Section
        SectionHeader(title = "Timestamps")
        Spacer(modifier = Modifier.height(8.dp))
        Card(
            modifier = Modifier.fillMaxWidth()
        ) {
            Column(
                modifier = Modifier.padding(16.dp)
            ) {
                DetailRow(
                    icon = Icons.Filled.CalendarToday,
                    label = "Created",
                    value = formatDateTime(video.createdAt)
                )
                Spacer(modifier = Modifier.height(12.dp))
                DetailRow(
                    icon = Icons.Filled.AccessTime,
                    label = "Updated",
                    value = formatDateTime(video.updatedAt)
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Public Link Section (only for distributed videos)
        if (video.status.uppercase() == "DISTRIBUTED") {
            SectionHeader(title = "Public Link")
            Spacer(modifier = Modifier.height(8.dp))
            Card(
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(
                    modifier = Modifier.padding(16.dp)
                ) {
                    Text(
                        text = "This video is available to recipients via a public link.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    OutlinedButton(
                        onClick = { /* TODO: Share public link */ },
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Share,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Share Link")
                    }
                }
            }
            Spacer(modifier = Modifier.height(24.dp))
        }

        // Actions Section
        HorizontalDivider()
        Spacer(modifier = Modifier.height(16.dp))

        // Check-In Button (only enabled for ACTIVE videos)
        Button(
            onClick = onCheckIn,
            modifier = Modifier.fillMaxWidth(),
            enabled = isActive && !isCheckingIn,
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
            )
        ) {
            if (isCheckingIn) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp
                )
            } else {
                Icon(
                    imageVector = Icons.Filled.Refresh,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
            }
            Spacer(modifier = Modifier.width(8.dp))
            Text(if (isCheckingIn) "Checking In..." else "Check In (Reset Timer)")
        }

        // Helper text for check-in
        if (!isActive) {
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = when (video.status.uppercase()) {
                    "PENDING" -> "Video is pending upload"
                    "DISTRIBUTED" -> "Video has already been distributed"
                    "EXPIRED" -> "Video has expired"
                    else -> "Check-in is only available for active videos"
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Delete Button
        Button(
            onClick = onDelete,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer
            )
        ) {
            Icon(
                imageVector = Icons.Filled.Delete,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Delete Video")
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

/**
 * Section header text.
 */
@Composable
private fun SectionHeader(title: String) {
    Text(
        text = title,
        style = MaterialTheme.typography.titleMedium,
        fontWeight = FontWeight.SemiBold,
        color = MaterialTheme.colorScheme.primary
    )
}

/**
 * Row displaying a label-value pair with an icon.
 */
@Composable
private fun DetailRow(
    icon: ImageVector,
    label: String,
    value: String,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium,
            fontWeight = FontWeight.Medium
        )
    }
}

/**
 * Badge displaying the video status.
 */
@Composable
private fun VideoStatusBadge(status: String) {
    val (label, icon, color, backgroundColor) = when (status.uppercase()) {
        "PENDING" -> StatusStyle(
            label = "Pending",
            icon = Icons.Filled.AccessTime,
            color = MaterialTheme.colorScheme.secondary,
            backgroundColor = MaterialTheme.colorScheme.secondaryContainer
        )
        "ACTIVE" -> StatusStyle(
            label = "Active",
            icon = Icons.Filled.Schedule,
            color = MaterialTheme.colorScheme.primary,
            backgroundColor = MaterialTheme.colorScheme.primaryContainer
        )
        "DISTRIBUTED" -> StatusStyle(
            label = "Distributed",
            icon = Icons.Filled.Send,
            color = Color(0xFF4CAF50),
            backgroundColor = Color(0xFFE8F5E9)
        )
        "EXPIRED" -> StatusStyle(
            label = "Expired",
            icon = Icons.Filled.CheckCircle,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            backgroundColor = MaterialTheme.colorScheme.surfaceVariant
        )
        else -> StatusStyle(
            label = status,
            icon = Icons.Filled.Videocam,
            color = MaterialTheme.colorScheme.onSurface,
            backgroundColor = MaterialTheme.colorScheme.surface
        )
    }

    Card(
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(18.dp),
                tint = color
            )
            Spacer(modifier = Modifier.width(6.dp))
            Text(
                text = label,
                style = MaterialTheme.typography.labelLarge,
                color = color,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

private data class StatusStyle(
    val label: String,
    val icon: ImageVector,
    val color: Color,
    val backgroundColor: Color
)

/**
 * Get the label for distribution time based on status.
 */
private fun getDistributionLabel(status: String): String {
    return when (status.uppercase()) {
        "DISTRIBUTED", "EXPIRED" -> "Was scheduled for"
        else -> "Scheduled for"
    }
}

/**
 * Get the distribution value based on video status.
 */
private fun getDistributionValue(video: VideoResponse): String {
    return formatDateTime(video.distributeAt)
}

/**
 * Format an ISO 8601 timestamp as a readable date/time string.
 */
private fun formatDateTime(isoTimestamp: String): String {
    return try {
        val instant = Instant.parse(isoTimestamp)
        val zonedDateTime = instant.atZone(ZoneId.systemDefault())
        val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy 'at' h:mm a")
        zonedDateTime.format(formatter)
    } catch (e: Exception) {
        isoTimestamp
    }
}

/**
 * Format file size in human-readable format.
 */
private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
        bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        else -> String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}
