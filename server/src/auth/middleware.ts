// Authentication middleware for protecting routes
// Provides requireAuth middleware that validates JWT tokens

import { Request, Response, NextFunction } from 'express';
import { passport, type AuthenticatedUser } from './passport';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'auth-middleware' });

/**
 * Express middleware that requires a valid JWT token
 *
 * Usage:
 *   app.get('/api/protected', requireAuth, (req, res) => {
 *     // req.user is guaranteed to be set here
 *     res.json({ user: req.user });
 *   });
 *
 * Returns 401 Unauthorized if:
 *   - No Authorization header present
 *   - Token is invalid or expired
 *   - User no longer exists in database
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  passport.authenticate(
    'jwt',
    { session: false },
    (err: Error | null, user: AuthenticatedUser | false, info: { message?: string } | undefined) => {
      if (err) {
        logger.error({ error: err }, 'Authentication error');
        res.status(500).json({ error: 'Authentication error' });
        return;
      }

      if (!user) {
        // Determine the specific reason for authentication failure
        const message = info?.message || 'Authentication required';

        logger.debug(
          {
            path: req.path,
            method: req.method,
            reason: message
          },
          'Authentication failed'
        );

        res.status(401).json({ error: 'Unauthorized', message });
        return;
      }

      // Attach user to request for downstream handlers
      req.user = user;

      logger.debug(
        { userId: user.id, username: user.username, path: req.path },
        'Request authenticated'
      );

      next();
    }
  )(req, res, next);
}

/**
 * Type guard to check if request has authenticated user
 * Useful for TypeScript type narrowing in route handlers
 */
export function isAuthenticated(req: Request): req is Request & { user: AuthenticatedUser } {
  return req.user !== undefined;
}

/**
 * Helper to get the authenticated user from request
 * Throws if user is not authenticated (use after requireAuth middleware)
 */
export function getAuthenticatedUser(req: Request): AuthenticatedUser {
  if (!req.user) {
    throw new Error('User not authenticated. Ensure requireAuth middleware is applied.');
  }
  return req.user;
}
