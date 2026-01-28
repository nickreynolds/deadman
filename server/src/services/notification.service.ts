/**
 * Notification Service
 *
 * Service for sending push notifications via Firebase Cloud Messaging.
 * If Firebase is not configured, notifications are logged but not sent.
 */

import { createChildLogger } from '../logger';
import {
  isFirebaseReady,
  sendFcmMessage,
  isFirebaseConfigured,
} from './firebase.service';

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
  messageId?: string;
  error?: string;
}

/**
 * Send a check-in reminder notification
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

  // Check if Firebase is ready
  if (!isFirebaseReady()) {
    // Log the notification that would be sent
    logger.info(
      {
        userId,
        videoId,
        videoTitle,
        timeUntilDistribution,
        fcmToken: fcmToken.substring(0, 10) + '...',
      },
      'Would send check-in reminder notification (Firebase not configured)'
    );

    // Return success for development/testing when Firebase not configured
    return {
      success: true,
      userId,
      videoId,
    };
  }

  try {
    // Build notification message
    const messageId = await sendFcmMessage({
      token: fcmToken,
      notification: {
        title: 'Check-In Reminder',
        body: `Your video "${videoTitle}" will be distributed in ${timeUntilDistribution}. Tap to prevent distribution.`,
      },
      data: {
        type: 'CHECK_IN_REMINDER',
        videoId,
        userId,
        action: 'OPEN_VIDEO',
      },
      android: {
        priority: 'high',
        ttl: 86400, // 24 hours
      },
      apns: {
        headers: {
          'apns-priority': '10', // High priority
        },
        payload: {
          aps: {
            badge: 1,
            sound: 'default',
            contentAvailable: true,
          },
        },
      },
    });

    if (messageId) {
      logger.info(
        { userId, videoId, messageId },
        'Check-in reminder notification sent successfully'
      );
      return {
        success: true,
        userId,
        videoId,
        messageId,
      };
    }

    // Firebase returned null (shouldn't happen if isFirebaseReady() was true)
    return {
      success: false,
      userId,
      videoId,
      error: 'Firebase messaging returned null',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Check for specific FCM error codes
    const errorCode = (error as { code?: string }).code;
    if (
      errorCode === 'messaging/invalid-registration-token' ||
      errorCode === 'messaging/registration-token-not-registered'
    ) {
      logger.warn(
        { userId, videoId, errorCode },
        'FCM token is invalid or unregistered'
      );
      return {
        success: false,
        userId,
        videoId,
        error: 'Invalid or unregistered FCM token',
      };
    }

    logger.error(
      { userId, videoId, err: error },
      'Failed to send check-in reminder notification'
    );
    return {
      success: false,
      userId,
      videoId,
      error: errorMessage,
    };
  }
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
 * Re-export isFirebaseConfigured for backward compatibility
 */
export { isFirebaseConfigured };

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
