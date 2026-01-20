// Rate limiting middleware for protecting endpoints from abuse
// Uses in-memory storage with automatic cleanup for simplicity

import { Request, Response, NextFunction } from 'express';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'rate-limiter' });

/**
 * Rate limiter configuration options
 */
export interface RateLimiterOptions {
  /** Maximum number of requests allowed within the window */
  maxRequests: number;
  /** Time window in milliseconds */
  windowMs: number;
  /** Message to return when rate limit is exceeded */
  message?: string;
  /** Key generator function - determines how to identify requesters */
  keyGenerator?: (req: Request) => string;
  /** Whether to skip rate limiting in certain conditions */
  skip?: (req: Request) => boolean;
  /** Headers to include in response */
  headers?: boolean;
}

/**
 * Rate limit entry for tracking requests
 */
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

/**
 * Default key generator - uses IP address
 */
function defaultKeyGenerator(req: Request): string {
  // Support for proxied requests (X-Forwarded-For header)
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
    return ips?.trim() || 'unknown';
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * In-memory rate limiter store
 * Stores request counts per key with automatic cleanup
 */
class RateLimiterStore {
  private store: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    // Periodically clean up expired entries to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, cleanupIntervalMs);

    // Allow the timer to not prevent the process from exiting
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  /**
   * Increment request count for a key
   * Returns the current count and reset time
   */
  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime <= now) {
      // Create new entry or reset expired entry
      const newEntry: RateLimitEntry = {
        count: 1,
        resetTime: now + windowMs,
      };
      this.store.set(key, newEntry);
      return { count: 1, resetTime: newEntry.resetTime };
    }

    // Increment existing entry
    entry.count++;
    return { count: entry.count, resetTime: entry.resetTime };
  }

  /**
   * Get current count for a key (without incrementing)
   */
  get(key: string): RateLimitEntry | undefined {
    const now = Date.now();
    const entry = this.store.get(key);
    if (entry && entry.resetTime > now) {
      return entry;
    }
    return undefined;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug({ cleaned, remaining: this.store.size }, 'Rate limiter store cleanup');
    }
  }

  /**
   * Stop the cleanup interval (for testing)
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all entries (for testing)
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Get current size (for testing)
   */
  get size(): number {
    return this.store.size;
  }
}

// Singleton store instance
let storeInstance: RateLimiterStore | null = null;

/**
 * Get or create the rate limiter store
 */
function getStore(): RateLimiterStore {
  if (!storeInstance) {
    storeInstance = new RateLimiterStore();
  }
  return storeInstance;
}

/**
 * Reset the store (for testing)
 */
export function resetRateLimiterStore(): void {
  if (storeInstance) {
    storeInstance.stop();
    storeInstance.clear();
    storeInstance = null;
  }
}

/**
 * Create a rate limiting middleware
 *
 * @param options - Rate limiter configuration
 * @returns Express middleware function
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    maxRequests,
    windowMs,
    message = 'Too many requests, please try again later',
    keyGenerator = defaultKeyGenerator,
    skip,
    headers = true,
  } = options;

  const store = getStore();

  return function rateLimitMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Check if we should skip rate limiting for this request
    if (skip && skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const { count, resetTime } = store.increment(key, windowMs);
    const remaining = Math.max(0, maxRequests - count);
    const retryAfterSeconds = Math.ceil((resetTime - Date.now()) / 1000);

    // Add rate limit headers if enabled
    if (headers) {
      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.ceil(resetTime / 1000));
    }

    // Check if rate limit exceeded
    if (count > maxRequests) {
      logger.warn(
        { key, count, maxRequests, retryAfterSeconds },
        'Rate limit exceeded'
      );

      if (headers) {
        res.setHeader('Retry-After', retryAfterSeconds);
      }

      res.status(429).json({
        error: 'Too Many Requests',
        message,
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    next();
  };
}

/**
 * Pre-configured rate limiter for public video access
 * Limits: 100 requests per 15 minutes per IP
 */
export const publicVideoRateLimiter = createRateLimiter({
  maxRequests: 100,
  windowMs: 15 * 60 * 1000, // 15 minutes
  message: 'Too many video requests, please try again later',
  keyGenerator: (req: Request) => {
    // Rate limit by combination of IP and video token
    // This allows different IPs to access the same video without affecting each other
    // But prevents a single IP from hammering the endpoint
    const ip = defaultKeyGenerator(req);
    return `public-video:${ip}`;
  },
});

/**
 * Stricter rate limiter for video downloads
 * Limits: 10 requests per minute per IP per token
 * This prevents rapid repeated downloads of the same video
 */
export const publicVideoDownloadRateLimiter = createRateLimiter({
  maxRequests: 10,
  windowMs: 60 * 1000, // 1 minute
  message: 'Too many download requests for this video, please try again later',
  keyGenerator: (req: Request) => {
    const ip = defaultKeyGenerator(req);
    const token = req.params.token || 'unknown';
    return `public-video-download:${ip}:${token}`;
  },
});
