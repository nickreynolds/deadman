package com.deadmansdrop.app.ui.screens.videos

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
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
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * UI tests for the VideoDetailScreen composable.
 * Tests the video detail display, check-in flow, and delete flow.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class VideoDetailScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testDispatcher = StandardTestDispatcher()
    private lateinit var videoRepository: VideoRepository

    private val now = Instant.now()
    private val futureTime = now.plus(7, ChronoUnit.DAYS)

    private val activeVideo = VideoResponse(
        id = "video-1",
        userId = "user-1",
        title = "My Active Video",
        filePath = "/videos/active.mp4",
        fileSizeBytes = 1024 * 1024 * 75, // 75 MB
        mimeType = "video/mp4",
        status = "ACTIVE",
        distributeAt = futureTime.toString(),
        distributedAt = null,
        expiresAt = null,
        publicToken = "token-active",
        createdAt = now.toString(),
        updatedAt = now.toString()
    )

    private val distributedVideo = VideoResponse(
        id = "video-2",
        userId = "user-1",
        title = "My Distributed Video",
        filePath = "/videos/distributed.mp4",
        fileSizeBytes = 1024 * 1024 * 50,
        mimeType = "video/mp4",
        status = "DISTRIBUTED",
        distributeAt = now.minus(1, ChronoUnit.DAYS).toString(),
        distributedAt = now.minus(1, ChronoUnit.DAYS).toString(),
        expiresAt = now.plus(6, ChronoUnit.DAYS).toString(),
        publicToken = "token-dist",
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

    private fun createViewModel(): VideoDetailViewModel {
        return VideoDetailViewModel(videoRepository)
    }

    @Test
    fun videoDetailScreen_displaysVideoDetails_forActiveVideo() {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Verify title is displayed
        composeTestRule.onNodeWithText("My Active Video").assertIsDisplayed()

        // Verify top bar
        composeTestRule.onNodeWithText("Video Details").assertIsDisplayed()

        // Verify status badge shows "Active"
        composeTestRule.onNodeWithText("Active").assertIsDisplayed()

        // Verify sections are displayed
        composeTestRule.onNodeWithText("Distribution").assertIsDisplayed()
        composeTestRule.onNodeWithText("File Details").assertIsDisplayed()
        composeTestRule.onNodeWithText("Timestamps").assertIsDisplayed()

        // Verify file details
        composeTestRule.onNodeWithText("75.0 MB").assertIsDisplayed()
        composeTestRule.onNodeWithText("video/mp4").assertIsDisplayed()

        // Verify check-in button is enabled for active video
        composeTestRule.onNodeWithText("Check In (Reset Timer)").assertIsDisplayed()
        composeTestRule.onNodeWithText("Check In (Reset Timer)").assertIsEnabled()

        // Verify delete button is displayed
        composeTestRule.onNodeWithText("Delete Video").assertIsDisplayed()
    }

    @Test
    fun videoDetailScreen_disablesCheckIn_forDistributedVideo() {
        coEvery { videoRepository.getVideoDetail("video-2") } returns ApiResult.Success(
            VideoDetailResponse(video = distributedVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-2",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Check-in button should be disabled
        composeTestRule.onNodeWithText("Check In (Reset Timer)").assertIsNotEnabled()

        // Should show explanation text
        composeTestRule.onNodeWithText("Video has already been distributed").assertIsDisplayed()

        // Should show public link section for distributed videos
        composeTestRule.onNodeWithText("Public Link").assertIsDisplayed()
        composeTestRule.onNodeWithText("Share Link").assertIsDisplayed()
    }

    @Test
    fun videoDetailScreen_showsCheckInConfirmation_whenCheckInClicked() {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Click the check-in button
        composeTestRule.onNodeWithText("Check In (Reset Timer)").performClick()
        composeTestRule.waitForIdle()

        // Confirmation dialog should appear
        composeTestRule.onNodeWithText("Prevent Distribution?").assertIsDisplayed()
        composeTestRule.onNodeWithText("Confirm").assertIsDisplayed()
        composeTestRule.onNodeWithText("Cancel").assertIsDisplayed()
    }

    @Test
    fun videoDetailScreen_dismissesCheckInDialog_onCancel() {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Open check-in dialog
        composeTestRule.onNodeWithText("Check In (Reset Timer)").performClick()
        composeTestRule.waitForIdle()

        // Cancel
        composeTestRule.onNodeWithText("Cancel").performClick()
        composeTestRule.waitForIdle()

        // Dialog should be dismissed
        composeTestRule.onNodeWithText("Prevent Distribution?").assertDoesNotExist()
    }

    @Test
    fun videoDetailScreen_performsCheckIn_onConfirm() {
        val newDistributeAt = now.plus(14, ChronoUnit.DAYS).toString()
        val updatedVideo = activeVideo.copy(distributeAt = newDistributeAt)

        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )
        coEvery { videoRepository.checkInVideo("video-1", "PREVENT_DISTRIBUTION") } returns ApiResult.Success(
            VideoCheckInResponse(
                video = updatedVideo,
                checkin = CheckInResponse(
                    id = "checkin-1",
                    videoId = "video-1",
                    action = "PREVENT_DISTRIBUTION",
                    createdAt = now.toString()
                )
            )
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Open check-in dialog
        composeTestRule.onNodeWithText("Check In (Reset Timer)").performClick()
        composeTestRule.waitForIdle()

        // Confirm check-in
        composeTestRule.onNodeWithText("Confirm").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Dialog should be dismissed after successful check-in
        composeTestRule.onNodeWithText("Prevent Distribution?").assertDoesNotExist()
    }

    @Test
    fun videoDetailScreen_showsDeleteConfirmation_whenDeleteClicked() {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Click delete button
        composeTestRule.onNodeWithText("Delete Video").performClick()
        composeTestRule.waitForIdle()

        // Delete confirmation dialog should appear
        composeTestRule.onNodeWithText("Delete Video?").assertIsDisplayed()
        composeTestRule.onNodeWithText("This action cannot be undone.").assertIsDisplayed()
        composeTestRule.onNodeWithText("Delete").assertIsDisplayed()
        composeTestRule.onNodeWithText("Cancel").assertIsDisplayed()
    }

    @Test
    fun videoDetailScreen_navigatesBack_afterDelete() {
        var navigatedBack = false

        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Success(
            VideoDetailResponse(video = activeVideo)
        )
        coEvery { videoRepository.deleteVideo("video-1") } returns ApiResult.Success(
            VideoDeleteResponse(success = true)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = { navigatedBack = true },
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        // Click delete
        composeTestRule.onNodeWithText("Delete Video").performClick()
        composeTestRule.waitForIdle()

        // Confirm delete
        composeTestRule.onNodeWithText("Delete").performClick()

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        assert(navigatedBack) { "Expected onBack to be called after successful deletion" }
    }

    @Test
    fun videoDetailScreen_showsError_whenLoadFails() {
        coEvery { videoRepository.getVideoDetail("video-1") } returns ApiResult.Error(
            "Video not found"
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-1",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Video not found").assertIsDisplayed()
        composeTestRule.onNodeWithText("Retry").assertIsDisplayed()
    }

    @Test
    fun videoDetailScreen_showsDistributedStatus_badge() {
        coEvery { videoRepository.getVideoDetail("video-2") } returns ApiResult.Success(
            VideoDetailResponse(video = distributedVideo)
        )

        composeTestRule.setContent {
            VideoDetailScreen(
                videoId = "video-2",
                onBack = {},
                viewModel = createViewModel()
            )
        }

        testDispatcher.scheduler.advanceUntilIdle()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithText("Distributed").assertIsDisplayed()
        composeTestRule.onNodeWithText("My Distributed Video").assertIsDisplayed()
    }
}
