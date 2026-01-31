package com.deadmansdrop.app.ui.screens.upload

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import java.util.UUID

/**
 * Composable that displays a list of video uploads with their progress.
 *
 * @param uploads List of upload states to display
 * @param onCancel Callback when user cancels an upload
 * @param onDismiss Callback when user dismisses a completed upload
 * @param onClearCompleted Callback to clear all completed uploads
 * @param modifier Modifier for the composable
 */
@Composable
fun UploadProgressList(
    uploads: List<UploadState>,
    onCancel: (UUID) -> Unit,
    onDismiss: (UUID) -> Unit,
    onClearCompleted: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        // Header
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp, vertical = 8.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = "Uploads",
                style = MaterialTheme.typography.titleMedium
            )

            // Show clear button if there are completed uploads
            val hasCompleted = uploads.any {
                it.status == UploadStatus.SUCCESS ||
                it.status == UploadStatus.FAILED ||
                it.status == UploadStatus.CANCELLED
            }
            if (hasCompleted) {
                TextButton(onClick = onClearCompleted) {
                    Text("Clear completed")
                }
            }
        }

        if (uploads.isEmpty()) {
            // Empty state
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(32.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = "No uploads",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            // Upload list
            LazyColumn(
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                items(
                    items = uploads,
                    key = { it.workId }
                ) { uploadState ->
                    UploadProgressCard(
                        uploadState = uploadState,
                        onCancel = onCancel,
                        onDismiss = onDismiss
                    )
                }
            }
        }
    }
}

/**
 * Compact upload indicator that can be shown inline (e.g., in a top bar or as a FAB badge).
 * Shows when there are active uploads.
 */
@Composable
fun UploadIndicator(
    activeCount: Int,
    currentProgress: Int?,
    modifier: Modifier = Modifier
) {
    if (activeCount > 0) {
        Row(
            modifier = modifier
                .padding(horizontal = 8.dp, vertical = 4.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
            Text(
                text = if (activeCount == 1) {
                    "Uploading${currentProgress?.let { " $it%" } ?: "..."}"
                } else {
                    "$activeCount uploads in progress"
                },
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }
    }
}
