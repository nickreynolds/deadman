// System configuration service
// Manages key-value configuration stored in the system_config table

import { prisma } from '../db';
import { createChildLogger } from '../logger';

const logger = createChildLogger({ component: 'config-service' });

// Default configuration values
export const DEFAULT_CONFIG = {
  default_storage_quota_bytes: '1073741824', // 1GB
  notification_time_utc: '09:00', // 9 AM UTC
  video_expiration_days: '7',
  distribution_check_interval_minutes: '60',
} as const;

// Type for config keys
export type ConfigKey = keyof typeof DEFAULT_CONFIG;

/**
 * Get a single configuration value
 * Returns the stored value or the default if not found
 */
export async function getConfigValue(key: ConfigKey): Promise<string> {
  const config = await prisma.systemConfig.findUnique({
    where: { key },
  });

  if (config) {
    return config.value;
  }

  // Return default value if key exists in defaults
  return DEFAULT_CONFIG[key];
}

/**
 * Get all configuration values
 * Returns merged defaults with stored values
 */
export async function getAllConfig(): Promise<Record<string, string>> {
  const storedConfigs = await prisma.systemConfig.findMany();

  // Start with defaults
  const config: Record<string, string> = { ...DEFAULT_CONFIG };

  // Override with stored values
  for (const stored of storedConfigs) {
    config[stored.key] = stored.value;
  }

  logger.debug({ keys: Object.keys(config) }, 'Retrieved all config values');

  return config;
}

/**
 * Set a configuration value
 * Creates or updates the config entry
 */
export async function setConfigValue(key: string, value: string): Promise<void> {
  await prisma.systemConfig.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });

  logger.info({ key }, 'Config value updated');
}

/**
 * Set multiple configuration values
 * Uses a transaction for atomicity
 */
export async function setConfigValues(values: Record<string, string>): Promise<void> {
  const entries = Object.entries(values);

  if (entries.length === 0) {
    return;
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.systemConfig.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  );

  logger.info({ keys: Object.keys(values) }, 'Multiple config values updated');
}

/**
 * Delete a configuration value
 * Returns true if deleted, false if not found
 */
export async function deleteConfigValue(key: string): Promise<boolean> {
  try {
    await prisma.systemConfig.delete({
      where: { key },
    });
    logger.info({ key }, 'Config value deleted');
    return true;
  } catch (error) {
    // Prisma throws P2025 when record not found
    if ((error as { code?: string }).code === 'P2025') {
      return false;
    }
    throw error;
  }
}
