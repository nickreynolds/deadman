/**
 * Notification Service
 *
 * Placeholder service for sending push notifications.
 * This will be implemented with Firebase Admin SDK in Task 64-65.
 *
 * Currently logs notifications instead of sending them.
 */

import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'notification-service' });

/**
 * Notification payload for check-in reminders
 */
export interface CheckInReminderPayload {
  /** User's FCM token */
  fcmToken: string;
  /** User ID for logging */
  userId: string;
  /** Video ID for deep linking */
  videoId: string;
  /** Video title for display */
  videoTitle: string;
  /** Time until distribution (in hours or days) */
  timeUntilDistribution: string;
}

/**
 * Result of a notification send attempt
 */
export interface NotificationResult {
  success: boolean;
  userId: string;
  videoId: string;
  error?: string;
}

/**
 * Send a check-in reminder notification
 *
 * TODO: Implement with Firebase Admin SDK (Task 64-65)
 * Currently logs the notification instead of sending
 *
 * @param payload Notification payload
 * @returns Result of the send attempt
 */
export async function sendCheckInReminder(
  payload: CheckInReminderPayload
): Promise<NotificationResult> {
  const { fcmToken, userId, videoId, videoTitle, timeUntilDistribution } = payload;

  // Validate FCM token
  if (!fcmToken) {
    logger.debug(
      { userId, videoId },
      'Skipping notification - no FCM token registered'
    );
    return {
      success: false,
      userId,
      videoId,
      error: 'No FCM token registered',
    };
  }

  // TODO: Replace with actual Firebase Admin SDK call
  // For now, log the notification that would be sent
  logger.info(
    {
      userId,
      videoId,
      videoTitle,
      timeUntilDistribution,
      fcmToken: fcmToken.substring(0, 10) + '...', // Truncate for security
    },
    'Would send check-in reminder notification (Firebase not configured)'
  );

  // Simulate successful send for development/testing
  // In production, this would call Firebase Admin SDK
  return {
    success: true,
    userId,
    videoId,
  };
}

/**
 * Send multiple check-in reminder notifications
 *
 * @param payloads Array of notification payloads
 * @returns Array of results
 */
export async function sendCheckInReminders(
  payloads: CheckInReminderPayload[]
): Promise<NotificationResult[]> {
  const results: NotificationResult[] = [];

  for (const payload of payloads) {
    try {
      const result = await sendCheckInReminder(payload);
      results.push(result);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      results.push({
        success: false,
        userId: payload.userId,
        videoId: payload.videoId,
        error: errorMessage,
      });
      logger.error(
        { userId: payload.userId, videoId: payload.videoId, err: error },
        'Failed to send check-in reminder'
      );
    }
  }

  return results;
}

/**
 * Check if Firebase is configured
 *
 * TODO: Implement actual check when Firebase Admin SDK is set up
 */
export function isFirebaseConfigured(): boolean {
  // Will be implemented in Task 64
  return false;
}

/**
 * Format time until distribution for display in notification
 *
 * @param distributeAt Distribution timestamp
 * @param now Current time (optional, for testing)
 * @returns Human-readable time string (e.g., "2 days", "5 hours")
 */
export function formatTimeUntilDistribution(
  distributeAt: Date,
  now?: Date
): string {
  const currentTime = now || new Date();
  const diffMs = distributeAt.getTime() - currentTime.getTime();

  if (diffMs <= 0) {
    return 'soon';
  }

  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays >= 1) {
    return diffDays === 1 ? '1 day' : `${diffDays} days`;
  }

  if (diffHours >= 1) {
    return diffHours === 1 ? '1 hour' : `${diffHours} hours`;
  }

  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  if (diffMinutes >= 1) {
    return diffMinutes === 1 ? '1 minute' : `${diffMinutes} minutes`;
  }

  return 'soon';
}
