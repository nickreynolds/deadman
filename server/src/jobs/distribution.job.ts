/**
 * Distribution Job
 *
 * Hourly job that distributes videos past their timer.
 * - Queries videos where distribute_at <= now() and status = ACTIVE
 * - Marks videos as DISTRIBUTED
 * - Sets expires_at to 7 days from distribution
 */

import { prisma } from '../db';
import { createChildLogger } from '../logger';
import { calculateExpiresAt } from '../utils';

const logger = createChildLogger({ component: 'distribution-job' });

/**
 * Result of a distribution job run
 */
export interface DistributionJobResult {
  /** Number of videos processed */
  processed: number;
  /** Number of videos successfully distributed */
  distributed: number;
  /** Number of videos that failed distribution */
  failed: number;
  /** IDs of failed videos with their error messages */
  errors: Array<{ videoId: string; error: string }>;
}

/**
 * Process videos ready for distribution
 *
 * This function:
 * 1. Queries all ACTIVE videos where distribute_at <= now
 * 2. For each video, updates status to DISTRIBUTED
 * 3. Sets distributed_at to current time
 * 4. Sets expires_at to 7 days after distribution
 *
 * @param now - Optional current time for testing
 * @returns Results of the distribution run
 */
export async function processDistribution(now?: Date): Promise<DistributionJobResult> {
  const currentTime = now || new Date();
  const result: DistributionJobResult = {
    processed: 0,
    distributed: 0,
    failed: 0,
    errors: [],
  };

  logger.info({ currentTime: currentTime.toISOString() }, 'Starting distribution job');

  try {
    // Find all ACTIVE videos where distribute_at has passed
    const videosToDistribute = await prisma.video.findMany({
      where: {
        status: 'ACTIVE',
        distributeAt: {
          lte: currentTime,
        },
      },
      select: {
        id: true,
        title: true,
        userId: true,
        distributeAt: true,
      },
    });

    result.processed = videosToDistribute.length;

    if (videosToDistribute.length === 0) {
      logger.info('No videos ready for distribution');
      return result;
    }

    logger.info(
      { videoCount: videosToDistribute.length },
      'Found videos ready for distribution'
    );

    // Process each video
    for (const video of videosToDistribute) {
      try {
        const distributedAt = new Date();
        const expiresAt = calculateExpiresAt(distributedAt);

        await prisma.video.update({
          where: { id: video.id },
          data: {
            status: 'DISTRIBUTED',
            distributedAt,
            expiresAt,
          },
        });

        result.distributed++;

        logger.info(
          {
            videoId: video.id,
            title: video.title,
            userId: video.userId,
            distributedAt: distributedAt.toISOString(),
            expiresAt: expiresAt.toISOString(),
          },
          'Video distributed successfully'
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
          'Failed to distribute video'
        );
      }
    }

    logger.info(
      {
        processed: result.processed,
        distributed: result.distributed,
        failed: result.failed,
      },
      'Distribution job completed'
    );

    return result;
  } catch (error) {
    logger.error({ err: error }, 'Distribution job failed unexpectedly');
    throw error;
  }
}

/**
 * Distribution job handler for the scheduler
 * This is the entry point called by the job scheduler
 */
export async function distributionJobHandler(): Promise<void> {
  const result = await processDistribution();

  // Log summary for monitoring
  if (result.failed > 0) {
    logger.warn(
      {
        distributed: result.distributed,
        failed: result.failed,
        errors: result.errors,
      },
      'Distribution job completed with failures'
    );
  }
}
