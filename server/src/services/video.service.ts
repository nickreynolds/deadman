// Video service - handles video CRUD operations and storage management

import { prisma } from '../db';
import { createChildLogger } from '../logger';
import type { Video, VideoStatus } from '@prisma/client';

const logger = createChildLogger({ component: 'video-service' });

/**
 * Video creation data
 */
export interface CreateVideoData {
  userId: string;
  title: string;
  filePath: string;
  fileSizeBytes: bigint;
  mimeType: string;
  distributeAt: Date;
}

/**
 * Create a new video record
 * @param data - Video creation data
 * @returns The created video
 */
export async function createVideo(data: CreateVideoData): Promise<Video> {
  logger.info(
    { userId: data.userId, title: data.title, fileSizeBytes: data.fileSizeBytes.toString() },
    'Creating video record'
  );

  const video = await prisma.video.create({
    data: {
      userId: data.userId,
      title: data.title,
      filePath: data.filePath,
      fileSizeBytes: data.fileSizeBytes,
      mimeType: data.mimeType,
      status: 'ACTIVE', // Videos start as ACTIVE (not PENDING since we have the file)
      distributeAt: data.distributeAt,
    },
  });

  logger.info(
    { videoId: video.id, publicToken: video.publicToken },
    'Video record created successfully'
  );

  return video;
}

/**
 * Find a video by ID
 * @param id - The video ID
 * @returns The video or null if not found
 */
export async function findVideoById(id: string): Promise<Video | null> {
  return prisma.video.findUnique({
    where: { id },
  });
}

/**
 * Find a video by public token
 * @param publicToken - The public access token
 * @returns The video or null if not found
 */
export async function findVideoByPublicToken(publicToken: string): Promise<Video | null> {
  return prisma.video.findUnique({
    where: { publicToken },
  });
}

/**
 * Get videos for a user with optional filtering
 * @param userId - The user ID
 * @param options - Query options
 * @returns Array of videos and total count
 */
export async function getVideosByUser(
  userId: string,
  options: {
    status?: VideoStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ videos: Video[]; total: number }> {
  const { status, limit = 50, offset = 0 } = options;

  const where = {
    userId,
    ...(status && { status }),
  };

  const [videos, total] = await Promise.all([
    prisma.video.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.video.count({ where }),
  ]);

  return { videos, total };
}

/**
 * Update a video's title
 * @param videoId - The video ID
 * @param title - The new title
 * @returns The updated video or null if not found
 */
export async function updateVideoTitle(videoId: string, title: string): Promise<Video | null> {
  try {
    return await prisma.video.update({
      where: { id: videoId },
      data: { title },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/**
 * Delete a video record
 * @param videoId - The video ID
 * @returns The deleted video or null if not found
 */
export async function deleteVideo(videoId: string): Promise<Video | null> {
  try {
    return await prisma.video.delete({
      where: { id: videoId },
    });
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      return null;
    }
    throw error;
  }
}

/**
 * Update user's storage usage
 * @param userId - The user ID
 * @param bytesChange - Positive to add, negative to subtract
 */
export async function updateUserStorageUsage(userId: string, bytesChange: bigint): Promise<void> {
  logger.debug({ userId, bytesChange: bytesChange.toString() }, 'Updating user storage usage');

  await prisma.user.update({
    where: { id: userId },
    data: {
      storageUsedBytes: {
        increment: bytesChange,
      },
    },
  });
}

/**
 * Check if user has sufficient storage quota for a file
 * @param userId - The user ID
 * @param fileSize - Size of the file in bytes
 * @returns Object with hasQuota boolean and current usage info
 */
export async function checkUserStorageQuota(
  userId: string,
  fileSize: bigint
): Promise<{
  hasQuota: boolean;
  quotaBytes: bigint;
  usedBytes: bigint;
  remainingBytes: bigint;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      storageQuotaBytes: true,
      storageUsedBytes: true,
    },
  });

  if (!user) {
    throw new Error('User not found');
  }

  const remainingBytes = user.storageQuotaBytes - user.storageUsedBytes;
  const hasQuota = remainingBytes >= fileSize;

  return {
    hasQuota,
    quotaBytes: user.storageQuotaBytes,
    usedBytes: user.storageUsedBytes,
    remainingBytes,
  };
}

/**
 * Get a user's default timer days setting
 * @param userId - The user ID
 * @returns The default timer days or null if user not found
 */
export async function getUserDefaultTimerDays(userId: string): Promise<number | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { defaultTimerDays: true },
  });

  return user?.defaultTimerDays ?? null;
}
