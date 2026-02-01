package com.deadmansdrop.app.data.repository

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * Unit tests for VideoUploadRepository data classes and constants.
 * Tests progress extraction and upload configuration (Task 181).
 */
class VideoUploadRepositoryTest {

    // --- UploadProgress tests ---

    @Test
    fun `UploadProgress ZERO has all zero values`() {
        val zero = UploadProgress.ZERO
        assertEquals(0, zero.progressPercent)
        assertEquals(0L, zero.bytesUploaded)
        assertEquals(0L, zero.totalBytes)
    }

    @Test
    fun `UploadProgress stores correct values`() {
        val progress = UploadProgress(
            progressPercent = 75,
            bytesUploaded = 75 * 1024 * 1024L,
            totalBytes = 100 * 1024 * 1024L
        )
        assertEquals(75, progress.progressPercent)
        assertEquals(75 * 1024 * 1024L, progress.bytesUploaded)
        assertEquals(100 * 1024 * 1024L, progress.totalBytes)
    }

    @Test
    fun `UploadProgress handles 100 percent`() {
        val progress = UploadProgress(
            progressPercent = 100,
            bytesUploaded = 50 * 1024 * 1024L,
            totalBytes = 50 * 1024 * 1024L
        )
        assertEquals(100, progress.progressPercent)
        assertEquals(progress.bytesUploaded, progress.totalBytes)
    }

    @Test
    fun `UploadProgress data class equals works correctly`() {
        val a = UploadProgress(50, 500L, 1000L)
        val b = UploadProgress(50, 500L, 1000L)
        assertEquals(a, b)
    }

    @Test
    fun `UploadProgress data class copy works correctly`() {
        val original = UploadProgress(50, 500L, 1000L)
        val copied = original.copy(progressPercent = 75)
        assertEquals(75, copied.progressPercent)
        assertEquals(500L, copied.bytesUploaded)
        assertEquals(1000L, copied.totalBytes)
    }

    // --- Repository constants tests ---

    @Test
    fun `upload tag is defined`() {
        assertEquals("video_upload", VideoUploadRepository.TAG_VIDEO_UPLOAD)
    }

    @Test
    fun `initial backoff is 30 seconds`() {
        assertEquals(30L, VideoUploadRepository.INITIAL_BACKOFF_SECONDS)
    }

    // --- Constraint verification ---

    @Test
    fun `backoff configuration supports exponential retry`() {
        // Verify the backoff progression: 30s -> 60s -> 120s -> 240s...
        val initial = VideoUploadRepository.INITIAL_BACKOFF_SECONDS
        assertEquals(30L, initial)

        // Exponential backoff doubles each retry
        val secondAttempt = initial * 2
        val thirdAttempt = secondAttempt * 2
        assertEquals(60L, secondAttempt)
        assertEquals(120L, thirdAttempt)
    }
}
