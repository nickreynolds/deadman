/**
 * Notification Templates
 *
 * Defines templates for push notifications with video-specific information.
 * Templates include video title and time until distribution as per PRD Task 67.
 */

import { formatTimeUntilDistribution } from './notification.service';

/**
 * Notification template types
 */
export type NotificationTemplateType =
  | 'CHECK_IN_REMINDER'
  | 'DISTRIBUTION_WARNING'
  | 'VIDEO_DISTRIBUTED'
  | 'VIDEO_EXPIRED';

/**
 * Template context for rendering notification content
 */
export interface NotificationTemplateContext {
  /** Video title for display */
  videoTitle: string;
  /** Distribution timestamp */
  distributeAt: Date;
  /** Current time (optional, for testing) */
  now?: Date;
}

/**
 * Rendered notification content
 */
export interface NotificationContent {
  /** Notification title */
  title: string;
  /** Notification body text */
  body: string;
}

/**
 * Template definition
 */
interface NotificationTemplate {
  /** Template title (can include {{placeholders}}) */
  title: string;
  /** Template body (can include {{placeholders}}) */
  body: string;
}

/**
 * Notification templates for different notification types
 */
const TEMPLATES: Record<NotificationTemplateType, NotificationTemplate> = {
  /**
   * Daily check-in reminder for active videos
   * Sent once per day for each active video
   */
  CHECK_IN_REMINDER: {
    title: 'Check-In Reminder',
    body: 'Your video "{{videoTitle}}" will be distributed in {{timeUntilDistribution}}. Tap to prevent distribution.',
  },

  /**
   * Urgent warning when distribution is imminent (less than 24 hours)
   * Higher priority notification
   */
  DISTRIBUTION_WARNING: {
    title: '⚠️ Distribution Soon',
    body: '"{{videoTitle}}" will be distributed in {{timeUntilDistribution}}! Check in now to prevent distribution.',
  },

  /**
   * Notification when a video has been distributed
   * Informational notification
   */
  VIDEO_DISTRIBUTED: {
    title: 'Video Distributed',
    body: 'Your video "{{videoTitle}}" has been distributed to your recipients.',
  },

  /**
   * Notification when a distributed video has expired
   * Informational notification
   */
  VIDEO_EXPIRED: {
    title: 'Video Expired',
    body: 'Your video "{{videoTitle}}" has expired and is no longer accessible.',
  },
};

/**
 * Truncate video title if too long for notification
 * Mobile notifications have limited space
 *
 * @param title Video title
 * @param maxLength Maximum length (default 50)
 * @returns Truncated title with ellipsis if needed
 */
export function truncateVideoTitle(title: string, maxLength = 50): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.substring(0, maxLength - 3) + '...';
}

/**
 * Render a notification template with context
 *
 * @param templateType Type of notification template
 * @param context Template context with video information
 * @returns Rendered notification content
 */
export function renderNotificationTemplate(
  templateType: NotificationTemplateType,
  context: NotificationTemplateContext
): NotificationContent {
  const template = TEMPLATES[templateType];

  // Truncate video title for display
  const videoTitle = truncateVideoTitle(context.videoTitle);

  // Format time until distribution
  const timeUntilDistribution = formatTimeUntilDistribution(
    context.distributeAt,
    context.now
  );

  // Replace placeholders
  const title = template.title
    .replace(/\{\{videoTitle\}\}/g, videoTitle)
    .replace(/\{\{timeUntilDistribution\}\}/g, timeUntilDistribution);

  const body = template.body
    .replace(/\{\{videoTitle\}\}/g, videoTitle)
    .replace(/\{\{timeUntilDistribution\}\}/g, timeUntilDistribution);

  return { title, body };
}

/**
 * Get check-in reminder notification content
 *
 * @param videoTitle Video title
 * @param distributeAt Distribution timestamp
 * @param now Current time (optional, for testing)
 * @returns Notification content with title and body
 */
export function getCheckInReminderContent(
  videoTitle: string,
  distributeAt: Date,
  now?: Date
): NotificationContent {
  return renderNotificationTemplate('CHECK_IN_REMINDER', {
    videoTitle,
    distributeAt,
    now,
  });
}

/**
 * Get distribution warning notification content
 * Use this when distribution is less than 24 hours away
 *
 * @param videoTitle Video title
 * @param distributeAt Distribution timestamp
 * @param now Current time (optional, for testing)
 * @returns Notification content with title and body
 */
export function getDistributionWarningContent(
  videoTitle: string,
  distributeAt: Date,
  now?: Date
): NotificationContent {
  return renderNotificationTemplate('DISTRIBUTION_WARNING', {
    videoTitle,
    distributeAt,
    now,
  });
}

/**
 * Get video distributed notification content
 *
 * @param videoTitle Video title
 * @returns Notification content with title and body
 */
export function getVideoDistributedContent(
  videoTitle: string
): NotificationContent {
  // Use a past date for distribution (already happened)
  return renderNotificationTemplate('VIDEO_DISTRIBUTED', {
    videoTitle,
    distributeAt: new Date(),
  });
}

/**
 * Get video expired notification content
 *
 * @param videoTitle Video title
 * @returns Notification content with title and body
 */
export function getVideoExpiredContent(videoTitle: string): NotificationContent {
  // Use a past date for expiration (already happened)
  return renderNotificationTemplate('VIDEO_EXPIRED', {
    videoTitle,
    distributeAt: new Date(),
  });
}

/**
 * Determine if distribution warning should be used instead of regular reminder
 * Warning is used when less than 24 hours until distribution
 *
 * @param distributeAt Distribution timestamp
 * @param now Current time (optional, for testing)
 * @returns True if warning template should be used
 */
export function shouldUseDistributionWarning(
  distributeAt: Date,
  now?: Date
): boolean {
  const currentTime = now || new Date();
  const diffMs = distributeAt.getTime() - currentTime.getTime();
  const hoursUntilDistribution = diffMs / (1000 * 60 * 60);

  // Use warning when LESS than 24 hours (not equal to or less than)
  return hoursUntilDistribution > 0 && hoursUntilDistribution < 24;
}

/**
 * Get appropriate reminder content based on time until distribution
 * Automatically chooses between regular reminder and urgent warning
 *
 * @param videoTitle Video title
 * @param distributeAt Distribution timestamp
 * @param now Current time (optional, for testing)
 * @returns Notification content with appropriate urgency
 */
export function getSmartReminderContent(
  videoTitle: string,
  distributeAt: Date,
  now?: Date
): NotificationContent {
  if (shouldUseDistributionWarning(distributeAt, now)) {
    return getDistributionWarningContent(videoTitle, distributeAt, now);
  }
  return getCheckInReminderContent(videoTitle, distributeAt, now);
}
