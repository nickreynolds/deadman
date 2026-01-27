/**
 * Notification Job Unit Tests
 */

import { processNotifications, notificationJobHandler, NotificationJobResult } from './notification.job';

// Mock dependencies
jest.mock('../db', () => ({
  prisma: {
    video: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('../logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

jest.mock('../services/notification.service', () => ({
  sendCheckInReminder: jest.fn(),
  formatTimeUntilDistribution: jest.fn().mockReturnValue('2 days'),
}));

import { prisma } from '../db';
import { sendCheckInReminder, formatTimeUntilDistribution } from '../services/notification.service';

const mockFindMany = prisma.video.findMany as jest.Mock;
const mockSendReminder = sendCheckInReminder as jest.Mock;
const mockFormatTime = formatTimeUntilDistribution as jest.Mock;

describe('Notification Job', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockSendReminder.mockResolvedValue({ success: true, userId: '', videoId: '' });
    mockFormatTime.mockReturnValue('2 days');
  });

  describe('processNotifications', () => {
    it('should return empty result when no active videos exist', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 0,
        notificationsAttempted: 0,
        notificationsSent: 0,
        notificationsSkipped: 0,
        notificationsFailed: 0,
        errors: [],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockSendReminder).not.toHaveBeenCalled();
    });

    it('should query videos with status ACTIVE', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await processNotifications();

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          status: 'ACTIVE',
        },
        select: {
          id: true,
          title: true,
          distributeAt: true,
          user: {
            select: {
              id: true,
              fcmToken: true,
            },
          },
        },
      });
    });

    it('should send notification for active video with FCM token', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: {
          id: 'user-1',
          fcmToken: 'valid-fcm-token',
        },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockResolvedValueOnce({
        success: true,
        userId: 'user-1',
        videoId: 'video-1',
      });

      const result = await processNotifications(new Date('2026-01-27T09:00:00Z'));

      expect(result).toEqual({
        videosFound: 1,
        notificationsAttempted: 1,
        notificationsSent: 1,
        notificationsSkipped: 0,
        notificationsFailed: 0,
        errors: [],
      });

      expect(mockSendReminder).toHaveBeenCalledWith({
        fcmToken: 'valid-fcm-token',
        userId: 'user-1',
        videoId: 'video-1',
        videoTitle: 'Test Video',
        timeUntilDistribution: '2 days',
      });
    });

    it('should skip notification for user without FCM token', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: {
          id: 'user-1',
          fcmToken: null,
        },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 1,
        notificationsAttempted: 1,
        notificationsSent: 0,
        notificationsSkipped: 1,
        notificationsFailed: 0,
        errors: [],
      });

      expect(mockSendReminder).not.toHaveBeenCalled();
    });

    it('should send multiple notifications for multiple videos', async () => {
      const mockVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          distributeAt: new Date('2026-01-30T00:00:00Z'),
          user: { id: 'user-1', fcmToken: 'token-1' },
        },
        {
          id: 'video-2',
          title: 'Video 2',
          distributeAt: new Date('2026-01-29T00:00:00Z'),
          user: { id: 'user-2', fcmToken: 'token-2' },
        },
        {
          id: 'video-3',
          title: 'Video 3',
          distributeAt: new Date('2026-01-31T00:00:00Z'),
          user: { id: 'user-1', fcmToken: 'token-1' }, // Same user, different video
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockSendReminder
        .mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' })
        .mockResolvedValueOnce({ success: true, userId: 'user-2', videoId: 'video-2' })
        .mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-3' });

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 3,
        notificationsAttempted: 3,
        notificationsSent: 3,
        notificationsSkipped: 0,
        notificationsFailed: 0,
        errors: [],
      });

      expect(mockSendReminder).toHaveBeenCalledTimes(3);
    });

    it('should handle mixed results (some with tokens, some without)', async () => {
      const mockVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          distributeAt: new Date('2026-01-30T00:00:00Z'),
          user: { id: 'user-1', fcmToken: 'token-1' },
        },
        {
          id: 'video-2',
          title: 'Video 2',
          distributeAt: new Date('2026-01-29T00:00:00Z'),
          user: { id: 'user-2', fcmToken: null }, // No token
        },
        {
          id: 'video-3',
          title: 'Video 3',
          distributeAt: new Date('2026-01-31T00:00:00Z'),
          user: { id: 'user-3', fcmToken: 'token-3' },
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockSendReminder
        .mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' })
        .mockResolvedValueOnce({ success: true, userId: 'user-3', videoId: 'video-3' });

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 3,
        notificationsAttempted: 3,
        notificationsSent: 2,
        notificationsSkipped: 1,
        notificationsFailed: 0,
        errors: [],
      });

      expect(mockSendReminder).toHaveBeenCalledTimes(2);
    });

    it('should handle notification send failure', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: { id: 'user-1', fcmToken: 'valid-token' },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockResolvedValueOnce({
        success: false,
        userId: 'user-1',
        videoId: 'video-1',
        error: 'Invalid FCM token',
      });

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 1,
        notificationsAttempted: 1,
        notificationsSent: 0,
        notificationsSkipped: 0,
        notificationsFailed: 1,
        errors: [{ userId: 'user-1', videoId: 'video-1', error: 'Invalid FCM token' }],
      });
    });

    it('should handle notification send throwing an error', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: { id: 'user-1', fcmToken: 'valid-token' },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockRejectedValueOnce(new Error('Firebase connection error'));

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 1,
        notificationsAttempted: 1,
        notificationsSent: 0,
        notificationsSkipped: 0,
        notificationsFailed: 1,
        errors: [{ userId: 'user-1', videoId: 'video-1', error: 'Firebase connection error' }],
      });
    });

    it('should continue processing after individual failure', async () => {
      const mockVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          distributeAt: new Date('2026-01-30T00:00:00Z'),
          user: { id: 'user-1', fcmToken: 'token-1' },
        },
        {
          id: 'video-2',
          title: 'Video 2',
          distributeAt: new Date('2026-01-29T00:00:00Z'),
          user: { id: 'user-2', fcmToken: 'token-2' },
        },
        {
          id: 'video-3',
          title: 'Video 3',
          distributeAt: new Date('2026-01-31T00:00:00Z'),
          user: { id: 'user-3', fcmToken: 'token-3' },
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockSendReminder
        .mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' })
        .mockRejectedValueOnce(new Error('Failed for user-2'))
        .mockResolvedValueOnce({ success: true, userId: 'user-3', videoId: 'video-3' });

      const result = await processNotifications();

      expect(result).toEqual({
        videosFound: 3,
        notificationsAttempted: 3,
        notificationsSent: 2,
        notificationsSkipped: 0,
        notificationsFailed: 1,
        errors: [{ userId: 'user-2', videoId: 'video-2', error: 'Failed for user-2' }],
      });
    });

    it('should throw if findMany fails', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(processNotifications()).rejects.toThrow('Database connection failed');
    });

    it('should handle non-Error thrown objects', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: { id: 'user-1', fcmToken: 'valid-token' },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockRejectedValueOnce('String error');

      const result = await processNotifications();

      expect(result.errors).toEqual([
        { userId: 'user-1', videoId: 'video-1', error: 'String error' },
      ]);
    });

    it('should pass current time to formatTimeUntilDistribution', async () => {
      const { formatTimeUntilDistribution } = jest.requireMock(
        '../services/notification.service'
      );
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: { id: 'user-1', fcmToken: 'token-1' },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' });

      const testTime = new Date('2026-01-27T09:00:00Z');
      await processNotifications(testTime);

      expect(formatTimeUntilDistribution).toHaveBeenCalledWith(
        new Date('2026-01-30T00:00:00Z'),
        testTime
      );
    });
  });

  describe('notificationJobHandler', () => {
    it('should call processNotifications', async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await notificationJobHandler();

      expect(mockFindMany).toHaveBeenCalledTimes(1);
    });

    it('should complete without throwing on success', async () => {
      const mockVideo = {
        id: 'video-1',
        title: 'Test Video',
        distributeAt: new Date('2026-01-30T00:00:00Z'),
        user: { id: 'user-1', fcmToken: 'token-1' },
      };

      mockFindMany.mockResolvedValueOnce([mockVideo]);
      mockSendReminder.mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' });

      await expect(notificationJobHandler()).resolves.not.toThrow();
    });

    it('should complete without throwing on partial failure', async () => {
      const mockVideos = [
        {
          id: 'video-1',
          title: 'Video 1',
          distributeAt: new Date('2026-01-30T00:00:00Z'),
          user: { id: 'user-1', fcmToken: 'token-1' },
        },
        {
          id: 'video-2',
          title: 'Video 2',
          distributeAt: new Date('2026-01-29T00:00:00Z'),
          user: { id: 'user-2', fcmToken: 'token-2' },
        },
      ];

      mockFindMany.mockResolvedValueOnce(mockVideos);
      mockSendReminder
        .mockResolvedValueOnce({ success: true, userId: 'user-1', videoId: 'video-1' })
        .mockRejectedValueOnce(new Error('Failed'));

      await expect(notificationJobHandler()).resolves.not.toThrow();
    });

    it('should throw if processNotifications throws', async () => {
      mockFindMany.mockRejectedValueOnce(new Error('Database error'));

      await expect(notificationJobHandler()).rejects.toThrow('Database error');
    });
  });
});
