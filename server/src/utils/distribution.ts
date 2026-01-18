// Distribution timestamp calculation utilities

/**
 * Calculate the distribution timestamp based on user's timer setting
 *
 * @param timerDays - Number of days until distribution (user's default_timer_days setting)
 * @param fromDate - Optional starting date (defaults to current time, useful for testing)
 * @returns Date object for scheduled distribution time in UTC
 *
 * @example
 * // With default 7-day timer
 * const distributeAt = calculateDistributeAt(7);
 * // Returns date 7 days from now
 *
 * @example
 * // With specific start date (for testing)
 * const start = new Date('2026-01-18T12:00:00Z');
 * const distributeAt = calculateDistributeAt(7, start);
 * // Returns 2026-01-25T12:00:00Z
 */
export function calculateDistributeAt(timerDays: number, fromDate?: Date): Date {
  const baseDate = fromDate ? new Date(fromDate) : new Date();
  baseDate.setDate(baseDate.getDate() + timerDays);
  return baseDate;
}

/**
 * Check if a video should be distributed based on its distribute_at timestamp
 *
 * @param distributeAt - The scheduled distribution timestamp
 * @param now - Optional current time (defaults to Date.now(), useful for testing)
 * @returns true if the video should be distributed (distributeAt <= now)
 */
export function shouldDistribute(distributeAt: Date, now?: Date): boolean {
  const currentTime = now ? now.getTime() : Date.now();
  return distributeAt.getTime() <= currentTime;
}

/**
 * Calculate the expiration timestamp (7 days after distribution)
 *
 * @param distributedAt - The actual distribution timestamp
 * @returns Date object for when the video expires
 */
export function calculateExpiresAt(distributedAt: Date): Date {
  const expiresAt = new Date(distributedAt);
  expiresAt.setDate(expiresAt.getDate() + 7);
  return expiresAt;
}
