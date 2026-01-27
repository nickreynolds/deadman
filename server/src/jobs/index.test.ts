/**
 * Jobs Module Unit Tests
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
    createChildLogger: jest.fn(() => mockChildLogger),
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

// Mock the distribution job handler
jest.mock('./distribution.job', () => ({
  distributionJobHandler: jest.fn(),
}));

// Mock the notification job handler
jest.mock('./notification.job', () => ({
  notificationJobHandler: jest.fn(),
}));

// Mock the expiration job handler
jest.mock('./expiration.job', () => ({
  expirationJobHandler: jest.fn(),
}));

import { registerAllJobs, JobNames } from './index';
import { getScheduler, resetScheduler } from '../scheduler';

describe('Jobs Module', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetScheduler();
  });

  afterEach(() => {
    resetScheduler();
  });

  describe('JobNames', () => {
    it('should export DISTRIBUTION job name', () => {
      expect(JobNames.DISTRIBUTION).toBe('distribution');
    });

    it('should export PUSH_NOTIFICATIONS job name', () => {
      expect(JobNames.PUSH_NOTIFICATIONS).toBe('push-notifications');
    });

    it('should export EXPIRATION_CLEANUP job name', () => {
      expect(JobNames.EXPIRATION_CLEANUP).toBe('expiration-cleanup');
    });
  });

  describe('registerAllJobs', () => {
    it('should register the distribution job', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      expect(scheduler.hasJob(JobNames.DISTRIBUTION)).toBe(true);
    });

    it('should register the push notifications job', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      expect(scheduler.hasJob(JobNames.PUSH_NOTIFICATIONS)).toBe(true);
    });

    it('should register the expiration cleanup job', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      expect(scheduler.hasJob(JobNames.EXPIRATION_CLEANUP)).toBe(true);
    });

    it('should register distribution job with hourly cron expression', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const distributionJob = status.jobs.find((j) => j.name === JobNames.DISTRIBUTION);

      expect(distributionJob).toBeDefined();
      expect(distributionJob?.cronExpression).toBe('0 * * * *'); // HOURLY
    });

    it('should register push notifications job with daily 9am cron expression', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const notificationJob = status.jobs.find((j) => j.name === JobNames.PUSH_NOTIFICATIONS);

      expect(notificationJob).toBeDefined();
      expect(notificationJob?.cronExpression).toBe('0 9 * * *'); // DAILY_9AM
    });

    it('should register expiration cleanup job with daily midnight cron expression', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const expirationJob = status.jobs.find((j) => j.name === JobNames.EXPIRATION_CLEANUP);

      expect(expirationJob).toBeDefined();
      expect(expirationJob?.cronExpression).toBe('0 0 * * *'); // DAILY_MIDNIGHT
    });

    it('should not run distribution job on start', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const distributionJob = status.jobs.find((j) => j.name === JobNames.DISTRIBUTION);

      // Job should be registered but not running
      expect(distributionJob?.isRunning).toBe(false);
      expect(distributionJob?.runCount).toBe(0);
    });

    it('should not run push notifications job on start', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const notificationJob = status.jobs.find((j) => j.name === JobNames.PUSH_NOTIFICATIONS);

      // Job should be registered but not running
      expect(notificationJob?.isRunning).toBe(false);
      expect(notificationJob?.runCount).toBe(0);
    });

    it('should not run expiration cleanup job on start', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const expirationJob = status.jobs.find((j) => j.name === JobNames.EXPIRATION_CLEANUP);

      // Job should be registered but not running
      expect(expirationJob?.isRunning).toBe(false);
      expect(expirationJob?.runCount).toBe(0);
    });

    it('should throw if called twice (duplicate job registration)', () => {
      registerAllJobs();

      expect(() => registerAllJobs()).toThrow('Job "distribution" is already registered');
    });

    it('should register all three jobs', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const jobNames = scheduler.getJobNames();

      expect(jobNames).toContain(JobNames.DISTRIBUTION);
      expect(jobNames).toContain(JobNames.PUSH_NOTIFICATIONS);
      expect(jobNames).toContain(JobNames.EXPIRATION_CLEANUP);
      expect(jobNames).toHaveLength(3);
    });
  });
});
