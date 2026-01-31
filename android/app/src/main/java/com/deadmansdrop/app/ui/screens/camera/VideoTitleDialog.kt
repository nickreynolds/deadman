package com.deadmansdrop.app.ui.screens.camera

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.deadmansdrop.app.R

/**
 * Dialog shown after recording a video to optionally add a title.
 *
 * @param onConfirm Callback when user confirms with a title (can be blank)
 * @param onSkip Callback when user skips entering a title
 * @param onDismiss Callback when dialog is dismissed (e.g., back button)
 */
@Composable
fun VideoTitleDialog(
    onConfirm: (String) -> Unit,
    onSkip: () -> Unit,
    onDismiss: () -> Unit = onSkip
) {
    var title by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Text(text = stringResource(R.string.video_title_dialog_title))
        },
        text = {
            Column {
                Text(text = stringResource(R.string.video_title_dialog_message))
                Spacer(modifier = Modifier.height(16.dp))
                OutlinedTextField(
                    value = title,
                    onValueChange = { title = it },
                    label = { Text(stringResource(R.string.video_title_dialog_hint)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            TextButton(
                onClick = { onConfirm(title.trim()) }
            ) {
                Text(stringResource(R.string.video_title_dialog_save))
            }
        },
        dismissButton = {
            TextButton(onClick = onSkip) {
                Text(stringResource(R.string.video_title_dialog_skip))
            }
        }
    )
}
