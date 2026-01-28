/**
 * Alert Service
 *
 * Provides alerting capabilities for job failures and other critical events.
 * Initially supports logging-based alerts, with hooks for future integrations
 * (email, Slack, etc.).
 */

import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'alerts' });

/**
 * Alert severity levels
 */
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Alert payload
 */
export interface Alert {
  /** Alert title/subject */
  title: string;
  /** Detailed message */
  message: string;
  /** Severity level */
  severity: AlertSeverity;
  /** Source of the alert (e.g., job name) */
  source: string;
  /** Additional context data */
  context?: Record<string, unknown>;
  /** Timestamp when alert was created */
  timestamp: Date;
}

/**
 * Job failure alert context
 */
export interface JobFailureContext {
  jobName: string;
  error: Error | string;
  runCount: number;
  errorCount: number;
  consecutiveFailures: number;
  lastSuccessfulRun?: Date;
}

/**
 * Alert handler function type
 * Custom handlers can be registered to send alerts via different channels
 */
export type AlertHandler = (alert: Alert) => Promise<void>;

// Registered alert handlers
const alertHandlers: Map<string, AlertHandler> = new Map();

/**
 * Default logging alert handler
 */
async function loggingAlertHandler(alert: Alert): Promise<void> {
  const logData = {
    title: alert.title,
    source: alert.source,
    severity: alert.severity,
    ...alert.context,
  };

  switch (alert.severity) {
    case 'critical':
    case 'error':
      logger.error(logData, alert.message);
      break;
    case 'warning':
      logger.warn(logData, alert.message);
      break;
    case 'info':
    default:
      logger.info(logData, alert.message);
      break;
  }
}

// Register default logging handler
alertHandlers.set('logging', loggingAlertHandler);

/**
 * Register a custom alert handler
 * @param name Unique handler name
 * @param handler Alert handler function
 */
export function registerAlertHandler(name: string, handler: AlertHandler): void {
  if (alertHandlers.has(name)) {
    logger.warn({ handlerName: name }, 'Overwriting existing alert handler');
  }
  alertHandlers.set(name, handler);
  logger.debug({ handlerName: name }, 'Alert handler registered');
}

/**
 * Unregister an alert handler
 * @param name Handler name to remove
 * @returns true if handler was found and removed
 */
export function unregisterAlertHandler(name: string): boolean {
  const removed = alertHandlers.delete(name);
  if (removed) {
    logger.debug({ handlerName: name }, 'Alert handler unregistered');
  }
  return removed;
}

/**
 * Get registered alert handler names
 */
export function getAlertHandlerNames(): string[] {
  return Array.from(alertHandlers.keys());
}

/**
 * Clear all alert handlers except the default logging handler
 */
export function resetAlertHandlers(): void {
  alertHandlers.clear();
  alertHandlers.set('logging', loggingAlertHandler);
}

/**
 * Send an alert through all registered handlers
 * @param alert Alert to send
 */
export async function sendAlert(alert: Alert): Promise<void> {
  const handlers = Array.from(alertHandlers.values());

  const results = await Promise.allSettled(handlers.map((handler) => handler(alert)));

  // Log any handler failures (but don't fail the overall alert)
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      const handlerName = Array.from(alertHandlers.keys())[index];
      logger.error(
        { handlerName, err: result.reason },
        'Alert handler failed'
      );
    }
  });
}

/**
 * Create and send an alert
 * @param params Alert parameters
 */
export async function alert(params: {
  title: string;
  message: string;
  severity: AlertSeverity;
  source: string;
  context?: Record<string, unknown>;
}): Promise<void> {
  const alertData: Alert = {
    ...params,
    timestamp: new Date(),
  };

  await sendAlert(alertData);
}

/**
 * Send a job failure alert
 * @param context Job failure context
 */
export async function alertJobFailure(context: JobFailureContext): Promise<void> {
  const errorMessage =
    context.error instanceof Error ? context.error.message : String(context.error);

  // Determine severity based on consecutive failures
  let severity: AlertSeverity = 'warning';
  if (context.consecutiveFailures >= 5) {
    severity = 'critical';
  } else if (context.consecutiveFailures >= 3) {
    severity = 'error';
  }

  await alert({
    title: `Job Failure: ${context.jobName}`,
    message: `Job "${context.jobName}" failed: ${errorMessage}`,
    severity,
    source: context.jobName,
    context: {
      errorMessage,
      runCount: context.runCount,
      errorCount: context.errorCount,
      consecutiveFailures: context.consecutiveFailures,
      lastSuccessfulRun: context.lastSuccessfulRun?.toISOString(),
    },
  });
}

/**
 * Send a job recovered alert (when a job succeeds after failures)
 * @param jobName Name of the job that recovered
 * @param previousFailures Number of consecutive failures before recovery
 */
export async function alertJobRecovered(
  jobName: string,
  previousFailures: number
): Promise<void> {
  await alert({
    title: `Job Recovered: ${jobName}`,
    message: `Job "${jobName}" succeeded after ${previousFailures} consecutive failure(s)`,
    severity: 'info',
    source: jobName,
    context: {
      previousConsecutiveFailures: previousFailures,
    },
  });
}
