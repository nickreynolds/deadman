// Unit tests for Admin Routes
// Tests POST /api/admin/users - Create user
// Tests GET /api/admin/users - List users
// Tests PATCH /api/admin/users/:id - Update user
// Tests DELETE /api/admin/users/:id - Delete user

import { Request, Response, NextFunction } from 'express';
import { mockConfig, createMockUser, createMockAdminUser } from '../test/mocks';

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
const mockCreateUser = jest.fn();
const mockFindUserByUsername = jest.fn();
const mockGetAllUsers = jest.fn();
const mockUpdateUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockFindUserById = jest.fn();

jest.mock('../services/user.service', () => ({
  createUser: (...args: unknown[]) => mockCreateUser(...args),
  findUserByUsername: (...args: unknown[]) => mockFindUserByUsername(...args),
  getAllUsers: (...args: unknown[]) => mockGetAllUsers(...args),
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

// Mock authentication middleware
const mockRequireAuth = jest.fn();
const mockRequireAdmin = jest.fn();
const mockGetAuthenticatedUser = jest.fn();

jest.mock('../auth', () => ({
  requireAuth: (req: Request, res: Response, next: NextFunction) => mockRequireAuth(req, res, next),
  requireAdmin: (req: Request, res: Response, next: NextFunction) => mockRequireAdmin(req, res, next),
  getAuthenticatedUser: (req: Request) => mockGetAuthenticatedUser(req),
}));

// Import router after all mocks are set up
import adminRouter from './admin.routes';

// Create mock admin user
const mockAdminUser = createMockAdminUser({
  id: 'admin-user-id-123',
  username: 'adminuser',
});

// Helper to create mock Express objects
function createMockReqRes(options: {
  body?: Record<string, unknown>;
  params?: Record<string, string>;
} = {}) {
  const req = {
    body: options.body || {},
    params: options.params || {},
    user: mockAdminUser,
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
  const stack = (adminRouter as any).stack;
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

describe('Admin Routes', () => {
  beforeEach(() => {
    jest.resetAllMocks();

    // Default auth mock behavior - passes authentication and admin check
    mockRequireAuth.mockImplementation((req, res, next) => {
      req.user = mockAdminUser;
      next();
    });

    mockRequireAdmin.mockImplementation((req, res, next) => {
      next();
    });

    mockGetAuthenticatedUser.mockReturnValue(mockAdminUser);
  });

  describe('POST /users', () => {
    const handlers = getRouteStack('post', '/users');
    const authMiddleware = handlers[0]!; // requireAuth
    const adminMiddleware = handlers[1]!; // requireAdmin
    const createUserHandler = handlers[2]!; // main handler

    describe('Authentication and Authorization', () => {
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

      it('should require admin privileges', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAdmin.mockImplementation((req, res, next) => {
          res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required' });
        });

        await adminMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Forbidden', message: 'Admin privileges required' });
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should proceed when authenticated as admin', async () => {
        const { req, res, nextMock } = createMockReqRes();

        await authMiddleware(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();

        nextMock.mockClear();
        await adminMiddleware(req, res, nextMock);
        expect(nextMock).toHaveBeenCalled();
      });
    });

    describe('Request validation - username', () => {
      it('should return 400 when username is missing', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username is required' });
      });

      it('should return 400 when username is not a string', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 12345, password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username must be a string' });
      });

      it('should return 400 when username is empty', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: '', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username cannot be empty' });
      });

      it('should return 400 when username is whitespace only', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: '   ', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username cannot be empty' });
      });

      it('should return 400 when username is too short', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'ab', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username must be at least 3 characters' });
      });

      it('should return 400 when username exceeds 50 characters', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'a'.repeat(51), password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'username cannot exceed 50 characters' });
      });
    });

    describe('Request validation - password', () => {
      it('should return 400 when password is missing', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'password is required' });
      });

      it('should return 400 when password is not a string', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 12345678 },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'password must be a string' });
      });

      it('should return 400 when password is too short', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'short' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'password must be at least 8 characters' });
      });
    });

    describe('Request validation - is_admin', () => {
      it('should return 400 when is_admin is not a boolean', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123', is_admin: 'yes' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'is_admin must be a boolean' });
      });
    });

    describe('Request validation - storage_quota_bytes', () => {
      it('should return 400 when storage_quota_bytes is invalid type', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123', storage_quota_bytes: 'large' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'storage_quota_bytes must be a number' });
      });

      it('should return 400 when storage_quota_bytes is not positive', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123', storage_quota_bytes: 0 },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'storage_quota_bytes must be positive' });
      });
    });

    describe('Duplicate username handling', () => {
      it('should return 409 when username already exists', async () => {
        mockFindUserByUsername.mockResolvedValue({ id: 'existing-user', username: 'existinguser' });

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'existinguser', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(mockFindUserByUsername).toHaveBeenCalledWith('existinguser');
        expect(statusMock).toHaveBeenCalledWith(409);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Username already exists' });
        expect(mockCreateUser).not.toHaveBeenCalled();
      });
    });

    describe('Successful user creation', () => {
      it('should create user with required fields only', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        const createdUser = createMockUser({
          id: 'new-user-id',
          username: 'newuser',
          isAdmin: false,
          storageQuotaBytes: BigInt(1073741824),
          storageUsedBytes: BigInt(0),
          createdAt: new Date('2026-01-26T10:00:00Z'),
        });
        mockCreateUser.mockResolvedValue(createdUser);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(mockFindUserByUsername).toHaveBeenCalledWith('newuser');
        expect(mockCreateUser).toHaveBeenCalledWith({
          username: 'newuser',
          password: 'password123',
          isAdmin: false,
          storageQuotaBytes: undefined,
        });
        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith({
          user: {
            id: 'new-user-id',
            username: 'newuser',
            is_admin: false,
            storage_quota_bytes: '1073741824',
            storage_used_bytes: '0',
            created_at: '2026-01-26T10:00:00.000Z',
          },
        });
      });

      it('should create admin user when is_admin is true', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        const createdUser = createMockAdminUser({
          id: 'new-admin-id',
          username: 'newadmin',
          createdAt: new Date('2026-01-26T10:00:00Z'),
        });
        mockCreateUser.mockResolvedValue(createdUser);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newadmin', password: 'password123', is_admin: true },
        });

        await createUserHandler(req, res);

        expect(mockCreateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            isAdmin: true,
          })
        );
        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              is_admin: true,
            }),
          })
        );
      });

      it('should create user with custom storage quota', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        const createdUser = createMockUser({
          id: 'new-user-id',
          username: 'newuser',
          storageQuotaBytes: BigInt('5368709120'), // 5GB
          createdAt: new Date('2026-01-26T10:00:00Z'),
        });
        mockCreateUser.mockResolvedValue(createdUser);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123', storage_quota_bytes: 5368709120 },
        });

        await createUserHandler(req, res);

        expect(mockCreateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            storageQuotaBytes: BigInt('5368709120'),
          })
        );
        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              storage_quota_bytes: '5368709120',
            }),
          })
        );
      });

      it('should trim username whitespace', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        const createdUser = createMockUser({
          id: 'new-user-id',
          username: 'trimmeduser',
          createdAt: new Date('2026-01-26T10:00:00Z'),
        });
        mockCreateUser.mockResolvedValue(createdUser);

        const { req, res, statusMock } = createMockReqRes({
          body: { username: '  trimmeduser  ', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(mockFindUserByUsername).toHaveBeenCalledWith('trimmeduser');
        expect(mockCreateUser).toHaveBeenCalledWith(
          expect.objectContaining({
            username: 'trimmeduser',
          })
        );
        expect(statusMock).toHaveBeenCalledWith(201);
      });

      it('should not include password in response', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        const createdUser = createMockUser({
          id: 'new-user-id',
          username: 'newuser',
          createdAt: new Date('2026-01-26T10:00:00Z'),
        });
        mockCreateUser.mockResolvedValue(createdUser);

        const { req, res, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123' },
        });

        await createUserHandler(req, res);

        const response = jsonMock.mock.calls[0][0];
        expect(response.user).not.toHaveProperty('password');
        expect(response.user).not.toHaveProperty('passwordHash');
        expect(response.user).not.toHaveProperty('password_hash');
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        mockFindUserByUsername.mockResolvedValue(null);
        mockCreateUser.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          body: { username: 'newuser', password: 'password123' },
        });

        await createUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('GET /users', () => {
    const handlers = getRouteStack('get', '/users');
    const authMiddleware = handlers[0]!;
    const adminMiddleware = handlers[1]!;
    const listUsersHandler = handlers[2]!;

    describe('Authentication and Authorization', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should require admin privileges', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes();

        mockRequireAdmin.mockImplementation((req, res, next) => {
          res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required' });
        });

        await adminMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(nextMock).not.toHaveBeenCalled();
      });
    });

    describe('Listing users', () => {
      it('should return empty array when no users exist', async () => {
        mockGetAllUsers.mockResolvedValue([]);

        const { req, res, jsonMock } = createMockReqRes();

        await listUsersHandler(req, res);

        expect(mockGetAllUsers).toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith({ users: [] });
      });

      it('should return all users with correct fields', async () => {
        const mockUsers = [
          createMockUser({
            id: 'user-1',
            username: 'user1',
            isAdmin: false,
            storageQuotaBytes: BigInt(1073741824),
            storageUsedBytes: BigInt(500000000),
            createdAt: new Date('2026-01-20T10:00:00Z'),
          }),
          createMockAdminUser({
            id: 'admin-1',
            username: 'admin1',
            storageQuotaBytes: BigInt(2147483648),
            storageUsedBytes: BigInt(1000000000),
            createdAt: new Date('2026-01-15T10:00:00Z'),
          }),
        ];
        mockGetAllUsers.mockResolvedValue(mockUsers);

        const { req, res, jsonMock } = createMockReqRes();

        await listUsersHandler(req, res);

        expect(jsonMock).toHaveBeenCalledWith({
          users: [
            {
              id: 'user-1',
              username: 'user1',
              is_admin: false,
              storage_quota_bytes: '1073741824',
              storage_used_bytes: '500000000',
              created_at: '2026-01-20T10:00:00.000Z',
            },
            {
              id: 'admin-1',
              username: 'admin1',
              is_admin: true,
              storage_quota_bytes: '2147483648',
              storage_used_bytes: '1000000000',
              created_at: '2026-01-15T10:00:00.000Z',
            },
          ],
        });
      });

      it('should not include passwords in response', async () => {
        const mockUsers = [
          createMockUser({
            id: 'user-1',
            username: 'user1',
            createdAt: new Date('2026-01-20T10:00:00Z'),
          }),
        ];
        mockGetAllUsers.mockResolvedValue(mockUsers);

        const { req, res, jsonMock } = createMockReqRes();

        await listUsersHandler(req, res);

        const response = jsonMock.mock.calls[0][0];
        expect(response.users[0]).not.toHaveProperty('password');
        expect(response.users[0]).not.toHaveProperty('passwordHash');
        expect(response.users[0]).not.toHaveProperty('password_hash');
      });
    });

    describe('Error handling', () => {
      it('should return 500 on database error', async () => {
        mockGetAllUsers.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes();

        await listUsersHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('PATCH /users/:id', () => {
    const handlers = getRouteStack('patch', '/users/:id');
    const authMiddleware = handlers[0]!;
    const adminMiddleware = handlers[1]!;
    const updateUserHandler = handlers[2]!;

    describe('Authentication and Authorization', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'user-123' },
        });

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should require admin privileges', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'user-123' },
        });

        mockRequireAdmin.mockImplementation((req, res, next) => {
          res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required' });
        });

        await adminMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(nextMock).not.toHaveBeenCalled();
      });
    });

    describe('Request validation', () => {
      it('should return 400 when is_admin is not a boolean', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { is_admin: 'true' },
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'is_admin must be a boolean' });
      });

      it('should return 400 when storage_quota_bytes is invalid type', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { storage_quota_bytes: 'large' },
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'storage_quota_bytes must be a number' });
      });

      it('should return 400 when storage_quota_bytes is not positive', async () => {
        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { storage_quota_bytes: -100 },
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'storage_quota_bytes must be positive' });
      });
    });

    describe('No fields provided', () => {
      it('should return current user when no fields provided', async () => {
        const existingUser = createMockUser({
          id: 'user-123',
          username: 'existinguser',
          isAdmin: false,
          storageQuotaBytes: BigInt(1073741824),
          storageUsedBytes: BigInt(500000000),
          createdAt: new Date('2026-01-20T10:00:00Z'),
        });
        mockFindUserById.mockResolvedValue(existingUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: {},
        });

        await updateUserHandler(req, res);

        expect(statusMock).not.toHaveBeenCalled();
        expect(mockUpdateUser).not.toHaveBeenCalled();
        expect(mockFindUserById).toHaveBeenCalledWith('user-123');
        expect(jsonMock).toHaveBeenCalledWith({
          user: {
            id: 'user-123',
            username: 'existinguser',
            is_admin: false,
            storage_quota_bytes: '1073741824',
            storage_used_bytes: '500000000',
            created_at: '2026-01-20T10:00:00.000Z',
          },
        });
      });

      it('should return 404 when user not found with empty body', async () => {
        mockFindUserById.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'nonexistent-user' },
          body: {},
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });
    });

    describe('Successful updates', () => {
      it('should update is_admin flag', async () => {
        const updatedUser = createMockAdminUser({
          id: 'user-123',
          username: 'promoteduser',
          createdAt: new Date('2026-01-20T10:00:00Z'),
        });
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { is_admin: true },
        });

        await updateUserHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('user-123', { isAdmin: true });
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              is_admin: true,
            }),
          })
        );
      });

      it('should update storage_quota_bytes', async () => {
        const updatedUser = createMockUser({
          id: 'user-123',
          username: 'user',
          storageQuotaBytes: BigInt('5368709120'),
          createdAt: new Date('2026-01-20T10:00:00Z'),
        });
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { storage_quota_bytes: 5368709120 },
        });

        await updateUserHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('user-123', { storageQuotaBytes: BigInt('5368709120') });
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            user: expect.objectContaining({
              storage_quota_bytes: '5368709120',
            }),
          })
        );
      });

      it('should update both is_admin and storage_quota_bytes', async () => {
        const updatedUser = createMockAdminUser({
          id: 'user-123',
          username: 'user',
          storageQuotaBytes: BigInt('10737418240'),
          createdAt: new Date('2026-01-20T10:00:00Z'),
        });
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { is_admin: true, storage_quota_bytes: 10737418240 },
        });

        await updateUserHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('user-123', {
          isAdmin: true,
          storageQuotaBytes: BigInt('10737418240'),
        });
        expect(jsonMock).toHaveBeenCalledWith({
          user: expect.objectContaining({
            is_admin: true,
            storage_quota_bytes: '10737418240',
          }),
        });
      });

      it('should accept storage_quota_bytes as string', async () => {
        const updatedUser = createMockUser({
          id: 'user-123',
          username: 'user',
          storageQuotaBytes: BigInt('21474836480'),
          createdAt: new Date('2026-01-20T10:00:00Z'),
        });
        mockUpdateUser.mockResolvedValue(updatedUser);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { storage_quota_bytes: '21474836480' },
        });

        await updateUserHandler(req, res);

        expect(mockUpdateUser).toHaveBeenCalledWith('user-123', { storageQuotaBytes: BigInt('21474836480') });
        expect(statusMock).not.toHaveBeenCalled();
      });
    });

    describe('Error handling', () => {
      it('should return 404 when user not found during update', async () => {
        mockUpdateUser.mockResolvedValue(null);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'nonexistent-user' },
          body: { is_admin: true },
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });

      it('should return 500 on database error', async () => {
        mockUpdateUser.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
          body: { is_admin: true },
        });

        await updateUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });

  describe('DELETE /users/:id', () => {
    const handlers = getRouteStack('delete', '/users/:id');
    const authMiddleware = handlers[0]!;
    const adminMiddleware = handlers[1]!;
    const deleteUserHandler = handlers[2]!;

    describe('Authentication and Authorization', () => {
      it('should require authentication', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'user-123' },
        });

        mockRequireAuth.mockImplementation((req, res, next) => {
          res.status(401).json({ error: 'Unauthorized' });
        });

        await authMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(nextMock).not.toHaveBeenCalled();
      });

      it('should require admin privileges', async () => {
        const { req, res, statusMock, jsonMock, nextMock } = createMockReqRes({
          params: { id: 'user-123' },
        });

        mockRequireAdmin.mockImplementation((req, res, next) => {
          res.status(403).json({ error: 'Forbidden', message: 'Admin privileges required' });
        });

        await adminMiddleware(req, res, nextMock);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(nextMock).not.toHaveBeenCalled();
      });
    });

    describe('Successful deletion', () => {
      it('should delete user and return success', async () => {
        mockDeleteUser.mockResolvedValue(true);

        const { req, res, jsonMock, statusMock } = createMockReqRes({
          params: { id: 'user-to-delete' },
        });

        await deleteUserHandler(req, res);

        expect(mockDeleteUser).toHaveBeenCalledWith('user-to-delete');
        expect(statusMock).not.toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith({ success: true });
      });
    });

    describe('Error handling', () => {
      it('should return 404 when user not found', async () => {
        mockDeleteUser.mockResolvedValue(false);

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'nonexistent-user' },
        });

        await deleteUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(404);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
      });

      it('should return 500 on database error', async () => {
        mockDeleteUser.mockRejectedValue(new Error('Database error'));

        const { req, res, statusMock, jsonMock } = createMockReqRes({
          params: { id: 'user-123' },
        });

        await deleteUserHandler(req, res);

        expect(statusMock).toHaveBeenCalledWith(500);
        expect(jsonMock).toHaveBeenCalledWith({ error: 'Internal server error' });
      });
    });
  });
});
