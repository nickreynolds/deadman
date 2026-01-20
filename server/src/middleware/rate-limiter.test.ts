// Rate limiter middleware tests

import { Request, Response, NextFunction } from 'express';
import {
  createRateLimiter,
  publicVideoRateLimiter,
  publicVideoDownloadRateLimiter,
  resetRateLimiterStore,
  RateLimiterOptions,
} from './rate-limiter';

// Mock logger to prevent console output during tests
jest.mock('../logger', () => ({
  createChildLogger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

describe('Rate Limiter Middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    // Reset the rate limiter store before each test
    resetRateLimiterStore();

    // Reset mocks
    jsonMock = jest.fn();
    setHeaderMock = jest.fn();
    statusMock = jest.fn().mockReturnThis();

    mockReq = {
      ip: '127.0.0.1',
      headers: {},
      params: {},
      socket: { remoteAddress: '127.0.0.1' } as any,
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    mockNext = jest.fn();
  });

  afterEach(() => {
    resetRateLimiterStore();
  });

  describe('createRateLimiter', () => {
    it('should allow requests under the limit', () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should set rate limit headers', () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(Number));
    });

    it('should decrement remaining count with each request', () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
      });

      // First request
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 4);

      setHeaderMock.mockClear();

      // Second request
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Remaining', 3);
    });

    it('should return 429 when rate limit is exceeded', () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // First two requests should pass
      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Reset mocks before the third request
      mockNext = jest.fn();
      jsonMock.mockClear();
      statusMock.mockClear();

      // Third request should be rate limited
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Too Many Requests',
        message: 'Too many requests, please try again later',
        retryAfter: expect.any(Number),
      });
    });

    it('should set Retry-After header when rate limited', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);

      setHeaderMock.mockClear();

      // Second request is rate limited
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith('Retry-After', expect.any(Number));
    });

    it('should use custom message when provided', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        message: 'Custom rate limit message',
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Custom rate limit message',
        })
      );
    });

    it('should not include headers when headers option is false', () => {
      const limiter = createRateLimiter({
        maxRequests: 5,
        windowMs: 60000,
        headers: false,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).not.toHaveBeenCalled();
    });

    it('should skip rate limiting when skip function returns true', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        skip: () => true,
      });

      // Both requests should pass even though limit is 1
      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(2);
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should apply rate limiting when skip function returns false', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        skip: () => false,
      });

      limiter(mockReq as Request, mockRes as Response, mockNext);

      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
    });
  });

  describe('Key Generation', () => {
    it('should use IP address as default key', () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Requests from same IP should share rate limit
      (mockReq as any).ip = '192.168.1.1';
      limiter(mockReq as Request, mockRes as Response, mockNext);
      limiter(mockReq as Request, mockRes as Response, mockNext);

      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(statusMock).toHaveBeenCalledWith(429);
    });

    it('should allow different IPs to have separate rate limits', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      // First IP
      (mockReq as any).ip = '192.168.1.1';
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Second IP should have its own limit
      (mockReq as any).ip = '192.168.1.2';
      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use X-Forwarded-For header when present', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      mockReq.headers = { 'x-forwarded-for': '10.0.0.1' };
      (mockReq as any).ip = '127.0.0.1'; // Should be ignored

      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Different forwarded IP should have its own limit
      mockReq.headers = { 'x-forwarded-for': '10.0.0.2' };
      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should use first IP from X-Forwarded-For when multiple are present', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      mockReq.headers = { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 10.0.0.3' };
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Same first IP should be rate limited
      mockReq.headers = { 'x-forwarded-for': '10.0.0.1, 10.0.0.5' };
      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom key generator when provided', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
        keyGenerator: (req) => req.params.token || 'default',
      });

      // Requests with same token should share rate limit
      mockReq.params = { token: 'abc123' };
      limiter(mockReq as Request, mockRes as Response, mockNext);

      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();

      // Different token should have its own limit
      mockReq.params = { token: 'xyz789' };
      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should fallback to socket.remoteAddress when ip is not available', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      (mockReq as any).ip = undefined;
      mockReq.socket = { remoteAddress: '192.168.1.100' } as any;

      limiter(mockReq as Request, mockRes as Response, mockNext);

      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Window Behavior', () => {
    it('should reset count after window expires', async () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 100, // 100ms window
      });

      // First request passes
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Second request is rate limited
      mockNext = jest.fn();
      limiter(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).not.toHaveBeenCalled();

      // Wait for window to expire
      await new Promise((resolve) => setTimeout(resolve, 150));

      // Third request should pass (new window)
      mockNext = jest.fn();
      statusMock.mockClear();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });
  });

  describe('Pre-configured Rate Limiters', () => {
    describe('publicVideoRateLimiter', () => {
      it('should allow requests under the limit', () => {
        publicVideoRateLimiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 100);
      });

      it('should use IP-based key', () => {
        (mockReq as any).ip = '192.168.1.50';
        publicVideoRateLimiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('publicVideoDownloadRateLimiter', () => {
      it('should allow requests under the limit', () => {
        mockReq.params = { token: 'test-token-123' };
        publicVideoDownloadRateLimiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(setHeaderMock).toHaveBeenCalledWith('X-RateLimit-Limit', 10);
      });

      it('should use IP+token combined key', () => {
        (mockReq as any).ip = '192.168.1.50';
        mockReq.params = { token: 'token-a' };

        // Fill up the limit for token-a
        for (let i = 0; i < 10; i++) {
          publicVideoDownloadRateLimiter(mockReq as Request, mockRes as Response, mockNext);
        }

        // Next request to token-a should be rate limited
        mockNext = jest.fn();
        statusMock.mockClear();
        publicVideoDownloadRateLimiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(statusMock).toHaveBeenCalledWith(429);

        // But token-b should still work
        mockReq.params = { token: 'token-b' };
        mockNext = jest.fn();
        statusMock.mockClear();
        publicVideoDownloadRateLimiter(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });
  });

  describe('Remaining Count', () => {
    it('should show 0 remaining when at limit', () => {
      const limiter = createRateLimiter({
        maxRequests: 2,
        windowMs: 60000,
      });

      // Use up all requests
      limiter(mockReq as Request, mockRes as Response, mockNext);
      setHeaderMock.mockClear();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Check remaining is 0 after second request
      const remainingCall = setHeaderMock.mock.calls.find(
        (call) => call[0] === 'X-RateLimit-Remaining'
      );
      expect(remainingCall?.[1]).toBe(0);
    });

    it('should never show negative remaining', () => {
      const limiter = createRateLimiter({
        maxRequests: 1,
        windowMs: 60000,
      });

      // Use up all requests and then some
      limiter(mockReq as Request, mockRes as Response, mockNext);
      setHeaderMock.mockClear();
      limiter(mockReq as Request, mockRes as Response, mockNext);

      // Check remaining is 0, not negative
      const remainingCall = setHeaderMock.mock.calls.find(
        (call) => call[0] === 'X-RateLimit-Remaining'
      );
      expect(remainingCall?.[1]).toBe(0);
    });
  });
});
