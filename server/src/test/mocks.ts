// Test mocks for unit testing
// Provides mock implementations for external dependencies

import type { Config } from '../config';
import type { User } from '@prisma/client';

/**
 * Mock configuration for tests
 */
export const mockConfig: Config = {
  port: 3000,
  nodeEnv: 'test',
  isDevelopment: false,
  isProduction: false,
  databaseUrl: 'postgresql://test:test@localhost:5432/test',
  jwtSecret: 'test-jwt-secret-key-for-testing-only',
  jwtExpiresIn: '1h',
  storagePath: './test-uploads',
  maxFileSizeMb: 100,
  bcryptRounds: 4,
};

/**
 * Create a mock user for testing
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'test-user-id-123',
    username: 'testuser',
    passwordHash: '$2b$04$test-hash-for-testing-purposes',
    isAdmin: false,
    storageQuotaBytes: BigInt(1073741824), // 1GB
    storageUsedBytes: BigInt(0),
    defaultTimerDays: 7,
    fcmToken: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

/**
 * Create a mock admin user for testing
 */
export function createMockAdminUser(overrides: Partial<User> = {}): User {
  return createMockUser({
    id: 'admin-user-id-456',
    username: 'admin',
    isAdmin: true,
    ...overrides,
  });
}
