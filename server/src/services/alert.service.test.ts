/**
 * Alert Service Tests
 */

// Mock logger
jest.mock('../logger', () => {
  const mockChildLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  };
  return {
    __esModule: true,
    default: {
      child: jest.fn(() => mockChildLogger),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    },
    createChildLogger: jest.fn(() => mockChildLogger),
  };
});

import {
  registerAlertHandler,
  unregisterAlertHandler,
  getAlertHandlerNames,
  resetAlertHandlers,
  sendAlert,
  alert,
  alertJobFailure,
  alertJobRecovered,
  Alert,
  AlertSeverity,
} from './alert.service';

describe('Alert Service', () => {
  beforeEach(() => {
    resetAlertHandlers();
  });

  afterEach(() => {
    resetAlertHandlers();
  });

  describe('registerAlertHandler', () => {
    it('should register a custom handler', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      const handlerNames = getAlertHandlerNames();
      expect(handlerNames).toContain('custom');
      expect(handlerNames).toContain('logging'); // default handler
    });

    it('should overwrite existing handler with same name', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      registerAlertHandler('test', handler1);
      registerAlertHandler('test', handler2);

      await alert({
        title: 'Test',
        message: 'Test message',
        severity: 'info',
        source: 'test',
      });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('unregisterAlertHandler', () => {
    it('should remove registered handler', () => {
      registerAlertHandler('custom', jest.fn());
      expect(getAlertHandlerNames()).toContain('custom');

      const removed = unregisterAlertHandler('custom');
      expect(removed).toBe(true);
      expect(getAlertHandlerNames()).not.toContain('custom');
    });

    it('should return false for non-existent handler', () => {
      const removed = unregisterAlertHandler('nonexistent');
      expect(removed).toBe(false);
    });
  });

  describe('getAlertHandlerNames', () => {
    it('should include default logging handler', () => {
      const handlerNames = getAlertHandlerNames();
      expect(handlerNames).toContain('logging');
    });
  });

  describe('resetAlertHandlers', () => {
    it('should remove custom handlers but keep logging', () => {
      registerAlertHandler('custom1', jest.fn());
      registerAlertHandler('custom2', jest.fn());

      resetAlertHandlers();

      const handlerNames = getAlertHandlerNames();
      expect(handlerNames).toEqual(['logging']);
    });
  });

  describe('sendAlert', () => {
    it('should call all registered handlers', async () => {
      const handler1 = jest.fn().mockResolvedValue(undefined);
      const handler2 = jest.fn().mockResolvedValue(undefined);

      registerAlertHandler('handler1', handler1);
      registerAlertHandler('handler2', handler2);

      const testAlert: Alert = {
        title: 'Test Alert',
        message: 'Test message',
        severity: 'warning',
        source: 'test',
        timestamp: new Date(),
      };

      await sendAlert(testAlert);

      expect(handler1).toHaveBeenCalledWith(testAlert);
      expect(handler2).toHaveBeenCalledWith(testAlert);
    });

    it('should handle failing handlers gracefully', async () => {
      const failingHandler = jest.fn().mockRejectedValue(new Error('Handler failed'));
      const workingHandler = jest.fn().mockResolvedValue(undefined);

      registerAlertHandler('failing', failingHandler);
      registerAlertHandler('working', workingHandler);

      const testAlert: Alert = {
        title: 'Test',
        message: 'Test',
        severity: 'info',
        source: 'test',
        timestamp: new Date(),
      };

      // Should not throw
      await expect(sendAlert(testAlert)).resolves.not.toThrow();
      expect(workingHandler).toHaveBeenCalled();
    });
  });

  describe('alert', () => {
    it('should create alert with timestamp', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alert({
        title: 'Test',
        message: 'Test message',
        severity: 'error',
        source: 'test-source',
        context: { key: 'value' },
      });

      expect(customHandler).toHaveBeenCalled();
      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.title).toBe('Test');
      expect(receivedAlert.message).toBe('Test message');
      expect(receivedAlert.severity).toBe('error');
      expect(receivedAlert.source).toBe('test-source');
      expect(receivedAlert.context).toEqual({ key: 'value' });
      expect(receivedAlert.timestamp).toBeInstanceOf(Date);
    });

    it('should work with all severity levels', async () => {
      const severities: AlertSeverity[] = ['info', 'warning', 'error', 'critical'];
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      for (const severity of severities) {
        await alert({
          title: 'Test',
          message: 'Test',
          severity,
          source: 'test',
        });
      }

      expect(customHandler).toHaveBeenCalledTimes(severities.length);
    });
  });

  describe('alertJobFailure', () => {
    it('should create job failure alert with warning severity for first failures', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobFailure({
        jobName: 'test-job',
        error: new Error('Test error'),
        runCount: 10,
        errorCount: 1,
        consecutiveFailures: 1,
        lastSuccessfulRun: new Date(),
      });

      expect(customHandler).toHaveBeenCalled();
      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.title).toContain('test-job');
      expect(receivedAlert.severity).toBe('warning');
      expect(receivedAlert.source).toBe('test-job');
    });

    it('should escalate to error severity after 3 consecutive failures', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobFailure({
        jobName: 'test-job',
        error: 'String error',
        runCount: 10,
        errorCount: 3,
        consecutiveFailures: 3,
      });

      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.severity).toBe('error');
    });

    it('should escalate to critical severity after 5 consecutive failures', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobFailure({
        jobName: 'test-job',
        error: new Error('Critical failure'),
        runCount: 50,
        errorCount: 10,
        consecutiveFailures: 5,
      });

      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.severity).toBe('critical');
    });

    it('should include context information', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      const lastSuccess = new Date('2026-01-20T10:00:00Z');

      await alertJobFailure({
        jobName: 'distribution',
        error: new Error('Database connection failed'),
        runCount: 100,
        errorCount: 5,
        consecutiveFailures: 2,
        lastSuccessfulRun: lastSuccess,
      });

      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.context).toMatchObject({
        runCount: 100,
        errorCount: 5,
        consecutiveFailures: 2,
        lastSuccessfulRun: lastSuccess.toISOString(),
      });
    });

    it('should handle string errors', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobFailure({
        jobName: 'test-job',
        error: 'Simple string error',
        runCount: 1,
        errorCount: 1,
        consecutiveFailures: 1,
      });

      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.message).toContain('Simple string error');
    });
  });

  describe('alertJobRecovered', () => {
    it('should create job recovered alert with info severity', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobRecovered('test-job', 3);

      expect(customHandler).toHaveBeenCalled();
      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.title).toContain('Recovered');
      expect(receivedAlert.title).toContain('test-job');
      expect(receivedAlert.severity).toBe('info');
      expect(receivedAlert.source).toBe('test-job');
      expect(receivedAlert.message).toContain('3 consecutive failure');
    });

    it('should include previous failure count in context', async () => {
      const customHandler = jest.fn().mockResolvedValue(undefined);
      registerAlertHandler('custom', customHandler);

      await alertJobRecovered('distribution', 5);

      const receivedAlert = customHandler.mock.calls[0][0] as Alert;
      expect(receivedAlert.context).toMatchObject({
        previousConsecutiveFailures: 5,
      });
    });
  });
});
