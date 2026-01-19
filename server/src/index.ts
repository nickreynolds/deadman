// Deadman's Drop Server Entry Point

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import pinoHttp from 'pino-http';
import logger from './logger';
import { initializeConfig, getConfig } from './config';
import { connectDatabase, disconnectDatabase } from './db';
import { initializeStorage, StorageError } from './storage';
import { configurePassport, passport } from './auth';
import { authRoutes, videoRoutes, publicRoutes } from './routes';

// Initialize configuration first - exits if required variables are missing
const config = initializeConfig();

const app = express();

// Security middleware - adds various HTTP headers for security
app.use(helmet());

// CORS middleware - enables Cross-Origin Resource Sharing
app.use(cors());

// Request logging middleware using pino
app.use(
  pinoHttp({
    logger,
    // Don't log health check requests to reduce noise
    autoLogging: {
      ignore: (req) => req.url === '/health',
    },
    // Customize logged request/response properties
    customProps: () => ({
      service: 'deadmans-drop-http',
    }),
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Initialize Passport.js authentication
configurePassport();
app.use(passport.initialize());

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/public', publicRoutes);

// 404 handler for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  // Use request-scoped logger if available
  const reqLogger = req.log || logger;
  reqLogger.error({ err }, 'Unhandled error');
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, 'Shutdown signal received, shutting down gracefully...');
  await disconnectDatabase();
  process.exit(0);
}

// Start the server
async function start(): Promise<void> {
  try {
    // Initialize storage (creates directory if needed, verifies permissions)
    try {
      initializeStorage();
    } catch (error) {
      if (error instanceof StorageError) {
        logger.error({ error: error.message }, 'Storage initialization failed');
        process.exit(1);
      }
      throw error;
    }

    // Connect to database
    await connectDatabase();

    // Start listening
    const server = app.listen(config.port, () => {
      logger.info({ port: config.port }, 'Deadman\'s Drop server started');
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
