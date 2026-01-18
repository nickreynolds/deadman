// Jest test setup file
// This file runs before each test file

// Set test environment variables before any imports
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.JWT_EXPIRES_IN = '1h';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.STORAGE_PATH = './test-uploads';
process.env.BCRYPT_ROUNDS = '4'; // Use low rounds for faster tests
process.env.LOG_LEVEL = 'silent'; // Suppress logs during tests

// Increase timeout for async operations
jest.setTimeout(10000);
