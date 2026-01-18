// Authentication module exports
// Consolidates JWT and Passport functionality

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
