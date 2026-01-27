// Unit tests for config service

import {
  getConfigValue,
  getAllConfig,
  setConfigValue,
  setConfigValues,
  deleteConfigValue,
  DEFAULT_CONFIG,
} from './config.service';
import { prisma } from '../db';

// Mock prisma
jest.mock('../db', () => ({
  prisma: {
    systemConfig: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Mock logger
jest.mock('../logger', () => ({
  createChildLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Config Service', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('getConfigValue', () => {
    it('should return stored value when config exists', async () => {
      (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue({
        key: 'default_storage_quota_bytes',
        value: '2147483648',
        updatedAt: new Date(),
      });

      const result = await getConfigValue('default_storage_quota_bytes');

      expect(result).toBe('2147483648');
      expect(prisma.systemConfig.findUnique).toHaveBeenCalledWith({
        where: { key: 'default_storage_quota_bytes' },
      });
    });

    it('should return default value when config does not exist', async () => {
      (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getConfigValue('default_storage_quota_bytes');

      expect(result).toBe(DEFAULT_CONFIG.default_storage_quota_bytes);
    });

    it('should return default value for notification_time_utc', async () => {
      (prisma.systemConfig.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await getConfigValue('notification_time_utc');

      expect(result).toBe('09:00');
    });
  });

  describe('getAllConfig', () => {
    it('should return merged defaults and stored values', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([
        { key: 'default_storage_quota_bytes', value: '5368709120' },
        { key: 'custom_key', value: 'custom_value' },
      ]);

      const result = await getAllConfig();

      // Should have all default keys
      expect(result.default_storage_quota_bytes).toBe('5368709120'); // Overridden
      expect(result.notification_time_utc).toBe('09:00'); // Default
      expect(result.video_expiration_days).toBe('7'); // Default
      expect(result.distribution_check_interval_minutes).toBe('60'); // Default
      // Should have custom key
      expect(result.custom_key).toBe('custom_value');
    });

    it('should return only defaults when no stored config', async () => {
      (prisma.systemConfig.findMany as jest.Mock).mockResolvedValue([]);

      const result = await getAllConfig();

      expect(result).toEqual(DEFAULT_CONFIG);
    });
  });

  describe('setConfigValue', () => {
    it('should upsert config value', async () => {
      (prisma.systemConfig.upsert as jest.Mock).mockResolvedValue({
        key: 'notification_time_utc',
        value: '10:00',
        updatedAt: new Date(),
      });

      await setConfigValue('notification_time_utc', '10:00');

      expect(prisma.systemConfig.upsert).toHaveBeenCalledWith({
        where: { key: 'notification_time_utc' },
        update: { value: '10:00' },
        create: { key: 'notification_time_utc', value: '10:00' },
      });
    });
  });

  describe('setConfigValues', () => {
    it('should update multiple config values in transaction', async () => {
      const mockTransaction = jest.fn();
      (prisma.$transaction as jest.Mock).mockImplementation(mockTransaction);

      await setConfigValues({
        notification_time_utc: '10:00',
        video_expiration_days: '14',
      });

      expect(prisma.$transaction).toHaveBeenCalled();
      // Verify that 2 upsert operations were passed
      const transactionArg = mockTransaction.mock.calls[0][0];
      expect(transactionArg).toHaveLength(2);
    });

    it('should not call transaction when values is empty', async () => {
      await setConfigValues({});

      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('deleteConfigValue', () => {
    it('should delete config and return true when found', async () => {
      (prisma.systemConfig.delete as jest.Mock).mockResolvedValue({
        key: 'custom_key',
        value: 'custom_value',
        updatedAt: new Date(),
      });

      const result = await deleteConfigValue('custom_key');

      expect(result).toBe(true);
      expect(prisma.systemConfig.delete).toHaveBeenCalledWith({
        where: { key: 'custom_key' },
      });
    });

    it('should return false when config not found', async () => {
      (prisma.systemConfig.delete as jest.Mock).mockRejectedValue({ code: 'P2025' });

      const result = await deleteConfigValue('nonexistent_key');

      expect(result).toBe(false);
    });

    it('should throw on other errors', async () => {
      const error = new Error('Database error');
      (prisma.systemConfig.delete as jest.Mock).mockRejectedValue(error);

      await expect(deleteConfigValue('some_key')).rejects.toThrow('Database error');
    });
  });
});
