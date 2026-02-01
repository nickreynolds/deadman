package com.deadmansdrop.app.ui.screens.videos

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.deadmansdrop.app.data.api.ApiResult
import com.deadmansdrop.app.data.api.models.VideoListResponse
import com.deadmansdrop.app.data.api.models.VideoResponse
import com.deadmansdrop.app.data.repository.VideoRepository
import io.mockk.coEvery
import io.mockk.mockk
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * UI tests for the VideoListScreen composable.
 * Tests the video list display, empty state, error state,
 * and delete confirmation dialog.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VideoListScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var videoRepository: VideoRepository

    private val now = Instant.now()
    private val futureTime = now.plus(7, ChronoUnit.DAYS)

    private val sampleVideo = VideoResponse(
        id = "video-1",
        userId = "user-1",
        title = "Test Video One",
        filePath = "/videos/test1.mp4",
        fileSizeBytes = 1024 * 1024 * 50, // 50 MB
        mimeType = "video/mp4",
        status = "ACTIVE",
        distributeAt = futureTime.toString(),
        distributedAt = null,
        expiresAt = null,
        publicToken = "token-1",
        createdAt = now.toString(),
        updatedAt = now.toString()
    )

    private val sampleVideo2 = VideoResponse(
        id = "video-2",
        userId = "user-1",
        title = "Test Video Two",
        filePath = "/videos/test2.mp4",
        fileSizeBytes = 1024 * 1024 * 100, // 100 MB
        mimeType = "video/mp4",
        status = "DISTRIBUTED",
        distributeAt = now.minus(1, ChronoUnit.DAYS).toString(),
        distributedAt = now.minus(1, ChronoUnit.DAYS).toString(),
        expiresAt = now.plus(6, ChronoUnit.DAYS).toString(),
        publicToken = "token-2",
        createdAt = now.minus(8, ChronoUnit.DAYS).toString(),
        updatedAt = now.minus(1, ChronoUnit.DAYS).toString()
    )

    @Before
    fun setup() {
        Dispatchers.setMain(testDispatcher)
        videoRepository = mockk(relaxed = true)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    private fun createViewModel(): VideoListViewModel {
        return VideoListViewModel(videoRepository)
    }

    @Test
    fun videoListScreen_displaysEmptyState_whenNoVideos() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(videos = emptyList(), total = 0)
        )

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("No videos yet").assertIsDisplayed()
        composeTestRule.onNodeWithText("Record your first video to get started").assertIsDisplayed()
    }

    @Test
    fun videoListScreen_displaysVideos_whenLoaded() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(
                videos = listOf(sampleVideo, sampleVideo2),
                total = 2
            )
        )

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Verify both video titles are displayed
        composeTestRule.onNodeWithText("Test Video One").assertIsDisplayed()
        composeTestRule.onNodeWithText("Test Video Two").assertIsDisplayed()

        // Verify status chips are displayed
        composeTestRule.onNodeWithText("Active").assertIsDisplayed()
        composeTestRule.onNodeWithText("Sent").assertIsDisplayed()
    }

    @Test
    fun videoListScreen_displaysVideoFileSize() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(videos = listOf(sampleVideo), total = 1)
        )

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Should display file size (50 MB)
        composeTestRule.onNodeWithText("50.0 MB").assertIsDisplayed()
    }

    @Test
    fun videoListScreen_displaysError_whenLoadFails() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Error(
            "Failed to load videos"
        )

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Failed to load videos").assertIsDisplayed()
        composeTestRule.onNodeWithText("Pull down to retry").assertIsDisplayed()
    }

    @Test
    fun videoListScreen_navigatesToVideo_onClick() {
        var clickedVideoId: String? = null

        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(videos = listOf(sampleVideo), total = 1)
        )

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = { clickedVideoId = it },
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Test Video One").performClick()

        assert(clickedVideoId == "video-1") {
            "Expected clicked video ID to be 'video-1' but was '$clickedVideoId'"
        }
    }

    @Test
    fun videoListScreen_showsDeleteDialog_onDeleteRequest() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(videos = listOf(sampleVideo), total = 1)
        )

        val viewModel = createViewModel()

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = viewModel
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Trigger delete request programmatically (swipe is hard to test)
        viewModel.requestDeleteVideo(sampleVideo)
        composeTestRule.waitForIdle()

        // Delete confirmation dialog should appear
        composeTestRule.onNodeWithText("Delete Video?").assertIsDisplayed()
        composeTestRule.onNodeWithText("Are you sure you want to delete \"Test Video One\"?")
            .assertIsDisplayed()
        composeTestRule.onNodeWithText("This action cannot be undone.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Delete").assertIsDisplayed()
        composeTestRule.onNodeWithText("Cancel").assertIsDisplayed()
    }

    @Test
    fun videoListScreen_dismissesDeleteDialog_onCancel() {
        coEvery { videoRepository.getVideos(any(), any(), any()) } returns ApiResult.Success(
            VideoListResponse(videos = listOf(sampleVideo), total = 1)
        )

        val viewModel = createViewModel()

        composeTestRule.setContent {
            VideoListScreen(
                onVideoClick = {},
                viewModel = viewModel
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Show delete dialog
        viewModel.requestDeleteVideo(sampleVideo)
        composeTestRule.waitForIdle()

        // Cancel the delete
        composeTestRule.onNodeWithText("Cancel").performClick()
        composeTestRule.waitForIdle()

        // Dialog should be dismissed
        composeTestRule.onNodeWithText("Delete Video?").assertDoesNotExist()
    }
}
