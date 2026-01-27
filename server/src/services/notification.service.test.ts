/**
 * Notification Service Unit Tests
 */

import {
  sendCheckInReminder,
  sendCheckInReminders,
  formatTimeUntilDistribution,
  isFirebaseConfigured,
  CheckInReminderPayload,
} from './notification.service';

// Mock logger
jest.mock('../logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  }),
}));

describe('Notification Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('sendCheckInReminder', () => {
    it('should return success for valid payload', async () => {
      const payload: CheckInReminderPayload = {
        fcmToken: 'valid-fcm-token-12345',
        userId: 'user-1',
        videoId: 'video-1',
        videoTitle: 'Test Video',
        timeUntilDistribution: '2 days',
      };

      const result = await sendCheckInReminder(payload);

      expect(result).toEqual({
        success: true,
        userId: 'user-1',
        videoId: 'video-1',
      });
    });

    it('should return failure when FCM token is empty', async () => {
      const payload: CheckInReminderPayload = {
        fcmToken: '',
        userId: 'user-1',
        videoId: 'video-1',
        videoTitle: 'Test Video',
        timeUntilDistribution: '2 days',
      };

      const result = await sendCheckInReminder(payload);

      expect(result).toEqual({
        success: false,
        userId: 'user-1',
        videoId: 'video-1',
        error: 'No FCM token registered',
      });
    });

    it('should return failure when FCM token is null-ish', async () => {
      const payload: CheckInReminderPayload = {
        fcmToken: null as unknown as string,
        userId: 'user-1',
        videoId: 'video-1',
        videoTitle: 'Test Video',
        timeUntilDistribution: '2 days',
      };

      const result = await sendCheckInReminder(payload);

      expect(result.success).toBe(false);
      expect(result.error).toBe('No FCM token registered');
    });
  });

  describe('sendCheckInReminders', () => {
    it('should send multiple notifications', async () => {
      const payloads: CheckInReminderPayload[] = [
        {
          fcmToken: 'token-1',
          userId: 'user-1',
          videoId: 'video-1',
          videoTitle: 'Video 1',
          timeUntilDistribution: '2 days',
        },
        {
          fcmToken: 'token-2',
          userId: 'user-2',
          videoId: 'video-2',
          videoTitle: 'Video 2',
          timeUntilDistribution: '1 day',
        },
      ];

      const results = await sendCheckInReminders(payloads);

      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(true);
    });

    it('should handle mixed success and failure', async () => {
      const payloads: CheckInReminderPayload[] = [
        {
          fcmToken: 'valid-token',
          userId: 'user-1',
          videoId: 'video-1',
          videoTitle: 'Video 1',
          timeUntilDistribution: '2 days',
        },
        {
          fcmToken: '', // Invalid
          userId: 'user-2',
          videoId: 'video-2',
          videoTitle: 'Video 2',
          timeUntilDistribution: '1 day',
        },
      ];

      const results = await sendCheckInReminders(payloads);

      expect(results).toHaveLength(2);
      expect(results[0]!.success).toBe(true);
      expect(results[1]!.success).toBe(false);
    });

    it('should handle empty payloads array', async () => {
      const results = await sendCheckInReminders([]);

      expect(results).toHaveLength(0);
    });
  });

  describe('formatTimeUntilDistribution', () => {
    it('should format time in days when >= 1 day', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-30T12:00:00Z'); // 3 days later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('3 days');
    });

    it('should format singular day correctly', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-28T12:00:00Z'); // 1 day later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('1 day');
    });

    it('should format time in hours when < 1 day but >= 1 hour', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T17:00:00Z'); // 5 hours later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('5 hours');
    });

    it('should format singular hour correctly', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T13:00:00Z'); // 1 hour later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('1 hour');
    });

    it('should format time in minutes when < 1 hour but >= 1 minute', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T12:30:00Z'); // 30 minutes later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('30 minutes');
    });

    it('should format singular minute correctly', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T12:01:00Z'); // 1 minute later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('1 minute');
    });

    it('should return "soon" when less than 1 minute', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T12:00:30Z'); // 30 seconds later

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('soon');
    });

    it('should return "soon" when time has passed', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-27T11:00:00Z'); // 1 hour ago

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('soon');
    });

    it('should use current time when no time provided', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);

      const result = formatTimeUntilDistribution(futureDate);

      expect(result).toMatch(/days?/);
    });

    it('should handle exactly 24 hours as 1 day', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-28T12:00:00Z'); // Exactly 24 hours

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('1 day');
    });

    it('should handle 23 hours as hours not days', () => {
      const now = new Date('2026-01-27T12:00:00Z');
      const distributeAt = new Date('2026-01-28T11:00:00Z'); // 23 hours

      const result = formatTimeUntilDistribution(distributeAt, now);

      expect(result).toBe('23 hours');
    });
  });

  describe('isFirebaseConfigured', () => {
    it('should return false (not yet implemented)', () => {
      const result = isFirebaseConfigured();

      expect(result).toBe(false);
    });
  });
});
