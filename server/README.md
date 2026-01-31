# Deadman's Drop Server

Self-hosted video recording and dead man's switch distribution system. Node.js + TypeScript + Express backend with PostgreSQL, handling authentication, video uploads, background job scheduling, and admin operations.

## Development Setup

### Prerequisites

- **Node.js** 20+ (LTS recommended)
- **pnpm** (package manager)
- **Docker Desktop** – for running PostgreSQL locally

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Environment Variables

Create a `.env` file in the server directory. Copy from `.env.example` if available, or create one with:

**Required:**

| Variable       | Description                           | Example (dev)                                            |
|----------------|---------------------------------------|----------------------------------------------------------|
| `DATABASE_URL` | PostgreSQL connection string          | `postgresql://postgres:postgres@localhost:5432/deadmans_drop` |
| `JWT_SECRET`   | Secret for signing JWT tokens         | `your-dev-secret-min-32-chars`                           |

**Optional (with defaults):**

| Variable           | Description                | Default       |
|--------------------|----------------------------|---------------|
| `PORT`             | Server port                | `3000`        |
| `NODE_ENV`         | Environment                | `development` |
| `JWT_EXPIRES_IN`   | JWT expiry                 | `7d`          |
| `STORAGE_PATH`     | Directory for uploads      | `./uploads`   |
| `MAX_FILE_SIZE_MB` | Max upload size (MB)       | `500`         |
| `BCRYPT_ROUNDS`    | bcrypt cost factor         | `12`          |

**For push notifications (optional):**

| Variable                  | Description                    |
|---------------------------|--------------------------------|
| `FIREBASE_PROJECT_ID`     | Firebase project ID            |
| `FIREBASE_PRIVATE_KEY`    | Firebase service account key   |
| `FIREBASE_CLIENT_EMAIL`   | Firebase service account email |

### 3. Start the Database

Using Docker Desktop, start the dev PostgreSQL container:

```bash
pnpm dev:db
```

This runs `docker compose -f docker-compose.dev.yml up -d` and starts PostgreSQL 15 on port 5432 with:

- User: `postgres`
- Password: `postgres`
- Database: `deadmans_drop`

### 4. Run Migrations

```bash
pnpm prisma migrate deploy
```

For development, you can also use `pnpm prisma migrate dev` if you need to create new migrations.

### 5. Seed the Admin User

Create the initial admin account (idempotent – safe to run multiple times):

```bash
ADMIN_PASSWORD=your-secure-password pnpm seed:admin
```

Or set `ADMIN_PASSWORD` (and optionally `ADMIN_USERNAME`) in `.env` and run:

```bash
pnpm seed:admin
```

`ADMIN_PASSWORD` must be at least 8 characters.

### 6. Start the Server

```bash
pnpm dev
```

The API runs at `http://localhost:3000`. Health check: `GET /health`.

---

## Production Deployment

### Option A: Docker Compose

The repo includes a production-style `docker-compose.yml` that runs both PostgreSQL and the app:

```bash
# Start the database first
docker compose up -d db

# Run migrations (from host, with DATABASE_URL=postgresql://postgres:postgres@localhost:5432/deadmans_drop)
pnpm prisma migrate deploy

# Seed admin if needed
ADMIN_PASSWORD=your-secure-password pnpm seed:admin

# Start all services (or just: docker compose up -d)
docker compose up -d

# View logs
docker compose logs -f app
```

The app container uses environment variables from the compose file. Override them for production:

- Set `JWT_SECRET` to a strong random value
- Set `NODE_ENV=production`
- Use a managed PostgreSQL instance or configure `DATABASE_URL` for your setup
- Mount a volume for `STORAGE_PATH` if you need persistent uploads outside the container

### Option B: Manual / Traditional Hosting

1. **PostgreSQL** – Run PostgreSQL 15+ and create a database.

2. **Environment** – Set the required variables (see above). In production, ensure:
   - `JWT_SECRET` is a long, random, unique value
   - `NODE_ENV=production`
   - `DATABASE_URL` points to your production database

3. **Build and run:**

   ```bash
   pnpm install
   pnpm prisma generate
   pnpm prisma migrate deploy
   pnpm build
   pnpm start
   ```

4. **Seed admin** (first time only):

   ```bash
   ADMIN_PASSWORD=your-secure-password pnpm seed:admin
   ```

5. **Process manager** – Use a process manager (systemd, PM2, etc.) to keep the server running and restart on failure.

### Option C: Docker Only (App Container)

Build and run just the app container (with an external database):

```bash
docker build -t deadmans-drop-server .
docker run -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/deadmans_drop \
  -e JWT_SECRET=your-production-secret \
  -e NODE_ENV=production \
  -v uploads_data:/app/uploads \
  deadmans-drop-server
```

---

## API Overview

| Base Path    | Description                      |
|-------------|-----------------------------------|
| `/api/auth` | Login, token refresh              |
| `/api/videos` | Video upload, list, manage      |
| `/api/public` | Public video links (no auth)    |
| `/api/user` | User profile, recipients          |
| `/api/admin` | Admin operations                 |

A Postman collection is available in `postman/`.

---

## Useful Commands

| Command             | Description                          |
|---------------------|--------------------------------------|
| `pnpm dev`          | Start dev server (hot reload)        |
| `pnpm dev:db`       | Start PostgreSQL via Docker          |
| `pnpm build`        | Compile TypeScript                   |
| `pnpm start`        | Run compiled app                     |
| `pnpm seed:admin`   | Create/verify admin user             |
| `pnpm test`         | Run tests                            |
| `pnpm lint`         | Run ESLint                           |
