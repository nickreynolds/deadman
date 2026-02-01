package com.deadmansdrop.app.ui.screens.videos

import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.VideoDeleteResponse
import com.deadmansdrop.app.data.api.models.VideoListResponse
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
class VideoListViewModelTest {

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var videoRepository: VideoRepository
    private lateinit var viewModel: VideoListViewModel

    private fun createVideoResponse(
        id: String = "video-1",
        title: String = "Test Video"
    ) = VideoResponse(
        id = id,
        userId = "user-1",
        title = title,
        filePath = "/uploads/test.mp4",
        fileSizeBytes = 1024L,
        mimeType = "video/mp4",
        status = "ACTIVE",
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
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): VideoListViewModel {
        return VideoListViewModel(videoRepository)
    }

    @Test
    fun `init loads videos on creation`() = runTest {
        val videos = listOf(createVideoResponse())
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = videos, total = 1)
        )

        viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(1, state.videos.size)
        assertEquals("Test Video", state.videos[0].title)
        assertEquals(1, state.totalCount)
        assertFalse(state.isLoading)
        assertNull(state.error)
    }

    @Test
    fun `loadVideos sets error on failure`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Error("Network error")

        viewModel = createViewModel()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Network error", state.error)
        assertFalse(state.isLoading)
        assertTrue(state.videos.isEmpty())
    }

    @Test
    fun `refreshVideos updates videos list`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        val updatedVideos = listOf(createVideoResponse(), createVideoResponse(id = "video-2"))
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = updatedVideos, total = 2)
        )

        viewModel.refreshVideos()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals(2, state.videos.size)
        assertEquals(2, state.totalCount)
        assertFalse(state.isRefreshing)
    }

    @Test
    fun `refreshVideos sets error on failure`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { videoRepository.getVideos() } returns ApiResult.Error("Server error")

        viewModel.refreshVideos()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Server error", state.error)
        assertFalse(state.isRefreshing)
    }

    @Test
    fun `clearError clears error message`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Error("Error")
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.clearError()

        assertNull(viewModel.uiState.value.error)
    }

    @Test
    fun `requestDeleteVideo sets videoToDelete`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        val video = createVideoResponse()
        viewModel.requestDeleteVideo(video)

        assertEquals(video, viewModel.uiState.value.videoToDelete)
    }

    @Test
    fun `cancelDelete clears videoToDelete`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.requestDeleteVideo(createVideoResponse())
        viewModel.cancelDelete()

        assertNull(viewModel.uiState.value.videoToDelete)
    }

    @Test
    fun `confirmDelete removes video from list on success`() = runTest {
        val video = createVideoResponse()
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = listOf(video), total = 1)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { videoRepository.deleteVideo("video-1") } returns ApiResult.Success(
            VideoDeleteResponse(success = true)
        )

        viewModel.requestDeleteVideo(video)
        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertTrue(state.videos.isEmpty())
        assertEquals(0, state.totalCount)
        assertFalse(state.isDeleting)
        assertNull(state.videoToDelete)
    }

    @Test
    fun `confirmDelete sets deleteError on failure`() = runTest {
        val video = createVideoResponse()
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = listOf(video), total = 1)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        coEvery { videoRepository.deleteVideo("video-1") } returns ApiResult.Error("Delete failed")

        viewModel.requestDeleteVideo(video)
        viewModel.confirmDelete()
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Delete failed", state.deleteError)
        assertFalse(state.isDeleting)
        assertEquals(1, state.videos.size) // Video still in list
    }

    @Test
    fun `confirmDelete does nothing when no videoToDelete`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.confirmDelete()
        advanceUntilIdle()

        assertFalse(viewModel.uiState.value.isDeleting)
    }

    @Test
    fun `clearDeleteError clears delete error`() = runTest {
        coEvery { videoRepository.getVideos() } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )
        viewModel = createViewModel()
        advanceUntilIdle()

        viewModel.clearDeleteError()

        assertNull(viewModel.uiState.value.deleteError)
    }
}
