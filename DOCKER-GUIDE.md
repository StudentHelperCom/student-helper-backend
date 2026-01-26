# 🐳 Docker Deployment Guide

Complete guide for deploying Student Helper Backend microservices using Docker and Docker Compose.

## 📋 Table of Contents

- [Prerequisites](#prerequisites)
- [Understanding the Architecture](#understanding-the-architecture)
- [Performance Optimizations](#performance-optimizations)
- [Local Development Setup](#local-development-setup)
- [Docker Configuration Files](#docker-configuration-files)
- [Building and Running](#building-and-running)
- [Troubleshooting](#troubleshooting)
- [Production Deployment](#production-deployment)

## Prerequisites

### Required Software

1. **Docker Desktop** (includes Docker Engine + Docker Compose)
   - [Download for Windows](https://docs.docker.com/desktop/install/windows-install/)
   - [Download for Mac](https://docs.docker.com/desktop/install/mac-install/)
   - [Download for Linux](https://docs.docker.com/desktop/install/linux-install/)

2. **Node.js 20+** (for local testing without Docker)
   - [Download Node.js LTS](https://nodejs.org/)

3. **Git** (for cloning the repository)
   - [Download Git](https://git-scm.com/downloads)

### Verify Installation

```bash
# Check Docker version
docker --version
# Expected: Docker version 24.0.0 or higher

# Check Docker Compose version
docker-compose --version
# Expected: Docker Compose version v2.20.0 or higher

# Verify Docker is running
docker ps
# Should show empty list (no containers running yet)
```

## Understanding the Architecture

### Microservices Overview

```
┌─────────────────┐
│   API Gateway   │  ← Entry point (Port 4001)
│   (Port 4001)   │
└────────┬────────┘
         │
    ┌────┴────┬────────────┬──────────────┐
    │         │            │              │
┌───▼───┐ ┌──▼──┐  ┌──────▼──────┐ ┌────▼─────┐
│ Auth  │ │ CDN │  │ Processing  │ │   Quiz   │
│ :3002 │ │:3001│  │    :3003    │ │  :3004   │
└───────┘ └──┬──┘  └──────┬──────┘ └──────────┘
             │             │
             └──────┬──────┘
                    │
             ┌──────▼──────┐
             │ PostgreSQL  │
             │   :5432     │
             └─────────────┘
             ┌──────▼──────┐
             │   AWS S3    │ (External)
             └─────────────┘
```

### Service Responsibilities

| Service | Purpose | External Dependencies |
|---------|---------|----------------------|
| **api-gateway** | Routes requests to microservices, handles JWT validation | None |
| **auth** | User authentication, JWT token generation | PostgreSQL |
| **cdn** | File upload, OCR processing, S3 storage | PostgreSQL, AWS S3, Tesseract |
| **processing** | AI content analysis using Gemini, PDF generation | PostgreSQL, AWS S3, Gemini AI |
| **quiz** | AI quiz/flashcard generation | PostgreSQL, AWS S3, Gemini AI |

## Performance Optimizations

### ⚡ BuildKit Cache Optimizations

All Dockerfiles are optimized with **BuildKit cache mounts** to dramatically reduce build times:

- **First build**: ~560 seconds
- **Subsequent builds**: ~150-200 seconds (70% faster!)

#### Key Optimizations:

1. **NPM Cache Mounting**: `--mount=type=cache,target=/root/.npm`
   - Reuses downloaded packages across builds
   - Reduces `npm ci` time from 170s to ~30s

2. **APT Cache Mounting** (cdn): `--mount=type=cache,target=/var/cache/apt`
   - Caches system packages for canvas dependencies
   - Reduces apt-get operations from 300s to ~10s

3. **Prefer Offline**: `npm ci --prefer-offline`
   - Uses cached packages when available
   - Falls back to network only if needed

### 🚀 Quick Build Commands

```bash
# Optimized build (recommended)
make docker-build-fast

# Or manually with BuildKit
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose build

# Standard build
make docker-build
```

### 📊 Build Time Comparison

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Full rebuild | 560s | 150-200s | 70% faster |
| npm ci (per service) | 170s | 30-40s | 77% faster |
| apt-get (cdn) | 300s | 10-15s | 95% faster |

## Local Development Setup

### Step 1: Clone Repository

```bash
git clone https://github.com/StudentHelperCom/student-helper-backend.git
cd student-helper-backend
```

### Step 2: Install Dependencies

```bash
# Install all dependencies (uses npm workspaces + Turborepo)
npm install

# Verify installation
npm run build
```

### Step 3: Configure Environment Variables

Create `.env` files in each service directory:

#### Option A: Copy from Examples (Recommended)
```bash
# Copy environment templates
cp .env.example .env
cp apps/auth/.env.example apps/auth/.env
cp apps/cdn/.env.example apps/cdn/.env
cp apps/processing/.env.example apps/processing/.env
cp apps/quiz/.env.example apps/quiz/.env
cp apps/api-gateway/.env.example apps/api-gateway/.env
```

#### Option B: Create Manually

**`apps/auth/.env`:**
```env
PORT=3002
NODE_ENV=development

# Database (local Docker PostgreSQL)
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=student_helper
DB_SSL=false

# JWT Configuration
AUTH_JWT_SECRET=your-super-secret-key-change-in-production
BLOCK_TIME_BETWEEN_SENDING_VERIFICATION_CODE_IN_SECONDS=60
```

**`apps/cdn/.env`:**
```env
PORT=3001
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=student_helper
DB_SSL=false

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-bucket-name

# Processing Service URL (Docker internal network)
PROCESSING_URL=http://processing:3003
```

**`apps/processing/.env`:**
```env
PORT=3003
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=student_helper
DB_SSL=false

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-bucket-name

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
```

**`apps/quiz/.env`:**
```env
PORT=3004
NODE_ENV=development

# Database
DB_HOST=postgres
DB_PORT=5432
DB_USER=postgres
DB_PASS=postgres
DB_NAME=student_helper
DB_SSL=false

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_S3_BUCKET=your-bucket-name

# Google Gemini AI
GEMINI_API_KEY=your-gemini-api-key
GEMINI_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent
```

**`apps/api-gateway/.env`:**
```env
PORT=4001
NODE_ENV=development

# JWT Secret for Gateway
GATEWAY_JWT_SECRET=your-gateway-secret-key-change-in-production

# Microservice URLs (Docker internal network)
CDN_URL=http://cdn:3001
AUTH_URL=http://auth:3002
PROCESSING_URL=http://processing:3003
QUIZ_SERVICE_URL=http://quiz:3004

# Frontend CORS Configuration
FRONTEND_URL=http://localhost:3000
```

### Step 4: Get API Keys

**AWS S3:**
1. Go to [AWS Console](https://console.aws.amazon.com/)
2. Create IAM user with S3 permissions
3. Generate access keys
4. Create S3 bucket

**Google Gemini AI:**
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key
3. Copy key to `.env` files

## Docker Configuration Files

### Understanding `docker-compose.yml`

The [`docker-compose.yml`](../docker-compose.yml) file orchestrates all services:

```yaml
version: '3.8'

services:
  # Auth Service
  auth:
    build:
      context: .
      dockerfile: apps/auth/Dockerfile
    env_file:
      - apps/auth/.env
    ports:
      - "3002:3002"
    depends_on:
      postgres:
        condition: service_healthy

  # Additional services follow same pattern...
```

**Key Features:**
- ✅ Health checks ensure services start in correct order
- ✅ `env_file` loads environment variables from service directories
- ✅ `depends_on` manages service startup dependencies
- ✅ Named volumes persist PostgreSQL data between restarts

### Understanding Individual Dockerfiles

Each service has its own Dockerfile using **multi-stage builds** for optimization:

**Example: [`apps/cdn/Dockerfile`](../apps/cdn/Dockerfile)**

```dockerfile
# Stage 1: PRUNE - Extract only needed dependencies
FROM node:20-slim AS pruner
WORKDIR /app
RUN npm install -g turbo
COPY . .
RUN turbo prune --scope=cdn --docker

# Stage 2: BUILDER - Install deps and build
FROM node:20-slim AS builder
WORKDIR /app
# Install native dependencies (Tesseract, cairo)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*
COPY --from=pruner /app/out/json/ .
RUN npm ci --legacy-peer-deps
COPY --from=pruner /app/out/full/ .
RUN npm run build -- --filter=cdn

# Stage 3: RUNNER - Minimal production image
FROM node:20-slim AS runner
WORKDIR /app
# Install only runtime dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    && rm -rf /var/lib/apt/lists/*
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs
# Copy built artifacts
COPY --from=builder --chown=nestjs:nodejs /app/apps/cdn/dist ./apps/cdn/dist
USER nestjs
EXPOSE 3001
CMD ["node", "apps/cdn/dist/main.js"]
```

**Multi-Stage Benefits:**
- **Smaller images:** Final image only contains runtime dependencies
- **Faster builds:** Turborepo caching via `turbo prune`
- **Security:** Runs as non-root user (`nestjs`)
- **Reproducibility:** Locked dependencies with `npm ci`

## Building and Running

### Quick Start (Recommended)

```bash
# Start all services in detached mode
docker-compose up -d

# View logs
docker-compose logs -f

# Check status
docker-compose ps

# Stop all services
docker-compose down
```

### Step-by-Step Build

#### 1. Build Docker Images

```bash
# Build all services (first time or after code changes)
docker-compose build

# Build specific service
docker-compose build cdn

# Build without cache (if having issues)
docker-compose build --no-cache
```

**Expected output:**
```
[+] Building 127.3s (42/42) FINISHED
 => [auth internal] load .dockerignore
 => [auth internal] load build definition from Dockerfile
 => [auth] building apps/auth...
 => [cdn] building apps/cdn...
 => [processing] building apps/processing...
 => [quiz] building apps/quiz...
 => [api-gateway] building apps/api-gateway...
Successfully built student-helper-backend
```

#### 2. Start Services

```bash
# Start all services (logs attached)
docker-compose up

# Start in background (detached mode)
docker-compose up -d

# Start specific service
docker-compose up cdn
```

**Startup Order:**
1. **PostgreSQL** starts and passes health check
2. **Auth** service connects to database
3. **CDN, Processing, Quiz** services start (depend on PostgreSQL)
4. **API Gateway** starts (waits for all backend services)

#### 3. Verify Services

```bash
# Check all containers are running
docker-compose ps

# Expected output:
# NAME                STATUS              PORTS
# auth        Up 2 minutes        0.0.0.0:3002->3002/tcp
# cdn         Up 2 minutes        0.0.0.0:3001->3001/tcp
# processing  Up 2 minutes        0.0.0.0:3003->3003/tcp
# quiz        Up 2 minutes        0.0.0.0:3004->3004/tcp
# api-gateway         Up 2 minutes        0.0.0.0:4001->4001/tcp

# Check health endpoints
curl http://localhost:3002/auth/health  # Auth
curl http://localhost:3001/cdn/health  # CDN
curl http://localhost:3003/processing/health  # Processing
curl http://localhost:3004/quiz/health  # Quiz
curl http://localhost:4001/api/health  # Gateway

# All should return "OK"
```

#### 4. Access Services

- **API Gateway Swagger:** http://localhost:4001/api/doc
- **Auth Service:** http://localhost:3002
- **CDN Service:** http://localhost:3001
- **Processing Service:** http://localhost:3003
- **Quiz Service:** http://localhost:3004

### Viewing Logs

```bash
# All services (follow mode)
docker-compose logs -f

# Specific service
docker-compose logs -f cdn

# Last 100 lines
docker-compose logs --tail=100 processing

# Logs since 10 minutes ago
docker-compose logs --since=10m

# Filter by keyword
docker-compose logs | grep "ERROR"
```

### Stopping Services

```bash
# Stop all services (keeps containers)
docker-compose stop

# Stop specific service
docker-compose stop cdn

# Stop and remove containers (keeps volumes)
docker-compose down

# Remove containers + volumes (⚠️ deletes database data)
docker-compose down -v

# Remove containers + images + volumes
docker-compose down -v --rmi all
```

## Troubleshooting

### Common Issues

#### 1. **Port Already in Use**

**Error:**
```
Error starting userland proxy: listen tcp4 0.0.0.0:3001: bind: address already in use
```

**Solution:**
```bash
# Find process using port
lsof -i :3001  # Mac/Linux
netstat -ano | findstr :3001  # Windows

# Kill process or change port in docker-compose.yml
ports:
  - "3011:3001"  # Map to different host port
```

#### 2. **Database Connection Refused**

**Error in logs:**
```
Error: connect ECONNREFUSED postgres:5432
```

**Solution:**
```bash
# Check PostgreSQL health
docker-compose ps postgres

# Restart PostgreSQL
docker-compose restart postgres

# Check .env has correct DB_HOST
# Should be 'postgres' for Docker, not 'localhost'
DB_HOST=postgres
```

#### 3. **Build Fails: "npm ERR! code ENOENT"**

**Solution:**
```bash
# Clean npm cache
npm cache clean --force

# Rebuild without cache
docker-compose build --no-cache

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### 4. **Service Keeps Restarting**

**Check logs for errors:**
```bash
docker-compose logs --tail=50 [service-name]

# Common causes:
# - Missing environment variables
# - Invalid AWS/Gemini credentials
# - TypeORM schema sync errors
```

**Solution:**
```bash
# Verify .env file exists
ls -la apps/cdn/.env

# Check environment variables loaded
docker-compose exec cdn env | grep AWS

# Restart with fresh database
docker-compose down -v
docker-compose up -d
```

#### 5. **Slow Build Times**

**Solution:**
```bash
# Use BuildKit for parallel builds
DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose build

# Increase Docker Desktop memory (Settings > Resources)
# Recommended: 4GB+ for building all services
```

#### 6. **Container Out of Memory**

**Solution:**
```bash
# Check container stats
docker stats

# Increase Docker Desktop memory limit
# Docker Desktop > Settings > Resources > Memory: 6GB+

# Or add memory limits to docker-compose.yml:
services:
  processing:
    mem_limit: 2g
    mem_reservation: 1g
```

### Debugging Commands

```bash
# Enter running container shell
docker-compose exec cdn sh

# Run commands inside container
docker-compose exec cdn npm run test

# Check environment variables
docker-compose exec cdn env

# View container details
docker inspect student-helper-backend-cdn-1

# Check network connectivity
docker-compose exec cdn ping postgres

# View Docker networks
docker network ls
docker network inspect student-helper-backend_backend
```

### Clean Reset (Nuclear Option)

```bash
# Stop everything
docker-compose down -v --rmi all

# Remove all unused Docker resources
docker system prune -a --volumes

# Rebuild from scratch
npm install
docker-compose build --no-cache
docker-compose up -d
```

## Production Deployment

### Render.com Deployment

See main [README - Deployment Section](../README.md#-deployment-to-rendercom) for detailed Render.com setup.

**Key Differences from Local:**
- Use Render's internal URLs (e.g., `processing:3003` → `https://processing.onrender.com`)
- Set `DB_SSL=true` for Render PostgreSQL
- Use Render environment variables (not `.env` files)
- Each service deploys independently
- Render builds from Dockerfile automatically

### Docker Production Best Practices

1. **Use specific image tags:**
   ```dockerfile
   FROM node:20.10.0-slim  # Not 'latest'
   ```

2. **Multi-stage builds** (already implemented in our Dockerfiles)

3. **Health checks** (already implemented in docker-compose.yml)

4. **Non-root user** (already implemented as `nestjs` user)

5. **Environment-specific configs:**
   ```bash
   # Production
   DB_SSL=true
   NODE_ENV=production
   ```

6. **Image optimization:**
   ```dockerfile
   # Remove unnecessary files
   RUN rm -rf /app/node_modules/.cache
   RUN find /app -name "*.map" -delete
   ```

7. **Logging:**
   ```bash
   # Centralized logging (e.g., Winston to CloudWatch)
   npm install --save winston
   ```

### Security Checklist for Production

- [ ] Change all default passwords and secrets
- [ ] Use environment variables (never commit `.env`)
- [ ] Enable CORS whitelist (not `*`)
- [ ] Use HTTPS/TLS for all external communication
- [ ] Enable database SSL (`DB_SSL=true`)
- [ ] Run containers as non-root user ✅ (already implemented)
- [ ] Scan images for vulnerabilities: `docker scan student-helper-backend`
- [ ] Keep dependencies updated: `npm audit fix`
- [ ] Enable rate limiting on API Gateway
- [ ] Set up monitoring and alerts (e.g., Sentry, DataDog)

---

## Next Steps

- ✅ **Start services:** `docker-compose up -d`
- 📖 **Read [Architecture](ARCHITECTURE.md)** to understand service interactions
- 🧪 **Test API:** Open http://localhost:4001/api/doc
- 🚀 **Deploy to Render:** Follow [deployment guide](../README.md#-deployment-to-rendercom)

For issues or questions, open a GitHub issue or contact the team.

**Built with 🐳 Docker + ❤️ by Student Helper Team**
