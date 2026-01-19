// Unit tests for Check-in Service

import { mockConfig } from '../test/mocks';

// Mock dependencies before imports
jest.mock('../config', () => ({
  getConfig: jest.fn(() => mockConfig),
}));

jest.mock('../logger', () => ({
  createChildLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock Prisma
const mockPrismaCreate = jest.fn();
const mockPrismaFindMany = jest.fn();
const mockPrismaUpdate = jest.fn();
const mockPrismaTransaction = jest.fn();

jest.mock('../db', () => ({
  prisma: {
    checkIn: {
      create: (...args: unknown[]) => mockPrismaCreate(...args),
      findMany: (...args: unknown[]) => mockPrismaFindMany(...args),
    },
    video: {
      update: (...args: unknown[]) => mockPrismaUpdate(...args),
    },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) => mockPrismaTransaction(fn),
  },
}));

// Mock utils
jest.mock('../utils', () => ({
  calculateDistributeAt: jest.fn((days: number) => {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return date;
  }),
}));

import {
  createCheckIn,
  getCheckInsByVideoId,
  performCheckIn,
  canPerformCheckIn,
  isValidCheckInAction,
} from './checkin.service';

describe('Check-in Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createCheckIn', () => {
    it('should create a check-in record', async () => {
      const mockCheckIn = {
        id: 'checkin-id-123',
        videoId: 'video-id-123',
        action: 'PREVENT_DISTRIBUTION',
        createdAt: new Date(),
      };
      mockPrismaCreate.mockResolvedValue(mockCheckIn);

      const result = await createCheckIn('video-id-123', 'PREVENT_DISTRIBUTION');

      expect(mockPrismaCreate).toHaveBeenCalledWith({
        data: {
          videoId: 'video-id-123',
          action: 'PREVENT_DISTRIBUTION',
        },
      });
      expect(result).toEqual(mockCheckIn);
    });

    it('should create check-in with ALLOW_DISTRIBUTION action', async () => {
      const mockCheckIn = {
        id: 'checkin-id-456',
        videoId: 'video-id-123',
        action: 'ALLOW_DISTRIBUTION',
        createdAt: new Date(),
      };
      mockPrismaCreate.mockResolvedValue(mockCheckIn);

      const result = await createCheckIn('video-id-123', 'ALLOW_DISTRIBUTION');

      expect(mockPrismaCreate).toHaveBeenCalledWith({
        data: {
          videoId: 'video-id-123',
          action: 'ALLOW_DISTRIBUTION',
        },
      });
      expect(result).toEqual(mockCheckIn);
    });
  });

  describe('getCheckInsByVideoId', () => {
    it('should return check-ins for a video ordered by createdAt desc', async () => {
      const mockCheckIns = [
        { id: 'checkin-2', videoId: 'video-id-123', action: 'PREVENT_DISTRIBUTION', createdAt: new Date() },
        { id: 'checkin-1', videoId: 'video-id-123', action: 'PREVENT_DISTRIBUTION', createdAt: new Date(Date.now() - 86400000) },
      ];
      mockPrismaFindMany.mockResolvedValue(mockCheckIns);

      const result = await getCheckInsByVideoId('video-id-123');

      expect(mockPrismaFindMany).toHaveBeenCalledWith({
        where: { videoId: 'video-id-123' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockCheckIns);
    });

    it('should return empty array when no check-ins exist', async () => {
      mockPrismaFindMany.mockResolvedValue([]);

      const result = await getCheckInsByVideoId('video-id-123');

      expect(result).toEqual([]);
    });
  });

  describe('performCheckIn', () => {
    it('should perform PREVENT_DISTRIBUTION check-in and extend distribution time', async () => {
      const mockCheckIn = {
        id: 'checkin-id-123',
        videoId: 'video-id-123',
        action: 'PREVENT_DISTRIBUTION',
        createdAt: new Date(),
      };
      const mockVideo = {
        id: 'video-id-123',
        userId: 'user-id-123',
        title: 'Test Video',
        status: 'ACTIVE',
        distributeAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days from now
      };

      // Mock the transaction to execute the callback
      mockPrismaTransaction.mockImplementation(async (fn) => {
        const tx = {
          checkIn: {
            create: jest.fn().mockResolvedValue(mockCheckIn),
          },
          video: {
            update: jest.fn().mockResolvedValue(mockVideo),
          },
        };
        return fn(tx);
      });

      const result = await performCheckIn('video-id-123', 'PREVENT_DISTRIBUTION', 14);

      expect(mockPrismaTransaction).toHaveBeenCalled();
      expect(result.checkIn).toEqual(mockCheckIn);
      expect(result.video).toEqual(mockVideo);
    });

    it('should perform ALLOW_DISTRIBUTION check-in without changing timer', async () => {
      const mockCheckIn = {
        id: 'checkin-id-456',
        videoId: 'video-id-123',
        action: 'ALLOW_DISTRIBUTION',
        createdAt: new Date(),
      };
      const mockVideo = {
        id: 'video-id-123',
        userId: 'user-id-123',
        title: 'Test Video',
        status: 'ACTIVE',
        distributeAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      };

      mockPrismaTransaction.mockImplementation(async (fn) => {
        const tx = {
          checkIn: {
            create: jest.fn().mockResolvedValue(mockCheckIn),
          },
          video: {
            update: jest.fn().mockResolvedValue(mockVideo),
          },
        };
        return fn(tx);
      });

      const result = await performCheckIn('video-id-123', 'ALLOW_DISTRIBUTION', 7);

      expect(result.checkIn.action).toBe('ALLOW_DISTRIBUTION');
      expect(result.video).toEqual(mockVideo);
    });

    it('should use provided timer days for distribution extension', async () => {
      const mockCheckIn = {
        id: 'checkin-id-789',
        videoId: 'video-id-123',
        action: 'PREVENT_DISTRIBUTION',
        createdAt: new Date(),
      };
      const mockVideo = {
        id: 'video-id-123',
        status: 'ACTIVE',
        distributeAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      mockPrismaTransaction.mockImplementation(async (fn) => {
        const tx = {
          checkIn: {
            create: jest.fn().mockResolvedValue(mockCheckIn),
          },
          video: {
            update: jest.fn().mockResolvedValue(mockVideo),
          },
        };
        return fn(tx);
      });

      const result = await performCheckIn('video-id-123', 'PREVENT_DISTRIBUTION', 30);

      expect(result.checkIn).toEqual(mockCheckIn);
    });
  });

  describe('canPerformCheckIn', () => {
    it('should return true for ACTIVE status', () => {
      expect(canPerformCheckIn('ACTIVE')).toBe(true);
    });

    it('should return false for PENDING status', () => {
      expect(canPerformCheckIn('PENDING')).toBe(false);
    });

    it('should return false for DISTRIBUTED status', () => {
      expect(canPerformCheckIn('DISTRIBUTED')).toBe(false);
    });

    it('should return false for EXPIRED status', () => {
      expect(canPerformCheckIn('EXPIRED')).toBe(false);
    });

    it('should return false for unknown status', () => {
      expect(canPerformCheckIn('UNKNOWN')).toBe(false);
    });
  });

  describe('isValidCheckInAction', () => {
    it('should return true for PREVENT_DISTRIBUTION', () => {
      expect(isValidCheckInAction('PREVENT_DISTRIBUTION')).toBe(true);
    });

    it('should return true for ALLOW_DISTRIBUTION', () => {
      expect(isValidCheckInAction('ALLOW_DISTRIBUTION')).toBe(true);
    });

    it('should return false for invalid action', () => {
      expect(isValidCheckInAction('INVALID_ACTION')).toBe(false);
    });

    it('should return false for empty string', () => {
      expect(isValidCheckInAction('')).toBe(false);
    });

    it('should return false for lowercase action', () => {
      expect(isValidCheckInAction('prevent_distribution')).toBe(false);
    });
  });
});
