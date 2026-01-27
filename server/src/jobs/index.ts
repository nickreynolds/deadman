/**
 * Background Jobs Module
 *
 * Exports job handlers and registration functions for the scheduler.
 */

export {
  processDistribution,
  distributionJobHandler,
  type DistributionJobResult,
} from './distribution.job';

export {
  processNotifications,
  notificationJobHandler,
  type NotificationJobResult,
} from './notification.job';

export {
  processExpiration,
  expirationJobHandler,
  type ExpirationJobResult,
} from './expiration.job';

import { getScheduler, CronExpressions } from '../scheduler';
import { distributionJobHandler } from './distribution.job';
import { notificationJobHandler } from './notification.job';
import { expirationJobHandler } from './expiration.job';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'jobs' });

/**
 * Job names for reference
 */
export const JobNames = {
  DISTRIBUTION: 'distribution',
  PUSH_NOTIFICATIONS: 'push-notifications',
  EXPIRATION_CLEANUP: 'expiration-cleanup',
} as const;

/**
 * Register all background jobs with the scheduler
 * This should be called during application startup after the scheduler is initialized
 */
export function registerAllJobs(): void {
  const scheduler = getScheduler();

  // Distribution job - runs hourly
  scheduler.registerJob({
    name: JobNames.DISTRIBUTION,
    cronExpression: CronExpressions.HOURLY,
    handler: distributionJobHandler,
    runOnStart: false, // Don't run immediately on startup to avoid unexpected distributions
  });

  // Push notification job - runs daily at 9 AM UTC
  // This sends check-in reminders for all active videos
  scheduler.registerJob({
    name: JobNames.PUSH_NOTIFICATIONS,
    cronExpression: CronExpressions.DAILY_9AM,
    handler: notificationJobHandler,
    runOnStart: false, // Don't run immediately on startup
  });

  // Expiration cleanup job - runs daily at midnight UTC
  // This expires and deletes old distributed videos (7 days after distribution)
  scheduler.registerJob({
    name: JobNames.EXPIRATION_CLEANUP,
    cronExpression: CronExpressions.DAILY_MIDNIGHT,
    handler: expirationJobHandler,
    runOnStart: false, // Don't run immediately on startup
  });

  logger.info('All background jobs registered');
}
