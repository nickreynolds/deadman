package com.deadmansdrop.app.ui.screens.upload

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.deadmansdrop.app.data.repository.UploadProgress
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import java.util.UUID

/**
 * UI tests for the UploadProgressCard composable.
 * Tests display of different upload states: pending, uploading,
 * success, failed, and cancelled.
 */
class UploadProgressCardTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private val testWorkId = UUID.randomUUID()

    @Test
    fun uploadProgressCard_displaysPendingState() {
        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "my_video.mp4",
            status = UploadStatus.PENDING,
            progress = UploadProgress.ZERO
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithText("my_video.mp4").assertIsDisplayed()
        composeTestRule.onNodeWithText("Waiting to upload...").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Cancel upload").assertIsDisplayed()
    }

    @Test
    fun uploadProgressCard_displaysUploadingState_withProgress() {
        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "recording_2026.mp4",
            status = UploadStatus.UPLOADING,
            progress = UploadProgress(
                progressPercent = 45,
                bytesUploaded = 45 * 1024 * 1024L,
                totalBytes = 100 * 1024 * 1024L
            )
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithText("recording_2026.mp4").assertIsDisplayed()
        composeTestRule.onNodeWithText("Uploading...").assertIsDisplayed()
        composeTestRule.onNodeWithText("45%").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Cancel upload").assertIsDisplayed()
    }

    @Test
    fun uploadProgressCard_displaysSuccessState() {
        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "completed_video.mp4",
            status = UploadStatus.SUCCESS,
            progress = UploadProgress(100, 50 * 1024 * 1024L, 50 * 1024 * 1024L),
            videoId = "video-123"
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithText("completed_video.mp4").assertIsDisplayed()
        composeTestRule.onNodeWithText("Upload complete").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Dismiss").assertIsDisplayed()
    }

    @Test
    fun uploadProgressCard_displaysFailedState_withErrorMessage() {
        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "failed_video.mp4",
            status = UploadStatus.FAILED,
            progress = UploadProgress.ZERO,
            errorMessage = "Storage quota exceeded"
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithText("failed_video.mp4").assertIsDisplayed()
        composeTestRule.onNodeWithText("Upload failed").assertIsDisplayed()
        composeTestRule.onNodeWithText("Storage quota exceeded").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Dismiss").assertIsDisplayed()
    }

    @Test
    fun uploadProgressCard_displaysCancelledState() {
        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "cancelled_video.mp4",
            status = UploadStatus.CANCELLED,
            progress = UploadProgress.ZERO
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithText("cancelled_video.mp4").assertIsDisplayed()
        composeTestRule.onNodeWithText("Cancelled").assertIsDisplayed()
        composeTestRule.onNodeWithContentDescription("Dismiss").assertIsDisplayed()
    }

    @Test
    fun uploadProgressCard_callsOnCancel_whenCancelClicked() {
        var cancelledWorkId: UUID? = null

        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "uploading_video.mp4",
            status = UploadStatus.UPLOADING,
            progress = UploadProgress(50, 25 * 1024 * 1024L, 50 * 1024 * 1024L)
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = { cancelledWorkId = it },
                onDismiss = {}
            )
        }

        composeTestRule.onNodeWithContentDescription("Cancel upload").performClick()

        assertEquals(testWorkId, cancelledWorkId)
    }

    @Test
    fun uploadProgressCard_callsOnDismiss_whenDismissClicked() {
        var dismissedWorkId: UUID? = null

        val uploadState = UploadState(
            workId = testWorkId,
            fileName = "done_video.mp4",
            status = UploadStatus.SUCCESS,
            progress = UploadProgress(100, 50 * 1024 * 1024L, 50 * 1024 * 1024L)
        )

        composeTestRule.setContent {
            UploadProgressCard(
                uploadState = uploadState,
                onCancel = {},
                onDismiss = { dismissedWorkId = it }
            )
        }

        composeTestRule.onNodeWithContentDescription("Dismiss").performClick()

        assertEquals(testWorkId, dismissedWorkId)
    }
}
