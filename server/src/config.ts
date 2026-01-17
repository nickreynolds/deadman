// Environment configuration with validation
// This module loads environment variables and validates required values

import dotenv from 'dotenv';
import path from 'path';

// Load .env file from server root
dotenv.config({ path: path.resolve(__dirname, '../.env') });

/**
 * Configuration validation error
 */
class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Get a required environment variable
 * Throws ConfigurationError if the variable is not set
 */
function getRequired(key: string): string {
  const value = process.env[key];
  if (value === undefined || value === '') {
    throw new ConfigurationError(
      `Missing required environment variable: ${key}. ` +
      `Please ensure it is set in your .env file or environment.`
    );
  }
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
function getOptional(key: string, defaultValue: string): string {
  const value = process.env[key];
  return value !== undefined && value !== '' ? value : defaultValue;
}

/**
 * Get an optional integer environment variable with a default value
 */
function getOptionalInt(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Environment variable ${key} must be a valid integer, got: ${value}`
    );
  }
  return parsed;
}

/**
 * Validated application configuration
 */
export interface Config {
  // Server
  port: number;
  nodeEnv: string;
  isDevelopment: boolean;
  isProduction: boolean;

  // Database
  databaseUrl: string;

  // JWT Authentication
  jwtSecret: string;
  jwtExpiresIn: string;

  // Storage
  storagePath: string;
  maxFileSizeMb: number;

  // Firebase (optional - for push notifications)
  firebaseProjectId?: string;
  firebasePrivateKey?: string;
  firebaseClientEmail?: string;

  // Security
  bcryptRounds: number;
}

/**
 * Load and validate configuration from environment variables
 * This function should be called at application startup
 * It will throw a ConfigurationError if any required variables are missing
 */
export function loadConfig(): Config {
  const nodeEnv = getOptional('NODE_ENV', 'development');

  const config: Config = {
    // Server configuration
    port: getOptionalInt('PORT', 3000),
    nodeEnv,
    isDevelopment: nodeEnv === 'development',
    isProduction: nodeEnv === 'production',

    // Database - required
    databaseUrl: getRequired('DATABASE_URL'),

    // JWT - required for authentication
    jwtSecret: getRequired('JWT_SECRET'),
    jwtExpiresIn: getOptional('JWT_EXPIRES_IN', '7d'),

    // Storage configuration
    storagePath: getOptional('STORAGE_PATH', './uploads'),
    maxFileSizeMb: getOptionalInt('MAX_FILE_SIZE_MB', 500),

    // Firebase configuration (optional)
    firebaseProjectId: process.env.FIREBASE_PROJECT_ID || undefined,
    firebasePrivateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n') || undefined,
    firebaseClientEmail: process.env.FIREBASE_CLIENT_EMAIL || undefined,

    // Security configuration
    bcryptRounds: getOptionalInt('BCRYPT_ROUNDS', 12),
  };

  return config;
}

// Singleton config instance
let configInstance: Config | null = null;

/**
 * Get the application configuration
 * Throws if loadConfig() has not been called yet
 */
export function getConfig(): Config {
  if (!configInstance) {
    throw new ConfigurationError(
      'Configuration not loaded. Call loadConfig() at application startup.'
    );
  }
  return configInstance;
}

/**
 * Initialize the configuration
 * Call this once at application startup
 * Will exit the process with an error if configuration is invalid
 *
 * Note: This uses console.log instead of the logger because the logger
 * depends on configuration being loaded first.
 */
export function initializeConfig(): Config {
  try {
    configInstance = loadConfig();
    // Use console.log here since logger depends on config being loaded first
    console.log(`[config] Configuration loaded (environment: ${configInstance.nodeEnv})`);
    return configInstance;
  } catch (error) {
    if (error instanceof ConfigurationError) {
      console.error(`[config] Configuration error: ${error.message}`);
      process.exit(1);
    }
    throw error;
  }
}

export { ConfigurationError };
