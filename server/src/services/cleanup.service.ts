// Cleanup service - handles cleanup of failed uploads and orphaned files
// Ensures failed uploads don't leave orphan files on disk

import fs from 'fs';
import path from 'path';
import { prisma } from '../db';
import { getStorageConfig } from '../storage';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'cleanup-service' });

/**
 * Result of a cleanup operation
 */
export interface CleanupResult {
  filesRemoved: number;
  bytesFreed: bigint;
  errors: string[];
}

/**
 * Clean up a file from disk
 * Used after failed uploads or when deleting videos
 * @param filePath - Absolute path to the file
 * @returns true if file was deleted, false if it didn't exist
 */
export async function cleanupFile(filePath: string): Promise<boolean> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info({ path: filePath }, 'Cleaned up file');
      return true;
    }
    return false;
  } catch (error) {
    const err = error as Error;
    logger.error(
      { path: filePath, error: err.message },
      'Failed to cleanup file'
    );
    // Don't throw - cleanup failures shouldn't crash the application
    return false;
  }
}

/**
 * Get all video file paths that exist in the database for a user
 * @param userId - The user ID
 * @returns Set of relative file paths that should exist
 */
async function getValidFilePaths(userId?: string): Promise<Set<string>> {
  const where = userId ? { userId } : {};

  const videos = await prisma.video.findMany({
    where,
    select: { filePath: true },
  });

  return new Set(videos.map(v => v.filePath));
}

/**
 * Scan a directory for files and return their paths
 * @param dirPath - Directory to scan
 * @returns Array of file paths (relative to storage root)
 */
async function scanDirectory(dirPath: string): Promise<string[]> {
  const files: string[] = [];

  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        // Skip .temp directory and hidden directories
        if (!entry.name.startsWith('.')) {
          const subFiles = await scanDirectory(fullPath);
          files.push(...subFiles);
        }
      } else if (entry.isFile()) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    const err = error as Error;
    logger.warn(
      { path: dirPath, error: err.message },
      'Error scanning directory'
    );
  }

  return files;
}

/**
 * Find orphaned files that exist on disk but not in database
 * @param userId - Optional: limit search to a specific user's directory
 * @returns Array of absolute file paths that are orphaned
 */
export async function findOrphanedFiles(userId?: string): Promise<string[]> {
  const storageConfig = getStorageConfig();
  const validPaths = await getValidFilePaths(userId);
  const orphaned: string[] = [];

  const searchPath = userId
    ? path.join(storageConfig.rootPath, userId)
    : storageConfig.rootPath;

  if (!fs.existsSync(searchPath)) {
    return orphaned;
  }

  const allFiles = await scanDirectory(searchPath);

  for (const filePath of allFiles) {
    // Convert absolute path to relative path (from storage root)
    const relativePath = path.relative(storageConfig.rootPath, filePath);

    // Check if this file exists in the database
    if (!validPaths.has(relativePath)) {
      orphaned.push(filePath);
    }
  }

  return orphaned;
}

/**
 * Clean up orphaned files that exist on disk but not in database
 * This handles the case where uploads fail mid-process
 * @param userId - Optional: limit cleanup to a specific user's directory
 * @param maxAgeMs - Only clean up files older than this (default: 1 hour)
 * @returns Cleanup result with count and any errors
 */
export async function cleanupOrphanedFiles(
  userId?: string,
  maxAgeMs: number = 60 * 60 * 1000 // 1 hour default
): Promise<CleanupResult> {
  const result: CleanupResult = {
    filesRemoved: 0,
    bytesFreed: BigInt(0),
    errors: [],
  };

  const now = Date.now();
  const orphanedFiles = await findOrphanedFiles(userId);

  logger.info(
    { userId: userId ?? 'all', orphanedCount: orphanedFiles.length },
    'Found orphaned files'
  );

  for (const filePath of orphanedFiles) {
    try {
      const stats = await fs.promises.stat(filePath);
      const fileAge = now - stats.mtimeMs;

      // Only clean up files older than maxAgeMs
      // This prevents deleting files that are still being uploaded
      if (fileAge < maxAgeMs) {
        logger.debug(
          { path: filePath, ageMs: fileAge },
          'Skipping recent orphaned file'
        );
        continue;
      }

      const fileSize = stats.size;

      if (await cleanupFile(filePath)) {
        result.filesRemoved++;
        result.bytesFreed += BigInt(fileSize);
      }
    } catch (error) {
      const err = error as Error;
      result.errors.push(`${filePath}: ${err.message}`);
      logger.error(
        { path: filePath, error: err.message },
        'Error processing orphaned file'
      );
    }
  }

  logger.info(
    {
      filesRemoved: result.filesRemoved,
      bytesFreed: result.bytesFreed.toString(),
      errors: result.errors.length,
    },
    'Orphaned file cleanup complete'
  );

  return result;
}

/**
 * Clean up files in the temporary upload directory
 * @param maxAgeMs - Only clean up files older than this (default: 1 hour)
 * @returns Cleanup result with count and any errors
 */
export async function cleanupTempFiles(
  maxAgeMs: number = 60 * 60 * 1000
): Promise<CleanupResult> {
  const result: CleanupResult = {
    filesRemoved: 0,
    bytesFreed: BigInt(0),
    errors: [],
  };

  const storageConfig = getStorageConfig();
  const tempPath = path.join(storageConfig.rootPath, '.temp');

  if (!fs.existsSync(tempPath)) {
    return result;
  }

  const now = Date.now();

  try {
    const entries = await fs.promises.readdir(tempPath, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const filePath = path.join(tempPath, entry.name);

      try {
        const stats = await fs.promises.stat(filePath);
        const fileAge = now - stats.mtimeMs;

        if (fileAge < maxAgeMs) {
          continue;
        }

        const fileSize = stats.size;

        if (await cleanupFile(filePath)) {
          result.filesRemoved++;
          result.bytesFreed += BigInt(fileSize);
        }
      } catch (error) {
        const err = error as Error;
        result.errors.push(`${filePath}: ${err.message}`);
      }
    }
  } catch (error) {
    const err = error as Error;
    logger.error(
      { path: tempPath, error: err.message },
      'Error reading temp directory'
    );
    result.errors.push(`temp directory: ${err.message}`);
  }

  logger.info(
    {
      filesRemoved: result.filesRemoved,
      bytesFreed: result.bytesFreed.toString(),
    },
    'Temp file cleanup complete'
  );

  return result;
}

/**
 * Run full cleanup: orphaned files + temp files
 * This should be run periodically (e.g., hourly) by the job scheduler
 * @returns Combined cleanup result
 */
export async function runFullCleanup(): Promise<CleanupResult> {
  logger.info('Starting full cleanup');

  const result: CleanupResult = {
    filesRemoved: 0,
    bytesFreed: BigInt(0),
    errors: [],
  };

  // Clean up orphaned files (files on disk without database records)
  const orphanResult = await cleanupOrphanedFiles();
  result.filesRemoved += orphanResult.filesRemoved;
  result.bytesFreed += orphanResult.bytesFreed;
  result.errors.push(...orphanResult.errors);

  // Clean up temp files
  const tempResult = await cleanupTempFiles();
  result.filesRemoved += tempResult.filesRemoved;
  result.bytesFreed += tempResult.bytesFreed;
  result.errors.push(...tempResult.errors);

  logger.info(
    {
      totalFilesRemoved: result.filesRemoved,
      totalBytesFreed: result.bytesFreed.toString(),
      totalErrors: result.errors.length,
    },
    'Full cleanup complete'
  );

  return result;
}
