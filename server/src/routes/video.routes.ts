// Video routes - handles video upload and management
// POST /api/videos/upload - Upload a video file

import { Router, Request, Response, NextFunction } from 'express';
import { requireAuth, getAuthenticatedUser } from '../auth';
import { getUploadMiddleware, handleUploadError, cleanupUploadedFile } from '../middleware/upload';
import {
  createVideo,
  updateUserStorageUsage,
  checkUserStorageQuota,
  getUserDefaultTimerDays,
  getVideosByUser,
  findVideoById,
  updateVideoTitle,
  deleteVideo,
} from '../services/video.service';
import {
  performCheckIn,
  canPerformCheckIn,
  isValidCheckInAction,
} from '../services/checkin.service';
import { cleanupFile } from '../services/cleanup.service';
import { getStorageConfig, getUserStoragePath } from '../storage';
import type { VideoStatus } from '@prisma/client';
import { createChildLogger } from '../logger';
import { generateAutoTitle, calculateDistributeAt } from '../utils';
import path from 'path';

const logger = createChildLogger({ component: 'video-routes' });

const router: Router = Router();

/**
 * POST /api/videos/upload
 * Upload a video file
 *
 * Request: multipart/form-data
 *   - video: file (required)
 *   - title: string (optional, auto-generated if empty)
 *   - location: string (optional, included in auto-generated title if no title provided)
 *
 * Response:
 *   - 200: { video: { id, title, file_size_bytes, distribute_at, public_token, ... } }
 *   - 400: { error: string } - Invalid file or missing file
 *   - 401: { error: string } - Not authenticated
 *   - 413: { error: string } - File too large or quota exceeded
 */
router.post(
  '/upload',
  requireAuth,
  // First check quota before accepting the upload
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // This middleware runs before multer processes the file
    // We can't check exact file size yet, but we can check if user has any quota left
    try {
      const user = getAuthenticatedUser(req);
      const quotaInfo = await checkUserStorageQuota(user.id, BigInt(0));

      if (quotaInfo.remainingBytes <= 0) {
        logger.warn({ userId: user.id }, 'Upload rejected: no storage quota remaining');
        res.status(413).json({
          error: 'Storage quota exceeded',
          message: 'You have no storage quota remaining. Delete some videos to free up space.',
          quota_bytes: quotaInfo.quotaBytes.toString(),
          used_bytes: quotaInfo.usedBytes.toString(),
        });
        return;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, 'Error checking storage quota');
      res.status(500).json({ error: 'Internal server error' });
    }
  },
  // Handle the multipart upload
  (req: Request, res: Response, next: NextFunction) => {
    const upload = getUploadMiddleware();
    upload.single('video')(req, res, (err) => {
      if (err) {
        // Pass to our error handler
        return handleUploadError(err, req, res, next);
      }
      next();
    });
  },
  // Process the uploaded file
  async (req: Request, res: Response) => {
    const user = getAuthenticatedUser(req);
    const file = req.file;

    // Validate that a file was uploaded
    if (!file) {
      logger.warn({ userId: user.id }, 'Upload attempt without file');
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide a video file in the "video" field',
      });
    }

    const fileSizeBytes = BigInt(file.size);
    const filePath = file.path;

    try {
      // Check if file size exceeds remaining quota
      const quotaInfo = await checkUserStorageQuota(user.id, fileSizeBytes);

      if (!quotaInfo.hasQuota) {
        // Clean up the uploaded file
        await cleanupUploadedFile(filePath);

        logger.warn(
          {
            userId: user.id,
            fileSize: file.size,
            remainingQuota: quotaInfo.remainingBytes.toString(),
          },
          'Upload rejected: file exceeds storage quota'
        );

        return res.status(413).json({
          error: 'Storage quota exceeded',
          message: `This file (${formatBytes(file.size)}) exceeds your remaining storage quota (${formatBytes(Number(quotaInfo.remainingBytes))})`,
          file_size_bytes: file.size.toString(),
          quota_bytes: quotaInfo.quotaBytes.toString(),
          used_bytes: quotaInfo.usedBytes.toString(),
          remaining_bytes: quotaInfo.remainingBytes.toString(),
        });
      }

      // Get user's default timer setting
      const timerDays = (await getUserDefaultTimerDays(user.id)) ?? 7;
      const distributeAt = calculateDistributeAt(timerDays);

      // Get title from request or auto-generate
      // If no title provided, generate one using timestamp and optional location
      const userTitle = (req.body.title as string)?.trim();
      const location = (req.body.location as string)?.trim();
      const title = userTitle || generateAutoTitle(location);

      // Store relative path from storage root for portability
      const userStoragePath = getUserStoragePath(user.id);
      const relativePath = path.join(user.id, path.basename(file.path));

      // Create video record
      const video = await createVideo({
        userId: user.id,
        title,
        filePath: relativePath,
        fileSizeBytes,
        mimeType: file.mimetype,
        distributeAt,
      });

      // Update user's storage usage
      await updateUserStorageUsage(user.id, fileSizeBytes);

      logger.info(
        {
          userId: user.id,
          videoId: video.id,
          fileSize: file.size,
          title,
          distributeAt: distributeAt.toISOString(),
        },
        'Video uploaded successfully'
      );

      // Return response matching API specification
      return res.json({
        video: {
          id: video.id,
          title: video.title,
          file_size_bytes: video.fileSizeBytes.toString(),
          mime_type: video.mimeType,
          status: video.status,
          distribute_at: video.distributeAt.toISOString(),
          public_token: video.publicToken,
          created_at: video.createdAt.toISOString(),
          updated_at: video.updatedAt.toISOString(),
        },
      });
    } catch (error) {
      // Clean up the uploaded file on any error
      await cleanupUploadedFile(filePath);

      logger.error({ err: error, userId: user.id, file: file.originalname }, 'Video upload failed');
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
);

/**
 * GET /api/videos
 * List user's videos with optional pagination and status filtering
 *
 * Query parameters:
 *   - status: string (optional) - Filter by video status (PENDING, ACTIVE, DISTRIBUTED, EXPIRED)
 *   - limit: number (optional, default: 50) - Maximum number of videos to return
 *   - offset: number (optional, default: 0) - Number of videos to skip
 *
 * Response:
 *   - 200: { videos: [...], total: number }
 *   - 400: { error: string } - Invalid query parameters
 *   - 401: { error: string } - Not authenticated
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  const user = getAuthenticatedUser(req);

  try {
    // Parse and validate query parameters
    const statusParam = req.query.status as string | undefined;
    const limitParam = req.query.limit as string | undefined;
    const offsetParam = req.query.offset as string | undefined;

    // Validate status parameter if provided
    let status: VideoStatus | undefined;
    if (statusParam) {
      const validStatuses: VideoStatus[] = ['PENDING', 'ACTIVE', 'DISTRIBUTED', 'EXPIRED'];
      if (!validStatuses.includes(statusParam as VideoStatus)) {
        logger.warn({ userId: user.id, status: statusParam }, 'Invalid status filter');
        return res.status(400).json({
          error: 'Invalid status',
          message: `Status must be one of: ${validStatuses.join(', ')}`,
        });
      }
      status = statusParam as VideoStatus;
    }

    // Parse limit with validation
    let limit = 50; // default
    if (limitParam !== undefined) {
      const parsedLimit = parseInt(limitParam, 10);
      if (isNaN(parsedLimit) || parsedLimit < 1) {
        return res.status(400).json({
          error: 'Invalid limit',
          message: 'Limit must be a positive integer',
        });
      }
      // Cap limit at 100 to prevent excessive data transfer
      limit = Math.min(parsedLimit, 100);
    }

    // Parse offset with validation
    let offset = 0; // default
    if (offsetParam !== undefined) {
      const parsedOffset = parseInt(offsetParam, 10);
      if (isNaN(parsedOffset) || parsedOffset < 0) {
        return res.status(400).json({
          error: 'Invalid offset',
          message: 'Offset must be a non-negative integer',
        });
      }
      offset = parsedOffset;
    }

    // Fetch videos from database
    const { videos, total } = await getVideosByUser(user.id, { status, limit, offset });

    logger.debug(
      { userId: user.id, status, limit, offset, count: videos.length, total },
      'Videos retrieved successfully'
    );

    // Format response matching API specification
    return res.json({
      videos: videos.map((video) => ({
        id: video.id,
        title: video.title,
        file_size_bytes: video.fileSizeBytes.toString(),
        mime_type: video.mimeType,
        status: video.status,
        distribute_at: video.distributeAt.toISOString(),
        distributed_at: video.distributedAt?.toISOString() ?? null,
        expires_at: video.expiresAt?.toISOString() ?? null,
        public_token: video.publicToken,
        created_at: video.createdAt.toISOString(),
        updated_at: video.updatedAt.toISOString(),
      })),
      total,
    });
  } catch (error) {
    logger.error({ err: error, userId: user.id }, 'Failed to retrieve videos');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/videos/:id
 * Get video metadata for a specific video
 *
 * Path parameters:
 *   - id: string (required) - The video UUID
 *
 * Response:
 *   - 200: { video: {...} }
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Video owned by another user
 *   - 404: { error: string } - Video not found
 */
router.get('/:id', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const user = getAuthenticatedUser(req);
  const videoId = req.params.id;

  try {
    // Fetch video from database
    const video = await findVideoById(videoId);

    // Check if video exists
    if (!video) {
      logger.debug({ userId: user.id, videoId }, 'Video not found');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Check ownership - user can only access their own videos
    if (video.userId !== user.id) {
      logger.warn(
        { userId: user.id, videoId, ownerId: video.userId },
        'Unauthorized access attempt to video'
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this video',
      });
    }

    logger.debug({ userId: user.id, videoId }, 'Video retrieved successfully');

    // Return response matching API specification
    return res.json({
      video: {
        id: video.id,
        title: video.title,
        file_size_bytes: video.fileSizeBytes.toString(),
        mime_type: video.mimeType,
        status: video.status,
        distribute_at: video.distributeAt.toISOString(),
        distributed_at: video.distributedAt?.toISOString() ?? null,
        expires_at: video.expiresAt?.toISOString() ?? null,
        public_token: video.publicToken,
        created_at: video.createdAt.toISOString(),
        updated_at: video.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: user.id, videoId }, 'Failed to retrieve video');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/videos/:id
 * Update video metadata (currently only title)
 *
 * Path parameters:
 *   - id: string (required) - The video UUID
 *
 * Request body:
 *   - title: string (optional) - New title for the video
 *
 * Response:
 *   - 200: { video: {...} }
 *   - 400: { error: string } - Invalid request body
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Video owned by another user
 *   - 404: { error: string } - Video not found
 */
router.patch('/:id', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const user = getAuthenticatedUser(req);
  const videoId = req.params.id;

  try {
    // Validate request body
    const { title } = req.body as { title?: string };

    // Check if title is provided and is a string
    if (title !== undefined && typeof title !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Title must be a string',
      });
    }

    // Check if title is empty string when provided
    if (title !== undefined && title.trim() === '') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Title cannot be empty',
      });
    }

    // First fetch the video to check ownership
    const existingVideo = await findVideoById(videoId);

    // Check if video exists
    if (!existingVideo) {
      logger.debug({ userId: user.id, videoId }, 'Video not found for update');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Check ownership - user can only update their own videos
    if (existingVideo.userId !== user.id) {
      logger.warn(
        { userId: user.id, videoId, ownerId: existingVideo.userId },
        'Unauthorized update attempt to video'
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to modify this video',
      });
    }

    // If no title provided, return the video unchanged
    if (title === undefined) {
      logger.debug({ userId: user.id, videoId }, 'No fields to update');
      return res.json({
        video: {
          id: existingVideo.id,
          title: existingVideo.title,
          file_size_bytes: existingVideo.fileSizeBytes.toString(),
          mime_type: existingVideo.mimeType,
          status: existingVideo.status,
          distribute_at: existingVideo.distributeAt.toISOString(),
          distributed_at: existingVideo.distributedAt?.toISOString() ?? null,
          expires_at: existingVideo.expiresAt?.toISOString() ?? null,
          public_token: existingVideo.publicToken,
          created_at: existingVideo.createdAt.toISOString(),
          updated_at: existingVideo.updatedAt.toISOString(),
        },
      });
    }

    // Update the video title
    const video = await updateVideoTitle(videoId, title.trim());

    // This should not happen since we already checked existence, but handle it anyway
    if (!video) {
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    logger.info({ userId: user.id, videoId, newTitle: title.trim() }, 'Video title updated');

    // Return response matching API specification
    return res.json({
      video: {
        id: video.id,
        title: video.title,
        file_size_bytes: video.fileSizeBytes.toString(),
        mime_type: video.mimeType,
        status: video.status,
        distribute_at: video.distributeAt.toISOString(),
        distributed_at: video.distributedAt?.toISOString() ?? null,
        expires_at: video.expiresAt?.toISOString() ?? null,
        public_token: video.publicToken,
        created_at: video.createdAt.toISOString(),
        updated_at: video.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: user.id, videoId }, 'Failed to update video');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/videos/:id
 * Delete a video and free up storage
 *
 * Path parameters:
 *   - id: string (required) - The video UUID
 *
 * Response:
 *   - 200: { success: true }
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Video owned by another user
 *   - 404: { error: string } - Video not found
 */
router.delete('/:id', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const user = getAuthenticatedUser(req);
  const videoId = req.params.id;

  try {
    // First fetch the video to check ownership and get file info
    const video = await findVideoById(videoId);

    // Check if video exists
    if (!video) {
      logger.debug({ userId: user.id, videoId }, 'Video not found for deletion');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Check ownership - user can only delete their own videos
    if (video.userId !== user.id) {
      logger.warn(
        { userId: user.id, videoId, ownerId: video.userId },
        'Unauthorized delete attempt on video'
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to delete this video',
      });
    }

    // Get the absolute file path
    const storageConfig = getStorageConfig();
    const absoluteFilePath = path.join(storageConfig.rootPath, video.filePath);

    // Delete the video file from storage
    const fileDeleted = await cleanupFile(absoluteFilePath);
    if (!fileDeleted) {
      logger.warn(
        { userId: user.id, videoId, filePath: video.filePath },
        'Video file not found on disk during deletion (may have been already cleaned up)'
      );
    }

    // Delete the database record
    const deletedVideo = await deleteVideo(videoId);

    // Handle race condition where video was deleted between check and delete
    if (!deletedVideo) {
      logger.warn({ userId: user.id, videoId }, 'Video was deleted by another process');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Decrement user's storage usage
    await updateUserStorageUsage(user.id, -video.fileSizeBytes);

    logger.info(
      {
        userId: user.id,
        videoId,
        fileSizeBytes: video.fileSizeBytes.toString(),
        fileDeleted,
      },
      'Video deleted successfully'
    );

    return res.json({ success: true });
  } catch (error) {
    logger.error({ err: error, userId: user.id, videoId }, 'Failed to delete video');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/videos/:id/checkin
 * Perform a check-in action on a video
 *
 * Path parameters:
 *   - id: string (required) - The video UUID
 *
 * Request body:
 *   - action: "PREVENT_DISTRIBUTION" | "ALLOW_DISTRIBUTION" (required)
 *
 * Response:
 *   - 200: { video: {...}, checkin: {...} }
 *   - 400: { error: string } - Invalid request body or invalid action
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Video owned by another user
 *   - 404: { error: string } - Video not found
 *   - 409: { error: string } - Video is not in a state that allows check-in
 */
router.post('/:id/checkin', requireAuth, async (req: Request<{ id: string }>, res: Response) => {
  const user = getAuthenticatedUser(req);
  const videoId = req.params.id;

  try {
    // Validate request body
    const { action } = req.body as { action?: string };

    // Check if action is provided
    if (!action) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Action is required',
      });
    }

    // Check if action is a string
    if (typeof action !== 'string') {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Action must be a string',
      });
    }

    // Validate action value
    if (!isValidCheckInAction(action)) {
      return res.status(400).json({
        error: 'Invalid action',
        message: 'Action must be either PREVENT_DISTRIBUTION or ALLOW_DISTRIBUTION',
      });
    }

    // Fetch video to check ownership and status
    const video = await findVideoById(videoId);

    // Check if video exists
    if (!video) {
      logger.debug({ userId: user.id, videoId }, 'Video not found for check-in');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Check ownership - user can only check in their own videos
    if (video.userId !== user.id) {
      logger.warn(
        { userId: user.id, videoId, ownerId: video.userId },
        'Unauthorized check-in attempt on video'
      );
      return res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to check in this video',
      });
    }

    // Check if video is in a state that allows check-in
    if (!canPerformCheckIn(video.status)) {
      logger.warn(
        { userId: user.id, videoId, status: video.status },
        'Check-in attempted on video with invalid status'
      );
      return res.status(409).json({
        error: 'Invalid video status',
        message: `Check-in is only allowed for ACTIVE videos. This video has status: ${video.status}`,
      });
    }

    // Get user's timer days for potential distribution extension
    const timerDays = (await getUserDefaultTimerDays(user.id)) ?? 7;

    // Perform the check-in
    const result = await performCheckIn(videoId, action, timerDays);

    logger.info(
      { userId: user.id, videoId, action, checkInId: result.checkIn.id },
      'Check-in completed successfully'
    );

    // Return response matching API specification
    return res.json({
      video: {
        id: result.video.id,
        title: result.video.title,
        file_size_bytes: result.video.fileSizeBytes.toString(),
        mime_type: result.video.mimeType,
        status: result.video.status,
        distribute_at: result.video.distributeAt.toISOString(),
        distributed_at: result.video.distributedAt?.toISOString() ?? null,
        expires_at: result.video.expiresAt?.toISOString() ?? null,
        public_token: result.video.publicToken,
        created_at: result.video.createdAt.toISOString(),
        updated_at: result.video.updatedAt.toISOString(),
      },
      checkin: {
        id: result.checkIn.id,
        video_id: result.checkIn.videoId,
        action: result.checkIn.action,
        created_at: result.checkIn.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error, userId: user.id, videoId }, 'Failed to perform check-in');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

export default router;
