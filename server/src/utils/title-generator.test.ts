// Tests for title generator utilities

import { generateAutoTitle } from './title-generator';

describe('generateAutoTitle', () => {
  // Use a fixed date for consistent testing
  const fixedDate = new Date('2026-01-18T14:30:00.000Z');

  describe('basic title generation', () => {
    it('should generate title with date and time format', () => {
      const title = generateAutoTitle(undefined, fixedDate);
      // Note: time will be in local timezone, so we check the date part
      expect(title).toMatch(/^Video 2026-01-18 \d{2}:\d{2}$/);
    });

    it('should include "Video" prefix', () => {
      const title = generateAutoTitle(undefined, fixedDate);
      expect(title.startsWith('Video ')).toBe(true);
    });

    it('should include date in YYYY-MM-DD format', () => {
      const title = generateAutoTitle(undefined, fixedDate);
      expect(title).toContain('2026-01-18');
    });

    it('should include time in HH:MM format', () => {
      const title = generateAutoTitle(undefined, fixedDate);
      // Time format check (local time will vary)
      expect(title).toMatch(/\d{2}:\d{2}$/);
    });
  });

  describe('location handling', () => {
    it('should include location when provided', () => {
      const title = generateAutoTitle('New York', fixedDate);
      expect(title).toContain(' - New York');
    });

    it('should not include location separator when location is undefined', () => {
      const title = generateAutoTitle(undefined, fixedDate);
      expect(title).not.toContain(' - ');
    });

    it('should not include location separator when location is empty string', () => {
      const title = generateAutoTitle('', fixedDate);
      expect(title).not.toContain(' - ');
    });

    it('should not include location separator when location is whitespace only', () => {
      const title = generateAutoTitle('   ', fixedDate);
      expect(title).not.toContain(' - ');
    });

    it('should trim whitespace from location', () => {
      const title = generateAutoTitle('  Los Angeles  ', fixedDate);
      expect(title).toContain(' - Los Angeles');
      expect(title).not.toContain(' - Los Angeles  ');
      expect(title).not.toContain(' -   Los Angeles');
    });

    it('should truncate long locations to 50 characters', () => {
      const longLocation = 'A'.repeat(100);
      const title = generateAutoTitle(longLocation, fixedDate);

      // The location part should be exactly 50 chars
      const parts = title.split(' - ');
      expect(parts.length).toBe(2);
      const locationPart = parts[1];
      expect(locationPart).toBe('A'.repeat(50));
      expect(locationPart!.length).toBe(50);
    });

    it('should not truncate locations 50 chars or less', () => {
      const location = 'A'.repeat(50);
      const title = generateAutoTitle(location, fixedDate);

      const parts = title.split(' - ');
      expect(parts.length).toBe(2);
      const locationPart = parts[1];
      expect(locationPart).toBe(location);
      expect(locationPart!.length).toBe(50);
    });

    it('should handle location with 49 chars correctly', () => {
      const location = 'A'.repeat(49);
      const title = generateAutoTitle(location, fixedDate);

      const parts = title.split(' - ');
      expect(parts.length).toBe(2);
      const locationPart = parts[1];
      expect(locationPart).toBe(location);
      expect(locationPart!.length).toBe(49);
    });
  });

  describe('different location formats', () => {
    it('should handle city name', () => {
      const title = generateAutoTitle('San Francisco', fixedDate);
      expect(title).toContain('San Francisco');
    });

    it('should handle address format', () => {
      const title = generateAutoTitle('123 Main Street, Boston, MA', fixedDate);
      expect(title).toContain('123 Main Street, Boston, MA');
    });

    it('should handle coordinate format', () => {
      const title = generateAutoTitle('37.7749, -122.4194', fixedDate);
      expect(title).toContain('37.7749, -122.4194');
    });

    it('should handle unicode location names', () => {
      const title = generateAutoTitle('東京', fixedDate);
      expect(title).toContain('東京');
    });

    it('should handle location with special characters', () => {
      const title = generateAutoTitle("O'Hare Airport", fixedDate);
      expect(title).toContain("O'Hare Airport");
    });
  });

  describe('default date behavior', () => {
    it('should use current date when no date provided', () => {
      const title = generateAutoTitle();
      const today = new Date().toISOString().split('T')[0];
      expect(title).toContain(today);
    });
  });
});
