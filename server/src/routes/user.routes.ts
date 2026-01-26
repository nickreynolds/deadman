// User routes - handles user settings and recipients
// GET /api/user/settings - Get user settings
// PATCH /api/user/settings - Update user settings
// GET /api/user/recipients - Get user's distribution recipients

import { Router, Request, Response } from 'express';
import { requireAuth, getAuthenticatedUser } from '../auth';
import { findUserById, updateUser } from '../services/user.service';
import {
  getRecipientsByUserId,
  createRecipient,
  recipientEmailExists,
  findRecipientById,
  deleteRecipient,
} from '../services/recipient.service';
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

/**
 * GET /api/user/recipients
 * Get user's distribution recipients
 *
 * Response:
 *   - 200: { recipients: [{ id, email, name }, ...] }
 *   - 401: { error: string } - Not authenticated
 *   - 500: { error: string } - Server error
 */
router.get('/recipients', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = getAuthenticatedUser(req);

    const recipients = await getRecipientsByUserId(authUser.id);

    logger.debug({ userId: authUser.id, count: recipients.length }, 'Fetched user recipients');

    res.json({
      recipients: recipients.map((r) => ({
        id: r.id,
        email: r.email,
        name: r.name,
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error fetching user recipients');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/user/recipients
 * Add a new distribution recipient
 *
 * Request body:
 *   - email: string (required) - Recipient's email address
 *   - name: string (optional) - Recipient's name
 *
 * Response:
 *   - 201: { recipient: { id, email, name } }
 *   - 400: { error: string } - Invalid request body
 *   - 401: { error: string } - Not authenticated
 *   - 409: { error: string } - Email already exists for this user
 *   - 500: { error: string } - Server error
 */
router.post('/recipients', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = getAuthenticatedUser(req);
    const { email, name } = req.body;

    // Validate email - required
    if (email === undefined || email === null) {
      res.status(400).json({ error: 'email is required' });
      return;
    }

    if (typeof email !== 'string') {
      res.status(400).json({ error: 'email must be a string' });
      return;
    }

    const trimmedEmail = email.trim();
    if (trimmedEmail === '') {
      res.status(400).json({ error: 'email cannot be empty' });
      return;
    }

    // Basic email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(trimmedEmail)) {
      res.status(400).json({ error: 'Invalid email format' });
      return;
    }

    // Validate name if provided
    if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        res.status(400).json({ error: 'name must be a string' });
        return;
      }
    }

    // Check for duplicate email (case-insensitive)
    const emailExists = await recipientEmailExists(authUser.id, trimmedEmail);
    if (emailExists) {
      logger.warn({ userId: authUser.id, email: trimmedEmail }, 'Duplicate recipient email');
      res.status(409).json({ error: 'A recipient with this email already exists' });
      return;
    }

    // Create the recipient
    const trimmedName = name?.trim() || undefined;
    const recipient = await createRecipient(authUser.id, trimmedEmail, trimmedName);

    logger.info({ userId: authUser.id, recipientId: recipient.id }, 'Recipient created');

    res.status(201).json({
      recipient: {
        id: recipient.id,
        email: recipient.email,
        name: recipient.name,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating recipient');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/user/recipients/:id
 * Remove a distribution recipient
 *
 * Path parameters:
 *   - id: string - Recipient ID to delete
 *
 * Response:
 *   - 200: { success: true }
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Recipient belongs to another user
 *   - 404: { error: string } - Recipient not found
 *   - 500: { error: string } - Server error
 */
router.delete('/recipients/:id', requireAuth, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const authUser = getAuthenticatedUser(req);
    const { id: recipientId } = req.params;

    // Find the recipient to check ownership
    const recipient = await findRecipientById(recipientId);

    if (!recipient) {
      logger.warn({ recipientId }, 'Recipient not found for deletion');
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    // Verify ownership
    if (recipient.userId !== authUser.id) {
      logger.warn({ recipientId, userId: authUser.id, ownerId: recipient.userId }, 'Unauthorized recipient deletion attempt');
      res.status(403).json({ error: 'You do not have permission to delete this recipient' });
      return;
    }

    // Delete the recipient
    const deleted = await deleteRecipient(recipientId);

    if (!deleted) {
      // Race condition: recipient was deleted between find and delete
      logger.warn({ recipientId }, 'Recipient not found during deletion (race condition)');
      res.status(404).json({ error: 'Recipient not found' });
      return;
    }

    logger.info({ userId: authUser.id, recipientId }, 'Recipient deleted');

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting recipient');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
