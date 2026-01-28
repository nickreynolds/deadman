/**
 * Firebase Admin SDK Service
 *
 * Initializes and manages the Firebase Admin SDK for server-side push notifications.
 * Firebase credentials are optional - if not configured, notifications will be logged
 * but not sent.
 */

import * as admin from 'firebase-admin';
import { getConfig } from '../config';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'firebase-service' });

// Singleton for Firebase app instance
let firebaseApp: admin.app.App | null = null;
let initialized = false;
let initializationError: Error | null = null;

/**
 * Check if Firebase credentials are configured in environment
 */
export function isFirebaseConfigured(): boolean {
  const config = getConfig();
  return !!(
    config.firebaseProjectId &&
    config.firebasePrivateKey &&
    config.firebaseClientEmail
  );
}

/**
 * Initialize Firebase Admin SDK
 *
 * This function is idempotent - calling it multiple times is safe.
 * If Firebase credentials are not configured, initialization is skipped
 * and notifications will be logged but not sent.
 *
 * @returns true if Firebase was initialized successfully, false if skipped or failed
 */
export function initializeFirebase(): boolean {
  // Already initialized
  if (initialized) {
    return firebaseApp !== null;
  }

  // Check if Firebase is configured
  if (!isFirebaseConfigured()) {
    logger.info(
      'Firebase credentials not configured. Push notifications will be logged but not sent.'
    );
    initialized = true;
    return false;
  }

  const config = getConfig();

  try {
    // Initialize Firebase Admin SDK with service account credentials
    firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebaseProjectId,
        privateKey: config.firebasePrivateKey,
        clientEmail: config.firebaseClientEmail,
      }),
    });

    logger.info(
      { projectId: config.firebaseProjectId },
      'Firebase Admin SDK initialized successfully'
    );

    initialized = true;
    return true;
  } catch (error) {
    initializationError = error instanceof Error ? error : new Error(String(error));
    logger.error(
      { err: initializationError },
      'Failed to initialize Firebase Admin SDK'
    );
    initialized = true;
    return false;
  }
}

/**
 * Get the Firebase app instance
 *
 * @returns Firebase app instance or null if not initialized
 */
export function getFirebaseApp(): admin.app.App | null {
  if (!initialized) {
    initializeFirebase();
  }
  return firebaseApp;
}

/**
 * Get the Firebase messaging instance
 *
 * @returns Firebase messaging instance or null if Firebase is not available
 */
export function getFirebaseMessaging(): admin.messaging.Messaging | null {
  const app = getFirebaseApp();
  if (!app) {
    return null;
  }
  return admin.messaging(app);
}

/**
 * Check if Firebase is ready to send notifications
 */
export function isFirebaseReady(): boolean {
  return firebaseApp !== null;
}

/**
 * Get any initialization error that occurred
 */
export function getFirebaseInitializationError(): Error | null {
  return initializationError;
}

/**
 * Shutdown Firebase Admin SDK
 *
 * Call this during application shutdown for clean cleanup.
 */
export async function shutdownFirebase(): Promise<void> {
  if (firebaseApp) {
    try {
      await firebaseApp.delete();
      logger.info('Firebase Admin SDK shut down successfully');
    } catch (error) {
      logger.error({ err: error }, 'Error shutting down Firebase Admin SDK');
    }
    firebaseApp = null;
  }
  initialized = false;
  initializationError = null;
}

/**
 * Reset Firebase state (for testing)
 */
export function resetFirebase(): void {
  firebaseApp = null;
  initialized = false;
  initializationError = null;
}

/**
 * FCM Message payload structure
 */
export interface FcmMessage {
  /** Target FCM token */
  token: string;
  /** Notification payload (shown in system tray) */
  notification: {
    title: string;
    body: string;
  };
  /** Custom data payload (for app processing) */
  data?: Record<string, string>;
  /** Android-specific options */
  android?: admin.messaging.AndroidConfig;
  /** iOS-specific options */
  apns?: admin.messaging.ApnsConfig;
}

/**
 * Send a push notification via FCM
 *
 * @param message FCM message to send
 * @returns Message ID if successful, null if Firebase not available
 * @throws Error if send fails
 */
export async function sendFcmMessage(message: FcmMessage): Promise<string | null> {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    logger.debug(
      { token: message.token.substring(0, 10) + '...' },
      'Firebase not available, skipping FCM message'
    );
    return null;
  }

  try {
    const messageId = await messaging.send({
      token: message.token,
      notification: message.notification,
      data: message.data,
      android: message.android,
      apns: message.apns,
    });

    logger.debug(
      { messageId, token: message.token.substring(0, 10) + '...' },
      'FCM message sent successfully'
    );

    return messageId;
  } catch (error) {
    // Log the error and re-throw for caller to handle
    logger.error(
      { err: error, token: message.token.substring(0, 10) + '...' },
      'Failed to send FCM message'
    );
    throw error;
  }
}

/**
 * Validate an FCM token by attempting to send a dry-run message
 *
 * @param token FCM token to validate
 * @returns true if token is valid, false if invalid or Firebase not available
 */
export async function validateFcmToken(token: string): Promise<boolean> {
  const messaging = getFirebaseMessaging();

  if (!messaging) {
    return false;
  }

  try {
    // Use dry run to validate without actually sending
    await messaging.send(
      {
        token,
        notification: {
          title: 'Token Validation',
          body: 'This is a test message',
        },
      },
      true // dryRun = true
    );
    return true;
  } catch (error) {
    // Check if the error is due to an invalid token
    if (error instanceof Error) {
      const errorCode = (error as { code?: string }).code;
      if (
        errorCode === 'messaging/invalid-registration-token' ||
        errorCode === 'messaging/registration-token-not-registered'
      ) {
        logger.debug(
          { token: token.substring(0, 10) + '...' },
          'FCM token is invalid or unregistered'
        );
        return false;
      }
    }
    // For other errors, assume token might be valid
    logger.warn(
      { err: error, token: token.substring(0, 10) + '...' },
      'Error validating FCM token'
    );
    return false;
  }
}
