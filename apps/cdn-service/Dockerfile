# ==========================================
# STAGE 1: PRUNE
# ==========================================
FROM node:20-slim AS pruner
WORKDIR /app

RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=cdn-service --docker

# ==========================================
# STAGE 2: INSTALL & BUILD
# ==========================================
FROM node:20-slim AS builder
WORKDIR /app

# Install build dependencies for canvas on Debian
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install dependencies deterministically
RUN npm ci --legacy-peer-deps

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/turbo.json ./turbo.json
# Copy typescript-config package manually (not included by turbo prune)
COPY --from=pruner /app/packages/typescript-config ./packages/typescript-config

RUN npx turbo run build --filter=cdn-service...

# ==========================================
# STAGE 2.5: PRODUCTION DEPENDENCIES
# ==========================================
FROM node:20-slim AS deps
WORKDIR /app

# Install build dependencies for canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    && rm -rf /var/lib/apt/lists/*

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install production dependencies and clean up
RUN npm ci --legacy-peer-deps --omit=dev && \
    npm cache clean --force && \
    # Remove unnecessary files from node_modules
    find /app/node_modules -name "*.md" -delete && \
    find /app/node_modules -name "LICENSE*" -delete && \
    find /app/node_modules -name "CHANGELOG*" -delete && \
    find /app/node_modules -name "*.ts" ! -name "*.d.ts" -delete && \
    find /app/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "*.map" -delete && \
    find /app/node_modules -type d -name "example*" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true

# ==========================================
# STAGE 3: RUNNER
# ==========================================
FROM node:20-slim AS runner
WORKDIR /app

# Install runtime libraries for canvas and Tesseract
RUN apt-get update && apt-get install -y --no-install-recommends \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-pol \
    && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# 1. Copy Shared Packages to their original location
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/package.json ./packages/common/
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/

# 2. Copy the App to its original deep location
# Note: Docker creates the parent directories automatically
COPY --from=builder /app/apps/cdn-service/package.json ./apps/cdn-service/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/dist ./apps/cdn-service/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/*.traineddata ./apps/cdn-service/

# 3. Copy Production Node Modules only (already cleaned in deps stage)
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules

# 4. Create Temp Directories & Fix Permissions
# The CDN service needs both temp_processing and cdn_temp_storage
RUN mkdir -p /app/temp_processing /app/cdn_temp_storage && \
    chown -R nestjs:nodejs /app/temp_processing /app/cdn_temp_storage

USER nestjs

EXPOSE 3001

ENV NODE_ENV=production
ENV PORT=3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# FIX: Update the start command to point to the deep file
CMD ["node", "apps/cdn-service/dist/main.js"]