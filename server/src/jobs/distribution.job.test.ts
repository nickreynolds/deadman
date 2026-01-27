/**
 * Distribution Job Unit Tests
 */

import { processDistribution, distributionJobHandler, DistributionJobResult } from './distribution.job';

// Mock dependencies
jest.mock('../db', () => ({
  prisma: {
    video: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

import { prisma } from '../db';

const mockFindMany = prisma.video.findMany as jest.Mock;
const mockUpdate = prisma.video.update as jest.Mock;

describe('Distribution Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('processDistribution', () => {
    it('should return empty result when no videos need distribution', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await processDistribution();

      expect(result).toEqual({
        processed: 0,
        distributed: 0,
        failed: 0,
        errors: [],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('should query videos with status ACTIVE and distribute_at <= now', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const testTime = new Date('2026-01-27T12:00:00Z');

      await processDistribution(testTime);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
          distributeAt: {
            lte: testTime,
          },
        },
        select: {
          id: true,
          title: true,
          userId: true,
          distributeAt: true,
        },
      });
    });

    it('should use current time when no time is provided', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const before = new Date();
      await processDistribution();
      const after = new Date();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const callArgs = mockFindMany.mock.calls[0][0];
      const queriedTime = callArgs.where.distributeAt.lte;

      expect(queriedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(queriedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should distribute a single video successfully', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date('2026-01-20T00:00:00Z'),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({
        ...mockVideo,
        status: 'DISTRIBUTED',
        distributedAt: new Date(),
        expiresAt: new Date(),
      });

      const result = await processDistribution(new Date('2026-01-27T12:00:00Z'));

      expect(result).toEqual({
        processed: 1,
        distributed: 1,
        failed: 0,
        errors: [],
      });

      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: {
          status: 'DISTRIBUTED',
          distributedAt: expect.any(Date),
          expiresAt: expect.any(Date),
        },
      });
    });

    it('should set expires_at to 7 days after distribution', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date('2026-01-20T00:00:00Z'),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await processDistribution(new Date('2026-01-27T12:00:00Z'));

      const updateCall = mockUpdate.mock.calls[0][0];
      const distributedAt = updateCall.data.distributedAt;
      const expiresAt = updateCall.data.expiresAt;

      // Expires at should be 7 days after distributed at
      const expectedExpires = new Date(distributedAt);
      expectedExpires.setDate(expectedExpires.getDate() + 7);

      expect(expiresAt.getTime()).toBe(expectedExpires.getTime());
    });

    it('should distribute multiple videos successfully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', distributeAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', distributeAt: new Date() },
        { id: 'video-3', title: 'Video 3', userId: 'user-1', distributeAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate.mockResolvedValue({});

      const result = await processDistribution();

      expect(result).toEqual({
        processed: 3,
        distributed: 3,
        failed: 0,
        errors: [],
      });
      expect(mockUpdate).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', distributeAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', distributeAt: new Date() },
        { id: 'video-3', title: 'Video 3', userId: 'user-1', distributeAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error('Database error')) // Second fails
        .mockResolvedValueOnce({}); // Third succeeds

      const result = await processDistribution();

      expect(result).toEqual({
        processed: 3,
        distributed: 2,
        failed: 1,
        errors: [{ videoId: 'video-2', error: 'Database error' }],
      });
    });

    it('should handle all failures gracefully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', distributeAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', distributeAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'));

      const result = await processDistribution();

      expect(result).toEqual({
        processed: 2,
        distributed: 0,
        failed: 2,
        errors: [
          { videoId: 'video-1', error: 'Error 1' },
          { videoId: 'video-2', error: 'Error 2' },
        ],
      });
    });

    it('should convert non-Error objects to strings', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockRejectedValueOnce('String error');

      const result = await processDistribution();

      expect(result.errors).toEqual([{ videoId: 'video-1', error: 'String error' }]);
    });

    it('should throw if findMany fails', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(processDistribution()).rejects.toThrow('Database connection failed');
    });

    it('should set status to DISTRIBUTED', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date('2026-01-20T00:00:00Z'),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await processDistribution();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'DISTRIBUTED',
          }),
        })
      );
    });

    it('should set distributedAt to current time', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date('2026-01-20T00:00:00Z'),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      const before = new Date();
      await processDistribution();
      const after = new Date();

      const updateCall = mockUpdate.mock.calls[0][0];
      const distributedAt = updateCall.data.distributedAt;

      expect(distributedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(distributedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('distributionJobHandler', () => {
    it('should call processDistribution', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await distributionJobHandler();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });

    it('should complete without throwing on success', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        distributeAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await expect(distributionJobHandler()).resolves.not.toThrow();
    });

    it('should complete without throwing on partial failure', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', distributeAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', distributeAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(distributionJobHandler()).resolves.not.toThrow();
    });

    it('should throw if processDistribution throws', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database error'));

      await expect(distributionJobHandler()).rejects.toThrow('Database error');
    });
  });
});
