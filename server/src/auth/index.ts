// Authentication module exports
// Consolidates JWT, Passport, and middleware functionality

export {
  generateToken,
  verifyToken,
  isTokenExpiring,
  getTokenExpirationSeconds,
  extractTokenFromHeader,
  type JwtPayload,
  type TokenResponse,
  type DecodedToken,
} from './jwt.service';

export {
  configurePassport,
  passport,
  type AuthenticatedUser,
} from './passport';

export {
  requireAuth,
  isAuthenticated,
  getAuthenticatedUser,
} from './middleware';
