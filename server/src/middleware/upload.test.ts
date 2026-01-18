// Tests for Multer upload middleware configuration

import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import {
  UploadError,
  ALLOWED_VIDEO_MIME_TYPES,
  ALLOWED_VIDEO_EXTENSIONS,
  videoFileFilter,
  generateUniqueFilename,
  handleUploadError,
} from './upload';

// Mock dependencies
jest.mock('../storage', () => ({
  getStorageConfig: jest.fn(() => ({
    rootPath: '/tmp/test-storage',
    maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
  })),
  ensureUserStorageDirectory: jest.fn(),
  getUserStoragePath: jest.fn((userId: string) => `/tmp/test-storage/${userId}`),
}));

jest.mock('../logger', () => ({
  createChildLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('Upload Middleware', () => {
  describe('ALLOWED_VIDEO_MIME_TYPES', () => {
    it('should include common video MIME types', () => {
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/mp4');
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/quicktime'); // iOS .mov
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/webm');
      expect(ALLOWED_VIDEO_MIME_TYPES).toContain('video/3gpp'); // Android
    });

    it('should be an array of strings', () => {
      expect(Array.isArray(ALLOWED_VIDEO_MIME_TYPES)).toBe(true);
      ALLOWED_VIDEO_MIME_TYPES.forEach((mimeType) => {
        expect(typeof mimeType).toBe('string');
        expect(mimeType).toMatch(/^video\//);
      });
    });
  });

  describe('ALLOWED_VIDEO_EXTENSIONS', () => {
    it('should include common video extensions', () => {
      expect(ALLOWED_VIDEO_EXTENSIONS).toContain('.mp4');
      expect(ALLOWED_VIDEO_EXTENSIONS).toContain('.mov');
      expect(ALLOWED_VIDEO_EXTENSIONS).toContain('.webm');
      expect(ALLOWED_VIDEO_EXTENSIONS).toContain('.3gp');
    });

    it('should all start with a dot', () => {
      ALLOWED_VIDEO_EXTENSIONS.forEach((ext) => {
        expect(ext).toMatch(/^\./);
      });
    });
  });

  describe('videoFileFilter', () => {
    const mockRequest = {} as Request;

    it('should accept valid video files', () => {
      const validFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'test-video.mp4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, validFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should accept .mov files from iOS', () => {
      const movFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'ios-recording.mov',
        encoding: '7bit',
        mimetype: 'video/quicktime',
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, movFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });

    it('should reject files with invalid MIME type', () => {
      const invalidFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'document.pdf',
        encoding: '7bit',
        mimetype: 'application/pdf',
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, invalidFile, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const error = callback.mock.calls[0][0];
      expect(error).toBeInstanceOf(UploadError);
      expect(error.message).toContain('Invalid file type');
    });

    it('should reject files with invalid extension', () => {
      const invalidFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'video.exe',
        encoding: '7bit',
        mimetype: 'video/mp4', // MIME type valid but extension not
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, invalidFile, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const error = callback.mock.calls[0][0];
      expect(error).toBeInstanceOf(UploadError);
      expect(error.message).toContain('Invalid file extension');
    });

    it('should reject image files', () => {
      const imageFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'image.jpg',
        encoding: '7bit',
        mimetype: 'image/jpeg',
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, imageFile, callback);

      expect(callback).toHaveBeenCalledTimes(1);
      const error = callback.mock.calls[0][0];
      expect(error).toBeInstanceOf(UploadError);
    });

    it('should handle case-insensitive extensions', () => {
      const upperCaseFile: Express.Multer.File = {
        fieldname: 'video',
        originalname: 'VIDEO.MP4',
        encoding: '7bit',
        mimetype: 'video/mp4',
        destination: '',
        filename: '',
        path: '',
        size: 0,
        stream: null as any,
        buffer: Buffer.from([]),
      };

      const callback = jest.fn();
      videoFileFilter(mockRequest, upperCaseFile, callback);

      expect(callback).toHaveBeenCalledWith(null, true);
    });
  });

  describe('generateUniqueFilename', () => {
    it('should generate a UUID-based filename', () => {
      const filename = generateUniqueFilename('original.mp4');

      // UUID v4 pattern: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.mp4$/i;
      expect(filename).toMatch(uuidPattern);
    });

    it('should preserve the original file extension', () => {
      const mp4Filename = generateUniqueFilename('video.mp4');
      expect(mp4Filename).toMatch(/\.mp4$/);

      const movFilename = generateUniqueFilename('video.mov');
      expect(movFilename).toMatch(/\.mov$/);

      const webmFilename = generateUniqueFilename('video.webm');
      expect(webmFilename).toMatch(/\.webm$/);
    });

    it('should convert extension to lowercase', () => {
      const filename = generateUniqueFilename('VIDEO.MP4');
      expect(filename).toMatch(/\.mp4$/);
    });

    it('should generate unique filenames', () => {
      const filename1 = generateUniqueFilename('video.mp4');
      const filename2 = generateUniqueFilename('video.mp4');

      expect(filename1).not.toBe(filename2);
    });
  });

  describe('UploadError', () => {
    it('should create an error with default status code 400', () => {
      const error = new UploadError('Test error');

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.name).toBe('UploadError');
    });

    it('should accept custom status code', () => {
      const error = new UploadError('Unauthorized', 401);

      expect(error.statusCode).toBe(401);
    });

    it('should be an instance of Error', () => {
      const error = new UploadError('Test');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UploadError);
    });
  });

  describe('handleUploadError', () => {
    let mockRequest: Request;
    let mockResponse: Response;
    let mockNext: NextFunction;

    beforeEach(() => {
      mockRequest = {} as Request;
      mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      } as unknown as Response;
      mockNext = jest.fn();
    });

    it('should handle LIMIT_FILE_SIZE error with 413 status', () => {
      const error = new multer.MulterError('LIMIT_FILE_SIZE');

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(413);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'File too large',
          code: 'FILE_TOO_LARGE',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle LIMIT_FILE_COUNT error', () => {
      const error = new multer.MulterError('LIMIT_FILE_COUNT');

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Too many files',
          code: 'TOO_MANY_FILES',
        })
      );
    });

    it('should handle LIMIT_UNEXPECTED_FILE error', () => {
      const error = new multer.MulterError('LIMIT_UNEXPECTED_FILE');

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unexpected field',
          code: 'UNEXPECTED_FIELD',
        })
      );
    });

    it('should handle UploadError', () => {
      const error = new UploadError('Invalid file type', 400);

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Upload error',
          message: 'Invalid file type',
        })
      );
    });

    it('should handle UploadError with custom status code', () => {
      const error = new UploadError('Unauthorized', 401);

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should pass unknown errors to next middleware', () => {
      const error = new Error('Unknown error');

      handleUploadError(error, mockRequest, mockResponse, mockNext);

      expect(mockResponse.status).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledWith(error);
    });
  });
});
