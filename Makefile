.PHONY: install format lint test test-all typecheck dev gen-contracts \
       services-up services-down services-logs secrets db-migrate db-seed setup sync

# --- Development workflow ---

install:
	$(MAKE) -C backend install
	cd frontend && npm ci

dev:
	$(MAKE) -C backend dev &
	cd frontend && npm run start

setup: install secrets services-up db-migrate db-seed
	@echo ""
	@echo "Setup complete. Run 'make dev' to start the development servers."

# --- Code quality ---

format:
	$(MAKE) -C backend format
	cd frontend && npm run format

lint:
	$(MAKE) -C backend lint
	cd frontend && npm run lint

test:
	$(MAKE) -C backend test
	cd frontend && npm test

test-all:
	$(MAKE) -C backend test-all
	cd frontend && npm test

typecheck:
	$(MAKE) -C backend typecheck
	cd frontend && npx tsc --noEmit

# --- Infrastructure services (via root podman-compose.yml) ---

services-up:
	podman-compose up -d database redis temporal temporal-ui opa mcp-server
	@echo "Waiting for services to be healthy..."
	@sleep 5

services-down:
	podman-compose down

services-logs:
	podman-compose logs -f

# --- Database & secrets ---

secrets:
	$(MAKE) -C backend secrets-generate

db-migrate:
	cd backend && APP_ADMIN_PASSWORD_PATH=.secrets/admin-password uv run alembic upgrade head
	cd backend && uv run alembic -c alembic_audit.ini upgrade head

db-seed:
	$(MAKE) -C backend db-seed

# --- Contract generation ---

gen-contracts:
	cd frontend/packages/nexus-contracts && npm run gen:local

# --- Upstream sync (transition period) ---

sync:
	bash scripts/sync-from-upstream.sh
