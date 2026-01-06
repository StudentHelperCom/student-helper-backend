# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT LAYER                             │
│                    (Next.js Frontend App)                        │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (Port 4001)                      │
│  • Request Routing                                               │
│  • JWT Validation                                                │
│  • Rate Limiting                                                 │
│  • Swagger Documentation                                         │
└──────┬────────┬───────┬───────┬─────────────────────────────────┘
       │        │       │       │
       ▼        ▼       ▼       ▼
   ┌─────┐  ┌─────┐ ┌─────┐ ┌─────┐
   │Auth │  │ CDN │ │Proc │ │Quiz │
   │3002 │  │3001 │ │3003 │ │3004 │
   └──┬──┘  └──┬──┘ └──┬──┘ └──┬──┘
      │        │       │       │
      └────────┴───────┴───────┘
                 │
                 ▼
      ┌──────────────────────┐
      │   PostgreSQL DB      │
      │   (Port 5432)        │
      └──────────────────────┘
```

## Service Responsibilities

### API Gateway (Port 4001)
- **Purpose**: Single entry point for all client requests
- **Responsibilities**:
  - Route requests to appropriate microservices
  - JWT authentication & authorization
  - Request/response logging
  - API documentation (Swagger)
- **Dependencies**: All other services

### Auth Service (Port 3002)
- **Purpose**: User authentication & authorization
- **Responsibilities**:
  - User registration & login
  - JWT token generation
  - Password hashing with bcrypt
  - User management
- **Dependencies**: PostgreSQL

### CDN Service (Port 3001)
- **Purpose**: File management & storage
- **Responsibilities**:
  - File upload to AWS S3
  - OCR processing with Tesseract.js
  - PDF text extraction
  - Trigger processing workflows
- **Dependencies**: PostgreSQL, AWS S3, Processing Service

### Processing Service (Port 3003)
- **Purpose**: AI-powered content processing
- **Responsibilities**:
  - Extract topics from documents
  - Generate PDF summaries
  - Merge & split PDFs
  - AI content analysis with Gemini
- **Dependencies**: PostgreSQL, AWS S3, Gemini AI

### Quiz Service (Port 3004)
- **Purpose**: Automated quiz generation
- **Responsibilities**:
  - Generate quiz questions from topics
  - Create flashcards
  - AI-powered question generation
- **Dependencies**: PostgreSQL, AWS S3, Gemini AI

## Data Flow

### File Upload & Processing Flow

```
1. Client uploads file → API Gateway
2. API Gateway → CDN Service
3. CDN Service:
   - Saves file to S3
   - Stores metadata in DB
   - Triggers processing
4. Processing Service:
   - Downloads file from S3
   - Extracts text with OCR
   - Analyzes content with AI
   - Generates topics
   - Creates PDF summary
   - Uploads results to S3
5. Quiz Service (on demand):
   - Fetches topics from DB
   - Downloads content from S3
   - Generates quiz with AI
   - Returns to client
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  userID UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Classes Table
```sql
CREATE TABLE classes (
  classID UUID PRIMARY KEY,
  userID UUID REFERENCES users(userID),
  className VARCHAR(255) NOT NULL,
  examDate TIMESTAMP,
  examLocation VARCHAR(255),
  created_at TIMESTAMP DEFAULT NOW()
);
```

### Topics Table
```sql
CREATE TABLE topics (
  topicID UUID PRIMARY KEY,
  classID UUID REFERENCES classes(classID),
  name VARCHAR(500),
  number VARCHAR(10),
  status VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Security Architecture

### Authentication Flow
```
1. User sends credentials → Auth Service
2. Auth Service validates & generates JWT
3. Client includes JWT in all requests
4. API Gateway validates JWT
5. If valid, forwards to microservice
6. If invalid, returns 401 Unauthorized
```

### Security Layers
1. **Network**: Private networking between services
2. **Application**: JWT authentication, input validation
3. **Database**: SSL/TLS encryption, least-privilege access
4. **Storage**: S3 bucket policies, pre-signed URLs
5. **Container**: Non-root user, minimal image

## Scalability Strategy

### Horizontal Scaling
- **API Gateway**: 3+ replicas (high traffic)
- **Auth**: 2 replicas
- **CDN**: 2 replicas
- **Processing**: 2-3 replicas (CPU intensive)
- **Quiz**: 2 replicas

### Vertical Scaling
- Processing service needs more CPU (AI operations)
- Database needs more memory (caching)

### Caching Strategy
- Redis for session management (future)
- CloudFront CDN for static assets
- Database query caching

## Monitoring & Observability

### Health Checks
- Each service exposes `/health` endpoint
- Kubernetes liveness & readiness probes
- Container health checks in Docker

### Metrics Collection
- Prometheus scrapes metrics from all services
- Grafana dashboards for visualization
- AlertManager for notifications

### Logging
- Centralized logging with CloudWatch/ELK
- Structured JSON logs
- Correlation IDs for request tracing

## Disaster Recovery

### Backup Strategy
- Database: Daily automated backups
- S3: Versioning enabled
- Docker images: Tagged and stored in registry

### Recovery Plan
1. Database: Restore from latest backup
2. Services: Deploy from Docker registry
3. Configuration: Restore from git
4. Verify health checks pass

## Development Workflow

```
1. Developer creates feature branch
2. Makes changes locally
3. Runs tests & linter
4. Commits with conventional commit message
5. Opens pull request
6. CI/CD runs automated checks
7. Code review by team
8. Merge to main
9. Automated deployment to staging
10. Manual promotion to production
```
