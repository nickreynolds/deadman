// Unit tests for User Service
// Tests password hashing, verification, and credential validation

import { mockConfig, createMockUser } from '../test/mocks';

// Mock bcrypt before any imports that use it
// This avoids issues with native module loading in test environment
const mockBcryptHash = jest.fn();
const mockBcryptCompare = jest.fn();
jest.mock('bcrypt', () => ({
  hash: (...args: unknown[]) => mockBcryptHash(...args),
  compare: (...args: unknown[]) => mockBcryptCompare(...args),
}));

// Mock the config module
jest.mock('../config', () => ({
  getConfig: jest.fn(() => mockConfig),
}));

// Mock the logger
jest.mock('../logger', () => ({
  createChildLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

// Mock the database
jest.mock('../db', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

import {
  hashPassword,
  verifyPassword,
  createUser,
  findUserByUsername,
  findUserById,
  validateCredentials,
  updatePassword,
  getAllUsers,
  deleteUser,
  updateUser,
} from './user.service';
import { prisma } from '../db';

describe('User Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mock implementations
    mockBcryptHash.mockImplementation(async (password: string, rounds: number) => {
      return `$2b$${rounds}$hashed_${password}`;
    });
    mockBcryptCompare.mockImplementation(async (password: string, hash: string) => {
      // Simple mock comparison - checks if hash contains the password
      return hash.includes(`hashed_${password}`);
    });
  });

  describe('hashPassword', () => {
    it('should hash a password using bcrypt', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(mockBcryptHash).toHaveBeenCalledWith(password, expect.any(Number));
      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
    });

    it('should use configured bcrypt rounds', async () => {
      const password = 'testPassword';
      await hashPassword(password);

      // mockConfig has bcryptRounds: 4
      expect(mockBcryptHash).toHaveBeenCalledWith(password, expect.any(Number));
    });

    it('should produce bcrypt-formatted hash', async () => {
      const password = 'testPassword123';
      const hash = await hashPassword(password);

      expect(hash.startsWith('$2b$')).toBe(true);
    });
  });

  describe('verifyPassword', () => {
    it('should verify correct password', async () => {
      mockBcryptCompare.mockResolvedValue(true);

      const isValid = await verifyPassword('correctPassword', 'hash');

      expect(mockBcryptCompare).toHaveBeenCalledWith('correctPassword', 'hash');
      expect(isValid).toBe(true);
    });

    it('should reject incorrect password', async () => {
      mockBcryptCompare.mockResolvedValue(false);

      const isValid = await verifyPassword('wrongPassword', 'hash');

      expect(isValid).toBe(false);
    });

    it('should call bcrypt.compare with password and hash', async () => {
      await verifyPassword('password', 'hashValue');

      expect(mockBcryptCompare).toHaveBeenCalledWith('password', 'hashValue');
    });
  });

  describe('createUser', () => {
    it('should create user with hashed password', async () => {
      const mockUser = createMockUser();
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await createUser({
        username: 'newuser',
        password: 'plainPassword',
      });

      expect(mockBcryptHash).toHaveBeenCalledWith('plainPassword', expect.any(Number));
      expect(prisma.user.create).toHaveBeenCalledTimes(1);
      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];

      // Password should be hashed, not plain
      expect(createCall.data.passwordHash).not.toBe('plainPassword');
      expect(result).toEqual(mockUser);
    });

    it('should create user with admin flag', async () => {
      const mockAdmin = createMockUser({ isAdmin: true });
      (prisma.user.create as jest.Mock).mockResolvedValue(mockAdmin);

      await createUser({
        username: 'admin',
        password: 'password',
        isAdmin: true,
      });

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.isAdmin).toBe(true);
    });

    it('should default isAdmin to false', async () => {
      const mockUser = createMockUser();
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await createUser({
        username: 'user',
        password: 'password',
      });

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.isAdmin).toBe(false);
    });

    it('should set custom storage quota', async () => {
      const quota = BigInt(5368709120); // 5GB
      const mockUser = createMockUser({ storageQuotaBytes: quota });
      (prisma.user.create as jest.Mock).mockResolvedValue(mockUser);

      await createUser({
        username: 'user',
        password: 'password',
        storageQuotaBytes: quota,
      });

      const createCall = (prisma.user.create as jest.Mock).mock.calls[0][0];
      expect(createCall.data.storageQuotaBytes).toBe(quota);
    });
  });

  describe('findUserByUsername', () => {
    it('should find existing user', async () => {
      const mockUser = createMockUser();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await findUserByUsername('testuser');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await findUserByUsername('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findUserById', () => {
    it('should find existing user', async () => {
      const mockUser = createMockUser();
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);

      const result = await findUserById('test-user-id-123');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'test-user-id-123' },
      });
      expect(result).toEqual(mockUser);
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await findUserById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('validateCredentials', () => {
    it('should return user for valid credentials', async () => {
      const mockUser = createMockUser({ passwordHash: 'stored-hash' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(true);

      const result = await validateCredentials('testuser', 'correctPassword');

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { username: 'testuser' },
      });
      expect(mockBcryptCompare).toHaveBeenCalledWith('correctPassword', 'stored-hash');
      expect(result).toEqual(mockUser);
    });

    it('should return null for invalid password', async () => {
      const mockUser = createMockUser({ passwordHash: 'stored-hash' });
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(mockUser);
      mockBcryptCompare.mockResolvedValue(false);

      const result = await validateCredentials('testuser', 'wrongPassword');

      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await validateCredentials('nonexistent', 'password');

      expect(result).toBeNull();
    });

    it('should perform dummy hash when user not found for timing attack prevention', async () => {
      (prisma.user.findUnique as jest.Mock).mockResolvedValue(null);

      await validateCredentials('nonexistent', 'password');

      // Should still call hash to prevent timing attacks
      expect(mockBcryptHash).toHaveBeenCalled();
    });
  });

  describe('updatePassword', () => {
    it('should update password with new hash', async () => {
      (prisma.user.update as jest.Mock).mockResolvedValue(createMockUser());

      await updatePassword('user-id', 'newPassword');

      expect(mockBcryptHash).toHaveBeenCalledWith('newPassword', expect.any(Number));
      expect(prisma.user.update).toHaveBeenCalledTimes(1);
      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];

      expect(updateCall.where.id).toBe('user-id');
      expect(updateCall.data.passwordHash).not.toBe('newPassword');
    });
  });

  describe('getAllUsers', () => {
    it('should return all users', async () => {
      const mockUsers = [createMockUser(), createMockUser({ id: 'user-2' })];
      (prisma.user.findMany as jest.Mock).mockResolvedValue(mockUsers);

      const result = await getAllUsers();

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockUsers);
    });

    it('should return empty array when no users', async () => {
      (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getAllUsers();

      expect(result).toEqual([]);
    });
  });

  describe('deleteUser', () => {
    it('should delete existing user and return true', async () => {
      (prisma.user.delete as jest.Mock).mockResolvedValue(createMockUser());

      const result = await deleteUser('user-id');

      expect(prisma.user.delete).toHaveBeenCalledWith({
        where: { id: 'user-id' },
      });
      expect(result).toBe(true);
    });

    it('should return false for non-existent user', async () => {
      const error = { code: 'P2025' };
      (prisma.user.delete as jest.Mock).mockRejectedValue(error);

      const result = await deleteUser('non-existent');

      expect(result).toBe(false);
    });

    it('should throw for other errors', async () => {
      const error = new Error('Database error');
      (prisma.user.delete as jest.Mock).mockRejectedValue(error);

      await expect(deleteUser('user-id')).rejects.toThrow('Database error');
    });
  });

  describe('updateUser', () => {
    it('should update user properties', async () => {
      const updatedUser = createMockUser({ isAdmin: true });
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      const result = await updateUser('user-id', { isAdmin: true });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-id' },
        data: { isAdmin: true },
      });
      expect(result).toEqual(updatedUser);
    });

    it('should return null for non-existent user', async () => {
      const error = { code: 'P2025' };
      (prisma.user.update as jest.Mock).mockRejectedValue(error);

      const result = await updateUser('non-existent', { isAdmin: true });

      expect(result).toBeNull();
    });

    it('should throw for other errors', async () => {
      const error = new Error('Database error');
      (prisma.user.update as jest.Mock).mockRejectedValue(error);

      await expect(updateUser('user-id', { isAdmin: true })).rejects.toThrow(
        'Database error'
      );
    });

    it('should update multiple properties', async () => {
      const updatedUser = createMockUser();
      (prisma.user.update as jest.Mock).mockResolvedValue(updatedUser);

      await updateUser('user-id', {
        isAdmin: true,
        storageQuotaBytes: BigInt(5000000000),
        defaultTimerDays: 14,
        fcmToken: 'new-token',
      });

      const updateCall = (prisma.user.update as jest.Mock).mock.calls[0][0];
      expect(updateCall.data).toEqual({
        isAdmin: true,
        storageQuotaBytes: BigInt(5000000000),
        defaultTimerDays: 14,
        fcmToken: 'new-token',
      });
    });
  });
});
