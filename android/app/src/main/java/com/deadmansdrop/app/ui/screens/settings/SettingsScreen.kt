package com.deadmansdrop.app.ui.screens.settings

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
import androidx.compose.material.icons.automirrored.filled.Logout
import androidx.compose.material.icons.filled.Cloud
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Storage
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Slider
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.deadmansdrop.app.R
import kotlin.math.roundToInt

/**
 * Settings screen displaying user settings with options to modify them.
 *
 * @param onBack Callback invoked when user navigates back
 * @param onLogout Callback invoked when user confirms logout
 * @param modifier Modifier for the root composable
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(
    onBack: () -> Unit,
    onLogout: () -> Unit,
    modifier: Modifier = Modifier,
    onNavigateToRecipients: () -> Unit = {},
    viewModel: SettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val snackbarHostState = remember { SnackbarHostState() }

    // Load settings when screen is shown
    LaunchedEffect(Unit) {
        viewModel.loadSettings()
    }

    // Show timer save success
    LaunchedEffect(uiState.timerSaveSuccess) {
        if (uiState.timerSaveSuccess) {
            snackbarHostState.showSnackbar("Timer updated to ${uiState.defaultTimerDays} days")
            viewModel.clearTimerSaveSuccess()
        }
    }

    // Show timer save error
    LaunchedEffect(uiState.timerSaveError) {
        uiState.timerSaveError?.let { error ->
            snackbarHostState.showSnackbar("Failed to update timer: $error")
            viewModel.clearTimerSaveError()
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.settings_title)) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.settings_back)
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
                uiState.isLoading && uiState.storageQuotaBytes == 0L -> {
                    // Initial loading state
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center
                    ) {
                        CircularProgressIndicator()
                    }
                }
                uiState.error != null && uiState.storageQuotaBytes == 0L -> {
                    // Error state (only if we have no data)
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
                                text = uiState.error ?: "Failed to load settings",
                                style = MaterialTheme.typography.bodyMedium,
                                color = MaterialTheme.colorScheme.error
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            OutlinedButton(onClick = { viewModel.loadSettings() }) {
                                Text(stringResource(R.string.settings_retry))
                            }
                        }
                    }
                }
                else -> {
                    SettingsContent(
                        uiState = uiState,
                        onUpdateTimer = { days -> viewModel.updateTimerDays(days) },
                        onRequestLogout = { viewModel.requestLogout() },
                        onNavigateToRecipients = onNavigateToRecipients
                    )
                }
            }
        }
    }

    // Logout confirmation dialog
    if (uiState.showLogoutConfirmation) {
        AlertDialog(
            onDismissRequest = { viewModel.cancelLogout() },
            title = { Text(stringResource(R.string.settings_logout_confirm_title)) },
            text = { Text(stringResource(R.string.settings_logout_confirm_message)) },
            confirmButton = {
                TextButton(
                    onClick = {
                        viewModel.cancelLogout()
                        onLogout()
                    }
                ) {
                    Text(
                        stringResource(R.string.settings_logout_confirm_button),
                        color = MaterialTheme.colorScheme.error
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { viewModel.cancelLogout() }) {
                    Text(stringResource(R.string.settings_cancel))
                }
            }
        )
    }
}

/**
 * Settings content with all sections.
 */
@Composable
private fun SettingsContent(
    uiState: SettingsUiState,
    onUpdateTimer: (Int) -> Unit,
    onRequestLogout: () -> Unit,
    onNavigateToRecipients: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp)
    ) {
        // Account Section
        SectionHeader(title = stringResource(R.string.settings_section_account))
        Spacer(modifier = Modifier.height(8.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsRow(
                    icon = Icons.Filled.Cloud,
                    label = stringResource(R.string.settings_server_label),
                    value = uiState.serverUrl.ifBlank { "-" }
                )
                Spacer(modifier = Modifier.height(12.dp))
                SettingsRow(
                    icon = Icons.Filled.Person,
                    label = stringResource(R.string.settings_username_label),
                    value = uiState.username.ifBlank { "-" }
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Timer Section
        SectionHeader(title = stringResource(R.string.settings_section_timer))
        Spacer(modifier = Modifier.height(8.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                Row(
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Filled.Timer,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.settings_timer_label),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = stringResource(R.string.settings_timer_description),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(16.dp))

                TimerSlider(
                    currentDays = uiState.defaultTimerDays,
                    isSaving = uiState.isSavingTimer,
                    onSave = onUpdateTimer
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Storage Section
        SectionHeader(title = stringResource(R.string.settings_section_storage))
        Spacer(modifier = Modifier.height(8.dp))
        Card(modifier = Modifier.fillMaxWidth()) {
            Column(modifier = Modifier.padding(16.dp)) {
                SettingsRow(
                    icon = Icons.Filled.Storage,
                    label = stringResource(R.string.settings_storage_used_label),
                    value = formatStorageSize(uiState.storageUsedBytes)
                )
                Spacer(modifier = Modifier.height(12.dp))
                SettingsRow(
                    icon = Icons.Filled.Storage,
                    label = stringResource(R.string.settings_storage_quota_label),
                    value = formatStorageSize(uiState.storageQuotaBytes)
                )
                Spacer(modifier = Modifier.height(16.dp))

                // Storage usage progress bar
                val usagePercent = if (uiState.storageQuotaBytes > 0) {
                    (uiState.storageUsedBytes.toFloat() / uiState.storageQuotaBytes.toFloat())
                        .coerceIn(0f, 1f)
                } else {
                    0f
                }
                LinearProgressIndicator(
                    progress = { usagePercent },
                    modifier = Modifier.fillMaxWidth(),
                    color = if (usagePercent > 0.9f) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    }
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = "${(usagePercent * 100).toInt()}% used",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))

        // Recipients Section
        SectionHeader(title = stringResource(R.string.settings_section_recipients))
        Spacer(modifier = Modifier.height(8.dp))
        OutlinedButton(
            onClick = onNavigateToRecipients,
            modifier = Modifier.fillMaxWidth()
        ) {
            Icon(
                imageVector = Icons.Filled.People,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.settings_recipients_button))
        }

        Spacer(modifier = Modifier.height(32.dp))

        // Logout Button
        Button(
            onClick = onRequestLogout,
            modifier = Modifier.fillMaxWidth(),
            colors = ButtonDefaults.buttonColors(
                containerColor = MaterialTheme.colorScheme.errorContainer,
                contentColor = MaterialTheme.colorScheme.onErrorContainer
            )
        ) {
            Icon(
                imageVector = Icons.AutoMirrored.Filled.Logout,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(stringResource(R.string.settings_logout_button))
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

/**
 * Timer slider with save button.
 */
@Composable
private fun TimerSlider(
    currentDays: Int,
    isSaving: Boolean,
    onSave: (Int) -> Unit
) {
    var sliderValue by rememberSaveable { mutableFloatStateOf(currentDays.toFloat()) }

    // Update slider when server value changes
    LaunchedEffect(currentDays) {
        sliderValue = currentDays.toFloat()
    }

    val selectedDays = sliderValue.roundToInt()
    val hasChanged = selectedDays != currentDays

    Text(
        text = "$selectedDays ${if (selectedDays == 1) "day" else "days"}",
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
        color = MaterialTheme.colorScheme.primary
    )
    Spacer(modifier = Modifier.height(8.dp))

    Slider(
        value = sliderValue,
        onValueChange = { sliderValue = it },
        valueRange = 1f..30f,
        steps = 28,
        enabled = !isSaving
    )

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(
            text = "1 day",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Text(
            text = "30 days",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }

    if (hasChanged) {
        Spacer(modifier = Modifier.height(12.dp))
        Button(
            onClick = { onSave(selectedDays) },
            modifier = Modifier.fillMaxWidth(),
            enabled = !isSaving
        ) {
            if (isSaving) {
                CircularProgressIndicator(
                    modifier = Modifier.size(18.dp),
                    color = MaterialTheme.colorScheme.onPrimary,
                    strokeWidth = 2.dp
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(stringResource(R.string.settings_timer_saving))
            } else {
                Text(stringResource(R.string.settings_timer_save))
            }
        }
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
private fun SettingsRow(
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
 * Format storage size in human-readable format.
 */
private fun formatStorageSize(bytes: Long): String {
    return when {
        bytes < 1024 -> "$bytes B"
        bytes < 1024 * 1024 -> String.format("%.1f KB", bytes / 1024.0)
        bytes < 1024 * 1024 * 1024 -> String.format("%.1f MB", bytes / (1024.0 * 1024.0))
        else -> String.format("%.2f GB", bytes / (1024.0 * 1024.0 * 1024.0))
    }
}
