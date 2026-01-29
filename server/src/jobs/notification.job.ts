/**
 * Push Notification Job
 *
 * Daily job that sends check-in reminders for active videos.
 * - Queries all users with ACTIVE videos
 * - Sends one notification per active video
 * - Runs at configured time daily (default: 9 AM UTC)
 */

import { prisma } from '../db';
import { createChildLogger } from '../logger';
import {
  sendCheckInReminder,
  formatTimeUntilDistribution,
  CheckInReminderPayload,
  NotificationResult,
} from '../services/notification.service';

const logger = createChildLogger({ component: 'notification-job' });

/**
 * Result of a notification job run
 */
export interface NotificationJobResult {
  /** Number of active videos found */
  videosFound: number;
  /** Number of notifications attempted */
  notificationsAttempted: number;
  /** Number of notifications sent successfully */
  notificationsSent: number;
  /** Number of notifications skipped (no FCM token) */
  notificationsSkipped: number;
  /** Number of notifications that failed */
  notificationsFailed: number;
  /** Details of failures */
  errors: Array<{ userId: string; videoId: string; error: string }>;
}

/**
 * Video with user info for notifications
 */
interface VideoWithUser {
  id: string;
  title: string;
  distributeAt: Date;
  user: {
    id: string;
    fcmToken: string | null;
  };
}

/**
 * Process push notifications for all active videos
 *
 * This function:
 * 1. Queries all ACTIVE videos with their user's FCM token
 * 2. For each video, sends a check-in reminder notification
 * 3. Logs results for monitoring
 *
 * @param now - Optional current time for testing
 * @returns Results of the notification run
 */
export async function processNotifications(now?: Date): Promise<NotificationJobResult> {
  const currentTime = now || new Date();
  const result: NotificationJobResult = {
    videosFound: 0,
    notificationsAttempted: 0,
    notificationsSent: 0,
    notificationsSkipped: 0,
    notificationsFailed: 0,
    errors: [],
  };

  logger.info({ currentTime: currentTime.toISOString() }, 'Starting notification job');

  try {
    // Find all ACTIVE videos with their user's FCM token
    const activeVideos = await prisma.video.findMany({
      where: {
        status: 'ACTIVE',
      },
      select: {
        id: true,
        title: true,
        distributeAt: true,
        user: {
          select: {
            id: true,
            fcmToken: true,
          },
        },
      },
    });

    result.videosFound = activeVideos.length;

    if (activeVideos.length === 0) {
      logger.info('No active videos found for notifications');
      return result;
    }

    logger.info(
      { videoCount: activeVideos.length },
      'Found active videos for notifications'
    );

    // Process each video
    for (const video of activeVideos as VideoWithUser[]) {
      result.notificationsAttempted++;

      // Skip if user has no FCM token
      if (!video.user.fcmToken) {
        result.notificationsSkipped++;
        logger.debug(
          { userId: video.user.id, videoId: video.id },
          'Skipping notification - user has no FCM token'
        );
        continue;
      }

      try {
        const payload: CheckInReminderPayload = {
          fcmToken: video.user.fcmToken,
          userId: video.user.id,
          videoId: video.id,
          videoTitle: video.title,
          timeUntilDistribution: formatTimeUntilDistribution(video.distributeAt, currentTime),
          distributeAt: video.distributeAt, // For deep linking (PRD Task 68)
        };

        const sendResult: NotificationResult = await sendCheckInReminder(payload);

        if (sendResult.success) {
          result.notificationsSent++;
          logger.debug(
            { userId: video.user.id, videoId: video.id, title: video.title },
            'Notification sent successfully'
          );
        } else {
          result.notificationsFailed++;
          if (sendResult.error) {
            result.errors.push({
              userId: video.user.id,
              videoId: video.id,
              error: sendResult.error,
            });
          }
        }
      } catch (error) {
        result.notificationsFailed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({
          userId: video.user.id,
          videoId: video.id,
          error: errorMessage,
        });

        logger.error(
          {
            userId: video.user.id,
            videoId: video.id,
            title: video.title,
            err: error,
          },
          'Failed to send notification'
        );
      }
    }

    logger.info(
      {
        videosFound: result.videosFound,
        attempted: result.notificationsAttempted,
        sent: result.notificationsSent,
        skipped: result.notificationsSkipped,
        failed: result.notificationsFailed,
      },
      'Notification job completed'
    );

    return result;
  } catch (error) {
    logger.error({ err: error }, 'Notification job failed unexpectedly');
    throw error;
  }
}

/**
 * Notification job handler for the scheduler
 * This is the entry point called by the job scheduler
 */
export async function notificationJobHandler(): Promise<void> {
  const result = await processNotifications();

  // Log summary for monitoring
  if (result.notificationsFailed > 0) {
    logger.warn(
      {
        sent: result.notificationsSent,
        failed: result.notificationsFailed,
        errors: result.errors,
      },
      'Notification job completed with failures'
    );
  }
}
