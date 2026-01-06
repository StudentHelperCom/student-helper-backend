# ==========================================
# Multi-stage Dockerfile for quiz-service
# ==========================================

FROM node:20-alpine AS pruner
WORKDIR /app

RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=quiz-service --docker

FROM node:20-alpine AS builder
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci --legacy-peer-deps

COPY --from=pruner /app/out/full/ .
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
COPY --from=pruner /app/turbo.json ./turbo.json
# Copy typescript-config package manually (not included by turbo prune)
COPY --from=pruner /app/packages/typescript-config ./packages/typescript-config
RUN npx turbo run build --filter=quiz-service...

# Install production dependencies only
FROM node:20-alpine AS deps
WORKDIR /app

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json
RUN npm ci --legacy-peer-deps --omit=dev --ignore-scripts

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy production dependencies only
COPY --from=deps --chown=nestjs:nodejs /app/node_modules ./node_modules
# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/quiz-service/dist ./apps/quiz-service/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/quiz-service/package.json ./apps/quiz-service/
# Copy only built package distributions (not source)
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/dist ./packages/common/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/common/package.json ./packages/common/
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=nestjs:nodejs /app/packages/database/package.json ./packages/database/

USER nestjs
EXPOSE 3004

ENV NODE_ENV=production
ENV PORT=3004

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

CMD ["node", "apps/quiz-service/dist/main.js"]
