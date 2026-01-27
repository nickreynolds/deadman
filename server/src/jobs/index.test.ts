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
  });

  describe('registerAllJobs', () => {
    it('should register the distribution job', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      expect(scheduler.hasJob(JobNames.DISTRIBUTION)).toBe(true);
    });

    it('should register distribution job with hourly cron expression', () => {
      registerAllJobs();

      const scheduler = getScheduler();
      const status = scheduler.getStatus();
      const distributionJob = status.jobs.find((j) => j.name === JobNames.DISTRIBUTION);

      expect(distributionJob).toBeDefined();
      expect(distributionJob?.cronExpression).toBe('0 * * * *'); // HOURLY
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

    it('should throw if called twice (duplicate job registration)', () => {
      registerAllJobs();

      expect(() => registerAllJobs()).toThrow('Job "distribution" is already registered');
    });
  });
});
