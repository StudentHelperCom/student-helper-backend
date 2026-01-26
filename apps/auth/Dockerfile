# ==========================================
# Multi-stage Dockerfile for auth service
# ==========================================

FROM node:20-alpine AS pruner
WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    npm install -g turbo
COPY . .
RUN turbo prune --scope=auth --docker

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/turbo.json ./turbo.json
# Copy typescript-config package manually (not included by turbo prune)
COPY --from=pruner /app/packages/config/typescript-config ./packages/config/typescript-config
RUN npx turbo run build --filter=auth...

# Install production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --omit=dev --prefer-offline

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy production dependencies only
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/auth/dist ./apps/auth/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/auth/package.json ./apps/auth/
# Copy only built package distributions (not source)
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/package.json ./packages/common/
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/

USER nestjs
EXPOSE 3002

ENV NODE_ENV=production
ENV PORT=3002

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3002/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/auth/dist/main.js"]
