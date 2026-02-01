package com.deadmansdrop.app.ui.screens.settings

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.GetUserSettingsResponse
import com.deadmansdrop.app.data.repository.UserRepository
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
 * UI tests for the SettingsScreen composable.
 * Tests display of user settings, timer configuration,
 * storage usage, and logout flow.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SettingsScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var userRepository: UserRepository
    private lateinit var credentialManager: CredentialManager

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        userRepository = mockk(relaxed = true)
        credentialManager = mockk(relaxed = true)

        every { credentialManager.getServerUrl() } returns "https://my-server.example.com"
        every { credentialManager.getUsername() } returns "testuser"
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): SettingsViewModel {
        return SettingsViewModel(userRepository, credentialManager)
    }

    @Test
    fun settingsScreen_displaysAccountInfo() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024, // 1 GB
                storageUsedBytes = 512L * 1024 * 1024, // 512 MB
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Verify top bar
        composeTestRule.onNodeWithText("Settings").assertIsDisplayed()

        // Verify account section
        composeTestRule.onNodeWithText("Account").assertIsDisplayed()
        composeTestRule.onNodeWithText("https://my-server.example.com").assertIsDisplayed()
        composeTestRule.onNodeWithText("testuser").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_displaysTimerSection() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Verify timer section
        composeTestRule.onNodeWithText("Distribution Timer").assertIsDisplayed()
        composeTestRule.onNodeWithText("7 days").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_displaysStorageUsage() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024, // 1 GB
                storageUsedBytes = 512L * 1024 * 1024, // 512 MB
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Verify storage section
        composeTestRule.onNodeWithText("Storage").assertIsDisplayed()
        composeTestRule.onNodeWithText("512.0 MB").assertIsDisplayed()
        composeTestRule.onNodeWithText("1.00 GB").assertIsDisplayed()
        composeTestRule.onNodeWithText("50% used").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_displaysDistributionSection() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Distribution").assertIsDisplayed()
        composeTestRule.onNodeWithText("Distribution Recipients").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_displaysLogoutButton() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Log Out").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_showsLogoutConfirmation_whenLogoutClicked() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Click logout button
        composeTestRule.onNodeWithText("Log Out").performClick()
        composeTestRule.waitForIdle()

        // Confirmation dialog should appear
        composeTestRule.onNodeWithText("Log Out?").assertIsDisplayed()
        composeTestRule.onNodeWithText("Are you sure you want to log out? You will need to sign in again.")
            .assertIsDisplayed()
    }

    @Test
    fun settingsScreen_dismissesLogoutDialog_onCancel() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Show logout dialog
        composeTestRule.onNodeWithText("Log Out").performClick()
        composeTestRule.waitForIdle()

        // Click cancel
        composeTestRule.onNodeWithText("Cancel").performClick()
        composeTestRule.waitForIdle()

        // Dialog should be dismissed
        composeTestRule.onNodeWithText("Log Out?").assertDoesNotExist()
    }

    @Test
    fun settingsScreen_callsOnLogout_whenConfirmed() {
        var logoutCalled = false

        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = { logoutCalled = true },
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Show and confirm logout
        composeTestRule.onNodeWithText("Log Out").performClick()
        composeTestRule.waitForIdle()

        // Find the confirm button in the dialog (it uses the same "Log Out" text)
        // The dialog has two "Log Out" texts: the title and the confirm button
        // We need to click the button one
        composeTestRule.onAllNodesWithText("Log Out")[1].performClick()
        composeTestRule.waitForIdle()

        assert(logoutCalled) { "Expected onLogout to be called after confirming logout" }
    }

    @Test
    fun settingsScreen_showsError_whenLoadFails() {
        coEvery { userRepository.getUserSettings() } returns ApiResult.Error(
            "Network error"
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Network error").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").assertIsDisplayed()
    }

    @Test
    fun settingsScreen_navigatesToRecipients_whenButtonClicked() {
        var navigatedToRecipients = false

        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 7,
                storageQuotaBytes = 1024L * 1024 * 1024,
                storageUsedBytes = 0L,
                fcmToken = null
            )
        )

        composeTestRule.setContent {
            SettingsScreen(
                onBack = {},
                onLogout = {},
                onNavigateToRecipients = { navigatedToRecipients = true },
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Distribution Recipients").performClick()

        assert(navigatedToRecipients) {
            "Expected onNavigateToRecipients to be called"
        }
    }
}
