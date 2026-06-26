# ── Stage 1: Build ────────────────────────────────────────────────────
FROM node:20-slim AS builder

# Install build tools required by node-pty and better-sqlite3 native addons
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY package.json pnpm-lock.yaml ./

# Install all dependencies (including devDependencies for the build)
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Build SvelteKit (adapter-node outputs to build/)
RUN pnpm build

# Copy pty-holder.cjs to build/ (mirrors the postbuild script)
RUN cp src/lib/modules/server/terminal/pty-holder.cjs build/pty-holder.cjs

# Prune to production dependencies only.
# pnpm prune removes devDependencies in-place, preserving the symlink
# structure that pnpm relies on. We also keep tsx (a devDependency)
# because it is needed at runtime to execute server.ts.
RUN pnpm add tsx && pnpm prune --prod

# ── Stage 2: Production ──────────────────────────────────────────────
FROM node:20-slim AS production

# Install only the minimal C++ runtime needed by native .node addons
RUN apt-get update && apt-get install -y --no-install-recommends \
    libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the pruned node_modules (production deps + tsx) from builder.
# This preserves pnpm's internal symlink structure intact.
COPY --from=builder /app/node_modules ./node_modules

# Overwrite with prebuilt native addon binaries from the builder stage
# so we don't need python3/make/g++ in the production image.
COPY --from=builder /app/node_modules/node-pty/build/ ./node_modules/node-pty/build/
COPY --from=builder /app/node_modules/better-sqlite3/build/ ./node_modules/better-sqlite3/build/

# Copy built output from builder stage
COPY --from=builder /app/build ./build

# Copy package.json (needed by Node.js module resolution)
COPY package.json ./

# Copy server entry point and config files needed at runtime
COPY server.ts ./
COPY tsconfig.json ./

# Copy source modules imported by server.ts at runtime (tsx resolves these)
COPY src/lib/env.ts ./src/lib/env.ts
COPY src/lib/modules/server ./src/lib/modules/server
# device-token-store.ts imports the runtime guard isDeviceRecord from
# src/lib/types/device.ts; server.ts loads it at startup under tsx, so the
# types source must be present in the runtime image (not just the Vite build).
COPY src/lib/types ./src/lib/types

# Create data directory for SQLite persistence
RUN mkdir -p /root/.shooter

EXPOSE 54007

ENV NODE_ENV=production
ENV PORT=54007

CMD ["node", "--import", "tsx", "server.ts"]
