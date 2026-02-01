package com.deadmansdrop.app.ui.auth

import com.deadmansdrop.app.data.auth.AuthStateManager
import com.deadmansdrop.app.data.security.CredentialManager
import com.deadmansdrop.app.services.FcmTokenManager
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.advanceUntilIdle
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class AuthViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var credentialManager: CredentialManager
    private lateinit var authStateManager: AuthStateManager
    private lateinit var fcmTokenManager: FcmTokenManager
    private lateinit var authEventsFlow: MutableSharedFlow<AuthStateManager.AuthEvent>

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        credentialManager = mockk(relaxed = true)
        fcmTokenManager = mockk(relaxed = true)

        authEventsFlow = MutableSharedFlow(extraBufferCapacity = 1)
        authStateManager = mockk {
            every { authStateChanges } returns authEventsFlow
        }

        coEvery { fcmTokenManager.registerForFcm() } returns "fcm-token"
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `init sets authenticated state when credentials exist`() = runTest {
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-1"
        every { credentialManager.getUsername() } returns "testuser"
        every { credentialManager.isAdmin() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        val state = viewModel.authState.value
        assertTrue(state.isAuthenticated)
        assertFalse(state.isLoading)
        assertEquals("user-1", state.userId)
        assertEquals("testuser", state.username)
        assertFalse(state.isAdmin)
    }

    @Test
    fun `init sets unauthenticated state when no credentials`() = runTest {
        every { credentialManager.isAuthenticated() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        val state = viewModel.authState.value
        assertFalse(state.isAuthenticated)
        assertFalse(state.isLoading)
        assertNull(state.userId)
    }

    @Test
    fun `init registers for FCM when authenticated`() = runTest {
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-1"
        every { credentialManager.getUsername() } returns "testuser"
        every { credentialManager.isAdmin() } returns false

        AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        io.mockk.coVerify { fcmTokenManager.registerForFcm() }
    }

    @Test
    fun `init does not register for FCM when not authenticated`() = runTest {
        every { credentialManager.isAuthenticated() } returns false

        AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        io.mockk.coVerify(exactly = 0) { fcmTokenManager.registerForFcm() }
    }

    @Test
    fun `logout clears credentials and sets unauthenticated state`() = runTest {
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-1"
        every { credentialManager.getUsername() } returns "testuser"
        every { credentialManager.isAdmin() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        viewModel.logout()

        verify { credentialManager.logout() }
        val state = viewModel.authState.value
        assertFalse(state.isAuthenticated)
        assertFalse(state.isLoading)
    }

    @Test
    fun `onLoginSuccess updates auth state`() = runTest {
        every { credentialManager.isAuthenticated() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        // Simulate successful login: now isAuthenticated returns true
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-2"
        every { credentialManager.getUsername() } returns "newuser"
        every { credentialManager.isAdmin() } returns true

        viewModel.onLoginSuccess()
        advanceUntilIdle()

        val state = viewModel.authState.value
        assertTrue(state.isAuthenticated)
        assertEquals("user-2", state.userId)
        assertEquals("newuser", state.username)
        assertTrue(state.isAdmin)
    }

    @Test
    fun `onLoginSuccess registers for FCM`() = runTest {
        every { credentialManager.isAuthenticated() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-2"
        every { credentialManager.getUsername() } returns "newuser"
        every { credentialManager.isAdmin() } returns false

        viewModel.onLoginSuccess()
        advanceUntilIdle()

        io.mockk.coVerify { fcmTokenManager.registerForFcm() }
    }

    @Test
    fun `LoggedOut auth event sets unauthenticated state`() = runTest {
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-1"
        every { credentialManager.getUsername() } returns "testuser"
        every { credentialManager.isAdmin() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        assertTrue(viewModel.authState.value.isAuthenticated)

        // Emit logged out event
        authEventsFlow.tryEmit(AuthStateManager.AuthEvent.LoggedOut)
        advanceUntilIdle()

        assertFalse(viewModel.authState.value.isAuthenticated)
    }

    @Test
    fun `TokenRefreshed auth event rechecks auth state`() = runTest {
        every { credentialManager.isAuthenticated() } returns true
        every { credentialManager.getUserId() } returns "user-1"
        every { credentialManager.getUsername() } returns "testuser"
        every { credentialManager.isAdmin() } returns false

        val viewModel = AuthViewModel(credentialManager, authStateManager, fcmTokenManager)
        advanceUntilIdle()

        // Change username (simulating updated credentials after token refresh)
        every { credentialManager.getUsername() } returns "updateduser"

        authEventsFlow.tryEmit(AuthStateManager.AuthEvent.TokenRefreshed)
        advanceUntilIdle()

        assertEquals("updateduser", viewModel.authState.value.username)
    }
}
