// Database connection using Prisma

import { PrismaClient } from '../prisma/generated';
import { getConfig } from './config';
import logger, { createChildLogger } from './logger';

// Create a child logger for database operations
const dbLogger = createChildLogger({ component: 'database' });

// Lazily-created singleton Prisma client
// This avoids calling getConfig() at module load time, which can run
// before initializeConfig() has been called in the application entrypoint.
let prisma: PrismaClient | null = null;
let loggingConfigured = false;

function getPrismaClient(): PrismaClient {
  if (!prisma) {
    const config = getConfig();

    prisma = new PrismaClient({
      log: config.isDevelopment
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
  }

  // Configure logging once, after the client is created
  if (!loggingConfigured && prisma) {
    const config = getConfig();

    // if (config.isDevelopment) {
    //   prisma.$on('query', (e) => {
    //     dbLogger.debug(
    //       { query: e.query, params: e.params, duration: e.duration },
    //       'Database query'
    //     );
    //   });

    //   prisma.$on('info', (e) => {
    //     dbLogger.info({ message: e.message }, 'Prisma info');
    //   });
    // }

    // prisma.$on('warn', (e) => {
    //   dbLogger.warn({ message: e.message }, 'Prisma warning');
    // });

    // prisma.$on('error', (e) => {
    //   dbLogger.error({ message: e.message }, 'Prisma error');
    // });

    loggingConfigured = true;
  }

  return prisma;
}

/**
 * Connect to the database
 * Throws an error if connection fails
 */
export async function connectDatabase(): Promise<void> {
  try {
    const client = getPrismaClient();
    await client.$connect();
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
  if (prisma) {
    await prisma.$disconnect();
    dbLogger.info('Database connection closed');
  }
}

export { getPrismaClient as prisma };
