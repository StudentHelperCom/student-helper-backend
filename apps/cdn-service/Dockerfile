# ==========================================
# STAGE 1: PRUNE
# Isolate the specific app and its internal package dependencies
# ==========================================
FROM node:18-alpine AS pruner
WORKDIR /app

# Install turbo globally to use the prune command
RUN npm install -g turbo

# Copy the entire monorepo content (needed for analysis)
COPY . .

# Run turbo prune. This creates a folder "out" with only what is needed for cdn-service.
# --docker flag separates package.json files from source code for better caching
RUN turbo prune --scope=cdn-service --docker

# ==========================================
# STAGE 2: INSTALL & BUILD
# Install dependencies and build the application
# ==========================================
FROM node:18-alpine AS builder
WORKDIR /app

# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat

# First, copy ONLY package.json and lock files from the prune stage.
# This allows Docker to cache the "npm install" step if dependencies haven't changed.
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/package-lock.json ./package-lock.json

# Install dependencies (including devDependencies for building)
RUN npm ci

# Now copy the actual source code from the prune stage
COPY --from=pruner /app/out/full/ .

# Build the project using Turbo.
# This runs "nest build" under the hood for cdn-service.
RUN npx turbo run build --filter=cdn-service...

# ==========================================
# STAGE 3: RUNNER
# The final production image
# ==========================================
FROM node:18-alpine AS runner
WORKDIR /app

# Best Practice: Don't run as root.
# Create a group and user 'nodejs'
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy package.json (sometimes needed by Nest for metadata)
COPY --from=builder /app/apps/cdn-service/package.json ./

# Copy the compiled application from the builder stage
# Note: NestJS output is usually in /dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/dist ./dist

# CRITICAL: Copy external dependencies not bundled by Webpack/Nest
# NestJS usually keeps node_modules for runtime usage (unless bundled).
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules

# CRITICAL: Copy Tesseract/AI Trained Data
# Based on your file structure, they are in the root of the app folder
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn-service/*.traineddata ./

# Set the user to the non-root user we created
USER nestjs

# Expose the port defined in your NestJS app (default is usually 3000)
EXPOSE 3000

# Start the application
CMD ["node", "dist/main.js"]