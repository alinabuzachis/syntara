COMPOSE_CMD ?= uv run podman-compose

.PHONY: help install format lint test test-all typecheck dev gen-contracts \
       services-up services-down services-logs secrets db-migrate db-seed setup sync \
       pre-commit-install

help: ## Show available targets
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# --- Development workflow ---

install: ## Install backend and frontend dependencies
	$(MAKE) -C backend install
	cd frontend && npm ci
	$(MAKE) pre-commit-install

pre-commit-install: ## Install pre-commit hooks
	uv run pre-commit install
	uv run pre-commit install --hook-type commit-msg

dev: ## Start backend API and frontend dev servers
	$(MAKE) -C backend dev &
	cd frontend && npm run start

setup: install secrets services-up db-migrate db-seed ## One-shot bootstrap: install, secrets, services, migrations, seed
	@echo ""
	@echo "Setup complete. Run 'make dev' to start the development servers."

# --- Code quality ---

format: ## Format both codebases
	$(MAKE) -C backend format
	cd frontend && npm run format

lint: ## Lint both codebases
	$(MAKE) -C backend lint
	cd frontend && npm run lint

test: ## Run backend and frontend tests
	$(MAKE) -C backend test
	cd frontend && npm test

test-all: ## Run all tests including integration
	$(MAKE) -C backend test-all
	cd frontend && npm test

typecheck: ## Type-check both codebases
	$(MAKE) -C backend typecheck
	cd frontend && npx tsc --noEmit

# --- Infrastructure services (via root podman-compose.yml) ---

services-up: ## Start all infrastructure services in background
	$(COMPOSE_CMD) up -d database redis temporal temporal-ui temporal-worker opa mcp-server
	@echo "Waiting for services to be healthy..."
	@sleep 5

services-down: ## Stop all services
	$(COMPOSE_CMD) down

services-logs: ## Tail logs from all services
	$(COMPOSE_CMD) logs -f

# --- Database & secrets ---

secrets: ## Generate JWT keys, admin password, encryption key
	$(MAKE) -C backend secrets-generate

db-migrate: ## Run main and audit database migrations
	cd backend && APP_ADMIN_PASSWORD_PATH=.secrets/admin-password uv run alembic upgrade head
	cd backend && uv run alembic -c alembic_audit.ini upgrade head

db-seed: ## Seed the database with required data
	$(MAKE) -C backend db-seed

# --- Contract generation ---

gen-contracts: ## Regenerate TypeScript types from backend OpenAPI specs
	cd frontend/packages/nexus-contracts && npm run gen:local

# --- Upstream sync (transition period) ---

sync: ## Pull latest changes from upstream nexus and nexus-ui repos
	bash scripts/sync-from-upstream.sh
