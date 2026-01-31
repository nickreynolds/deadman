package com.deadmansdrop.app.ui.screens.videos

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.Videocam
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SwipeToDismissBox
import androidx.compose.material3.SwipeToDismissBoxValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberSwipeToDismissBoxState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import com.google.accompanist.swiperefresh.SwipeRefresh
import com.google.accompanist.swiperefresh.rememberSwipeRefreshState
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.data.api.models.VideoResponse
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * Screen displaying the list of user's videos.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Suppress("DEPRECATION") // SwipeRefresh is deprecated but PullToRefreshBox requires newer Compose BOM
@Composable
fun VideoListScreen(
    onVideoClick: (String) -> Unit,
    modifier: Modifier = Modifier,
    refreshTrigger: Boolean = false,
    onRefreshConsumed: () -> Unit = {},
    viewModel: VideoListViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val swipeRefreshState = rememberSwipeRefreshState(isRefreshing = uiState.isRefreshing)

    // Refresh the list when triggered externally (e.g., after a check-in)
    LaunchedEffect(refreshTrigger) {
        if (refreshTrigger) {
            viewModel.refreshVideos()
            onRefreshConsumed()
        }
    }

    SwipeRefresh(
        state = swipeRefreshState,
        onRefresh = { viewModel.refreshVideos() },
        modifier = modifier.fillMaxSize()
    ) {
        when {
            uiState.isLoading && uiState.videos.isEmpty() -> {
                // Initial loading state
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    CircularProgressIndicator()
                }
            }
            uiState.error != null && uiState.videos.isEmpty() -> {
                // Error state with no videos
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Text(
                            text = uiState.error ?: "An error occurred",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.error
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Pull down to retry",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
            uiState.videos.isEmpty() -> {
                // Empty state
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Filled.Videocam,
                            contentDescription = null,
                            modifier = Modifier.size(64.dp),
                            tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = "No videos yet",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            text = "Record your first video to get started",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                        )
                    }
                }
            }
            else -> {
                // Video list
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(
                        items = uiState.videos,
                        key = { it.id }
                    ) { video ->
                        SwipeToDeleteVideoCard(
                            video = video,
                            onClick = { onVideoClick(video.id) },
                            onDelete = { viewModel.requestDeleteVideo(video) }
                        )
                    }
                }
            }
        }
    }

    // Delete confirmation dialog
    uiState.videoToDelete?.let { video ->
        DeleteVideoConfirmationDialog(
            video = video,
            isDeleting = uiState.isDeleting,
            error = uiState.deleteError,
            onConfirm = { viewModel.confirmDelete() },
            onDismiss = { viewModel.cancelDelete() }
        )
    }
}

/**
 * Swipeable wrapper for VideoCard that triggers delete on swipe.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SwipeToDeleteVideoCard(
    video: VideoResponse,
    onClick: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier
) {
    val dismissState = rememberSwipeToDismissBoxState(
        confirmValueChange = { dismissValue ->
            if (dismissValue == SwipeToDismissBoxValue.EndToStart) {
                onDelete()
                false // Don't actually dismiss, let the dialog handle it
            } else {
                false
            }
        }
    )

    // Reset state when video changes (after deletion)
    LaunchedEffect(video.id) {
        dismissState.reset()
    }

    SwipeToDismissBox(
        state = dismissState,
        backgroundContent = {
            val color by animateColorAsState(
                when (dismissState.targetValue) {
                    SwipeToDismissBoxValue.EndToStart -> MaterialTheme.colorScheme.errorContainer
                    else -> Color.Transparent
                },
                label = "background_color"
            )
            val scale by animateFloatAsState(
                if (dismissState.targetValue == SwipeToDismissBoxValue.EndToStart) 1f else 0.75f,
                label = "icon_scale"
            )

            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(color)
                    .padding(horizontal = 20.dp),
                contentAlignment = Alignment.CenterEnd
            ) {
                Icon(
                    imageVector = Icons.Filled.Delete,
                    contentDescription = "Delete",
                    modifier = Modifier.scale(scale),
                    tint = MaterialTheme.colorScheme.onErrorContainer
                )
            }
        },
        content = {
            VideoCard(video = video, onClick = onClick, modifier = modifier)
        },
        enableDismissFromStartToEnd = false,
        enableDismissFromEndToStart = true
    )
}

/**
 * Confirmation dialog for deleting a video.
 */
@Composable
fun DeleteVideoConfirmationDialog(
    video: VideoResponse,
    isDeleting: Boolean,
    error: String?,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = { if (!isDeleting) onDismiss() },
        title = { Text("Delete Video?") },
        text = {
            Column {
                Text("Are you sure you want to delete \"${video.title}\"?")
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    "This action cannot be undone.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
                if (error != null) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = error,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.error
                    )
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = onConfirm,
                enabled = !isDeleting
            ) {
                if (isDeleting) {
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
                onClick = onDismiss,
                enabled = !isDeleting
            ) {
                Text("Cancel")
            }
        }
    )
}

/**
 * Card displaying a single video's information.
 */
@Composable
fun VideoCard(
    video: VideoResponse,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val statusInfo = getStatusInfo(video.status)

    Card(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize()
            .clickable(onClick = onClick),
        colors = CardDefaults.cardColors(
            containerColor = statusInfo.containerColor.copy(alpha = 0.1f)
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            // Title and status row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Video title
                Text(
                    text = video.title,
                    style = MaterialTheme.typography.titleMedium,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                Spacer(modifier = Modifier.width(8.dp))

                // Status chip
                StatusChip(
                    status = video.status,
                    statusInfo = statusInfo
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Distribution time row
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.Schedule,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = getDistributionText(video),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(4.dp))

            // Created time row
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Filled.AccessTime,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = "Created ${formatRelativeTime(video.createdAt)}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.7f)
                )
            }

            // File size
            Spacer(modifier = Modifier.height(4.dp))
            Text(
                text = formatFileSize(video.fileSizeBytes),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.5f)
            )
        }
    }
}

/**
 * Status chip displaying the video status.
 */
@Composable
private fun StatusChip(
    status: String,
    statusInfo: StatusInfo
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .padding(horizontal = 8.dp, vertical = 4.dp)
    ) {
        Icon(
            imageVector = statusInfo.icon,
            contentDescription = null,
            modifier = Modifier.size(14.dp),
            tint = statusInfo.color
        )
        Spacer(modifier = Modifier.width(4.dp))
        Text(
            text = statusInfo.label,
            style = MaterialTheme.typography.labelSmall,
            color = statusInfo.color
        )
    }
}

/**
 * Data class for status display information.
 */
private data class StatusInfo(
    val label: String,
    val icon: ImageVector,
    val color: Color,
    val containerColor: Color
)

/**
 * Get display information for a video status.
 */
@Composable
private fun getStatusInfo(status: String): StatusInfo {
    return when (status.uppercase()) {
        "PENDING" -> StatusInfo(
            label = "Pending",
            icon = Icons.Filled.AccessTime,
            color = MaterialTheme.colorScheme.secondary,
            containerColor = MaterialTheme.colorScheme.secondaryContainer
        )
        "ACTIVE" -> StatusInfo(
            label = "Active",
            icon = Icons.Filled.Schedule,
            color = MaterialTheme.colorScheme.primary,
            containerColor = MaterialTheme.colorScheme.primaryContainer
        )
        "DISTRIBUTED" -> StatusInfo(
            label = "Sent",
            icon = Icons.Filled.Send,
            color = Color(0xFF4CAF50),
            containerColor = Color(0xFFE8F5E9)
        )
        "EXPIRED" -> StatusInfo(
            label = "Expired",
            icon = Icons.Filled.CheckCircle,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
        else -> StatusInfo(
            label = status,
            icon = Icons.Filled.Videocam,
            color = MaterialTheme.colorScheme.onSurface,
            containerColor = MaterialTheme.colorScheme.surface
        )
    }
}

/**
 * Get distribution-related text for display.
 */
private fun getDistributionText(video: VideoResponse): String {
    return when (video.status.uppercase()) {
        "DISTRIBUTED" -> {
            video.distributedAt?.let { "Distributed ${formatRelativeTime(it)}" }
                ?: "Distributed"
        }
        "EXPIRED" -> {
            video.expiresAt?.let { "Expired ${formatRelativeTime(it)}" }
                ?: "Expired"
        }
        else -> {
            "Distributes ${formatRelativeTime(video.distributeAt)}"
        }
    }
}

/**
 * Format an ISO 8601 timestamp as a relative time string.
 */
private fun formatRelativeTime(isoTimestamp: String): String {
    return try {
        val instant = Instant.parse(isoTimestamp)
        val now = Instant.now()

        val isPast = instant.isBefore(now)
        val duration = if (isPast) {
            ChronoUnit.SECONDS.between(instant, now)
        } else {
            ChronoUnit.SECONDS.between(now, instant)
        }

        val relativeText = when {
            duration < 60 -> "just now"
            duration < 3600 -> {
                val minutes = duration / 60
                if (minutes == 1L) "1 minute" else "$minutes minutes"
            }
            duration < 86400 -> {
                val hours = duration / 3600
                if (hours == 1L) "1 hour" else "$hours hours"
            }
            duration < 604800 -> {
                val days = duration / 86400
                if (days == 1L) "1 day" else "$days days"
            }
            else -> {
                // Format as date for times more than a week away
                val formatter = DateTimeFormatter.ofPattern("MMM d, yyyy")
                instant.atZone(ZoneId.systemDefault()).format(formatter)
            }
        }

        if (isPast) {
            if (relativeText == "just now") relativeText else "$relativeText ago"
        } else {
            if (relativeText == "just now") "in a moment" else "in $relativeText"
        }
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
