package com.deadmansdrop.app.ui.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.deadmansdrop.app.data.auth.AuthStateManager
import com.deadmansdrop.app.data.security.CredentialManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Authentication state for the entire app.
 */
data class AuthState(
    val isAuthenticated: Boolean = false,
    val isLoading: Boolean = true,
    val userId: String? = null,
    val username: String? = null,
    val isAdmin: Boolean = false
)

/**
 * ViewModel for managing app-wide authentication state.
 *
 * This ViewModel:
 * - Persists authentication state across configuration changes
 * - Reacts to authentication state changes (including logout from token refresh failure)
 * - Provides logout functionality
 * - Can be observed by the app's main navigation to decide what to show
 */
@HiltViewModel
class AuthViewModel @Inject constructor(
    private val credentialManager: CredentialManager,
    private val authStateManager: AuthStateManager
) : ViewModel() {

    private val _authState = MutableStateFlow(AuthState(isLoading = true))
    val authState: StateFlow<AuthState> = _authState.asStateFlow()

    init {
        // Check authentication status on initialization
        checkAuthState()

        // Listen for auth state changes (e.g., when token refresh fails)
        observeAuthStateChanges()
    }

    /**
     * Check and update the current authentication state.
     */
    fun checkAuthState() {
        val isAuthenticated = credentialManager.isAuthenticated()

        if (isAuthenticated) {
            _authState.value = AuthState(
                isAuthenticated = true,
                isLoading = false,
                userId = credentialManager.getUserId(),
                username = credentialManager.getUsername(),
                isAdmin = credentialManager.isAdmin()
            )
        } else {
            _authState.value = AuthState(
                isAuthenticated = false,
                isLoading = false
            )
        }
    }

    /**
     * Called when user successfully logs in.
     * Updates the auth state to reflect the new credentials.
     */
    fun onLoginSuccess() {
        checkAuthState()
    }

    /**
     * Log out the current user.
     * Clears credentials and updates auth state.
     */
    fun logout() {
        credentialManager.logout()
        _authState.value = AuthState(
            isAuthenticated = false,
            isLoading = false
        )
    }

    /**
     * Observe auth state changes from other parts of the app
     * (e.g., when token refresh fails in TokenAuthenticator).
     */
    private fun observeAuthStateChanges() {
        viewModelScope.launch {
            authStateManager.authStateChanges.collect { event ->
                when (event) {
                    is AuthStateManager.AuthEvent.LoggedOut -> {
                        _authState.value = AuthState(
                            isAuthenticated = false,
                            isLoading = false
                        )
                    }
                    is AuthStateManager.AuthEvent.TokenRefreshed -> {
                        // Token was refreshed, update our state
                        checkAuthState()
                    }
                }
            }
        }
    }
}
