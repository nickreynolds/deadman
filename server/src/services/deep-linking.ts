/**
 * Deep Linking Service
 *
 * Provides payload definitions and helpers for deep linking in push notifications.
 * Mobile apps (iOS and Android) can parse these payloads to navigate directly
 * to specific videos when a notification is tapped.
 *
 * PRD Task 68: Add deep linking payload
 */

import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'deep-linking' });

/**
 * Deep link action types
 * Mobile apps should handle these actions to navigate appropriately
 */
export const DeepLinkAction = {
  /** Open a specific video for viewing/check-in */
  OPEN_VIDEO: 'OPEN_VIDEO',
  /** Open the video list screen */
  OPEN_VIDEO_LIST: 'OPEN_VIDEO_LIST',
  /** Open settings screen */
  OPEN_SETTINGS: 'OPEN_SETTINGS',
  /** Open the check-in confirmation for a video */
  OPEN_CHECK_IN: 'OPEN_CHECK_IN',
} as const;

export type DeepLinkActionType = (typeof DeepLinkAction)[keyof typeof DeepLinkAction];

/**
 * Notification types sent from the server
 * Mobile apps can use this to determine handling logic
 */
export const NotificationType = {
  /** Daily check-in reminder for active video */
  CHECK_IN_REMINDER: 'CHECK_IN_REMINDER',
  /** Urgent warning when distribution is imminent (< 24 hours) */
  DISTRIBUTION_WARNING: 'DISTRIBUTION_WARNING',
  /** Video has been distributed */
  VIDEO_DISTRIBUTED: 'VIDEO_DISTRIBUTED',
  /** Video has expired */
  VIDEO_EXPIRED: 'VIDEO_EXPIRED',
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

/**
 * Deep link payload for video-related notifications
 *
 * All values are strings as required by FCM data payloads.
 * Mobile apps should parse these values accordingly.
 *
 * Example usage in mobile app:
 * ```kotlin
 * // Android (Kotlin)
 * val type = remoteMessage.data["type"]
 * val videoId = remoteMessage.data["videoId"]
 * val action = remoteMessage.data["action"]
 *
 * when (action) {
 *   "OPEN_VIDEO" -> navigateToVideo(videoId)
 *   "OPEN_CHECK_IN" -> navigateToCheckIn(videoId)
 * }
 * ```
 *
 * ```swift
 * // iOS (Swift)
 * let type = userInfo["type"] as? String
 * let videoId = userInfo["videoId"] as? String
 * let action = userInfo["action"] as? String
 *
 * switch action {
 * case "OPEN_VIDEO": navigateToVideo(videoId: videoId)
 * case "OPEN_CHECK_IN": navigateToCheckIn(videoId: videoId)
 * }
 * ```
 */
export interface DeepLinkPayload {
  /** Notification type for categorization */
  type: NotificationTypeValue;
  /** Video ID (UUID) for navigation */
  videoId: string;
  /** User ID (UUID) for verification */
  userId: string;
  /** Action to perform when notification is tapped */
  action: DeepLinkActionType;
  /** Video title for display in notification */
  videoTitle?: string;
  /** Distribution timestamp (ISO 8601 string) */
  distributeAt?: string;
  /** Time until distribution (human-readable, e.g., "2 days") */
  timeUntilDistribution?: string;
}

/**
 * Build deep link payload for check-in reminder notifications
 *
 * @param videoId Video UUID
 * @param userId User UUID
 * @param videoTitle Video title for context
 * @param distributeAt Distribution timestamp
 * @param timeUntilDistribution Human-readable time string
 * @returns Deep link payload for FCM data field
 */
export function buildCheckInReminderPayload(
  videoId: string,
  userId: string,
  videoTitle: string,
  distributeAt: Date,
  timeUntilDistribution: string
): DeepLinkPayload {
  logger.debug(
    { videoId, userId, action: DeepLinkAction.OPEN_VIDEO },
    'Building check-in reminder deep link payload'
  );

  return {
    type: NotificationType.CHECK_IN_REMINDER,
    videoId,
    userId,
    action: DeepLinkAction.OPEN_VIDEO,
    videoTitle,
    distributeAt: distributeAt.toISOString(),
    timeUntilDistribution,
  };
}

/**
 * Build deep link payload for distribution warning notifications
 *
 * @param videoId Video UUID
 * @param userId User UUID
 * @param videoTitle Video title for context
 * @param distributeAt Distribution timestamp
 * @param timeUntilDistribution Human-readable time string
 * @returns Deep link payload for FCM data field
 */
export function buildDistributionWarningPayload(
  videoId: string,
  userId: string,
  videoTitle: string,
  distributeAt: Date,
  timeUntilDistribution: string
): DeepLinkPayload {
  logger.debug(
    { videoId, userId, action: DeepLinkAction.OPEN_CHECK_IN },
    'Building distribution warning deep link payload'
  );

  return {
    type: NotificationType.DISTRIBUTION_WARNING,
    videoId,
    userId,
    // Use OPEN_CHECK_IN for urgent warnings to go straight to check-in
    action: DeepLinkAction.OPEN_CHECK_IN,
    videoTitle,
    distributeAt: distributeAt.toISOString(),
    timeUntilDistribution,
  };
}

/**
 * Build deep link payload for video distributed notifications
 *
 * @param videoId Video UUID
 * @param userId User UUID
 * @param videoTitle Video title for context
 * @returns Deep link payload for FCM data field
 */
export function buildVideoDistributedPayload(
  videoId: string,
  userId: string,
  videoTitle: string
): DeepLinkPayload {
  logger.debug(
    { videoId, userId, action: DeepLinkAction.OPEN_VIDEO },
    'Building video distributed deep link payload'
  );

  return {
    type: NotificationType.VIDEO_DISTRIBUTED,
    videoId,
    userId,
    action: DeepLinkAction.OPEN_VIDEO,
    videoTitle,
  };
}

/**
 * Build deep link payload for video expired notifications
 *
 * @param videoId Video UUID
 * @param userId User UUID
 * @param videoTitle Video title for context
 * @returns Deep link payload for FCM data field
 */
export function buildVideoExpiredPayload(
  videoId: string,
  userId: string,
  videoTitle: string
): DeepLinkPayload {
  logger.debug(
    { videoId, userId, action: DeepLinkAction.OPEN_VIDEO_LIST },
    'Building video expired deep link payload'
  );

  return {
    type: NotificationType.VIDEO_EXPIRED,
    videoId,
    userId,
    // Open video list since the specific video is expired
    action: DeepLinkAction.OPEN_VIDEO_LIST,
    videoTitle,
  };
}

/**
 * Convert deep link payload to FCM-compatible data object
 *
 * FCM requires all data values to be strings. This function
 * ensures proper serialization.
 *
 * @param payload Deep link payload
 * @returns Record<string, string> for FCM data field
 */
export function serializeDeepLinkPayload(
  payload: DeepLinkPayload
): Record<string, string> {
  const data: Record<string, string> = {
    type: payload.type,
    videoId: payload.videoId,
    userId: payload.userId,
    action: payload.action,
  };

  // Add optional fields if present
  if (payload.videoTitle) {
    data.videoTitle = payload.videoTitle;
  }
  if (payload.distributeAt) {
    data.distributeAt = payload.distributeAt;
  }
  if (payload.timeUntilDistribution) {
    data.timeUntilDistribution = payload.timeUntilDistribution;
  }

  return data;
}

/**
 * Validate a deep link payload
 *
 * @param payload Payload to validate
 * @returns true if valid, false otherwise
 */
export function isValidDeepLinkPayload(payload: unknown): payload is DeepLinkPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const p = payload as Record<string, unknown>;

  // Check required fields
  if (typeof p.type !== 'string' || !Object.values(NotificationType).includes(p.type as NotificationTypeValue)) {
    return false;
  }
  if (typeof p.videoId !== 'string' || p.videoId.length === 0) {
    return false;
  }
  if (typeof p.userId !== 'string' || p.userId.length === 0) {
    return false;
  }
  if (typeof p.action !== 'string' || !Object.values(DeepLinkAction).includes(p.action as DeepLinkActionType)) {
    return false;
  }

  return true;
}
