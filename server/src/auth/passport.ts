// Passport.js configuration with JWT strategy
// Sets up JWT authentication for protected routes

import passport from 'passport';
import { Strategy as JwtStrategy, ExtractJwt, StrategyOptions } from 'passport-jwt';
import { getConfig } from '../config';
import { findUserById } from '../services/user.service';
import { createChildLogger } from '../logger';
import type { User } from '@prisma/client';
import type { JwtPayload } from './jwt.service';

const logger = createChildLogger({ component: 'passport' });

/**
 * User data attached to request after authentication
 * Excludes sensitive fields like passwordHash
 */
export interface AuthenticatedUser {
  id: string;
  username: string;
  isAdmin: boolean;
  storageQuotaBytes: bigint;
  storageUsedBytes: bigint;
  defaultTimerDays: number;
  fcmToken: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Convert a Prisma User to AuthenticatedUser (excludes passwordHash)
 */
function toAuthenticatedUser(user: User): AuthenticatedUser {
  return {
    id: user.id,
    username: user.username,
    isAdmin: user.isAdmin,
    storageQuotaBytes: user.storageQuotaBytes,
    storageUsedBytes: user.storageUsedBytes,
    defaultTimerDays: user.defaultTimerDays,
    fcmToken: user.fcmToken,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

/**
 * Configure Passport.js with JWT strategy
 * Call this function once at application startup
 */
export function configurePassport(): void {
  const config = getConfig();

  const options: StrategyOptions = {
    // Extract JWT from Authorization header as Bearer token
    jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
    // Secret key used to verify JWT signature
    secretOrKey: config.jwtSecret,
    // Only allow HS256 algorithm
    algorithms: ['HS256'],
  };

  const strategy = new JwtStrategy(options, async (payload: JwtPayload, done) => {
    try {
      // The payload.sub contains the user ID
      const userId = payload.sub;

      if (!userId) {
        logger.debug('JWT payload missing sub claim');
        return done(null, false);
      }

      // Look up the user in the database to ensure they still exist
      // and to get the most up-to-date user data
      const user = await findUserById(userId);

      if (!user) {
        logger.debug({ userId }, 'User not found for JWT token');
        return done(null, false);
      }

      // Attach user to request (without sensitive data)
      const authenticatedUser = toAuthenticatedUser(user);

      logger.debug(
        { userId: user.id, username: user.username },
        'JWT authentication successful'
      );

      return done(null, authenticatedUser);
    } catch (error) {
      logger.error({ error }, 'Error during JWT authentication');
      return done(error, false);
    }
  });

  passport.use('jwt', strategy);

  logger.info('Passport JWT strategy configured');
}

/**
 * Get the configured passport instance
 */
export { passport };

/**
 * Type augmentation for Express Request to include user
 */
declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}
