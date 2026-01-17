// Deadman's Drop Server Entry Point

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { initializeConfig, getConfig } from './config';
import { connectDatabase, disconnectDatabase } from './db';
import { initializeStorage, StorageError } from './storage';

// Initialize configuration first - exits if required variables are missing
const config = initializeConfig();

const app = express();

// Security middleware - adds various HTTP headers for security
app.use(helmet());

// CORS middleware - enables Cross-Origin Resource Sharing
app.use(cors());

// Request logging middleware
app.use(morgan('combined'));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler for undefined routes
app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'Not found' });
});

// Global error handler
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Graceful shutdown handler
async function shutdown(signal: string): Promise<void> {
  console.log(`\n${signal} received, shutting down gracefully...`);
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
        console.error(`Storage error: ${error.message}`);
        process.exit(1);
      }
      throw error;
    }

    // Connect to database
    await connectDatabase();

    // Start listening
    const server = app.listen(config.port, () => {
      console.log(`Deadman's Drop server running on port ${config.port}`);
    });

    // Handle graceful shutdown
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();
