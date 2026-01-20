// Public routes - handles unauthenticated access to distributed videos
// GET /api/public/videos/:token - Download video using public token

import { Router, Request, Response } from 'express';
import { findVideoByPublicToken } from '../services/video.service';
import { getStorageConfig } from '../storage';
import { createChildLogger } from '../logger';
import { publicVideoRateLimiter } from '../middleware';
import fs from 'fs';
import path from 'path';

const logger = createChildLogger({ component: 'public-routes' });

const router: Router = Router();

// Apply rate limiting to all public video routes
// Limits: 100 requests per 15 minutes per IP
router.use('/videos', publicVideoRateLimiter);

/**
 * Parse HTTP Range header for partial content requests.
 * Supports format: bytes=start-end or bytes=start-
 *
 * @param rangeHeader - The Range header value (e.g., "bytes=0-1023")
 * @param fileSize - Total file size in bytes
 * @returns Object with start, end, and chunkSize, or null if invalid
 */
export function parseRangeHeader(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number; chunkSize: number } | null {
  // Range header format: bytes=start-end or bytes=start-
  const match = rangeHeader.match(/^bytes=(\d+)-(\d*)$/);
  if (!match || !match[1]) {
    return null;
  }

  const start = parseInt(match[1], 10);
  // If end is not specified, use fileSize - 1
  const end = match[2] ? parseInt(match[2], 10) : fileSize - 1;

  // Validate range
  if (start < 0 || start >= fileSize || end < start || end >= fileSize) {
    return null;
  }

  return {
    start,
    end,
    chunkSize: end - start + 1,
  };
}

/**
 * GET /api/public/videos/:token
 * Download video using public token. No authentication required.
 * Supports HTTP Range requests for video seeking functionality.
 * Rate limited to prevent abuse (100 requests per 15 minutes per IP).
 *
 * Path parameters:
 *   - token: string (required) - The video's public access token (UUID)
 *
 * Headers:
 *   - Range: bytes=start-end (optional) - Request partial content for seeking
 *
 * Response headers (when rate limiting is active):
 *   - X-RateLimit-Limit: Maximum requests allowed
 *   - X-RateLimit-Remaining: Requests remaining in current window
 *   - X-RateLimit-Reset: Unix timestamp when the rate limit resets
 *
 * Response:
 *   - 200: Full video file (binary stream) with proper Content-Type and Content-Length
 *   - 206: Partial content with Content-Range header for range requests
 *   - 404: { error: string } - Video not found or not yet distributed
 *   - 410: { error: string } - Video has expired
 *   - 416: Range not satisfiable
 *   - 429: { error: string, retryAfter: number } - Rate limit exceeded
 *   - 500: { error: string } - Internal server error
 */
router.get('/videos/:token', async (req: Request<{ token: string }>, res: Response): Promise<void> => {
  const { token } = req.params;

  try {
    // Find video by public token
    const video = await findVideoByPublicToken(token);

    // Check if video exists
    if (!video) {
      logger.debug({ token }, 'Video not found for public token');
      res.status(404).json({
        error: 'Video not found',
        message: 'The requested video does not exist',
      });
      return;
    }

    // Check video status - only DISTRIBUTED videos can be accessed
    if (video.status === 'PENDING' || video.status === 'ACTIVE') {
      logger.debug(
        { token, videoId: video.id, status: video.status },
        'Video not yet distributed'
      );
      res.status(404).json({
        error: 'Video not found',
        message: 'The requested video is not available yet',
      });
      return;
    }

    if (video.status === 'EXPIRED') {
      logger.debug({ token, videoId: video.id }, 'Video has expired');
      res.status(410).json({
        error: 'Video expired',
        message: 'This video is no longer available',
      });
      return;
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
      res.status(404).json({
        error: 'Video not found',
        message: 'The video file could not be found',
      });
      return;
    }

    // Get file stats for Content-Length
    const stat = fs.statSync(absoluteFilePath);
    const fileSize = stat.size;

    // Set Content-Disposition to suggest a filename for download
    const filename = `${video.title.replace(/[^a-zA-Z0-9_-]/g, '_')}${path.extname(video.filePath)}`;

    // Check for Range header (for video seeking support)
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      // Handle range request (206 Partial Content)
      const range = parseRangeHeader(rangeHeader, fileSize);

      if (!range) {
        // Invalid range - return 416 Range Not Satisfiable
        logger.debug(
          { token, videoId: video.id, rangeHeader, fileSize },
          'Invalid range request'
        );
        res.setHeader('Content-Range', `bytes */${fileSize}`);
        res.status(416).json({
          error: 'Range not satisfiable',
          message: 'The requested range is not valid for the video file',
        });
        return;
      }

      const { start, end, chunkSize } = range;

      logger.info(
        { token, videoId: video.id, start, end, chunkSize, fileSize },
        'Streaming partial video content'
      );

      // Set headers for partial content response
      res.status(206);
      res.setHeader('Content-Type', video.mimeType);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      // Stream the requested byte range
      const readStream = fs.createReadStream(absoluteFilePath, { start, end });
      readStream.pipe(res);

      // Handle stream errors
      readStream.on('error', (err) => {
        logger.error(
          { err, token, videoId: video.id, filePath: video.filePath, start, end },
          'Error streaming partial video content'
        );
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal server error' });
        }
      });
    } else {
      // Full file request (200 OK)
      res.setHeader('Content-Type', video.mimeType);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

      logger.info(
        { token, videoId: video.id, fileSize },
        'Streaming full video file'
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
    }
  } catch (error) {
    logger.error({ err: error, token }, 'Failed to retrieve video for public access');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
