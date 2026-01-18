// Multer configuration for video file uploads
// Handles multipart/form-data with video MIME type validation and file size limits

import multer, { FileFilterCallback, StorageEngine } from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getStorageConfig, ensureUserStorageDirectory, getUserStoragePath } from '../storage';
import { createChildLogger } from '../logger';
import { AuthenticatedUser } from '../auth/passport';

// Create a child logger for upload operations
const uploadLogger = createChildLogger({ component: 'upload' });

/**
 * Upload error class for handling upload-specific errors
 */
export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.name = 'UploadError';
    this.statusCode = statusCode;
  }
}

/**
 * Allowed video MIME types
 * These are the common video formats supported by mobile devices
 */
export const ALLOWED_VIDEO_MIME_TYPES = [
  'video/mp4',
  'video/quicktime', // .mov files from iOS
  'video/x-msvideo', // .avi
  'video/x-matroska', // .mkv
  'video/webm',
  'video/3gpp', // .3gp from older Android
  'video/3gpp2', // .3g2
  'video/mpeg',
  'video/ogg',
];

/**
 * Allowed video file extensions
 */
export const ALLOWED_VIDEO_EXTENSIONS = [
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.3gp',
  '.3g2',
  '.mpeg',
  '.mpg',
  '.ogv',
];

/**
 * File filter function to validate video files
 * Checks both MIME type and file extension for security
 */
export function videoFileFilter(
  req: Request,
  file: Express.Multer.File,
  callback: FileFilterCallback
): void {
  const ext = path.extname(file.originalname).toLowerCase();
  const mimeType = file.mimetype.toLowerCase();

  // Check if the MIME type is allowed
  if (!ALLOWED_VIDEO_MIME_TYPES.includes(mimeType)) {
    uploadLogger.warn(
      { mimeType, originalname: file.originalname },
      'Rejected file: invalid MIME type'
    );
    return callback(new UploadError(`Invalid file type. Allowed types: ${ALLOWED_VIDEO_MIME_TYPES.join(', ')}`));
  }

  // Check if the file extension is allowed
  if (!ALLOWED_VIDEO_EXTENSIONS.includes(ext)) {
    uploadLogger.warn(
      { extension: ext, originalname: file.originalname },
      'Rejected file: invalid extension'
    );
    return callback(new UploadError(`Invalid file extension. Allowed extensions: ${ALLOWED_VIDEO_EXTENSIONS.join(', ')}`));
  }

  // File is valid
  callback(null, true);
}

/**
 * Generate a unique filename for the uploaded video
 * Uses UUID to prevent collisions and preserve original extension
 */
export function generateUniqueFilename(originalname: string): string {
  const ext = path.extname(originalname).toLowerCase();
  const uuid = uuidv4();
  return `${uuid}${ext}`;
}

/**
 * Create multer disk storage engine
 * Files are stored in user-specific directories
 */
function createDiskStorage(): StorageEngine {
  return multer.diskStorage({
    destination: (
      req: Request,
      _file: Express.Multer.File,
      callback: (error: Error | null, destination: string) => void
    ) => {
      // Get the authenticated user from the request
      const user = req.user as AuthenticatedUser | undefined;

      if (!user) {
        // This shouldn't happen if requireAuth middleware is used
        return callback(new UploadError('Authentication required', 401), '');
      }

      try {
        // Ensure the user's storage directory exists
        ensureUserStorageDirectory(user.id);
        const userPath = getUserStoragePath(user.id);

        uploadLogger.debug(
          { userId: user.id, path: userPath },
          'Upload destination resolved'
        );

        callback(null, userPath);
      } catch (error) {
        const err = error as Error;
        uploadLogger.error(
          { userId: user.id, error: err.message },
          'Failed to create user storage directory'
        );
        callback(new UploadError('Failed to prepare upload destination', 500), '');
      }
    },

    filename: (
      _req: Request,
      file: Express.Multer.File,
      callback: (error: Error | null, filename: string) => void
    ) => {
      const filename = generateUniqueFilename(file.originalname);
      uploadLogger.debug(
        { originalname: file.originalname, filename },
        'Generated unique filename'
      );
      callback(null, filename);
    },
  });
}

/**
 * Create the multer upload middleware instance
 * Configured with disk storage, file size limits, and video file filter
 */
export function createUploadMiddleware(): multer.Multer {
  const storageConfig = getStorageConfig();

  return multer({
    storage: createDiskStorage(),
    fileFilter: videoFileFilter,
    limits: {
      fileSize: storageConfig.maxFileSizeBytes,
      files: 1, // Only allow single file upload per request
    },
  });
}

/**
 * Get a configured multer instance
 * This is the main export for use in routes
 */
let uploadInstance: multer.Multer | null = null;

export function getUploadMiddleware(): multer.Multer {
  if (!uploadInstance) {
    uploadInstance = createUploadMiddleware();
  }
  return uploadInstance;
}

/**
 * Middleware wrapper that handles multer errors with proper HTTP responses
 * Use this to wrap the multer middleware for better error handling
 */
export function handleUploadError(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle multer-specific errors
  if (err instanceof multer.MulterError) {
    uploadLogger.warn(
      { code: err.code, field: err.field, message: err.message },
      'Multer error during upload'
    );

    switch (err.code) {
      case 'LIMIT_FILE_SIZE':
        const storageConfig = getStorageConfig();
        const maxSizeMb = Math.round(storageConfig.maxFileSizeBytes / (1024 * 1024));
        res.status(413).json({
          error: 'File too large',
          message: `File size exceeds the maximum allowed size of ${maxSizeMb} MB`,
          code: 'FILE_TOO_LARGE',
        });
        return;

      case 'LIMIT_FILE_COUNT':
        res.status(400).json({
          error: 'Too many files',
          message: 'Only single file uploads are allowed',
          code: 'TOO_MANY_FILES',
        });
        return;

      case 'LIMIT_UNEXPECTED_FILE':
        res.status(400).json({
          error: 'Unexpected field',
          message: 'File must be uploaded with field name "video"',
          code: 'UNEXPECTED_FIELD',
        });
        return;

      default:
        res.status(400).json({
          error: 'Upload error',
          message: err.message,
          code: err.code,
        });
        return;
    }
  }

  // Handle our custom upload errors
  if (err instanceof UploadError) {
    uploadLogger.warn(
      { message: err.message, statusCode: err.statusCode },
      'Upload validation error'
    );
    res.status(err.statusCode).json({
      error: 'Upload error',
      message: err.message,
    });
    return;
  }

  // Pass other errors to the default error handler
  next(err);
}

/**
 * Clean up a file after a failed upload
 * Used to remove partial or invalid files from disk
 */
export async function cleanupUploadedFile(filePath: string): Promise<void> {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      uploadLogger.info({ path: filePath }, 'Cleaned up uploaded file');
    }
  } catch (error) {
    const err = error as Error;
    uploadLogger.error(
      { path: filePath, error: err.message },
      'Failed to cleanup uploaded file'
    );
    // Don't throw - cleanup failures shouldn't crash the application
  }
}

/**
 * Get the temporary files directory path
 * Used for in-progress uploads that haven't been validated yet
 */
export function getTempUploadPath(): string {
  const storageConfig = getStorageConfig();
  const tempPath = path.join(storageConfig.rootPath, '.temp');

  // Ensure temp directory exists
  if (!fs.existsSync(tempPath)) {
    fs.mkdirSync(tempPath, { recursive: true });
  }

  return tempPath;
}
