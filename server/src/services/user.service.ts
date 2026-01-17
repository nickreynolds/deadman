// User service - handles user operations including password hashing
// Uses bcrypt for secure password hashing

import bcrypt from 'bcrypt';
import { prisma } from '../db';
import { createChildLogger } from '../logger';
import { getConfig } from '../config';
import type { User } from '@prisma/client';

const logger = createChildLogger({ component: 'user-service' });

/**
 * Minimum bcrypt rounds (security floor)
 */
const MIN_BCRYPT_ROUNDS = 10;

/**
 * Default bcrypt rounds if not configured
 */
const DEFAULT_BCRYPT_ROUNDS = 12;

/**
 * Get configured bcrypt rounds
 * Returns value from config, validated against minimum
 */
function getBcryptRounds(): number {
  const config = getConfig();
  const rounds = config.bcryptRounds ?? DEFAULT_BCRYPT_ROUNDS;

  if (rounds < MIN_BCRYPT_ROUNDS) {
    logger.warn(
      { configured: rounds, minimum: MIN_BCRYPT_ROUNDS },
      'Configured bcrypt rounds below minimum, using minimum'
    );
    return MIN_BCRYPT_ROUNDS;
  }

  return rounds;
}

/**
 * Hash a plaintext password using bcrypt
 * @param password - The plaintext password to hash
 * @returns The bcrypt hash
 */
export async function hashPassword(password: string): Promise<string> {
  const rounds = getBcryptRounds();
  logger.debug({ rounds }, 'Hashing password');

  const hash = await bcrypt.hash(password, rounds);
  return hash;
}

/**
 * Verify a plaintext password against a bcrypt hash
 * @param password - The plaintext password to verify
 * @param hash - The bcrypt hash to compare against
 * @returns true if the password matches, false otherwise
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const isValid = await bcrypt.compare(password, hash);
  return isValid;
}

/**
 * User creation data
 */
export interface CreateUserData {
  username: string;
  password: string;
  isAdmin?: boolean;
  storageQuotaBytes?: bigint;
}

/**
 * Create a new user with hashed password
 * @param data - User creation data
 * @returns The created user (without password hash in logs)
 */
export async function createUser(data: CreateUserData): Promise<User> {
  logger.info({ username: data.username, isAdmin: data.isAdmin ?? false }, 'Creating user');

  // Hash the password before storing
  const passwordHash = await hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      username: data.username,
      passwordHash,
      isAdmin: data.isAdmin ?? false,
      storageQuotaBytes: data.storageQuotaBytes,
    },
  });

  logger.info({ userId: user.id, username: user.username }, 'User created successfully');
  return user;
}

/**
 * Find a user by username
 * @param username - The username to search for
 * @returns The user or null if not found
 */
export async function findUserByUsername(username: string): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { username },
  });
  return user;
}

/**
 * Find a user by ID
 * @param id - The user ID to search for
 * @returns The user or null if not found
 */
export async function findUserById(id: string): Promise<User | null> {
  const user = await prisma.user.findUnique({
    where: { id },
  });
  return user;
}

/**
 * Validate user credentials
 * @param username - The username
 * @param password - The plaintext password
 * @returns The user if credentials are valid, null otherwise
 */
export async function validateCredentials(username: string, password: string): Promise<User | null> {
  const user = await findUserByUsername(username);

  if (!user) {
    // Use constant-time comparison behavior by still running bcrypt
    // This prevents timing attacks that could reveal if a username exists
    await bcrypt.hash(password, MIN_BCRYPT_ROUNDS);
    logger.debug({ username }, 'Login attempt for non-existent user');
    return null;
  }

  const isValid = await verifyPassword(password, user.passwordHash);

  if (!isValid) {
    logger.debug({ username }, 'Invalid password attempt');
    return null;
  }

  logger.info({ userId: user.id, username }, 'User credentials validated');
  return user;
}

/**
 * Update user's password
 * @param userId - The user ID
 * @param newPassword - The new plaintext password
 */
export async function updatePassword(userId: string, newPassword: string): Promise<void> {
  logger.info({ userId }, 'Updating user password');

  const passwordHash = await hashPassword(newPassword);

  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  logger.info({ userId }, 'User password updated successfully');
}

/**
 * Get all users (admin function)
 * @returns Array of all users
 */
export async function getAllUsers(): Promise<User[]> {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
  });
  return users;
}

/**
 * Delete a user by ID
 * @param userId - The user ID to delete
 * @returns true if deleted, false if not found
 */
export async function deleteUser(userId: string): Promise<boolean> {
  logger.info({ userId }, 'Deleting user');

  try {
    await prisma.user.delete({
      where: { id: userId },
    });
    logger.info({ userId }, 'User deleted successfully');
    return true;
  } catch (error) {
    // Prisma throws P2025 if record not found
    if ((error as { code?: string }).code === 'P2025') {
      logger.warn({ userId }, 'User not found for deletion');
      return false;
    }
    throw error;
  }
}

/**
 * Update user properties (admin function)
 * @param userId - The user ID to update
 * @param data - Properties to update
 * @returns The updated user or null if not found
 */
export async function updateUser(
  userId: string,
  data: {
    isAdmin?: boolean;
    storageQuotaBytes?: bigint;
    defaultTimerDays?: number;
    fcmToken?: string | null;
  }
): Promise<User | null> {
  logger.info({ userId, updates: Object.keys(data) }, 'Updating user');

  try {
    const user = await prisma.user.update({
      where: { id: userId },
      data,
    });
    logger.info({ userId }, 'User updated successfully');
    return user;
  } catch (error) {
    if ((error as { code?: string }).code === 'P2025') {
      logger.warn({ userId }, 'User not found for update');
      return null;
    }
    throw error;
  }
}
