# syntax=docker/dockerfile:1

FROM node:20-alpine AS pruner
WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    npm install -g turbo

COPY . .
RUN turbo prune --scope=cdn --docker

FROM node:20-slim AS builder
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/turbo.json ./turbo.json
COPY --from=pruner /app/packages/config/typescript-config ./packages/config/typescript-config

RUN npx turbo run build --filter=cdn...

FROM node:20-slim AS production-deps
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    libpixman-1-dev

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --omit=dev --prefer-offline && \
    find /app/node_modules -name "*.md" -delete && \
    find /app/node_modules -name "LICENSE*" -delete && \
    find /app/node_modules -name "CHANGELOG*" -delete && \
    find /app/node_modules -name "*.ts" ! -name "*.d.ts" -delete && \
    find /app/node_modules -type d -name "test" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name "tests" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -name "*.map" -delete && \
    find /app/node_modules -type d -name "example*" -exec rm -rf {} + 2>/dev/null || true && \
    find /app/node_modules -type d -name "docs" -exec rm -rf {} + 2>/dev/null || true

FROM node:20-slim AS runner
WORKDIR /app

RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    curl \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    libpixman-1-0 && \
    rm -rf /var/lib/apt/lists/*

USER node

COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules

COPY --from=builder --chown=node:node /app/apps/cdn/dist ./apps/cdn/dist
COPY --from=builder --chown=node:node /app/apps/cdn/package.json ./apps/cdn/package.json

COPY --from=builder --chown=node:node /app/apps/cdn/*.traineddata ./apps/cdn/

COPY --from=builder --chown=node:node /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=node:node /app/packages/common/package.json ./packages/common/package.json
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/package.json

USER root
RUN mkdir -p /app/temp_processing /app/cdn_temp_storage && \
    chown -R node:node /app/temp_processing /app/cdn_temp_storage
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3001/cdn/health || exit 1

CMD ["node", "apps/cdn/dist/main.js"]