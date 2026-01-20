// Unit tests for User Settings Routes
// Tests GET /api/user/settings

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

// Mock user service functions
const mockFindUserById = jest.fn();

jest.mock('../services/user.service', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

// Mock authentication middleware
const mockRequireAuth = jest.fn();
const mockGetAuthenticatedUser = jest.fn();

jest.mock('../auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => mockRequireAuth(req, res, next),
  getAuthenticatedUser: (req: Request) => mockGetAuthenticatedUser(req),
}));

// Import router after all mocks are set up
import userRouter from './user.routes';

// Create mock authenticated user
const mockUser = createMockUser({
  id: 'test-user-id-123',
  username: 'testuser',
  storageQuotaBytes: BigInt(1073741824), // 1GB
  storageUsedBytes: BigInt(524288000), // 500MB
  defaultTimerDays: 14,
  fcmToken: 'test-fcm-token-abc123',
});

// Helper to create mock Express objects
function createMockReqRes(options: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) {
  const req = {
    body: options.body || {},
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

// Get specific middleware/handler from router stack
function getRouteStack(method: string, path: string): Function[] {
  const stack = (userRouter as any).stack;
  for (const layer of stack) {
    if (layer.route && layer.route.path === path) {
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

describe('User Routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Default auth mock behavior - passes authentication
    mockRequireAuth.mockImplementation((req, res, next) => {
      req.user = mockUser;
      next();
    });

    mockGetAuthenticatedUser.mockReturnValue(mockUser);
  });

  describe('GET /settings', () => {
    const handlers = getRouteStack('get', '/settings');
    const authMiddleware = handlers[0]!; // requireAuth
    const getSettingsHandler = handlers[1]!; // main handler

    describe('Authentication', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
          // Don't call next() to simulate blocked request
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Unauthorized' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated', async () => {
        const { req, res, nextMock } = createMockReqRes();

        await authMiddleware(req, res, nextMock);

        expect(nextMock).toHaveBeenCalled();
      });
    });

    describe('Fetching settings', () => {
      it('should return user settings with all fields', async () => {
        const fullUser = {
          ...mockUser,
          storageQuotaBytes: BigInt(2147483648), // 2GB
          storageUsedBytes: BigInt(1073741824), // 1GB
          defaultTimerDays: 30,
          fcmToken: 'fcm-token-xyz',
        };
        mockFindUserById.mockResolvedValue(fullUser);

        const { req, res, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(mockFindUserById).toHaveBeenCalledWith('test-user-id-123');
        expect(jsonMock).toHaveBeenCalledWith({
          default_timer_days: 30,
          storage_quota_bytes: '2147483648',
          storage_used_bytes: '1073741824',
          fcm_token: 'fcm-token-xyz',
        });
      });

      it('should return null for fcm_token when not set', async () => {
        const userWithNoFcm = {
          ...mockUser,
          fcmToken: null,
        };
        mockFindUserById.mockResolvedValue(userWithNoFcm);

        const { req, res, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            fcm_token: null,
          })
        );
      });

      it('should return storage bytes as strings for BigInt serialization', async () => {
        const largeQuotaUser = {
          ...mockUser,
          storageQuotaBytes: BigInt('10737418240'), // 10GB
          storageUsedBytes: BigInt('5368709120'), // 5GB
        };
        mockFindUserById.mockResolvedValue(largeQuotaUser);

        const { req, res, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        const response = jsonMock.mock.calls[0][0];
        expect(response.storage_quota_bytes).toBe('10737418240');
        expect(response.storage_used_bytes).toBe('5368709120');
        expect(typeof response.storage_quota_bytes).toBe('string');
        expect(typeof response.storage_used_bytes).toBe('string');
      });

      it('should return default timer days value', async () => {
        const userWith7Days = {
          ...mockUser,
          defaultTimerDays: 7,
        };
        mockFindUserById.mockResolvedValue(userWith7Days);

        const { req, res, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            default_timer_days: 7,
          })
        );
      });
    });

    describe('Error handling', () => {
      it('should return 404 when user not found', async () => {
        mockFindUserById.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });

      it('should return 500 on database error', async () => {
        mockFindUserById.mockRejectedValue(new Error('Database connection failed'));

        const { req, res, statusMock, jsonMock } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });

    describe('User ID from authenticated user', () => {
      it('should use authenticated user ID for lookup', async () => {
        const differentIdUser = createMockUser({
          id: 'different-user-id',
        });
        mockGetAuthenticatedUser.mockReturnValue(differentIdUser);
        mockFindUserById.mockResolvedValue(differentIdUser);

        const { req, res } = createMockReqRes();

        await getSettingsHandler(req, res);

        expect(mockFindUserById).toHaveBeenCalledWith('different-user-id');
      });
    });
  });
});
