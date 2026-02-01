package com.deadmansdrop.app.ui.screens.settings

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.GetUserSettingsResponse
import com.deadmansdrop.app.data.api.models.UpdateUserSettingsResponse
import com.deadmansdrop.app.data.api.models.UserSettings
import com.deadmansdrop.app.data.repository.UserRepository
import com.deadmansdrop.app.data.security.CredentialManager
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
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

@OptIn(ExperimentalCoroutinesApi::class)
class SettingsViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var userRepository: UserRepository
    private lateinit var credentialManager: CredentialManager
    private lateinit var viewModel: SettingsViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        userRepository = mockk()
        credentialManager = mockk(relaxed = true)
        every { credentialManager.getServerUrl() } returns "https://example.com"
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
    fun `init loads local data from credential manager`() = runTest {
        viewModel = createViewModel()

        val state = viewModel.uiState.value
        assertEquals("https://example.com", state.serverUrl)
        assertEquals("testuser", state.username)
    }

    @Test
    fun `init handles null server URL`() = runTest {
        every { credentialManager.getServerUrl() } returns null
        every { credentialManager.getUsername() } returns null

        viewModel = createViewModel()

        val state = viewModel.uiState.value
        assertEquals("", state.serverUrl)
        assertEquals("", state.username)
    }

    @Test
    fun `loadSettings sets settings on success`() = runTest {
        viewModel = createViewModel()

        coEvery { userRepository.getUserSettings() } returns ApiResult.Success(
            GetUserSettingsResponse(
                defaultTimerDays = 14,
                storageQuotaBytes = 2_000_000_000L,
                storageUsedBytes = 500_000_000L,
                fcmToken = "fcm-token"
            )
        )

        viewModel.loadSettings()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(14, state.defaultTimerDays)
        assertEquals(2_000_000_000L, state.storageQuotaBytes)
        assertEquals(500_000_000L, state.storageUsedBytes)
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `loadSettings sets error on failure`() = runTest {
        viewModel = createViewModel()

        coEvery { userRepository.getUserSettings() } returns ApiResult.Error("Failed to load")

        viewModel.loadSettings()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Failed to load", state.error)
        assertFalse(state.isLoading)
    }

    @Test
    fun `updateTimerDays updates on success`() = runTest {
        viewModel = createViewModel()

        coEvery { userRepository.updateUserSettings(defaultTimerDays = 30) } returns ApiResult.Success(
            UpdateUserSettingsResponse(
                settings = UserSettings(
                    defaultTimerDays = 30,
                    storageQuotaBytes = 1_000_000_000L,
                    storageUsedBytes = 0L,
                    fcmToken = null
                )
            )
        )

        viewModel.updateTimerDays(30)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(30, state.defaultTimerDays)
        assertTrue(state.timerSaveSuccess)
        assertFalse(state.isSavingTimer)
        assertNull(state.timerSaveError)
    }

    @Test
    fun `updateTimerDays sets error on failure`() = runTest {
        viewModel = createViewModel()

        coEvery { userRepository.updateUserSettings(defaultTimerDays = 30) } returns ApiResult.Error("Save failed")

        viewModel.updateTimerDays(30)
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Save failed", state.timerSaveError)
        assertFalse(state.isSavingTimer)
        assertFalse(state.timerSaveSuccess)
    }

    @Test
    fun `requestLogout shows confirmation`() = runTest {
        viewModel = createViewModel()

        viewModel.requestLogout()

        assertTrue(viewModel.uiState.value.showLogoutConfirmation)
    }

    @Test
    fun `cancelLogout hides confirmation`() = runTest {
        viewModel = createViewModel()

        viewModel.requestLogout()
        viewModel.cancelLogout()

        assertFalse(viewModel.uiState.value.showLogoutConfirmation)
    }

    @Test
    fun `clearTimerSaveSuccess clears flag`() = runTest {
        viewModel = createViewModel()

        viewModel.clearTimerSaveSuccess()

        assertFalse(viewModel.uiState.value.timerSaveSuccess)
    }

    @Test
    fun `clearTimerSaveError clears error`() = runTest {
        viewModel = createViewModel()

        viewModel.clearTimerSaveError()

        assertNull(viewModel.uiState.value.timerSaveError)
    }
}
