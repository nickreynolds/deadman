#!/usr/bin/env ts-node
/**
 * Admin Seed Script
 *
 * Creates an initial admin user for fresh installations.
 * This script is idempotent - safe to run multiple times.
 *
 * Usage:
 *   pnpm seed:admin
 *
 * Environment Variables:
 *   ADMIN_USERNAME - Username for the admin user (default: admin)
 *   ADMIN_PASSWORD - Password for the admin user (REQUIRED)
 *
 * The script will:
 *   - Skip creation if a user with the username already exists
 *   - Create a new admin user if one doesn't exist
 *   - Exit with code 0 on success
 *   - Exit with code 1 on error
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const DEFAULT_USERNAME = 'admin';
const DEFAULT_STORAGE_QUOTA = BigInt(1024 * 1024 * 1024); // 1 GB
const BCRYPT_ROUNDS = 12;

interface SeedConfig {
  username: string;
  password: string;
}

function getConfig(): SeedConfig {
  const username = process.env.ADMIN_USERNAME || DEFAULT_USERNAME;
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    console.error('Error: ADMIN_PASSWORD environment variable is required.');
    console.error('');
    console.error('Usage:');
    console.error('  ADMIN_PASSWORD=your-secure-password pnpm seed:admin');
    console.error('');
    console.error('Or set ADMIN_PASSWORD in your .env file.');
    process.exit(1);
  }

  if (password.length < 8) {
    console.error('Error: ADMIN_PASSWORD must be at least 8 characters long.');
    process.exit(1);
  }

  return { username, password };
}

async function seedAdmin(): Promise<void> {
  const config = getConfig();
  const prisma = new PrismaClient();

  try {
    console.log(`Checking for existing user: ${config.username}`);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { username: config.username },
    });

    if (existingUser) {
      if (existingUser.isAdmin) {
        console.log(`Admin user "${config.username}" already exists. Skipping creation.`);
      } else {
        console.log(`User "${config.username}" exists but is not an admin.`);
        console.log('To make this user an admin, use the admin API or update the database directly.');
      }
      return;
    }

    // Create new admin user
    console.log(`Creating admin user: ${config.username}`);

    const passwordHash = await bcrypt.hash(config.password, BCRYPT_ROUNDS);

    const user = await prisma.user.create({
      data: {
        username: config.username,
        passwordHash,
        isAdmin: true,
        storageQuotaBytes: DEFAULT_STORAGE_QUOTA,
      },
    });

    console.log('');
    console.log('Admin user created successfully!');
    console.log(`  ID: ${user.id}`);
    console.log(`  Username: ${user.username}`);
    console.log(`  Admin: ${user.isAdmin}`);
    console.log(`  Storage Quota: ${Number(user.storageQuotaBytes) / (1024 * 1024)} MB`);
    console.log('');
    console.log('You can now log in with these credentials.');
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seed function
seedAdmin()
  .then(() => {
    console.log('Seed completed successfully.');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
