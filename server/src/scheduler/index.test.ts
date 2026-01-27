/**
 * Job Scheduler Tests
 */

// Mock logger - must be before imports due to Jest hoisting
jest.mock('../logger', () => {
  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: {
      child: jest.fn(() => mockChildLogger),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
  };
});

// Mock node-cron
jest.mock('node-cron', () => ({
  validate: jest.fn((expression: string) => {
    // Simple validation - accept standard cron expressions
    const parts = expression.split(' ');
    return parts.length === 5 || parts.length === 6;
  }),
  schedule: jest.fn((_expression: string, _handler: () => void, _options?: object) => ({
    start: jest.fn(),
    stop: jest.fn(),
  })),
}));

import {
  getScheduler,
  initializeScheduler,
  shutdownScheduler,
  resetScheduler,
  CronExpressions,
  JobConfig,
  JobHandler,
} from './index';

describe('JobScheduler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetScheduler();
  });

  afterEach(() => {
    resetScheduler();
  });

  describe('getScheduler', () => {
    it('should return a scheduler instance', () => {
      const scheduler = getScheduler();
      expect(scheduler).toBeDefined();
    });

    it('should return the same instance on subsequent calls', () => {
      const scheduler1 = getScheduler();
      const scheduler2 = getScheduler();
      expect(scheduler1).toBe(scheduler2);
    });
  });

  describe('initializeScheduler', () => {
    it('should return a scheduler instance', () => {
      const scheduler = initializeScheduler();
      expect(scheduler).toBeDefined();
    });
  });

  describe('shutdownScheduler', () => {
    it('should stop and clear the scheduler', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);
      scheduler.registerJob({
        name: 'test-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });
      scheduler.start();

      shutdownScheduler();

      // After shutdown, getting scheduler should create a new instance
      const newScheduler = getScheduler();
      expect(newScheduler.hasJob('test-job')).toBe(false);
    });

    it('should handle shutdown when scheduler is not initialized', () => {
      // Should not throw
      expect(() => shutdownScheduler()).not.toThrow();
    });
  });

  describe('resetScheduler', () => {
    it('should clear and reset the scheduler instance', () => {
      const scheduler1 = getScheduler();
      scheduler1.registerJob({
        name: 'test-job',
        cronExpression: CronExpressions.HOURLY,
        handler: jest.fn().mockResolvedValue(undefined),
      });

      resetScheduler();

      const scheduler2 = getScheduler();
      expect(scheduler2).not.toBe(scheduler1);
      expect(scheduler2.hasJob('test-job')).toBe(false);
    });
  });

  describe('registerJob', () => {
    it('should register a job successfully', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'test-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      expect(scheduler.hasJob('test-job')).toBe(true);
    });

    it('should throw error for duplicate job names', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'duplicate-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      expect(() => {
        scheduler.registerJob({
          name: 'duplicate-job',
          cronExpression: CronExpressions.DAILY_MIDNIGHT,
          handler,
        });
      }).toThrow('Job "duplicate-job" is already registered');
    });

    it('should throw error for invalid cron expression', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      // Mock validate to return false for this test
      const cron = require('node-cron');
      cron.validate.mockReturnValueOnce(false);

      expect(() => {
        scheduler.registerJob({
          name: 'invalid-cron',
          cronExpression: 'invalid',
          handler,
        });
      }).toThrow('Invalid cron expression for job "invalid-cron": invalid');
    });

    it('should accept jobs with runOnStart option', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'run-on-start-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
        runOnStart: true,
      });

      expect(scheduler.hasJob('run-on-start-job')).toBe(true);
    });

    it('should accept jobs with timezone option', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'timezone-job',
        cronExpression: CronExpressions.DAILY_9AM,
        handler,
        timezone: 'America/New_York',
      });

      expect(scheduler.hasJob('timezone-job')).toBe(true);
    });
  });

  describe('unregisterJob', () => {
    it('should unregister an existing job', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'to-unregister',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      expect(scheduler.hasJob('to-unregister')).toBe(true);

      const result = scheduler.unregisterJob('to-unregister');

      expect(result).toBe(true);
      expect(scheduler.hasJob('to-unregister')).toBe(false);
    });

    it('should return false for non-existent job', () => {
      const scheduler = getScheduler();

      const result = scheduler.unregisterJob('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('start', () => {
    it('should start all registered jobs', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'job1',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });
      scheduler.registerJob({
        name: 'job2',
        cronExpression: CronExpressions.DAILY_MIDNIGHT,
        handler,
      });

      scheduler.start();

      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });

    it('should run runOnStart jobs immediately', async () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'immediate-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
        runOnStart: true,
      });

      scheduler.start();

      // Wait for async runJobNow to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(handler).toHaveBeenCalled();
    });

    it('should not start if already running', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'test-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      scheduler.start();
      scheduler.start(); // Second call should be ignored

      const status = scheduler.getStatus();
      expect(status.isRunning).toBe(true);
    });
  });

  describe('stop', () => {
    it('should stop all running jobs', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'job1',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      scheduler.start();
      expect(scheduler.getStatus().isRunning).toBe(true);

      scheduler.stop();
      expect(scheduler.getStatus().isRunning).toBe(false);
    });

    it('should handle stop when not started', () => {
      const scheduler = getScheduler();

      // Should not throw
      expect(() => scheduler.stop()).not.toThrow();
    });
  });

  describe('runJobNow', () => {
    it('should run a job immediately', async () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'manual-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      const result = await scheduler.runJobNow('manual-job');

      expect(result.success).toBe(true);
      expect(result.name).toBe('manual-job');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(handler).toHaveBeenCalled();
    });

    it('should throw error for non-existent job', async () => {
      const scheduler = getScheduler();

      await expect(scheduler.runJobNow('non-existent')).rejects.toThrow(
        'Job "non-existent" not found'
      );
    });

    it('should throw error if job is already running', async () => {
      const scheduler = getScheduler();
      let resolveHandler: () => void;
      const handlerPromise = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });
      const handler: JobHandler = jest.fn().mockImplementation(() => handlerPromise);

      scheduler.registerJob({
        name: 'long-running',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      // Start the first execution
      const firstRun = scheduler.runJobNow('long-running');

      // Try to start a second execution
      await expect(scheduler.runJobNow('long-running')).rejects.toThrow(
        'Job "long-running" is already running'
      );

      // Clean up
      resolveHandler!();
      await firstRun;
    });

    it('should return error result on handler failure', async () => {
      const scheduler = getScheduler();
      const error = new Error('Handler failed');
      const handler: JobHandler = jest.fn().mockRejectedValue(error);

      scheduler.registerJob({
        name: 'failing-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      const result = await scheduler.runJobNow('failing-job');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Handler failed');
    });

    it('should update run count and error count', async () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('fail'));

      scheduler.registerJob({
        name: 'count-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      await scheduler.runJobNow('count-job');
      const status1 = scheduler.getStatus();
      const job1 = status1.jobs.find((j) => j.name === 'count-job');
      expect(job1?.runCount).toBe(1);
      expect(job1?.errorCount).toBe(0);

      await scheduler.runJobNow('count-job');
      const status2 = scheduler.getStatus();
      const job2 = status2.jobs.find((j) => j.name === 'count-job');
      expect(job2?.runCount).toBe(2);
      expect(job2?.errorCount).toBe(1);
    });

    it('should update lastRun timestamp', async () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'timestamp-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      const before = new Date();
      await scheduler.runJobNow('timestamp-job');
      const after = new Date();

      const status = scheduler.getStatus();
      const job = status.jobs.find((j) => j.name === 'timestamp-job');

      expect(job?.lastRun).toBeDefined();
      expect(job?.lastRun!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(job?.lastRun!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('getStatus', () => {
    it('should return scheduler status with no jobs', () => {
      const scheduler = getScheduler();

      const status = scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.jobs).toEqual([]);
    });

    it('should return scheduler status with registered jobs', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'status-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      const status = scheduler.getStatus();

      expect(status.jobs).toHaveLength(1);
      const job = status.jobs[0]!;
      expect(job.name).toBe('status-job');
      expect(job.cronExpression).toBe(CronExpressions.HOURLY);
      expect(job.isRunning).toBe(false);
      expect(job.runCount).toBe(0);
      expect(job.errorCount).toBe(0);
    });

    it('should include lastError in status', async () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockRejectedValue(new Error('Test error'));

      scheduler.registerJob({
        name: 'error-status-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      await scheduler.runJobNow('error-status-job');

      const status = scheduler.getStatus();
      const job = status.jobs.find((j) => j.name === 'error-status-job');

      expect(job?.lastError).toBe('Test error');
    });
  });

  describe('hasJob', () => {
    it('should return true for registered job', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({
        name: 'exists',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      expect(scheduler.hasJob('exists')).toBe(true);
    });

    it('should return false for non-registered job', () => {
      const scheduler = getScheduler();

      expect(scheduler.hasJob('does-not-exist')).toBe(false);
    });
  });

  describe('getJobNames', () => {
    it('should return empty array when no jobs registered', () => {
      const scheduler = getScheduler();

      expect(scheduler.getJobNames()).toEqual([]);
    });

    it('should return all registered job names', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({ name: 'job1', cronExpression: CronExpressions.HOURLY, handler });
      scheduler.registerJob({ name: 'job2', cronExpression: CronExpressions.DAILY_MIDNIGHT, handler });
      scheduler.registerJob({ name: 'job3', cronExpression: CronExpressions.EVERY_MINUTE, handler });

      const names = scheduler.getJobNames();

      expect(names).toContain('job1');
      expect(names).toContain('job2');
      expect(names).toContain('job3');
      expect(names).toHaveLength(3);
    });
  });

  describe('clear', () => {
    it('should remove all jobs', () => {
      const scheduler = getScheduler();
      const handler: JobHandler = jest.fn().mockResolvedValue(undefined);

      scheduler.registerJob({ name: 'job1', cronExpression: CronExpressions.HOURLY, handler });
      scheduler.registerJob({ name: 'job2', cronExpression: CronExpressions.DAILY_MIDNIGHT, handler });

      scheduler.clear();

      expect(scheduler.getJobNames()).toEqual([]);
      expect(scheduler.getStatus().isRunning).toBe(false);
    });
  });

  describe('CronExpressions', () => {
    it('should have valid cron expressions', () => {
      expect(CronExpressions.EVERY_MINUTE).toBe('* * * * *');
      expect(CronExpressions.EVERY_5_MINUTES).toBe('*/5 * * * *');
      expect(CronExpressions.EVERY_15_MINUTES).toBe('*/15 * * * *');
      expect(CronExpressions.EVERY_30_MINUTES).toBe('*/30 * * * *');
      expect(CronExpressions.HOURLY).toBe('0 * * * *');
      expect(CronExpressions.DAILY_MIDNIGHT).toBe('0 0 * * *');
      expect(CronExpressions.DAILY_9AM).toBe('0 9 * * *');
      expect(CronExpressions.DAILY_NOON).toBe('0 12 * * *');
    });
  });

  describe('concurrent execution prevention', () => {
    it('should skip execution if job is already running (scheduled)', async () => {
      const scheduler = getScheduler();
      let resolveHandler: () => void;
      const handlerPromise = new Promise<void>((resolve) => {
        resolveHandler = resolve;
      });
      const handler: JobHandler = jest.fn().mockImplementation(() => handlerPromise);

      scheduler.registerJob({
        name: 'concurrent-job',
        cronExpression: CronExpressions.HOURLY,
        handler,
      });

      // Start first execution via runJobNow
      const firstRun = scheduler.runJobNow('concurrent-job');

      // Verify job is running
      expect(scheduler.getStatus().jobs[0]!.isRunning).toBe(true);

      // Clean up
      resolveHandler!();
      await firstRun;

      // Verify job is no longer running
      expect(scheduler.getStatus().jobs[0]!.isRunning).toBe(false);
    });
  });
});
