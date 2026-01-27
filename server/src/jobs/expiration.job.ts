/**
 * Expiration Cleanup Job
 *
 * Daily job that expires and deletes old distributed videos.
 * - Queries videos where expires_at <= now() and status = DISTRIBUTED
 * - Deletes video files from storage
 * - Updates status to EXPIRED
 * - Decrements user's storage_used_bytes
 */

import path from 'path';
import { prisma } from '../db';
import { createChildLogger } from '../logger';
import { cleanupFile } from '../services/cleanup.service';
import { updateUserStorageUsage } from '../services/video.service';
import { getStorageConfig } from '../storage';

const logger = createChildLogger({ component: 'expiration-job' });

/**
 * Result of an expiration job run
 */
export interface ExpirationJobResult {
  /** Number of videos processed */
  processed: number;
  /** Number of videos successfully expired */
  expired: number;
  /** Number of videos that failed expiration */
  failed: number;
  /** Total bytes freed from storage */
  bytesFreed: bigint;
  /** IDs of failed videos with their error messages */
  errors: Array<{ videoId: string; error: string }>;
}

/**
 * Process expired videos
 *
 * This function:
 * 1. Queries all DISTRIBUTED videos where expires_at <= now
 * 2. For each video:
 *    a. Deletes the video file from storage
 *    b. Updates status to EXPIRED
 *    c. Decrements user's storage_used_bytes
 *
 * @param now - Optional current time for testing
 * @returns Results of the expiration run
 */
export async function processExpiration(now?: Date): Promise<ExpirationJobResult> {
  const currentTime = now || new Date();
  const result: ExpirationJobResult = {
    processed: 0,
    expired: 0,
    failed: 0,
    bytesFreed: BigInt(0),
    errors: [],
  };

  logger.info({ currentTime: currentTime.toISOString() }, 'Starting expiration cleanup job');

  try {
    // Find all DISTRIBUTED videos where expires_at has passed
    const expiredVideos = await prisma.video.findMany({
      where: {
        status: 'DISTRIBUTED',
        expiresAt: {
          lte: currentTime,
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

    result.processed = expiredVideos.length;

    if (expiredVideos.length === 0) {
      logger.info('No expired videos to clean up');
      return result;
    }

    logger.info(
      { videoCount: expiredVideos.length },
      'Found expired videos to clean up'
    );

    const storageConfig = getStorageConfig();

    // Process each expired video
    for (const video of expiredVideos) {
      try {
        // 1. Delete the video file from storage
        const absoluteFilePath = path.join(storageConfig.rootPath, video.filePath);
        const fileDeleted = await cleanupFile(absoluteFilePath);

        if (fileDeleted) {
          logger.debug(
            { videoId: video.id, filePath: video.filePath },
            'Deleted expired video file'
          );
        } else {
          // File might already be deleted or missing - log but continue
          logger.warn(
            { videoId: video.id, filePath: video.filePath },
            'Expired video file not found on disk'
          );
        }

        // 2. Update video status to EXPIRED
        await prisma.video.update({
          where: { id: video.id },
          data: {
            status: 'EXPIRED',
          },
        });

        // 3. Decrement user's storage usage
        // Only decrement if file was on disk (we're freeing that space)
        // Even if file wasn't found, we should update the user's storage to stay in sync
        await updateUserStorageUsage(video.userId, -video.fileSizeBytes);

        result.expired++;
        result.bytesFreed += video.fileSizeBytes;

        logger.info(
          {
            videoId: video.id,
            title: video.title,
            userId: video.userId,
            bytesFreed: video.fileSizeBytes.toString(),
          },
          'Video expired and cleaned up successfully'
        );
      } catch (error) {
        result.failed++;
        const errorMessage = error instanceof Error ? error.message : String(error);
        result.errors.push({ videoId: video.id, error: errorMessage });

        logger.error(
          {
            videoId: video.id,
            title: video.title,
            err: error,
          },
          'Failed to expire video'
        );
      }
    }

    logger.info(
      {
        processed: result.processed,
        expired: result.expired,
        failed: result.failed,
        bytesFreed: result.bytesFreed.toString(),
      },
      'Expiration cleanup job completed'
    );

    return result;
  } catch (error) {
    logger.error({ err: error }, 'Expiration cleanup job failed unexpectedly');
    throw error;
  }
}

/**
 * Expiration job handler for the scheduler
 * This is the entry point called by the job scheduler
 */
export async function expirationJobHandler(): Promise<void> {
  const result = await processExpiration();

  // Log summary for monitoring
  if (result.failed > 0) {
    logger.warn(
      {
        expired: result.expired,
        failed: result.failed,
        bytesFreed: result.bytesFreed.toString(),
        errors: result.errors,
      },
      'Expiration cleanup job completed with failures'
    );
  }
}
