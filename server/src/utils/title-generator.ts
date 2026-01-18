// Title generator utilities for videos

/**
 * Generate an auto-generated title from timestamp and optional location
 * Format: "Video YYYY-MM-DD HH:MM" or "Video YYYY-MM-DD HH:MM - Location"
 *
 * @param location - Optional location string (city, address, or coordinates)
 * @param date - Optional date for testing (defaults to current date)
 * @returns Generated title string
 */
export function generateAutoTitle(location?: string, date?: Date): string {
  const now = date ?? new Date();
  const dateStr = now.toISOString().split('T')[0];
  const time = now.toTimeString().slice(0, 5);

  const baseTitle = `Video ${dateStr} ${time}`;

  // Include location if provided and not empty
  if (location && location.trim()) {
    // Truncate location to reasonable length (50 chars max)
    const trimmedLocation = location.trim().substring(0, 50);
    return `${baseTitle} - ${trimmedLocation}`;
  }

  return baseTitle;
}
