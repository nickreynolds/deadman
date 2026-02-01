# Deployment Guide

Step-by-step guide for deploying the Deadman's Drop backend server in a production environment.

---

## Prerequisites

### Hardware

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| RAM | 4 GB | 8 GB+ |
| CPU | 2 cores | 4 cores |
| Storage | 100 GB | 500 GB+ (NAS) |

Typical target hardware: Intel NUC, Mac Mini, or similar mini-PC with a network-attached storage device for video files.

### Software

- **Node.js** 20+ LTS
- **pnpm** (package manager) -- install via `corepack enable && corepack prepare pnpm@latest --activate`
- **PostgreSQL** 15+
- **Docker** (optional, for containerized deployment)
- **A process manager** such as systemd or PM2 (for non-Docker deployments)

### Network

- Static IP address or Dynamic DNS (DDNS) for mobile app connectivity
- Port forwarding for the application port (default 3000)
- A domain name is recommended for TLS certificate provisioning

---

## Deployment Options

Choose one of the three deployment methods below.

### Option A: Docker Compose (Recommended)

This runs both PostgreSQL and the application server in containers.

**1. Clone the repository and navigate to the server directory:**

```bash
cd server
```

**2. Create the environment file:**

```bash
cp .env.example .env
```

Edit `.env` and set production values (see [Configuration Reference](#configuration-reference) below). At minimum:

```
NODE_ENV=production
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@db:5432/deadmans_drop
JWT_SECRET=YOUR_SECURE_RANDOM_SECRET
```

**3. Update docker-compose.yml credentials:**

Edit `docker-compose.yml` and change the default PostgreSQL password from `postgres` to a strong password. Update `DATABASE_URL` in the app service to match.

**4. Start the database:**

```bash
docker compose up -d db
```

Wait for it to become healthy:

```bash
docker compose ps
```

**5. Run database migrations:**

```bash
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@localhost:5432/deadmans_drop \
  pnpm prisma migrate deploy
```

**6. Seed the admin user:**

```bash
DATABASE_URL=postgresql://postgres:YOUR_DB_PASSWORD@localhost:5432/deadmans_drop \
  ADMIN_PASSWORD=your-secure-admin-password \
  pnpm seed:admin
```

**7. Start the full stack:**

```bash
docker compose up -d
```

**8. Verify the deployment:**

```bash
curl http://localhost:3000/health
```

View logs:

```bash
docker compose logs -f app
```

---

### Option B: Manual Deployment (No Docker)

Run the application directly on the host operating system.

**1. Install PostgreSQL 15+ and create a database:**

```bash
sudo -u postgres createdb deadmans_drop
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your-db-password';"
```

**2. Clone the repository and install dependencies:**

```bash
cd server
pnpm install
```

**3. Create the environment file:**

```bash
cp .env.example .env
```

Edit `.env` and set production values (see [Configuration Reference](#configuration-reference)).

**4. Generate Prisma client and run migrations:**

```bash
pnpm prisma generate
pnpm prisma migrate deploy
```

**5. Build the application:**

```bash
pnpm build
```

This also builds the admin dashboard React SPA (`pnpm build:admin` is run automatically).

**6. Seed the admin user:**

```bash
ADMIN_PASSWORD=your-secure-admin-password pnpm seed:admin
```

**7. Start the server:**

```bash
pnpm start
```

**8. Set up a process manager:**

Using **systemd** (create `/etc/systemd/system/deadmans-drop.service`):

```ini
[Unit]
Description=Deadman's Drop Server
After=network.target postgresql.service

[Service]
Type=simple
User=deadman
WorkingDirectory=/opt/deadmans-drop/server
EnvironmentFile=/opt/deadmans-drop/server/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable deadmans-drop
sudo systemctl start deadmans-drop
```

Using **PM2**:

```bash
pm2 start dist/index.js --name deadmans-drop
pm2 save
pm2 startup
```

---

### Option C: Docker Only (App Container with External Database)

Run just the application in Docker while using a separate PostgreSQL instance.

```bash
docker build -t deadmans-drop-server .

docker run -d \
  --name deadmans-drop \
  -p 3000:3000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/deadmans_drop \
  -e JWT_SECRET=your-production-secret \
  -e NODE_ENV=production \
  -v uploads_data:/app/uploads \
  --restart unless-stopped \
  deadmans-drop-server
```

The Docker image runs as a non-root user (`deadman:1001`) and includes a health check at `/health`.

---

## Configuration Reference

All configuration is done via environment variables. Create a `.env` file or set them in your deployment environment.

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:pass@localhost:5432/deadmans_drop` |
| `JWT_SECRET` | Secret for signing JWT tokens. Generate with `openssl rand -base64 64` | (random string) |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server listening port |
| `NODE_ENV` | `development` | Set to `production` for production deployments |
| `JWT_EXPIRES_IN` | `7d` | JWT token expiration (e.g. `1h`, `7d`, `30d`) |
| `STORAGE_PATH` | `./uploads` | Directory for uploaded videos. Supports absolute paths (e.g. `/mnt/nas/videos`) |
| `MAX_FILE_SIZE_MB` | `500` | Maximum upload file size in megabytes |
| `BCRYPT_ROUNDS` | `12` | bcrypt cost factor for password hashing (10-14) |
| `LOG_LEVEL` | `info` (prod) / `debug` (dev) | Log level: `trace`, `debug`, `info`, `warn`, `error`, `fatal`, `silent` |
| `LOG_PRETTY` | `false` (prod) | Pretty-print logs. Set `true` for human-readable output |
| `LOG_FILE` | (none) | Path to write log files (JSON format). E.g. `/var/log/deadmans-drop/server.log` |

### Firebase Push Notifications (Optional)

Required only if you want mobile push notifications.

| Variable | Description |
|----------|-------------|
| `FIREBASE_PROJECT_ID` | Firebase project ID |
| `FIREBASE_PRIVATE_KEY` | Service account private key (replace newlines with `\n`) |
| `FIREBASE_CLIENT_EMAIL` | Service account email |

To configure Firebase:

1. Create a Firebase project at https://console.firebase.google.com
2. Go to Project Settings > Service Accounts
3. Generate a new private key (JSON)
4. Extract `project_id`, `private_key`, and `client_email` from the downloaded JSON
5. Set the three environment variables above

### Admin Seed Variables

Used only when running `pnpm seed:admin`:

| Variable | Default | Description |
|----------|---------|-------------|
| `ADMIN_USERNAME` | `admin` | Admin account username |
| `ADMIN_PASSWORD` | (required) | Admin password (minimum 8 characters) |

---

## NAS Storage Setup

For deployments using network-attached storage:

1. Mount the NAS share to a local path (e.g. `/mnt/nas/deadmans-drop`).

2. Ensure the mount persists across reboots. Example `/etc/fstab` entry for NFS:

   ```
   nas-server:/share/videos /mnt/nas/deadmans-drop nfs defaults,_netdev 0 0
   ```

3. Set `STORAGE_PATH=/mnt/nas/deadmans-drop` in your `.env` file.

4. Verify the application user has read/write permissions on the mount point.

For Docker deployments, bind-mount the NAS path into the container:

```bash
docker run -d \
  -v /mnt/nas/deadmans-drop:/app/uploads \
  ...
  deadmans-drop-server
```

Or update `docker-compose.yml`:

```yaml
volumes:
  - /mnt/nas/deadmans-drop:/app/uploads
```

---

## Reverse Proxy (HTTPS)

A reverse proxy with TLS termination is strongly recommended for production. Below are example configurations.

### Nginx

```nginx
server {
    listen 443 ssl http2;
    server_name deadmans-drop.example.com;

    ssl_certificate /etc/letsencrypt/live/deadmans-drop.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/deadmans-drop.example.com/privkey.pem;

    client_max_body_size 500M;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

server {
    listen 80;
    server_name deadmans-drop.example.com;
    return 301 https://$host$request_uri;
}
```

Set `client_max_body_size` to match or exceed your `MAX_FILE_SIZE_MB` setting.

### Caddy

```
deadmans-drop.example.com {
    reverse_proxy localhost:3000
    request_body {
        max_size 500MB
    }
}
```

Caddy handles TLS automatically via Let's Encrypt.

### TLS with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d deadmans-drop.example.com
```

Certificates auto-renew via a systemd timer installed by certbot.

---

## Database Backups

Regular PostgreSQL backups are essential.

### Automated daily backup with cron

```bash
# /etc/cron.d/deadmans-drop-backup
0 3 * * * postgres pg_dump deadmans_drop | gzip > /backups/deadmans_drop_$(date +\%Y\%m\%d).sql.gz
```

### Docker-based backup

```bash
docker exec deadmans-drop-db pg_dump -U postgres deadmans_drop | gzip > backup_$(date +%Y%m%d).sql.gz
```

### Restore from backup

```bash
gunzip -c backup_20260201.sql.gz | psql -U postgres deadmans_drop
```

---

## Updating

### Docker Compose

```bash
git pull
docker compose build
docker compose up -d db
pnpm prisma migrate deploy
docker compose up -d
```

### Manual deployment

```bash
git pull
cd server
pnpm install
pnpm prisma generate
pnpm prisma migrate deploy
pnpm build
sudo systemctl restart deadmans-drop
```

---

## Health Monitoring

The server exposes a health check endpoint at `GET /health` that returns HTTP 200 when the server is running.

Use this endpoint for:
- Docker health checks (configured automatically in the Dockerfile)
- Load balancer health probes
- External uptime monitoring (e.g. UptimeRobot, Healthchecks.io)

Application logs are written to stdout by default. In production, configure `LOG_FILE` to persist logs to disk. Logs are JSON-formatted in production for easy integration with log aggregation tools.

---

## Troubleshooting

### Server won't start: "Missing required environment variable"

The application validates required environment variables at startup. Ensure `DATABASE_URL` and `JWT_SECRET` are set in your `.env` file or environment.

### Database connection refused

- Verify PostgreSQL is running: `pg_isready -h localhost -p 5432`
- Check the `DATABASE_URL` connection string format
- For Docker deployments, ensure the `db` service is healthy before starting the app
- Check firewall rules if PostgreSQL is on a separate host

### Upload fails with 413

- Increase `MAX_FILE_SIZE_MB` in your environment configuration
- If using a reverse proxy, increase its body size limit (e.g. `client_max_body_size` in nginx)

### Storage permission errors

- Verify the application user has read/write access to the `STORAGE_PATH` directory
- For NAS mounts, check that the mount options allow writing
- For Docker, ensure the volume is mounted with correct permissions

### Push notifications not working

- Verify all three Firebase environment variables are set
- Check that `FIREBASE_PRIVATE_KEY` has `\n` for newlines (not literal newlines)
- Ensure the Firebase project has Cloud Messaging enabled
- Check server logs for Firebase initialization errors

### Admin dashboard returns 404

- Ensure the admin SPA has been built: `pnpm build:admin`
- In Docker deployments, the admin build is included automatically

### Videos not distributing on schedule

- Background jobs run on a schedule via node-cron. Check server logs for job execution entries
- The distribution job runs hourly and processes videos where `distribute_at <= now()` and `status = ACTIVE`
- Ensure the server has been running continuously (jobs don't run if the process is stopped)

### High memory usage

- The server is designed for small deployments (10 or fewer users)
- Check for large numbers of concurrent uploads
- Review `LOG_LEVEL` -- `trace` and `debug` levels generate more output
