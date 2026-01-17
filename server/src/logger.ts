// Structured logging using pino
// Provides consistent, structured logging with configurable levels

import pino, { Logger, LoggerOptions } from 'pino';
import fs from 'fs';
import path from 'path';

/**
 * Valid log levels
 */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal' | 'silent';

/**
 * Logger configuration options
 */
export interface LoggerConfig {
  level: LogLevel;
  prettyPrint: boolean;
  logFile?: string;
}

/**
 * Get the log level from environment variable
 * Defaults to 'debug' in development, 'info' in production
 */
function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase();
  const validLevels: LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'];

  if (envLevel && validLevels.includes(envLevel as LogLevel)) {
    return envLevel as LogLevel;
  }

  // Default based on environment
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

/**
 * Determine if pretty printing should be enabled
 * Enabled in development by default, can be overridden with LOG_PRETTY
 */
function shouldPrettyPrint(): boolean {
  const envPretty = process.env.LOG_PRETTY;
  if (envPretty !== undefined) {
    return envPretty === 'true' || envPretty === '1';
  }
  return process.env.NODE_ENV !== 'production';
}

/**
 * Get the log file path from environment variable
 * Returns undefined if LOG_FILE is not set
 */
function getLogFilePath(): string | undefined {
  const logFile = process.env.LOG_FILE;
  if (!logFile) {
    return undefined;
  }

  // Resolve relative paths from the server directory
  if (path.isAbsolute(logFile)) {
    return logFile;
  }
  return path.resolve(__dirname, '..', logFile);
}

/**
 * Ensure the log file directory exists
 */
function ensureLogDirectory(logFilePath: string): void {
  const dir = path.dirname(logFilePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Create the logger instance
 */
function createLogger(): Logger {
  const level = getLogLevel();
  const prettyPrint = shouldPrettyPrint();
  const logFilePath = getLogFilePath();

  const options: LoggerOptions = {
    level,
    // Add base fields to all log entries
    base: {
      service: 'deadmans-drop',
    },
    // Customize timestamp format
    timestamp: pino.stdTimeFunctions.isoTime,
  };

  // Configure transport based on settings
  if (prettyPrint && !logFilePath) {
    // Pretty print to console only (development mode)
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname,service',
        },
      },
    });
  } else if (logFilePath) {
    // Ensure log directory exists
    ensureLogDirectory(logFilePath);

    // Multi-destination: console + file
    const targets: pino.TransportTargetOptions[] = [
      // Console output
      {
        target: prettyPrint ? 'pino-pretty' : 'pino/file',
        options: prettyPrint
          ? {
              colorize: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,service',
            }
          : { destination: 1 }, // stdout
        level,
      },
      // File output (always JSON format)
      {
        target: 'pino/file',
        options: {
          destination: logFilePath,
        },
        level,
      },
    ];

    return pino({
      ...options,
      transport: {
        targets,
      },
    });
  } else {
    // JSON output to console (production mode)
    return pino(options);
  }
}

// Create the singleton logger instance
const logger = createLogger();

/**
 * Create a child logger with additional context
 * Use this to add request-specific or component-specific context
 *
 * @example
 * const reqLogger = createChildLogger({ requestId: req.id });
 * reqLogger.info('Processing request');
 */
export function createChildLogger(bindings: Record<string, unknown>): Logger {
  return logger.child(bindings);
}

/**
 * Get the current log level
 */
export function getLogLevelName(): LogLevel {
  return logger.level as LogLevel;
}

// Export the logger instance as default and named export
export { logger };
export default logger;
