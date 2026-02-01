package com.deadmansdrop.app.data.api

import okhttp3.MediaType.Companion.toMediaType
import okio.Buffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.File

/**
 * Unit tests for ProgressRequestBody.
 * Tests that upload progress tracking works correctly,
 * including partial upload progress reporting (Task 181).
 */
class ProgressRequestBodyTest {

    @get:Rule
    val tempFolder = TemporaryFolder()

    private fun createTestFile(sizeBytes: Int): File {
        val file = tempFolder.newFile("test_video.mp4")
        val data = ByteArray(sizeBytes) { (it % 256).toByte() }
        file.writeBytes(data)
        return file
    }

    @Test
    fun `contentType returns the specified media type`() {
        val file = createTestFile(1024)
        val contentType = "video/mp4".toMediaType()
        val body = ProgressRequestBody(file, contentType) { _, _ -> }

        assertEquals(contentType, body.contentType())
    }

    @Test
    fun `contentLength returns file size`() {
        val file = createTestFile(4096)
        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { _, _ -> }

        assertEquals(4096L, body.contentLength())
    }

    @Test
    fun `writeTo calls progress callback with correct total bytes`() {
        val fileSize = 16384 // 16KB - two segments at 8KB each
        val file = createTestFile(fileSize)
        val progressUpdates = mutableListOf<Pair<Long, Long>>()

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { bytesWritten, totalBytes ->
            progressUpdates.add(bytesWritten to totalBytes)
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        // All callbacks should report the correct total bytes
        assertTrue(progressUpdates.isNotEmpty())
        progressUpdates.forEach { (_, totalBytes) ->
            assertEquals(fileSize.toLong(), totalBytes)
        }
    }

    @Test
    fun `writeTo reports monotonically increasing bytes written`() {
        val fileSize = 32768 // 32KB - four segments
        val file = createTestFile(fileSize)
        val progressUpdates = mutableListOf<Long>()

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { bytesWritten, _ ->
            progressUpdates.add(bytesWritten)
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        // Bytes written should be monotonically increasing
        for (i in 1 until progressUpdates.size) {
            assertTrue(
                "Progress should increase: ${progressUpdates[i - 1]} -> ${progressUpdates[i]}",
                progressUpdates[i] >= progressUpdates[i - 1]
            )
        }
    }

    @Test
    fun `writeTo final callback reports all bytes written`() {
        val fileSize = 24576 // 24KB
        val file = createTestFile(fileSize)
        var lastBytesWritten = 0L

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { bytesWritten, _ ->
            lastBytesWritten = bytesWritten
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        assertEquals(fileSize.toLong(), lastBytesWritten)
    }

    @Test
    fun `writeTo writes complete file contents to sink`() {
        val fileSize = 10000
        val file = createTestFile(fileSize)

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { _, _ -> }

        val buffer = Buffer()
        body.writeTo(buffer)

        assertEquals(fileSize.toLong(), buffer.size)
    }

    @Test
    fun `writeTo handles small file less than segment size`() {
        val fileSize = 100 // 100 bytes, less than 8KB segment
        val file = createTestFile(fileSize)
        val progressUpdates = mutableListOf<Pair<Long, Long>>()

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { bytesWritten, totalBytes ->
            progressUpdates.add(bytesWritten to totalBytes)
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        // Should have at least one progress update
        assertTrue(progressUpdates.isNotEmpty())
        // Last update should have all bytes written
        assertEquals(fileSize.toLong(), progressUpdates.last().first)
        assertEquals(fileSize.toLong(), progressUpdates.last().second)
    }

    @Test
    fun `writeTo handles exact segment size file`() {
        val fileSize = 8192 // Exactly one segment (8KB)
        val file = createTestFile(fileSize)
        var callbackCount = 0

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { _, _ ->
            callbackCount++
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        assertEquals(1, callbackCount)
        assertEquals(fileSize.toLong(), buffer.size)
    }

    @Test
    fun `writeTo preserves file content integrity`() {
        val fileSize = 20000
        val file = createTestFile(fileSize)
        val originalContent = file.readBytes()

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { _, _ -> }

        val buffer = Buffer()
        body.writeTo(buffer)

        val writtenContent = buffer.readByteArray()
        assertTrue("Written content should match original", originalContent.contentEquals(writtenContent))
    }

    @Test
    fun `progress percentage calculation is correct for large files`() {
        val fileSize = 100 * 1024 // 100KB
        val file = createTestFile(fileSize)
        val percentages = mutableListOf<Int>()

        val body = ProgressRequestBody(file, "video/mp4".toMediaType()) { bytesWritten, totalBytes ->
            if (totalBytes > 0) {
                percentages.add(((bytesWritten * 100) / totalBytes).toInt())
            }
        }

        val buffer = Buffer()
        body.writeTo(buffer)

        // Final percentage should be 100
        assertEquals(100, percentages.last())
        // All percentages should be in range [0, 100]
        percentages.forEach { pct ->
            assertTrue("Percentage $pct should be >= 0", pct >= 0)
            assertTrue("Percentage $pct should be <= 100", pct <= 100)
        }
    }
}
