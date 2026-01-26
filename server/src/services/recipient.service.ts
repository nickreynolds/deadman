// Recipient service - handles distribution recipient operations

import { prisma } from '../db';
import { createChildLogger } from '../logger';
import type { DistributionRecipient } from '@prisma/client';

const logger = createChildLogger({ component: 'recipient-service' });

/**
 * Get all recipients for a user
 * @param userId - The user ID
 * @returns Array of recipients
 */
export async function getRecipientsByUserId(userId: string): Promise<DistributionRecipient[]> {
  logger.debug({ userId }, 'Fetching recipients for user');

  const recipients = await prisma.distributionRecipient.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  logger.debug({ userId, count: recipients.length }, 'Fetched recipients');
  return recipients;
}

/**
 * Find a recipient by ID
 * @param recipientId - The recipient ID
 * @returns The recipient or null if not found
 */
export async function findRecipientById(recipientId: string): Promise<DistributionRecipient | null> {
  const recipient = await prisma.distributionRecipient.findUnique({
    where: { id: recipientId },
  });
  return recipient;
}

/**
 * Create a new recipient
 * @param userId - The user ID
 * @param email - The recipient's email address
 * @param name - Optional recipient name
 * @returns The created recipient
 */
export async function createRecipient(
  userId: string,
  email: string,
  name?: string
): Promise<DistributionRecipient> {
  logger.info({ userId, email }, 'Creating recipient');

  const recipient = await prisma.distributionRecipient.create({
    data: {
      userId,
      email,
      name: name || null,
    },
  });

  logger.info({ userId, recipientId: recipient.id }, 'Recipient created successfully');
  return recipient;
}

/**
 * Delete a recipient by ID
 * @param recipientId - The recipient ID to delete
 * @returns true if deleted, false if not found
 */
export async function deleteRecipient(recipientId: string): Promise<boolean> {
  logger.info({ recipientId }, 'Deleting recipient');

  try {
    await prisma.distributionRecipient.delete({
      where: { id: recipientId },
    });
    logger.info({ recipientId }, 'Recipient deleted successfully');
    return true;
  } catch (error) {
    // Prisma throws P2025 if record not found
    if ((error as { code?: string }).code === 'P2025') {
      logger.warn({ recipientId }, 'Recipient not found for deletion');
      return false;
    }
    throw error;
  }
}

/**
 * Check if a user already has a recipient with the given email
 * @param userId - The user ID
 * @param email - The email to check
 * @returns true if exists, false otherwise
 */
export async function recipientEmailExists(userId: string, email: string): Promise<boolean> {
  const recipient = await prisma.distributionRecipient.findFirst({
    where: {
      userId,
      email: {
        equals: email,
        mode: 'insensitive', // Case-insensitive comparison
      },
    },
  });
  return recipient !== null;
}
