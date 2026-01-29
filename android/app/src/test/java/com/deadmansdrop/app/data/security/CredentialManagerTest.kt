package com.deadmansdrop.app.data.security

import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.Assert.*
import org.junit.Before
import org.junit.Test

/**
 * Unit tests for CredentialManager.
 * Tests the credential management logic using mocked SecureStorage.
 */
class CredentialManagerTest {

    private lateinit var secureStorage: SecureStorage
    private lateinit var credentialManager: CredentialManager

    @Before
    fun setUp() {
        secureStorage = mockk(relaxed = true)
        credentialManager = CredentialManager(secureStorage)
    }

    // === saveAuthCredentials tests ===

    @Test
    fun `saveAuthCredentials stores all credential fields`() {
        credentialManager.saveAuthCredentials(
            jwtToken = "test-token",
            jwtExpiry = 1234567890L,
            userId = "user-123",
            username = "testuser",
            isAdmin = true
        )

        verify { secureStorage.putString(SecureStorage.KEY_JWT_TOKEN, "test-token") }
        verify { secureStorage.putLong(SecureStorage.KEY_JWT_EXPIRY, 1234567890L) }
        verify { secureStorage.putString(SecureStorage.KEY_USER_ID, "user-123") }
        verify { secureStorage.putString(SecureStorage.KEY_USERNAME, "testuser") }
        verify { secureStorage.putBoolean(SecureStorage.KEY_IS_ADMIN, true) }
    }

    @Test
    fun `saveAuthCredentials stores non-admin user correctly`() {
        credentialManager.saveAuthCredentials(
            jwtToken = "token",
            jwtExpiry = 12345L,
            userId = "user-456",
            username = "regular",
            isAdmin = false
        )

        verify { secureStorage.putBoolean(SecureStorage.KEY_IS_ADMIN, false) }
    }

    // === Server URL tests ===

    @Test
    fun `saveServerUrl stores URL in secure storage`() {
        credentialManager.saveServerUrl("https://example.com")

        verify { secureStorage.putString(SecureStorage.KEY_SERVER_URL, "https://example.com") }
    }

    @Test
    fun `getServerUrl retrieves from secure storage`() {
        every { secureStorage.getString(SecureStorage.KEY_SERVER_URL) } returns "https://myserver.com"

        val result = credentialManager.getServerUrl()

        assertEquals("https://myserver.com", result)
    }

    @Test
    fun `getServerUrl returns null when not set`() {
        every { secureStorage.getString(SecureStorage.KEY_SERVER_URL) } returns null

        val result = credentialManager.getServerUrl()

        assertNull(result)
    }

    // === JWT Token tests ===

    @Test
    fun `getJwtToken retrieves from secure storage`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns "my-jwt-token"

        val result = credentialManager.getJwtToken()

        assertEquals("my-jwt-token", result)
    }

    @Test
    fun `getJwtToken returns null when not set`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns null

        val result = credentialManager.getJwtToken()

        assertNull(result)
    }

    @Test
    fun `getJwtExpiry retrieves from secure storage`() {
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns 9876543210L

        val result = credentialManager.getJwtExpiry()

        assertEquals(9876543210L, result)
    }

    @Test
    fun `getJwtExpiry returns 0 when not set`() {
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns 0L

        val result = credentialManager.getJwtExpiry()

        assertEquals(0L, result)
    }

    // === Token expiry tests ===

    @Test
    fun `isTokenExpired returns true when expiry is 0`() {
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns 0L

        val result = credentialManager.isTokenExpired()

        assertTrue(result)
    }

    @Test
    fun `isTokenExpired returns true when token has expired`() {
        val pastTime = System.currentTimeMillis() - 10000L // 10 seconds ago
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns pastTime

        val result = credentialManager.isTokenExpired()

        assertTrue(result)
    }

    @Test
    fun `isTokenExpired returns true when within 5 minute buffer`() {
        val nearFuture = System.currentTimeMillis() + (3 * 60 * 1000L) // 3 minutes from now
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns nearFuture

        val result = credentialManager.isTokenExpired()

        assertTrue(result)
    }

    @Test
    fun `isTokenExpired returns false when token is valid`() {
        val futureTime = System.currentTimeMillis() + (10 * 60 * 1000L) // 10 minutes from now
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns futureTime

        val result = credentialManager.isTokenExpired()

        assertFalse(result)
    }

    // === Authentication state tests ===

    @Test
    fun `isAuthenticated returns false when no token`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns null

        val result = credentialManager.isAuthenticated()

        assertFalse(result)
    }

    @Test
    fun `isAuthenticated returns false when token is blank`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns "   "
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns System.currentTimeMillis() + 100000L

        val result = credentialManager.isAuthenticated()

        assertFalse(result)
    }

    @Test
    fun `isAuthenticated returns false when token is expired`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns "valid-token"
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns System.currentTimeMillis() - 10000L

        val result = credentialManager.isAuthenticated()

        assertFalse(result)
    }

    @Test
    fun `isAuthenticated returns true with valid token`() {
        every { secureStorage.getString(SecureStorage.KEY_JWT_TOKEN) } returns "valid-token"
        every { secureStorage.getLong(SecureStorage.KEY_JWT_EXPIRY, 0L) } returns System.currentTimeMillis() + (10 * 60 * 1000L)

        val result = credentialManager.isAuthenticated()

        assertTrue(result)
    }

    // === User info tests ===

    @Test
    fun `getUserId retrieves from secure storage`() {
        every { secureStorage.getString(SecureStorage.KEY_USER_ID) } returns "user-789"

        val result = credentialManager.getUserId()

        assertEquals("user-789", result)
    }

    @Test
    fun `getUsername retrieves from secure storage`() {
        every { secureStorage.getString(SecureStorage.KEY_USERNAME) } returns "myuser"

        val result = credentialManager.getUsername()

        assertEquals("myuser", result)
    }

    @Test
    fun `isAdmin returns value from secure storage`() {
        every { secureStorage.getBoolean(SecureStorage.KEY_IS_ADMIN, false) } returns true

        val result = credentialManager.isAdmin()

        assertTrue(result)
    }

    @Test
    fun `isAdmin returns false by default`() {
        every { secureStorage.getBoolean(SecureStorage.KEY_IS_ADMIN, false) } returns false

        val result = credentialManager.isAdmin()

        assertFalse(result)
    }

    // === Token update tests ===

    @Test
    fun `updateJwtToken stores new token and expiry`() {
        credentialManager.updateJwtToken("new-token", 999999L)

        verify { secureStorage.putString(SecureStorage.KEY_JWT_TOKEN, "new-token") }
        verify { secureStorage.putLong(SecureStorage.KEY_JWT_EXPIRY, 999999L) }
    }

    // === FCM token tests ===

    @Test
    fun `saveFcmToken stores token and marks as not synced`() {
        credentialManager.saveFcmToken("fcm-token-123")

        verify { secureStorage.putString(SecureStorage.KEY_FCM_TOKEN, "fcm-token-123") }
        verify { secureStorage.putBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, false) }
    }

    @Test
    fun `getFcmToken retrieves from secure storage`() {
        every { secureStorage.getString(SecureStorage.KEY_FCM_TOKEN) } returns "stored-fcm-token"

        val result = credentialManager.getFcmToken()

        assertEquals("stored-fcm-token", result)
    }

    @Test
    fun `isFcmTokenSynced returns value from secure storage`() {
        every { secureStorage.getBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, false) } returns true

        val result = credentialManager.isFcmTokenSynced()

        assertTrue(result)
    }

    @Test
    fun `markFcmTokenSynced sets synced flag to true`() {
        credentialManager.markFcmTokenSynced()

        verify { secureStorage.putBoolean(SecureStorage.KEY_FCM_TOKEN_SYNCED, true) }
    }

    // === Logout tests ===

    @Test
    fun `logout clears storage and preserves server URL`() {
        every { secureStorage.getString(SecureStorage.KEY_SERVER_URL) } returns "https://saved-server.com"

        credentialManager.logout()

        verify { secureStorage.clear() }
        verify { secureStorage.putString(SecureStorage.KEY_SERVER_URL, "https://saved-server.com") }
    }

    @Test
    fun `logout clears storage without restoring null server URL`() {
        every { secureStorage.getString(SecureStorage.KEY_SERVER_URL) } returns null

        credentialManager.logout()

        verify { secureStorage.clear() }
        verify(exactly = 0) { secureStorage.putString(SecureStorage.KEY_SERVER_URL, any()) }
    }

    @Test
    fun `clearAll clears all storage`() {
        credentialManager.clearAll()

        verify { secureStorage.clear() }
    }
}
