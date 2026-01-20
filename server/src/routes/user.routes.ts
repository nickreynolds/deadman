// User routes - handles user settings and recipients
// GET /api/user/settings - Get user settings
// PATCH /api/user/settings - Update user settings

import { Router, Request, Response } from 'express';
import { requireAuth, getAuthenticatedUser } from '../auth';
import { findUserById } from '../services/user.service';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'user-routes' });

const router: Router = Router();

/**
 * GET /api/user/settings
 * Get current user settings
 *
 * Response:
 *   - 200: { default_timer_days, storage_quota_bytes, storage_used_bytes, fcm_token }
 *   - 401: { error: string } - Not authenticated
 *   - 404: { error: string } - User not found
 *   - 500: { error: string } - Server error
 */
router.get('/settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = getAuthenticatedUser(req);

    // Fetch full user data from database to get current storage usage
    const user = await findUserById(authUser.id);

    if (!user) {
      logger.warn({ userId: authUser.id }, 'User not found when fetching settings');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.debug({ userId: user.id }, 'Fetched user settings');

    res.json({
      default_timer_days: user.defaultTimerDays,
      storage_quota_bytes: user.storageQuotaBytes.toString(),
      storage_used_bytes: user.storageUsedBytes.toString(),
      fcm_token: user.fcmToken,
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user settings');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
