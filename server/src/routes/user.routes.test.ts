// Unit tests for User Settings and Recipients Routes
// Tests GET /api/user/settings
// Tests PATCH /api/user/settings
// Tests GET /api/user/recipients

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
const mockUpdateUser = jest.fn();

jest.mock('../services/user.service', () => ({
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
}));

// Mock recipient service functions
const mockGetRecipientsByUserId = jest.fn();

jest.mock('../services/recipient.service', () => ({
  getRecipientsByUserId: (...args: unknown[]) => mockGetRecipientsByUserId(...args),
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

  describe('PATCH /settings', () => {
    const handlers = getRouteStack('patch', '/settings');
    const authMiddleware = handlers[0]!; // requireAuth
    const updateSettingsHandler = handlers[1]!; // main handler

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

    describe('Request validation - default_timer_days', () => {
      it('should return 400 when default_timer_days is not a number', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 'seven' },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'default_timer_days must be a number' });
      });

      it('should return 400 when default_timer_days is not an integer', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 7.5 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'default_timer_days must be an integer' });
      });

      it('should return 400 when default_timer_days is less than 1', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 0 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'default_timer_days must be at least 1' });
      });

      it('should return 400 when default_timer_days is negative', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: -5 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'default_timer_days must be at least 1' });
      });

      it('should return 400 when default_timer_days exceeds 365', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 400 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'default_timer_days cannot exceed 365' });
      });
    });

    describe('Request validation - fcm_token', () => {
      it('should return 400 when fcm_token is not a string', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { fcm_token: 12345 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'fcm_token must be a string' });
      });

      it('should accept null fcm_token to clear it', async () => {
        const updatedUser = {
          ...mockUser,
          fcmToken: null,
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: { fcm_token: null },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', { fcmToken: null });
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: expect.objectContaining({
              fcm_token: null,
            }),
          })
        );
      });
    });

    describe('No fields provided', () => {
      it('should return current settings when no fields provided', async () => {
        const currentUser = {
          ...mockUser,
          defaultTimerDays: 14,
          storageQuotaBytes: BigInt(1073741824),
          storageUsedBytes: BigInt(524288000),
          fcmToken: 'existing-token',
        };
        mockFindUserById.mockResolvedValue(currentUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: {},
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).not.toHaveBeenCalled();
        expect(mockFindUserById).toHaveBeenCalledWith('test-user-id-123');
        expect(jsonMock).toHaveBeenCalledWith({
          settings: {
            default_timer_days: 14,
            storage_quota_bytes: '1073741824',
            storage_used_bytes: '524288000',
            fcm_token: 'existing-token',
          },
        });
      });

      it('should return 404 when user not found with empty body', async () => {
        mockFindUserById.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: {},
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });
    });

    describe('Successful updates', () => {
      it('should update default_timer_days', async () => {
        const updatedUser = {
          ...mockUser,
          defaultTimerDays: 30,
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: { default_timer_days: 30 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', { defaultTimerDays: 30 });
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: expect.objectContaining({
              default_timer_days: 30,
            }),
          })
        );
      });

      it('should update fcm_token', async () => {
        const updatedUser = {
          ...mockUser,
          fcmToken: 'new-fcm-token-xyz',
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: { fcm_token: 'new-fcm-token-xyz' },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', { fcmToken: 'new-fcm-token-xyz' });
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            settings: expect.objectContaining({
              fcm_token: 'new-fcm-token-xyz',
            }),
          })
        );
      });

      it('should update both default_timer_days and fcm_token', async () => {
        const updatedUser = {
          ...mockUser,
          defaultTimerDays: 21,
          fcmToken: 'updated-token',
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock } = createMockReqRes({
          body: { default_timer_days: 21, fcm_token: 'updated-token' },
        });

        await updateSettingsHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', {
          defaultTimerDays: 21,
          fcmToken: 'updated-token',
        });
        expect(jsonMock).toHaveBeenCalledWith({
          settings: expect.objectContaining({
            default_timer_days: 21,
            fcm_token: 'updated-token',
          }),
        });
      });

      it('should accept minimum timer value (1 day)', async () => {
        const updatedUser = {
          ...mockUser,
          defaultTimerDays: 1,
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: { default_timer_days: 1 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', { defaultTimerDays: 1 });
      });

      it('should accept maximum timer value (365 days)', async () => {
        const updatedUser = {
          ...mockUser,
          defaultTimerDays: 365,
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          body: { default_timer_days: 365 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).toHaveBeenCalledWith('test-user-id-123', { defaultTimerDays: 365 });
      });

      it('should return complete settings object in response', async () => {
        const updatedUser = {
          ...mockUser,
          defaultTimerDays: 10,
          storageQuotaBytes: BigInt(2147483648),
          storageUsedBytes: BigInt(1073741824),
          fcmToken: 'token-123',
        };
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock } = createMockReqRes({
          body: { default_timer_days: 10 },
        });

        await updateSettingsHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          settings: {
            default_timer_days: 10,
            storage_quota_bytes: '2147483648',
            storage_used_bytes: '1073741824',
            fcm_token: 'token-123',
          },
        });
      });
    });

    describe('Error handling', () => {
      it('should return 404 when user not found during update', async () => {
        mockUpdateUser.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 14 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });

      it('should return 500 on database error', async () => {
        mockUpdateUser.mockRejectedValue(new Error('Database connection failed'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { default_timer_days: 14 },
        });

        await updateSettingsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });

    describe('User ID from authenticated user', () => {
      it('should use authenticated user ID for update', async () => {
        const differentIdUser = createMockUser({
          id: 'different-user-id-456',
        });
        mockGetAuthenticatedUser.mockReturnValue(differentIdUser);
        mockUpdateUser.mockResolvedValue(differentIdUser);

        const { req, res } = createMockReqRes({
          body: { default_timer_days: 7 },
        });

        await updateSettingsHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('different-user-id-456', { defaultTimerDays: 7 });
      });
    });
  });

  describe('GET /recipients', () => {
    const handlers = getRouteStack('get', '/recipients');
    const authMiddleware = handlers[0]!; // requireAuth
    const getRecipientsHandler = handlers[1]!; // main handler

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

    describe('Fetching recipients', () => {
      it('should return empty array when user has no recipients', async () => {
        mockGetRecipientsByUserId.mockResolvedValue([]);

        const { req, res, jsonMock } = createMockReqRes();

        await getRecipientsHandler(req, res);

        expect(mockGetRecipientsByUserId).toHaveBeenCalledWith('test-user-id-123');
        expect(jsonMock).toHaveBeenCalledWith({
          recipients: [],
        });
      });

      it('should return recipients with all fields', async () => {
        const mockRecipients = [
          {
            id: 'recipient-1',
            userId: 'test-user-id-123',
            email: 'john@example.com',
            name: 'John Doe',
            createdAt: new Date('2026-01-15'),
          },
          {
            id: 'recipient-2',
            userId: 'test-user-id-123',
            email: 'jane@example.com',
            name: 'Jane Smith',
            createdAt: new Date('2026-01-16'),
          },
        ];
        mockGetRecipientsByUserId.mockResolvedValue(mockRecipients);

        const { req, res, jsonMock } = createMockReqRes();

        await getRecipientsHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          recipients: [
            { id: 'recipient-1', email: 'john@example.com', name: 'John Doe' },
            { id: 'recipient-2', email: 'jane@example.com', name: 'Jane Smith' },
          ],
        });
      });

      it('should return null for name when not set', async () => {
        const mockRecipients = [
          {
            id: 'recipient-1',
            userId: 'test-user-id-123',
            email: 'anonymous@example.com',
            name: null,
            createdAt: new Date('2026-01-15'),
          },
        ];
        mockGetRecipientsByUserId.mockResolvedValue(mockRecipients);

        const { req, res, jsonMock } = createMockReqRes();

        await getRecipientsHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          recipients: [{ id: 'recipient-1', email: 'anonymous@example.com', name: null }],
        });
      });

      it('should not include createdAt or userId in response', async () => {
        const mockRecipients = [
          {
            id: 'recipient-1',
            userId: 'test-user-id-123',
            email: 'test@example.com',
            name: 'Test User',
            createdAt: new Date('2026-01-15'),
          },
        ];
        mockGetRecipientsByUserId.mockResolvedValue(mockRecipients);

        const { req, res, jsonMock } = createMockReqRes();

        await getRecipientsHandler(req, res);

        const response = jsonMock.mock.calls[0][0];
        expect(response.recipients[0]).not.toHaveProperty('userId');
        expect(response.recipients[0]).not.toHaveProperty('createdAt');
        expect(response.recipients[0]).toEqual({
          id: 'recipient-1',
          email: 'test@example.com',
          name: 'Test User',
        });
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        mockGetRecipientsByUserId.mockRejectedValue(new Error('Database connection failed'));

        const { req, res, statusMock, jsonMock } = createMockReqRes();

        await getRecipientsHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });

    describe('User ID from authenticated user', () => {
      it('should use authenticated user ID for lookup', async () => {
        const differentIdUser = createMockUser({
          id: 'different-user-id-789',
        });
        mockGetAuthenticatedUser.mockReturnValue(differentIdUser);
        mockGetRecipientsByUserId.mockResolvedValue([]);

        const { req, res } = createMockReqRes();

        await getRecipientsHandler(req, res);

        expect(mockGetRecipientsByUserId).toHaveBeenCalledWith('different-user-id-789');
      });
    });
  });
});
