// Integration tests for Public Video Routes
// Tests GET /api/public/videos/:token endpoint

import { Request, Response } from 'express';
import { mockConfig } from '../test/mocks';
import { Readable } from 'stream';
import { parseRangeHeader } from './public.routes';

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
const mockGetStorageConfig = jest.fn();

jest.mock('../storage', () => ({
  getStorageConfig: () => mockGetStorageConfig(),
}));

// Mock video service functions
const mockFindVideoByPublicToken = jest.fn();

jest.mock('../services/video.service', () => ({
  findVideoByPublicToken: (...args: unknown[]) => mockFindVideoByPublicToken(...args),
}));

// Mock fs module
const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockCreateReadStream = jest.fn();

jest.mock('fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
  createReadStream: (...args: unknown[]) => mockCreateReadStream(...args),
}));

// Import router after all mocks are set up
import publicRouter from './public.routes';

// Helper to create mock Express objects
function createMockReqRes(options: { params?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const req = {
    params: options.params || {},
    headers: options.headers || {},
  } as unknown as Request;

  const jsonMock = jest.fn();
  const statusMock = jest.fn().mockReturnValue({ json: jsonMock });
  const setHeaderMock = jest.fn();
  const pipeMock = jest.fn();
  const res = {
    json: jsonMock,
    status: statusMock,
    setHeader: setHeaderMock,
    headersSent: false,
  } as unknown as Response;

  return { req, res, jsonMock, statusMock, setHeaderMock, pipeMock };
}

// Create a mock video object
function createMockVideo(overrides: Partial<{
  id: string;
  userId: string;
  title: string;
  filePath: string;
  fileSizeBytes: bigint;
  mimeType: string;
  status: string;
  distributeAt: Date;
  distributedAt: Date | null;
  expiresAt: Date | null;
  publicToken: string;
  createdAt: Date;
  updatedAt: Date;
}> = {}) {
  return {
    id: 'video-id-123',
    userId: 'user-id-123',
    title: 'Test Video',
    filePath: 'user-id-123/abc123-uuid.mp4',
    fileSizeBytes: BigInt(10485760),
    mimeType: 'video/mp4',
    status: 'DISTRIBUTED',
    distributeAt: new Date('2026-01-10T00:00:00Z'),
    distributedAt: new Date('2026-01-15T00:00:00Z'),
    expiresAt: new Date('2026-01-22T00:00:00Z'),
    publicToken: 'public-token-uuid',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-15T00:00:00Z'),
    ...overrides,
  };
}

// Get specific handler from router stack
function getRouteStack(method: string, path: string): Function[] {
  const stack = (publicRouter as any).stack;
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

describe('Public Routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Default storage config
    mockGetStorageConfig.mockReturnValue({
      rootPath: '/tmp/test-storage',
      maxFileSizeBytes: 500 * 1024 * 1024,
    });

    // Default file system behavior
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 10485760 });
  });

  describe('GET /videos/:token', () => {
    const handlers = getRouteStack('get', '/videos/:token');
    const handler = handlers[0]!;

    describe('Video lookup', () => {
      it('should return 404 when video not found', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'non-existent-token' },
        });

        mockFindVideoByPublicToken.mockResolvedValue(null);

        await handler(req, res);

        expect(mockFindVideoByPublicToken).toHaveBeenCalledWith('non-existent-token');
        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video does not exist',
        });
      });

      it('should find video by public token', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token-uuid' },
        });

        const mockVideo = createMockVideo({ publicToken: 'valid-token-uuid' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(mockFindVideoByPublicToken).toHaveBeenCalledWith('valid-token-uuid');
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'video/mp4');
      });
    });

    describe('Video status validation', () => {
      it('should return 404 for PENDING videos', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'pending-video-token' },
        });

        const mockVideo = createMockVideo({
          status: 'PENDING',
          distributedAt: null,
          expiresAt: null,
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video is not available yet',
        });
      });

      it('should return 404 for ACTIVE videos', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'active-video-token' },
        });

        const mockVideo = createMockVideo({
          status: 'ACTIVE',
          distributedAt: null,
          expiresAt: null,
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The requested video is not available yet',
        });
      });

      it('should return 410 for EXPIRED videos', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'expired-video-token' },
        });

        const mockVideo = createMockVideo({
          status: 'EXPIRED',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(410);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video expired',
          message: 'This video is no longer available',
        });
      });

      it('should serve DISTRIBUTED videos', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'distributed-video-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'video/mp4');
        expect(mockCreateReadStream).toHaveBeenCalled();
      });
    });

    describe('File serving', () => {
      it('should return 404 when file does not exist on disk', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockExistsSync.mockReturnValue(false);

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Video not found',
          message: 'The video file could not be found',
        });
      });

      it('should set correct Content-Type header', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          mimeType: 'video/quicktime',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'video/quicktime');
      });

      it('should set correct Content-Length header', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 5242880 }); // 5 MB

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', 5242880);
      });

      it('should set Accept-Ranges header for seeking support', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      });

      it('should set Content-Disposition header with sanitized filename', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          title: 'My Video Title!@#$%',
          filePath: 'user-id-123/abc123.mp4',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith(
          'Content-Disposition',
          'inline; filename="My_Video_Title_____.mp4"'
        );
      });

      it('should stream video file to response', async () => {
        const { req, res } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockStream.on = jest.fn().mockReturnThis();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(mockCreateReadStream).toHaveBeenCalledWith('/tmp/test-storage/user-id-123/abc123-uuid.mp4');
        expect(mockStream.pipe).toHaveBeenCalledWith(res);
      });

      it('should construct correct file path from storage root and relative path', async () => {
        const { req, res } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          filePath: 'some-user/some-file.mp4',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        mockGetStorageConfig.mockReturnValue({
          rootPath: '/var/storage/videos',
          maxFileSizeBytes: 500 * 1024 * 1024,
        });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockStream.on = jest.fn().mockReturnThis();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(mockExistsSync).toHaveBeenCalledWith('/var/storage/videos/some-user/some-file.mp4');
        expect(mockCreateReadStream).toHaveBeenCalledWith('/var/storage/videos/some-user/some-file.mp4');
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        mockFindVideoByPublicToken.mockRejectedValue(new Error('Database error'));

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should handle stream errors gracefully', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        // Set headersSent to false initially
        (res as any).headersSent = false;

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Create a mock stream that emits an error
        let errorCallback: ((err: Error) => void) | undefined;
        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn().mockImplementation((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              errorCallback = callback;
            }
            return mockStream;
          }),
        };
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        // Simulate stream error before headers sent
        if (errorCallback) {
          (errorCallback as (err: Error) => void)(new Error('Stream error'));
        }

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });

      it('should not send error response if headers already sent', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Create a mock stream that emits an error
        let errorCallback: ((err: Error) => void) | undefined;
        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn().mockImplementation((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              errorCallback = callback;
            }
            return mockStream;
          }),
        };
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        // Set headersSent to true to simulate headers already sent
        (res as any).headersSent = true;

        // Reset mocks to check no more calls are made
        statusMock.mockClear();
        jsonMock.mockClear();

        // Simulate stream error after headers sent
        if (errorCallback) {
          (errorCallback as (err: Error) => void)(new Error('Stream error'));
        }

        // Should not send another response since headers were already sent
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).not.toHaveBeenCalled();
      });
    });

    describe('Different MIME types', () => {
      it('should handle MOV files (video/quicktime)', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          mimeType: 'video/quicktime',
          filePath: 'user-id-123/video.mov',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'video/quicktime');
        expect(setHeaderMock).toHaveBeenCalledWith(
          'Content-Disposition',
          'inline; filename="Test_Video.mov"'
        );
      });

      it('should handle WebM files', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          mimeType: 'video/webm',
          filePath: 'user-id-123/video.webm',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Type', 'video/webm');
        expect(setHeaderMock).toHaveBeenCalledWith(
          'Content-Disposition',
          'inline; filename="Test_Video.webm"'
        );
      });
    });

    describe('Range requests', () => {
      it('should return 206 Partial Content for valid range request', async () => {
        const { req, res, statusMock, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=0-1023' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 10485760 }); // 10 MB

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(206);
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes 0-1023/10485760');
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', 1024);
      });

      it('should set correct Content-Range header for range request', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=1000-1999' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 5000 });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes 1000-1999/5000');
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', 1000);
      });

      it('should handle range request with open-ended range (bytes=start-)', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=5000-' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 10000 });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        // Open-ended range should go to end of file (fileSize - 1)
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes 5000-9999/10000');
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Length', 5000);
      });

      it('should pass start and end options to createReadStream for range request', async () => {
        const { req, res } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=100-199' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 1000 });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockStream.on = jest.fn().mockReturnThis();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(mockCreateReadStream).toHaveBeenCalledWith(
          '/tmp/test-storage/user-id-123/abc123-uuid.mp4',
          { start: 100, end: 199 }
        );
      });

      it('should return 416 Range Not Satisfiable for invalid range format', async () => {
        const { req, res, statusMock, jsonMock, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'invalid-range' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 10000 });

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(416);
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes */10000');
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Range not satisfiable',
          message: 'The requested range is not valid for the video file',
        });
      });

      it('should return 416 for range starting beyond file size', async () => {
        const { req, res, statusMock, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=10000-10999' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 5000 });

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(416);
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes */5000');
      });

      it('should return 416 for range with end beyond file size', async () => {
        const { req, res, statusMock, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=0-99999' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 5000 });

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(416);
        expect(setHeaderMock).toHaveBeenCalledWith('Content-Range', 'bytes */5000');
      });

      it('should return 416 for range with start greater than end', async () => {
        const { req, res, statusMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=500-100' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 10000 });

        await handler(req, res);

        expect(statusMock).toHaveBeenCalledWith(416);
      });

      it('should include Accept-Ranges header in range response', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=0-99' },
        });

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 1000 });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Accept-Ranges', 'bytes');
      });

      it('should include Content-Disposition header in range response', async () => {
        const { req, res, setHeaderMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=0-99' },
        });

        const mockVideo = createMockVideo({
          status: 'DISTRIBUTED',
          title: 'Test Video',
          filePath: 'user-id-123/abc.mp4',
        });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 1000 });

        // Mock the read stream
        const mockStream = new Readable({
          read() {
            this.push(null);
          },
        });
        mockStream.pipe = jest.fn();
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        expect(setHeaderMock).toHaveBeenCalledWith('Content-Disposition', 'inline; filename="Test_Video.mp4"');
      });

      it('should handle stream errors during range request', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { token: 'valid-token' },
          headers: { range: 'bytes=0-99' },
        });

        (res as any).headersSent = false;

        const mockVideo = createMockVideo({ status: 'DISTRIBUTED' });
        mockFindVideoByPublicToken.mockResolvedValue(mockVideo);
        mockStatSync.mockReturnValue({ size: 1000 });

        // Create a mock stream that emits an error
        let errorCallback: ((err: Error) => void) | undefined;
        const mockStream = {
          pipe: jest.fn(),
          on: jest.fn().mockImplementation((event: string, callback: (err: Error) => void) => {
            if (event === 'error') {
              errorCallback = callback;
            }
            return mockStream;
          }),
        };
        mockCreateReadStream.mockReturnValue(mockStream);

        await handler(req, res);

        // Simulate stream error
        if (errorCallback) {
          (errorCallback as (err: Error) => void)(new Error('Stream error'));
        }

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('parseRangeHeader', () => {
    it('should parse valid range with start and end', () => {
      const result = parseRangeHeader('bytes=0-999', 10000);
      expect(result).toEqual({ start: 0, end: 999, chunkSize: 1000 });
    });

    it('should parse range with only start (open-ended)', () => {
      const result = parseRangeHeader('bytes=5000-', 10000);
      expect(result).toEqual({ start: 5000, end: 9999, chunkSize: 5000 });
    });

    it('should return null for invalid format (missing bytes=)', () => {
      const result = parseRangeHeader('0-999', 10000);
      expect(result).toBeNull();
    });

    it('should return null for invalid format (missing dash)', () => {
      const result = parseRangeHeader('bytes=1000', 10000);
      expect(result).toBeNull();
    });

    it('should return null for non-numeric start', () => {
      const result = parseRangeHeader('bytes=abc-999', 10000);
      expect(result).toBeNull();
    });

    it('should return null for negative start', () => {
      const result = parseRangeHeader('bytes=-1-999', 10000);
      expect(result).toBeNull();
    });

    it('should return null for start >= fileSize', () => {
      const result = parseRangeHeader('bytes=10000-10999', 10000);
      expect(result).toBeNull();
    });

    it('should return null for end >= fileSize', () => {
      const result = parseRangeHeader('bytes=0-10000', 10000);
      expect(result).toBeNull();
    });

    it('should return null for start > end', () => {
      const result = parseRangeHeader('bytes=500-100', 10000);
      expect(result).toBeNull();
    });

    it('should handle first byte range', () => {
      const result = parseRangeHeader('bytes=0-0', 10000);
      expect(result).toEqual({ start: 0, end: 0, chunkSize: 1 });
    });

    it('should handle last byte range', () => {
      const result = parseRangeHeader('bytes=9999-9999', 10000);
      expect(result).toEqual({ start: 9999, end: 9999, chunkSize: 1 });
    });

    it('should handle entire file range', () => {
      const result = parseRangeHeader('bytes=0-9999', 10000);
      expect(result).toEqual({ start: 0, end: 9999, chunkSize: 10000 });
    });
  });
});
