package com.deadmansdrop.app.data.api

import okhttp3.MediaType
import okhttp3.RequestBody
import okio.BufferedSink
import java.io.File

/**
 * A RequestBody that reports upload progress via a callback.
 * Used for tracking video upload progress in the UI and notifications.
 *
 * @param file The file to upload
 * @param contentType The media type of the file
 * @param progressCallback Callback invoked with (bytesWritten, totalBytes) during upload
 */
class ProgressRequestBody(
    private val file: File,
    private val contentType: MediaType?,
    private val progressCallback: (bytesWritten: Long, totalBytes: Long) -> Unit
) : RequestBody() {

    companion object {
        private const val SEGMENT_SIZE = 8192L // 8KB segments for progress updates
    }

    override fun contentType(): MediaType? = contentType

    override fun contentLength(): Long = file.length()

    override fun writeTo(sink: BufferedSink) {
        val totalBytes = file.length()
        var bytesWritten = 0L

        file.inputStream().use { inputStream ->
            val buffer = ByteArray(SEGMENT_SIZE.toInt())
            var read: Int

            while (inputStream.read(buffer).also { read = it } != -1) {
                sink.write(buffer, 0, read)
                bytesWritten += read
                progressCallback(bytesWritten, totalBytes)
            }
        }
    }
}
