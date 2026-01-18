// Unit tests for Authentication Routes
// Tests POST /api/auth/login and POST /api/auth/refresh

import { Request, Response } from 'express';
import { mockConfig, createMockUser } from '../test/mocks';

// Mock dependencies
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

// Mock user service
const mockValidateCredentials = jest.fn();
const mockFindUserById = jest.fn();
jest.mock('../services/user.service', () => ({
  validateCredentials: (...args: unknown[]) => mockValidateCredentials(...args),
  findUserById: (...args: unknown[]) => mockFindUserById(...args),
}));

// Mock JWT service
const mockGenerateToken = jest.fn();
const mockVerifyToken = jest.fn();
jest.mock('../auth/jwt.service', () => ({
  generateToken: (...args: unknown[]) => mockGenerateToken(...args),
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

// Import the router after mocking
import authRouter from './auth.routes';

// Helper to create mock request/response
function createMockReqRes(body: object = {}) {
  const req = {
    body,
  } as Request;

  const jsonMock = jest.fn();
  const statusMock = jest.fn(() => ({ json: jsonMock }));
  const res = {
    json: jsonMock,
    status: statusMock,
  } as unknown as Response;

  return { req, res, jsonMock, statusMock };
}

// Get route handler from router
function getRouteHandler(method: string, path: string) {
  const stack = (authRouter as any).stack;
  for (const layer of stack) {
    if (layer.route && layer.route.path === path) {
      const methodLayer = layer.route.stack.find(
        (s: any) => s.method === method
      );
      if (methodLayer) {
        return methodLayer.handle;
      }
    }
  }
  throw new Error(`Route not found: ${method.toUpperCase()} ${path}`);
}

describe('Auth Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /login', () => {
    const loginHandler = getRouteHandler('post', '/login');

    it('should return 400 when username is missing', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        password: 'password123',
      });

      await loginHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Username is required' });
    });

    it('should return 400 when password is missing', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        username: 'testuser',
      });

      await loginHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Password is required' });
    });

    it('should return 400 for empty username', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        username: '   ',
        password: 'password123',
      });

      await loginHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Username is required' });
    });

    it('should return 400 when username is not a string', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        username: 123,
        password: 'password123',
      });

      await loginHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Username is required' });
    });

    it('should return 401 for invalid credentials', async () => {
      mockValidateCredentials.mockResolvedValue(null);

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        username: 'testuser',
        password: 'wrongpassword',
      });

      await loginHandler(req, res);

      expect(mockValidateCredentials).toHaveBeenCalledWith(
        'testuser',
        'wrongpassword'
      );
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Invalid username or password',
      });
    });

    it('should return token and user on successful login', async () => {
      const mockUser = createMockUser();
      mockValidateCredentials.mockResolvedValue(mockUser);
      mockGenerateToken.mockReturnValue({
        token: 'test-jwt-token',
        expiresIn: '1h',
      });

      const { req, res, jsonMock } = createMockReqRes({
        username: 'testuser',
        password: 'correctpassword',
      });

      await loginHandler(req, res);

      expect(mockValidateCredentials).toHaveBeenCalledWith(
        'testuser',
        'correctpassword'
      );
      expect(mockGenerateToken).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.username,
        mockUser.isAdmin
      );
      expect(jsonMock).toHaveBeenCalledWith({
        token: 'test-jwt-token',
        user: {
          id: mockUser.id,
          username: mockUser.username,
          is_admin: mockUser.isAdmin,
        },
      });
    });

    it('should trim username but not password', async () => {
      mockValidateCredentials.mockResolvedValue(null);

      const { req, res } = createMockReqRes({
        username: '  testuser  ',
        password: '  password with spaces  ',
      });

      await loginHandler(req, res);

      expect(mockValidateCredentials).toHaveBeenCalledWith(
        'testuser',
        '  password with spaces  '
      );
    });

    it('should return 500 on internal error', async () => {
      mockValidateCredentials.mockRejectedValue(new Error('Database error'));

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        username: 'testuser',
        password: 'password',
      });

      await loginHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });

    it('should include is_admin: true for admin users', async () => {
      const mockAdmin = createMockUser({ isAdmin: true });
      mockValidateCredentials.mockResolvedValue(mockAdmin);
      mockGenerateToken.mockReturnValue({
        token: 'admin-jwt-token',
        expiresIn: '1h',
      });

      const { req, res, jsonMock } = createMockReqRes({
        username: 'admin',
        password: 'adminpassword',
      });

      await loginHandler(req, res);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({
            is_admin: true,
          }),
        })
      );
    });
  });

  describe('POST /refresh', () => {
    const refreshHandler = getRouteHandler('post', '/refresh');

    it('should return 400 when token is missing', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({});

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Token is required' });
    });

    it('should return 400 for empty token', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: '   ',
      });

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Token is required' });
    });

    it('should return 400 when token is not a string', async () => {
      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: 12345,
      });

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Token is required' });
    });

    it('should return 401 for invalid token', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: 'invalid-token',
      });

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Invalid token' });
    });

    it('should return 401 for expired token', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Token has expired');
      });

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: 'expired-token',
      });

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'Token has expired' });
    });

    it('should return 401 when user no longer exists', async () => {
      mockVerifyToken.mockReturnValue({
        sub: 'deleted-user-id',
        username: 'deleteduser',
        isAdmin: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockFindUserById.mockResolvedValue(null);

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: 'valid-token',
      });

      await refreshHandler(req, res);

      expect(mockFindUserById).toHaveBeenCalledWith('deleted-user-id');
      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({ error: 'User not found' });
    });

    it('should return new token on successful refresh', async () => {
      const mockUser = createMockUser();
      mockVerifyToken.mockReturnValue({
        sub: mockUser.id,
        username: mockUser.username,
        isAdmin: mockUser.isAdmin,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockFindUserById.mockResolvedValue(mockUser);
      mockGenerateToken.mockReturnValue({
        token: 'new-jwt-token',
        expiresIn: '1h',
      });

      const { req, res, jsonMock } = createMockReqRes({
        token: 'old-valid-token',
      });

      await refreshHandler(req, res);

      expect(mockFindUserById).toHaveBeenCalledWith(mockUser.id);
      expect(mockGenerateToken).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.username,
        mockUser.isAdmin
      );
      expect(jsonMock).toHaveBeenCalledWith({ token: 'new-jwt-token' });
    });

    it('should trim token before validation', async () => {
      mockVerifyToken.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      const { req, res } = createMockReqRes({
        token: '  valid-token  ',
      });

      await refreshHandler(req, res);

      expect(mockVerifyToken).toHaveBeenCalledWith('valid-token');
    });

    it('should return 500 on internal error', async () => {
      mockVerifyToken.mockReturnValue({
        sub: 'user-id',
        username: 'testuser',
        isAdmin: false,
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockFindUserById.mockRejectedValue(new Error('Database error'));

      const { req, res, statusMock, jsonMock } = createMockReqRes({
        token: 'valid-token',
      });

      await refreshHandler(req, res);

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Internal server error',
      });
    });

    it('should use updated user data for new token', async () => {
      // User was not admin when token was issued, but is now
      const mockUser = createMockUser({ isAdmin: true });
      mockVerifyToken.mockReturnValue({
        sub: mockUser.id,
        username: mockUser.username,
        isAdmin: false, // Old token says not admin
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      });
      mockFindUserById.mockResolvedValue(mockUser);
      mockGenerateToken.mockReturnValue({
        token: 'new-token',
        expiresIn: '1h',
      });

      const { req, res } = createMockReqRes({
        token: 'old-token',
      });

      await refreshHandler(req, res);

      // Should use current user.isAdmin (true), not old token value (false)
      expect(mockGenerateToken).toHaveBeenCalledWith(
        mockUser.id,
        mockUser.username,
        true
      );
    });
  });
});
