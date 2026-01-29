/**
 * Deep Linking Service Tests
 *
 * Tests for deep linking payload generation for mobile push notifications.
 * PRD Task 68: Add deep linking payload
 */

import {
  DeepLinkAction,
  NotificationType,
  DeepLinkPayload,
  buildCheckInReminderPayload,
  buildDistributionWarningPayload,
  buildVideoDistributedPayload,
  buildVideoExpiredPayload,
  serializeDeepLinkPayload,
  isValidDeepLinkPayload,
} from './deep-linking';

// Mock the logger
jest.mock('../logger', () => ({
  createChildLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Deep Linking Service', () => {
  const testVideoId = '123e4567-e89b-12d3-a456-426614174000';
  const testUserId = '987fcdeb-51a2-3bc4-d567-890123456789';
  const testVideoTitle = 'My Test Video';
  const testDistributeAt = new Date('2026-02-01T12:00:00Z');
  const testTimeUntil = '3 days';

  describe('DeepLinkAction constants', () => {
    it('should have OPEN_VIDEO action', () => {
      expect(DeepLinkAction.OPEN_VIDEO).toBe('OPEN_VIDEO');
    });

    it('should have OPEN_VIDEO_LIST action', () => {
      expect(DeepLinkAction.OPEN_VIDEO_LIST).toBe('OPEN_VIDEO_LIST');
    });

    it('should have OPEN_SETTINGS action', () => {
      expect(DeepLinkAction.OPEN_SETTINGS).toBe('OPEN_SETTINGS');
    });

    it('should have OPEN_CHECK_IN action', () => {
      expect(DeepLinkAction.OPEN_CHECK_IN).toBe('OPEN_CHECK_IN');
    });
  });

  describe('NotificationType constants', () => {
    it('should have CHECK_IN_REMINDER type', () => {
      expect(NotificationType.CHECK_IN_REMINDER).toBe('CHECK_IN_REMINDER');
    });

    it('should have DISTRIBUTION_WARNING type', () => {
      expect(NotificationType.DISTRIBUTION_WARNING).toBe('DISTRIBUTION_WARNING');
    });

    it('should have VIDEO_DISTRIBUTED type', () => {
      expect(NotificationType.VIDEO_DISTRIBUTED).toBe('VIDEO_DISTRIBUTED');
    });

    it('should have VIDEO_EXPIRED type', () => {
      expect(NotificationType.VIDEO_EXPIRED).toBe('VIDEO_EXPIRED');
    });
  });

  describe('buildCheckInReminderPayload', () => {
    it('should build a valid check-in reminder payload', () => {
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );

      expect(payload.type).toBe(NotificationType.CHECK_IN_REMINDER);
      expect(payload.videoId).toBe(testVideoId);
      expect(payload.userId).toBe(testUserId);
      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO);
      expect(payload.videoTitle).toBe(testVideoTitle);
      expect(payload.distributeAt).toBe(testDistributeAt.toISOString());
      expect(payload.timeUntilDistribution).toBe(testTimeUntil);
    });

    it('should include video ID for deep linking', () => {
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );

      expect(payload.videoId).toBe(testVideoId);
    });

    it('should use OPEN_VIDEO action for regular reminders', () => {
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );

      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO);
    });
  });

  describe('buildDistributionWarningPayload', () => {
    it('should build a valid distribution warning payload', () => {
      const payload = buildDistributionWarningPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        '5 hours'
      );

      expect(payload.type).toBe(NotificationType.DISTRIBUTION_WARNING);
      expect(payload.videoId).toBe(testVideoId);
      expect(payload.userId).toBe(testUserId);
      expect(payload.action).toBe(DeepLinkAction.OPEN_CHECK_IN);
      expect(payload.videoTitle).toBe(testVideoTitle);
    });

    it('should use OPEN_CHECK_IN action for urgent warnings', () => {
      const payload = buildDistributionWarningPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        '2 hours'
      );

      // Urgent warnings go directly to check-in screen
      expect(payload.action).toBe(DeepLinkAction.OPEN_CHECK_IN);
    });

    it('should include distribution timestamp', () => {
      const payload = buildDistributionWarningPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        '30 minutes'
      );

      expect(payload.distributeAt).toBe(testDistributeAt.toISOString());
    });
  });

  describe('buildVideoDistributedPayload', () => {
    it('should build a valid video distributed payload', () => {
      const payload = buildVideoDistributedPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      expect(payload.type).toBe(NotificationType.VIDEO_DISTRIBUTED);
      expect(payload.videoId).toBe(testVideoId);
      expect(payload.userId).toBe(testUserId);
      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO);
      expect(payload.videoTitle).toBe(testVideoTitle);
    });

    it('should use OPEN_VIDEO action', () => {
      const payload = buildVideoDistributedPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO);
    });

    it('should not include distributeAt for distributed videos', () => {
      const payload = buildVideoDistributedPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      expect(payload.distributeAt).toBeUndefined();
    });
  });

  describe('buildVideoExpiredPayload', () => {
    it('should build a valid video expired payload', () => {
      const payload = buildVideoExpiredPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      expect(payload.type).toBe(NotificationType.VIDEO_EXPIRED);
      expect(payload.videoId).toBe(testVideoId);
      expect(payload.userId).toBe(testUserId);
      expect(payload.videoTitle).toBe(testVideoTitle);
    });

    it('should use OPEN_VIDEO_LIST action since video is expired', () => {
      const payload = buildVideoExpiredPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      // Expired videos redirect to video list since specific video is gone
      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO_LIST);
    });
  });

  describe('serializeDeepLinkPayload', () => {
    it('should serialize all required fields', () => {
      const payload: DeepLinkPayload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      const serialized = serializeDeepLinkPayload(payload);

      expect(serialized.type).toBe('CHECK_IN_REMINDER');
      expect(serialized.videoId).toBe(testVideoId);
      expect(serialized.userId).toBe(testUserId);
      expect(serialized.action).toBe('OPEN_VIDEO');
    });

    it('should serialize optional fields when present', () => {
      const payload: DeepLinkPayload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
        videoTitle: testVideoTitle,
        distributeAt: testDistributeAt.toISOString(),
        timeUntilDistribution: testTimeUntil,
      };

      const serialized = serializeDeepLinkPayload(payload);

      expect(serialized.videoTitle).toBe(testVideoTitle);
      expect(serialized.distributeAt).toBe(testDistributeAt.toISOString());
      expect(serialized.timeUntilDistribution).toBe(testTimeUntil);
    });

    it('should not include undefined optional fields', () => {
      const payload: DeepLinkPayload = {
        type: NotificationType.VIDEO_DISTRIBUTED,
        videoId: testVideoId,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      const serialized = serializeDeepLinkPayload(payload);

      expect(Object.keys(serialized)).toEqual(['type', 'videoId', 'userId', 'action']);
      expect(serialized.videoTitle).toBeUndefined();
      expect(serialized.distributeAt).toBeUndefined();
    });

    it('should return a Record<string, string> (FCM compatible)', () => {
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );

      const serialized = serializeDeepLinkPayload(payload);

      // Verify all values are strings
      for (const value of Object.values(serialized)) {
        expect(typeof value).toBe('string');
      }
    });
  });

  describe('isValidDeepLinkPayload', () => {
    it('should return true for valid payload', () => {
      const payload: DeepLinkPayload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(true);
    });

    it('should return true for all notification types', () => {
      const types = [
        NotificationType.CHECK_IN_REMINDER,
        NotificationType.DISTRIBUTION_WARNING,
        NotificationType.VIDEO_DISTRIBUTED,
        NotificationType.VIDEO_EXPIRED,
      ];

      for (const type of types) {
        const payload = {
          type,
          videoId: testVideoId,
          userId: testUserId,
          action: DeepLinkAction.OPEN_VIDEO,
        };
        expect(isValidDeepLinkPayload(payload)).toBe(true);
      }
    });

    it('should return true for all action types', () => {
      const actions = [
        DeepLinkAction.OPEN_VIDEO,
        DeepLinkAction.OPEN_VIDEO_LIST,
        DeepLinkAction.OPEN_SETTINGS,
        DeepLinkAction.OPEN_CHECK_IN,
      ];

      for (const action of actions) {
        const payload = {
          type: NotificationType.CHECK_IN_REMINDER,
          videoId: testVideoId,
          userId: testUserId,
          action,
        };
        expect(isValidDeepLinkPayload(payload)).toBe(true);
      }
    });

    it('should return false for null', () => {
      expect(isValidDeepLinkPayload(null)).toBe(false);
    });

    it('should return false for undefined', () => {
      expect(isValidDeepLinkPayload(undefined)).toBe(false);
    });

    it('should return false for non-object', () => {
      expect(isValidDeepLinkPayload('string')).toBe(false);
      expect(isValidDeepLinkPayload(123)).toBe(false);
      expect(isValidDeepLinkPayload(true)).toBe(false);
    });

    it('should return false for invalid type', () => {
      const payload = {
        type: 'INVALID_TYPE',
        videoId: testVideoId,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for missing videoId', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for empty videoId', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: '',
        userId: testUserId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for missing userId', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for empty userId', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: '',
        action: DeepLinkAction.OPEN_VIDEO,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for invalid action', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: testUserId,
        action: 'INVALID_ACTION',
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });

    it('should return false for missing action', () => {
      const payload = {
        type: NotificationType.CHECK_IN_REMINDER,
        videoId: testVideoId,
        userId: testUserId,
      };

      expect(isValidDeepLinkPayload(payload)).toBe(false);
    });
  });

  describe('Mobile app parsing examples', () => {
    it('should produce payload parseable by Android', () => {
      // Simulate what Android would receive
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );
      const serialized = serializeDeepLinkPayload(payload);

      // Android RemoteMessage.getData() returns Map<String, String>
      const remoteMessageData = serialized;

      // Verify Android can extract values
      expect(remoteMessageData['type']).toBe('CHECK_IN_REMINDER');
      expect(remoteMessageData['videoId']).toBe(testVideoId);
      expect(remoteMessageData['action']).toBe('OPEN_VIDEO');
    });

    it('should produce payload parseable by iOS', () => {
      // Simulate what iOS would receive
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );
      const serialized = serializeDeepLinkPayload(payload);

      // iOS userInfo dictionary
      const userInfo = serialized;

      // Verify iOS can extract values
      expect(userInfo['type']).toBe('CHECK_IN_REMINDER');
      expect(userInfo['videoId']).toBe(testVideoId);
      expect(userInfo['action']).toBe('OPEN_VIDEO');
    });
  });

  describe('Deep link integration scenarios', () => {
    it('should correctly map reminder to video detail screen', () => {
      const payload = buildCheckInReminderPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        testTimeUntil
      );

      // Regular reminders should open video detail
      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO);
      expect(payload.videoId).toBeTruthy();
    });

    it('should correctly map urgent warning to check-in screen', () => {
      const payload = buildDistributionWarningPayload(
        testVideoId,
        testUserId,
        testVideoTitle,
        testDistributeAt,
        '2 hours'
      );

      // Urgent warnings should go directly to check-in
      expect(payload.action).toBe(DeepLinkAction.OPEN_CHECK_IN);
      expect(payload.videoId).toBeTruthy();
    });

    it('should correctly map expired video to list screen', () => {
      const payload = buildVideoExpiredPayload(
        testVideoId,
        testUserId,
        testVideoTitle
      );

      // Expired videos should open list since video is gone
      expect(payload.action).toBe(DeepLinkAction.OPEN_VIDEO_LIST);
    });
  });
});
