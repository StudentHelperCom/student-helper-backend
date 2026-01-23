.PHONY: help install build dev test clean docker-build docker-up docker-down docker-logs

help: ## Show this help
	@echo 'Usage: make <target>'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies
	npm install --legacy-peer-deps

build: ## Build all services
	npm run build

dev: ## Start development environment
	npm run dev

test: ## Run tests
	npm run test

lint: ## Run linter
	npm run lint

format: ## Format code
	npm run format

typecheck: ## Run type checking
	npm run typecheck

clean: ## Clean build artifacts and dependencies
	npm run clean
	rm -rf node_modules

docker-build: ## Build Docker images (optimized with BuildKit)
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 docker-compose build

docker-build-fast: ## Build Docker images with all optimizations
	@echo "🚀 Building with BuildKit optimizations..."
	DOCKER_BUILDKIT=1 COMPOSE_DOCKER_CLI_BUILD=1 BUILDKIT_PROGRESS=plain docker-compose build

docker-up: ## Start Docker containers
	docker-compose up -d

docker-down: ## Stop Docker containers
	docker-compose down

docker-logs: ## View Docker logs
	docker-compose logs -f

check: lint typecheck test ## Run all checks locally
	@echo "✅ All checks passed!"
