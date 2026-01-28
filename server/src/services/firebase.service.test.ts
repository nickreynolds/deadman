/**
 * Firebase Service Tests
 */

// Mock firebase-admin before importing the service
jest.mock('firebase-admin', () => {
  const mockMessaging = {
    send: jest.fn(),
  };
  const mockApp = {
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return {
    initializeApp: jest.fn().mockReturnValue(mockApp),
    credential: {
      cert: jest.fn().mockReturnValue('mock-credential'),
    },
    messaging: jest.fn().mockReturnValue(mockMessaging),
  };
});

jest.mock('../config', () => ({
  getConfig: jest.fn(),
}));

jest.mock('../logger', () => ({
  createChildLogger: () => ({
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

import * as admin from 'firebase-admin';
import { getConfig } from '../config';
import {
  initializeFirebase,
  isFirebaseConfigured,
  isFirebaseReady,
  getFirebaseApp,
  getFirebaseMessaging,
  getFirebaseInitializationError,
  shutdownFirebase,
  resetFirebase,
  sendFcmMessage,
  validateFcmToken,
} from './firebase.service';

describe('Firebase Service', () => {
  const mockGetConfig = getConfig as jest.MockedFunction<typeof getConfig>;
  const mockInitializeApp = admin.initializeApp as jest.MockedFunction<typeof admin.initializeApp>;
  const mockMessaging = admin.messaging as jest.MockedFunction<typeof admin.messaging>;

  const configuredConfig = {
    firebaseProjectId: 'test-project',
    firebasePrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----\n',
    firebaseClientEmail: 'test@test.iam.gserviceaccount.com',
  };

  const unconfiguredConfig = {
    firebaseProjectId: undefined,
    firebasePrivateKey: undefined,
    firebaseClientEmail: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    resetFirebase();
  });

  describe('isFirebaseConfigured', () => {
    it('should return true when all Firebase credentials are configured', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      expect(isFirebaseConfigured()).toBe(true);
    });

    it('should return false when projectId is missing', () => {
      mockGetConfig.mockReturnValue({
        ...configuredConfig,
        firebaseProjectId: undefined,
      } as ReturnType<typeof getConfig>);
      expect(isFirebaseConfigured()).toBe(false);
    });

    it('should return false when privateKey is missing', () => {
      mockGetConfig.mockReturnValue({
        ...configuredConfig,
        firebasePrivateKey: undefined,
      } as ReturnType<typeof getConfig>);
      expect(isFirebaseConfigured()).toBe(false);
    });

    it('should return false when clientEmail is missing', () => {
      mockGetConfig.mockReturnValue({
        ...configuredConfig,
        firebaseClientEmail: undefined,
      } as ReturnType<typeof getConfig>);
      expect(isFirebaseConfigured()).toBe(false);
    });

    it('should return false when all credentials are missing', () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);
      expect(isFirebaseConfigured()).toBe(false);
    });
  });

  describe('initializeFirebase', () => {
    it('should initialize Firebase when credentials are configured', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);

      const result = initializeFirebase();

      expect(result).toBe(true);
      expect(mockInitializeApp).toHaveBeenCalledWith({
        credential: 'mock-credential',
      });
      expect(isFirebaseReady()).toBe(true);
    });

    it('should skip initialization when credentials are not configured', () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);

      const result = initializeFirebase();

      expect(result).toBe(false);
      expect(mockInitializeApp).not.toHaveBeenCalled();
      expect(isFirebaseReady()).toBe(false);
    });

    it('should be idempotent - return same result on subsequent calls', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);

      const result1 = initializeFirebase();
      const result2 = initializeFirebase();

      expect(result1).toBe(true);
      expect(result2).toBe(true);
      expect(mockInitializeApp).toHaveBeenCalledTimes(1);
    });

    it('should handle initialization errors', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      const error = new Error('Firebase init failed');
      mockInitializeApp.mockImplementationOnce(() => {
        throw error;
      });

      const result = initializeFirebase();

      expect(result).toBe(false);
      expect(isFirebaseReady()).toBe(false);
      expect(getFirebaseInitializationError()).toBe(error);
    });

    it('should handle non-Error objects thrown during initialization', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      mockInitializeApp.mockImplementationOnce(() => {
        throw 'string error';
      });

      const result = initializeFirebase();

      expect(result).toBe(false);
      expect(getFirebaseInitializationError()?.message).toBe('string error');
    });
  });

  describe('getFirebaseApp', () => {
    it('should return the Firebase app after initialization', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const app = getFirebaseApp();

      expect(app).toBeDefined();
    });

    it('should return null when Firebase is not configured', () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const app = getFirebaseApp();

      expect(app).toBeNull();
    });

    it('should auto-initialize if not yet initialized', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);

      const app = getFirebaseApp();

      expect(app).toBeDefined();
      expect(mockInitializeApp).toHaveBeenCalled();
    });
  });

  describe('getFirebaseMessaging', () => {
    it('should return messaging instance when Firebase is initialized', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const messaging = getFirebaseMessaging();

      expect(messaging).toBeDefined();
      expect(mockMessaging).toHaveBeenCalled();
    });

    it('should return null when Firebase is not initialized', () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const messaging = getFirebaseMessaging();

      expect(messaging).toBeNull();
    });
  });

  describe('shutdownFirebase', () => {
    it('should delete the Firebase app on shutdown', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      await shutdownFirebase();

      expect(isFirebaseReady()).toBe(false);
    });

    it('should handle shutdown when Firebase is not initialized', async () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);

      // Should not throw
      await shutdownFirebase();

      expect(isFirebaseReady()).toBe(false);
    });

    it('should handle errors during shutdown', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockApp = getFirebaseApp();
      (mockApp!.delete as jest.Mock).mockRejectedValueOnce(new Error('Delete failed'));

      // Should not throw
      await shutdownFirebase();

      expect(isFirebaseReady()).toBe(false);
    });
  });

  describe('resetFirebase', () => {
    it('should reset all Firebase state', () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();
      expect(isFirebaseReady()).toBe(true);

      resetFirebase();

      expect(isFirebaseReady()).toBe(false);
      expect(getFirebaseInitializationError()).toBeNull();

      // Note: getFirebaseApp() auto-initializes, so we check isFirebaseReady() instead
      // to verify the reset state
    });
  });

  describe('sendFcmMessage', () => {
    const mockMessage = {
      token: 'test-fcm-token-123456789',
      notification: {
        title: 'Test Title',
        body: 'Test Body',
      },
      data: {
        key: 'value',
      },
    };

    it('should send message successfully', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      mockSend.mockResolvedValue('message-id-123');

      const result = await sendFcmMessage(mockMessage);

      expect(result).toBe('message-id-123');
      expect(mockSend).toHaveBeenCalledWith({
        token: mockMessage.token,
        notification: mockMessage.notification,
        data: mockMessage.data,
        android: undefined,
        apns: undefined,
      });
    });

    it('should return null when Firebase is not available', async () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const result = await sendFcmMessage(mockMessage);

      expect(result).toBeNull();
    });

    it('should throw error when send fails', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      mockSend.mockRejectedValue(new Error('Send failed'));

      await expect(sendFcmMessage(mockMessage)).rejects.toThrow('Send failed');
    });

    it('should pass android and apns options', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      mockSend.mockResolvedValue('message-id-456');

      const messageWithOptions = {
        ...mockMessage,
        android: { priority: 'high' as const },
        apns: { headers: { 'apns-priority': '10' } },
      };

      await sendFcmMessage(messageWithOptions);

      expect(mockSend).toHaveBeenCalledWith({
        token: mockMessage.token,
        notification: mockMessage.notification,
        data: mockMessage.data,
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
      });
    });
  });

  describe('validateFcmToken', () => {
    it('should return true for valid token', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      mockSend.mockResolvedValue('dry-run-id');

      const result = await validateFcmToken('valid-token');

      expect(result).toBe(true);
      expect(mockSend).toHaveBeenCalledWith(
        expect.objectContaining({ token: 'valid-token' }),
        true
      );
    });

    it('should return false for invalid registration token', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      const error = new Error('Invalid token') as Error & { code: string };
      error.code = 'messaging/invalid-registration-token';
      mockSend.mockRejectedValue(error);

      const result = await validateFcmToken('invalid-token');

      expect(result).toBe(false);
    });

    it('should return false for unregistered token', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      const error = new Error('Token not registered') as Error & { code: string };
      error.code = 'messaging/registration-token-not-registered';
      mockSend.mockRejectedValue(error);

      const result = await validateFcmToken('unregistered-token');

      expect(result).toBe(false);
    });

    it('should return false for other errors', async () => {
      mockGetConfig.mockReturnValue(configuredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const mockSend = mockMessaging().send as jest.Mock;
      mockSend.mockRejectedValue(new Error('Network error'));

      const result = await validateFcmToken('some-token');

      expect(result).toBe(false);
    });

    it('should return false when Firebase is not available', async () => {
      mockGetConfig.mockReturnValue(unconfiguredConfig as ReturnType<typeof getConfig>);
      initializeFirebase();

      const result = await validateFcmToken('some-token');

      expect(result).toBe(false);
    });
  });
});
