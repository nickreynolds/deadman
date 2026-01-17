// Deadman's Drop Server Entry Point

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

const app = express();

// Default port, can be overridden via environment variable
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

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

// Start the server
app.listen(PORT, () => {
  console.log(`Deadman's Drop server running on port ${PORT}`);
});
