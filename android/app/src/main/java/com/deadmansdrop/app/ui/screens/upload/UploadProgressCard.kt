package com.deadmansdrop.app.ui.screens.upload

import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Cancel
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.CloudUpload
import androidx.compose.material.icons.filled.Error
import androidx.compose.material.icons.filled.HourglassEmpty
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import java.util.UUID

/**
 * Card displaying the progress of a single video upload.
 */
@Composable
fun UploadProgressCard(
    uploadState: UploadState,
    onCancel: (UUID) -> Unit,
    onDismiss: (UUID) -> Unit,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize(),
        colors = CardDefaults.cardColors(
            containerColor = when (uploadState.status) {
                UploadStatus.SUCCESS -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.3f)
                UploadStatus.FAILED -> MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.3f)
                UploadStatus.CANCELLED -> MaterialTheme.colorScheme.surfaceVariant
                else -> MaterialTheme.colorScheme.surface
            }
        ),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Status icon
                StatusIcon(uploadState.status)

                Spacer(modifier = Modifier.width(12.dp))

                // File name and status
                Column(
                    modifier = Modifier.weight(1f)
                ) {
                    Text(
                        text = uploadState.fileName,
                        style = MaterialTheme.typography.bodyMedium,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        text = getStatusText(uploadState),
                        style = MaterialTheme.typography.bodySmall,
                        color = getStatusColor(uploadState.status)
                    )
                }

                // Action button (cancel for active, dismiss for completed)
                when (uploadState.status) {
                    UploadStatus.UPLOADING, UploadStatus.PENDING -> {
                        IconButton(onClick = { onCancel(uploadState.workId) }) {
                            Icon(
                                imageVector = Icons.Filled.Cancel,
                                contentDescription = "Cancel upload",
                                tint = MaterialTheme.colorScheme.error
                            )
                        }
                    }
                    UploadStatus.SUCCESS, UploadStatus.FAILED, UploadStatus.CANCELLED -> {
                        IconButton(onClick = { onDismiss(uploadState.workId) }) {
                            Icon(
                                imageVector = Icons.Filled.Close,
                                contentDescription = "Dismiss",
                                tint = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                }
            }

            // Progress bar for active uploads
            if (uploadState.status == UploadStatus.UPLOADING) {
                Spacer(modifier = Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = uploadState.progress.progressPercent / 100f,
                    modifier = Modifier.fillMaxWidth(),
                    strokeCap = StrokeCap.Round
                )
                Spacer(modifier = Modifier.height(4.dp))
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "${uploadState.progress.progressPercent}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = formatBytes(uploadState.progress.bytesUploaded, uploadState.progress.totalBytes),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Error message for failed uploads
            if (uploadState.status == UploadStatus.FAILED && uploadState.errorMessage != null) {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = uploadState.errorMessage,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}

@Composable
private fun StatusIcon(status: UploadStatus) {
    when (status) {
        UploadStatus.PENDING -> {
            Icon(
                imageVector = Icons.Filled.HourglassEmpty,
                contentDescription = "Pending",
                tint = MaterialTheme.colorScheme.secondary,
                modifier = Modifier.size(24.dp)
            )
        }
        UploadStatus.UPLOADING -> {
            CircularProgressIndicator(
                modifier = Modifier.size(24.dp),
                strokeWidth = 2.dp
            )
        }
        UploadStatus.SUCCESS -> {
            Icon(
                imageVector = Icons.Filled.CheckCircle,
                contentDescription = "Success",
                tint = Color(0xFF4CAF50),
                modifier = Modifier.size(24.dp)
            )
        }
        UploadStatus.FAILED -> {
            Icon(
                imageVector = Icons.Filled.Error,
                contentDescription = "Failed",
                tint = MaterialTheme.colorScheme.error,
                modifier = Modifier.size(24.dp)
            )
        }
        UploadStatus.CANCELLED -> {
            Icon(
                imageVector = Icons.Filled.Cancel,
                contentDescription = "Cancelled",
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(24.dp)
            )
        }
    }
}

private fun getStatusText(state: UploadState): String {
    return when (state.status) {
        UploadStatus.PENDING -> "Waiting to upload..."
        UploadStatus.UPLOADING -> "Uploading..."
        UploadStatus.SUCCESS -> "Upload complete"
        UploadStatus.FAILED -> "Upload failed"
        UploadStatus.CANCELLED -> "Cancelled"
    }
}

@Composable
private fun getStatusColor(status: UploadStatus): Color {
    return when (status) {
        UploadStatus.PENDING -> MaterialTheme.colorScheme.secondary
        UploadStatus.UPLOADING -> MaterialTheme.colorScheme.primary
        UploadStatus.SUCCESS -> Color(0xFF4CAF50)
        UploadStatus.FAILED -> MaterialTheme.colorScheme.error
        UploadStatus.CANCELLED -> MaterialTheme.colorScheme.onSurfaceVariant
    }
}

private fun formatBytes(uploaded: Long, total: Long): String {
    return "${formatFileSize(uploaded)} / ${formatFileSize(total)}"
}

private fun formatFileSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
        bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        else -> String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}
