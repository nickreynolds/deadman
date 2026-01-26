// Unit tests for Recipient Service

import { mockConfig } from '../test/mocks';

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

// Mock Prisma client
const mockFindMany = jest.fn();
const mockFindUnique = jest.fn();
const mockFindFirst = jest.fn();
const mockCreate = jest.fn();
const mockDelete = jest.fn();

jest.mock('../db', () => ({
  prisma: {
    distributionRecipient: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      create: (...args: unknown[]) => mockCreate(...args),
      delete: (...args: unknown[]) => mockDelete(...args),
    },
  },
}));

// Import after mocks
import {
  getRecipientsByUserId,
  findRecipientById,
  createRecipient,
  deleteRecipient,
  recipientEmailExists,
} from './recipient.service';

describe('Recipient Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getRecipientsByUserId', () => {
    it('should return recipients for a user', async () => {
      const mockRecipients = [
        {
          id: 'recipient-1',
          userId: 'user-123',
          email: 'john@example.com',
          name: 'John Doe',
          createdAt: new Date('2026-01-15'),
        },
        {
          id: 'recipient-2',
          userId: 'user-123',
          email: 'jane@example.com',
          name: null,
          createdAt: new Date('2026-01-16'),
        },
      ];
      mockFindMany.mockResolvedValue(mockRecipients);

      const result = await getRecipientsByUserId('user-123');

      expect(mockFindMany).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        orderBy: { createdAt: 'desc' },
      });
      expect(result).toEqual(mockRecipients);
    });

    it('should return empty array when user has no recipients', async () => {
      mockFindMany.mockResolvedValue([]);

      const result = await getRecipientsByUserId('user-with-no-recipients');

      expect(result).toEqual([]);
    });

    it('should order recipients by createdAt descending', async () => {
      mockFindMany.mockResolvedValue([]);

      await getRecipientsByUserId('user-123');

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
        })
      );
    });
  });

  describe('findRecipientById', () => {
    it('should return recipient when found', async () => {
      const mockRecipient = {
        id: 'recipient-1',
        userId: 'user-123',
        email: 'john@example.com',
        name: 'John Doe',
        createdAt: new Date('2026-01-15'),
      };
      mockFindUnique.mockResolvedValue(mockRecipient);

      const result = await findRecipientById('recipient-1');

      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { id: 'recipient-1' },
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should return null when recipient not found', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await findRecipientById('non-existent-id');

      expect(result).toBeNull();
    });
  });

  describe('createRecipient', () => {
    it('should create recipient with email and name', async () => {
      const mockRecipient = {
        id: 'new-recipient-id',
        userId: 'user-123',
        email: 'new@example.com',
        name: 'New User',
        createdAt: new Date(),
      };
      mockCreate.mockResolvedValue(mockRecipient);

      const result = await createRecipient('user-123', 'new@example.com', 'New User');

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          email: 'new@example.com',
          name: 'New User',
        },
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should create recipient with email only (no name)', async () => {
      const mockRecipient = {
        id: 'new-recipient-id',
        userId: 'user-123',
        email: 'noname@example.com',
        name: null,
        createdAt: new Date(),
      };
      mockCreate.mockResolvedValue(mockRecipient);

      const result = await createRecipient('user-123', 'noname@example.com');

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          email: 'noname@example.com',
          name: null,
        },
      });
      expect(result).toEqual(mockRecipient);
    });

    it('should set name to null when empty string provided', async () => {
      const mockRecipient = {
        id: 'new-recipient-id',
        userId: 'user-123',
        email: 'test@example.com',
        name: null,
        createdAt: new Date(),
      };
      mockCreate.mockResolvedValue(mockRecipient);

      await createRecipient('user-123', 'test@example.com', '');

      expect(mockCreate).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          email: 'test@example.com',
          name: null,
        },
      });
    });
  });

  describe('deleteRecipient', () => {
    it('should return true when recipient deleted successfully', async () => {
      mockDelete.mockResolvedValue({
        id: 'recipient-1',
        userId: 'user-123',
        email: 'deleted@example.com',
        name: null,
        createdAt: new Date(),
      });

      const result = await deleteRecipient('recipient-1');

      expect(mockDelete).toHaveBeenCalledWith({
        where: { id: 'recipient-1' },
      });
      expect(result).toBe(true);
    });

    it('should return false when recipient not found', async () => {
      const notFoundError = new Error('Record not found');
      (notFoundError as any).code = 'P2025';
      mockDelete.mockRejectedValue(notFoundError);

      const result = await deleteRecipient('non-existent-id');

      expect(result).toBe(false);
    });

    it('should throw error for other database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockDelete.mockRejectedValue(dbError);

      await expect(deleteRecipient('recipient-1')).rejects.toThrow('Database connection failed');
    });
  });

  describe('recipientEmailExists', () => {
    it('should return true when email exists for user', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'recipient-1',
        userId: 'user-123',
        email: 'existing@example.com',
        name: 'Existing User',
        createdAt: new Date(),
      });

      const result = await recipientEmailExists('user-123', 'existing@example.com');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          email: {
            equals: 'existing@example.com',
            mode: 'insensitive',
          },
        },
      });
      expect(result).toBe(true);
    });

    it('should return false when email does not exist for user', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await recipientEmailExists('user-123', 'new@example.com');

      expect(result).toBe(false);
    });

    it('should use case-insensitive comparison', async () => {
      mockFindFirst.mockResolvedValue(null);

      await recipientEmailExists('user-123', 'TEST@EXAMPLE.COM');

      expect(mockFindFirst).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          email: {
            equals: 'TEST@EXAMPLE.COM',
            mode: 'insensitive',
          },
        },
      });
    });
  });
});
