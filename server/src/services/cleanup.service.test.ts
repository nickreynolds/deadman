// Tests for cleanup service

import fs from 'fs';
import path from 'path';
import { cleanupFile, findOrphanedFiles, cleanupOrphanedFiles, cleanupTempFiles, runFullCleanup, CleanupResult } from './cleanup.service';
import { prisma } from '../db';
import * as storage from '../storage';

// Mock dependencies
jest.mock('../db', () => ({
  prisma: {
    video: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../storage', () => ({
  getStorageConfig: jest.fn(),
}));

jest.mock('../logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock fs module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  promises: {
    unlink: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockFs = fs as jest.Mocked<typeof fs>;
const mockFsPromises = fs.promises as jest.Mocked<typeof fs.promises>;
const mockStorage = storage as jest.Mocked<typeof storage>;

// Helper to create mock Dirent objects
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function createMockDirent(name: string, isDir: boolean): any {
  return {
    name,
    isDirectory: () => isDir,
    isFile: () => !isDir,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: '',
    parentPath: '',
  };
}

describe('cleanup.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStorage.getStorageConfig.mockReturnValue({
      rootPath: '/storage',
      maxFileSizeBytes: 500 * 1024 * 1024,
    });
  });

  describe('cleanupFile', () => {
    it('should delete file if it exists', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await cleanupFile('/storage/user1/video.mp4');

      expect(result).toBe(true);
      expect(mockFsPromises.unlink).toHaveBeenCalledWith('/storage/user1/video.mp4');
    });

    it('should return false if file does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await cleanupFile('/storage/user1/video.mp4');

      expect(result).toBe(false);
      expect(mockFsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should return false and not throw on unlink error', async () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.unlink.mockRejectedValue(new Error('Permission denied'));

      const result = await cleanupFile('/storage/user1/video.mp4');

      expect(result).toBe(false);
    });
  });

  describe('findOrphanedFiles', () => {
    it('should return empty array if storage path does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      const result = await findOrphanedFiles();

      expect(result).toEqual([]);
    });

    it('should identify files not in database as orphaned', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([
        { filePath: 'user1/valid-video.mp4' },
      ]);

      // Mock directory scanning
      mockFsPromises.readdir.mockResolvedValueOnce([
        createMockDirent('user1', true),
      ]).mockResolvedValueOnce([
        createMockDirent('valid-video.mp4', false),
        createMockDirent('orphaned-video.mp4', false),
      ]);

      const result = await findOrphanedFiles();

      expect(result).toContain('/storage/user1/orphaned-video.mp4');
      expect(result).not.toContain('/storage/user1/valid-video.mp4');
    });

    it('should skip hidden directories (like .temp)', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      mockFsPromises.readdir.mockResolvedValueOnce([
        createMockDirent('.temp', true),
        createMockDirent('user1', true),
      ]).mockResolvedValueOnce([
        createMockDirent('video.mp4', false),
      ]);

      const result = await findOrphanedFiles();

      // Should only scan user1 directory, not .temp
      expect(mockFsPromises.readdir).toHaveBeenCalledTimes(2);
    });

    it('should filter by userId when provided', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);
      mockFsPromises.readdir.mockResolvedValue([]);

      await findOrphanedFiles('user123');

      expect(mockPrisma.video.findMany).toHaveBeenCalledWith({
        where: { userId: 'user123' },
        select: { filePath: true },
      });
    });
  });

  describe('cleanupOrphanedFiles', () => {
    it('should skip files newer than maxAgeMs', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      mockFsPromises.readdir.mockResolvedValueOnce([
        createMockDirent('user1', true),
      ]).mockResolvedValueOnce([
        createMockDirent('recent-file.mp4', false),
      ]);

      // File is only 5 minutes old
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 5 * 60 * 1000,
        size: 1024,
      } as fs.Stats);

      const result = await cleanupOrphanedFiles(undefined, 60 * 60 * 1000); // 1 hour maxAge

      expect(result.filesRemoved).toBe(0);
      expect(mockFsPromises.unlink).not.toHaveBeenCalled();
    });

    it('should clean up files older than maxAgeMs', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      mockFsPromises.readdir.mockResolvedValueOnce([
        createMockDirent('user1', true),
      ]).mockResolvedValueOnce([
        createMockDirent('old-file.mp4', false),
      ]);

      // File is 2 hours old
      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000,
        size: 1024,
      } as fs.Stats);

      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await cleanupOrphanedFiles(undefined, 60 * 60 * 1000);

      expect(result.filesRemoved).toBe(1);
      expect(result.bytesFreed).toBe(BigInt(1024));
    });

    it('should track errors without throwing', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      mockFsPromises.readdir.mockResolvedValueOnce([
        createMockDirent('user1', true),
      ]).mockResolvedValueOnce([
        createMockDirent('problem-file.mp4', false),
      ]);

      mockFsPromises.stat.mockRejectedValue(new Error('Access denied'));

      const result = await cleanupOrphanedFiles();

      expect(result.filesRemoved).toBe(0);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('cleanupTempFiles', () => {
    it('should return empty result if temp directory does not exist', async () => {
      mockFs.existsSync.mockReturnValue(false);

      const result = await cleanupTempFiles();

      expect(result.filesRemoved).toBe(0);
      expect(result.bytesFreed).toBe(BigInt(0));
      expect(result.errors).toEqual([]);
    });

    it('should clean up old temp files', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFsPromises.readdir.mockResolvedValue([
        createMockDirent('temp-upload.tmp', false),
      ]);

      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000, // 2 hours old
        size: 2048,
      } as fs.Stats);

      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await cleanupTempFiles(60 * 60 * 1000);

      expect(result.filesRemoved).toBe(1);
      expect(result.bytesFreed).toBe(BigInt(2048));
    });

    it('should skip directories in temp folder', async () => {
      mockFs.existsSync.mockReturnValue(true);

      mockFsPromises.readdir.mockResolvedValue([
        createMockDirent('subdir', true),
      ]);

      const result = await cleanupTempFiles();

      expect(result.filesRemoved).toBe(0);
      expect(mockFsPromises.stat).not.toHaveBeenCalled();
    });
  });

  describe('runFullCleanup', () => {
    it('should combine results from orphaned and temp cleanup', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      // Mock orphaned files scan - no orphaned files
      mockFsPromises.readdir.mockResolvedValueOnce([])
        // Mock temp files scan - one temp file
        .mockResolvedValueOnce([
          createMockDirent('temp.tmp', false),
        ]);

      mockFsPromises.stat.mockResolvedValue({
        mtimeMs: Date.now() - 2 * 60 * 60 * 1000,
        size: 512,
      } as fs.Stats);

      mockFsPromises.unlink.mockResolvedValue(undefined);

      const result = await runFullCleanup();

      expect(result.filesRemoved).toBe(1);
      expect(result.bytesFreed).toBe(BigInt(512));
    });

    it('should aggregate errors from both cleanup operations', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockPrisma.video.findMany as jest.Mock).mockResolvedValue([]);

      mockFsPromises.readdir
        .mockResolvedValueOnce([
          createMockDirent('user1', true),
        ])
        .mockRejectedValueOnce(new Error('Permission denied'))
        .mockRejectedValueOnce(new Error('Temp error'));

      const result = await runFullCleanup();

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('CleanupResult interface', () => {
  it('should have correct structure', () => {
    const result: CleanupResult = {
      filesRemoved: 5,
      bytesFreed: BigInt(1024 * 1024),
      errors: ['error1', 'error2'],
    };

    expect(result.filesRemoved).toBe(5);
    expect(result.bytesFreed).toBe(BigInt(1024 * 1024));
    expect(result.errors).toHaveLength(2);
  });
});
