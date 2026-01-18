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
} from '../services/video.service';
import { createChildLogger } from '../logger';
import { getUserStoragePath } from '../storage';
import { generateAutoTitle } from '../utils/title-generator';
import path from 'path';

const logger = createChildLogger({ component: 'video-routes' });

const router: Router = Router();

/**
 * Calculate distribution timestamp based on user's timer setting
 * @param timerDays - Number of days until distribution
 * @returns Date object for distribution time
 */
function calculateDistributeAt(timerDays: number): Date {
  const now = new Date();
  now.setDate(now.getDate() + timerDays);
  return now;
}

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
