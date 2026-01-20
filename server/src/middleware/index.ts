// Middleware exports
// Central export point for all custom middleware

export {
  UploadError,
  ALLOWED_VIDEO_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  videoFileFilter,
  generateUniqueFilename,
  createUploadMiddleware,
  getUploadMiddleware,
  handleUploadError,
  cleanupUploadedFile,
  getTempUploadPath,
} from './upload';

export {
  createRateLimiter,
  publicVideoRateLimiter,
  publicVideoDownloadRateLimiter,
  resetRateLimiterStore,
  type RateLimiterOptions,
} from './rate-limiter';
