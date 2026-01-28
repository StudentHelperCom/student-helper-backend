# syntax=docker/dockerfile:1

FROM node:20-alpine AS pruner
WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    npm install -g turbo

COPY . .
RUN turbo prune --scope=api-gateway --docker

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/turbo.json ./turbo.json
COPY --from=pruner /app/packages/config/typescript-config ./packages/config/typescript-config

RUN npx turbo run build --filter=api-gateway...

FROM node:20-alpine AS production-deps
WORKDIR /app

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

FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache curl

USER node

COPY --from=production-deps --chown=node:node /app/node_modules ./node_modules

COPY --from=builder --chown=node:node /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder --chown=node:node /app/apps/api-gateway/package.json ./apps/api-gateway/package.json

COPY --from=builder --chown=node:node /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=node:node /app/packages/common/package.json ./packages/common/package.json
COPY --from=builder --chown=node:node /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=node:node /app/packages/database/package.json ./packages/database/package.json

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:4001/api/health || exit 1

CMD ["node", "apps/api-gateway/dist/main.js"]