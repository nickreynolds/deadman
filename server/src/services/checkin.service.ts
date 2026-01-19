// Check-in service - handles video check-in operations and distribution control

import { prisma } from '../db';
import { createChildLogger } from '../logger';
import type { CheckIn, CheckInAction, Video } from '@prisma/client';
import { calculateDistributeAt } from '../utils';

const logger = createChildLogger({ component: 'checkin-service' });

/**
 * Check-in result containing both the updated video and the check-in record
 */
export interface CheckInResult {
  video: Video;
  checkIn: CheckIn;
}

/**
 * Create a check-in record for a video
 * @param videoId - The video ID
 * @param action - The check-in action (PREVENT_DISTRIBUTION or ALLOW_DISTRIBUTION)
 * @returns The created check-in record
 */
export async function createCheckIn(videoId: string, action: CheckInAction): Promise<CheckIn> {
  logger.debug({ videoId, action }, 'Creating check-in record');

  const checkIn = await prisma.checkIn.create({
    data: {
      videoId,
      action,
    },
  });

  logger.info({ checkInId: checkIn.id, videoId, action }, 'Check-in record created');

  return checkIn;
}

/**
 * Get all check-ins for a video (for audit trail)
 * @param videoId - The video ID
 * @returns Array of check-in records ordered by creation time (newest first)
 */
export async function getCheckInsByVideoId(videoId: string): Promise<CheckIn[]> {
  return prisma.checkIn.findMany({
    where: { videoId },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Perform a check-in action on a video
 * This creates a check-in record and updates the video status accordingly
 *
 * @param videoId - The video ID
 * @param action - The check-in action
 * @param userTimerDays - User's default timer days for extending distribution
 * @returns The result containing updated video and check-in record
 */
export async function performCheckIn(
  videoId: string,
  action: CheckInAction,
  userTimerDays: number
): Promise<CheckInResult> {
  logger.info({ videoId, action, userTimerDays }, 'Performing check-in');

  // Use a transaction to ensure both operations succeed or fail together
  const result = await prisma.$transaction(async (tx) => {
    // Create the check-in record
    const checkIn = await tx.checkIn.create({
      data: {
        videoId,
        action,
      },
    });

    // Update the video based on the action
    let videoUpdate: Partial<Video> = {};

    if (action === 'PREVENT_DISTRIBUTION') {
      // Reset the distribution timer by extending distribute_at
      const newDistributeAt = calculateDistributeAt(userTimerDays);
      videoUpdate = {
        distributeAt: newDistributeAt,
        // Keep status as ACTIVE (video hasn't been distributed yet)
      };
      logger.debug(
        { videoId, newDistributeAt: newDistributeAt.toISOString() },
        'Extended distribution timer'
      );
    } else if (action === 'ALLOW_DISTRIBUTION') {
      // Ensure video is in ACTIVE status (can be distributed when timer expires)
      // This essentially undoes a prevention if one was set
      // The video will be distributed according to its current distribute_at time
      videoUpdate = {
        // Status remains ACTIVE - distribution will happen when distribute_at passes
      };
      logger.debug({ videoId }, 'Distribution allowed (no timer change)');
    }

    // Update the video if there are any changes
    const video = await tx.video.update({
      where: { id: videoId },
      data: videoUpdate,
    });

    return { video, checkIn };
  });

  logger.info(
    {
      videoId,
      checkInId: result.checkIn.id,
      action,
      newDistributeAt: result.video.distributeAt.toISOString(),
    },
    'Check-in completed successfully'
  );

  return result;
}

/**
 * Check if a video can have a check-in performed on it
 * Only ACTIVE videos can have check-ins (not PENDING, DISTRIBUTED, or EXPIRED)
 * @param status - The video status
 * @returns true if check-in is allowed, false otherwise
 */
export function canPerformCheckIn(status: string): boolean {
  return status === 'ACTIVE';
}

/**
 * Validate check-in action
 * @param action - The action to validate
 * @returns true if valid, false otherwise
 */
export function isValidCheckInAction(action: string): action is CheckInAction {
  return action === 'PREVENT_DISTRIBUTION' || action === 'ALLOW_DISTRIBUTION';
}
