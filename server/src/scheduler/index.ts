/**
 * Job Scheduler Module
 *
 * Provides background job scheduling using node-cron.
 * Handles distribution checks, push notifications, and video expiration cleanup.
 * Includes retry logic for transient failures and alerting for persistent failures.
 */

import cron, { ScheduledTask } from 'node-cron';
import logger from '../logger';
import { alertJobFailure, alertJobRecovered } from '../services/alert.service';

const schedulerLogger = logger.child({ component: 'scheduler' });

/**
 * Job handler function type
 */
export type JobHandler = () => Promise<void>;

/**
 * Retry configuration for jobs
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds between retries (default: 1000) */
  baseDelayMs: number;
  /** Whether to use exponential backoff (default: true) */
  exponentialBackoff: boolean;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs: number;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  exponentialBackoff: true,
  maxDelayMs: 30000,
};

/**
 * Job configuration
 */
export interface JobConfig {
  /** Unique job name for identification and logging */
  name: string;
  /** Cron expression (e.g., '0 * * * *' for hourly) */
  cronExpression: string;
  /** Job handler function */
  handler: JobHandler;
  /** Whether to run immediately on scheduler start */
  runOnStart?: boolean;
  /** Timezone for cron schedule (default: UTC) */
  timezone?: string;
  /** Retry configuration (default: 3 retries with exponential backoff) */
  retry?: Partial<RetryConfig>;
  /** Whether to send alerts on job failures (default: true) */
  alertOnFailure?: boolean;
}

/**
 * Registered job with its scheduled task
 */
interface RegisteredJob {
  config: JobConfig;
  task: ScheduledTask;
  isRunning: boolean;
  lastRun?: Date;
  lastSuccessfulRun?: Date;
  lastError?: Error;
  runCount: number;
  errorCount: number;
  consecutiveFailures: number;
  retryConfig: RetryConfig;
}

/**
 * Job execution result
 */
export interface JobResult {
  name: string;
  success: boolean;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  error?: string;
}

/**
 * Scheduler status
 */
export interface SchedulerStatus {
  isRunning: boolean;
  jobs: {
    name: string;
    cronExpression: string;
    isRunning: boolean;
    lastRun?: Date;
    lastSuccessfulRun?: Date;
    lastError?: string;
    runCount: number;
    errorCount: number;
    consecutiveFailures: number;
  }[];
}

/**
 * Calculate delay for retry attempt with optional exponential backoff
 */
function calculateRetryDelay(attempt: number, config: RetryConfig): number {
  if (config.exponentialBackoff) {
    // Exponential backoff: baseDelay * 2^attempt
    const delay = config.baseDelayMs * Math.pow(2, attempt);
    return Math.min(delay, config.maxDelayMs);
  }
  return config.baseDelayMs;
}

/**
 * Sleep for a specified number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determine if an error is transient (retryable)
 * Connection errors, timeouts, and temporary unavailability are considered transient
 */
function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  const transientPatterns = [
    'timeout',
    'timed out',
    'connection refused',
    'connection reset',
    'econnrefused',
    'econnreset',
    'etimedout',
    'socket hang up',
    'temporarily unavailable',
    'service unavailable',
    'too many connections',
    'deadlock',
    'lock wait timeout',
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

/**
 * Job Scheduler class
 * Manages background job scheduling and execution
 */
class JobScheduler {
  private jobs: Map<string, RegisteredJob> = new Map();
  private isStarted = false;

  /**
   * Register a job with the scheduler
   * @param config Job configuration
   * @throws Error if job name already registered or cron expression is invalid
   */
  registerJob(config: JobConfig): void {
    if (this.jobs.has(config.name)) {
      throw new Error(`Job "${config.name}" is already registered`);
    }

    if (!cron.validate(config.cronExpression)) {
      throw new Error(`Invalid cron expression for job "${config.name}": ${config.cronExpression}`);
    }

    const wrappedHandler = this.createWrappedHandler(config);

    const task = cron.schedule(config.cronExpression, wrappedHandler, {
      scheduled: false, // Don't start until explicitly started
      timezone: config.timezone || 'UTC',
    });

    // Merge retry config with defaults
    const retryConfig: RetryConfig = {
      ...DEFAULT_RETRY_CONFIG,
      ...config.retry,
    };

    const registeredJob: RegisteredJob = {
      config,
      task,
      isRunning: false,
      runCount: 0,
      errorCount: 0,
      consecutiveFailures: 0,
      retryConfig,
    };

    this.jobs.set(config.name, registeredJob);
    schedulerLogger.info(
      { job: config.name, cron: config.cronExpression, runOnStart: config.runOnStart },
      'Job registered'
    );
  }

  /**
   * Unregister a job from the scheduler
   * @param name Job name to unregister
   * @returns true if job was found and unregistered, false otherwise
   */
  unregisterJob(name: string): boolean {
    const job = this.jobs.get(name);
    if (!job) {
      return false;
    }

    job.task.stop();
    this.jobs.delete(name);
    schedulerLogger.info({ job: name }, 'Job unregistered');
    return true;
  }

  /**
   * Start the scheduler and all registered jobs
   */
  start(): void {
    if (this.isStarted) {
      schedulerLogger.warn('Scheduler is already running');
      return;
    }

    schedulerLogger.info({ jobCount: this.jobs.size }, 'Starting job scheduler');

    for (const [name, job] of this.jobs) {
      job.task.start();
      schedulerLogger.debug({ job: name }, 'Job started');

      // Run immediately if configured
      if (job.config.runOnStart) {
        schedulerLogger.info({ job: name }, 'Running job on start');
        this.runJobNow(name).catch((error) => {
          schedulerLogger.error({ job: name, err: error }, 'Error running job on start');
        });
      }
    }

    this.isStarted = true;
    schedulerLogger.info('Job scheduler started');
  }

  /**
   * Stop the scheduler and all jobs
   */
  stop(): void {
    if (!this.isStarted) {
      schedulerLogger.warn('Scheduler is not running');
      return;
    }

    schedulerLogger.info('Stopping job scheduler');

    for (const [name, job] of this.jobs) {
      job.task.stop();
      schedulerLogger.debug({ job: name }, 'Job stopped');
    }

    this.isStarted = false;
    schedulerLogger.info('Job scheduler stopped');
  }

  /**
   * Run a specific job immediately (outside of schedule)
   * Includes retry logic for transient failures
   * @param name Job name to run
   * @param skipRetry If true, skip retry logic (used for scheduled runs that manage their own retries)
   * @returns Job execution result
   */
  async runJobNow(name: string, skipRetry = false): Promise<JobResult> {
    const job = this.jobs.get(name);
    if (!job) {
      throw new Error(`Job "${name}" not found`);
    }

    if (job.isRunning) {
      throw new Error(`Job "${name}" is already running`);
    }

    const startTime = new Date();
    job.isRunning = true;
    job.lastRun = startTime;
    job.runCount++;

    const previousConsecutiveFailures = job.consecutiveFailures;

    schedulerLogger.info({ job: name }, 'Starting job execution (manual)');

    try {
      await this.executeWithRetry(job, skipRetry);

      const endTime = new Date();
      const result: JobResult = {
        name,
        success: true,
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
      };

      // Reset consecutive failures on success
      job.consecutiveFailures = 0;
      job.lastSuccessfulRun = endTime;

      // Send recovery alert if there were previous failures
      if (previousConsecutiveFailures > 0) {
        alertJobRecovered(name, previousConsecutiveFailures).catch((err) => {
          schedulerLogger.error({ err }, 'Failed to send job recovery alert');
        });
      }

      schedulerLogger.info(
        { job: name, durationMs: result.durationMs },
        'Job completed successfully (manual)'
      );

      return result;
    } catch (error) {
      const endTime = new Date();
      job.lastError = error instanceof Error ? error : new Error(String(error));
      job.errorCount++;
      job.consecutiveFailures++;

      const result: JobResult = {
        name,
        success: false,
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
        error: job.lastError.message,
      };

      schedulerLogger.error(
        { job: name, err: job.lastError, durationMs: result.durationMs, consecutiveFailures: job.consecutiveFailures },
        'Job failed (manual)'
      );

      // Send failure alert if configured
      if (job.config.alertOnFailure !== false) {
        alertJobFailure({
          jobName: name,
          error: job.lastError,
          runCount: job.runCount,
          errorCount: job.errorCount,
          consecutiveFailures: job.consecutiveFailures,
          lastSuccessfulRun: job.lastSuccessfulRun,
        }).catch((err) => {
          schedulerLogger.error({ err }, 'Failed to send job failure alert');
        });
      }

      return result;
    } finally {
      job.isRunning = false;
    }
  }

  /**
   * Execute job handler with retry logic
   */
  private async executeWithRetry(job: RegisteredJob, skipRetry: boolean): Promise<void> {
    const { retryConfig, config } = job;
    let lastError: Error | undefined;

    const maxAttempts = skipRetry ? 1 : retryConfig.maxRetries + 1;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await config.handler();
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Only retry on transient errors
        if (attempt < maxAttempts - 1 && isTransientError(error)) {
          const delay = calculateRetryDelay(attempt, retryConfig);
          schedulerLogger.warn(
            { job: config.name, attempt: attempt + 1, maxAttempts, delayMs: delay, err: lastError },
            'Job failed with transient error, retrying'
          );
          await sleep(delay);
        } else if (attempt < maxAttempts - 1) {
          // Non-transient error, don't retry
          schedulerLogger.debug(
            { job: config.name, err: lastError },
            'Job failed with non-transient error, not retrying'
          );
          break;
        }
      }
    }

    // If we get here, all attempts failed
    throw lastError;
  }

  /**
   * Get current scheduler status
   */
  getStatus(): SchedulerStatus {
    const jobs = Array.from(this.jobs.values()).map((job) => ({
      name: job.config.name,
      cronExpression: job.config.cronExpression,
      isRunning: job.isRunning,
      lastRun: job.lastRun,
      lastSuccessfulRun: job.lastSuccessfulRun,
      lastError: job.lastError?.message,
      runCount: job.runCount,
      errorCount: job.errorCount,
      consecutiveFailures: job.consecutiveFailures,
    }));

    return {
      isRunning: this.isStarted,
      jobs,
    };
  }

  /**
   * Check if a job is registered
   */
  hasJob(name: string): boolean {
    return this.jobs.has(name);
  }

  /**
   * Get job names
   */
  getJobNames(): string[] {
    return Array.from(this.jobs.keys());
  }

  /**
   * Clear all jobs (useful for testing)
   */
  clear(): void {
    this.stop();
    this.jobs.clear();
    schedulerLogger.debug('All jobs cleared');
  }

  /**
   * Create a wrapped handler that tracks execution state and handles errors
   */
  private createWrappedHandler(config: JobConfig): () => void {
    return () => {
      const job = this.jobs.get(config.name);
      if (!job) {
        return;
      }

      // Prevent concurrent execution of the same job
      if (job.isRunning) {
        schedulerLogger.warn(
          { job: config.name },
          'Job is still running from previous execution, skipping'
        );
        return;
      }

      job.isRunning = true;
      job.lastRun = new Date();
      job.runCount++;

      const previousConsecutiveFailures = job.consecutiveFailures;

      schedulerLogger.info({ job: config.name }, 'Starting job execution (scheduled)');

      this.executeWithRetry(job, false)
        .then(() => {
          // Reset consecutive failures on success
          job.consecutiveFailures = 0;
          job.lastSuccessfulRun = new Date();

          // Send recovery alert if there were previous failures
          if (previousConsecutiveFailures > 0) {
            alertJobRecovered(config.name, previousConsecutiveFailures).catch((err) => {
              schedulerLogger.error({ err }, 'Failed to send job recovery alert');
            });
          }

          schedulerLogger.info({ job: config.name }, 'Job completed successfully (scheduled)');
        })
        .catch((error) => {
          job.lastError = error instanceof Error ? error : new Error(String(error));
          job.errorCount++;
          job.consecutiveFailures++;

          schedulerLogger.error(
            { job: config.name, err: job.lastError, consecutiveFailures: job.consecutiveFailures },
            'Job failed (scheduled)'
          );

          // Send failure alert if configured
          if (config.alertOnFailure !== false) {
            alertJobFailure({
              jobName: config.name,
              error: job.lastError,
              runCount: job.runCount,
              errorCount: job.errorCount,
              consecutiveFailures: job.consecutiveFailures,
              lastSuccessfulRun: job.lastSuccessfulRun,
            }).catch((err) => {
              schedulerLogger.error({ err }, 'Failed to send job failure alert');
            });
          }
        })
        .finally(() => {
          job.isRunning = false;
        });
    };
  }
}

// Singleton instance
let schedulerInstance: JobScheduler | null = null;

/**
 * Get the scheduler instance (creates if not exists)
 */
export function getScheduler(): JobScheduler {
  if (!schedulerInstance) {
    schedulerInstance = new JobScheduler();
  }
  return schedulerInstance;
}

/**
 * Initialize the scheduler with default jobs
 * This should be called during application startup
 */
export function initializeScheduler(): JobScheduler {
  const scheduler = getScheduler();
  schedulerLogger.info('Scheduler initialized');
  return scheduler;
}

/**
 * Stop and clear the scheduler
 * This should be called during application shutdown
 */
export function shutdownScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance.clear();
    schedulerInstance = null;
    schedulerLogger.info('Scheduler shut down');
  }
}

/**
 * Reset the scheduler instance (for testing)
 */
export function resetScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.clear();
    schedulerInstance = null;
  }
}

// Export helper functions for testing
export { calculateRetryDelay, isTransientError };

// Common cron expressions for reference
export const CronExpressions = {
  /** Every minute */
  EVERY_MINUTE: '* * * * *',
  /** Every 5 minutes */
  EVERY_5_MINUTES: '*/5 * * * *',
  /** Every 15 minutes */
  EVERY_15_MINUTES: '*/15 * * * *',
  /** Every 30 minutes */
  EVERY_30_MINUTES: '*/30 * * * *',
  /** Every hour at minute 0 */
  HOURLY: '0 * * * *',
  /** Every day at midnight UTC */
  DAILY_MIDNIGHT: '0 0 * * *',
  /** Every day at 9am UTC */
  DAILY_9AM: '0 9 * * *',
  /** Every day at noon UTC */
  DAILY_NOON: '0 12 * * *',
} as const;
