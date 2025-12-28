# ==========================================
# STAGE 1: PRUNE
# ==========================================
FROM node:25-alpine AS pruner
WORKDIR /app

RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=cdn-service --docker

# ==========================================
# STAGE 2: INSTALL & BUILD
# ==========================================
FROM node:25-alpine AS builder
WORKDIR /app

# FIX: Install build tools and libraries for canvas
RUN apk add --no-cache \
    libc6-compat \
    python3 \
    make \
    g++ \
    cairo-dev \
    pango-dev \
    jpeg-dev \
    giflib-dev

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install dependencies
RUN npm install

COPY --from=pruner /app/out/full/ .

RUN npx turbo run build --filter=cdn-service...

# ==========================================
# STAGE 3: RUNNER
# ==========================================
FROM node:25-alpine AS runner
WORKDIR /app

# FIX: Install runtime libraries for canvas
RUN apk add --no-cache \
    cairo \
    pango \
    jpeg \
    giflib

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# 1. Copy Shared Packages to their original location
COPY --from=builder --chown=nestjs:nodejs /app/packages ./packages

# 2. Copy the App to its original deep location
# Note: Docker creates the parent directories automatically
COPY --from=builder /app/apps/cdn-service/package.json ./apps/cdn-service/package.json
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/dist ./apps/cdn-service/dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/*.traineddata ./apps/cdn-service/

# 3. Copy Node Modules to the root (where they are expected)
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

USER nestjs

EXPOSE 10000

# FIX: Update the start command to point to the deep file
CMD ["node", "apps/cdn-service/dist/main.js"]