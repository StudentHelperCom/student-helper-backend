# ==========================================
# Multi-stage Dockerfile for api-gateway
# ==========================================

# STAGE 1: Pruner - Extract only what's needed
FROM node:20-alpine AS pruner
WORKDIR /app

RUN --mount=type=cache,target=/root/.npm \
    npm install -g turbo
COPY . .
RUN turbo prune --scope=api-gateway --docker

# STAGE 2: Builder - Install & Build
FROM node:20-alpine AS builder
WORKDIR /app

# Install dependencies
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --prefer-offline

# Copy source and build
COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/turbo.json ./turbo.json
# Copy typescript-config package manually (not included by turbo prune)
COPY --from=pruner /app/packages/config/typescript-config ./packages/config/typescript-config
RUN npx turbo run build --filter=api-gateway...

# Install production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN --mount=type=cache,target=/root/.npm \
    npm ci --legacy-peer-deps --omit=dev --prefer-offline

# STAGE 3: Runner - Minimal production image
FROM node:20-alpine AS runner
WORKDIR /app

# Add non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy production dependencies only
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/api-gateway/dist ./apps/api-gateway/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/api-gateway/package.json ./apps/api-gateway/
# Copy only built package distributions (not source)
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/package.json ./packages/common/

USER nestjs
EXPOSE 4001

ENV NODE_ENV=production
ENV PORT=4001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/api-gateway/dist/main.js"]
