package com.deadmansdrop.app.services

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Unit tests for VideoUploadWorker retry logic and error message generation.
 * Tests the upload behavior in offline and error scenarios:
 * - Network errors trigger retries (offline queuing behavior)
 * - Retries stop after max attempts
 * - Non-retryable errors fail immediately
 * - User-friendly error messages are generated for each error type
 */
class VideoUploadWorkerTest {

    // --- shouldRetryForAttempt tests ---

    @Test
    fun `shouldRetry returns true for network error on first attempt`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = null, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for network error on second attempt`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = null, attemptCount = 1))
    }

    @Test
    fun `shouldRetry returns true for network error up to max minus one`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = null, attemptCount = 2))
    }

    @Test
    fun `shouldRetry returns false for network error at max attempts`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = null, attemptCount = 3))
    }

    @Test
    fun `shouldRetry returns false for network error beyond max attempts`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = null, attemptCount = 5))
    }

    @Test
    fun `shouldRetry returns true for 408 timeout`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 408, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for 429 rate limit`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 429, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for 500 server error`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 500, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for 502 bad gateway`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 502, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for 503 service unavailable`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 503, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns true for 599 server error boundary`() {
        assertTrue(VideoUploadWorker.shouldRetryForAttempt(errorCode = 599, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 401 unauthorized`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 401, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 413 payload too large`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 413, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 400 bad request`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 400, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 403 forbidden`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 403, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 404 not found`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 404, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for 422 unprocessable`() {
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 422, attemptCount = 0))
    }

    @Test
    fun `shouldRetry returns false for retryable error at max attempts`() {
        // Even retryable errors should stop at max attempts
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 500, attemptCount = 3))
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 408, attemptCount = 3))
        assertFalse(VideoUploadWorker.shouldRetryForAttempt(errorCode = 429, attemptCount = 3))
    }

    // --- getErrorMessage tests ---

    @Test
    fun `getErrorMessage returns network message for null code`() {
        assertEquals(
            "Network connection failed. Please check your internet connection.",
            VideoUploadWorker.getErrorMessage(null, "original")
        )
    }

    @Test
    fun `getErrorMessage returns auth message for 401`() {
        assertEquals(
            "Authentication failed. Please log in again.",
            VideoUploadWorker.getErrorMessage(401, "Unauthorized")
        )
    }

    @Test
    fun `getErrorMessage returns permission message for 403`() {
        assertEquals(
            "Permission denied. You don't have access to upload videos.",
            VideoUploadWorker.getErrorMessage(403, "Forbidden")
        )
    }

    @Test
    fun `getErrorMessage returns timeout message for 408`() {
        assertEquals(
            "Request timed out. Please try again.",
            VideoUploadWorker.getErrorMessage(408, "Timeout")
        )
    }

    @Test
    fun `getErrorMessage returns file too large message for 413`() {
        assertEquals(
            "Video file is too large. Please record a shorter video.",
            VideoUploadWorker.getErrorMessage(413, "Payload Too Large")
        )
    }

    @Test
    fun `getErrorMessage returns rate limit message for 429`() {
        assertEquals(
            "Too many requests. Please wait and try again.",
            VideoUploadWorker.getErrorMessage(429, "Too Many Requests")
        )
    }

    @Test
    fun `getErrorMessage returns server error message for 500`() {
        assertEquals(
            "Server error. Please try again later.",
            VideoUploadWorker.getErrorMessage(500, "Internal Server Error")
        )
    }

    @Test
    fun `getErrorMessage returns server error message for 503`() {
        assertEquals(
            "Server error. Please try again later.",
            VideoUploadWorker.getErrorMessage(503, "Service Unavailable")
        )
    }

    @Test
    fun `getErrorMessage returns original message for unknown error code`() {
        val originalMessage = "Something unexpected happened"
        assertEquals(
            originalMessage,
            VideoUploadWorker.getErrorMessage(418, originalMessage)
        )
    }

    @Test
    fun `getErrorMessage returns original message for 400 bad request`() {
        val originalMessage = "Bad request: missing field"
        assertEquals(
            originalMessage,
            VideoUploadWorker.getErrorMessage(400, originalMessage)
        )
    }

    // --- Data key constants tests ---

    @Test
    fun `max retry attempts is 3`() {
        assertEquals(3, VideoUploadWorker.MAX_RETRY_ATTEMPTS)
    }

    @Test
    fun `input data keys are defined`() {
        assertEquals("video_path", VideoUploadWorker.KEY_VIDEO_PATH)
        assertEquals("video_title", VideoUploadWorker.KEY_VIDEO_TITLE)
    }

    @Test
    fun `output data keys are defined`() {
        assertEquals("video_id", VideoUploadWorker.KEY_VIDEO_ID)
        assertEquals("upload_success", VideoUploadWorker.KEY_UPLOAD_SUCCESS)
        assertEquals("error_message", VideoUploadWorker.KEY_ERROR_MESSAGE)
        assertEquals("error_code", VideoUploadWorker.KEY_ERROR_CODE)
    }

    @Test
    fun `progress data keys are defined`() {
        assertEquals("progress_percent", VideoUploadWorker.KEY_PROGRESS_PERCENT)
        assertEquals("bytes_uploaded", VideoUploadWorker.KEY_BYTES_UPLOADED)
        assertEquals("total_bytes", VideoUploadWorker.KEY_TOTAL_BYTES)
    }
}
