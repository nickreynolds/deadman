package com.deadmansdrop.app.ui.screens.videos

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.CheckInResponse
import com.deadmansdrop.app.data.api.models.VideoCheckInResponse
import com.deadmansdrop.app.data.api.models.VideoDeleteResponse
import com.deadmansdrop.app.data.api.models.VideoDetailResponse
import com.deadmansdrop.app.data.api.models.VideoResponse
import com.deadmansdrop.app.data.repository.VideoRepository
import io.mockk.coEvery
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
class VideoDetailViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var videoRepository: VideoRepository
    private lateinit var viewModel: VideoDetailViewModel

    private fun createVideoResponse(
        id: String = "video-1",
        status: String = "ACTIVE"
    ) = VideoResponse(
        id = id,
        userId = "user-1",
        title = "Test Video",
        filePath = "/uploads/test.mp4",
        fileSizeBytes = 1024L,
        mimeType = "video/mp4",
        status = status,
        distributeAt = "2026-02-08T00:00:00Z",
        distributedAt = null,
        expiresAt = null,
        publicToken = "token-1",
        createdAt = "2026-02-01T00:00:00Z",
        updatedAt = "2026-02-01T00:00:00Z"
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        videoRepository = mockk()
        viewModel = VideoDetailViewModel(videoRepository)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun `loadVideoDetail sets video on success`() = runTest {
        val video = createVideoResponse()
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = video)
        )

        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(video, state.video)
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `loadVideoDetail sets error on failure`() = runTest {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Error("Not found")

        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertNull(state.video)
        assertEquals("Not found", state.error)
        assertFalse(state.isLoading)
    }

    @Test
    fun `clearError clears error message`() = runTest {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Error("Error")
        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        viewModel.clearError()

        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun `requestDelete shows confirmation`() {
        viewModel.requestDelete()
        assertTrue(viewModel.uiState.value.showDeleteConfirmation)
    }

    @Test
    fun `cancelDelete hides confirmation`() {
        viewModel.requestDelete()
        viewModel.cancelDelete()
        assertFalse(viewModel.uiState.value.showDeleteConfirmation)
    }

    @Test
    fun `confirmDelete sets isDeleted on success`() = runTest {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = createVideoResponse())
        )
        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        coEvery { videoRepository.deleteVideo("video-1") } returns ApiResult.Success(
            VideoDeleteResponse(success = true)
        )

        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.isDeleted)
        assertFalse(state.isDeleting)
        assertFalse(state.showDeleteConfirmation)
    }

    @Test
    fun `confirmDelete sets deleteError on failure`() = runTest {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = createVideoResponse())
        )
        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        coEvery { videoRepository.deleteVideo("video-1") } returns ApiResult.Error("Cannot delete")

        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertFalse(state.isDeleted)
        assertEquals("Cannot delete", state.deleteError)
        assertFalse(state.isDeleting)
    }

    @Test
    fun `clearDeleteError clears deleteError`() {
        viewModel.clearDeleteError()
        assertNull(viewModel.uiState.value.deleteError)
    }

    @Test
    fun `requestCheckIn shows confirmation`() {
        viewModel.requestCheckIn()
        assertTrue(viewModel.uiState.value.showCheckInConfirmation)
    }

    @Test
    fun `cancelCheckIn hides confirmation`() {
        viewModel.requestCheckIn()
        viewModel.cancelCheckIn()
        assertFalse(viewModel.uiState.value.showCheckInConfirmation)
    }

    @Test
    fun `checkIn updates video on success`() = runTest {
        val originalVideo = createVideoResponse()
        val updatedVideo = createVideoResponse(status = "ACTIVE")
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = originalVideo)
        )
        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        coEvery { videoRepository.checkInVideo("video-1", "PREVENT_DISTRIBUTION") } returns ApiResult.Success(
            VideoCheckInResponse(
                video = updatedVideo,
                checkin = CheckInResponse(
                    id = "checkin-1",
                    videoId = "video-1",
                    action = "PREVENT_DISTRIBUTION",
                    createdAt = "2026-02-01T12:00:00Z"
                )
            )
        )

        viewModel.checkIn()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(updatedVideo, state.video)
        assertTrue(state.checkInSuccess)
        assertFalse(state.isCheckingIn)
        assertNull(state.checkInError)
    }

    @Test
    fun `checkIn sets error on failure`() = runTest {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = createVideoResponse())
        )
        viewModel.loadVideoDetail("video-1")
        advanceUntilIdle()

        coEvery { videoRepository.checkInVideo("video-1", "PREVENT_DISTRIBUTION") } returns ApiResult.Error("Check-in failed")

        viewModel.checkIn()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Check-in failed", state.checkInError)
        assertFalse(state.isCheckingIn)
        assertFalse(state.checkInSuccess)
    }

    @Test
    fun `clearCheckInError clears checkInError`() {
        viewModel.clearCheckInError()
        assertNull(viewModel.uiState.value.checkInError)
    }

    @Test
    fun `clearCheckInSuccess clears checkInSuccess`() {
        viewModel.clearCheckInSuccess()
        assertFalse(viewModel.uiState.value.checkInSuccess)
    }
}
