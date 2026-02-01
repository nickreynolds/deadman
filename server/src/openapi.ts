// OpenAPI 3.0 specification for Deadman's Drop API

export const openApiSpec = {
  openapi: '3.0.3',
  info: {
    title: "Deadman's Drop API",
    description:
      'Self-hosted video recording and dead man\'s switch distribution system. Users record videos on mobile devices, which are automatically uploaded to a private server. Unless prevented by the user via check-in, videos are automatically distributed to predefined recipients after a configurable time period.',
    version: '1.0.0',
    contact: {
      name: "Deadman's Drop",
    },
  },
  servers: [
    {
      url: '/api',
      description: 'API base path',
    },
  ],
  tags: [
    { name: 'Auth', description: 'Authentication endpoints' },
    { name: 'Videos', description: 'Video upload and management' },
    { name: 'Check-In', description: 'Dead man\'s switch check-in actions' },
    { name: 'Public', description: 'Public video access (no authentication)' },
    { name: 'User Settings', description: 'User settings and preferences' },
    { name: 'Recipients', description: 'Distribution recipient management' },
    { name: 'Admin Users', description: 'Admin user management' },
    { name: 'Admin Config', description: 'Admin system configuration' },
    { name: 'Admin Stats', description: 'Admin system statistics' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'JWT token obtained from POST /api/auth/login',
      },
    },
    schemas: {
      Error: {
        type: 'object',
        properties: {
          error: { type: 'string', description: 'Error message' },
          message: { type: 'string', description: 'Detailed error description' },
        },
        required: ['error'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'User ID' },
          username: { type: 'string', description: 'Unique username' },
          is_admin: { type: 'boolean', description: 'Admin privileges flag' },
        },
        required: ['id', 'username', 'is_admin'],
      },
      AdminUser: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'User ID' },
          username: { type: 'string', description: 'Unique username' },
          is_admin: { type: 'boolean', description: 'Admin privileges flag' },
          storage_quota_bytes: { type: 'string', description: 'Storage quota in bytes (as string for BigInt)' },
          storage_used_bytes: { type: 'string', description: 'Storage used in bytes (as string for BigInt)' },
          created_at: { type: 'string', format: 'date-time', description: 'Account creation timestamp' },
        },
        required: ['id', 'username', 'is_admin', 'storage_quota_bytes', 'storage_used_bytes', 'created_at'],
      },
      Video: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Video ID' },
          title: { type: 'string', description: 'Video title' },
          file_size_bytes: { type: 'string', description: 'File size in bytes (as string for BigInt)' },
          mime_type: { type: 'string', description: 'Video MIME type (e.g., video/mp4)' },
          status: {
            type: 'string',
            enum: ['PENDING', 'ACTIVE', 'DISTRIBUTED', 'EXPIRED'],
            description: 'Video status',
          },
          distribute_at: { type: 'string', format: 'date-time', description: 'Scheduled distribution time' },
          distributed_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: 'Actual distribution time (null if not yet distributed)',
          },
          expires_at: {
            type: 'string',
            format: 'date-time',
            nullable: true,
            description: '7 days after distribution (null if not yet distributed)',
          },
          public_token: { type: 'string', format: 'uuid', description: 'Public access token for unauthenticated viewing' },
          created_at: { type: 'string', format: 'date-time', description: 'Upload timestamp' },
          updated_at: { type: 'string', format: 'date-time', description: 'Last update timestamp' },
        },
        required: [
          'id', 'title', 'file_size_bytes', 'mime_type', 'status',
          'distribute_at', 'public_token', 'created_at', 'updated_at',
        ],
      },
      CheckIn: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Check-in record ID' },
          video_id: { type: 'string', format: 'uuid', description: 'Associated video ID' },
          action: {
            type: 'string',
            enum: ['PREVENT_DISTRIBUTION', 'ALLOW_DISTRIBUTION'],
            description: 'Check-in action taken',
          },
          created_at: { type: 'string', format: 'date-time', description: 'Check-in timestamp' },
        },
        required: ['id', 'video_id', 'action', 'created_at'],
      },
      Recipient: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid', description: 'Recipient ID' },
          email: { type: 'string', format: 'email', description: 'Recipient email address' },
          name: { type: 'string', nullable: true, description: 'Optional recipient name' },
        },
        required: ['id', 'email'],
      },
      UserSettings: {
        type: 'object',
        properties: {
          default_timer_days: { type: 'integer', description: 'Default distribution timer in days' },
          storage_quota_bytes: { type: 'string', description: 'Storage quota in bytes (as string for BigInt)' },
          storage_used_bytes: { type: 'string', description: 'Current storage usage in bytes (as string for BigInt)' },
          fcm_token: { type: 'string', nullable: true, description: 'Firebase Cloud Messaging token' },
        },
        required: ['default_timer_days', 'storage_quota_bytes', 'storage_used_bytes'],
      },
      SystemStats: {
        type: 'object',
        properties: {
          total_users: { type: 'integer' },
          total_videos: { type: 'integer' },
          active_videos: { type: 'integer' },
          distributed_videos: { type: 'integer' },
          pending_videos: { type: 'integer' },
          expired_videos: { type: 'integer' },
          total_storage_used_bytes: { type: 'string' },
          total_storage_quota_bytes: { type: 'string' },
          recent_uploads: { type: 'array', items: { type: 'object' } },
          recent_distributions: { type: 'array', items: { type: 'object' } },
        },
      },
    },
  },
  paths: {
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Login',
        description: 'Authenticate user with username and password. Returns a JWT token.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: { type: 'string', description: 'Username' },
                  password: { type: 'string', description: 'Password' },
                },
                required: ['username', 'password'],
              },
              example: {
                username: 'johndoe',
                password: 'securepassword',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Authentication successful',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'JWT token' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                  required: ['token', 'user'],
                },
              },
            },
          },
          '400': {
            description: 'Missing required fields',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Invalid credentials',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Refresh token',
        description: 'Refresh an existing JWT token. Returns a new token with fresh expiration.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  token: { type: 'string', description: 'Current JWT token' },
                },
                required: ['token'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Token refreshed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    token: { type: 'string', description: 'New JWT token' },
                  },
                  required: ['token'],
                },
              },
            },
          },
          '400': {
            description: 'Missing token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Invalid or expired token',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/videos/upload': {
      post: {
        tags: ['Videos'],
        summary: 'Upload video',
        description:
          'Upload a video file. The video is stored on the server and scheduled for distribution based on the user\'s default timer setting. Requires authentication.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  video: { type: 'string', format: 'binary', description: 'Video file' },
                  title: { type: 'string', description: 'Optional video title (auto-generated if empty)' },
                  location: { type: 'string', description: 'Optional location for auto-generated title' },
                },
                required: ['video'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Video uploaded successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    video: { $ref: '#/components/schemas/Video' },
                  },
                  required: ['video'],
                },
              },
            },
          },
          '400': {
            description: 'No file uploaded or invalid file',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '413': {
            description: 'File too large or storage quota exceeded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    message: { type: 'string' },
                    file_size_bytes: { type: 'string' },
                    quota_bytes: { type: 'string' },
                    used_bytes: { type: 'string' },
                    remaining_bytes: { type: 'string' },
                  },
                  required: ['error'],
                },
              },
            },
          },
        },
      },
    },
    '/videos': {
      get: {
        tags: ['Videos'],
        summary: 'List videos',
        description: "List the authenticated user's videos with optional pagination and status filtering.",
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'status',
            in: 'query',
            schema: { type: 'string', enum: ['PENDING', 'ACTIVE', 'DISTRIBUTED', 'EXPIRED'] },
            description: 'Filter by video status',
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50, minimum: 1, maximum: 100 },
            description: 'Maximum number of videos to return',
          },
          {
            name: 'offset',
            in: 'query',
            schema: { type: 'integer', default: 0, minimum: 0 },
            description: 'Number of videos to skip for pagination',
          },
        ],
        responses: {
          '200': {
            description: 'List of videos',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    videos: { type: 'array', items: { $ref: '#/components/schemas/Video' } },
                    total: { type: 'integer', description: 'Total number of matching videos' },
                  },
                  required: ['videos', 'total'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid query parameters',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/videos/{id}': {
      get: {
        tags: ['Videos'],
        summary: 'Get video',
        description: 'Get metadata for a specific video. The user must own the video.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Video ID',
          },
        ],
        responses: {
          '200': {
            description: 'Video metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { video: { $ref: '#/components/schemas/Video' } },
                  required: ['video'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Video owned by another user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Video not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      patch: {
        tags: ['Videos'],
        summary: 'Update video',
        description: 'Update video metadata (currently only title). The user must own the video.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Video ID',
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', description: 'New video title' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated video metadata',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { video: { $ref: '#/components/schemas/Video' } },
                  required: ['video'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Video owned by another user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Video not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Videos'],
        summary: 'Delete video',
        description: 'Delete a video and free up storage. The user must own the video. Also removes the video file from disk.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Video ID',
          },
        ],
        responses: {
          '200': {
            description: 'Video deleted successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { success: { type: 'boolean', example: true } },
                  required: ['success'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Video owned by another user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Video not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/videos/{id}/checkin': {
      post: {
        tags: ['Check-In'],
        summary: 'Perform check-in',
        description:
          'Perform a check-in action on a video. PREVENT_DISTRIBUTION resets the distribution timer. ALLOW_DISTRIBUTION reverses a prevention. Only works on ACTIVE videos.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Video ID',
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  action: {
                    type: 'string',
                    enum: ['PREVENT_DISTRIBUTION', 'ALLOW_DISTRIBUTION'],
                    description: 'Check-in action to perform',
                  },
                },
                required: ['action'],
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Check-in performed successfully',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    video: { $ref: '#/components/schemas/Video' },
                    checkin: { $ref: '#/components/schemas/CheckIn' },
                  },
                  required: ['video', 'checkin'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid action',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Video owned by another user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Video not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Video is not in a valid state for check-in (must be ACTIVE)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/public/videos/{token}': {
      get: {
        tags: ['Public'],
        summary: 'Access distributed video',
        description:
          'Download or stream a distributed video using its public token. No authentication required. Supports HTTP Range requests for seeking. Rate limited to 100 requests per 15 minutes per IP.',
        parameters: [
          {
            name: 'token',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Public access token for the video',
          },
          {
            name: 'Range',
            in: 'header',
            schema: { type: 'string', example: 'bytes=0-1023' },
            description: 'HTTP Range header for partial content requests (video seeking)',
          },
        ],
        responses: {
          '200': {
            description: 'Full video file',
            headers: {
              'Content-Type': { schema: { type: 'string' }, description: 'Video MIME type' },
              'Content-Length': { schema: { type: 'integer' }, description: 'File size in bytes' },
              'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
              'Content-Disposition': { schema: { type: 'string' } },
            },
            content: {
              'video/*': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '206': {
            description: 'Partial video content (range request)',
            headers: {
              'Content-Type': { schema: { type: 'string' } },
              'Content-Length': { schema: { type: 'integer' } },
              'Content-Range': { schema: { type: 'string', example: 'bytes 0-1023/1048576' } },
              'Accept-Ranges': { schema: { type: 'string', example: 'bytes' } },
            },
            content: {
              'video/*': { schema: { type: 'string', format: 'binary' } },
            },
          },
          '404': {
            description: 'Video not found or not yet distributed',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '410': {
            description: 'Video has expired',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '416': {
            description: 'Range not satisfiable',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '429': {
            description: 'Rate limit exceeded',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    error: { type: 'string' },
                    retryAfter: { type: 'number', description: 'Seconds until rate limit resets' },
                  },
                },
              },
            },
          },
        },
      },
    },
    '/user/settings': {
      get: {
        tags: ['User Settings'],
        summary: 'Get settings',
        description: 'Get current user settings including timer, storage quota, and FCM token.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'User settings',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UserSettings' },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      patch: {
        tags: ['User Settings'],
        summary: 'Update settings',
        description: 'Update user settings. Only provided fields are updated.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  default_timer_days: {
                    type: 'integer',
                    minimum: 1,
                    maximum: 365,
                    description: 'Default distribution timer in days',
                  },
                  fcm_token: {
                    type: 'string',
                    nullable: true,
                    description: 'Firebase Cloud Messaging token',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated settings',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { settings: { $ref: '#/components/schemas/UserSettings' } },
                  required: ['settings'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/user/recipients': {
      get: {
        tags: ['Recipients'],
        summary: 'List recipients',
        description: "Get the authenticated user's distribution recipients.",
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of recipients',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    recipients: { type: 'array', items: { $ref: '#/components/schemas/Recipient' } },
                  },
                  required: ['recipients'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      post: {
        tags: ['Recipients'],
        summary: 'Add recipient',
        description: 'Add a new distribution recipient. Email must be unique per user.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  email: { type: 'string', format: 'email', description: 'Recipient email address' },
                  name: { type: 'string', description: 'Optional recipient name' },
                },
                required: ['email'],
              },
              example: {
                email: 'recipient@example.com',
                name: 'John Doe',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Recipient created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { recipient: { $ref: '#/components/schemas/Recipient' } },
                  required: ['recipient'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid email format',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Recipient with this email already exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/user/recipients/{id}': {
      delete: {
        tags: ['Recipients'],
        summary: 'Delete recipient',
        description: 'Remove a distribution recipient. The user must own the recipient.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'Recipient ID',
          },
        ],
        responses: {
          '200': {
            description: 'Recipient deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { success: { type: 'boolean', example: true } },
                  required: ['success'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Recipient belongs to another user',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'Recipient not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/users': {
      post: {
        tags: ['Admin Users'],
        summary: 'Create user',
        description: 'Create a new user. Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: {
                    type: 'string',
                    minLength: 3,
                    maxLength: 50,
                    description: 'Unique username',
                  },
                  password: {
                    type: 'string',
                    minLength: 8,
                    description: 'Password (minimum 8 characters)',
                  },
                  is_admin: {
                    type: 'boolean',
                    default: false,
                    description: 'Admin privileges flag',
                  },
                  storage_quota_bytes: {
                    type: 'number',
                    description: 'Storage quota in bytes (optional, uses system default)',
                  },
                },
                required: ['username', 'password'],
              },
              example: {
                username: 'newuser',
                password: 'securepassword',
                is_admin: false,
                storage_quota_bytes: 1073741824,
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User created',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/AdminUser' } },
                  required: ['user'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '409': {
            description: 'Username already exists',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      get: {
        tags: ['Admin Users'],
        summary: 'List all users',
        description: 'List all users in the system. Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'List of all users',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    users: { type: 'array', items: { $ref: '#/components/schemas/AdminUser' } },
                  },
                  required: ['users'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/users/{id}': {
      patch: {
        tags: ['Admin Users'],
        summary: 'Update user',
        description: 'Update user properties (admin flag, storage quota). Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'User ID',
          },
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  is_admin: { type: 'boolean', description: 'Admin privileges flag' },
                  storage_quota_bytes: { type: 'number', description: 'Storage quota in bytes' },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated user',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { user: { $ref: '#/components/schemas/AdminUser' } },
                  required: ['user'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'User not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      delete: {
        tags: ['Admin Users'],
        summary: 'Delete user',
        description: 'Delete a user and all associated data (videos, recipients, check-ins). Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
            description: 'User ID',
          },
        ],
        responses: {
          '200': {
            description: 'User deleted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { success: { type: 'boolean', example: true } },
                  required: ['success'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '404': {
            description: 'User not found',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/config': {
      get: {
        tags: ['Admin Config'],
        summary: 'Get system config',
        description: 'Get all system configuration key-value pairs. Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'System configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    config: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      description: 'Configuration key-value pairs',
                    },
                  },
                  required: ['config'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
      patch: {
        tags: ['Admin Config'],
        summary: 'Update system config',
        description: 'Update system configuration values. All values must be strings. Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description: 'Configuration key-value pairs to update',
              },
              example: {
                default_storage_quota_bytes: '1073741824',
                notification_time_utc: '09:00',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Updated configuration',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    config: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                    },
                  },
                  required: ['config'],
                },
              },
            },
          },
          '400': {
            description: 'Invalid request body (values must be strings)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
    '/admin/stats': {
      get: {
        tags: ['Admin Stats'],
        summary: 'Get system statistics',
        description:
          'Get system-wide statistics including user counts, video counts by status, storage usage, and recent activity. Requires admin privileges.',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'System statistics',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { stats: { $ref: '#/components/schemas/SystemStats' } },
                  required: ['stats'],
                },
              },
            },
          },
          '401': {
            description: 'Not authenticated',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
          '403': {
            description: 'Not an admin',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
          },
        },
      },
    },
  },
};
