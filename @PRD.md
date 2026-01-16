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

### 6.1 Backend Server Tasks

#### 6.1.1 Project Setup & Infrastructure

1. Initialize Node.js + TypeScript project with proper tsconfig.json
2. Set up Express.js server with basic middleware (cors, helmet, morgan)
3. Configure PostgreSQL connection with Prisma/TypeORM
4. Create database schema migrations for all data models
5. Set up environment variable management (.env, dotenv)
6. Configure file storage path for video uploads (support for mounted NAS)
7. Create Docker/docker-compose configuration for development
8. Set up logging framework (winston or pino)

#### 6.1.2 Authentication System

1. Implement user model with password hashing (bcrypt)
2. Set up Passport.js with JWT strategy
3. Implement POST /api/auth/login endpoint
4. Implement POST /api/auth/refresh endpoint
5. Create authentication middleware for protected routes
6. Create admin authorization middleware
7. Write unit tests for authentication logic

#### 6.1.3 Video Upload & Storage

1. Configure Multer for multipart/form-data handling
2. Implement POST /api/videos/upload endpoint with authentication
3. Add file size validation and storage quota checks
4. Generate public token (UUID) for each uploaded video
5. Auto-generate video titles with timestamp (and optional location if provided)
6. Update user storage_used_bytes on successful upload
7. Calculate distribute_at timestamp based on user's default_timer_days
8. Implement cleanup logic for failed uploads
9. Write integration tests for upload endpoint

#### 6.1.4 Video Management Endpoints

1. Implement GET /api/videos (list with pagination and filtering)
2. Implement GET /api/videos/:id (single video metadata)
3. Implement PATCH /api/videos/:id (update title)
4. Implement DELETE /api/videos/:id (delete video and update storage)
5. Add ownership validation to all video endpoints
6. Write unit tests for video management endpoints

#### 6.1.5 Check-In System

1. Create CheckIn data model and migration
2. Implement POST /api/videos/:id/checkin endpoint
3. Handle PREVENT_DISTRIBUTION action (set status, potentially update distribute_at)
4. Handle ALLOW_DISTRIBUTION action (undo prevention if applicable)
5. Log all check-in actions to CheckIn table
6. Write unit tests for check-in logic

#### 6.1.6 Public Video Access

1. Implement GET /api/public/videos/:token endpoint (no auth)
2. Validate that video status is DISTRIBUTED before serving
3. Stream video file with proper Content-Type headers
4. Handle range requests for video seeking
5. Add rate limiting to prevent abuse
6. Write integration tests for public access

#### 6.1.7 User Settings & Recipients

1. Implement GET /api/user/settings endpoint
2. Implement PATCH /api/user/settings endpoint
3. Implement GET /api/user/recipients endpoint
4. Implement POST /api/user/recipients endpoint (with email validation)
5. Implement DELETE /api/user/recipients/:id endpoint
6. Add validation to ensure recipients belong to current user
7. Write unit tests for settings and recipients

#### 6.1.8 Admin Endpoints

1. Implement POST /api/admin/users (create user)
2. Implement GET /api/admin/users (list all users)
3. Implement PATCH /api/admin/users/:id (update user properties)
4. Implement DELETE /api/admin/users/:id (delete user and cascade videos)
5. Implement GET /api/admin/config (get system config)
6. Implement PATCH /api/admin/config (update system config)
7. Create seed script for initial admin user
8. Write integration tests for admin endpoints

#### 6.1.9 Background Job Scheduler

1. Set up job scheduler (node-cron or Bull with Redis)
2. Create distribution job (runs every hour or on schedule)
   - Query videos where distribute_at <= now() and status = ACTIVE
   - Mark videos as DISTRIBUTED
   - Calculate expires_at (7 days from distribution)
   - Trigger email sending (future implementation)
3. Create push notification job (runs daily at configured time)
   - Query all ACTIVE videos
   - Send FCM notification to each video owner
4. Create expiration cleanup job (runs daily)
   - Query videos where expires_at <= now() and status = DISTRIBUTED
   - Delete video files from storage
   - Update video status to EXPIRED
   - Update user storage_used_bytes
5. Add job error handling and retry logic
6. Write tests for job scheduler logic

#### 6.1.10 Push Notifications

1. Set up Firebase Admin SDK
2. Create notification service for FCM message sending
3. Implement per-video check-in reminder notifications
4. Create notification templates with video title and distribute_at
5. Add notification payload for deep linking to specific videos
6. Handle FCM token updates from mobile apps
7. Write tests for notification service

#### 6.1.11 Admin Web Interface (Future)

Note: Email distribution configuration will be deferred pending additional research. The admin interface should be designed to accommodate future email settings.

1. Create basic HTML/CSS admin dashboard template
2. Implement admin login page
3. Create user management UI (list, create, edit, delete users)
4. Create system config UI (edit default storage quota, notification times, etc.)
5. Add system stats dashboard (total users, total videos, storage usage)
6. Serve admin interface from Express (e.g., /admin/* routes)

### 6.2 Mobile App Tasks (iOS)

#### 6.2.1 iOS Project Setup

1. Create iOS project in Xcode with SwiftUI
2. Configure project for iOS 15+ deployment target
3. Add Firebase SDK for push notifications
4. Set up Info.plist permissions (camera, microphone, notifications)
5. Configure keychain for secure credential storage

#### 6.2.2 iOS Authentication

1. Create login screen UI (server endpoint, username, password)
2. Implement API service for authentication (URLSession)
3. Store JWT token securely in Keychain
4. Implement token refresh logic
5. Create authentication state management (Combine or ObservableObject)

#### 6.2.3 iOS Video Recording

1. Create camera view using AVFoundation
2. Implement video recording start/stop controls
3. Save recorded video to temporary storage
4. Add camera permission handling
5. Display recording timer and file size estimate

#### 6.2.4 iOS Video Upload

1. Create upload service using URLSession background configuration
2. Implement multipart/form-data upload to POST /api/videos/upload
3. Add upload progress tracking
4. Handle upload errors and retry logic
5. Support background upload when app is not active
6. Prompt user to optionally title video after recording
7. Auto-generate title based on date/location if user skips
8. Clean up temporary video file after successful upload

#### 6.2.5 iOS Video List & Management

1. Create video list screen UI (SwiftUI List)
2. Fetch videos from GET /api/videos endpoint
3. Display video title, status, and distribute_at timestamp
4. Implement pull-to-refresh
5. Add swipe actions for delete
6. Create video detail view with metadata

#### 6.2.6 iOS Check-In Functionality

1. Add check-in button in video detail view
2. Implement POST /api/videos/:id/checkin API call
3. Show confirmation dialog for PREVENT_DISTRIBUTION action
4. Update UI to reflect new video status after check-in

#### 6.2.7 iOS Push Notifications

1. Request notification permissions on first launch
2. Register for remote notifications via FCM
3. Send FCM token to backend (PATCH /api/user/settings)
4. Handle notification tap to navigate to specific video
5. Display notification badges/alerts

#### 6.2.8 iOS Settings

1. Create settings screen UI
2. Display server endpoint (read-only after initial setup)
3. Add default timer configuration (GET/PATCH /api/user/settings)
4. Show storage quota and usage
5. Add logout functionality

#### 6.2.9 iOS Distribution Recipients

1. Create recipients management screen
2. Fetch recipients from GET /api/user/recipients
3. Add UI to create new recipient (POST /api/user/recipients)
4. Add swipe-to-delete for recipients (DELETE /api/user/recipients/:id)
5. Validate email addresses before submission

### 6.3 Mobile App Tasks (Android)

#### 6.3.1 Android Project Setup

1. Create Android project in Android Studio with Jetpack Compose
2. Configure project for API 26+ (Android 8.0+)
3. Add Firebase SDK for push notifications
4. Configure AndroidManifest.xml permissions (camera, storage, notifications)
5. Set up EncryptedSharedPreferences for secure credential storage

#### 6.3.2 Android Authentication

1. Create login screen UI (Jetpack Compose)
2. Implement API service using Retrofit + OkHttp
3. Store JWT token in EncryptedSharedPreferences
4. Implement token refresh logic
5. Create authentication state management (ViewModel)

#### 6.3.3 Android Video Recording

1. Create camera view using CameraX
2. Implement video recording start/stop controls
3. Save recorded video to app-specific storage
4. Add runtime camera permission handling
5. Display recording timer and file size estimate

#### 6.3.4 Android Video Upload

1. Create upload service using WorkManager for background upload
2. Implement multipart/form-data upload using Retrofit
3. Add upload progress tracking
4. Handle upload errors and retry logic with WorkManager constraints
5. Support background upload with foreground service notification
6. Prompt user to optionally title video after recording
7. Auto-generate title based on date/location if user skips
8. Clean up temporary video file after successful upload

#### 6.3.5 Android Video List & Management

1. Create video list screen UI (Jetpack Compose LazyColumn)
2. Fetch videos from GET /api/videos endpoint
3. Display video title, status, and distribute_at timestamp
4. Implement pull-to-refresh (SwipeRefresh)
5. Add swipe actions for delete
6. Create video detail view with metadata

#### 6.3.6 Android Check-In Functionality

1. Add check-in button in video detail view
2. Implement POST /api/videos/:id/checkin API call
3. Show confirmation dialog for PREVENT_DISTRIBUTION action
4. Update UI to reflect new video status after check-in

#### 6.3.7 Android Push Notifications

1. Request notification permissions (Android 13+)
2. Register for remote notifications via FCM
3. Send FCM token to backend (PATCH /api/user/settings)
4. Handle notification tap to navigate to specific video
5. Display notification badges/alerts
6. Create notification channel

#### 6.3.8 Android Settings

1. Create settings screen UI
2. Display server endpoint (read-only after initial setup)
3. Add default timer configuration (GET/PATCH /api/user/settings)
4. Show storage quota and usage
5. Add logout functionality

#### 6.3.9 Android Distribution Recipients

1. Create recipients management screen
2. Fetch recipients from GET /api/user/recipients
3. Add UI to create new recipient (POST /api/user/recipients)
4. Add swipe-to-delete for recipients (DELETE /api/user/recipients/:id)
5. Validate email addresses before submission

### 6.4 Testing & Documentation

#### 6.4.1 Backend Testing

1. Set up Jest or Mocha testing framework
2. Write unit tests for all service layer functions
3. Write integration tests for all API endpoints
4. Test background job scheduler independently
5. Set up test database with fixtures

#### 6.4.2 Mobile Testing

1. Write unit tests for ViewModels/business logic (both platforms)
2. Write UI tests for critical flows (login, recording, upload, check-in)
3. Test background upload scenarios (offline, low connectivity)
4. Test push notification handling on both platforms

#### 6.4.3 Documentation

1. Write API documentation (OpenAPI/Swagger spec)
2. Create deployment guide for backend server
3. Create user manual for mobile apps
4. Document system configuration options
5. Create troubleshooting guide
6. Write README files for each repository component

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