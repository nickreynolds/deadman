/**
 * Expiration Cleanup Job Unit Tests
 */

import { processExpiration, expirationJobHandler, ExpirationJobResult } from './expiration.job';

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

jest.mock('../services/cleanup.service', () => ({
  cleanupFile: jest.fn(),
}));

jest.mock('../services/video.service', () => ({
  updateUserStorageUsage: jest.fn(),
}));

jest.mock('../storage', () => ({
  getStorageConfig: jest.fn(),
}));

import { prisma } from '../db';
import { cleanupFile } from '../services/cleanup.service';
import { updateUserStorageUsage } from '../services/video.service';
import { getStorageConfig } from '../storage';

const mockFindMany = prisma.video.findMany as jest.Mock;
const mockUpdate = prisma.video.update as jest.Mock;
const mockCleanupFile = cleanupFile as jest.Mock;
const mockUpdateUserStorageUsage = updateUserStorageUsage as jest.Mock;
const mockGetStorageConfig = getStorageConfig as jest.Mock;

describe('Expiration Cleanup Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockGetStorageConfig.mockReturnValue({
      rootPath: '/test/storage',
      maxFileSizeBytes: 500 * 1024 * 1024,
    });
    mockCleanupFile.mockResolvedValue(true);
    mockUpdateUserStorageUsage.mockResolvedValue(undefined);
  });

  describe('processExpiration', () => {
    it('should return empty result when no videos are expired', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await processExpiration();

      expect(result).toEqual({
        processed: 0,
        expired: 0,
        failed: 0,
        bytesFreed: BigInt(0),
        errors: [],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdate).not.toHaveBeenCalled();
      expect(mockCleanupFile).not.toHaveBeenCalled();
    });

    it('should query videos with status DISTRIBUTED and expires_at <= now', async () => {
      mockFindMany.mockResolvedValueOnce([]);
      const testTime = new Date('2026-01-27T12:00:00Z');

      await processExpiration(testTime);

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          status: 'DISTRIBUTED',
          expiresAt: {
            lte: testTime,
          },
        },
        select: {
          id: true,
          title: true,
          userId: true,
          filePath: true,
          fileSizeBytes: true,
          expiresAt: true,
        },
      });
    });

    it('should use current time when no time is provided', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const before = new Date();
      await processExpiration();
      const after = new Date();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const callArgs = mockFindMany.mock.calls[0][0];
      const queriedTime = callArgs.where.expiresAt.lte;

      expect(queriedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(queriedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    it('should expire a single video successfully', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1024 * 1024), // 1 MB
        expiresAt: new Date('2026-01-20T00:00:00Z'),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({
        ...mockVideo,
        status: 'EXPIRED',
      });

      const result = await processExpiration(new Date('2026-01-27T12:00:00Z'));

      expect(result).toEqual({
        processed: 1,
        expired: 1,
        failed: 0,
        bytesFreed: BigInt(1024 * 1024),
        errors: [],
      });

      expect(mockCleanupFile).toHaveBeenCalledWith('/test/storage/user-1/video-1.mp4');
      expect(mockUpdate).toHaveBeenCalledWith({
        where: { id: 'video-1' },
        data: {
          status: 'EXPIRED',
        },
      });
      expect(mockUpdateUserStorageUsage).toHaveBeenCalledWith('user-1', BigInt(-1024 * 1024));
    });

    it('should construct correct file path from storage root and relative path', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/abc123.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await processExpiration();

      expect(mockCleanupFile).toHaveBeenCalledWith('/test/storage/user-1/abc123.mp4');
    });

    it('should continue processing even if file is not found on disk', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1024),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockCleanupFile.mockResolvedValueOnce(false); // File not found
      mockUpdate.mockResolvedValueOnce({});

      const result = await processExpiration();

      expect(result.expired).toBe(1);
      expect(result.failed).toBe(0);
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockUpdateUserStorageUsage).toHaveBeenCalled();
    });

    it('should expire multiple videos successfully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', filePath: 'user-1/v1.mp4', fileSizeBytes: BigInt(1000), expiresAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', filePath: 'user-2/v2.mp4', fileSizeBytes: BigInt(2000), expiresAt: new Date() },
        { id: 'video-3', title: 'Video 3', userId: 'user-1', filePath: 'user-1/v3.mp4', fileSizeBytes: BigInt(3000), expiresAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate.mockResolvedValue({});

      const result = await processExpiration();

      expect(result).toEqual({
        processed: 3,
        expired: 3,
        failed: 0,
        bytesFreed: BigInt(6000),
        errors: [],
      });
      expect(mockCleanupFile).toHaveBeenCalledTimes(3);
      expect(mockUpdate).toHaveBeenCalledTimes(3);
      expect(mockUpdateUserStorageUsage).toHaveBeenCalledTimes(3);
    });

    it('should handle partial failures gracefully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', filePath: 'user-1/v1.mp4', fileSizeBytes: BigInt(1000), expiresAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', filePath: 'user-2/v2.mp4', fileSizeBytes: BigInt(2000), expiresAt: new Date() },
        { id: 'video-3', title: 'Video 3', userId: 'user-1', filePath: 'user-1/v3.mp4', fileSizeBytes: BigInt(3000), expiresAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockResolvedValueOnce({}) // First succeeds
        .mockRejectedValueOnce(new Error('Database error')) // Second fails
        .mockResolvedValueOnce({}); // Third succeeds

      const result = await processExpiration();

      expect(result).toEqual({
        processed: 3,
        expired: 2,
        failed: 1,
        bytesFreed: BigInt(4000), // Only 1000 + 3000 from successful ones
        errors: [{ videoId: 'video-2', error: 'Database error' }],
      });
    });

    it('should handle all failures gracefully', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', filePath: 'user-1/v1.mp4', fileSizeBytes: BigInt(1000), expiresAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', filePath: 'user-2/v2.mp4', fileSizeBytes: BigInt(2000), expiresAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockRejectedValueOnce(new Error('Error 1'))
        .mockRejectedValueOnce(new Error('Error 2'));

      const result = await processExpiration();

      expect(result).toEqual({
        processed: 2,
        expired: 0,
        failed: 2,
        bytesFreed: BigInt(0),
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
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockRejectedValueOnce('String error');

      const result = await processExpiration();

      expect(result.errors).toEqual([{ videoId: 'video-1', error: 'String error' }]);
    });

    it('should throw if findMany fails', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(processExpiration()).rejects.toThrow('Database connection failed');
    });

    it('should handle failure in cleanupFile gracefully', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockCleanupFile.mockRejectedValueOnce(new Error('File cleanup failed'));

      const result = await processExpiration();

      // cleanupFile failing should cause the video expiration to fail
      expect(result.failed).toBe(1);
      expect(result.expired).toBe(0);
      expect(result.errors).toEqual([{ videoId: 'video-1', error: 'File cleanup failed' }]);
    });

    it('should handle failure in updateUserStorageUsage gracefully', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});
      mockUpdateUserStorageUsage.mockRejectedValueOnce(new Error('Storage update failed'));

      const result = await processExpiration();

      expect(result.failed).toBe(1);
      expect(result.expired).toBe(0);
      expect(result.errors).toEqual([{ videoId: 'video-1', error: 'Storage update failed' }]);
    });

    it('should decrement user storage by negative file size', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(5000000), // 5 MB
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await processExpiration();

      expect(mockUpdateUserStorageUsage).toHaveBeenCalledWith('user-1', BigInt(-5000000));
    });

    it('should track total bytes freed across all videos', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', filePath: 'user-1/v1.mp4', fileSizeBytes: BigInt(1000000), expiresAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', filePath: 'user-2/v2.mp4', fileSizeBytes: BigInt(2500000), expiresAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate.mockResolvedValue({});

      const result = await processExpiration();

      expect(result.bytesFreed).toBe(BigInt(3500000));
    });

    it('should set status to EXPIRED', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await processExpiration();

      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'EXPIRED',
          }),
        })
      );
    });
  });

  describe('expirationJobHandler', () => {
    it('should call processExpiration', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await expirationJobHandler();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });

    it('should complete without throwing on success', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        userId: 'user-1',
        filePath: 'user-1/video-1.mp4',
        fileSizeBytes: BigInt(1000),
        expiresAt: new Date(),
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockUpdate.mockResolvedValueOnce({});

      await expect(expirationJobHandler()).resolves.not.toThrow();
    });

    it('should complete without throwing on partial failure', async () => {
      const mockVideos = [
        { id: 'video-1', title: 'Video 1', userId: 'user-1', filePath: 'user-1/v1.mp4', fileSizeBytes: BigInt(1000), expiresAt: new Date() },
        { id: 'video-2', title: 'Video 2', userId: 'user-2', filePath: 'user-2/v2.mp4', fileSizeBytes: BigInt(2000), expiresAt: new Date() },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockUpdate
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(expirationJobHandler()).resolves.not.toThrow();
    });

    it('should throw if processExpiration throws', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database error'));

      await expect(expirationJobHandler()).rejects.toThrow('Database error');
    });
  });
});
