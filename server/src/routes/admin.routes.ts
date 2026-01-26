// Admin routes - handles admin-only operations
// POST /api/admin/users - Create a new user
// GET /api/admin/users - List all users
// PATCH /api/admin/users/:id - Update user properties
// DELETE /api/admin/users/:id - Delete a user
// GET /api/admin/config - Get system configuration
// PATCH /api/admin/config - Update system configuration

import { Router, Request, Response } from 'express';
import { requireAuth, requireAdmin, getAuthenticatedUser } from '../auth';
import {
  createUser,
  findUserByUsername,
  getAllUsers,
  updateUser,
  deleteUser,
  findUserById,
} from '../services/user.service';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'admin-routes' });

const router: Router = Router();

/**
 * POST /api/admin/users
 * Create a new user (admin only)
 *
 * Request body:
 *   - username: string (required) - Unique username
 *   - password: string (required) - Password for the new user
 *   - is_admin: boolean (optional, default: false) - Admin privileges flag
 *   - storage_quota_bytes: number (optional) - Storage quota in bytes
 *
 * Response:
 *   - 201: { user: { id, username, is_admin, storage_quota_bytes, storage_used_bytes, created_at } }
 *   - 400: { error: string } - Invalid request body
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Not an admin
 *   - 409: { error: string } - Username already exists
 *   - 500: { error: string } - Server error
 */
router.post('/users', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const adminUser = getAuthenticatedUser(req);
    const { username, password, is_admin, storage_quota_bytes } = req.body;

    // Validate username - required
    if (username === undefined || username === null) {
      res.status(400).json({ error: 'username is required' });
      return;
    }

    if (typeof username !== 'string') {
      res.status(400).json({ error: 'username must be a string' });
      return;
    }

    const trimmedUsername = username.trim();
    if (trimmedUsername === '') {
      res.status(400).json({ error: 'username cannot be empty' });
      return;
    }

    if (trimmedUsername.length < 3) {
      res.status(400).json({ error: 'username must be at least 3 characters' });
      return;
    }

    if (trimmedUsername.length > 50) {
      res.status(400).json({ error: 'username cannot exceed 50 characters' });
      return;
    }

    // Validate password - required
    if (password === undefined || password === null) {
      res.status(400).json({ error: 'password is required' });
      return;
    }

    if (typeof password !== 'string') {
      res.status(400).json({ error: 'password must be a string' });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({ error: 'password must be at least 8 characters' });
      return;
    }

    // Validate is_admin if provided
    if (is_admin !== undefined && typeof is_admin !== 'boolean') {
      res.status(400).json({ error: 'is_admin must be a boolean' });
      return;
    }

    // Validate storage_quota_bytes if provided
    let storageQuotaValue: bigint | undefined;
    if (storage_quota_bytes !== undefined) {
      if (typeof storage_quota_bytes !== 'number' && typeof storage_quota_bytes !== 'string') {
        res.status(400).json({ error: 'storage_quota_bytes must be a number' });
        return;
      }

      try {
        storageQuotaValue = BigInt(storage_quota_bytes);
      } catch {
        res.status(400).json({ error: 'storage_quota_bytes must be a number' });
        return;
      }

      if (storageQuotaValue <= BigInt(0)) {
        res.status(400).json({ error: 'storage_quota_bytes must be positive' });
        return;
      }
    }

    // Check if username already exists
    const existingUser = await findUserByUsername(trimmedUsername);
    if (existingUser) {
      logger.warn({ adminId: adminUser.id, username: trimmedUsername }, 'Attempted to create user with existing username');
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    // Create the user
    const user = await createUser({
      username: trimmedUsername,
      password,
      isAdmin: is_admin ?? false,
      storageQuotaBytes: storageQuotaValue,
    });

    logger.info({ adminId: adminUser.id, userId: user.id, username: user.username }, 'Admin created new user');

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.isAdmin,
        storage_quota_bytes: user.storageQuotaBytes.toString(),
        storage_used_bytes: user.storageUsedBytes.toString(),
        created_at: user.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error creating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/admin/users
 * List all users (admin only)
 *
 * Response:
 *   - 200: { users: [{ id, username, is_admin, storage_quota_bytes, storage_used_bytes, created_at }, ...] }
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Not an admin
 *   - 500: { error: string } - Server error
 */
router.get('/users', requireAuth, requireAdmin, async (req: Request, res: Response): Promise<void> => {
  try {
    const adminUser = getAuthenticatedUser(req);

    const users = await getAllUsers();

    logger.debug({ adminId: adminUser.id, count: users.length }, 'Admin listed all users');

    res.json({
      users: users.map((user) => ({
        id: user.id,
        username: user.username,
        is_admin: user.isAdmin,
        storage_quota_bytes: user.storageQuotaBytes.toString(),
        storage_used_bytes: user.storageUsedBytes.toString(),
        created_at: user.createdAt.toISOString(),
      })),
    });
  } catch (error) {
    logger.error({ err: error }, 'Error listing users');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /api/admin/users/:id
 * Update user properties (admin only)
 *
 * Path parameters:
 *   - id: string - User ID to update
 *
 * Request body:
 *   - is_admin: boolean (optional) - Admin privileges flag
 *   - storage_quota_bytes: number (optional) - Storage quota in bytes
 *
 * Response:
 *   - 200: { user: { id, username, is_admin, storage_quota_bytes, storage_used_bytes, created_at } }
 *   - 400: { error: string } - Invalid request body
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Not an admin
 *   - 404: { error: string } - User not found
 *   - 500: { error: string } - Server error
 */
router.patch('/users/:id', requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const adminUser = getAuthenticatedUser(req);
    const { id: userId } = req.params;
    const { is_admin, storage_quota_bytes } = req.body;

    // Validate is_admin if provided
    if (is_admin !== undefined && typeof is_admin !== 'boolean') {
      res.status(400).json({ error: 'is_admin must be a boolean' });
      return;
    }

    // Validate storage_quota_bytes if provided
    let quotaValue: bigint | undefined;
    if (storage_quota_bytes !== undefined) {
      if (typeof storage_quota_bytes !== 'number' && typeof storage_quota_bytes !== 'string') {
        res.status(400).json({ error: 'storage_quota_bytes must be a number' });
        return;
      }

      try {
        quotaValue = BigInt(storage_quota_bytes);
      } catch {
        res.status(400).json({ error: 'storage_quota_bytes must be a number' });
        return;
      }

      if (quotaValue <= BigInt(0)) {
        res.status(400).json({ error: 'storage_quota_bytes must be positive' });
        return;
      }
    }

    // Build update data
    const updateData: { isAdmin?: boolean; storageQuotaBytes?: bigint } = {};
    if (is_admin !== undefined) {
      updateData.isAdmin = is_admin;
    }
    if (quotaValue !== undefined) {
      updateData.storageQuotaBytes = quotaValue;
    }

    // If no fields provided, just return the current user
    if (Object.keys(updateData).length === 0) {
      const user = await findUserById(userId);
      if (!user) {
        logger.warn({ adminId: adminUser.id, userId }, 'User not found when fetching');
        res.status(404).json({ error: 'User not found' });
        return;
      }

      res.json({
        user: {
          id: user.id,
          username: user.username,
          is_admin: user.isAdmin,
          storage_quota_bytes: user.storageQuotaBytes.toString(),
          storage_used_bytes: user.storageUsedBytes.toString(),
          created_at: user.createdAt.toISOString(),
        },
      });
      return;
    }

    logger.debug({ adminId: adminUser.id, userId, updates: Object.keys(updateData) }, 'Admin updating user');

    const updatedUser = await updateUser(userId, updateData);

    if (!updatedUser) {
      logger.warn({ adminId: adminUser.id, userId }, 'User not found when updating');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info({ adminId: adminUser.id, userId, updates: Object.keys(updateData) }, 'Admin updated user');

    res.json({
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        is_admin: updatedUser.isAdmin,
        storage_quota_bytes: updatedUser.storageQuotaBytes.toString(),
        storage_used_bytes: updatedUser.storageUsedBytes.toString(),
        created_at: updatedUser.createdAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Error updating user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * DELETE /api/admin/users/:id
 * Delete a user and all associated data (admin only)
 *
 * Path parameters:
 *   - id: string - User ID to delete
 *
 * Response:
 *   - 200: { success: true }
 *   - 401: { error: string } - Not authenticated
 *   - 403: { error: string } - Not an admin
 *   - 404: { error: string } - User not found
 *   - 500: { error: string } - Server error
 */
router.delete('/users/:id', requireAuth, requireAdmin, async (req: Request<{ id: string }>, res: Response): Promise<void> => {
  try {
    const adminUser = getAuthenticatedUser(req);
    const { id: userId } = req.params;

    // Delete the user (cascade will handle related records)
    const deleted = await deleteUser(userId);

    if (!deleted) {
      logger.warn({ adminId: adminUser.id, userId }, 'User not found for deletion');
      res.status(404).json({ error: 'User not found' });
      return;
    }

    logger.info({ adminId: adminUser.id, userId }, 'Admin deleted user');

    res.json({ success: true });
  } catch (error) {
    logger.error({ err: error }, 'Error deleting user');
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
