package com.deadmansdrop.app.ui.screens.settings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.repository.UserRepository
import com.deadmansdrop.app.data.security.CredentialManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * UI state for the settings screen.
 */
data class SettingsUiState(
    val serverUrl: String = "",
    val username: String = "",
    val defaultTimerDays: Int = 7,
    val storageQuotaBytes: Long = 0L,
    val storageUsedBytes: Long = 0L,
    val isLoading: Boolean = false,
    val error: String? = null,
    val isSavingTimer: Boolean = false,
    val timerSaveSuccess: Boolean = false,
    val timerSaveError: String? = null,
    val showLogoutConfirmation: Boolean = false
)

/**
 * ViewModel for the settings screen.
 * Manages fetching and updating user settings.
 */
@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val userRepository: UserRepository,
    private val credentialManager: CredentialManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(SettingsUiState())
    val uiState: StateFlow<SettingsUiState> = _uiState.asStateFlow()

    init {
        // Load local data immediately
        _uiState.update {
            it.copy(
                serverUrl = credentialManager.getServerUrl() ?: "",
                username = credentialManager.getUsername() ?: ""
            )
        }
    }

    /**
     * Load settings from the server.
     */
    fun loadSettings() {
        if (_uiState.value.isLoading) return

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, error = null) }

            when (val result = userRepository.getUserSettings()) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            defaultTimerDays = result.data.defaultTimerDays,
                            storageQuotaBytes = result.data.storageQuotaBytes,
                            storageUsedBytes = result.data.storageUsedBytes,
                            isLoading = false,
                            error = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isLoading = false,
                            error = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Update the default timer days on the server.
     */
    fun updateTimerDays(days: Int) {
        if (_uiState.value.isSavingTimer) return

        viewModelScope.launch {
            _uiState.update { it.copy(isSavingTimer = true, timerSaveError = null, timerSaveSuccess = false) }

            when (val result = userRepository.updateUserSettings(defaultTimerDays = days)) {
                is ApiResult.Success -> {
                    _uiState.update { state ->
                        state.copy(
                            defaultTimerDays = result.data.settings.defaultTimerDays,
                            isSavingTimer = false,
                            timerSaveSuccess = true,
                            timerSaveError = null
                        )
                    }
                }
                is ApiResult.Error -> {
                    _uiState.update { state ->
                        state.copy(
                            isSavingTimer = false,
                            timerSaveError = result.message
                        )
                    }
                }
            }
        }
    }

    /**
     * Show the logout confirmation dialog.
     */
    fun requestLogout() {
        _uiState.update { it.copy(showLogoutConfirmation = true) }
    }

    /**
     * Dismiss the logout confirmation dialog.
     */
    fun cancelLogout() {
        _uiState.update { it.copy(showLogoutConfirmation = false) }
    }

    /**
     * Clear the timer save success flag.
     */
    fun clearTimerSaveSuccess() {
        _uiState.update { it.copy(timerSaveSuccess = false) }
    }

    /**
     * Clear the timer save error.
     */
    fun clearTimerSaveError() {
        _uiState.update { it.copy(timerSaveError = null) }
    }
}
