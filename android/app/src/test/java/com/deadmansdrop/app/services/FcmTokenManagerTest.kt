package com.deadmansdrop.app.services

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.repository.UserRepository
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.android.gms.tasks.Task
import com.google.firebase.messaging.FirebaseMessaging
import io.mockk.coEvery
import io.mockk.coVerify
import io.mockk.every
import io.mockk.mockk
import io.mockk.mockkStatic
import io.mockk.unmockkStatic
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for FcmTokenManager.
 * Verifies push notification token registration, local storage,
 * and server synchronization behavior including error handling.
 *
 * Tests cover:
 * - FCM token registration and local saving
 * - Token sync with backend server
 * - Handling of new vs unchanged tokens
 * - Error handling for Firebase and network failures
 * - Authentication-gated sync behavior
 */
class FcmTokenManagerTest {

    private lateinit var credentialManager: CredentialManager
    private lateinit var userRepository: UserRepository
    private lateinit var fcmTokenManager: FcmTokenManager
    private lateinit var mockFirebaseMessaging: FirebaseMessaging

    @Before
    fun setup() {
        credentialManager = mockk(relaxed = true)
        userRepository = mockk(relaxed = true)
        mockFirebaseMessaging = mockk()

        mockkStatic(FirebaseMessaging::class)
        every { FirebaseMessaging.getInstance() } returns mockFirebaseMessaging

        fcmTokenManager = FcmTokenManager(credentialManager, userRepository)
    }

    @After
    fun tearDown() {
        unmockkStatic(FirebaseMessaging::class)
    }

    /**
     * Helper to create a mock Task that resolves to a value.
     * Used because Tasks.forResult() requires the Android runtime.
     */
    private fun <T> mockSuccessTask(result: T): Task<T> {
        val task = mockk<Task<T>>()
        every { task.isComplete } returns true
        every { task.isCanceled } returns false
        every { task.exception } returns null
        every { task.result } returns result
        return task
    }

    /**
     * Helper to create a mock Task that fails with an exception.
     */
    private fun <T> mockFailureTask(exception: Exception): Task<T> {
        val task = mockk<Task<T>>()
        every { task.isComplete } returns true
        every { task.isCanceled } returns false
        every { task.exception } returns exception
        every { task.result } throws exception
        return task
    }

    // --- registerForFcm tests ---

    @Test
    fun `registerForFcm returns token on success`() = runTest {
        val token = "fcm-token-abc123"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns null
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns false

        val result = fcmTokenManager.registerForFcm()

        assertEquals(token, result)
    }

    @Test
    fun `registerForFcm saves new token locally`() = runTest {
        val token = "fcm-token-new"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns "fcm-token-old"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns false

        fcmTokenManager.registerForFcm()

        verify { credentialManager.saveFcmToken(token) }
    }

    @Test
    fun `registerForFcm does not re-save unchanged token that is already synced`() = runTest {
        val token = "fcm-token-same"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isFcmTokenSynced() } returns true
        every { credentialManager.isAuthenticated() } returns true

        fcmTokenManager.registerForFcm()

        verify(exactly = 0) { credentialManager.saveFcmToken(any()) }
    }

    @Test
    fun `registerForFcm saves token when existing token is null`() = runTest {
        val token = "fcm-token-first"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns null
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns false

        fcmTokenManager.registerForFcm()

        verify { credentialManager.saveFcmToken(token) }
    }

    @Test
    fun `registerForFcm returns null on Firebase exception`() = runTest {
        every { mockFirebaseMessaging.token } returns mockFailureTask(RuntimeException("Firebase unavailable"))

        val result = fcmTokenManager.registerForFcm()

        assertNull(result)
    }

    @Test
    fun `registerForFcm attempts sync after getting token`() = runTest {
        val token = "fcm-token-sync"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns null andThen token
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Success(mockk(relaxed = true))

        fcmTokenManager.registerForFcm()

        coVerify { userRepository.updateUserSettings(fcmToken = token) }
    }

    @Test
    fun `registerForFcm does not crash when sync fails`() = runTest {
        val token = "fcm-token-sync-fail"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns null andThen token
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Error("Server error", 500)

        val result = fcmTokenManager.registerForFcm()

        assertEquals(token, result)
    }

    // --- syncFcmTokenIfNeeded tests ---

    @Test
    fun `syncFcmTokenIfNeeded skips when already synced`() = runTest {
        every { credentialManager.isFcmTokenSynced() } returns true

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 0) { userRepository.updateUserSettings(fcmToken = any()) }
    }

    @Test
    fun `syncFcmTokenIfNeeded skips when no token available`() = runTest {
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns null

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 0) { userRepository.updateUserSettings(fcmToken = any()) }
    }

    @Test
    fun `syncFcmTokenIfNeeded skips when token is blank`() = runTest {
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns "   "

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 0) { userRepository.updateUserSettings(fcmToken = any()) }
    }

    @Test
    fun `syncFcmTokenIfNeeded defers when not authenticated`() = runTest {
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns "valid-token"
        every { credentialManager.isAuthenticated() } returns false

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 0) { userRepository.updateUserSettings(fcmToken = any()) }
    }

    @Test
    fun `syncFcmTokenIfNeeded sends token to server when authenticated`() = runTest {
        val token = "fcm-token-to-sync"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Success(mockk(relaxed = true))

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 1) { userRepository.updateUserSettings(fcmToken = token) }
    }

    @Test
    fun `syncFcmTokenIfNeeded marks token synced on success`() = runTest {
        val token = "fcm-token-mark-synced"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Success(mockk(relaxed = true))

        fcmTokenManager.syncFcmTokenIfNeeded()

        verify { credentialManager.markFcmTokenSynced() }
    }

    @Test
    fun `syncFcmTokenIfNeeded does not mark synced on API error`() = runTest {
        val token = "fcm-token-api-error"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Error("Network error", 500)

        fcmTokenManager.syncFcmTokenIfNeeded()

        verify(exactly = 0) { credentialManager.markFcmTokenSynced() }
    }

    @Test
    fun `syncFcmTokenIfNeeded does not mark synced on exception`() = runTest {
        val token = "fcm-token-exception"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } throws RuntimeException("Unexpected error")

        fcmTokenManager.syncFcmTokenIfNeeded()

        verify(exactly = 0) { credentialManager.markFcmTokenSynced() }
    }

    @Test
    fun `syncFcmTokenIfNeeded does not crash on exception`() = runTest {
        val token = "fcm-token-no-crash"
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } throws RuntimeException("Server down")

        // Should not throw
        fcmTokenManager.syncFcmTokenIfNeeded()
    }

    // --- Token change detection tests ---

    @Test
    fun `registerForFcm detects token change and saves new token`() = runTest {
        val oldToken = "old-fcm-token"
        val newToken = "new-fcm-token"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(newToken)
        every { credentialManager.getFcmToken() } returns oldToken
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns false

        fcmTokenManager.registerForFcm()

        verify { credentialManager.saveFcmToken(newToken) }
    }

    @Test
    fun `registerForFcm with unchanged unsynced token still tries sync`() = runTest {
        val token = "unchanged-token"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns token
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.isAuthenticated() } returns true
        coEvery { userRepository.updateUserSettings(fcmToken = token) } returns
            ApiResult.Success(mockk(relaxed = true))

        fcmTokenManager.registerForFcm()

        // Should not re-save but should still try sync
        verify(exactly = 0) { credentialManager.saveFcmToken(any()) }
        coVerify(exactly = 1) { userRepository.updateUserSettings(fcmToken = token) }
    }

    // --- Edge case tests ---

    @Test
    fun `syncFcmTokenIfNeeded handles empty string token`() = runTest {
        every { credentialManager.isFcmTokenSynced() } returns false
        every { credentialManager.getFcmToken() } returns ""

        fcmTokenManager.syncFcmTokenIfNeeded()

        coVerify(exactly = 0) { userRepository.updateUserSettings(fcmToken = any()) }
    }

    @Test
    fun `registerForFcm handles concurrent token refresh gracefully`() = runTest {
        val token = "concurrent-token"
        every { mockFirebaseMessaging.token } returns mockSuccessTask(token)
        every { credentialManager.getFcmToken() } returns null andThen token
        every { credentialManager.isFcmTokenSynced() } returns false andThen true
        every { credentialManager.isAuthenticated() } returns true

        // Second call should see token as synced and skip
        fcmTokenManager.registerForFcm()
        fcmTokenManager.syncFcmTokenIfNeeded()

        // syncFcmTokenIfNeeded should skip on second call since isFcmTokenSynced returns true
        coVerify(atMost = 1) { userRepository.updateUserSettings(fcmToken = any()) }
    }
}
