# Deadman's Drop Server - Docker Configuration
# Multi-stage build for smaller production image

# ==============================================================================
# Build Stage
# ==============================================================================
FROM node:20-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy package files for dependency installation
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for building)
RUN pnpm install --frozen-lockfile

# Copy prisma schema for client generation
COPY prisma ./prisma/

# Generate Prisma client
RUN pnpm prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src/

# Build TypeScript
RUN pnpm run build

# ==============================================================================
# Production Stage
# ==============================================================================
FROM node:20-alpine AS production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S deadman -u 1001 -G nodejs

WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Copy prisma schema and generated client from builder
COPY --from=builder /app/prisma ./prisma/
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma/

# Copy built application
COPY --from=builder /app/dist ./dist/

# Create uploads directory with correct ownership
RUN mkdir -p /app/uploads && chown -R deadman:nodejs /app/uploads

# Switch to non-root user
USER deadman

# Expose the default port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Default environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV STORAGE_PATH=/app/uploads

# Start the server
CMD ["node", "dist/index.js"]
