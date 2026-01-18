// Authentication routes - handles login and token refresh
// POST /api/auth/login - Authenticate user and return JWT token
// POST /api/auth/refresh - Refresh JWT token

import { Router, Request, Response } from 'express';
import { validateCredentials, findUserById } from '../services/user.service';
import { generateToken, verifyToken, DecodedToken } from '../auth/jwt.service';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'auth-routes' });

const router: Router = Router();

/**
 * Login request body
 */
interface LoginRequest {
  username: string;
  password: string;
}

/**
 * Token refresh request body
 */
interface RefreshRequest {
  token: string;
}

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 *
 * Request body:
 *   - username: string (required)
 *   - password: string (required)
 *
 * Response:
 *   - 200: { token: string, user: { id, username, is_admin } }
 *   - 400: { error: string } - Missing required fields
 *   - 401: { error: string } - Invalid credentials
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body as LoginRequest;

    // Validate required fields
    if (!username || typeof username !== 'string') {
      logger.debug('Login attempt with missing username');
      return res.status(400).json({ error: 'Username is required' });
    }

    if (!password || typeof password !== 'string') {
      logger.debug('Login attempt with missing password');
      return res.status(400).json({ error: 'Password is required' });
    }

    // Trim username (passwords should not be trimmed)
    const trimmedUsername = username.trim();

    if (trimmedUsername.length === 0) {
      logger.debug('Login attempt with empty username');
      return res.status(400).json({ error: 'Username is required' });
    }

    // Validate credentials
    const user = await validateCredentials(trimmedUsername, password);

    if (!user) {
      logger.info({ username: trimmedUsername }, 'Failed login attempt');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    // Generate JWT token
    const { token } = generateToken(user.id, user.username, user.isAdmin);

    logger.info({ userId: user.id, username: user.username }, 'User logged in successfully');

    // Return token and user info (matching API specification)
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        is_admin: user.isAdmin,
      },
    });
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh JWT token
 *
 * Request body:
 *   - token: string (required) - Current JWT token
 *
 * Response:
 *   - 200: { token: string } - New JWT token
 *   - 400: { error: string } - Missing token field
 *   - 401: { error: string } - Invalid or expired token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { token } = req.body as RefreshRequest;

    // Validate required field
    if (!token || typeof token !== 'string') {
      logger.debug('Token refresh attempt with missing token');
      return res.status(400).json({ error: 'Token is required' });
    }

    const trimmedToken = token.trim();

    if (trimmedToken.length === 0) {
      logger.debug('Token refresh attempt with empty token');
      return res.status(400).json({ error: 'Token is required' });
    }

    // Verify the existing token
    let decoded: DecodedToken;
    try {
      decoded = verifyToken(trimmedToken);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid token';
      logger.debug({ error: message }, 'Token refresh failed - invalid token');
      return res.status(401).json({ error: message });
    }

    // Verify the user still exists in the database
    const user = await findUserById(decoded.sub);

    if (!user) {
      logger.warn({ userId: decoded.sub }, 'Token refresh failed - user no longer exists');
      return res.status(401).json({ error: 'User not found' });
    }

    // Generate new token with fresh expiration
    const { token: newToken } = generateToken(user.id, user.username, user.isAdmin);

    logger.info({ userId: user.id, username: user.username }, 'Token refreshed successfully');

    // Return new token (matching API specification)
    return res.json({ token: newToken });
  } catch (error) {
    logger.error({ err: error }, 'Token refresh error');
    return res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
