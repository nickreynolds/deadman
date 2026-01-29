package com.deadmansdrop.app.data.auth

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.AuthApiService
import com.deadmansdrop.app.data.api.models.RefreshTokenRequest
import com.deadmansdrop.app.data.api.models.RefreshTokenResponse
import com.deadmansdrop.app.data.security.CredentialManager
import com.google.gson.Gson
import io.mockk.coEvery
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.test.runTest
import okhttp3.logging.HttpLoggingInterceptor
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import retrofit2.Response

class TokenManagerTest {

    private lateinit var credentialManager: CredentialManager
    private lateinit var gson: Gson
    private lateinit var loggingInterceptor: HttpLoggingInterceptor
    private lateinit var tokenManager: TokenManagerImpl

    @Before
    fun setup() {
        credentialManager = mockk(relaxed = true)
        gson = Gson()
        loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.NONE
        }
        tokenManager = TokenManagerImpl(credentialManager, gson, loggingInterceptor)
    }

    @Test
    fun `getToken returns token from credential manager`() {
        val expectedToken = "test-jwt-token"
        every { credentialManager.getJwtToken() } returns expectedToken

        val result = tokenManager.getToken()

        assertEquals(expectedToken, result)
    }

    @Test
    fun `getToken returns null when no token stored`() {
        every { credentialManager.getJwtToken() } returns null

        val result = tokenManager.getToken()

        assertEquals(null, result)
    }

    @Test
    fun `getTokenExpiry returns expiry from credential manager`() {
        val expectedExpiry = System.currentTimeMillis() + 3600000L
        every { credentialManager.getJwtExpiry() } returns expectedExpiry

        val result = tokenManager.getTokenExpiry()

        assertEquals(expectedExpiry, result)
    }

    @Test
    fun `isTokenExpiredOrExpiring returns true when token is expired`() {
        val expiredTime = System.currentTimeMillis() - 60000L // 1 minute ago
        every { credentialManager.getJwtExpiry() } returns expiredTime

        val result = tokenManager.isTokenExpiredOrExpiring()

        assertTrue(result)
    }

    @Test
    fun `isTokenExpiredOrExpiring returns true when token expires within buffer`() {
        // Token expires in 2 minutes, but buffer is 5 minutes
        val expiringTime = System.currentTimeMillis() + (2 * 60 * 1000L)
        every { credentialManager.getJwtExpiry() } returns expiringTime

        val result = tokenManager.isTokenExpiredOrExpiring()

        assertTrue(result)
    }

    @Test
    fun `isTokenExpiredOrExpiring returns false when token is valid`() {
        // Token expires in 1 hour
        val validTime = System.currentTimeMillis() + (60 * 60 * 1000L)
        every { credentialManager.getJwtExpiry() } returns validTime

        val result = tokenManager.isTokenExpiredOrExpiring()

        assertFalse(result)
    }

    @Test
    fun `isTokenExpiredOrExpiring returns true when expiry is 0`() {
        every { credentialManager.getJwtExpiry() } returns 0L

        val result = tokenManager.isTokenExpiredOrExpiring()

        assertTrue(result)
    }

    @Test
    fun `updateToken delegates to credential manager`() {
        val newToken = "new-jwt-token"
        val newExpiry = System.currentTimeMillis() + 3600000L

        tokenManager.updateToken(newToken, newExpiry)

        verify { credentialManager.updateJwtToken(newToken, newExpiry) }
    }

    @Test
    fun `clearAuthState calls logout on credential manager`() {
        tokenManager.clearAuthState()

        verify { credentialManager.logout() }
    }

    @Test
    fun `isAuthenticated delegates to credential manager`() {
        every { credentialManager.isAuthenticated() } returns true

        val result = tokenManager.isAuthenticated()

        assertTrue(result)
        verify { credentialManager.isAuthenticated() }
    }

    @Test
    fun `refreshToken returns error when no token available`() = runTest {
        every { credentialManager.getJwtToken() } returns null

        val result = tokenManager.refreshToken()

        assertTrue(result is ApiResult.Error)
        assertEquals("No token available for refresh", (result as ApiResult.Error).message)
    }

    @Test
    fun `refreshToken returns error when no server URL configured`() = runTest {
        every { credentialManager.getJwtToken() } returns "some-token"
        every { credentialManager.getServerUrl() } returns null

        val result = tokenManager.refreshToken()

        assertTrue(result is ApiResult.Error)
        assertEquals("No server URL configured", (result as ApiResult.Error).message)
    }
}
