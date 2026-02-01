package com.deadmansdrop.app.ui.screens.upload

import androidx.work.Data
import androidx.work.WorkInfo
import com.deadmansdrop.app.data.repository.UploadProgress
import com.deadmansdrop.app.data.repository.VideoUploadRepository
import com.deadmansdrop.app.services.VideoUploadWorker
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.flowOf
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
import java.util.UUID

/**
 * Unit tests for UploadViewModel.
 * Tests upload state transitions, queuing behavior, and progress tracking
 * relevant to background upload reliability (Task 181).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class UploadViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var videoUploadRepository: VideoUploadRepository
    private lateinit var viewModel: UploadViewModel

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        videoUploadRepository = mockk(relaxed = true)

        // Default: no existing uploads
        every { videoUploadRepository.getAllUploads() } returns flowOf(emptyList())
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): UploadViewModel {
        return UploadViewModel(videoUploadRepository)
    }

    @Test
    fun `initial state has no uploads`() = runTest {
        viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.uploads.isEmpty())
        assertFalse(state.hasActiveUploads)
    }

    @Test
    fun `scheduleUpload adds upload in PENDING state`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload("/path/to/video.mp4", "Test Video") } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/to/video.mp4", "Test Video")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.uploads.size)
        assertEquals(workId, state.uploads[0].workId)
        assertEquals("video.mp4", state.uploads[0].fileName)
        assertEquals(UploadStatus.PENDING, state.uploads[0].status)
        assertTrue(state.hasActiveUploads)
    }

    @Test
    fun `scheduleUpload extracts filename from path`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/data/user/0/com.deadmansdrop.app/files/videos/deadman_20260201.mp4", null)
        advanceUntilIdle()

        assertEquals("deadman_20260201.mp4", viewModel.uiState.value.uploads[0].fileName)
    }

    @Test
    fun `scheduleUpload calls repository scheduleUpload`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload("/path/video.mp4", "My Video") } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "My Video")
        advanceUntilIdle()

        verify { videoUploadRepository.scheduleUpload("/path/video.mp4", "My Video") }
    }

    @Test
    fun `upload transitions to UPLOADING when WorkInfo state is RUNNING`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val runningWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { runningWorkInfo.id } returns workId
        every { runningWorkInfo.state } returns WorkInfo.State.RUNNING
        every { runningWorkInfo.progress } returns Data.Builder()
            .putInt(VideoUploadWorker.KEY_PROGRESS_PERCENT, 25)
            .putLong(VideoUploadWorker.KEY_BYTES_UPLOADED, 25 * 1024 * 1024L)
            .putLong(VideoUploadWorker.KEY_TOTAL_BYTES, 100 * 1024 * 1024L)
            .build()
        every { runningWorkInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(runningWorkInfo) } returns UploadProgress(25, 25 * 1024 * 1024L, 100 * 1024 * 1024L)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        // Emit running state
        workInfoFlow.value = runningWorkInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertEquals(UploadStatus.UPLOADING, upload.status)
        assertEquals(25, upload.progress.progressPercent)
        assertTrue(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `upload transitions to SUCCESS when WorkInfo state is SUCCEEDED`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val succeededWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { succeededWorkInfo.id } returns workId
        every { succeededWorkInfo.state } returns WorkInfo.State.SUCCEEDED
        every { succeededWorkInfo.progress } returns Data.EMPTY
        every { succeededWorkInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_ID, "video-123")
            .putBoolean(VideoUploadWorker.KEY_UPLOAD_SUCCESS, true)
            .build()
        every { videoUploadRepository.extractProgress(succeededWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = succeededWorkInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertEquals(UploadStatus.SUCCESS, upload.status)
        assertEquals("video-123", upload.videoId)
        assertFalse(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `upload transitions to FAILED with error message`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val failedWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { failedWorkInfo.id } returns workId
        every { failedWorkInfo.state } returns WorkInfo.State.FAILED
        every { failedWorkInfo.progress } returns Data.EMPTY
        every { failedWorkInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_ERROR_MESSAGE, "Network connection failed. Please check your internet connection.")
            .putBoolean(VideoUploadWorker.KEY_UPLOAD_SUCCESS, false)
            .build()
        every { videoUploadRepository.extractProgress(failedWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = failedWorkInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertEquals(UploadStatus.FAILED, upload.status)
        assertEquals("Network connection failed. Please check your internet connection.", upload.errorMessage)
        assertFalse(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `upload transitions to CANCELLED when work is cancelled`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val cancelledWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { cancelledWorkInfo.id } returns workId
        every { cancelledWorkInfo.state } returns WorkInfo.State.CANCELLED
        every { cancelledWorkInfo.progress } returns Data.EMPTY
        every { cancelledWorkInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(cancelledWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = cancelledWorkInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertEquals(UploadStatus.CANCELLED, upload.status)
        assertFalse(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `ENQUEUED state maps to PENDING (offline queuing)`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val enqueuedWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { enqueuedWorkInfo.id } returns workId
        every { enqueuedWorkInfo.state } returns WorkInfo.State.ENQUEUED
        every { enqueuedWorkInfo.progress } returns Data.EMPTY
        every { enqueuedWorkInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(enqueuedWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = enqueuedWorkInfo
        advanceUntilIdle()

        assertEquals(UploadStatus.PENDING, viewModel.uiState.value.uploads[0].status)
        assertTrue(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `BLOCKED state maps to PENDING`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val blockedWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { blockedWorkInfo.id } returns workId
        every { blockedWorkInfo.state } returns WorkInfo.State.BLOCKED
        every { blockedWorkInfo.progress } returns Data.EMPTY
        every { blockedWorkInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(blockedWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = blockedWorkInfo
        advanceUntilIdle()

        assertEquals(UploadStatus.PENDING, viewModel.uiState.value.uploads[0].status)
    }

    @Test
    fun `cancelUpload delegates to repository`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.cancelUpload(workId)

        verify { videoUploadRepository.cancelUpload(workId) }
    }

    @Test
    fun `dismissUpload removes upload from list`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        assertEquals(1, viewModel.uiState.value.uploads.size)

        viewModel.dismissUpload(workId)

        assertTrue(viewModel.uiState.value.uploads.isEmpty())
    }

    @Test
    fun `clearCompletedUploads removes SUCCESS FAILED and CANCELLED uploads`() = runTest {
        val activeId = UUID.randomUUID()
        val successId = UUID.randomUUID()
        val failedId = UUID.randomUUID()

        every { videoUploadRepository.scheduleUpload("/path/active.mp4", any()) } returns activeId
        every { videoUploadRepository.scheduleUpload("/path/success.mp4", any()) } returns successId
        every { videoUploadRepository.scheduleUpload("/path/failed.mp4", any()) } returns failedId

        val activeInfoFlow = MutableStateFlow<WorkInfo?>(null)
        val successInfoFlow = MutableStateFlow<WorkInfo?>(null)
        val failedInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.getUploadStatus(activeId) } returns activeInfoFlow
        every { videoUploadRepository.getUploadStatus(successId) } returns successInfoFlow
        every { videoUploadRepository.getUploadStatus(failedId) } returns failedInfoFlow

        // Create RUNNING work info for active upload
        val runningWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { runningWorkInfo.id } returns activeId
        every { runningWorkInfo.state } returns WorkInfo.State.RUNNING
        every { runningWorkInfo.progress } returns Data.EMPTY
        every { runningWorkInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(runningWorkInfo) } returns UploadProgress.ZERO

        // Create SUCCEEDED work info
        val successWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { successWorkInfo.id } returns successId
        every { successWorkInfo.state } returns WorkInfo.State.SUCCEEDED
        every { successWorkInfo.progress } returns Data.EMPTY
        every { successWorkInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_ID, "v1")
            .build()
        every { videoUploadRepository.extractProgress(successWorkInfo) } returns UploadProgress.ZERO

        // Create FAILED work info
        val failedWorkInfo = mockk<WorkInfo>(relaxed = true)
        every { failedWorkInfo.id } returns failedId
        every { failedWorkInfo.state } returns WorkInfo.State.FAILED
        every { failedWorkInfo.progress } returns Data.EMPTY
        every { failedWorkInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_ERROR_MESSAGE, "Error")
            .build()
        every { videoUploadRepository.extractProgress(failedWorkInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        // Schedule 3 uploads
        viewModel.scheduleUpload("/path/active.mp4", "Active")
        viewModel.scheduleUpload("/path/success.mp4", "Success")
        viewModel.scheduleUpload("/path/failed.mp4", "Failed")
        advanceUntilIdle()

        // Transition to final states
        activeInfoFlow.value = runningWorkInfo
        successInfoFlow.value = successWorkInfo
        failedInfoFlow.value = failedWorkInfo
        advanceUntilIdle()

        assertEquals(3, viewModel.uiState.value.uploads.size)

        // Clear completed
        viewModel.clearCompletedUploads()

        // Only the running upload should remain
        val remaining = viewModel.uiState.value.uploads
        assertEquals(1, remaining.size)
        assertEquals(activeId, remaining[0].workId)
        assertEquals(UploadStatus.UPLOADING, remaining[0].status)
    }

    @Test
    fun `multiple uploads are sorted with active first`() = runTest {
        val uploadingId = UUID.randomUUID()
        val pendingId = UUID.randomUUID()
        val successId = UUID.randomUUID()

        every { videoUploadRepository.scheduleUpload("/path/uploading.mp4", any()) } returns uploadingId
        every { videoUploadRepository.scheduleUpload("/path/pending.mp4", any()) } returns pendingId
        every { videoUploadRepository.scheduleUpload("/path/success.mp4", any()) } returns successId

        val uploadingFlow = MutableStateFlow<WorkInfo?>(null)
        val pendingFlow = MutableStateFlow<WorkInfo?>(null)
        val successFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.getUploadStatus(uploadingId) } returns uploadingFlow
        every { videoUploadRepository.getUploadStatus(pendingId) } returns pendingFlow
        every { videoUploadRepository.getUploadStatus(successId) } returns successFlow

        // RUNNING state
        val runningInfo = mockk<WorkInfo>(relaxed = true)
        every { runningInfo.id } returns uploadingId
        every { runningInfo.state } returns WorkInfo.State.RUNNING
        every { runningInfo.progress } returns Data.EMPTY
        every { runningInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(runningInfo) } returns UploadProgress.ZERO

        // ENQUEUED state (pending/offline)
        val enqueuedInfo = mockk<WorkInfo>(relaxed = true)
        every { enqueuedInfo.id } returns pendingId
        every { enqueuedInfo.state } returns WorkInfo.State.ENQUEUED
        every { enqueuedInfo.progress } returns Data.EMPTY
        every { enqueuedInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(enqueuedInfo) } returns UploadProgress.ZERO

        // SUCCEEDED state
        val succeededInfo = mockk<WorkInfo>(relaxed = true)
        every { succeededInfo.id } returns successId
        every { succeededInfo.state } returns WorkInfo.State.SUCCEEDED
        every { succeededInfo.progress } returns Data.EMPTY
        every { succeededInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_ID, "v1")
            .build()
        every { videoUploadRepository.extractProgress(succeededInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        // Schedule in reverse priority order
        viewModel.scheduleUpload("/path/success.mp4", "Success")
        viewModel.scheduleUpload("/path/pending.mp4", "Pending")
        viewModel.scheduleUpload("/path/uploading.mp4", "Uploading")
        advanceUntilIdle()

        // Transition to states
        uploadingFlow.value = runningInfo
        pendingFlow.value = enqueuedInfo
        successFlow.value = succeededInfo
        advanceUntilIdle()

        val uploads = viewModel.uiState.value.uploads
        assertEquals(3, uploads.size)
        // UPLOADING (priority 3) should be first
        assertEquals(UploadStatus.UPLOADING, uploads[0].status)
        // PENDING (priority 2) should be second
        assertEquals(UploadStatus.PENDING, uploads[1].status)
        // SUCCESS (priority 1) should be last
        assertEquals(UploadStatus.SUCCESS, uploads[2].status)
    }

    @Test
    fun `hasActiveUploads is true when uploads are PENDING`() = runTest {
        val workId = UUID.randomUUID()
        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns flowOf(null)

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        // Initial state after scheduling is PENDING
        assertTrue(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `hasActiveUploads is false when all uploads completed`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val succeededInfo = mockk<WorkInfo>(relaxed = true)
        every { succeededInfo.id } returns workId
        every { succeededInfo.state } returns WorkInfo.State.SUCCEEDED
        every { succeededInfo.progress } returns Data.EMPTY
        every { succeededInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_ID, "v1")
            .build()
        every { videoUploadRepository.extractProgress(succeededInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = succeededInfo
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.hasActiveUploads)
    }

    @Test
    fun `upload progress is tracked during upload`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        // Simulate progress at 50%
        val progressInfo = mockk<WorkInfo>(relaxed = true)
        every { progressInfo.id } returns workId
        every { progressInfo.state } returns WorkInfo.State.RUNNING
        every { progressInfo.progress } returns Data.Builder()
            .putInt(VideoUploadWorker.KEY_PROGRESS_PERCENT, 50)
            .putLong(VideoUploadWorker.KEY_BYTES_UPLOADED, 50 * 1024 * 1024L)
            .putLong(VideoUploadWorker.KEY_TOTAL_BYTES, 100 * 1024 * 1024L)
            .build()
        every { progressInfo.outputData } returns Data.EMPTY
        every { videoUploadRepository.extractProgress(progressInfo) } returns UploadProgress(
            progressPercent = 50,
            bytesUploaded = 50 * 1024 * 1024L,
            totalBytes = 100 * 1024 * 1024L
        )

        workInfoFlow.value = progressInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertEquals(50, upload.progress.progressPercent)
        assertEquals(50 * 1024 * 1024L, upload.progress.bytesUploaded)
        assertEquals(100 * 1024 * 1024L, upload.progress.totalBytes)
    }

    @Test
    fun `failed upload does not have videoId`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val failedInfo = mockk<WorkInfo>(relaxed = true)
        every { failedInfo.id } returns workId
        every { failedInfo.state } returns WorkInfo.State.FAILED
        every { failedInfo.progress } returns Data.EMPTY
        every { failedInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_ERROR_MESSAGE, "Upload failed")
            .build()
        every { videoUploadRepository.extractProgress(failedInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = failedInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertNull(upload.videoId)
        assertEquals("Upload failed", upload.errorMessage)
    }

    @Test
    fun `successful upload does not have errorMessage`() = runTest {
        val workId = UUID.randomUUID()
        val workInfoFlow = MutableStateFlow<WorkInfo?>(null)

        every { videoUploadRepository.scheduleUpload(any(), any()) } returns workId
        every { videoUploadRepository.getUploadStatus(workId) } returns workInfoFlow

        val successInfo = mockk<WorkInfo>(relaxed = true)
        every { successInfo.id } returns workId
        every { successInfo.state } returns WorkInfo.State.SUCCEEDED
        every { successInfo.progress } returns Data.EMPTY
        every { successInfo.outputData } returns Data.Builder()
            .putString(VideoUploadWorker.KEY_VIDEO_ID, "video-456")
            .build()
        every { videoUploadRepository.extractProgress(successInfo) } returns UploadProgress.ZERO

        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.scheduleUpload("/path/video.mp4", "Video")
        advanceUntilIdle()

        workInfoFlow.value = successInfo
        advanceUntilIdle()

        val upload = viewModel.uiState.value.uploads[0]
        assertNull(upload.errorMessage)
        assertEquals("video-456", upload.videoId)
    }
}
