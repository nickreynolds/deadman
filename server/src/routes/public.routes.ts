// Public routes - handles unauthenticated access to distributed videos
// GET /api/public/videos/:token - Download video using public token

import { Router, Request, Response } from 'express';
import { findVideoByPublicToken } from '../services/video.service';
import { getStorageConfig } from '../storage';
import { createChildLogger } from '../logger';
import fs from 'fs';
import path from 'path';

const logger = createChildLogger({ component: 'public-routes' });

const router: Router = Router();

/**
 * GET /api/public/videos/:token
 * Download video using public token. No authentication required.
 *
 * Path parameters:
 *   - token: string (required) - The video's public access token (UUID)
 *
 * Response:
 *   - 200: Video file (binary stream) with proper Content-Type and Content-Length
 *   - 404: { error: string } - Video not found or not yet distributed
 *   - 410: { error: string } - Video has expired
 *   - 500: { error: string } - Internal server error
 */
router.get('/videos/:token', async (req: Request<{ token: string }>, res: Response) => {
  const { token } = req.params;

  try {
    // Find video by public token
    const video = await findVideoByPublicToken(token);

    // Check if video exists
    if (!video) {
      logger.debug({ token }, 'Video not found for public token');
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
    }

    // Check video status - only DISTRIBUTED videos can be accessed
    if (video.status === 'PENDING' || video.status === 'ACTIVE') {
      logger.debug(
        { token, videoId: video.id, status: video.status },
        'Video not yet distributed'
      );
      return res.status(404).json({
        error: 'Video not found',
        message: 'The requested video is not available yet',
      });
    }

    if (video.status === 'EXPIRED') {
      logger.debug({ token, videoId: video.id }, 'Video has expired');
      return res.status(410).json({
        error: 'Video expired',
        message: 'This video is no longer available',
      });
    }

    // Video is DISTRIBUTED - serve the file
    const storageConfig = getStorageConfig();
    const absoluteFilePath = path.join(storageConfig.rootPath, video.filePath);

    // Check if file exists on disk
    if (!fs.existsSync(absoluteFilePath)) {
      logger.error(
        { token, videoId: video.id, filePath: video.filePath },
        'Video file not found on disk'
      );
      return res.status(404).json({
        error: 'Video not found',
        message: 'The video file could not be found',
      });
    }

    // Get file stats for Content-Length
    const stat = fs.statSync(absoluteFilePath);
    const fileSize = stat.size;

    // Set headers for video streaming
    res.setHeader('Content-Type', video.mimeType);
    res.setHeader('Content-Length', fileSize);
    res.setHeader('Accept-Ranges', 'bytes');

    // Set Content-Disposition to suggest a filename for download
    const filename = `${video.title.replace(/[^a-zA-Z0-9_-]/g, '_')}${path.extname(video.filePath)}`;
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    logger.info(
      { token, videoId: video.id, fileSize },
      'Streaming video file'
    );

    // Stream the video file
    const readStream = fs.createReadStream(absoluteFilePath);
    readStream.pipe(res);

    // Handle stream errors
    readStream.on('error', (err) => {
      logger.error(
        { err, token, videoId: video.id, filePath: video.filePath },
        'Error streaming video file'
      );
      // Only send error if headers haven't been sent
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  } catch (error) {
    logger.error({ err: error, token }, 'Failed to retrieve video for public access');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
