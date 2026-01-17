// File storage configuration and initialization
// Handles storage directory setup and permission verification

import fs from 'fs';
import path from 'path';
import { getConfig } from './config';
import { createChildLogger } from './logger';

// Create a child logger for storage operations
const storageLogger = createChildLogger({ component: 'storage' });

/**
 * Storage initialization error
 */
export class StorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StorageError';
  }
}

/**
 * Storage configuration and paths
 */
export interface StorageConfig {
  // Absolute path to the storage root directory
  rootPath: string;
  // Maximum file size in bytes
  maxFileSizeBytes: number;
}

let storageConfig: StorageConfig | null = null;

/**
 * Resolve the storage path to an absolute path
 * Handles both absolute and relative paths
 */
function resolveStoragePath(storagePath: string): string {
  if (path.isAbsolute(storagePath)) {
    return storagePath;
  }
  // Resolve relative to the server directory (parent of src)
  return path.resolve(__dirname, '..', storagePath);
}

/**
 * Create directory if it doesn't exist
 * Creates parent directories as needed
 */
function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      storageLogger.info({ path: dirPath }, 'Created storage directory');
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new StorageError(
        `Failed to create storage directory "${dirPath}": ${err.message}`
      );
    }
  }
}

/**
 * Verify write permissions by attempting to create and delete a test file
 */
function verifyWritePermissions(dirPath: string): void {
  const testFile = path.join(dirPath, `.write-test-${Date.now()}`);

  try {
    // Try to write a test file
    fs.writeFileSync(testFile, 'test');
    // Clean up the test file
    fs.unlinkSync(testFile);
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    throw new StorageError(
      `Storage directory "${dirPath}" is not writable: ${err.message}. ` +
      `Please check file permissions.`
    );
  }
}

/**
 * Initialize file storage
 * - Resolves storage path from config
 * - Creates directory if it doesn't exist
 * - Verifies write permissions
 *
 * @throws StorageError if initialization fails
 */
export function initializeStorage(): StorageConfig {
  const config = getConfig();

  const rootPath = resolveStoragePath(config.storagePath);
  const maxFileSizeBytes = config.maxFileSizeMb * 1024 * 1024;

  storageLogger.info({ path: rootPath }, 'Initializing storage');

  // Create directory if needed
  ensureDirectoryExists(rootPath);

  // Verify we can write to it
  verifyWritePermissions(rootPath);

  storageConfig = {
    rootPath,
    maxFileSizeBytes,
  };

  storageLogger.info(
    { path: rootPath, maxFileSizeMb: config.maxFileSizeMb },
    'Storage initialized successfully'
  );

  return storageConfig;
}

/**
 * Get the storage configuration
 * @throws StorageError if storage has not been initialized
 */
export function getStorageConfig(): StorageConfig {
  if (!storageConfig) {
    throw new StorageError(
      'Storage not initialized. Call initializeStorage() at application startup.'
    );
  }
  return storageConfig;
}

/**
 * Get the absolute path for a video file
 * @param userId - The user's ID (used for organizing files by user)
 * @param filename - The video filename
 * @returns Absolute path to the video file
 */
export function getVideoPath(userId: string, filename: string): string {
  const storage = getStorageConfig();
  return path.join(storage.rootPath, userId, filename);
}

/**
 * Get the user's storage directory path
 * @param userId - The user's ID
 * @returns Absolute path to the user's storage directory
 */
export function getUserStoragePath(userId: string): string {
  const storage = getStorageConfig();
  return path.join(storage.rootPath, userId);
}

/**
 * Ensure a user's storage directory exists
 * @param userId - The user's ID
 */
export function ensureUserStorageDirectory(userId: string): void {
  const userPath = getUserStoragePath(userId);
  ensureDirectoryExists(userPath);
}
