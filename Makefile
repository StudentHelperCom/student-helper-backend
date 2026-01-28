.PHONY: help install build dev test clean docker-build docker-up docker-down docker-logs

help: ## Show this help
	@echo 'Usage: make <target>'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-20s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dcbb:
	docker-compose --profile backend build

dcbu:
	docker-compose --profile backend up -d

dcbd:
	docker-compose --profile backend down

dcfu:
	docker-compose --profile frontend up -d

dcfd:
	docker-compose --profile frontend down

dcau:
	docker-compose --profile all up -d

dcad:
	docker-compose --profile all down

dcbp:
	docker-compose --profile backend push