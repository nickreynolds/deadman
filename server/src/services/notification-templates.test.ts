/**
 * Unit tests for notification templates
 */

import {
  renderNotificationTemplate,
  truncateVideoTitle,
  getCheckInReminderContent,
  getDistributionWarningContent,
  getVideoDistributedContent,
  getVideoExpiredContent,
  shouldUseDistributionWarning,
  getSmartReminderContent,
  NotificationTemplateType,
  NotificationTemplateContext,
} from './notification-templates';

// Mock the notification service formatTimeUntilDistribution
jest.mock('./notification.service', () => ({
  formatTimeUntilDistribution: jest.fn((distributeAt: Date, now?: Date) => {
    const currentTime = now || new Date();
    const diffMs = distributeAt.getTime() - currentTime.getTime();
    if (diffMs <= 0) return 'soon';
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 1) return diffDays === 1 ? '1 day' : `${diffDays} days`;
    if (diffHours >= 1) return diffHours === 1 ? '1 hour' : `${diffHours} hours`;
    const diffMinutes = Math.floor(diffMs / (1000 * 60));
    if (diffMinutes >= 1) return diffMinutes === 1 ? '1 minute' : `${diffMinutes} minutes`;
    return 'soon';
  }),
}));

describe('notification-templates', () => {
  const baseDate = new Date('2026-01-28T12:00:00.000Z');

  describe('truncateVideoTitle', () => {
    it('should return title unchanged if within max length', () => {
      const title = 'Short title';
      expect(truncateVideoTitle(title)).toBe(title);
    });

    it('should return title unchanged if exactly max length', () => {
      const title = 'A'.repeat(50);
      expect(truncateVideoTitle(title)).toBe(title);
    });

    it('should truncate and add ellipsis if over max length', () => {
      const title = 'A'.repeat(60);
      const result = truncateVideoTitle(title);
      expect(result).toHaveLength(50);
      expect(result.endsWith('...')).toBe(true);
      expect(result).toBe('A'.repeat(47) + '...');
    });

    it('should use custom max length', () => {
      const title = 'This is a longer title that exceeds the limit';
      const result = truncateVideoTitle(title, 20);
      expect(result).toHaveLength(20);
      expect(result).toBe('This is a longer ...');
    });

    it('should handle empty string', () => {
      expect(truncateVideoTitle('')).toBe('');
    });

    it('should handle unicode characters', () => {
      const title = '日本語のタイトルがとても長い場合はどうなりますか？これは非常に長いタイトルです';
      const result = truncateVideoTitle(title, 20);
      expect(result).toHaveLength(20);
      expect(result.endsWith('...')).toBe(true);
    });
  });

  describe('renderNotificationTemplate', () => {
    describe('CHECK_IN_REMINDER template', () => {
      it('should render with video title and time', () => {
        const distributeAt = new Date(baseDate.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days
        const result = renderNotificationTemplate('CHECK_IN_REMINDER', {
          videoTitle: 'My Test Video',
          distributeAt,
          now: baseDate,
        });

        expect(result.title).toBe('Check-In Reminder');
        expect(result.body).toContain('My Test Video');
        expect(result.body).toContain('2 days');
        expect(result.body).toContain('Tap to prevent distribution');
      });

      it('should truncate long video titles', () => {
        const longTitle = 'A'.repeat(100);
        const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        const result = renderNotificationTemplate('CHECK_IN_REMINDER', {
          videoTitle: longTitle,
          distributeAt,
          now: baseDate,
        });

        expect(result.body).toContain('A'.repeat(47) + '...');
        expect(result.body).not.toContain(longTitle);
      });
    });

    describe('DISTRIBUTION_WARNING template', () => {
      it('should render with warning emoji and urgent message', () => {
        const distributeAt = new Date(baseDate.getTime() + 5 * 60 * 60 * 1000); // 5 hours
        const result = renderNotificationTemplate('DISTRIBUTION_WARNING', {
          videoTitle: 'Urgent Video',
          distributeAt,
          now: baseDate,
        });

        expect(result.title).toBe('⚠️ Distribution Soon');
        expect(result.body).toContain('Urgent Video');
        expect(result.body).toContain('5 hours');
        expect(result.body).toContain('Check in now');
      });
    });

    describe('VIDEO_DISTRIBUTED template', () => {
      it('should render distribution notification', () => {
        const result = renderNotificationTemplate('VIDEO_DISTRIBUTED', {
          videoTitle: 'Distributed Video',
          distributeAt: baseDate,
          now: baseDate,
        });

        expect(result.title).toBe('Video Distributed');
        expect(result.body).toContain('Distributed Video');
        expect(result.body).toContain('has been distributed to your recipients');
      });
    });

    describe('VIDEO_EXPIRED template', () => {
      it('should render expiration notification', () => {
        const result = renderNotificationTemplate('VIDEO_EXPIRED', {
          videoTitle: 'Expired Video',
          distributeAt: baseDate,
          now: baseDate,
        });

        expect(result.title).toBe('Video Expired');
        expect(result.body).toContain('Expired Video');
        expect(result.body).toContain('has expired and is no longer accessible');
      });
    });
  });

  describe('getCheckInReminderContent', () => {
    it('should return check-in reminder content', () => {
      const distributeAt = new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
      const result = getCheckInReminderContent('Test Video', distributeAt, baseDate);

      expect(result.title).toBe('Check-In Reminder');
      expect(result.body).toContain('Test Video');
      expect(result.body).toContain('3 days');
    });

    it('should work without now parameter', () => {
      const distributeAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
      const result = getCheckInReminderContent('Test Video', distributeAt);

      expect(result.title).toBe('Check-In Reminder');
      expect(result.body).toContain('Test Video');
    });
  });

  describe('getDistributionWarningContent', () => {
    it('should return warning content with emoji', () => {
      const distributeAt = new Date(baseDate.getTime() + 12 * 60 * 60 * 1000); // 12 hours
      const result = getDistributionWarningContent('Warning Video', distributeAt, baseDate);

      expect(result.title).toContain('⚠️');
      expect(result.body).toContain('Warning Video');
      expect(result.body).toContain('12 hours');
    });
  });

  describe('getVideoDistributedContent', () => {
    it('should return distribution notification content', () => {
      const result = getVideoDistributedContent('Distributed Video');

      expect(result.title).toBe('Video Distributed');
      expect(result.body).toContain('Distributed Video');
    });
  });

  describe('getVideoExpiredContent', () => {
    it('should return expiration notification content', () => {
      const result = getVideoExpiredContent('Expired Video');

      expect(result.title).toBe('Video Expired');
      expect(result.body).toContain('Expired Video');
    });
  });

  describe('shouldUseDistributionWarning', () => {
    it('should return true when less than 24 hours until distribution', () => {
      const distributeAt = new Date(baseDate.getTime() + 23 * 60 * 60 * 1000); // 23 hours
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(true);
    });

    it('should return true when exactly 1 hour until distribution', () => {
      const distributeAt = new Date(baseDate.getTime() + 60 * 60 * 1000); // 1 hour
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(true);
    });

    it('should return true when 1 minute until distribution', () => {
      const distributeAt = new Date(baseDate.getTime() + 60 * 1000); // 1 minute
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(true);
    });

    it('should return false when more than 24 hours until distribution', () => {
      const distributeAt = new Date(baseDate.getTime() + 25 * 60 * 60 * 1000); // 25 hours
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(false);
    });

    it('should return false when exactly 24 hours until distribution', () => {
      const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000); // 24 hours
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(false);
    });

    it('should return false when distribution time is in the past', () => {
      const distributeAt = new Date(baseDate.getTime() - 60 * 60 * 1000); // 1 hour ago
      expect(shouldUseDistributionWarning(distributeAt, baseDate)).toBe(false);
    });

    it('should return false when distribution time is now', () => {
      expect(shouldUseDistributionWarning(baseDate, baseDate)).toBe(false);
    });

    it('should work without now parameter', () => {
      const distributeAt = new Date(Date.now() + 12 * 60 * 60 * 1000); // 12 hours from now
      expect(shouldUseDistributionWarning(distributeAt)).toBe(true);
    });
  });

  describe('getSmartReminderContent', () => {
    it('should return warning content when less than 24 hours', () => {
      const distributeAt = new Date(baseDate.getTime() + 12 * 60 * 60 * 1000); // 12 hours
      const result = getSmartReminderContent('Urgent Video', distributeAt, baseDate);

      expect(result.title).toContain('⚠️');
      expect(result.title).toContain('Distribution Soon');
    });

    it('should return regular reminder when more than 24 hours', () => {
      const distributeAt = new Date(baseDate.getTime() + 3 * 24 * 60 * 60 * 1000); // 3 days
      const result = getSmartReminderContent('Regular Video', distributeAt, baseDate);

      expect(result.title).toBe('Check-In Reminder');
      expect(result.title).not.toContain('⚠️');
    });

    it('should include video title in both cases', () => {
      const urgentDate = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000);
      const normalDate = new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000);

      const urgentResult = getSmartReminderContent('My Video', urgentDate, baseDate);
      const normalResult = getSmartReminderContent('My Video', normalDate, baseDate);

      expect(urgentResult.body).toContain('My Video');
      expect(normalResult.body).toContain('My Video');
    });

    it('should include time until distribution in both cases', () => {
      const urgentDate = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000); // 6 hours
      const normalDate = new Date(baseDate.getTime() + 5 * 24 * 60 * 60 * 1000); // 5 days

      const urgentResult = getSmartReminderContent('Video', urgentDate, baseDate);
      const normalResult = getSmartReminderContent('Video', normalDate, baseDate);

      expect(urgentResult.body).toContain('6 hours');
      expect(normalResult.body).toContain('5 days');
    });
  });

  describe('message clarity and actionability', () => {
    it('CHECK_IN_REMINDER should tell user what to do', () => {
      const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      const result = getCheckInReminderContent('Video', distributeAt, baseDate);

      expect(result.body).toContain('Tap to prevent distribution');
    });

    it('DISTRIBUTION_WARNING should create urgency', () => {
      const distributeAt = new Date(baseDate.getTime() + 6 * 60 * 60 * 1000);
      const result = getDistributionWarningContent('Video', distributeAt, baseDate);

      expect(result.body).toContain('Check in now');
      expect(result.title).toContain('⚠️');
    });

    it('VIDEO_DISTRIBUTED should be informational', () => {
      const result = getVideoDistributedContent('Video');

      expect(result.body).toContain('has been distributed');
      expect(result.body).toContain('recipients');
    });

    it('VIDEO_EXPIRED should explain the consequence', () => {
      const result = getVideoExpiredContent('Video');

      expect(result.body).toContain('expired');
      expect(result.body).toContain('no longer accessible');
    });
  });

  describe('edge cases', () => {
    it('should handle special characters in video title', () => {
      const titles = [
        'Video with "quotes"',
        "Video with 'apostrophe'",
        'Video with <html> tags',
        'Video with & ampersand',
        'Video with emoji 🎥',
      ];

      for (const title of titles) {
        const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
        const result = getCheckInReminderContent(title, distributeAt, baseDate);
        expect(result.body).toContain(title);
      }
    });

    it('should handle empty video title', () => {
      const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      const result = getCheckInReminderContent('', distributeAt, baseDate);

      expect(result.body).toContain('""'); // Empty quotes
    });

    it('should handle video title with only spaces', () => {
      const distributeAt = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      const result = getCheckInReminderContent('   ', distributeAt, baseDate);

      // Should contain the spaces (not truncated to empty)
      expect(result.body).toContain('"   "');
    });

    it('should handle distribution time exactly at boundary', () => {
      // Exactly 24 hours - should use regular reminder, not warning
      const exactlyOneDay = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
      const result = getSmartReminderContent('Video', exactlyOneDay, baseDate);

      expect(result.title).toBe('Check-In Reminder');
      expect(result.title).not.toContain('⚠️');
    });
  });
});
