// Unit tests for JWT service
// Tests token generation, verification, and helper functions

import { mockConfig } from '../test/mocks';

// Mock the config module before importing jwt.service
jest.mock('../config', () => ({
  getConfig: jest.fn(() => mockConfig),
}));

// Mock the logger to suppress output during tests
jest.mock('../logger', () => ({
  createChildLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

import {
  generateToken,
  verifyToken,
  isTokenExpiring,
  getTokenExpirationSeconds,
  extractTokenFromHeader,
} from './jwt.service';

describe('JWT Service', () => {
  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const result = generateToken('user-123', 'testuser', false);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('expiresIn');
      expect(typeof result.token).toBe('string');
      expect(result.token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include correct payload in token', () => {
      const result = generateToken('user-456', 'admin', true);
      const decoded = verifyToken(result.token);

      expect(decoded.sub).toBe('user-456');
      expect(decoded.username).toBe('admin');
      expect(decoded.isAdmin).toBe(true);
    });

    it('should include isAdmin: false for non-admin users', () => {
      const result = generateToken('user-789', 'regular', false);
      const decoded = verifyToken(result.token);

      expect(decoded.isAdmin).toBe(false);
    });

    it('should set expiration time on token', () => {
      const result = generateToken('user-123', 'testuser', false);
      const decoded = verifyToken(result.token);

      expect(decoded.iat).toBeDefined();
      expect(decoded.exp).toBeDefined();
      expect(decoded.exp).toBeGreaterThan(decoded.iat);
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token and return payload', () => {
      const { token } = generateToken('user-123', 'testuser', false);
      const decoded = verifyToken(token);

      expect(decoded.sub).toBe('user-123');
      expect(decoded.username).toBe('testuser');
      expect(decoded.isAdmin).toBe(false);
    });

    it('should throw error for invalid token', () => {
      expect(() => verifyToken('invalid-token')).toThrow('Invalid token');
    });

    it('should throw error for malformed token', () => {
      expect(() => verifyToken('not.a.valid.jwt.token')).toThrow('Invalid token');
    });

    it('should throw error for token with wrong signature', () => {
      const { token } = generateToken('user-123', 'testuser', false);
      // Tamper with the signature
      const parts = token.split('.');
      parts[2] = 'tampered-signature';
      const tamperedToken = parts.join('.');

      expect(() => verifyToken(tamperedToken)).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // Create a token that's already expired by manipulating the config
      const { getConfig } = require('../config');
      getConfig.mockReturnValueOnce({ ...mockConfig, jwtExpiresIn: '0s' });

      const { token } = generateToken('user-123', 'testuser', false);

      // Wait a tiny bit for expiration
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(() => verifyToken(token)).toThrow('Token has expired');
          resolve();
        }, 100);
      });
    });
  });

  describe('isTokenExpiring', () => {
    it('should return false for fresh token', () => {
      const { token } = generateToken('user-123', 'testuser', false);
      expect(isTokenExpiring(token)).toBe(false);
    });

    it('should return false for token with plenty of time left', () => {
      const { token } = generateToken('user-123', 'testuser', false);
      expect(isTokenExpiring(token, 60)).toBe(false);
    });

    it('should return true for invalid token', () => {
      expect(isTokenExpiring('invalid-token')).toBe(true);
    });

    it('should handle custom buffer time', () => {
      // Token expires in 1 hour (3600 seconds)
      const { token } = generateToken('user-123', 'testuser', false);

      // Should not be expiring with 60 second buffer
      expect(isTokenExpiring(token, 60)).toBe(false);

      // Should be expiring if buffer is longer than token lifetime
      expect(isTokenExpiring(token, 7200)).toBe(true);
    });
  });

  describe('getTokenExpirationSeconds', () => {
    it('should return expiration in seconds for hours format', () => {
      // mockConfig has '1h' expiration
      const seconds = getTokenExpirationSeconds();
      expect(seconds).toBe(3600); // 1 hour = 3600 seconds
    });

    it('should handle different expiration formats', () => {
      const { getConfig } = require('../config');

      // Test days
      getConfig.mockReturnValueOnce({ ...mockConfig, jwtExpiresIn: '7d' });
      expect(getTokenExpirationSeconds()).toBe(7 * 24 * 60 * 60);

      // Test minutes
      getConfig.mockReturnValueOnce({ ...mockConfig, jwtExpiresIn: '30m' });
      expect(getTokenExpirationSeconds()).toBe(30 * 60);

      // Test seconds
      getConfig.mockReturnValueOnce({ ...mockConfig, jwtExpiresIn: '3600s' });
      expect(getTokenExpirationSeconds()).toBe(3600);

      // Test plain number (seconds)
      getConfig.mockReturnValueOnce({ ...mockConfig, jwtExpiresIn: '7200' });
      expect(getTokenExpirationSeconds()).toBe(7200);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const result = extractTokenFromHeader(`Bearer ${token}`);
      expect(result).toBe(token);
    });

    it('should return null for undefined header', () => {
      expect(extractTokenFromHeader(undefined)).toBeNull();
    });

    it('should return null for empty header', () => {
      expect(extractTokenFromHeader('')).toBeNull();
    });

    it('should return null for non-Bearer scheme', () => {
      expect(extractTokenFromHeader('Basic some-credentials')).toBeNull();
    });

    it('should return null for missing token after Bearer', () => {
      expect(extractTokenFromHeader('Bearer')).toBeNull();
    });

    it('should return null for malformed header with extra parts', () => {
      expect(extractTokenFromHeader('Bearer token extra')).toBeNull();
    });

    it('should be case-insensitive for Bearer scheme', () => {
      const token = 'test-token';
      expect(extractTokenFromHeader(`bearer ${token}`)).toBe(token);
      expect(extractTokenFromHeader(`BEARER ${token}`)).toBe(token);
    });
  });
});
