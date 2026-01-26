// User routes - handles user settings and recipients
// GET /api/user/settings - Get user settings
// PATCH /api/user/settings - Update user settings

import { Router, Request, Response } from 'express';
import { requireAuth, getAuthenticatedUser } from '../auth';
import { findUserById, updateUser } from '../services/user.service';
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

/**
 * PATCH /api/user/settings
 * Update user settings
 *
 * Request body:
 *   - default_timer_days?: number - Default distribution timer in days
 *   - fcm_token?: string - Firebase Cloud Messaging token
 *
 * Response:
 *   - 200: { settings: { default_timer_days, storage_quota_bytes, storage_used_bytes, fcm_token } }
 *   - 400: { error: string } - Invalid request body
 *   - 401: { error: string } - Not authenticated
 *   - 404: { error: string } - User not found
 *   - 500: { error: string } - Server error
 */
router.patch('/settings', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = getAuthenticatedUser(req);
    const { default_timer_days, fcm_token } = req.body;

    // Validate default_timer_days if provided
    if (default_timer_days !== undefined) {
      if (typeof default_timer_days !== 'number') {
        res.status(400).json({ error: 'default_timer_days must be a number' });
        return;
      }
      if (!Number.isInteger(default_timer_days)) {
        res.status(400).json({ error: 'default_timer_days must be an integer' });
        return;
      }
      if (default_timer_days < 1) {
        res.status(400).json({ error: 'default_timer_days must be at least 1' });
        return;
      }
      if (default_timer_days > 365) {
        res.status(400).json({ error: 'default_timer_days cannot exceed 365' });
        return;
      }
    }

    // Validate fcm_token if provided
    if (fcm_token !== undefined && fcm_token !== null) {
      if (typeof fcm_token !== 'string') {
        res.status(400).json({ error: 'fcm_token must be a string' });
        return;
      }
    }

    // Build update data object with only provided fields
    const updateData: { defaultTimerDays?: number; fcmToken?: string | null } = {};
    if (default_timer_days !== undefined) {
      updateData.defaultTimerDays = default_timer_days;
    }
    if (fcm_token !== undefined) {
      updateData.fcmToken = fcm_token;
    }

    // If no fields provided, just return current settings
    if (Object.keys(updateData).length === 0) {
      const user = await findUserById(authUser.id);
      if (!user) {
        logger.warn({ userId: authUser.id }, 'User not found when fetching settings');
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        settings: {
          default_timer_days: user.defaultTimerDays,
          storage_quota_bytes: user.storageQuotaBytes.toString(),
          storage_used_bytes: user.storageUsedBytes.toString(),
          fcm_token: user.fcmToken,
        },
      });
      return;
    }

    logger.debug({ userId: authUser.id, updates: Object.keys(updateData) }, 'Updating user settings');

    const updatedUser = await updateUser(authUser.id, updateData);

    if (!updatedUser) {
      logger.warn({ userId: authUser.id }, 'User not found when updating settings');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info({ userId: authUser.id, updates: Object.keys(updateData) }, 'User settings updated');

    res.json({
      settings: {
        default_timer_days: updatedUser.defaultTimerDays,
        storage_quota_bytes: updatedUser.storageQuotaBytes.toString(),
        storage_used_bytes: updatedUser.storageUsedBytes.toString(),
        fcm_token: updatedUser.fcmToken,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating user settings');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
