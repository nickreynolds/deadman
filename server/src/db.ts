// Database connection using Prisma

import { PrismaClient } from '@prisma/client';
import { getConfig } from './config';

// Create a singleton Prisma client
// Note: Config must be initialized before this module is imported
const prisma = new PrismaClient({
  log: getConfig().isDevelopment ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
});

/**
 * Connect to the database
 * Throws an error if connection fails
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('Database connection established successfully');
  } catch (error) {
    console.error('Failed to connect to database:', error);
    throw error;
  }
}

/**
 * Disconnect from the database
 * Should be called during graceful shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  console.log('Database connection closed');
}

export { prisma };
export default prisma;
