// Database connection using Prisma

import { PrismaClient } from '@prisma/client';
import { getConfig } from './config';
import logger, { createChildLogger } from './logger';

// Create a child logger for database operations
const dbLogger = createChildLogger({ component: 'database' });

// Create a singleton Prisma client
// Note: Config must be initialized before this module is imported
const prisma = new PrismaClient({
  log: getConfig().isDevelopment
    ? [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ]
    : [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
});

// Wire up Prisma logging events to pino
if (getConfig().isDevelopment) {
  prisma.$on('query', (e) => {
    dbLogger.debug({ query: e.query, params: e.params, duration: e.duration }, 'Database query');
  });

  prisma.$on('info', (e) => {
    dbLogger.info({ message: e.message }, 'Prisma info');
  });
}

prisma.$on('warn', (e) => {
  dbLogger.warn({ message: e.message }, 'Prisma warning');
});

prisma.$on('error', (e) => {
  dbLogger.error({ message: e.message }, 'Prisma error');
});

/**
 * Connect to the database
 * Throws an error if connection fails
 */
export async function connectDatabase(): Promise<void> {
  try {
    await prisma.$connect();
    dbLogger.info('Database connection established successfully');
  } catch (error) {
    dbLogger.error({ err: error }, 'Failed to connect to database');
    throw error;
  }
}

/**
 * Disconnect from the database
 * Should be called during graceful shutdown
 */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
  dbLogger.info('Database connection closed');
}

export { prisma };
export default prisma;
