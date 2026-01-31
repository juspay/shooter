# Multi-stage Docker build for SHOOTER notification system
# Optimized for production deployment with Bun runtime

# Build stage
FROM oven/bun:1.2-alpine AS builder

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./
COPY tsconfig.json ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY src/ ./src/
COPY svelte.config.js vite.config.js ./

# Build the application
RUN bun run build

# Production stage
FROM oven/bun:1.2-alpine AS production

# Create non-root user
RUN addgroup -g 1001 -S bunjs && \
    adduser -S shooter -u 1001

# Install production dependencies only
RUN apk add --no-cache \
    ca-certificates \
    curl \
    tini && \
    rm -rf /var/cache/apk/*

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install production dependencies
RUN bun install --frozen-lockfile --production && \
    chown -R shooter:bunjs /app

# Copy built application
COPY --from=builder --chown=shooter:bunjs /app/build ./build
COPY --from=builder --chown=shooter:bunjs /app/package.json ./

# Set environment variables
ENV NODE_ENV=production
ENV BUN_RUNTIME=1
ENV PORT=3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:$PORT/api/health || exit 1

# Expose port
EXPOSE 3000

# Switch to non-root user
USER shooter

# Use tini as init system
ENTRYPOINT ["tini", "--"]

# Start the application
CMD ["bun", "build/index.js"]

# Labels for image metadata
LABEL maintainer="SHOOTER Team" \
      version="1.0.0" \
      description="SHOOTER iOS notification system" \
      org.opencontainers.image.source="https://github.com/your-org/shooter" \
      org.opencontainers.image.documentation="https://docs.your-org.com/shooter"