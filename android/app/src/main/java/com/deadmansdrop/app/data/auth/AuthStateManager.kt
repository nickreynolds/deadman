package com.deadmansdrop.app.data.auth

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication state changes across the app.
 *
 * This class provides a way for components like TokenAuthenticator to notify
 * the rest of the app when authentication state changes (e.g., when token
 * refresh fails and the user needs to log in again).
 */
@Singleton
class AuthStateManager @Inject constructor() {

    private val _authStateChanges = MutableSharedFlow<AuthEvent>(extraBufferCapacity = 1)

    /**
     * Flow of authentication events that UI components can observe.
     */
    val authStateChanges: SharedFlow<AuthEvent> = _authStateChanges.asSharedFlow()

    /**
     * Notify observers that the user has been logged out.
     * Called when token refresh fails or user explicitly logs out.
     */
    fun notifyLoggedOut() {
        _authStateChanges.tryEmit(AuthEvent.LoggedOut)
    }

    /**
     * Notify observers that the token was successfully refreshed.
     */
    fun notifyTokenRefreshed() {
        _authStateChanges.tryEmit(AuthEvent.TokenRefreshed)
    }

    /**
     * Authentication events that can be observed by UI components.
     */
    sealed class AuthEvent {
        /**
         * User has been logged out (token refresh failed or explicit logout).
         */
        object LoggedOut : AuthEvent()

        /**
         * Token was successfully refreshed.
         */
        object TokenRefreshed : AuthEvent()
    }
}
