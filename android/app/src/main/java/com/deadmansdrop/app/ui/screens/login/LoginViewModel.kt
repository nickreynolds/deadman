package com.deadmansdrop.app.ui.screens.login

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.security.CredentialManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * UI state for the login screen.
 */
data class LoginUiState(
    val serverUrl: String = "",
    val username: String = "",
    val password: String = "",
    val isLoading: Boolean = false,
    val isLoggedIn: Boolean = false,
    val errorMessage: String? = null,
    val serverUrlError: String? = null,
    val usernameError: String? = null,
    val passwordError: String? = null
)

/**
 * ViewModel for the login screen.
 * Handles user input validation and login logic.
 */
@HiltViewModel
class LoginViewModel @Inject constructor(
    private val credentialManager: CredentialManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(LoginUiState())
    val uiState: StateFlow<LoginUiState> = _uiState.asStateFlow()

    init {
        // Pre-fill server URL if previously saved
        credentialManager.getServerUrl()?.let { savedUrl ->
            _uiState.update { it.copy(serverUrl = savedUrl) }
        }

        // Check if already authenticated
        if (credentialManager.isAuthenticated()) {
            _uiState.update { it.copy(isLoggedIn = true) }
        }
    }

    /**
     * Update server URL field.
     */
    fun onServerUrlChange(value: String) {
        _uiState.update {
            it.copy(
                serverUrl = value,
                serverUrlError = null
            )
        }
    }

    /**
     * Update username field.
     */
    fun onUsernameChange(value: String) {
        _uiState.update {
            it.copy(
                username = value,
                usernameError = null
            )
        }
    }

    /**
     * Update password field.
     */
    fun onPasswordChange(value: String) {
        _uiState.update {
            it.copy(
                password = value,
                passwordError = null
            )
        }
    }

    /**
     * Clear error message after it has been shown.
     */
    fun clearError() {
        _uiState.update { it.copy(errorMessage = null) }
    }

    /**
     * Validate input fields.
     * @return true if all fields are valid
     */
    private fun validateInputs(): Boolean {
        var isValid = true
        var serverUrlError: String? = null
        var usernameError: String? = null
        var passwordError: String? = null

        val serverUrl = _uiState.value.serverUrl.trim()
        val username = _uiState.value.username.trim()
        val password = _uiState.value.password

        // Validate server URL
        if (serverUrl.isBlank()) {
            serverUrlError = "Server URL is required"
            isValid = false
        } else if (!isValidUrl(serverUrl)) {
            serverUrlError = "Please enter a valid URL (e.g., https://example.com)"
            isValid = false
        }

        // Validate username
        if (username.isBlank()) {
            usernameError = "Username is required"
            isValid = false
        }

        // Validate password
        if (password.isBlank()) {
            passwordError = "Password is required"
            isValid = false
        }

        _uiState.update {
            it.copy(
                serverUrlError = serverUrlError,
                usernameError = usernameError,
                passwordError = passwordError
            )
        }

        return isValid
    }

    /**
     * Check if a string is a valid URL.
     */
    private fun isValidUrl(url: String): Boolean {
        return try {
            val trimmedUrl = url.trim()
            // Check for basic URL structure
            (trimmedUrl.startsWith("http://") || trimmedUrl.startsWith("https://")) &&
                trimmedUrl.length > 10 &&
                android.util.Patterns.WEB_URL.matcher(trimmedUrl).matches()
        } catch (e: Exception) {
            false
        }
    }

    /**
     * Normalize server URL by removing trailing slashes.
     */
    private fun normalizeServerUrl(url: String): String {
        return url.trim().trimEnd('/')
    }

    /**
     * Attempt to log in with the current credentials.
     * Note: Actual API call will be implemented in Task 131.
     * For now, this validates inputs and prepares the state.
     */
    fun login() {
        if (!validateInputs()) {
            return
        }

        viewModelScope.launch {
            _uiState.update { it.copy(isLoading = true, errorMessage = null) }

            try {
                val serverUrl = normalizeServerUrl(_uiState.value.serverUrl)

                // Save server URL for future use
                credentialManager.saveServerUrl(serverUrl)

                // TODO: Task 131 will implement the actual API call here
                // For now, we just show an error message indicating API is not yet implemented
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = "API service not yet implemented. Complete Task 131 to enable login."
                    )
                }

            } catch (e: Exception) {
                _uiState.update {
                    it.copy(
                        isLoading = false,
                        errorMessage = e.message ?: "An unexpected error occurred"
                    )
                }
            }
        }
    }
}
