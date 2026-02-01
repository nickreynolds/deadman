# System Configuration Reference

Complete reference for all configurable options in the Deadman's Drop system. Configuration is managed at three levels: environment variables, database-stored system settings, and per-user settings.

---

## Table of Contents

1. [Environment Variables](#1-environment-variables)
2. [System Configuration (Database)](#2-system-configuration-database)
3. [Per-User Configuration](#3-per-user-configuration)
4. [Docker Configuration](#4-docker-configuration)
5. [Storage Configuration](#5-storage-configuration)
6. [Logging Configuration](#6-logging-configuration)
7. [Firebase Push Notifications](#7-firebase-push-notifications)
8. [Configuration Loading Order](#8-configuration-loading-order)
9. [Admin API for Configuration](#9-admin-api-for-configuration)

---

## 1. Environment Variables

Environment variables are set in the `.env` file (copy from `.env.example`) or passed directly to the process/container. The application validates required variables at startup and will exit with an error if any are missing.

### Required Variables

These must be set for the application to start.

| Variable | Type | Description |
|----------|------|-------------|
| `DATABASE_URL` | String | PostgreSQL connection string. Format: `postgresql://USER:PASSWORD@HOST:PORT/DATABASE` |
| `JWT_SECRET` | String | Secret key for signing JWT tokens. Generate with `openssl rand -base64 64`. Must be kept secret. |

### Optional Server Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `PORT` | Integer | `3000` | Port the server listens on |
| `NODE_ENV` | String | `development` | Environment mode: `development` or `production`. Controls logging verbosity and error detail. |

### Optional Authentication Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `JWT_EXPIRES_IN` | String | `7d` | JWT token expiration time. Examples: `1h`, `7d`, `30d` |
| `BCRYPT_ROUNDS` | Integer | `12` | bcrypt cost factor for password hashing. Minimum: 10. Recommended: 12-14. Higher values are more secure but slower. |

### Optional Storage Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `STORAGE_PATH` | String | `./uploads` | Directory for uploaded video files. Supports absolute paths for NAS mounts (e.g. `/mnt/nas/deadmans-drop`). Created automatically if it does not exist. |
| `MAX_FILE_SIZE_MB` | Integer | `500` | Maximum upload file size in megabytes. Uploads exceeding this limit receive HTTP 413. |

### Optional Logging Variables

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `LOG_LEVEL` | String | `debug` (dev) / `info` (prod) | Minimum log level. Values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `LOG_PRETTY` | String | `true` (dev) / `false` (prod) | Set to `true` for human-readable colorized logs; `false` for JSON output |
| `LOG_FILE` | String | (none) | Path to a log file for persistent logging. File logs are always JSON formatted. Logs are written to both console and file when set. |

### Optional Firebase Variables

Required only to enable push notifications to mobile apps. If not set, the system operates normally but notifications are logged rather than sent.

| Variable | Type | Description |
|----------|------|-------------|
| `FIREBASE_PROJECT_ID` | String | Firebase project ID from the Firebase console |
| `FIREBASE_PRIVATE_KEY` | String | Service account private key. Replace literal newlines with `\n` in the value. |
| `FIREBASE_CLIENT_EMAIL` | String | Service account email address |

All three must be set for Firebase to initialize. See [Section 7](#7-firebase-push-notifications) for setup instructions.

### Admin Seed Variables

Used only when running the `pnpm seed:admin` script, not during normal operation.

| Variable | Type | Default | Description |
|----------|------|---------|-------------|
| `ADMIN_USERNAME` | String | `admin` | Username for the initial admin account |
| `ADMIN_PASSWORD` | String | (required) | Password for the admin account. Minimum 8 characters. |

---

## 2. System Configuration (Database)

System-wide settings are stored in the `system_config` database table as key-value pairs (all values are strings). These can be viewed and modified by administrators through the admin dashboard or the admin API.

### Configuration Keys

| Key | Type | Default Value | Impact |
|-----|------|---------------|--------|
| `default_storage_quota_bytes` | Numeric string | `1073741824` (1 GB) | Default storage quota assigned to newly created users. Does not retroactively change existing users. Admins can override per-user quotas separately. |
| `notification_time_utc` | `HH:MM` string | `09:00` | Time of day (UTC) when daily check-in reminder push notifications are sent for all active videos. Changes take effect on the next scheduled notification cycle. |
| `video_expiration_days` | Numeric string | `7` | Number of days after distribution before a video expires and its file is deleted from storage. Applies to newly distributed videos. |
| `distribution_check_interval_minutes` | Numeric string | `60` | How frequently (in minutes) the background job checks for videos that are past their distribution deadline. Lower values mean faster distribution but more database queries. |

### How Defaults Work

When a configuration key is not present in the database, the application falls back to its hardcoded default. The `GET /api/admin/config` endpoint always returns the merged result of stored values and defaults, so administrators see all available keys even before any changes are made.

### Value Format

All values are stored as strings. Numeric values should be passed as string representations (e.g. `"1073741824"`, not a raw number). The `notification_time_utc` key uses 24-hour `HH:MM` format.

---

## 3. Per-User Configuration

Each user has individual settings stored in the `users` database table. These are configurable by the user (via the mobile app or API) or by an administrator.

### User-Configurable Settings

| Setting | Type | Default | API Endpoint | Description |
|---------|------|---------|-------------|-------------|
| `default_timer_days` | Integer | `7` | `PATCH /api/user/settings` | Number of days until a new video is distributed. Applied to videos uploaded after the change. Range: 1-30 days. |
| `fcm_token` | String | (none) | `PATCH /api/user/settings` | Firebase Cloud Messaging device token. Updated automatically by mobile apps when the token refreshes. |

### Admin-Configurable User Settings

| Setting | Type | Default | API Endpoint | Description |
|---------|------|---------|-------------|-------------|
| `storage_quota_bytes` | BigInt | `1073741824` (1 GB) | `PATCH /api/admin/users/:id` | Maximum storage allowed for the user's video files. Uploads that would exceed this limit are rejected with an error. |
| `is_admin` | Boolean | `false` | `PATCH /api/admin/users/:id` | Admin privilege flag. Admin users can access the admin dashboard and all admin API endpoints. |

### Read-Only User Fields

| Field | Type | Description |
|-------|------|-------------|
| `storage_used_bytes` | BigInt | Current storage consumed by the user's video files. Updated automatically on upload and deletion. Visible via `GET /api/user/settings`. |

---

## 4. Docker Configuration

### Docker Compose Services

The `docker-compose.yml` file defines two services:

**Database service (`db`):**

| Setting | Default | Description |
|---------|---------|-------------|
| `POSTGRES_USER` | `postgres` | PostgreSQL superuser name |
| `POSTGRES_PASSWORD` | `postgres` | PostgreSQL superuser password. **Change this for production.** |
| `POSTGRES_DB` | `deadmans_drop` | Database name created on first startup |

**Application service (`app`):**

All environment variables from [Section 1](#1-environment-variables) apply. The Docker Compose file sets development defaults which should be overridden for production via the `.env` file.

### Persistent Volumes

| Volume | Container Path | Description |
|--------|---------------|-------------|
| `postgres_data` | `/var/lib/postgresql/data` | PostgreSQL data directory. Persists database across container restarts. |
| `uploads_data` | `/app/uploads` | Video file storage. Can be replaced with a bind mount to a NAS path. |

### Health Checks

| Service | Check Command | Interval |
|---------|--------------|----------|
| `app` | `wget http://localhost:3000/health` | Configured in Dockerfile |
| `db` | `pg_isready -U postgres -d deadmans_drop` | Configured in docker-compose.yml |

---

## 5. Storage Configuration

### Directory Structure

The storage system organizes files under the configured `STORAGE_PATH`:

```
STORAGE_PATH/
├── .temp/              # Temporary files for in-progress uploads
├── {user-uuid-1}/      # Per-user video directories
│   ├── video1.mp4
│   └── video2.mov
├── {user-uuid-2}/
│   └── video3.mp4
└── ...
```

### Storage Behavior

| Behavior | Detail |
|----------|--------|
| **Directory creation** | The `STORAGE_PATH` and user subdirectories are created automatically if they do not exist. |
| **Permission check** | Write permissions on `STORAGE_PATH` are verified at application startup. |
| **Quota enforcement** | Each upload is checked against the user's `storage_quota_bytes`. Uploads that would exceed the quota are rejected before the file is written. |
| **Cleanup** | Orphaned files (on disk but not in the database) older than 1 hour are cleaned up automatically. Temporary files older than 1 hour are also removed. |
| **Deletion** | When a video is deleted (by user, admin, or expiration job), the file is removed from disk and the user's `storage_used_bytes` is decremented. |

---

## 6. Logging Configuration

The application uses [pino](https://github.com/pinojs/pino) for structured logging.

### Log Levels (in order of verbosity)

| Level | Description |
|-------|-------------|
| `trace` | Most verbose. Detailed internal operations. |
| `debug` | Debug information useful during development. |
| `info` | Normal operational messages (startup, requests, job execution). |
| `warn` | Warning conditions that may require attention. |
| `error` | Error conditions that affect specific operations. |
| `fatal` | Critical errors that prevent the application from continuing. |
| `silent` | Disables all logging output. |

### Output Formats

| Mode | Format | When |
|------|--------|------|
| Pretty | Colorized, human-readable | `LOG_PRETTY=true` (default in development) |
| JSON | Structured JSON, one object per line | `LOG_PRETTY=false` (default in production) |
| File | Always JSON format | When `LOG_FILE` is set |

### Log Entry Fields

Every log entry includes:

| Field | Description |
|-------|-------------|
| `level` | Log level number |
| `time` | ISO 8601 timestamp |
| `msg` | Log message |
| `service` | Always `deadmans-drop` |
| `component` | Module that generated the log (e.g. `config-service`, `auth`, `upload`) |

---

## 7. Firebase Push Notifications

### Setup

1. Create a Firebase project at the [Firebase Console](https://console.firebase.google.com).
2. Go to **Project Settings > Service Accounts**.
3. Click **Generate New Private Key** to download a JSON credentials file.
4. Extract three values from the JSON file and set them as environment variables:
   - `project_id` → `FIREBASE_PROJECT_ID`
   - `private_key` → `FIREBASE_PRIVATE_KEY` (replace literal newlines with `\n`)
   - `client_email` → `FIREBASE_CLIENT_EMAIL`

### Notification Behavior

| Setting | Value | Description |
|---------|-------|-------------|
| Priority | High (Android) / 10 (iOS APNs) | Ensures timely delivery |
| TTL | 86400 seconds (24 hours) | Messages expire after 24 hours if undelivered |
| Sound | Default device sound | Plays the device's default notification sound |
| Badge (iOS) | 1 | Sets the app badge count to 1 |

### Notification Schedule

Check-in reminders are sent daily at the time configured by `notification_time_utc` (default: `09:00` UTC). Each user receives one notification per active video. Notifications include the video title and time remaining until distribution.

### Graceful Degradation

If Firebase is not configured (any of the three environment variables is missing), the application runs normally. Notification events are logged but not sent. No errors are raised for missing Firebase configuration.

---

## 8. Configuration Loading Order

The application loads configuration in this order during startup:

1. **Environment variables**: Loaded from the `.env` file via `dotenv`, then validated. Missing required variables cause the process to exit with an error message.
2. **Prisma client**: Database connection is established using `DATABASE_URL`.
3. **Storage initialization**: `STORAGE_PATH` is validated and directories are created.
4. **Firebase initialization**: If all three Firebase environment variables are present, the Firebase Admin SDK is initialized.
5. **System configuration**: Database-stored `system_config` values are loaded on demand (merged with defaults at query time, not cached at startup).
6. **Background jobs**: Scheduled using intervals from the system configuration.

### Precedence

- **Environment variables** take precedence over everything for server-level settings (port, database, JWT, storage, logging, Firebase).
- **Database system configuration** (`system_config` table) stores application-level defaults that can be changed at runtime by administrators without restarting the server.
- **Per-user settings** in the `users` table override system defaults for individual users (e.g. `default_timer_days` overrides the system default for that user's new videos).

---

## 9. Admin API for Configuration

### GET /api/admin/config

Retrieve all system configuration values. Returns stored values merged with defaults.

**Authentication:** Admin-only.

**Response:**
```json
{
  "config": {
    "default_storage_quota_bytes": "1073741824",
    "notification_time_utc": "09:00",
    "video_expiration_days": "7",
    "distribution_check_interval_minutes": "60"
  }
}
```

### PATCH /api/admin/config

Update one or more system configuration values. All values must be strings. Changes take effect immediately (no restart required).

**Authentication:** Admin-only.

**Request body:**
```json
{
  "notification_time_utc": "10:30",
  "default_storage_quota_bytes": "2147483648"
}
```

**Response:** Returns the full updated configuration (same format as GET).

### Common Configuration Changes

| Goal | Key | Example Value | Notes |
|------|-----|---------------|-------|
| Increase default quota to 5 GB | `default_storage_quota_bytes` | `5368709120` | Only affects new users |
| Change notification time to 2 PM UTC | `notification_time_utc` | `14:00` | Takes effect on next daily cycle |
| Extend video expiration to 14 days | `video_expiration_days` | `14` | Only affects newly distributed videos |
| Check for distributions every 30 minutes | `distribution_check_interval_minutes` | `30` | Lower values = faster distribution, more DB queries |

---

## Quick Reference: Default Values

### Server Defaults

| Setting | Default |
|---------|---------|
| Port | 3000 |
| Environment | development |
| JWT expiration | 7 days |
| bcrypt rounds | 12 |
| Max file size | 500 MB |
| Storage path | ./uploads |

### System Configuration Defaults

| Setting | Default |
|---------|---------|
| Default storage quota | 1 GB (1073741824 bytes) |
| Notification time | 09:00 UTC |
| Video expiration | 7 days after distribution |
| Distribution check interval | 60 minutes |

### Per-User Defaults

| Setting | Default |
|---------|---------|
| Storage quota | 1 GB (inherited from system config) |
| Distribution timer | 7 days |
| Admin privileges | false |
