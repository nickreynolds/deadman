// Integration tests for Video Upload Routes
// Tests POST /api/videos/upload endpoint

import { Request, Response, NextFunction } from 'express';
import { mockConfig, createMockUser } from '../test/mocks';

// Mock dependencies before imports
jest.mock('../config', () => ({
  getConfig: jest.fn(() => mockConfig),
}));

jest.mock('../logger', () => ({
  createChildLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock storage module
jest.mock('../storage', () => ({
  getStorageConfig: jest.fn(() => ({
    rootPath: '/tmp/test-storage',
    maxFileSizeBytes: 500 * 1024 * 1024, // 500 MB
  })),
  ensureUserStorageDirectory: jest.fn(),
  getUserStoragePath: jest.fn((userId: string) => `/tmp/test-storage/${userId}`),
}));

// Mock video service functions
const mockCreateVideo = jest.fn();
const mockUpdateUserStorageUsage = jest.fn();
const mockCheckUserStorageQuota = jest.fn();
const mockGetUserDefaultTimerDays = jest.fn();
const mockGetVideosByUser = jest.fn();
const mockFindVideoById = jest.fn();
const mockUpdateVideoTitle = jest.fn();

jest.mock('../services/video.service', () => ({
  createVideo: (...args: unknown[]) => mockCreateVideo(...args),
  updateUserStorageUsage: (...args: unknown[]) => mockUpdateUserStorageUsage(...args),
  checkUserStorageQuota: (...args: unknown[]) => mockCheckUserStorageQuota(...args),
  getUserDefaultTimerDays: (...args: unknown[]) => mockGetUserDefaultTimerDays(...args),
  getVideosByUser: (...args: unknown[]) => mockGetVideosByUser(...args),
  findVideoById: (...args: unknown[]) => mockFindVideoById(...args),
  updateVideoTitle: (...args: unknown[]) => mockUpdateVideoTitle(...args),
}));

// Mock upload middleware
const mockCleanupUploadedFile = jest.fn();
const mockGetUploadMiddleware = jest.fn();

jest.mock('../middleware/upload', () => ({
  getUploadMiddleware: () => mockGetUploadMiddleware(),
  handleUploadError: jest.fn((err, req, res, next) => {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: 'File too large' });
    }
    next(err);
  }),
  cleanupUploadedFile: (...args: unknown[]) => mockCleanupUploadedFile(...args),
}));

// Mock authentication middleware
const mockRequireAuth = jest.fn();
const mockGetAuthenticatedUser = jest.fn();

jest.mock('../auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => mockRequireAuth(req, res, next),
  getAuthenticatedUser: (req: Request) => mockGetAuthenticatedUser(req),
}));

// Import router after all mocks are set up
import videoRouter from './video.routes';

// Create mock authenticated user
const mockUser = createMockUser({
  id: 'test-user-id-123',
  storageQuotaBytes: BigInt(1073741824), // 1GB
  storageUsedBytes: BigInt(0),
  defaultTimerDays: 7,
});

// Helper to create mock Express objects
function createMockReqRes(options: {
  file?: Express.Multer.File | null;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  params?: Record<string, string>;
} = {}) {
  const req = {
    body: options.body || {},
    file: options.file,
    query: options.query || {},
    params: options.params || {},
    user: mockUser,
  } as unknown as Request;

  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const res = {
    json: jsonMock,
    status: statusMock,
  } as unknown as Response;

  const nextMock = jest.fn();

  return { req, res, jsonMock, statusMock, nextMock };
}

// Create a mock file object
function createMockFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'video',
    originalname: 'test-video.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    destination: '/tmp/test-storage/test-user-id-123',
    filename: 'abc123-uuid.mp4',
    path: '/tmp/test-storage/test-user-id-123/abc123-uuid.mp4',
    size: 10485760, // 10 MB
    stream: null as any,
    buffer: Buffer.from([]),
    ...overrides,
  };
}

// Get specific middleware/handler from router stack
function getRouteStack(method: string, path: string): Function[] {
  const stack = (videoRouter as any).stack;
  for (const layer of stack) {
    if (layer.route && layer.route.path === path) {
      // Check if this route has handlers for the requested method
      const hasMethod = layer.route.stack.some((s: any) => s.method === method);
      if (hasMethod || layer.route.methods[method]) {
        return layer.route.stack
          .filter((s: any) => s.method === method || !s.method)
          .map((s: any) => s.handle);
      }
    }
  }
  throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
}

describe('Video Routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Default auth mock behavior - passes authentication
    mockRequireAuth.mockImplementation((req, res, next) => {
      req.user = mockUser;
      next();
    });

    mockGetAuthenticatedUser.mockReturnValue(mockUser);

    // Default quota check - user has quota
    mockCheckUserStorageQuota.mockResolvedValue({
      hasQuota: true,
      quotaBytes: BigInt(1073741824),
      usedBytes: BigInt(0),
      remainingBytes: BigInt(1073741824),
    });

    // Default timer days
    mockGetUserDefaultTimerDays.mockResolvedValue(7);

    // Default upload middleware - passes through
    mockGetUploadMiddleware.mockReturnValue({
      single: () => (req: Request, res: Response, next: NextFunction) => next(),
    });

    // Default cleanup - resolves
    mockCleanupUploadedFile.mockResolvedValue(undefined);
  });

  describe('POST /upload', () => {
    const handlers = getRouteStack('post', '/upload');
    const authMiddleware = handlers[0]!; // requireAuth
    const quotaCheckMiddleware = handlers[1]!; // pre-upload quota check
    const uploadMiddleware = handlers[2]!; // multer wrapper
    const processHandler = handlers[3]!; // main handler

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated', async () => {
        const { req, res, nextMock } = createMockReqRes();

        await authMiddleware(req, res, nextMock);

        expect(mockRequireAuth).toHaveBeenCalledWith(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();
        expect(req.user).toBe(mockUser);
      });
    });

    describe('Pre-upload quota check', () => {
      it('should reject when user has no remaining quota', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockCheckUserStorageQuota.mockResolvedValue({
          hasQuota: false,
          quotaBytes: BigInt(1073741824),
          usedBytes: BigInt(1073741824),
          remainingBytes: BigInt(0),
        });

        await quotaCheckMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(413);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Storage quota exceeded',
            message: expect.stringContaining('no storage quota remaining'),
          })
        );
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when user has quota remaining', async () => {
        const { req, res, nextMock } = createMockReqRes();

        await quotaCheckMiddleware(req, res, nextMock);

        expect(mockCheckUserStorageQuota).toHaveBeenCalledWith(mockUser.id, BigInt(0));
        expect(nextMock).toHaveBeenCalled();
      });

      it('should return 500 on storage quota check error', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockCheckUserStorageQuota.mockRejectedValue(new Error('Database error'));

        await quotaCheckMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });

    describe('File upload handling', () => {
      it('should call multer middleware for file upload', async () => {
        const { req, res, nextMock } = createMockReqRes();
        const singleMock = jest.fn().mockImplementation((req, res, next) => next());
        mockGetUploadMiddleware.mockReturnValue({ single: () => singleMock });

        await uploadMiddleware(req, res, nextMock);

        expect(mockGetUploadMiddleware).toHaveBeenCalled();
        expect(singleMock).toHaveBeenCalled();
        expect(nextMock).toHaveBeenCalled();
      });

      it('should pass multer errors to error handler', async () => {
        const { req, res, nextMock } = createMockReqRes();
        const multerError = { code: 'LIMIT_FILE_SIZE' };
        const singleMock = jest.fn().mockImplementation((req, res, callback) => {
          callback(multerError);
        });
        mockGetUploadMiddleware.mockReturnValue({ single: () => singleMock });

        await uploadMiddleware(req, res, nextMock);

        // Error should be passed to handleUploadError
        expect(nextMock).not.toHaveBeenCalled();
      });
    });

    describe('Video processing', () => {
      it('should return 400 when no file is uploaded', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({ file: undefined });

        await processHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'No file uploaded',
            message: expect.stringContaining('video'),
          })
        );
      });

      it('should check quota after file upload', async () => {
        const mockFile = createMockFile({ size: 10485760 }); // 10 MB
        const { req, res, statusMock, jsonMock } = createMockReqRes({ file: mockFile });

        // Post-upload quota check fails (file exceeds remaining quota)
        mockCheckUserStorageQuota.mockResolvedValue({
          hasQuota: false,
          quotaBytes: BigInt(1073741824),
          usedBytes: BigInt(1073741824),
          remainingBytes: BigInt(0),
        });

        await processHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(413);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Storage quota exceeded',
            file_size_bytes: '10485760',
          })
        );
        expect(mockCleanupUploadedFile).toHaveBeenCalledWith(mockFile.path);
      });

      it('should create video with user-provided title', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'My Custom Title',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'My Custom Title' },
        });

        await processHandler(req, res);

        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'My Custom Title',
            userId: mockUser.id,
            fileSizeBytes: BigInt(mockFile.size),
            mimeType: 'video/mp4',
          })
        );
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            id: mockVideo.id,
            title: 'My Custom Title',
            public_token: mockVideo.publicToken,
          }),
        });
      });

      it('should auto-generate title when not provided', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Video 2026-01-18 12:00',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({ file: mockFile, body: {} });

        await processHandler(req, res);

        // Title should be auto-generated (starts with "Video")
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/^Video \d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
          })
        );
      });

      it('should auto-generate title with location when provided', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Video 2026-01-18 12:00 - New York',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({
          file: mockFile,
          body: { location: 'New York' },
        });

        await processHandler(req, res);

        // Title should include location
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/^Video \d{4}-\d{2}-\d{2} \d{2}:\d{2} - New York/),
          })
        );
      });

      it('should use user-provided title even when location is provided', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'My Custom Title',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({
          file: mockFile,
          body: { title: 'My Custom Title', location: 'New York' },
        });

        await processHandler(req, res);

        // User-provided title should take precedence
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'My Custom Title',
          })
        );
      });

      it('should update user storage usage after successful upload', async () => {
        const mockFile = createMockFile({ size: 10485760 });
        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({ file: mockFile, body: { title: 'Test Video' } });

        await processHandler(req, res);

        expect(mockUpdateUserStorageUsage).toHaveBeenCalledWith(
          mockUser.id,
          BigInt(10485760)
        );
      });

      it('should use user default timer days for distribute_at calculation', async () => {
        const mockFile = createMockFile();
        const distributeAt = new Date();
        distributeAt.setDate(distributeAt.getDate() + 14); // 14 days from now

        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt,
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);
        mockGetUserDefaultTimerDays.mockResolvedValue(14);

        const { req, res } = createMockReqRes({ file: mockFile, body: { title: 'Test Video' } });

        await processHandler(req, res);

        expect(mockGetUserDefaultTimerDays).toHaveBeenCalledWith(mockUser.id);
        // The distribute_at should be approximately 14 days from now
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            distributeAt: expect.any(Date),
          })
        );
      });

      it('should use default 7 days when user has no timer setting', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date('2026-01-25T00:00:00Z'),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);
        mockGetUserDefaultTimerDays.mockResolvedValue(null);

        const { req, res } = createMockReqRes({ file: mockFile, body: { title: 'Test Video' } });

        await processHandler(req, res);

        // Should use default 7 days
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            distributeAt: expect.any(Date),
          })
        );
      });

      it('should return complete video metadata in response', async () => {
        const mockFile = createMockFile();
        const now = new Date();
        const distributeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt,
          publicToken: 'public-token-uuid',
          createdAt: now,
          updatedAt: now,
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Test Video' },
        });

        await processHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          video: {
            id: 'video-id-123',
            title: 'Test Video',
            file_size_bytes: '10485760',
            mime_type: 'video/mp4',
            status: 'ACTIVE',
            distribute_at: distributeAt.toISOString(),
            public_token: 'public-token-uuid',
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          },
        });
      });

      it('should clean up file and return 500 on create video error', async () => {
        const mockFile = createMockFile();
        mockCreateVideo.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Test Video' },
        });

        await processHandler(req, res);

        expect(mockCleanupUploadedFile).toHaveBeenCalledWith(mockFile.path);
        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should store relative file path for portability', async () => {
        const mockFile = createMockFile({
          path: '/tmp/test-storage/test-user-id-123/abc123-uuid.mp4',
        });
        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({ file: mockFile, body: { title: 'Test Video' } });

        await processHandler(req, res);

        // File path should be relative, not absolute
        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            filePath: expect.stringMatching(/^test-user-id-123\//),
          })
        );
        expect(mockCreateVideo).not.toHaveBeenCalledWith(
          expect.objectContaining({
            filePath: expect.stringContaining('/tmp'),
          })
        );
      });

      it('should trim whitespace from user-provided title', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Trimmed Title',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({
          file: mockFile,
          body: { title: '  Trimmed Title  ' },
        });

        await processHandler(req, res);

        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Trimmed Title',
          })
        );
      });

      it('should auto-generate title when user provides empty string', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Video 2026-01-18 12:00',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res } = createMockReqRes({
          file: mockFile,
          body: { title: '   ' }, // Empty after trimming
        });

        await processHandler(req, res);

        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            title: expect.stringMatching(/^Video \d{4}-\d{2}-\d{2} \d{2}:\d{2}/),
          })
        );
      });
    });

    describe('Quota exceeded scenarios', () => {
      it('should include detailed quota info when file exceeds remaining quota', async () => {
        const mockFile = createMockFile({ size: 500000000 }); // 500 MB
        mockCheckUserStorageQuota.mockResolvedValue({
          hasQuota: false,
          quotaBytes: BigInt(1073741824),
          usedBytes: BigInt(800000000),
          remainingBytes: BigInt(273741824), // ~261 MB remaining, not enough for 500 MB file
        });

        const { req, res, statusMock, jsonMock } = createMockReqRes({ file: mockFile });

        await processHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(413);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            error: 'Storage quota exceeded',
            file_size_bytes: '500000000',
            quota_bytes: '1073741824',
            used_bytes: '800000000',
            remaining_bytes: '273741824',
          })
        );
      });

      it('should include human-readable message in quota error', async () => {
        const mockFile = createMockFile({ size: 500000000 }); // 500 MB
        mockCheckUserStorageQuota.mockResolvedValue({
          hasQuota: false,
          quotaBytes: BigInt(1073741824),
          usedBytes: BigInt(800000000),
          remainingBytes: BigInt(273741824),
        });

        const { req, res, jsonMock } = createMockReqRes({ file: mockFile });

        await processHandler(req, res);

        const response = jsonMock.mock.calls[0][0];
        expect(response.message).toContain('exceeds your remaining storage quota');
      });
    });

    describe('Error handling', () => {
      it('should handle storage usage update error gracefully', async () => {
        const mockFile = createMockFile();
        const mockVideo = {
          id: 'video-id-123',
          title: 'Test Video',
          filePath: 'test-user-id-123/abc123-uuid.mp4',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/mp4',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);
        mockUpdateUserStorageUsage.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Test Video' },
        });

        await processHandler(req, res);

        expect(mockCleanupUploadedFile).toHaveBeenCalledWith(mockFile.path);
        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should handle timer days fetch error gracefully', async () => {
        const mockFile = createMockFile();
        mockGetUserDefaultTimerDays.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Test Video' },
        });

        await processHandler(req, res);

        expect(mockCleanupUploadedFile).toHaveBeenCalledWith(mockFile.path);
        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should handle post-upload quota check error gracefully', async () => {
        const mockFile = createMockFile();
        mockCheckUserStorageQuota
          .mockResolvedValueOnce({
            hasQuota: true,
            quotaBytes: BigInt(1073741824),
            usedBytes: BigInt(0),
            remainingBytes: BigInt(1073741824),
          })
          .mockRejectedValueOnce(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Test Video' },
        });

        await processHandler(req, res);

        expect(mockCleanupUploadedFile).toHaveBeenCalledWith(mockFile.path);
        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });

    describe('Different file types', () => {
      it('should accept MOV files from iOS', async () => {
        const mockFile = createMockFile({
          originalname: 'ios-recording.mov',
          mimetype: 'video/quicktime',
          filename: 'abc123-uuid.mov',
          path: '/tmp/test-storage/test-user-id-123/abc123-uuid.mov',
        });
        const mockVideo = {
          id: 'video-id-123',
          title: 'iOS Recording',
          filePath: 'test-user-id-123/abc123-uuid.mov',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/quicktime',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'iOS Recording' },
        });

        await processHandler(req, res);

        expect(mockCreateVideo).toHaveBeenCalledWith(
          expect.objectContaining({
            mimeType: 'video/quicktime',
          })
        );
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              mime_type: 'video/quicktime',
            }),
          })
        );
      });

      it('should accept WebM files', async () => {
        const mockFile = createMockFile({
          originalname: 'screen-recording.webm',
          mimetype: 'video/webm',
          filename: 'abc123-uuid.webm',
          path: '/tmp/test-storage/test-user-id-123/abc123-uuid.webm',
        });
        const mockVideo = {
          id: 'video-id-123',
          title: 'Screen Recording',
          filePath: 'test-user-id-123/abc123-uuid.webm',
          fileSizeBytes: BigInt(10485760),
          mimeType: 'video/webm',
          status: 'ACTIVE',
          distributeAt: new Date(),
          publicToken: 'public-token-uuid',
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCreateVideo.mockResolvedValue(mockVideo);

        const { req, res, jsonMock } = createMockReqRes({
          file: mockFile,
          body: { title: 'Screen Recording' },
        });

        await processHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            video: expect.objectContaining({
              mime_type: 'video/webm',
            }),
          })
        );
      });
    });
  });

  describe('GET /', () => {
    const handlers = getRouteStack('get', '/');
    const authMiddleware = handlers[0]!; // requireAuth
    const listHandler = handlers[1]!; // main handler

    // Create sample video data for tests
    function createMockVideoData(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      const distributeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        id: 'video-id-123',
        title: 'Test Video',
        filePath: 'test-user-id-123/abc123-uuid.mp4',
        fileSizeBytes: BigInt(10485760),
        mimeType: 'video/mp4',
        status: 'ACTIVE',
        distributeAt,
        distributedAt: null,
        expiresAt: null,
        publicToken: 'public-token-uuid',
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated', async () => {
        const { req, res, nextMock } = createMockReqRes();

        await authMiddleware(req, res, nextMock);

        expect(mockRequireAuth).toHaveBeenCalledWith(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();
      });
    });

    describe('Basic listing', () => {
      it('should return empty list when user has no videos', async () => {
        const { req, res, jsonMock } = createMockReqRes();
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 50,
          offset: 0,
        });
        expect(jsonMock).toHaveBeenCalledWith({
          videos: [],
          total: 0,
        });
      });

      it('should return list of videos with correct format', async () => {
        const video1 = createMockVideoData({ id: 'video-1', title: 'Video 1' });
        const video2 = createMockVideoData({ id: 'video-2', title: 'Video 2' });
        mockGetVideosByUser.mockResolvedValue({ videos: [video1, video2], total: 2 });

        const { req, res, jsonMock } = createMockReqRes();

        await listHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          videos: [
            expect.objectContaining({
              id: 'video-1',
              title: 'Video 1',
              file_size_bytes: '10485760',
              mime_type: 'video/mp4',
              status: 'ACTIVE',
              distribute_at: expect.any(String),
              distributed_at: null,
              expires_at: null,
              public_token: 'public-token-uuid',
              created_at: expect.any(String),
              updated_at: expect.any(String),
            }),
            expect.objectContaining({
              id: 'video-2',
              title: 'Video 2',
            }),
          ],
          total: 2,
        });
      });

      it('should include distributed_at and expires_at when present', async () => {
        const distributedAt = new Date();
        const expiresAt = new Date(distributedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        const video = createMockVideoData({
          status: 'DISTRIBUTED',
          distributedAt,
          expiresAt,
        });
        mockGetVideosByUser.mockResolvedValue({ videos: [video], total: 1 });

        const { req, res, jsonMock } = createMockReqRes();

        await listHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          videos: [
            expect.objectContaining({
              status: 'DISTRIBUTED',
              distributed_at: distributedAt.toISOString(),
              expires_at: expiresAt.toISOString(),
            }),
          ],
          total: 1,
        });
      });
    });

    describe('Status filtering', () => {
      it('should filter by ACTIVE status', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { status: 'ACTIVE' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: 'ACTIVE',
          limit: 50,
          offset: 0,
        });
      });

      it('should filter by DISTRIBUTED status', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { status: 'DISTRIBUTED' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: 'DISTRIBUTED',
          limit: 50,
          offset: 0,
        });
      });

      it('should filter by PENDING status', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { status: 'PENDING' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: 'PENDING',
          limit: 50,
          offset: 0,
        });
      });

      it('should filter by EXPIRED status', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { status: 'EXPIRED' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: 'EXPIRED',
          limit: 50,
          offset: 0,
        });
      });

      it('should return 400 for invalid status', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { status: 'INVALID_STATUS' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid status',
          message: 'Status must be one of: PENDING, ACTIVE, DISTRIBUTED, EXPIRED',
        });
        expect(mockGetVideosByUser).not.toHaveBeenCalled();
      });
    });

    describe('Pagination', () => {
      it('should use default limit of 50', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes();

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 50,
          offset: 0,
        });
      });

      it('should accept custom limit', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { limit: '10' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 10,
          offset: 0,
        });
      });

      it('should cap limit at 100', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { limit: '500' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 100,
          offset: 0,
        });
      });

      it('should accept custom offset', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { offset: '20' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 50,
          offset: 20,
        });
      });

      it('should return 400 for invalid limit (not a number)', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { limit: 'abc' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid limit',
          message: 'Limit must be a positive integer',
        });
        expect(mockGetVideosByUser).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid limit (zero)', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { limit: '0' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid limit',
          message: 'Limit must be a positive integer',
        });
      });

      it('should return 400 for invalid limit (negative)', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { limit: '-5' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid limit',
          message: 'Limit must be a positive integer',
        });
      });

      it('should return 400 for invalid offset (not a number)', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { offset: 'abc' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid offset',
          message: 'Offset must be a non-negative integer',
        });
        expect(mockGetVideosByUser).not.toHaveBeenCalled();
      });

      it('should return 400 for invalid offset (negative)', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          query: { offset: '-1' },
        });

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid offset',
          message: 'Offset must be a non-negative integer',
        });
      });

      it('should allow offset of zero', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 0 });

        const { req, res } = createMockReqRes({ query: { offset: '0' } });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: undefined,
          limit: 50,
          offset: 0,
        });
      });

      it('should accept combined pagination parameters', async () => {
        mockGetVideosByUser.mockResolvedValue({ videos: [], total: 100 });

        const { req, res } = createMockReqRes({
          query: { limit: '25', offset: '50', status: 'ACTIVE' },
        });

        await listHandler(req, res);

        expect(mockGetVideosByUser).toHaveBeenCalledWith(mockUser.id, {
          status: 'ACTIVE',
          limit: 25,
          offset: 50,
        });
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        mockGetVideosByUser.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes();

        await listHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('GET /:id', () => {
    const handlers = getRouteStack('get', '/:id');
    const authMiddleware = handlers[0]!; // requireAuth
    const getVideoHandler = handlers[1]!; // main handler

    // Create sample video data for tests
    function createMockVideoData(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      const distributeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        id: 'video-id-123',
        userId: mockUser.id,
        title: 'Test Video',
        filePath: 'test-user-id-123/abc123-uuid.mp4',
        fileSizeBytes: BigInt(10485760),
        mimeType: 'video/mp4',
        status: 'ACTIVE',
        distributeAt,
        distributedAt: null,
        expiresAt: null,
        publicToken: 'public-token-uuid',
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated', async () => {
        const { req, res, nextMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await authMiddleware(req, res, nextMock);

        expect(mockRequireAuth).toHaveBeenCalledWith(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();
      });
    });

    describe('Video retrieval', () => {
      it('should return video metadata for valid ID', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await getVideoHandler(req, res);

        expect(mockFindVideoById).toHaveBeenCalledWith('video-id-123');
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            id: 'video-id-123',
            title: 'Test Video',
            file_size_bytes: '10485760',
            mime_type: 'video/mp4',
            status: 'ACTIVE',
            distribute_at: expect.any(String),
            distributed_at: null,
            expires_at: null,
            public_token: 'public-token-uuid',
            created_at: expect.any(String),
            updated_at: expect.any(String),
          }),
        });
      });

      it('should include distributed_at and expires_at when video is distributed', async () => {
        const distributedAt = new Date();
        const expiresAt = new Date(distributedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        const video = createMockVideoData({
          status: 'DISTRIBUTED',
          distributedAt,
          expiresAt,
        });
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await getVideoHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            status: 'DISTRIBUTED',
            distributed_at: distributedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
          }),
        });
      });

      it('should return 404 for non-existent video', async () => {
        mockFindVideoById.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'non-existent-id' },
        });

        await getVideoHandler(req, res);

        expect(mockFindVideoById).toHaveBeenCalledWith('non-existent-id');
        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video does not exist',
        });
      });
    });

    describe('Ownership validation', () => {
      it('should return 403 for video owned by another user', async () => {
        const video = createMockVideoData({
          userId: 'other-user-id', // Different user
        });
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await getVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Forbidden',
          message: 'You do not have permission to access this video',
        });
      });

      it('should allow access to own videos', async () => {
        const video = createMockVideoData({
          userId: mockUser.id, // Same user
        });
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await getVideoHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            id: 'video-id-123',
          }),
        });
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        mockFindVideoById.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
        });

        await getVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('PATCH /:id', () => {
    const handlers = getRouteStack('patch', '/:id');
    const authMiddleware = handlers[0]!; // requireAuth
    const updateVideoHandler = handlers[1]!; // main handler

    // Create sample video data for tests
    function createMockVideoData(overrides: Record<string, unknown> = {}) {
      const now = new Date();
      const distributeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
      return {
        id: 'video-id-123',
        userId: mockUser.id,
        title: 'Original Title',
        filePath: 'test-user-id-123/abc123-uuid.mp4',
        fileSizeBytes: BigInt(10485760),
        mimeType: 'video/mp4',
        status: 'ACTIVE',
        distributeAt,
        distributedAt: null,
        expiresAt: null,
        publicToken: 'public-token-uuid',
        createdAt: now,
        updatedAt: now,
        ...overrides,
      };
    }

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated', async () => {
        const { req, res, nextMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await authMiddleware(req, res, nextMock);

        expect(mockRequireAuth).toHaveBeenCalledWith(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();
      });
    });

    describe('Request validation', () => {
      it('should return 400 when title is not a string', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 123 },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid request',
          message: 'Title must be a string',
        });
      });

      it('should return 400 when title is empty string', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: '' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid request',
          message: 'Title cannot be empty',
        });
      });

      it('should return 400 when title is only whitespace', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: '   ' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Invalid request',
          message: 'Title cannot be empty',
        });
      });
    });

    describe('Video retrieval', () => {
      it('should return 404 for non-existent video', async () => {
        mockFindVideoById.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'non-existent-id' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(mockFindVideoById).toHaveBeenCalledWith('non-existent-id');
        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video does not exist',
        });
      });
    });

    describe('Ownership validation', () => {
      it('should return 403 for video owned by another user', async () => {
        const video = createMockVideoData({
          userId: 'other-user-id', // Different user
        });
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Forbidden',
          message: 'You do not have permission to modify this video',
        });
      });
    });

    describe('Title update', () => {
      it('should update video title successfully', async () => {
        const video = createMockVideoData();
        const updatedVideo = { ...video, title: 'New Title' };
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockResolvedValue(updatedVideo);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(mockUpdateVideoTitle).toHaveBeenCalledWith('video-id-123', 'New Title');
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            id: 'video-id-123',
            title: 'New Title',
          }),
        });
      });

      it('should trim whitespace from title', async () => {
        const video = createMockVideoData();
        const updatedVideo = { ...video, title: 'Trimmed Title' };
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockResolvedValue(updatedVideo);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: '  Trimmed Title  ' },
        });

        await updateVideoHandler(req, res);

        expect(mockUpdateVideoTitle).toHaveBeenCalledWith('video-id-123', 'Trimmed Title');
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            title: 'Trimmed Title',
          }),
        });
      });

      it('should return video unchanged when no title provided', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: {},
        });

        await updateVideoHandler(req, res);

        expect(mockUpdateVideoTitle).not.toHaveBeenCalled();
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            id: 'video-id-123',
            title: 'Original Title',
          }),
        });
      });

      it('should return complete video metadata in response', async () => {
        const now = new Date();
        const distributeAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const video = createMockVideoData({
          createdAt: now,
          updatedAt: now,
          distributeAt,
        });
        const updatedVideo = { ...video, title: 'Updated Title', updatedAt: new Date() };
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockResolvedValue(updatedVideo);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'Updated Title' },
        });

        await updateVideoHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          video: {
            id: 'video-id-123',
            title: 'Updated Title',
            file_size_bytes: '10485760',
            mime_type: 'video/mp4',
            status: 'ACTIVE',
            distribute_at: expect.any(String),
            distributed_at: null,
            expires_at: null,
            public_token: 'public-token-uuid',
            created_at: expect.any(String),
            updated_at: expect.any(String),
          },
        });
      });

      it('should include distributed_at and expires_at when present', async () => {
        const distributedAt = new Date();
        const expiresAt = new Date(distributedAt.getTime() + 7 * 24 * 60 * 60 * 1000);
        const video = createMockVideoData({
          status: 'DISTRIBUTED',
          distributedAt,
          expiresAt,
        });
        const updatedVideo = { ...video, title: 'Updated Title' };
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockResolvedValue(updatedVideo);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'Updated Title' },
        });

        await updateVideoHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          video: expect.objectContaining({
            status: 'DISTRIBUTED',
            distributed_at: distributedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
          }),
        });
      });
    });

    describe('Error handling', () => {
      it('should return 500 on findVideoById error', async () => {
        mockFindVideoById.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should return 500 on updateVideoTitle error', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should handle race condition when video deleted during update', async () => {
        const video = createMockVideoData();
        mockFindVideoById.mockResolvedValue(video);
        mockUpdateVideoTitle.mockResolvedValue(null); // Video was deleted between check and update

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'video-id-123' },
          body: { title: 'New Title' },
        });

        await updateVideoHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video does not exist',
        });
      });
    });
  });
});
