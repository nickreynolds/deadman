# Product Requirements Document
# Deadman's Drop

**Version 1.0**  
**Date: January 16, 2026**

---

## 1. Project Overview

Deadman's Drop is a self-hosted video recording and dead man's switch distribution system. Users record videos on their mobile devices, which are automatically uploaded to a private server. Unless prevented by the user, videos are automatically distributed to a predefined list of recipients after a configurable time period (default 7 days).

### 1.1 Purpose

Enable individuals to create and manage time-delayed video messages that are automatically distributed if they fail to check in within a specified period. Use cases include emergency messages, posthumous communications, or any scenario requiring automated content distribution based on user inactivity.

### 1.2 Key Features

- Mobile video recording with automatic background upload
- Configurable dead man's switch with daily check-in reminders
- Self-hosted on modest hardware with NAS storage integration
- Multi-user support with individual distribution lists
- Admin dashboard for user and system management
- Public video links (no authentication required for recipients)

---

## 2. System Architecture

### 2.1 System Components

#### 2.1.1 Backend Server
Node.js + TypeScript + Express web server running on modest hardware (mini-PC or similar). Handles authentication, video uploads, background job scheduling, and admin operations.

#### 2.1.2 Database
PostgreSQL database storing user accounts, video metadata, distribution lists, system configuration, and check-in history.

#### 2.1.3 File Storage
File system storage (typically NAS-mounted) for raw video files. Videos stored without processing or transcoding.

#### 2.1.4 Mobile Applications
Native iOS and Android applications providing video recording, background upload, check-in functionality, and video management.

#### 2.1.5 Background Job Scheduler
Scheduled tasks for distribution checks, push notification delivery, video expiration, and storage quota enforcement.

### 2.2 Deployment Model

The system is designed for on-premises deployment on consumer-grade hardware:

- Recommended: Mini-PC (Intel NUC, Mac Mini, or similar) with 8GB+ RAM
- Network-attached storage (NAS) for video blob storage
- Typical deployment: 10 or fewer users per instance
- Requires static IP or DDNS for mobile app connectivity

---

## 3. Technical Stack

### 3.1 Backend Technologies

| Component | Technology |
|-----------|-----------|
| Runtime | Node.js 20+ LTS |
| Language | TypeScript 5+ |
| Framework | Express.js |
| Database | PostgreSQL 15+ |
| ORM | Prisma (recommended) or TypeORM |
| Authentication | Passport.js with JWT strategy |
| File Upload | Multer (multipart/form-data handling) |
| Job Scheduler | node-cron or Bull (Redis-backed queue) |
| Push Notifications | Firebase Cloud Messaging (FCM) for both platforms |

### 3.2 Mobile Technologies

| Platform | Technology |
|----------|-----------|
| iOS | Swift + SwiftUI, iOS 15+ target |
| Android | Kotlin + Jetpack Compose, API 26+ (Android 8.0+) |
| Video Recording | iOS: AVFoundation, Android: CameraX |
| Background Upload | iOS: URLSession background, Android: WorkManager |
| Notifications | Firebase Cloud Messaging SDK |
| HTTP Client | iOS: URLSession, Android: Retrofit + OkHttp |
| Local Storage | iOS: UserDefaults + Keychain, Android: SharedPreferences + EncryptedSharedPreferences |

---

## 4. Data Models

### 4.1 User

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| username | String | Unique username |
| password_hash | String | bcrypt hashed password |
| is_admin | Boolean | Admin privileges flag |
| storage_quota_bytes | BigInt | Storage limit (default: 1GB) |
| storage_used_bytes | BigInt | Current storage usage |
| default_timer_days | Integer | Default distribution timer (default: 7) |
| fcm_token | String | Firebase Cloud Messaging token |
| created_at | Timestamp | Account creation timestamp |
| updated_at | Timestamp | Last update timestamp |

### 4.2 Video

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to User |
| title | String | User-provided or auto-generated title |
| file_path | String | File system path to video file |
| file_size_bytes | BigInt | Video file size |
| mime_type | String | Video MIME type (e.g., video/mp4) |
| status | Enum | PENDING, ACTIVE, DISTRIBUTED, EXPIRED |
| distribute_at | Timestamp | Scheduled distribution time |
| distributed_at | Timestamp | Actual distribution time (null if not yet) |
| expires_at | Timestamp | 7 days after distribution |
| public_token | UUID | Public access token for unauthenticated viewing |
| created_at | Timestamp | Video upload timestamp |
| updated_at | Timestamp | Last update timestamp |

### 4.3 DistributionRecipient

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| user_id | UUID | Foreign key to User |
| email | String | Recipient email address |
| name | String | Optional recipient name |
| created_at | Timestamp | Record creation timestamp |

### 4.4 CheckIn

| Field | Type | Description |
|-------|------|-------------|
| id | UUID | Primary key |
| video_id | UUID | Foreign key to Video |
| action | Enum | PREVENT_DISTRIBUTION, ALLOW_DISTRIBUTION |
| created_at | Timestamp | Check-in timestamp |

### 4.5 SystemConfig

| Field | Type | Description |
|-------|------|-------------|
| key | String | Configuration key (primary key) |
| value | String | Configuration value (JSON string) |
| updated_at | Timestamp | Last update timestamp |

Example keys: `default_storage_quota_bytes`, `notification_time_utc`, etc.

---

## 5. API Specification

RESTful API using JSON for data exchange. JWT-based authentication for protected endpoints.

### 5.1 Authentication Endpoints

#### POST /api/auth/login
Authenticate user and return JWT token.

**Request body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "token": "jwt_token",
  "user": {
    "id": "uuid",
    "username": "string",
    "is_admin": boolean
  }
}
```

#### POST /api/auth/refresh
Refresh JWT token.

**Request body:**
```json
{
  "token": "current_jwt"
}
```

**Response:**
```json
{
  "token": "new_jwt_token"
}
```

### 5.2 Video Endpoints

#### POST /api/videos/upload
Upload a video file. Requires authentication.

**Request: multipart/form-data**
- `video`: file (video file)
- `title`: string (optional, auto-generated if empty)

**Response:**
```json
{
  "video": {
    "id": "uuid",
    "title": "string",
    "file_size_bytes": number,
    "distribute_at": "timestamp",
    "public_token": "uuid",
    ...
  }
}
```

#### GET /api/videos
List user's videos. Requires authentication.

**Query parameters:**
- `status`: string (optional, filter by status)
- `limit`: number (default: 50)
- `offset`: number (default: 0)

**Response:**
```json
{
  "videos": [...],
  "total": number
}
```

#### GET /api/videos/:id
Get video metadata. Requires authentication.

**Response:**
```json
{
  "video": {...}
}
```

#### PATCH /api/videos/:id
Update video metadata. Requires authentication.

**Request body:**
```json
{
  "title": "string (optional)"
}
```

**Response:**
```json
{
  "video": {...}
}
```

#### DELETE /api/videos/:id
Delete a video. Requires authentication.

**Response:**
```json
{
  "success": true
}
```

#### POST /api/videos/:id/checkin
Perform check-in action on video. Requires authentication.

**Request body:**
```json
{
  "action": "PREVENT_DISTRIBUTION" | "ALLOW_DISTRIBUTION"
}
```

**Response:**
```json
{
  "video": {...},
  "checkin": {...}
}
```

#### GET /api/public/videos/:token
Download video using public token. No authentication required.

**Response:** Video file (binary stream) or 404 if not found/not yet distributed.

### 5.3 User Settings Endpoints

#### GET /api/user/settings
Get current user settings. Requires authentication.

**Response:**
```json
{
  "default_timer_days": number,
  "storage_quota_bytes": number,
  "storage_used_bytes": number,
  "fcm_token": "string"
}
```

#### PATCH /api/user/settings
Update user settings. Requires authentication.

**Request body:**
```json
{
  "default_timer_days": number (optional),
  "fcm_token": "string (optional)"
}
```

**Response:**
```json
{
  "settings": {...}
}
```

#### GET /api/user/recipients
Get user's distribution recipients. Requires authentication.

**Response:**
```json
{
  "recipients": [
    {
      "id": "uuid",
      "email": "string",
      "name": "string"
    },
    ...
  ]
}
```

#### POST /api/user/recipients
Add a distribution recipient. Requires authentication.

**Request body:**
```json
{
  "email": "string",
  "name": "string (optional)"
}
```

**Response:**
```json
{
  "recipient": {...}
}
```

#### DELETE /api/user/recipients/:id
Remove a distribution recipient. Requires authentication.

**Response:**
```json
{
  "success": true
}
```

### 5.4 Admin Endpoints

#### POST /api/admin/users
Create a new user. Requires admin authentication.

**Request body:**
```json
{
  "username": "string",
  "password": "string",
  "is_admin": boolean (optional, default: false),
  "storage_quota_bytes": number (optional)
}
```

**Response:**
```json
{
  "user": {...}
}
```

#### GET /api/admin/users
List all users. Requires admin authentication.

**Response:**
```json
{
  "users": [...]
}
```

#### PATCH /api/admin/users/:id
Update user properties. Requires admin authentication.

**Request body:**
```json
{
  "storage_quota_bytes": number (optional),
  "is_admin": boolean (optional)
}
```

**Response:**
```json
{
  "user": {...}
}
```

#### DELETE /api/admin/users/:id
Delete a user. Requires admin authentication.

**Response:**
```json
{
  "success": true
}
```

#### GET /api/admin/config
Get system configuration. Requires admin authentication.

**Response:**
```json
{
  "config": {
    "default_storage_quota_bytes": number,
    "notification_time_utc": "string",
    ...
  }
}
```

#### PATCH /api/admin/config
Update system configuration. Requires admin authentication.

**Request body:**
```json
{
  "key": "value",
  ...
}
```
(arbitrary config key-value pairs)

**Response:**
```json
{
  "config": {...}
}
```

---

## 6. Work Breakdown Structure

The following sections outline all tasks required to complete the project, organized by component and priority.

Each task includes:
- **Category**: The functional area of the task
- **Description**: What the task accomplishes
- **Steps to Verify**: How to confirm the task is complete
- **Status**: NOT STARTED or FINISHED

---

### 6.1 Backend Server Tasks

#### 6.1.1 Project Setup & Infrastructure

**Task 1: Initialize Node.js + TypeScript project**
- **Category:** Project Setup
- **Description:** Create the foundational Node.js project with TypeScript configuration including proper tsconfig.json
- **Steps to Verify:**
  - tsconfig.json exists with strict mode enabled
  - package.json contains required dependencies
  - `pnpm install` completes without errors
  - `pnpm run build` compiles TypeScript successfully
- **Status:** FINISHED

**Task 2: Set up Express.js server with middleware**
- **Category:** Project Setup
- **Description:** Configure Express.js server with essential middleware (cors, helmet, morgan)
- **Steps to Verify:**
  - Server starts without errors on configured port
  - CORS headers present in responses
  - Security headers applied by helmet
  - Request logging visible in console/logs
- **Status:** FINISHED

**Task 3: Configure PostgreSQL connection**
- **Category:** Database
- **Description:** Set up database connection using Prisma or TypeORM with connection pooling
- **Steps to Verify:**
  - Database connection establishes successfully on startup
  - Connection errors are properly logged
  - Prisma/TypeORM client is properly configured
- **Status:** FINISHED

**Task 4: Create database schema migrations**
- **Category:** Database
- **Description:** Create migrations for all data models (User, Video, DistributionRecipient, CheckIn, SystemConfig)
- **Steps to Verify:**
  - All migrations run successfully
  - Database schema matches data model specifications
  - Rollback migrations work correctly
- **Status:** FINISHED

**Task 5: Set up environment variable management**
- **Category:** Configuration
- **Description:** Configure dotenv for environment variable management with .env file support
- **Steps to Verify:**
  - .env.example file exists with all required variables documented
  - Application reads environment variables correctly
  - Missing required variables cause startup failure with clear error
- **Status:** FINISHED

**Task 6: Configure file storage path**
- **Category:** Storage
- **Description:** Set up file storage configuration for video uploads with support for mounted NAS paths
- **Steps to Verify:**
  - Storage path is configurable via environment variable
  - Application creates storage directory if it doesn't exist
  - Write permissions are verified on startup
- **Status:** FINISHED

**Task 7: Create Docker configuration**
- **Category:** DevOps
- **Description:** Create Docker and docker-compose configuration for local development
- **Steps to Verify:**
  - `docker-compose up` starts all services (app, database)
  - Application is accessible on configured port
  - Database data persists across restarts
- **Status:** NOT STARTED

**Task 8: Set up logging framework**
- **Category:** Observability
- **Description:** Configure winston or pino for structured application logging
- **Steps to Verify:**
  - Logs include timestamp, level, and message
  - Different log levels work (debug, info, warn, error)
  - Logs are written to both console and file
- **Status:** NOT STARTED

#### 6.1.2 Authentication System

**Task 9: Implement user model with password hashing**
- **Category:** Authentication
- **Description:** Create user model with bcrypt password hashing for secure credential storage
- **Steps to Verify:**
  - Passwords are hashed before storage (never stored in plaintext)
  - Password verification works correctly
  - Hash rounds are configurable (minimum 10)
- **Status:** NOT STARTED

**Task 10: Set up Passport.js with JWT strategy**
- **Category:** Authentication
- **Description:** Configure Passport.js with JWT authentication strategy
- **Steps to Verify:**
  - JWT tokens are generated with configurable expiration
  - Token validation correctly identifies users
  - Invalid/expired tokens are rejected with 401
- **Status:** NOT STARTED

**Task 11: Implement login endpoint**
- **Category:** API
- **Description:** Create POST /api/auth/login endpoint for user authentication
- **Steps to Verify:**
  - Valid credentials return JWT token and user info
  - Invalid credentials return 401 with error message
  - Response matches API specification
- **Status:** NOT STARTED

**Task 12: Implement token refresh endpoint**
- **Category:** API
- **Description:** Create POST /api/auth/refresh endpoint for JWT token renewal
- **Steps to Verify:**
  - Valid token returns new JWT token
  - Expired tokens are rejected appropriately
  - Response matches API specification
- **Status:** NOT STARTED

**Task 13: Create authentication middleware**
- **Category:** Middleware
- **Description:** Create middleware to protect routes requiring authentication
- **Steps to Verify:**
  - Protected routes return 401 without valid token
  - Valid token allows access to protected routes
  - User object is attached to request for downstream use
- **Status:** NOT STARTED

**Task 14: Create admin authorization middleware**
- **Category:** Middleware
- **Description:** Create middleware to restrict routes to admin users only
- **Steps to Verify:**
  - Non-admin users receive 403 on admin routes
  - Admin users can access admin routes
  - Middleware properly chains with authentication middleware
- **Status:** NOT STARTED

**Task 15: Write authentication unit tests**
- **Category:** Testing
- **Description:** Create comprehensive unit tests for authentication logic
- **Steps to Verify:**
  - Tests cover login success/failure scenarios
  - Tests cover token refresh scenarios
  - Tests cover middleware behavior
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.3 Video Upload & Storage

**Task 16: Configure Multer for file uploads**
- **Category:** File Handling
- **Description:** Set up Multer middleware for multipart/form-data handling with video file support
- **Steps to Verify:**
  - Multer accepts video/* MIME types
  - File size limits are enforced
  - Temporary files are stored in configured location
- **Status:** NOT STARTED

**Task 17: Implement video upload endpoint**
- **Category:** API
- **Description:** Create POST /api/videos/upload endpoint with authentication requirement
- **Steps to Verify:**
  - Authenticated users can upload videos
  - Unauthenticated requests return 401
  - Successful upload returns video metadata
  - Response matches API specification
- **Status:** NOT STARTED

**Task 18: Add file size and quota validation**
- **Category:** Validation
- **Description:** Implement file size limits and storage quota checks before accepting uploads
- **Steps to Verify:**
  - Files exceeding size limit are rejected with 413
  - Uploads exceeding user quota are rejected with appropriate error
  - Error messages clearly indicate the limit exceeded
- **Status:** NOT STARTED

**Task 19: Generate public token for videos**
- **Category:** Security
- **Description:** Generate unique UUID public token for each uploaded video for unauthenticated access
- **Steps to Verify:**
  - Each video has a unique public_token UUID
  - Token is included in upload response
  - Token format is valid UUID v4
- **Status:** NOT STARTED

**Task 20: Auto-generate video titles**
- **Category:** Business Logic
- **Description:** Create auto-generated titles using timestamp and optional location data
- **Steps to Verify:**
  - Videos without user-provided title get auto-generated title
  - Title includes date/time information
  - User-provided titles are preserved
- **Status:** NOT STARTED

**Task 21: Update storage usage tracking**
- **Category:** Business Logic
- **Description:** Update user's storage_used_bytes field on successful upload
- **Steps to Verify:**
  - storage_used_bytes increases by file size after upload
  - Storage calculation is accurate to byte level
  - Concurrent uploads correctly update total
- **Status:** NOT STARTED

**Task 22: Calculate distribution timestamp**
- **Category:** Business Logic
- **Description:** Set distribute_at timestamp based on user's default_timer_days setting
- **Steps to Verify:**
  - distribute_at equals upload time + default_timer_days
  - User's configured timer value is used
  - Timestamp is stored in UTC
- **Status:** NOT STARTED

**Task 23: Implement failed upload cleanup**
- **Category:** Error Handling
- **Description:** Clean up temporary and partial files when uploads fail
- **Steps to Verify:**
  - Failed uploads don't leave orphan files
  - Database records are not created for failed uploads
  - Storage usage is not incremented for failed uploads
- **Status:** NOT STARTED

**Task 24: Write upload integration tests**
- **Category:** Testing
- **Description:** Create integration tests for the video upload endpoint
- **Steps to Verify:**
  - Tests cover successful upload scenarios
  - Tests cover quota exceeded scenarios
  - Tests cover authentication requirements
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.4 Video Management Endpoints

**Task 25: Implement video list endpoint**
- **Category:** API
- **Description:** Create GET /api/videos endpoint with pagination and status filtering
- **Steps to Verify:**
  - Returns paginated list of user's videos
  - Pagination parameters (limit, offset) work correctly
  - Status filter returns only matching videos
  - Response matches API specification
- **Status:** NOT STARTED

**Task 26: Implement single video endpoint**
- **Category:** API
- **Description:** Create GET /api/videos/:id endpoint to retrieve video metadata
- **Steps to Verify:**
  - Returns complete video metadata for valid ID
  - Returns 404 for non-existent video
  - Returns 403 for videos owned by other users
- **Status:** NOT STARTED

**Task 27: Implement video update endpoint**
- **Category:** API
- **Description:** Create PATCH /api/videos/:id endpoint to update video title
- **Steps to Verify:**
  - Title is updated successfully
  - updated_at timestamp is modified
  - Returns updated video metadata
- **Status:** NOT STARTED

**Task 28: Implement video delete endpoint**
- **Category:** API
- **Description:** Create DELETE /api/videos/:id endpoint to remove video and update storage
- **Steps to Verify:**
  - Video file is deleted from storage
  - Database record is removed
  - User's storage_used_bytes is decremented
  - Returns success confirmation
- **Status:** NOT STARTED

**Task 29: Add ownership validation**
- **Category:** Security
- **Description:** Ensure all video endpoints validate that the requesting user owns the video
- **Steps to Verify:**
  - Users cannot access other users' videos
  - 403 returned for unauthorized access attempts
  - Validation applied consistently across all endpoints
- **Status:** NOT STARTED

**Task 30: Write video management unit tests**
- **Category:** Testing
- **Description:** Create unit tests for video management endpoints
- **Steps to Verify:**
  - Tests cover all CRUD operations
  - Tests cover ownership validation
  - Tests cover edge cases (non-existent videos, etc.)
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.5 Check-In System

**Task 31: Create CheckIn data model**
- **Category:** Database
- **Description:** Create CheckIn data model and database migration
- **Steps to Verify:**
  - Migration creates CheckIn table with all required fields
  - Foreign key to Video table is properly configured
  - Migration runs successfully
- **Status:** NOT STARTED

**Task 32: Implement check-in endpoint**
- **Category:** API
- **Description:** Create POST /api/videos/:id/checkin endpoint for user check-in actions
- **Steps to Verify:**
  - Endpoint accepts valid check-in actions
  - Returns updated video and check-in record
  - Response matches API specification
- **Status:** NOT STARTED

**Task 33: Handle PREVENT_DISTRIBUTION action**
- **Category:** Business Logic
- **Description:** Implement logic to prevent video distribution and optionally reset timer
- **Steps to Verify:**
  - Video status is updated appropriately
  - distribute_at can be extended based on action
  - User's timer_days setting is used for extension
- **Status:** NOT STARTED

**Task 34: Handle ALLOW_DISTRIBUTION action**
- **Category:** Business Logic
- **Description:** Implement logic to allow distribution (undo prevention)
- **Steps to Verify:**
  - Prevention status can be reversed
  - Video returns to ACTIVE status
  - distribute_at is recalculated if needed
- **Status:** NOT STARTED

**Task 35: Log check-in actions**
- **Category:** Auditing
- **Description:** Record all check-in actions to CheckIn table for audit trail
- **Steps to Verify:**
  - Every check-in creates a CheckIn record
  - Records include video_id, action, and timestamp
  - Historical check-ins are queryable
- **Status:** NOT STARTED

**Task 36: Write check-in unit tests**
- **Category:** Testing
- **Description:** Create unit tests for check-in functionality
- **Steps to Verify:**
  - Tests cover both action types
  - Tests verify status transitions
  - Tests verify audit logging
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.6 Public Video Access

**Task 37: Implement public video endpoint**
- **Category:** API
- **Description:** Create GET /api/public/videos/:token endpoint without authentication requirement
- **Steps to Verify:**
  - Endpoint accessible without authentication
  - Valid token returns video content
  - Invalid token returns 404
- **Status:** NOT STARTED

**Task 38: Validate distribution status**
- **Category:** Security
- **Description:** Ensure videos are only accessible after distribution (status = DISTRIBUTED)
- **Steps to Verify:**
  - PENDING/ACTIVE videos return 404 (not yet available)
  - DISTRIBUTED videos are accessible
  - EXPIRED videos return appropriate error
- **Status:** NOT STARTED

**Task 39: Stream video with proper headers**
- **Category:** Streaming
- **Description:** Stream video file with correct Content-Type and Content-Length headers
- **Steps to Verify:**
  - Content-Type matches video MIME type
  - Content-Length is accurate
  - Video plays correctly in browser
- **Status:** NOT STARTED

**Task 40: Handle range requests**
- **Category:** Streaming
- **Description:** Support HTTP range requests for video seeking functionality
- **Steps to Verify:**
  - 206 Partial Content returned for range requests
  - Seeking works in video player
  - Content-Range header is correct
- **Status:** NOT STARTED

**Task 41: Add rate limiting**
- **Category:** Security
- **Description:** Implement rate limiting on public endpoint to prevent abuse
- **Steps to Verify:**
  - Excessive requests return 429 Too Many Requests
  - Rate limit is per-IP or per-token
  - Normal usage is not affected
- **Status:** NOT STARTED

**Task 42: Write public access integration tests**
- **Category:** Testing
- **Description:** Create integration tests for public video access
- **Steps to Verify:**
  - Tests cover valid token access
  - Tests cover invalid/expired token scenarios
  - Tests cover range request handling
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.7 User Settings & Recipients

**Task 43: Implement get settings endpoint**
- **Category:** API
- **Description:** Create GET /api/user/settings endpoint to retrieve user settings
- **Steps to Verify:**
  - Returns current user's settings
  - Includes default_timer_days, storage quota/usage, fcm_token
  - Response matches API specification
- **Status:** NOT STARTED

**Task 44: Implement update settings endpoint**
- **Category:** API
- **Description:** Create PATCH /api/user/settings endpoint to modify user settings
- **Steps to Verify:**
  - Settings are updated successfully
  - Partial updates work (only provided fields)
  - Returns updated settings
- **Status:** NOT STARTED

**Task 45: Implement get recipients endpoint**
- **Category:** API
- **Description:** Create GET /api/user/recipients endpoint to list distribution recipients
- **Steps to Verify:**
  - Returns list of user's recipients
  - Each recipient includes id, email, name
  - Response matches API specification
- **Status:** NOT STARTED

**Task 46: Implement add recipient endpoint**
- **Category:** API
- **Description:** Create POST /api/user/recipients endpoint with email validation
- **Steps to Verify:**
  - Valid email creates new recipient
  - Invalid email format returns 400
  - Duplicate emails are handled appropriately
  - Returns created recipient
- **Status:** NOT STARTED

**Task 47: Implement delete recipient endpoint**
- **Category:** API
- **Description:** Create DELETE /api/user/recipients/:id endpoint
- **Steps to Verify:**
  - Recipient is removed successfully
  - Non-existent recipient returns 404
  - Returns success confirmation
- **Status:** NOT STARTED

**Task 48: Validate recipient ownership**
- **Category:** Security
- **Description:** Ensure users can only manage their own recipients
- **Steps to Verify:**
  - Users cannot view other users' recipients
  - Users cannot delete other users' recipients
  - 403 returned for unauthorized access
- **Status:** NOT STARTED

**Task 49: Write settings and recipients unit tests**
- **Category:** Testing
- **Description:** Create unit tests for settings and recipient management
- **Steps to Verify:**
  - Tests cover all settings operations
  - Tests cover all recipient CRUD operations
  - Tests cover validation and authorization
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.8 Admin Endpoints

**Task 50: Implement create user endpoint**
- **Category:** Admin API
- **Description:** Create POST /api/admin/users endpoint for admin user creation
- **Steps to Verify:**
  - Admin can create new users with username/password
  - Optional is_admin and storage_quota can be set
  - Returns created user (without password)
  - Non-admins receive 403
- **Status:** NOT STARTED

**Task 51: Implement list users endpoint**
- **Category:** Admin API
- **Description:** Create GET /api/admin/users endpoint to list all users
- **Steps to Verify:**
  - Returns list of all users
  - Includes storage usage statistics
  - Non-admins receive 403
- **Status:** NOT STARTED

**Task 52: Implement update user endpoint**
- **Category:** Admin API
- **Description:** Create PATCH /api/admin/users/:id endpoint to modify user properties
- **Steps to Verify:**
  - Admin can update storage_quota and is_admin flag
  - Returns updated user
  - Non-admins receive 403
- **Status:** NOT STARTED

**Task 53: Implement delete user endpoint**
- **Category:** Admin API
- **Description:** Create DELETE /api/admin/users/:id endpoint with cascade delete for videos
- **Steps to Verify:**
  - User and all associated videos are deleted
  - Video files are removed from storage
  - Recipients are deleted
  - Returns success confirmation
- **Status:** NOT STARTED

**Task 54: Implement get system config endpoint**
- **Category:** Admin API
- **Description:** Create GET /api/admin/config endpoint to retrieve system configuration
- **Steps to Verify:**
  - Returns all system configuration values
  - Non-admins receive 403
  - Response includes all config keys
- **Status:** NOT STARTED

**Task 55: Implement update system config endpoint**
- **Category:** Admin API
- **Description:** Create PATCH /api/admin/config endpoint to modify system settings
- **Steps to Verify:**
  - Config values are updated successfully
  - Changes take effect immediately
  - Returns updated configuration
- **Status:** NOT STARTED

**Task 56: Create admin seed script**
- **Category:** DevOps
- **Description:** Create script to seed initial admin user for fresh installations
- **Steps to Verify:**
  - Script creates admin user with configured credentials
  - Script is idempotent (safe to run multiple times)
  - Script can be run via pnpm script
- **Status:** NOT STARTED

**Task 57: Write admin endpoint integration tests**
- **Category:** Testing
- **Description:** Create integration tests for all admin endpoints
- **Steps to Verify:**
  - Tests cover all admin CRUD operations
  - Tests verify admin-only access
  - Tests cover cascade delete scenarios
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.9 Background Job Scheduler

**Task 58: Set up job scheduler**
- **Category:** Infrastructure
- **Description:** Configure node-cron or Bull (with Redis) for background job scheduling
- **Steps to Verify:**
  - Scheduler initializes on application startup
  - Jobs can be scheduled and executed
  - Job status is logged
- **Status:** NOT STARTED

**Task 59: Create distribution job**
- **Category:** Background Jobs
- **Description:** Implement hourly job to distribute videos past their timer (query videos where distribute_at <= now() and status = ACTIVE, mark as DISTRIBUTED, set expires_at to 7 days from distribution)
- **Steps to Verify:**
  - Job runs on configured schedule (hourly)
  - Eligible videos are marked DISTRIBUTED
  - expires_at is set to 7 days after distribution
  - Job handles empty result set gracefully
- **Status:** NOT STARTED

**Task 60: Create push notification job**
- **Category:** Background Jobs
- **Description:** Implement daily job to send check-in reminders for active videos
- **Steps to Verify:**
  - Job runs at configured time daily
  - Notifications sent for all ACTIVE videos
  - Each user receives one notification per video
  - Job logs notification results
- **Status:** NOT STARTED

**Task 61: Create expiration cleanup job**
- **Category:** Background Jobs
- **Description:** Implement daily job to expire and delete old distributed videos (query where expires_at <= now() and status = DISTRIBUTED, delete files, update status to EXPIRED, update storage)
- **Steps to Verify:**
  - Job runs daily
  - Expired video files are deleted from storage
  - Video status updated to EXPIRED
  - User storage_used_bytes is decremented
- **Status:** NOT STARTED

**Task 62: Add job error handling**
- **Category:** Error Handling
- **Description:** Implement error handling and retry logic for all background jobs
- **Steps to Verify:**
  - Failed jobs are logged with error details
  - Jobs retry on transient failures
  - Persistent failures don't crash the application
  - Alerts can be configured for job failures
- **Status:** NOT STARTED

**Task 63: Write job scheduler tests**
- **Category:** Testing
- **Description:** Create tests for background job logic
- **Steps to Verify:**
  - Tests cover distribution job logic
  - Tests cover notification job logic
  - Tests cover expiration cleanup logic
  - Tests verify error handling
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.10 Push Notifications

**Task 64: Set up Firebase Admin SDK**
- **Category:** Infrastructure
- **Description:** Configure Firebase Admin SDK for server-side push notifications
- **Steps to Verify:**
  - Firebase credentials are loaded from config
  - SDK initializes successfully on startup
  - Connection to Firebase is verified
- **Status:** NOT STARTED

**Task 65: Create notification service**
- **Category:** Services
- **Description:** Build service layer for sending FCM push notifications
- **Steps to Verify:**
  - Service can send notifications to valid FCM tokens
  - Service handles invalid tokens gracefully
  - Service returns success/failure status
- **Status:** NOT STARTED

**Task 66: Implement check-in reminder notifications**
- **Category:** Business Logic
- **Description:** Create per-video check-in reminder notification logic
- **Steps to Verify:**
  - Notifications include video-specific information
  - Reminders are sent for each active video
  - Users with multiple videos receive multiple notifications
- **Status:** NOT STARTED

**Task 67: Create notification templates**
- **Category:** Business Logic
- **Description:** Design notification templates with video title and distribute_at time
- **Steps to Verify:**
  - Template includes video title
  - Template includes time until distribution
  - Messages are clear and actionable
- **Status:** NOT STARTED

**Task 68: Add deep linking payload**
- **Category:** Mobile Integration
- **Description:** Include payload data for deep linking to specific videos in app
- **Steps to Verify:**
  - Notification payload includes video ID
  - Mobile apps can parse payload
  - Tapping notification opens correct video
- **Status:** NOT STARTED

**Task 69: Handle FCM token updates**
- **Category:** API
- **Description:** Process FCM token updates from mobile apps via settings endpoint
- **Steps to Verify:**
  - Token updates are saved to user record
  - Old tokens are replaced
  - Notifications use latest token
- **Status:** NOT STARTED

**Task 70: Write notification service tests**
- **Category:** Testing
- **Description:** Create tests for notification service
- **Steps to Verify:**
  - Tests cover successful notification sending
  - Tests cover invalid token handling
  - Tests cover template generation
  - All tests pass
- **Status:** NOT STARTED

#### 6.1.11 Admin Web Interface (Future)

Note: Email distribution configuration will be deferred pending additional research. The admin interface should be designed to accommodate future email settings.

**Technology Stack:** React with react-query for data fetching and Tailwind CSS for styling.

**Task 71: Create admin dashboard template**
- **Category:** Frontend
- **Description:** Build React admin dashboard with Tailwind CSS styling
- **Steps to Verify:**
  - Dashboard has consistent Tailwind styling
  - Navigation between sections works
  - Responsive design for common screen sizes
- **Status:** NOT STARTED

**Task 72: Implement admin login page**
- **Category:** Frontend
- **Description:** Create admin login page with authentication using React and Tailwind
- **Steps to Verify:**
  - Login form accepts username/password
  - Successful login redirects to dashboard
  - Invalid credentials show error message
  - Session is maintained
- **Status:** NOT STARTED

**Task 73: Create user management UI**
- **Category:** Frontend
- **Description:** Build UI for listing, creating, editing, and deleting users using React with react-query for data fetching
- **Steps to Verify:**
  - User list displays all users with key info
  - Create user form works correctly
  - Edit user form pre-fills existing values
  - Delete confirmation prevents accidental deletion
  - react-query handles caching and refetching
- **Status:** NOT STARTED

**Task 74: Create system config UI**
- **Category:** Frontend
- **Description:** Build UI for editing system configuration (storage quota, notification times, etc.) using React with react-query
- **Steps to Verify:**
  - All config options are displayed
  - Changes save successfully
  - Validation prevents invalid values
  - Success/error feedback shown
  - react-query manages config data state
- **Status:** NOT STARTED

**Task 75: Add system stats dashboard**
- **Category:** Frontend
- **Description:** Display system statistics (total users, videos, storage usage) using React with react-query for real-time data
- **Steps to Verify:**
  - Stats are accurate and up-to-date
  - Dashboard loads within reasonable time
  - Key metrics are prominently displayed
  - react-query handles data polling/refreshing
- **Status:** NOT STARTED

**Task 76: Serve admin interface from Express**
- **Category:** Infrastructure
- **Description:** Configure Express to serve React admin interface build on /admin/* routes
- **Steps to Verify:**
  - Admin interface accessible at /admin
  - Static assets (CSS, JS) are served correctly
  - Non-admin users are redirected to login
  - React Router handles client-side routing
- **Status:** NOT STARTED

### 6.2 Mobile App Tasks (iOS)

#### 6.2.1 iOS Project Setup

**Task 77: Create iOS project**
- **Category:** Project Setup
- **Description:** Create iOS project in Xcode with SwiftUI framework
- **Steps to Verify:**
  - Project builds successfully in Xcode
  - SwiftUI app launches in simulator
  - Project structure follows iOS conventions
- **Status:** NOT STARTED

**Task 78: Configure deployment target**
- **Category:** Project Setup
- **Description:** Set iOS 15+ as minimum deployment target
- **Steps to Verify:**
  - Deployment target set to iOS 15.0
  - App runs on iOS 15 simulator
  - Build settings are correct
- **Status:** NOT STARTED

**Task 79: Add Firebase SDK**
- **Category:** Dependencies
- **Description:** Integrate Firebase SDK for push notifications
- **Steps to Verify:**
  - Firebase SDK installed via SPM or CocoaPods
  - GoogleService-Info.plist configured
  - Firebase initializes on app launch
- **Status:** NOT STARTED

**Task 80: Set up Info.plist permissions**
- **Category:** Configuration
- **Description:** Configure required permissions (camera, microphone, notifications)
- **Steps to Verify:**
  - NSCameraUsageDescription present
  - NSMicrophoneUsageDescription present
  - Permission prompts display correctly
- **Status:** NOT STARTED

**Task 81: Configure keychain storage**
- **Category:** Security
- **Description:** Set up Keychain for secure credential storage
- **Steps to Verify:**
  - Data can be saved to Keychain
  - Data can be retrieved from Keychain
  - Data persists across app restarts
- **Status:** NOT STARTED

#### 6.2.2 iOS Authentication

**Task 82: Create login screen UI**
- **Category:** UI
- **Description:** Build login screen with server endpoint, username, and password fields
- **Steps to Verify:**
  - Login form displays all required fields
  - Validation shows for empty fields
  - Loading state during authentication
  - Error messages display clearly
- **Status:** NOT STARTED

**Task 83: Implement API service**
- **Category:** Networking
- **Description:** Create API service using URLSession for authentication calls
- **Steps to Verify:**
  - Login API call works correctly
  - Network errors are handled gracefully
  - Response parsing works for success/failure
- **Status:** NOT STARTED

**Task 84: Store JWT in Keychain**
- **Category:** Security
- **Description:** Securely store JWT token in iOS Keychain
- **Steps to Verify:**
  - Token is stored after successful login
  - Token is retrieved on app launch
  - Token is cleared on logout
- **Status:** NOT STARTED

**Task 85: Implement token refresh**
- **Category:** Authentication
- **Description:** Automatically refresh JWT token before expiration
- **Steps to Verify:**
  - Token is refreshed before expiration
  - Failed refresh triggers re-login
  - Refresh happens transparently to user
- **Status:** NOT STARTED

**Task 86: Create auth state management**
- **Category:** Architecture
- **Description:** Build authentication state management using Combine or ObservableObject
- **Steps to Verify:**
  - Login state persists across app restarts
  - UI reacts to auth state changes
  - Logout clears all auth state
- **Status:** NOT STARTED

#### 6.2.3 iOS Video Recording

**Task 87: Create camera view**
- **Category:** UI
- **Description:** Build camera preview view using AVFoundation
- **Steps to Verify:**
  - Camera preview displays live feed
  - Preview works for front and back cameras
  - View handles orientation changes
- **Status:** NOT STARTED

**Task 88: Implement recording controls**
- **Category:** Video
- **Description:** Add start/stop recording controls with visual feedback
- **Steps to Verify:**
  - Start button begins recording
  - Stop button ends recording
  - Visual indicator shows recording state
- **Status:** NOT STARTED

**Task 89: Save video to temp storage**
- **Category:** Storage
- **Description:** Save recorded video to temporary local storage
- **Steps to Verify:**
  - Video file is saved after recording stops
  - File format is compatible (MP4/MOV)
  - Temporary files are in correct directory
- **Status:** NOT STARTED

**Task 90: Handle camera permissions**
- **Category:** Permissions
- **Description:** Request and handle camera/microphone permissions
- **Steps to Verify:**
  - Permission prompt appears on first use
  - Denied permission shows helpful message
  - Permission state is checked before recording
- **Status:** NOT STARTED

**Task 91: Display recording info**
- **Category:** UI
- **Description:** Show recording timer and estimated file size during recording
- **Steps to Verify:**
  - Timer counts up during recording
  - File size estimate updates in real-time
  - Display is clearly visible
- **Status:** NOT STARTED

#### 6.2.4 iOS Video Upload

**Task 92: Create background upload service**
- **Category:** Networking
- **Description:** Build upload service using URLSession background configuration
- **Steps to Verify:**
  - Upload service initializes correctly
  - Background session is configured
  - Uploads can be queued
- **Status:** NOT STARTED

**Task 93: Implement multipart upload**
- **Category:** Networking
- **Description:** Create multipart/form-data upload to POST /api/videos/upload
- **Steps to Verify:**
  - Video file uploads successfully
  - Multipart boundary is correct
  - Server accepts the upload format
- **Status:** NOT STARTED

**Task 94: Add progress tracking**
- **Category:** UI
- **Description:** Track and display upload progress to user
- **Steps to Verify:**
  - Progress percentage updates during upload
  - Progress bar reflects actual upload state
  - Upload completion is indicated
- **Status:** NOT STARTED

**Task 95: Handle upload errors**
- **Category:** Error Handling
- **Description:** Implement error handling and retry logic for failed uploads
- **Steps to Verify:**
  - Network errors trigger retry
  - User is notified of persistent failures
  - Retry count is limited
- **Status:** NOT STARTED

**Task 96: Support background upload**
- **Category:** Background Processing
- **Description:** Enable uploads to continue when app is backgrounded
- **Steps to Verify:**
  - Upload continues after app goes to background
  - Upload completes even if app is suspended
  - Completion is handled when app returns to foreground
- **Status:** NOT STARTED

**Task 97: Implement video title prompt**
- **Category:** UI
- **Description:** Show optional title input after recording
- **Steps to Verify:**
  - Title prompt appears after recording
  - User can skip title entry
  - Title is included in upload
- **Status:** NOT STARTED

**Task 98: Auto-generate titles**
- **Category:** Business Logic
- **Description:** Generate title from date/location when user skips
- **Steps to Verify:**
  - Default title includes date/time
  - Location included if available
  - Title format is human-readable
- **Status:** NOT STARTED

**Task 99: Clean up temp files**
- **Category:** Storage
- **Description:** Delete temporary video files after successful upload
- **Steps to Verify:**
  - Temp file deleted after upload confirms
  - Storage space is freed
  - Cleanup doesn't delete pending uploads
- **Status:** NOT STARTED

#### 6.2.5 iOS Video List & Management

**Task 100: Create video list UI**
- **Category:** UI
- **Description:** Build video list screen using SwiftUI List
- **Steps to Verify:**
  - List displays videos in scrollable view
  - Empty state shows when no videos
  - List styling matches app design
- **Status:** NOT STARTED

**Task 101: Fetch videos from API**
- **Category:** Networking
- **Description:** Retrieve videos from GET /api/videos endpoint
- **Steps to Verify:**
  - Videos are fetched on screen load
  - Loading state shown during fetch
  - Errors are handled gracefully
- **Status:** NOT STARTED

**Task 102: Display video info**
- **Category:** UI
- **Description:** Show video title, status, and distribute_at in list items
- **Steps to Verify:**
  - Title displays clearly
  - Status is visually distinct (colors/icons)
  - distribute_at shows relative time or date
- **Status:** NOT STARTED

**Task 103: Implement pull-to-refresh**
- **Category:** UI
- **Description:** Add pull-to-refresh gesture to reload video list
- **Steps to Verify:**
  - Pull gesture triggers refresh
  - Loading indicator appears
  - List updates with fresh data
- **Status:** NOT STARTED

**Task 104: Add swipe-to-delete**
- **Category:** UI
- **Description:** Enable swipe actions for deleting videos
- **Steps to Verify:**
  - Swipe reveals delete action
  - Confirmation dialog prevents accidents
  - Video is removed from list after delete
- **Status:** NOT STARTED

**Task 105: Create video detail view**
- **Category:** UI
- **Description:** Build detail view showing full video metadata
- **Steps to Verify:**
  - All video properties displayed
  - Navigation from list to detail works
  - Back navigation returns to list
- **Status:** NOT STARTED

#### 6.2.6 iOS Check-In Functionality

**Task 106: Add check-in button**
- **Category:** UI
- **Description:** Add check-in button to video detail view
- **Steps to Verify:**
  - Button is prominently displayed
  - Button is disabled for non-active videos
  - Tap initiates check-in flow
- **Status:** NOT STARTED

**Task 107: Implement check-in API call**
- **Category:** Networking
- **Description:** Call POST /api/videos/:id/checkin endpoint
- **Steps to Verify:**
  - API call sends correct action type
  - Success response is parsed correctly
  - Errors are handled and displayed
- **Status:** NOT STARTED

**Task 108: Show confirmation dialog**
- **Category:** UI
- **Description:** Display confirmation before PREVENT_DISTRIBUTION action
- **Steps to Verify:**
  - Dialog explains the action
  - User can confirm or cancel
  - Cancel returns to detail view unchanged
- **Status:** NOT STARTED

**Task 109: Update UI after check-in**
- **Category:** UI
- **Description:** Refresh video status display after successful check-in
- **Steps to Verify:**
  - Status updates immediately after check-in
  - distribute_at reflects any extension
  - Success feedback shown to user
- **Status:** NOT STARTED

#### 6.2.7 iOS Push Notifications

**Task 110: Request notification permissions**
- **Category:** Permissions
- **Description:** Request push notification permissions on first launch
- **Steps to Verify:**
  - Permission dialog appears on first launch
  - Permission state is remembered
  - Denied permission handled gracefully
- **Status:** NOT STARTED

**Task 111: Register for FCM**
- **Category:** Push Notifications
- **Description:** Register device for remote notifications via Firebase Cloud Messaging
- **Steps to Verify:**
  - FCM token is obtained successfully
  - Token refresh is handled
  - Registration errors are logged
- **Status:** NOT STARTED

**Task 112: Send FCM token to backend**
- **Category:** Networking
- **Description:** Submit FCM token via PATCH /api/user/settings
- **Steps to Verify:**
  - Token is sent after registration
  - Token updates sent when refreshed
  - Backend receives valid token
- **Status:** NOT STARTED

**Task 113: Handle notification tap**
- **Category:** Navigation
- **Description:** Navigate to specific video when notification is tapped
- **Steps to Verify:**
  - Tap opens app to correct video
  - Deep link payload is parsed correctly
  - Navigation works from killed state
- **Status:** NOT STARTED

**Task 114: Display notification alerts**
- **Category:** Push Notifications
- **Description:** Show notification badges and alerts properly
- **Steps to Verify:**
  - Notifications appear when app is backgrounded
  - Badge count updates appropriately
  - Alert content is formatted correctly
- **Status:** NOT STARTED

#### 6.2.8 iOS Settings

**Task 115: Create settings screen UI**
- **Category:** UI
- **Description:** Build settings screen with all user-configurable options
- **Steps to Verify:**
  - Settings screen is accessible from main navigation
  - All settings are displayed in organized sections
  - UI follows iOS design guidelines
- **Status:** NOT STARTED

**Task 116: Display server endpoint**
- **Category:** UI
- **Description:** Show connected server endpoint (read-only after setup)
- **Steps to Verify:**
  - Server URL is displayed
  - Field is not editable after login
  - Clear indication it's read-only
- **Status:** NOT STARTED

**Task 117: Add timer configuration**
- **Category:** Settings
- **Description:** Allow user to configure default distribution timer
- **Steps to Verify:**
  - Current timer value is fetched and displayed
  - User can modify timer value
  - Changes are saved via PATCH /api/user/settings
- **Status:** NOT STARTED

**Task 118: Show storage quota**
- **Category:** UI
- **Description:** Display storage quota and current usage
- **Steps to Verify:**
  - Quota limit is displayed
  - Current usage is shown
  - Visual indicator (progress bar) shows usage percentage
- **Status:** NOT STARTED

**Task 119: Add logout functionality**
- **Category:** Authentication
- **Description:** Implement logout with credential clearing
- **Steps to Verify:**
  - Logout button is visible
  - Confirmation dialog prevents accidents
  - All credentials and tokens are cleared
  - User is returned to login screen
- **Status:** NOT STARTED

#### 6.2.9 iOS Distribution Recipients

**Task 120: Create recipients screen**
- **Category:** UI
- **Description:** Build recipients management screen
- **Steps to Verify:**
  - Screen is accessible from settings/main nav
  - Recipients display in list format
  - Empty state shown when no recipients
- **Status:** NOT STARTED

**Task 121: Fetch recipients**
- **Category:** Networking
- **Description:** Retrieve recipients from GET /api/user/recipients
- **Steps to Verify:**
  - Recipients load on screen appearance
  - Loading state is shown
  - Errors handled gracefully
- **Status:** NOT STARTED

**Task 122: Add recipient creation UI**
- **Category:** UI
- **Description:** Build form to add new recipient via POST /api/user/recipients
- **Steps to Verify:**
  - Add button opens recipient form
  - Form accepts email and optional name
  - Success adds recipient to list
- **Status:** NOT STARTED

**Task 123: Add swipe-to-delete**
- **Category:** UI
- **Description:** Enable swipe gesture to delete recipients
- **Steps to Verify:**
  - Swipe reveals delete action
  - Confirmation prevents accidents
  - Recipient removed from list after delete
- **Status:** NOT STARTED

**Task 124: Validate email addresses**
- **Category:** Validation
- **Description:** Validate email format before submission
- **Steps to Verify:**
  - Invalid emails show error message
  - Valid emails are accepted
  - Validation happens before API call
- **Status:** NOT STARTED

### 6.3 Mobile App Tasks (Android)

#### 6.3.1 Android Project Setup

**Task 125: Create Android project**
- **Category:** Project Setup
- **Description:** Create Android project in Android Studio with Jetpack Compose
- **Steps to Verify:**
  - Project builds successfully in Android Studio
  - Compose UI renders in emulator
  - Project structure follows Android conventions
- **Status:** NOT STARTED

**Task 126: Configure minimum API level**
- **Category:** Project Setup
- **Description:** Set API 26+ (Android 8.0+) as minimum SDK
- **Steps to Verify:**
  - minSdk set to 26 in build.gradle
  - App runs on API 26 emulator
  - Build configuration is correct
- **Status:** NOT STARTED

**Task 127: Add Firebase SDK**
- **Category:** Dependencies
- **Description:** Integrate Firebase SDK for push notifications
- **Steps to Verify:**
  - Firebase SDK added to dependencies
  - google-services.json configured
  - Firebase initializes on app launch
- **Status:** NOT STARTED

**Task 128: Configure manifest permissions**
- **Category:** Configuration
- **Description:** Set up AndroidManifest.xml with required permissions (camera, storage, notifications)
- **Steps to Verify:**
  - CAMERA permission declared
  - RECORD_AUDIO permission declared
  - POST_NOTIFICATIONS permission declared (Android 13+)
- **Status:** NOT STARTED

**Task 129: Set up encrypted storage**
- **Category:** Security
- **Description:** Configure EncryptedSharedPreferences for secure credential storage
- **Steps to Verify:**
  - EncryptedSharedPreferences initialized
  - Data is encrypted at rest
  - Data persists across app restarts
- **Status:** NOT STARTED

#### 6.3.2 Android Authentication

**Task 130: Create login screen UI**
- **Category:** UI
- **Description:** Build login screen using Jetpack Compose with server, username, password fields
- **Steps to Verify:**
  - Login form displays all required fields
  - Validation shows for empty fields
  - Loading state during authentication
  - Error messages display clearly
- **Status:** NOT STARTED

**Task 131: Implement API service**
- **Category:** Networking
- **Description:** Create API service using Retrofit + OkHttp
- **Steps to Verify:**
  - Retrofit client configured correctly
  - Login API call works
  - Network errors handled gracefully
- **Status:** NOT STARTED

**Task 132: Store JWT securely**
- **Category:** Security
- **Description:** Store JWT token in EncryptedSharedPreferences
- **Steps to Verify:**
  - Token stored after successful login
  - Token retrieved on app launch
  - Token cleared on logout
- **Status:** NOT STARTED

**Task 133: Implement token refresh**
- **Category:** Authentication
- **Description:** Automatically refresh JWT token before expiration
- **Steps to Verify:**
  - Token refreshed before expiration
  - Failed refresh triggers re-login
  - Refresh happens transparently
- **Status:** NOT STARTED

**Task 134: Create auth state ViewModel**
- **Category:** Architecture
- **Description:** Build authentication state management using ViewModel
- **Steps to Verify:**
  - Login state persists across config changes
  - UI reacts to auth state changes
  - Logout clears all auth state
- **Status:** NOT STARTED

#### 6.3.3 Android Video Recording

**Task 135: Create camera view**
- **Category:** UI
- **Description:** Build camera preview using CameraX
- **Steps to Verify:**
  - Camera preview displays live feed
  - Preview works for front and back cameras
  - View handles rotation correctly
- **Status:** NOT STARTED

**Task 136: Implement recording controls**
- **Category:** Video
- **Description:** Add start/stop recording controls with visual feedback
- **Steps to Verify:**
  - Start button begins recording
  - Stop button ends recording
  - Visual indicator shows recording state
- **Status:** NOT STARTED

**Task 137: Save video to storage**
- **Category:** Storage
- **Description:** Save recorded video to app-specific storage
- **Steps to Verify:**
  - Video file saved after recording stops
  - File format is MP4
  - Files stored in correct directory
- **Status:** NOT STARTED

**Task 138: Handle camera permissions**
- **Category:** Permissions
- **Description:** Request and handle runtime camera/audio permissions
- **Steps to Verify:**
  - Permission request on first camera use
  - Denied permission shows rationale
  - Permission state checked before recording
- **Status:** NOT STARTED

**Task 139: Display recording info**
- **Category:** UI
- **Description:** Show recording timer and estimated file size
- **Steps to Verify:**
  - Timer counts during recording
  - File size estimate updates in real-time
  - Display is clearly visible
- **Status:** NOT STARTED

#### 6.3.4 Android Video Upload

**Task 140: Create WorkManager upload service**
- **Category:** Background Processing
- **Description:** Build upload service using WorkManager for reliable background uploads
- **Steps to Verify:**
  - WorkManager worker created
  - Uploads queued successfully
  - Work survives app restart
- **Status:** NOT STARTED

**Task 141: Implement multipart upload**
- **Category:** Networking
- **Description:** Create multipart/form-data upload using Retrofit
- **Steps to Verify:**
  - Video file uploads successfully
  - Multipart request formed correctly
  - Server accepts upload format
- **Status:** NOT STARTED

**Task 142: Add progress tracking**
- **Category:** UI
- **Description:** Track and display upload progress
- **Steps to Verify:**
  - Progress percentage updates during upload
  - Progress notification shows status
  - Completion indicated clearly
- **Status:** NOT STARTED

**Task 143: Handle upload errors**
- **Category:** Error Handling
- **Description:** Implement error handling and retry with WorkManager constraints
- **Steps to Verify:**
  - Network errors trigger retry
  - Retry respects backoff policy
  - Persistent failures notify user
- **Status:** NOT STARTED

**Task 144: Support foreground service**
- **Category:** Background Processing
- **Description:** Use foreground service notification during active upload
- **Steps to Verify:**
  - Notification shown during upload
  - Upload continues in background
  - Notification dismissed on completion
- **Status:** NOT STARTED

**Task 145: Implement video title prompt**
- **Category:** UI
- **Description:** Show optional title input after recording
- **Steps to Verify:**
  - Title dialog appears after recording
  - User can skip title entry
  - Title included in upload
- **Status:** NOT STARTED

**Task 146: Auto-generate titles**
- **Category:** Business Logic
- **Description:** Generate title from date/location when user skips
- **Steps to Verify:**
  - Default title includes date/time
  - Location included if permission granted
  - Title format is human-readable
- **Status:** NOT STARTED

**Task 147: Clean up temp files**
- **Category:** Storage
- **Description:** Delete temporary video files after successful upload
- **Steps to Verify:**
  - Temp file deleted after upload confirms
  - Storage space freed
  - Pending uploads not affected
- **Status:** NOT STARTED

#### 6.3.5 Android Video List & Management

**Task 148: Create video list UI**
- **Category:** UI
- **Description:** Build video list screen using Jetpack Compose LazyColumn
- **Steps to Verify:**
  - List displays videos in scrollable view
  - Empty state shown when no videos
  - List styling matches app design
- **Status:** NOT STARTED

**Task 149: Fetch videos from API**
- **Category:** Networking
- **Description:** Retrieve videos from GET /api/videos endpoint
- **Steps to Verify:**
  - Videos fetched on screen load
  - Loading state shown during fetch
  - Errors handled gracefully
- **Status:** NOT STARTED

**Task 150: Display video info**
- **Category:** UI
- **Description:** Show video title, status, and distribute_at in list items
- **Steps to Verify:**
  - Title displays clearly
  - Status visually distinct (colors/icons)
  - distribute_at shows relative or absolute time
- **Status:** NOT STARTED

**Task 151: Implement pull-to-refresh**
- **Category:** UI
- **Description:** Add SwipeRefresh for reloading video list
- **Steps to Verify:**
  - Pull gesture triggers refresh
  - Loading indicator appears
  - List updates with fresh data
- **Status:** NOT STARTED

**Task 152: Add swipe-to-delete**
- **Category:** UI
- **Description:** Enable swipe actions for deleting videos
- **Steps to Verify:**
  - Swipe reveals delete action
  - Confirmation dialog prevents accidents
  - Video removed from list after delete
- **Status:** NOT STARTED

**Task 153: Create video detail view**
- **Category:** UI
- **Description:** Build detail view showing full video metadata
- **Steps to Verify:**
  - All video properties displayed
  - Navigation from list to detail works
  - Back navigation returns to list
- **Status:** NOT STARTED

#### 6.3.6 Android Check-In Functionality

**Task 154: Add check-in button**
- **Category:** UI
- **Description:** Add check-in button to video detail view
- **Steps to Verify:**
  - Button prominently displayed
  - Button disabled for non-active videos
  - Tap initiates check-in flow
- **Status:** NOT STARTED

**Task 155: Implement check-in API call**
- **Category:** Networking
- **Description:** Call POST /api/videos/:id/checkin endpoint
- **Steps to Verify:**
  - API call sends correct action type
  - Success response parsed correctly
  - Errors handled and displayed
- **Status:** NOT STARTED

**Task 156: Show confirmation dialog**
- **Category:** UI
- **Description:** Display confirmation before PREVENT_DISTRIBUTION action
- **Steps to Verify:**
  - Dialog explains the action
  - User can confirm or cancel
  - Cancel returns unchanged
- **Status:** NOT STARTED

**Task 157: Update UI after check-in**
- **Category:** UI
- **Description:** Refresh video status display after successful check-in
- **Steps to Verify:**
  - Status updates immediately
  - distribute_at reflects extension
  - Success feedback shown
- **Status:** NOT STARTED

#### 6.3.7 Android Push Notifications

**Task 158: Request notification permissions**
- **Category:** Permissions
- **Description:** Request POST_NOTIFICATIONS permission for Android 13+
- **Steps to Verify:**
  - Permission requested on Android 13+
  - Lower versions work without permission
  - Denied permission handled gracefully
- **Status:** NOT STARTED

**Task 159: Register for FCM**
- **Category:** Push Notifications
- **Description:** Register device for remote notifications via Firebase Cloud Messaging
- **Steps to Verify:**
  - FCM token obtained successfully
  - Token refresh handled
  - Registration errors logged
- **Status:** NOT STARTED

**Task 160: Send FCM token to backend**
- **Category:** Networking
- **Description:** Submit FCM token via PATCH /api/user/settings
- **Steps to Verify:**
  - Token sent after registration
  - Token updates sent when refreshed
  - Backend receives valid token
- **Status:** NOT STARTED

**Task 161: Handle notification tap**
- **Category:** Navigation
- **Description:** Navigate to specific video when notification is tapped
- **Steps to Verify:**
  - Tap opens app to correct video
  - Deep link payload parsed correctly
  - Navigation works from killed state
- **Status:** NOT STARTED

**Task 162: Display notification alerts**
- **Category:** Push Notifications
- **Description:** Show notification badges and alerts properly
- **Steps to Verify:**
  - Notifications appear when app backgrounded
  - Alert content formatted correctly
  - Notifications respect user preferences
- **Status:** NOT STARTED

**Task 163: Create notification channel**
- **Category:** Push Notifications
- **Description:** Set up notification channel for Android 8.0+
- **Steps to Verify:**
  - Channel created on app startup
  - Channel has appropriate importance level
  - User can customize channel in settings
- **Status:** NOT STARTED

#### 6.3.8 Android Settings

**Task 164: Create settings screen UI**
- **Category:** UI
- **Description:** Build settings screen with all user-configurable options
- **Steps to Verify:**
  - Settings screen accessible from main navigation
  - All settings displayed in organized sections
  - UI follows Material Design guidelines
- **Status:** NOT STARTED

**Task 165: Display server endpoint**
- **Category:** UI
- **Description:** Show connected server endpoint (read-only after setup)
- **Steps to Verify:**
  - Server URL displayed
  - Field not editable after login
  - Clear read-only indication
- **Status:** NOT STARTED

**Task 166: Add timer configuration**
- **Category:** Settings
- **Description:** Allow user to configure default distribution timer
- **Steps to Verify:**
  - Current timer value fetched and displayed
  - User can modify timer value
  - Changes saved via PATCH /api/user/settings
- **Status:** NOT STARTED

**Task 167: Show storage quota**
- **Category:** UI
- **Description:** Display storage quota and current usage
- **Steps to Verify:**
  - Quota limit displayed
  - Current usage shown
  - Visual indicator shows usage percentage
- **Status:** NOT STARTED

**Task 168: Add logout functionality**
- **Category:** Authentication
- **Description:** Implement logout with credential clearing
- **Steps to Verify:**
  - Logout button visible
  - Confirmation dialog prevents accidents
  - All credentials and tokens cleared
  - User returned to login screen
- **Status:** NOT STARTED

#### 6.3.9 Android Distribution Recipients

**Task 169: Create recipients screen**
- **Category:** UI
- **Description:** Build recipients management screen
- **Steps to Verify:**
  - Screen accessible from settings/main nav
  - Recipients display in list format
  - Empty state shown when no recipients
- **Status:** NOT STARTED

**Task 170: Fetch recipients**
- **Category:** Networking
- **Description:** Retrieve recipients from GET /api/user/recipients
- **Steps to Verify:**
  - Recipients load on screen appearance
  - Loading state shown
  - Errors handled gracefully
- **Status:** NOT STARTED

**Task 171: Add recipient creation UI**
- **Category:** UI
- **Description:** Build form to add new recipient via POST /api/user/recipients
- **Steps to Verify:**
  - Add button opens recipient form
  - Form accepts email and optional name
  - Success adds recipient to list
- **Status:** NOT STARTED

**Task 172: Add swipe-to-delete**
- **Category:** UI
- **Description:** Enable swipe gesture to delete recipients
- **Steps to Verify:**
  - Swipe reveals delete action
  - Confirmation prevents accidents
  - Recipient removed after delete
- **Status:** NOT STARTED

**Task 173: Validate email addresses**
- **Category:** Validation
- **Description:** Validate email format before submission
- **Steps to Verify:**
  - Invalid emails show error message
  - Valid emails accepted
  - Validation before API call
- **Status:** NOT STARTED

### 6.4 Testing & Documentation

#### 6.4.1 Backend Testing

**Task 174: Set up testing framework**
- **Category:** Testing Infrastructure
- **Description:** Configure Jest or Mocha for backend testing
- **Steps to Verify:**
  - Test runner executes successfully
  - Test scripts added to package.json
  - Coverage reporting configured
- **Status:** NOT STARTED

**Task 175: Write service layer unit tests**
- **Category:** Testing
- **Description:** Create unit tests for all service layer functions
- **Steps to Verify:**
  - All services have test coverage
  - Edge cases are tested
  - Tests pass independently
- **Status:** NOT STARTED

**Task 176: Write API integration tests**
- **Category:** Testing
- **Description:** Create integration tests for all API endpoints
- **Steps to Verify:**
  - All endpoints have test coverage
  - Tests cover success and error cases
  - Authentication scenarios tested
- **Status:** NOT STARTED

**Task 177: Test background jobs**
- **Category:** Testing
- **Description:** Create tests for background job scheduler logic
- **Steps to Verify:**
  - Job logic tested independently
  - Scheduling verified
  - Error handling tested
- **Status:** NOT STARTED

**Task 178: Set up test database**
- **Category:** Testing Infrastructure
- **Description:** Configure test database with fixtures and seed data
- **Steps to Verify:**
  - Test database separate from development
  - Fixtures load correctly
  - Database resets between test runs
- **Status:** NOT STARTED

#### 6.4.2 Mobile Testing

**Task 179: Write ViewModel unit tests**
- **Category:** Testing
- **Description:** Create unit tests for ViewModels and business logic on both platforms
- **Steps to Verify:**
  - iOS ViewModels/ObservableObjects tested
  - Android ViewModels tested
  - Business logic covered
- **Status:** NOT STARTED

**Task 180: Write UI tests**
- **Category:** Testing
- **Description:** Create UI tests for critical flows (login, recording, upload, check-in)
- **Steps to Verify:**
  - Login flow tested end-to-end
  - Recording flow tested
  - Upload flow tested
  - Check-in flow tested
- **Status:** NOT STARTED

**Task 181: Test background uploads**
- **Category:** Testing
- **Description:** Test upload behavior in offline and low connectivity scenarios
- **Steps to Verify:**
  - Uploads queue when offline
  - Uploads resume when connectivity restored
  - Partial uploads handled correctly
- **Status:** NOT STARTED

**Task 182: Test push notifications**
- **Category:** Testing
- **Description:** Verify push notification handling on both platforms
- **Steps to Verify:**
  - Notifications received correctly
  - Tap navigation works
  - Background vs foreground handling tested
- **Status:** NOT STARTED

#### 6.4.3 Documentation

**Task 183: Write API documentation**
- **Category:** Documentation
- **Description:** Create OpenAPI/Swagger specification for all endpoints
- **Steps to Verify:**
  - All endpoints documented
  - Request/response schemas complete
  - Swagger UI accessible for testing
- **Status:** NOT STARTED

**Task 184: Create deployment guide**
- **Category:** Documentation
- **Description:** Write step-by-step backend server deployment guide
- **Steps to Verify:**
  - Prerequisites listed
  - Installation steps complete
  - Configuration options explained
  - Troubleshooting section included
- **Status:** NOT STARTED

**Task 185: Create user manual**
- **Category:** Documentation
- **Description:** Write user manual for mobile applications
- **Steps to Verify:**
  - All features documented
  - Screenshots included
  - Common workflows explained
- **Status:** NOT STARTED

**Task 186: Document system configuration**
- **Category:** Documentation
- **Description:** Document all system configuration options
- **Steps to Verify:**
  - All config keys documented
  - Default values listed
  - Impact of each setting explained
- **Status:** NOT STARTED

**Task 187: Create troubleshooting guide**
- **Category:** Documentation
- **Description:** Write troubleshooting guide for common issues
- **Steps to Verify:**
  - Common errors documented
  - Solutions provided
  - Diagnostic steps included
- **Status:** NOT STARTED

**Task 188: Write README files**
- **Category:** Documentation
- **Description:** Create README files for each repository component
- **Steps to Verify:**
  - Backend README complete
  - iOS README complete
  - Android README complete
  - Quick start instructions included
- **Status:** NOT STARTED

---

## 7. Future Enhancements

The following features are deferred for future releases:

- Email distribution system (requires additional research on SMTP vs third-party services)
- Video preview/playback in mobile apps
- Multiple distribution lists per user
- Custom timer per video (currently uses user default)
- Video transcoding or compression options
- Thumbnail generation
- Recipient video viewing analytics
- End-to-end encryption for video files

---

## 8. Deployment Considerations

### 8.1 Hardware Requirements

- Minimum: 4GB RAM, 2-core CPU, 100GB storage
- Recommended: 8GB RAM, 4-core CPU, 500GB+ storage (NAS)
- Network: Static IP or DDNS with port forwarding

### 8.2 Security

- HTTPS required for production (Let's Encrypt or self-signed certificates)
- Firewall configuration to limit access to necessary ports only
- Regular database backups
- Rate limiting on API endpoints

### 8.3 Monitoring

- Application logs for debugging
- Storage usage monitoring
- Failed job notifications (distribution, notifications, cleanup)

---

## 9. Success Criteria

The project is considered complete when:

- Users can record and upload videos from mobile apps
- Videos are automatically distributed after configured time period
- Users receive daily push notifications for active videos
- Users can prevent distribution via check-in
- Recipients can access distributed videos via public links
- Videos expire and are deleted 7 days after distribution
- Admins can manage users and system configuration
- System runs reliably on modest hardware (mini-PC + NAS)
- All core features have test coverage
- Documentation is complete for deployment and usage