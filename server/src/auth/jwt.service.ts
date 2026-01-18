// JWT token service - handles token generation and verification
// Uses jsonwebtoken for JWT operations

import jwt, { SignOptions, VerifyOptions } from 'jsonwebtoken';
import { getConfig } from '../config';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'jwt-service' });

/**
 * JWT payload structure for user authentication
 */
export interface JwtPayload {
  sub: string; // User ID
  username: string;
  isAdmin: boolean;
  iat?: number; // Issued at (added by jwt.sign)
  exp?: number; // Expiration (added by jwt.sign)
}

/**
 * Token response returned after successful authentication
 */
export interface TokenResponse {
  token: string;
  expiresIn: string;
}

/**
 * Decoded token with full payload
 */
export interface DecodedToken extends JwtPayload {
  iat: number;
  exp: number;
}

/**
 * Parse JWT expiration string to seconds
 * Supports formats like '7d', '24h', '60m', '3600s', or plain seconds
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([dhms]?)$/);
  if (!match || !match[1]) {
    throw new Error(`Invalid JWT expiration format: ${expiresIn}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2] ?? 's';

  switch (unit) {
    case 'd':
      return value * 24 * 60 * 60;
    case 'h':
      return value * 60 * 60;
    case 'm':
      return value * 60;
    case 's':
    default:
      return value;
  }
}

/**
 * Generate a JWT token for a user
 * @param userId - The user's unique ID
 * @param username - The user's username
 * @param isAdmin - Whether the user has admin privileges
 * @returns Token response with the JWT and expiration
 */
export function generateToken(
  userId: string,
  username: string,
  isAdmin: boolean
): TokenResponse {
  const config = getConfig();

  const payload: JwtPayload = {
    sub: userId,
    username,
    isAdmin,
  };

  // Convert expiration to seconds for SignOptions
  const expiresInSeconds = parseExpiresIn(config.jwtExpiresIn);

  const options: SignOptions = {
    expiresIn: expiresInSeconds,
    algorithm: 'HS256',
  };

  const token = jwt.sign(payload, config.jwtSecret, options);

  logger.debug(
    { userId, username, expiresIn: config.jwtExpiresIn },
    'JWT token generated'
  );

  return {
    token,
    expiresIn: config.jwtExpiresIn,
  };
}

/**
 * Verify and decode a JWT token
 * @param token - The JWT token to verify
 * @returns The decoded token payload if valid
 * @throws Error if token is invalid or expired
 */
export function verifyToken(token: string): DecodedToken {
  const config = getConfig();

  const options: VerifyOptions = {
    algorithms: ['HS256'],
  };

  try {
    const decoded = jwt.verify(token, config.jwtSecret, options) as DecodedToken;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      logger.debug('JWT token expired');
      throw new Error('Token has expired');
    }
    if (error instanceof jwt.JsonWebTokenError) {
      logger.debug({ error: error.message }, 'JWT token invalid');
      throw new Error('Invalid token');
    }
    throw error;
  }
}

/**
 * Check if a token is expired or about to expire
 * @param token - The JWT token to check
 * @param bufferSeconds - Seconds before expiration to consider "about to expire" (default: 60)
 * @returns true if expired or about to expire
 */
export function isTokenExpiring(token: string, bufferSeconds: number = 60): boolean {
  try {
    const decoded = verifyToken(token);
    const now = Math.floor(Date.now() / 1000);
    return decoded.exp - now <= bufferSeconds;
  } catch {
    return true; // Invalid tokens are considered "expiring"
  }
}

/**
 * Get the expiration time of the configured JWT tokens in seconds
 */
export function getTokenExpirationSeconds(): number {
  const config = getConfig();
  return parseExpiresIn(config.jwtExpiresIn);
}

/**
 * Extract token from Authorization header
 * Supports "Bearer <token>" format
 * @param authHeader - The Authorization header value
 * @returns The token or null if not found
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || !parts[0] || parts[0].toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}
