package com.deadmansdrop.app.ui.screens.login

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.LoginResponse
import com.deadmansdrop.app.data.api.models.UserInfo
import com.deadmansdrop.app.data.repository.AuthRepository
import com.deadmansdrop.app.data.security.CredentialManager
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test

/**
 * UI tests for the LoginScreen composable.
 * Tests critical login flow interactions including form display,
 * field validation, and login button behavior.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class LoginScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var credentialManager: CredentialManager
    private lateinit var authRepository: AuthRepository

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        credentialManager = mockk(relaxed = true)
        authRepository = mockk(relaxed = true)

        every { credentialManager.getServerUrl() } returns null
        every { credentialManager.isAuthenticated() } returns false
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): LoginViewModel {
        return LoginViewModel(credentialManager, authRepository)
    }

    @Test
    fun loginScreen_displaysAllFields() {
        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = createViewModel()
            )
        }

        // Verify app title is displayed
        composeTestRule.onNodeWithText("Deadman's Drop").assertIsDisplayed()

        // Verify subtitle is displayed
        composeTestRule.onNodeWithText("Secure video distribution").assertIsDisplayed()

        // Verify form fields are displayed via their labels
        composeTestRule.onNodeWithText("Server URL").assertIsDisplayed()
        composeTestRule.onNodeWithText("Username").assertIsDisplayed()
        composeTestRule.onNodeWithText("Password").assertIsDisplayed()

        // Verify login button is displayed and enabled
        composeTestRule.onNodeWithText("Log In").assertIsDisplayed()
        composeTestRule.onNodeWithText("Log In").assertIsEnabled()
    }

    @Test
    fun loginScreen_prefillsServerUrl_whenSaved() {
        every { credentialManager.getServerUrl() } returns "https://saved.example.com"

        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = createViewModel()
            )
        }

        composeTestRule.onNodeWithText("https://saved.example.com").assertIsDisplayed()
    }

    @Test
    fun loginScreen_showsValidationErrors_whenFieldsEmpty() {
        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = createViewModel()
            )
        }

        // Click login with all fields empty
        composeTestRule.onNodeWithText("Log In").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // All validation errors should appear
        composeTestRule.onNodeWithText("Server URL is required").assertIsDisplayed()
        composeTestRule.onNodeWithText("Username is required").assertIsDisplayed()
        composeTestRule.onNodeWithText("Password is required").assertIsDisplayed()
    }

    @Test
    fun loginScreen_showsUrlError_whenInvalidUrl() {
        val viewModel = createViewModel()

        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = viewModel
            )
        }

        // Set an invalid URL programmatically (no http:// prefix)
        viewModel.onServerUrlChange("not-a-valid-url")
        viewModel.onUsernameChange("user")
        viewModel.onPasswordChange("pass")

        composeTestRule.waitForIdle()

        // Click login
        composeTestRule.onNodeWithText("Log In").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // URL validation error should appear
        composeTestRule.onNodeWithText("Please enter a valid URL (e.g., https://example.com)")
            .assertIsDisplayed()
    }

    @Test
    fun loginScreen_passwordVisibilityToggle_works() {
        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = createViewModel()
            )
        }

        // Initially, show password icon should be visible
        composeTestRule.onNode(hasContentDescription("Show password")).assertIsDisplayed()

        // Toggle visibility
        composeTestRule.onNode(hasContentDescription("Show password")).performClick()
        composeTestRule.waitForIdle()

        // After toggling, hide password icon should be visible
        composeTestRule.onNode(hasContentDescription("Hide password")).assertIsDisplayed()
    }

    @Test
    fun loginScreen_showsLoadingState_duringLogin() {
        coEvery {
            authRepository.login(any(), any(), any())
        } coAnswers {
            kotlinx.coroutines.delay(5000)
            ApiResult.Success(
                LoginResponse(
                    token = "token",
                    user = UserInfo(id = "1", username = "user", isAdmin = false)
                )
            )
        }

        val viewModel = createViewModel()

        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = viewModel
            )
        }

        // Set valid input programmatically
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("user")
        viewModel.onPasswordChange("pass")
        composeTestRule.waitForIdle()

        // Click login
        composeTestRule.onNodeWithText("Log In").performClick()

        // Advance just enough to start loading
        testDispatcher.scheduler.advanceTimeBy(100)
        composeTestRule.waitForIdle()

        // During loading, "Log In" text is replaced by CircularProgressIndicator
        composeTestRule.onNodeWithText("Log In").assertDoesNotExist()
    }

    @Test
    fun loginScreen_callsOnLoginSuccess_afterSuccessfulLogin() {
        var loginSuccessCalled = false

        coEvery {
            authRepository.login("https://example.com", "testuser", "testpass")
        } returns ApiResult.Success(
            LoginResponse(
                token = "jwt-token-123",
                user = UserInfo(id = "user-1", username = "testuser", isAdmin = false)
            )
        )

        val viewModel = createViewModel()

        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = { loginSuccessCalled = true },
                viewModel = viewModel
            )
        }

        // Set input programmatically
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("testuser")
        viewModel.onPasswordChange("testpass")
        composeTestRule.waitForIdle()

        // Login
        composeTestRule.onNodeWithText("Log In").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        assert(loginSuccessCalled) { "Expected onLoginSuccess to be called after successful login" }
    }

    @Test
    fun loginScreen_showsErrorMessage_onLoginFailure() {
        coEvery {
            authRepository.login("https://example.com", "testuser", "wrongpass")
        } returns ApiResult.Error("Invalid credentials")

        val viewModel = createViewModel()

        composeTestRule.setContent {
            LoginScreen(
                onLoginSuccess = {},
                viewModel = viewModel
            )
        }

        // Set input
        viewModel.onServerUrlChange("https://example.com")
        viewModel.onUsernameChange("testuser")
        viewModel.onPasswordChange("wrongpass")
        composeTestRule.waitForIdle()

        // Login
        composeTestRule.onNodeWithText("Log In").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Error shows in snackbar
        composeTestRule.onNodeWithText("Invalid credentials").assertIsDisplayed()
    }
}
