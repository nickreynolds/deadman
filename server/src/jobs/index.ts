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

import { getScheduler, CronExpressions } from '../scheduler';
import { distributionJobHandler } from './distribution.job';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'jobs' });

/**
 * Job names for reference
 */
export const JobNames = {
  DISTRIBUTION: 'distribution',
  // Future jobs:
  // PUSH_NOTIFICATIONS: 'push-notifications',
  // EXPIRATION_CLEANUP: 'expiration-cleanup',
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

  logger.info('All background jobs registered');
}
