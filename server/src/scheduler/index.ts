/**
 * Job Scheduler Module
 *
 * Provides background job scheduling using node-cron.
 * Handles distribution checks, push notifications, and video expiration cleanup.
 */

import cron, { ScheduledTask } from 'node-cron';
import logger from '../logger';

const schedulerLogger = logger.child({ component: 'scheduler' });

/**
 * Job handler function type
 */
export type JobHandler = () => Promise<void>;

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
}

/**
 * Registered job with its scheduled task
 */
interface RegisteredJob {
  config: JobConfig;
  task: ScheduledTask;
  isRunning: boolean;
  lastRun?: Date;
  lastError?: Error;
  runCount: number;
  errorCount: number;
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
    lastError?: string;
    runCount: number;
    errorCount: number;
  }[];
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

    const registeredJob: RegisteredJob = {
      config,
      task,
      isRunning: false,
      runCount: 0,
      errorCount: 0,
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
   * @param name Job name to run
   * @returns Job execution result
   */
  async runJobNow(name: string): Promise<JobResult> {
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

    schedulerLogger.info({ job: name }, 'Starting job execution (manual)');

    try {
      await job.config.handler();

      const endTime = new Date();
      const result: JobResult = {
        name,
        success: true,
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
      };

      schedulerLogger.info(
        { job: name, durationMs: result.durationMs },
        'Job completed successfully (manual)'
      );

      return result;
    } catch (error) {
      const endTime = new Date();
      job.lastError = error instanceof Error ? error : new Error(String(error));
      job.errorCount++;

      const result: JobResult = {
        name,
        success: false,
        startTime,
        endTime,
        durationMs: endTime.getTime() - startTime.getTime(),
        error: job.lastError.message,
      };

      schedulerLogger.error(
        { job: name, err: job.lastError, durationMs: result.durationMs },
        'Job failed (manual)'
      );

      return result;
    } finally {
      job.isRunning = false;
    }
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
      lastError: job.lastError?.message,
      runCount: job.runCount,
      errorCount: job.errorCount,
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

      schedulerLogger.info({ job: config.name }, 'Starting job execution (scheduled)');

      config
        .handler()
        .then(() => {
          schedulerLogger.info({ job: config.name }, 'Job completed successfully (scheduled)');
        })
        .catch((error) => {
          job.lastError = error instanceof Error ? error : new Error(String(error));
          job.errorCount++;
          schedulerLogger.error(
            { job: config.name, err: job.lastError },
            'Job failed (scheduled)'
          );
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
