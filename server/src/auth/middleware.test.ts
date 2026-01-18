// Unit tests for Authentication Middleware
// Tests requireAuth and requireAdmin middleware

import { Request, Response, NextFunction } from 'express';
import { mockConfig, createMockUser, createMockAdminUser } from '../test/mocks';

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

// Mock passport with a controllable authenticate function
const mockAuthenticate = jest.fn();
jest.mock('./passport', () => ({
  passport: {
    authenticate: mockAuthenticate,
  },
}));

import {
  requireAuth,
  requireAdmin,
  isAuthenticated,
  getAuthenticatedUser,
  isAdmin,
} from './middleware';
import type { AuthenticatedUser } from './passport';

describe('Authentication Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));

    mockRequest = {
      path: '/api/test',
      method: 'GET',
      user: undefined,
    };

    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    mockNext = jest.fn();
  });

  describe('requireAuth', () => {
    it('should call next when authentication succeeds', () => {
      const mockUser: AuthenticatedUser = {
        id: 'user-123',
        username: 'testuser',
        isAdmin: false,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Mock passport.authenticate to call the callback with a user
      mockAuthenticate.mockImplementation((strategy, options, callback) => {
        return (req: Request, res: Response, next: NextFunction) => {
          callback(null, mockUser, undefined);
        };
      });

      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.user).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 401 when no user is authenticated', () => {
      mockAuthenticate.mockImplementation((strategy, options, callback) => {
        return (req: Request, res: Response, next: NextFunction) => {
          callback(null, false, { message: 'No auth token' });
        };
      });

      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'No auth token',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 with default message when no info provided', () => {
      mockAuthenticate.mockImplementation((strategy, options, callback) => {
        return (req: Request, res: Response, next: NextFunction) => {
          callback(null, false, undefined);
        };
      });

      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
    });

    it('should return 500 on authentication error', () => {
      const error = new Error('Auth error');

      mockAuthenticate.mockImplementation((strategy, options, callback) => {
        return (req: Request, res: Response, next: NextFunction) => {
          callback(error, false, undefined);
        };
      });

      requireAuth(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(500);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Authentication error',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireAdmin', () => {
    it('should call next when user is admin', () => {
      mockRequest.user = {
        id: 'admin-123',
        username: 'admin',
        isAdmin: true,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should return 403 when user is not admin', () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'regularuser',
        isAdmin: false,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(403);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Forbidden',
        message: 'Admin privileges required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 when user is not authenticated', () => {
      mockRequest.user = undefined;

      requireAdmin(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Authentication required',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('isAuthenticated', () => {
    it('should return true when user is set', () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'testuser',
        isAdmin: false,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isAuthenticated(mockRequest as Request)).toBe(true);
    });

    it('should return false when user is undefined', () => {
      mockRequest.user = undefined;
      expect(isAuthenticated(mockRequest as Request)).toBe(false);
    });
  });

  describe('getAuthenticatedUser', () => {
    it('should return user when authenticated', () => {
      const mockUser: AuthenticatedUser = {
        id: 'user-123',
        username: 'testuser',
        isAdmin: false,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockRequest.user = mockUser;

      expect(getAuthenticatedUser(mockRequest as Request)).toEqual(mockUser);
    });

    it('should throw when not authenticated', () => {
      mockRequest.user = undefined;

      expect(() => getAuthenticatedUser(mockRequest as Request)).toThrow(
        'User not authenticated. Ensure requireAuth middleware is applied.'
      );
    });
  });

  describe('isAdmin', () => {
    it('should return true when user is admin', () => {
      mockRequest.user = {
        id: 'admin-123',
        username: 'admin',
        isAdmin: true,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isAdmin(mockRequest as Request)).toBe(true);
    });

    it('should return false when user is not admin', () => {
      mockRequest.user = {
        id: 'user-123',
        username: 'regularuser',
        isAdmin: false,
        storageQuotaBytes: BigInt(1073741824),
        storageUsedBytes: BigInt(0),
        defaultTimerDays: 7,
        fcmToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(isAdmin(mockRequest as Request)).toBe(false);
    });

    it('should return false when user is not authenticated', () => {
      mockRequest.user = undefined;
      expect(isAdmin(mockRequest as Request)).toBe(false);
    });
  });
});
