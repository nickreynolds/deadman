package com.deadmansdrop.app.ui.screens.login

import android.util.Patterns
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.LoginResponse
import com.deadmansdrop.app.data.api.models.UserInfo
import com.deadmansdrop.app.data.repository.AuthRepository
import com.deadmansdrop.app.data.security.CredentialManager
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
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
import java.util.regex.Matcher

@OptIn(ExperimentalCoroutinesApi::class)
class LoginViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var credentialManager: CredentialManager
    private lateinit var authRepository: AuthRepository
    private lateinit var viewModel: LoginViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        credentialManager = mockk(relaxed = true)
        authRepository = mockk()

        // Mock android.util.Patterns.WEB_URL to work in unit tests
        mockkStatic(Patterns::class)
        val mockMatcher = mockk<Matcher>()
        every { mockMatcher.matches() } returns true
        val mockPattern = mockk<java.util.regex.Pattern>()
        every { mockPattern.matcher(any()) } returns mockMatcher
        Patterns.WEB_URL = mockPattern

        every { credentialManager.getServerUrl() } returns null
        every { credentialManager.isAuthenticated() } returns false
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
        unmockkStatic(Patterns::class)
    }

    private fun createViewModel(): LoginViewModel {
        return LoginViewModel(credentialManager, authRepository)
    }

    @Test
    fun `init prefills server URL from credential manager`() = runTest {
        every { credentialManager.getServerUrl() } returns "https://saved.example.com"

        viewModel = createViewModel()

        assertEquals("https://saved.example.com", viewModel.uiState.value.serverUrl)
    }

    @Test
    fun `init sets isLoggedIn when already authenticated`() = runTest {
        every { credentialManager.isAuthenticated() } returns true

        viewModel = createViewModel()

        assertTrue(viewModel.uiState.value.isLoggedIn)
    }

    @Test
    fun `init sets isLoggedIn false when not authenticated`() = runTest {
        viewModel = createViewModel()

        assertFalse(viewModel.uiState.value.isLoggedIn)
    }

    @Test
    fun `onServerUrlChange updates state and clears error`() = runTest {
        viewModel = createViewModel()

        viewModel.onServerUrlChange("https://new-server.com")

        val state = viewModel.uiState.value
        assertEquals("https://new-server.com", state.serverUrl)
        assertNull(state.serverUrlError)
    }

    @Test
    fun `onUsernameChange updates state and clears error`() = runTest {
        viewModel = createViewModel()

        viewModel.onUsernameChange("newuser")

        val state = viewModel.uiState.value
        assertEquals("newuser", state.username)
        assertNull(state.usernameError)
    }

    @Test
    fun `onPasswordChange updates state and clears error`() = runTest {
        viewModel = createViewModel()

        viewModel.onPasswordChange("newpass")

        val state = viewModel.uiState.value
        assertEquals("newpass", state.password)
        assertNull(state.passwordError)
    }

    @Test
    fun `clearError clears error message`() = runTest {
        viewModel = createViewModel()

        viewModel.clearError()

        assertNull(viewModel.uiState.value.errorMessage)
    }

    @Test
    fun `login validates empty server URL`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("")
        viewModel.onUsernameChange("user")
        viewModel.onPasswordChange("pass")

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Server URL is required", viewModel.uiState.value.serverUrlError)
    }

    @Test
    fun `login validates empty username`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("")
        viewModel.onPasswordChange("pass")

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Username is required", viewModel.uiState.value.usernameError)
    }

    @Test
    fun `login validates empty password`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("user")
        viewModel.onPasswordChange("")

        viewModel.login()
        advanceUntilIdle()

        assertEquals("Password is required", viewModel.uiState.value.passwordError)
    }

    @Test
    fun `login succeeds with valid credentials`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("testuser")
        viewModel.onPasswordChange("testpass")

        coEvery {
            authRepository.login("https://example.com", "testuser", "testpass")
        } returns ApiResult.Success(
            LoginResponse(
                token = "jwt-token-123",
                user = UserInfo(id = "user-1", username = "testuser", isAdmin = false)
            )
        )

        viewModel.login()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.isLoggedIn)
        assertFalse(state.isLoading)
        assertNull(state.errorMessage)
        verify { credentialManager.saveServerUrl("https://example.com") }
        verify {
            credentialManager.saveAuthCredentials(
                jwtToken = "jwt-token-123",
                jwtExpiry = any(),
                userId = "user-1",
                username = "testuser",
                isAdmin = false
            )
        }
    }

    @Test
    fun `login sets error on API failure`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("testuser")
        viewModel.onPasswordChange("wrongpass")

        coEvery {
            authRepository.login("https://example.com", "testuser", "wrongpass")
        } returns ApiResult.Error("Invalid credentials")

        viewModel.login()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoggedIn)
        assertFalse(state.isLoading)
        assertEquals("Invalid credentials", state.errorMessage)
    }

    @Test
    fun `login handles exception`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("testuser")
        viewModel.onPasswordChange("testpass")

        coEvery {
            authRepository.login("https://example.com", "testuser", "testpass")
        } throws RuntimeException("Connection failed")

        viewModel.login()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isLoggedIn)
        assertFalse(state.isLoading)
        assertEquals("Connection failed", state.errorMessage)
    }

    @Test
    fun `login trims trailing slash from server URL`() = runTest {
        viewModel = createViewModel()
        viewModel.onServerUrlChange("https://example.com/")
        viewModel.onUsernameChange("user")
        viewModel.onPasswordChange("pass")

        coEvery {
            authRepository.login("https://example.com", "user", "pass")
        } returns ApiResult.Success(
            LoginResponse(
                token = "token",
                user = UserInfo(id = "u1", username = "user", isAdmin = false)
            )
        )

        viewModel.login()
        advanceUntilIdle()

        verify { credentialManager.saveServerUrl("https://example.com") }
    }
}
