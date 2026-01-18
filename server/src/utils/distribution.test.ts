// Tests for distribution timestamp calculation utilities

import { calculateDistributeAt, shouldDistribute, calculateExpiresAt } from './distribution';

describe('calculateDistributeAt', () => {
  describe('basic functionality', () => {
    it('should add the specified number of days to the current date', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2026-01-25T12:00:00.000Z');
    });

    it('should add 0 days correctly', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(0, startDate);

      expect(result.toISOString()).toBe('2026-01-18T12:00:00.000Z');
    });

    it('should add 1 day correctly', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(1, startDate);

      expect(result.toISOString()).toBe('2026-01-19T12:00:00.000Z');
    });

    it('should add 30 days correctly', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(30, startDate);

      expect(result.toISOString()).toBe('2026-02-17T12:00:00.000Z');
    });

    it('should use current date when fromDate is not provided', () => {
      const before = new Date();
      const result = calculateDistributeAt(7);
      const after = new Date();

      // The result should be approximately 7 days from now
      const expectedMinDate = new Date(before);
      expectedMinDate.setDate(expectedMinDate.getDate() + 7);

      const expectedMaxDate = new Date(after);
      expectedMaxDate.setDate(expectedMaxDate.getDate() + 7);

      expect(result.getTime()).toBeGreaterThanOrEqual(expectedMinDate.getTime() - 1000);
      expect(result.getTime()).toBeLessThanOrEqual(expectedMaxDate.getTime() + 1000);
    });
  });

  describe('edge cases', () => {
    it('should handle month boundaries correctly', () => {
      // January 30 + 7 days = February 6
      const startDate = new Date('2026-01-30T12:00:00Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2026-02-06T12:00:00.000Z');
    });

    it('should handle year boundaries correctly', () => {
      // December 28 + 7 days = January 4 of next year
      const startDate = new Date('2025-12-28T12:00:00Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2026-01-04T12:00:00.000Z');
    });

    it('should handle leap year correctly', () => {
      // February 27, 2028 (leap year) + 7 days = March 5
      const startDate = new Date('2028-02-27T12:00:00Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2028-03-05T12:00:00.000Z');
    });

    it('should preserve time component', () => {
      const startDate = new Date('2026-01-18T23:59:59.999Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2026-01-25T23:59:59.999Z');
    });

    it('should not mutate the input date', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const originalTime = startDate.getTime();
      calculateDistributeAt(7, startDate);

      expect(startDate.getTime()).toBe(originalTime);
    });
  });

  describe('typical user timer settings', () => {
    it('should handle 7-day timer (default)', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(7, startDate);

      expect(result.toISOString()).toBe('2026-01-25T12:00:00.000Z');
    });

    it('should handle 14-day timer', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(14, startDate);

      expect(result.toISOString()).toBe('2026-02-01T12:00:00.000Z');
    });

    it('should handle 3-day timer', () => {
      const startDate = new Date('2026-01-18T12:00:00Z');
      const result = calculateDistributeAt(3, startDate);

      expect(result.toISOString()).toBe('2026-01-21T12:00:00.000Z');
    });
  });
});

describe('shouldDistribute', () => {
  describe('basic functionality', () => {
    it('should return true when distribute_at is in the past', () => {
      const distributeAt = new Date('2026-01-10T12:00:00Z');
      const now = new Date('2026-01-18T12:00:00Z');

      expect(shouldDistribute(distributeAt, now)).toBe(true);
    });

    it('should return true when distribute_at equals current time', () => {
      const distributeAt = new Date('2026-01-18T12:00:00Z');
      const now = new Date('2026-01-18T12:00:00Z');

      expect(shouldDistribute(distributeAt, now)).toBe(true);
    });

    it('should return false when distribute_at is in the future', () => {
      const distributeAt = new Date('2026-01-25T12:00:00Z');
      const now = new Date('2026-01-18T12:00:00Z');

      expect(shouldDistribute(distributeAt, now)).toBe(false);
    });
  });

  describe('millisecond precision', () => {
    it('should return false when distribute_at is 1 millisecond in the future', () => {
      const distributeAt = new Date('2026-01-18T12:00:00.001Z');
      const now = new Date('2026-01-18T12:00:00.000Z');

      expect(shouldDistribute(distributeAt, now)).toBe(false);
    });

    it('should return true when distribute_at is 1 millisecond in the past', () => {
      const distributeAt = new Date('2026-01-18T11:59:59.999Z');
      const now = new Date('2026-01-18T12:00:00.000Z');

      expect(shouldDistribute(distributeAt, now)).toBe(true);
    });
  });

  describe('default now parameter', () => {
    it('should use current time when now is not provided', () => {
      const pastDate = new Date(Date.now() - 1000 * 60 * 60); // 1 hour ago
      expect(shouldDistribute(pastDate)).toBe(true);

      const futureDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      expect(shouldDistribute(futureDate)).toBe(false);
    });
  });
});

describe('calculateExpiresAt', () => {
  describe('basic functionality', () => {
    it('should add 7 days to the distribution date', () => {
      const distributedAt = new Date('2026-01-18T12:00:00Z');
      const result = calculateExpiresAt(distributedAt);

      expect(result.toISOString()).toBe('2026-01-25T12:00:00.000Z');
    });

    it('should preserve time component', () => {
      const distributedAt = new Date('2026-01-18T23:59:59.999Z');
      const result = calculateExpiresAt(distributedAt);

      expect(result.toISOString()).toBe('2026-01-25T23:59:59.999Z');
    });

    it('should not mutate the input date', () => {
      const distributedAt = new Date('2026-01-18T12:00:00Z');
      const originalTime = distributedAt.getTime();
      calculateExpiresAt(distributedAt);

      expect(distributedAt.getTime()).toBe(originalTime);
    });
  });

  describe('edge cases', () => {
    it('should handle month boundaries correctly', () => {
      const distributedAt = new Date('2026-01-30T12:00:00Z');
      const result = calculateExpiresAt(distributedAt);

      expect(result.toISOString()).toBe('2026-02-06T12:00:00.000Z');
    });

    it('should handle year boundaries correctly', () => {
      const distributedAt = new Date('2025-12-28T12:00:00Z');
      const result = calculateExpiresAt(distributedAt);

      expect(result.toISOString()).toBe('2026-01-04T12:00:00.000Z');
    });

    it('should handle leap year correctly', () => {
      // February 27, 2028 (leap year) + 7 days = March 5
      const distributedAt = new Date('2028-02-27T12:00:00Z');
      const result = calculateExpiresAt(distributedAt);

      expect(result.toISOString()).toBe('2028-03-05T12:00:00.000Z');
    });
  });
});

describe('integration: full distribution lifecycle', () => {
  it('should calculate correct timestamps for upload -> distribution -> expiration', () => {
    // Simulate a video upload on January 18, 2026
    const uploadTime = new Date('2026-01-18T12:00:00Z');
    const userTimerDays = 7;

    // Calculate distribution date (7 days after upload)
    const distributeAt = calculateDistributeAt(userTimerDays, uploadTime);
    expect(distributeAt.toISOString()).toBe('2026-01-25T12:00:00.000Z');

    // Before distribution date - should not distribute
    const beforeDistribution = new Date('2026-01-24T12:00:00Z');
    expect(shouldDistribute(distributeAt, beforeDistribution)).toBe(false);

    // On distribution date - should distribute
    const onDistribution = new Date('2026-01-25T12:00:00Z');
    expect(shouldDistribute(distributeAt, onDistribution)).toBe(true);

    // Calculate expiration date (7 days after distribution)
    const expiresAt = calculateExpiresAt(distributeAt);
    expect(expiresAt.toISOString()).toBe('2026-02-01T12:00:00.000Z');
  });
});
