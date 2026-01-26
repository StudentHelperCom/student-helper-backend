# Student Helper Backend 🎓

Production-ready microservices architecture for processing educational content using NestJS, TypeORM, and Turborepo.

## 🏗️ Architecture

This monorepo contains 5 microservices:

- **api-gateway** (Port 4001) - Main API gateway with Swagger documentation
- **auth** (Port 3002) - Authentication & user management  
- **cdn** (Port 3001) - File upload, OCR processing, and S3 integration
- **processing** (Port 3003) - AI-powered content processing with Gemini AI
- **quiz** (Port 3004) - Automated quiz generation

## 🚀 Quick Start

### Prerequisites
- Node.js >= 20
- Docker & Docker Compose
- PostgreSQL 16+
- AWS Account (for S3)
- Gemini API Key

### Local Development

```bash
# 1. Clone the repository
git clone https://github.com/StudentHelperCom/student-helper-backend.git
cd student-helper-backend

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Copy environment file and configure
cp .env.example .env
# Edit .env with your credentials

# 4. Start with Docker Compose (recommended)
docker-compose up -d

# OR start services directly
npm run dev
```

### Docker Development (Recommended)

```bash
# Build all images
make docker-build

# Start all services
make docker-up

# View logs
make docker-logs

# Stop services
make docker-down
```

### Individual Service Development

```bash
# Start specific service in development mode
cd apps/auth && npm run start:dev

# Build specific service
npm run build -- --filter=auth

# Run tests for specific service
npm run test -- --filter=auth

# Check service in isolation
npm run lint -- --filter=cdn
npm run typecheck -- --filter=processing
```

## 📦 Shared Packages

- **@repo/common** - Shared DTOs, utilities, and bootstrap function
- **@repo/database** - Database entities and shared TypeORM configuration
- **@repo/typescript-config** - Shared TypeScript configurations
- **@repo/eslint-config** - Shared ESLint rules
- **@repo/jest-config** - Shared Jest configuration

## 🛠️ Commands

### Using Makefile
```bash
make help           # Show all available commands
make install        # Install dependencies
make build          # Build all services
make dev            # Start development mode
make test           # Run tests
make lint           # Run linter
make typecheck      # Type check
make check          # Run all checks (lint + typecheck + test)
make docker-build   # Build Docker images
make docker-up      # Start Docker containers
make docker-down    # Stop Docker containers
make docker-logs    # View Docker logs
```

### Using npm
```bash
npm run build         # Build all services
npm run dev           # Start all in development
npm run start:prod    # Start all in production
npm run lint          # Lint all services
npm run lint:fix      # Fix linting issues
npm run typecheck     # Type check all services
npm run test          # Run all tests
npm run clean         # Clean build artifacts
```

## 📝 Environment Variables

Create `.env` files in each service directory. Required variables:

```env
# Database
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASS=password
DB_NAME=student_helper
DB_SSL=false

# Auth Service
JWT_SECRET=your-secret-key

# CDN Service
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-key
AWS_SECRET_ACCESS_KEY=your-secret
S3_BUCKET=your-bucket

# AI Services
GEMINI_API_KEY=your-api-key
GEMINI_URL=https://api.gemini.com
```

## 🔧 Development

### Adding a New Service

1. Create service in `apps/` directory
2. Add service-specific dependencies to its `package.json`
3. Extend shared configs (`tsconfig.base.json`, `@repo/eslint-config/nest`)
4. Use shared modules (`@repo/common`, `@repo/database`)

### Code Quality

- **ESLint** - Configured with TypeScript and Prettier
- **TypeScript** - Strict mode with decorators support
- **Prettier** - Automated code formatting
- **Jest** - Unit and integration testing

## 📚 Tech Stack

### Backend
- **NestJS** - Progressive Node.js framework
- **TypeORM** - ORM for TypeScript
- **PostgreSQL** - Primary database
- **AWS S3** - File storage
- **Gemini AI** - Content processing & quiz generation
- **Tesseract.js** - OCR processing

### Tools
- **Turborepo** - Monorepo build system
- **Docker** - Containerization
- **Docker Compose** - Local development

## 📁 Project Structure

```
student-helper-backend/
├── apps/                      # Microservices
│   ├── api-gateway/          # API Gateway (Port 4001)
│   ├── auth/                 # Auth Service (Port 3002)
│   ├── cdn/          # CDN Service (Port 3001)
│   ├── processing/           # Processing Service (Port 3003)
│   └── quiz/         # Quiz Service (Port 3004)
├── packages/                  # Shared packages
│   ├── common/               # Shared utilities & DTOs
│   ├── database/             # Database entities & config
│   ├── eslint-config/        # Shared ESLint rules
│   ├── jest-config/          # Shared Jest config
│   └── typescript-config/    # Shared TS config
├── docs/                     # Documentation
├── docker-compose.yml        # Local development setup
├── Makefile                  # Convenience commands
└── README.md
```

## 🚢 Deployment to Render.com

### Step 1: Prepare Environment Variables
Create a `.env.production` file or use Render's dashboard to set:
- Database credentials (use Render PostgreSQL)
- JWT secrets
- AWS S3 credentials
- Gemini API key

### Step 2: Deploy Each Service
1. Connect your GitHub repository to Render
2. Create a new Web Service for each microservice:
   - **api-gateway**: `apps/api-gateway/Dockerfile`, Port 4001
   - **auth**: `apps/auth/Dockerfile`, Port 3002
   - **cdn**: `apps/cdn/Dockerfile`, Port 3001
   - **processing**: `apps/processing/Dockerfile`, Port 3003
   - **quiz**: `apps/quiz/Dockerfile`, Port 3004

3. Configure environment variables for each service
4. Deploy!

### Step 3: Setup Database
1. Create a PostgreSQL database on Render
2. Run migrations (if you have them)
3. Update `DB_HOST` in all services to point to Render database

### Health Checks
Each service has a health check endpoint at `/health` that Render can use to verify the service is running.

## 📖 API Documentation

Swagger UI and health endpoints available at:
- **API Gateway Swagger**: http://localhost:4001/api/doc (main entry point)
- **Auth Service**: http://localhost:3002
- **CDN Service**: http://localhost:3001
- **Processing Service**: http://localhost:3003
- **Quiz Service**: http://localhost:3004
- **PostgreSQL**: `postgresql://postgres:postgres@localhost:5432/student_helper`

## 🔒 Security

- All Docker containers run as non-root users
- Environment variables should never be committed
- JWT tokens expire after 7 days
- Use HTTPS in production

## 📚 Documentation

- [🐳 Docker Deployment Guide](docs/DOCKER-GUIDE.md) - **Complete Docker setup and troubleshooting**
- [Architecture Overview](docs/ARCHITECTURE.md) - **System design and data flows**
- [Learning Summary](docs/LEARNING-SUMMARY.md) - **Educational resources and references**
- [Contributing Guide](CONTRIBUTING.md) - **How to contribute to the project**

## 🤝 Contributing

Contributions welcome! Please ensure:
- Code passes `make check` (lint + typecheck + test)
- Follow existing code patterns
- Update documentation as needed

## 📄 License

UNLICENSED - Private project
