# Nexus Development Makefile
# Local makefile (optional).
-include Makefile.local


.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z0-9_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


# Container runtime detection
# ========================================================
# Use podman-compose for container orchestration (via uv)
# Support multiple project instances via PODMAN_PROJECT environment variable
PODMAN_PROJECT ?= nexus
POSTGRES_IMAGE ?= quay.io/sclorg/postgresql-15-c9s
REDIS_IMAGE ?= mirror.gcr.io/library/redis:6
APP_IMAGE ?= localhost/nexus:latest
APP_UI_IMAGE ?= quay.io/ansible/nexus-ui
APP_UI_VERSION ?= latest
ifeq ($(shell uname -s),Darwin)
# macOS: try podman machine inspect first (works for any machine name),
# then the standard symlink, then Homebrew's common location
PODMAN_SOCK ?= $(or \
	$(wildcard $(HOME)/.local/share/containers/podman/machine/podman.sock),\
	$(shell podman machine inspect --format '{{.ConnectionInfo.PodmanSocket.Path}}' 2>/dev/null),\
	$(wildcard /var/run/podman/podman.sock)\
)
SED_INPLACE := sed -i ''
else
# Linux
PODMAN_SOCK ?= /run/user/$(shell id -u)/podman/podman.sock
SED_INPLACE := sed -i
endif
COMPOSE_CMD ?= uv run podman-compose
COMPOSE_ARGS ?= -p $(PODMAN_PROJECT) -f ../podman-compose.yml
COMPOSE_FINAL_CMD := $(COMPOSE_CMD) $(COMPOSE_ARGS)


# UV environment setup
# ========================================================
OPA_VERSION := v1.4.2

.PHONY: install
install: _deps-install-dev _deps-install-pre-commit _install-opa ## Complete setup from scratch
	@echo ""
	@echo "🎉 Nexus setup complete!"
	@echo ""
	@echo "Ready to use:"
	@echo "  make help    # Show all available commands"

# Utilities
.PHONY: check-deps
check-deps: _check-dependency-binaries _ensure-secrets ## Check if all dependencies are available

_deps-install-dev: _check-uv
	@echo "📦 Installing development dependencies with uv..."
	uv sync --extra dev
	@echo "✅ Development dependencies installed successfully"

.PHONY: install-integration
install-integration: _deps-install-dev ## Install integration test dependencies (requires SSH access to private repos)
	@echo "📦 Installing integration dependencies with uv..."
	uv sync --extra dev --extra integration
	@echo "✅ Integration dependencies installed successfully"

_deps-install-pre-commit:
	@echo "🪝 Installing pre-commit hooks..."
	uv run pre-commit install --hook-type commit-msg
	@echo "✅ Pre-commit hooks installed successfully"
	@echo "  To bypass hooks: git commit --no-verify"
	@echo "  To update hooks: make update-hooks"

.PHONY: install-opa
install-opa: _install-opa ## Install OPA CLI binary into .venv/bin

_install-opa:
	@if [ -x .venv/bin/opa ] && .venv/bin/opa version 2>/dev/null | grep -q "$(patsubst v%,%,$(OPA_VERSION))"; then \
		echo "✅ OPA $(OPA_VERSION) already installed"; \
	else \
		echo "📦 Installing OPA $(OPA_VERSION)..."; \
		OS=$$(uname -s | tr '[:upper:]' '[:lower:]'); \
		ARCH=$$(uname -m); \
		case "$${OS}_$${ARCH}" in \
			darwin_arm64)  BINARY="opa_darwin_arm64_static" ;; \
			darwin_x86_64) BINARY="opa_darwin_amd64" ;; \
			linux_x86_64)  BINARY="opa_linux_amd64_static" ;; \
			linux_aarch64) BINARY="opa_linux_arm64_static" ;; \
			*) echo "❌ Unsupported platform: $${OS}/$${ARCH}"; exit 1 ;; \
		esac; \
		curl -fsSL "https://github.com/open-policy-agent/opa/releases/download/$(OPA_VERSION)/$${BINARY}" -o .venv/bin/opa; \
		chmod +x .venv/bin/opa; \
		echo "✅ OPA $(OPA_VERSION) installed to .venv/bin/opa"; \
	fi

_check-uv:
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Please install uv first: https://github.com/astral-sh/uv"; \
		exit 1; \
	fi

_check-dependency-binaries: _check-uv
	@if ! uv run python -c "import src" 2>/dev/null; then \
		echo "❌ nexus package not installed. Run 'make install' first"; \
		exit 1; \
	fi


# Testing targets
# ========================================================

# run-tests: run pytest with testcontainers (Podman or Docker).
# Usage: $(call run-tests,<pytest-args>)
define run-tests
@PODMAN_SOCK="$(PODMAN_SOCK)" POSTGRES_IMAGE="$(POSTGRES_IMAGE)" REDIS_IMAGE="$(REDIS_IMAGE)" \
	APP_JWT_PRIVATE_KEY_PATH=.secrets/jwt-primary.pem \
	./tools/scripts/run-with-testcontainers.sh --label "🧪 Running tests" -- \
	uv run pytest $(1)
endef

E2E_IGNORE := --ignore=tests/e2e

.PHONY: test
test: test-unit ## Alias to unit tests

.PHONY: test-unit
test-unit: check-deps ## Run unit tests only
	$(call run-tests,tests/unit/ -v -n auto)

.PHONY: test-cli
test-cli: check-deps ## Run CLI package tests only
	$(call run-tests,tests/cli/ -v -n auto)

.PHONY: test-integration
test-integration: check-deps ## Run integration tests
	$(call run-tests,tests/integration/ -v -n auto -m "not mcp")

.PHONY: test-e2e-mcp
test-e2e-mcp: check-deps ## Run MCP E2E tests only
ifndef APP_BASE_URL
	$(call _e2e-run,tests/ -v -m "mcp")
else
	@echo "🧪 Running MCP tests..."
	SEGMENT_SERVER_URL=$${SEGMENT_SERVER_URL:-http://localhost:$(SEGMENT_SERVER_PORT)} \
	uv run pytest tests/ -v -m "mcp"
endif

.PHONY: test-performance
test-performance: check-deps ## Run performance tests only (excluded from default test runs)
	@echo "🧪 Running performance tests..."
	uv run pytest tests/performance/ -v --run-performance

# Coverage targets - separate and combined
# ========================================================

.PHONY: test-unit-coverage
test-unit-coverage: check-deps ## Run unit tests with coverage report
	@echo "📊 Running unit tests with coverage..."
	$(call run-tests,tests/unit/ -v -n auto --cov=src --cov-report=html:htmlcov-unit --cov-report=term --cov-config=pyproject.toml --cov-fail-under=0)
	@echo "✅ Unit test coverage report: htmlcov-unit/index.html"

.PHONY: test-cli-coverage
test-cli-coverage: check-deps ## Run CLI tests with coverage report
	@echo "📊 Running CLI tests with coverage..."
	$(call run-tests,tests/cli/ -v -n auto --cov=src --cov-report=html:htmlcov-cli --cov-report=term --cov-config=pyproject.toml --cov-fail-under=0)
	@echo "✅ CLI test coverage report: htmlcov-cli/index.html"

.PHONY: test-integration-coverage
test-integration-coverage: check-deps ## Run integration tests with coverage report
	@echo "📊 Running integration tests with coverage..."
	$(call run-tests,tests/integration/ -v -n auto -m "not mcp" --cov=src --cov-report=html:htmlcov-integration --cov-report=term --cov-config=pyproject.toml --cov-fail-under=0)
	@echo "✅ Integration test coverage report: htmlcov-integration/index.html"

.PHONY: test-coverage
test-coverage: check-deps ## Run tests with combined coverage report (XML for CI)
	$(call run-tests,tests/ -n auto -m "not mcp" $(E2E_IGNORE) --cov=src --cov-report=xml --cov-report=term --cov-config=pyproject.toml --junitxml=pytest-results.xml)

.PHONY: test-coverage-report
test-coverage-report: check-deps ## Run tests with combined coverage report (HTML)
	$(call run-tests,tests/ -n auto -m "not mcp" $(E2E_IGNORE) --cov=src --cov-report=html --cov-report=term --cov-config=pyproject.toml --junitxml=pytest-results.xml)

.PHONY: test-fast
test-fast: check-deps ## Run tests with fail-fast and short traceback
	$(call run-tests,tests/ -x --tb=short $(E2E_IGNORE))

.PHONY: test-all
test-all: check-deps ## Run all tests
	$(call run-tests,tests/ -v -n auto -m "not mcp" --cov=src --cov-config=pyproject.toml $(E2E_IGNORE))

SEGMENT_SERVER_PORT ?= 9999

# _e2e-run: shared infrastructure setup for all e2e targets.
# Starts mock Segment, database, Temporal, OPA, and the API server,
# then runs the pytest command passed as $(1).
# Usage: $(call _e2e-run,<pytest-args>)
define _e2e-run
@COMPOSE_CMD="$(COMPOSE_FINAL_CMD)" SEGMENT_SERVER_PORT="$(SEGMENT_SERVER_PORT)" \
	./tools/scripts/e2e-run.sh $(1)
endef

# Default to empty so it runs all tests if not provided
E2E_TARGET ?=

.PHONY: test-e2e
test-e2e: check-deps ## Run all E2E tests (starts full stack)
ifndef APP_BASE_URL
	$(call _e2e-run,tests/e2e/$(E2E_TARGET) -v)
else
	@echo "🧪 Running end to end tests..."
	SEGMENT_SERVER_URL=$${SEGMENT_SERVER_URL:-http://localhost:$(SEGMENT_SERVER_PORT)} \
	uv run pytest tests/e2e/$(E2E_TARGET) -v
endif

.PHONY: test-e2e-telemetry
test-e2e-telemetry: check-deps ## Run telemetry E2E tests only
ifndef APP_BASE_URL
	$(call _e2e-run,tests/e2e/telemetry/ -v -n auto --dist loadscope --ignore=tests/e2e/telemetry/test_performance_and_resilience.py && SEGMENT_SERVER_URL=http://localhost:$(SEGMENT_SERVER_PORT) APP_BASE_URL=$${APP_BASE_URL:-http://localhost:8000} uv run pytest tests/e2e/telemetry/test_performance_and_resilience.py -v)
else
	@echo "🧪 Running telemetry E2E tests..."
	SEGMENT_SERVER_URL=$${SEGMENT_SERVER_URL:-http://localhost:$(SEGMENT_SERVER_PORT)} \
	uv run pytest tests/e2e/telemetry/ -v -n auto --dist loadscope --ignore=tests/e2e/telemetry/test_performance_and_resilience.py && \
	SEGMENT_SERVER_URL=$${SEGMENT_SERVER_URL:-http://localhost:$(SEGMENT_SERVER_PORT)} \
	uv run pytest tests/e2e/telemetry/test_performance_and_resilience.py -v
endif

# Development workflow
# ========================================================
.PHONY: db-seed
db-seed: check-deps ## Run all required database seeders
	@echo "🌱 Seeding database..."
	@uv run python -m nexus.seed
	@echo "✅ Seeding complete"

.PHONY: admin-password
admin-password: check-deps _ensure-secrets ## Sync bootstrap admin password from .secrets/admin-password
	@echo "🔐 Syncing bootstrap admin password..."
	@APP_ADMIN_PASSWORD_PATH=.secrets/admin-password uv run python tools/set_admin_password.py < .secrets/admin-password
	@echo "✅ Bootstrap admin password synced"

.PHONY: db-seed-all
db-seed-all: check-deps ## Run all database seeders including dev samples
	@echo "🌱 Seeding database (including samples)..."
	@uv run python -m nexus.seed --all
	@echo "✅ Seeding complete"

.PHONY: dev
dev: check-deps _ensure-secrets ## Run development server with auto-reload
	@echo "🔄 Running database migrations..."
	@APP_ADMIN_PASSWORD_PATH=.secrets/admin-password uv run alembic upgrade head
	@$(MAKE) db-seed
	@echo "✅ Migrations and seeding complete"
	@echo "🚀 Starting Nexus API server..."
	@echo "📍 API URL: http://localhost:8000"
	@echo "📍 API Docs: http://localhost:8000/docs"
	@echo "Press Ctrl+C to stop"
	@echo ""
	APP_JWT_PRIVATE_KEY_PATH=.secrets/jwt-primary.pem \
	APP_JWT_BACKUP_KEYS='[{"key_id":"nexus-backup","key_path":".secrets/jwt-backup.pem"}]' \
	APP_SECRET_ENCRYPTION_KEY_PATH=.secrets/encryption-key \
	uv run python -m nexus.api.main


# Database
# ========================================================
.PHONY: db-run
db-run: ## Start PostgreSQL database container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting PostgreSQL database..."
	@echo "📍 Connection: postgresql://admin:admin@localhost:$${APP_DB_PORT:-5432}/nexus_api"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up database

.PHONY: db-clean
db-clean: ## Stop database and remove all data (destructive)
	@echo "🧹 Stopping database and removing data..."
	@echo "⚠️  WARNING: This will delete all database data!"
	$(COMPOSE_FINAL_CMD) down -v
	@echo "✅ Database stopped and data purged"

.PHONY: cache-run
cache-run: ## Start cache container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting cache server..."
	@echo "📍 Connection: cache://localhost:$${APP_CACHE_PORT:-6379}"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up redis

.PHONY: cache-clean
cache-clean: ## Stop cache and remove data
	@echo "🧹 Stopping cache server..."
	$(COMPOSE_FINAL_CMD) stop redis || true
	@if podman container exists nexus_redis_1 2>/dev/null; then \
		echo "Removing redis container..."; \
		podman container rm -f nexus_redis_1; \
	fi
	@echo "✅ Cache stopped"


# Temporal
# ========================================================
.PHONY: temporal-run
temporal-run: ## Start Temporal server, UI, and worker (foreground, Ctrl+C to stop)
	@echo "🚀 Starting Temporal server, UI, and worker..."
	@echo "📍 Temporal Server: localhost:$${APP_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${APP_TEMPORAL_UI_PORT:-8081}"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up temporal temporal-ui temporal-worker

.PHONY: temporal-clean
temporal-clean: ## Stop Temporal and remove data
	@echo "🧹 Stopping Temporal server and UI..."
	$(COMPOSE_FINAL_CMD) stop temporal temporal-ui || true
	@for container in nexus_temporal_1 nexus_temporal-ui_1; do \
		if podman container exists $$container 2>/dev/null; then \
			echo "Removing $$container..."; \
			podman container rm -f $$container; \
		fi; \
	done
	@echo "✅ Temporal stopped"


# OPA (Authorization)
# ========================================================
.PHONY: opa-run
opa-run: ## Start OPA server (foreground, Ctrl+C to stop)
	@echo "Starting OPA server..."
	@echo "OPA API: http://localhost:$${NEXUS_OPA_PORT:-8181}"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up opa

.PHONY: opa-clean
opa-clean: ## Stop OPA server
	@echo "Stopping OPA server..."
	$(COMPOSE_FINAL_CMD) stop opa || true
	@echo "OPA stopped"

.PHONY: opa-logs
opa-logs: ## View OPA server logs
	@echo "Viewing OPA logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f opa

.PHONY: build-images
build-images: ## Build container images for nexus and temporal-worker
	@echo "🔨 Building container images..."
	@echo "📦 Building nexus image..."
	$(COMPOSE_FINAL_CMD) build nexus
	@echo "✅ Container images built successfully"
	@echo "   Image: $${APP_IMAGE:-localhost/nexus:latest}"


# Secrets management
# ========================================================
.PHONY: secrets-generate
secrets-generate: ## Generate JWT signing keys for development
	@./tools/generate_secrets.sh

.PHONY: secrets-generate-force
secrets-generate-force: ## Regenerate JWT signing keys (overwrites existing)
	@./tools/generate_secrets.sh --force

.PHONY: secrets-clean
secrets-clean: ## Remove generated secrets
	@echo "🗑️  Removing secrets..."
	@rm -rf .secrets/
	@echo "✅ Secrets removed"

.PHONY: generate-token
generate-token: _ensure-secrets ## Generate a JWT token for testing (ROLE=creator|approver|administrator|viewer KEY=primary|backup)
	@# -T disables TTY so uv progress bars and ANSI escapes stay on stderr instead of merging into stdout
	@$(COMPOSE_FINAL_CMD) exec -T nexus -- sh -c 'uv run python tools/generate_jwt.py --json $(if $(ROLE),--role "$(ROLE)") $(if $(KEY),--key "$(KEY)")' | jq -r .access_token

.PHONY: _ensure-secrets
_ensure-secrets:
	@if [ ! -f .secrets/jwt-primary.pem ] || [ ! -f .secrets/jwt-backup.pem ] || [ ! -f .secrets/admin-password ] || [ ! -f .secrets/encryption-key ]; then \
		echo "🔐 Generating secrets..."; \
		./tools/generate_secrets.sh; \
	fi

.PHONY: run-all
run-all: _ensure-secrets ## Start all services (foreground, Ctrl+C to stop)
	@echo "🚀 Starting all services..."
	@echo "📍 Nexus API: http://localhost:$${APP_API_PORT:-8000}"
	@echo "📍 Nexus UI: http://localhost:$${APP_UI_PORT:-8080}"
	@echo "📍 Database: postgresql://admin:admin@localhost:$${APP_DB_PORT:-5432}/nexus_api"
	@echo "📍 Cache: cache://localhost:$${APP_CACHE_PORT:-6379}"
	@echo "📍 Temporal Server: localhost:$${APP_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${APP_TEMPORAL_UI_PORT:-8081}"
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up --build --force-recreate

.PHONY: services-run
services-run: _ensure-secrets ## Start all services (database + cache + temporal + UI + worker + MCP) in background
	@echo "🚀 Starting all services (database + cache + temporal + UI + worker + MCP)..."
	@echo "📍 Database: postgresql://admin:admin@localhost:$${APP_DB_PORT:-5432}/nexus_api"
	@echo "📍 Cache: cache://localhost:$${APP_CACHE_PORT:-6379}"
	@echo "📍 Temporal Server: localhost:$${APP_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${APP_TEMPORAL_UI_PORT:-8081}"
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	$(COMPOSE_FINAL_CMD) up --build --force-recreate -d database redis temporal temporal-ui temporal-worker mcp-server opa
	@echo "✅ All services started in background"
	@echo "   Use 'make services-logs' to view logs"
	@echo "   Use 'make services-stop' to stop services"

.PHONY: services-stop
services-stop: ## Stop all services
	@echo "🛑 Stopping all services..."
	$(COMPOSE_FINAL_CMD) stop
	@echo "✅ All services stopped"

.PHONY: services-logs
services-logs: ## View logs from all services
	@echo "📋 Viewing logs from all services (project: $(PODMAN_PROJECT))..."
	@echo "   Press Ctrl+C to exit"
	@echo ""
	$(COMPOSE_FINAL_CMD) ps
	@echo ""
	@for c in $$($(COMPOSE_FINAL_CMD) ps --format '{{.Names}}'); do \
		podman logs -f "$$c" 2>&1 | sed "s/^/[$$(echo $$c | sed 's/$(PODMAN_PROJECT)_//;s/_1$$//')] /" & \
	done; wait


.PHONY: db-logs
db-logs: ## View database logs only
	@echo "📋 Viewing database logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f database

.PHONY: cache-logs
cache-logs: ## View cache server logs only
	@echo "📋 Viewing cache server logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f redis

.PHONY: temporal-logs
temporal-logs: ## View Temporal server and worker logs
	@echo "📋 Viewing Temporal server and worker logs (project: $(PODMAN_PROJECT))..."
	@for c in temporal temporal-worker; do \
		podman logs -f "$(PODMAN_PROJECT)_$${c}_1" 2>&1 | sed "s/^/[$$c] /" & \
	done; wait

.PHONY: temporal-ui-logs
temporal-ui-logs: ## View Temporal UI logs only
	@echo "📋 Viewing Temporal UI logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f temporal-ui

.PHONY: mcp-start
mcp-start: ## Start MCP server in background
	@echo "🚀 Starting MCP server..."
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	$(COMPOSE_FINAL_CMD) up --build --force-recreate -d mcp-server
	@echo "✅ MCP server started in background"
	@echo "   Use 'make mcp-logs' to view logs"
	@echo "   Use 'make mcp-stop' to stop server"

.PHONY: mcp-stop
mcp-stop: ## Stop MCP server
	@echo "🛑 Stopping MCP server..."
	$(COMPOSE_FINAL_CMD) stop mcp-server
	@echo "✅ MCP server stopped"

.PHONY: mcp-logs
mcp-logs: ## View MCP server logs only
	@echo "📋 Viewing MCP server logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f mcp-server

.PHONY: run-clean
run-clean: ## Stop all services and remove all data (destructive)
	@echo "🧹 Stopping all services and removing data..."
	@echo "⚠️  WARNING: This will delete all database and Temporal data!"
	$(COMPOSE_FINAL_CMD) down -v
	@echo "✅ All services stopped and data purged"

.PHONY: services-clean
services-clean: ## Stop all services and remove all data (destructive)
	@echo "🧹 Stopping all services and removing data..."
	@echo "⚠️  WARNING: This will delete all database and Temporal data!"
	$(COMPOSE_FINAL_CMD) down -v
	@echo "✅ All services stopped and data purged"


# API spec governance
# ========================================================
OPENAPI_SPEC ?= src/nexus/schemas/openapi.yaml
OPENAPI_BASE_REF ?= devel
VERBOSITY ?= -v

.PHONY: api-spec-validation
api-spec-validation: ## Validate syntax of OpenAPI and AsyncAPI spec files
	@echo "🔍 Validating API specifications..."
	@uv run python tools/ci/validate_api_specs.py

.PHONY: verify-test-structure
verify-test-structure: ## Verify test directory structure matches source code domains
	@uv run python tools/ci/verify_test_structure.py

.PHONY: api-spec-drift
api-spec-drift: ## Check that committed openapi.yaml matches the generated spec (VERBOSITY=-v/-vv/-vvv)
	@echo "🔍 Checking OpenAPI spec is up to date..."
	@uv run python tools/export_openapi.py 2>/dev/null | uv run python tools/ci/check_openapi_spec.py $(OPENAPI_SPEC) $(VERBOSITY)

.PHONY: api-spec-bundle
api-spec-bundle: ## Bundle all domain sub-specs into a single merged openapi.yaml (no external $refs)
	@echo "📦 Bundling OpenAPI sub-specs..."
	uv run python tools/bundle_openapi.py -o $(OPENAPI_SPEC)
	@uv run pre-commit run yamlfmt --files $(OPENAPI_SPEC) > /dev/null 2>&1 || true
	@echo "✅ Bundled spec written to $(OPENAPI_SPEC)"


# Tools
# ========================================================
.PHONY: generate-api-client
generate-api-client: ## Generate the Nexus Python API client from the OpenAPI spec
	@echo "Generating client from $(OPENAPI_SPEC)..."
	$(eval TMPDIR := $(shell mktemp -d))
	uv run openapi-python-client generate \
		--path $(OPENAPI_SPEC) \
		--output-path $(TMPDIR)/nexus_api_client \
		--custom-template-path tools/api_custom_templates \
		--meta uv
	@rm -rf src/api_client
	@mv $(TMPDIR)/nexus_api_client src/api_client
	@rm -rf $(TMPDIR)
	@find src/api_client -type f \( -name '*.py' -o -name '*.md' -o -name '*.toml' -o -name '*.typed' -o -name '*.txt' \) -exec $(SED_INPLACE) 's/[[:space:]]*$$//' {} +
	@find src/api_client -type f \( -name '*.py' -o -name '*.md' -o -name '*.toml' -o -name '*.typed' -o -name '*.txt' \) -exec sh -c 'test -s "$$1" && [ "$$(tail -c1 "$$1" | wc -l)" -eq 0 ] && echo >> "$$1"' _ {} \;
	@echo "Done. Client written to src/api_client/"

# Capture positional arguments for init-worktree
WORKTREE_ARGS := $(filter-out init-worktree,$(MAKECMDGOALS))

.PHONY: init-worktree
init-worktree: ## Initialize a new git worktree (usage: make init-worktree <branch> [base] [python-version])
	@# Extract positional arguments
	@ARGS=($(WORKTREE_ARGS)); \
	BRANCH_ARG="$${ARGS[0]:-$(BRANCH)}"; \
	BASE_ARG="$${ARGS[1]:-$(BASE)}"; \
	PYTHON_ARG="$${ARGS[2]:-$(PYTHON)}"; \
	\
	if [ -z "$$BRANCH_ARG" ]; then \
		echo "❌ Error: Branch name is required"; \
		echo ""; \
		echo "Usage:"; \
		echo "  make init-worktree <branch> [base] [python-version]"; \
		echo ""; \
		echo "Examples:"; \
		echo "  make init-worktree feature-auth"; \
		echo "  make init-worktree feature-auth develop"; \
		echo "  make init-worktree feature-auth main python3.12"; \
		echo ""; \
		echo "Alternative syntax (still supported):"; \
		echo "  make init-worktree BRANCH=feature-auth BASE=develop PYTHON=python3.12"; \
		echo ""; \
		echo "See docs/development-with-worktrees.md for more information"; \
		exit 1; \
	fi; \
	\
	BASE_BRANCH="$${BASE_ARG:-devel}"; \
	PYTHON_VER="$${PYTHON_ARG:-python3.13}"; \
	\
	echo "🌿 Initializing git worktree..."; \
	echo "   Branch: $$BRANCH_ARG"; \
	echo "   Base: $$BASE_BRANCH"; \
	echo "   Python: $$PYTHON_VER"; \
	echo ""; \
	./tools/init-git-worktree.sh "$$BRANCH_ARG" "$$BASE_BRANCH" --python "$$PYTHON_VER"

# Dummy target to handle positional arguments as make targets
ifneq ($(filter init-worktree,$(MAKECMDGOALS)),)
$(WORKTREE_ARGS):
	@:
endif

# Code quality
# ========================================================
FORMAT_PATHS := src/ tools/ tests/

.PHONY: reachability
reachability: ## Verify all standards docs are reachable from CLAUDE.md
	@echo "🔍 Checking standards reachability from CLAUDE.md..."
	uv run python tools/reachability.py --check --max-depth 3

.PHONY: sync-requirements
sync-requirements: ## Check/sync requirements.txt with uv.lock
	@echo "🔍 Syncing requirements.txt with uv.lock..."
	uv export --frozen --python=3.12 --no-dev --no-editable --no-emit-workspace --output-file requirements.txt
	@echo "✅ requirements.txt is in sync"

.PHONY: format
format: ## Format code with ruff and pre-commit formatters
	@echo "🎨 Formatting code..."
	make ruff
	uv run pre-commit run trailing-whitespace --all-files
	uv run pre-commit run end-of-file-fixer --all-files
	uv run pre-commit run mixed-line-ending --all-files
	uv run pre-commit run yamlfmt --all-files
	@echo "✅ Code formatting completed"

.PHONY: ruff
ruff: ## Format code with ruff
	uv run ruff format $(FORMAT_PATHS)
	uv run ruff check $(FORMAT_PATHS) --fix

.PHONY: lint
lint: ## Run linters and type checking (no file modifications)
	@echo "📝 Running ruff linter..."
	uv run ruff check $(FORMAT_PATHS)
	@echo "📝 Running ruff format check..."
	uv run ruff format --check $(FORMAT_PATHS)
	@echo "📝 Checking file formatting..."
	uv run python tools/ci/check_file_formatting.py
	@echo "📝 Running type checking..."
	$(MAKE) typecheck
	@echo "📝 Running pre-commit validation checks..."
	SKIP=ruff-format,trailing-whitespace,end-of-file-fixer,mixed-line-ending,pyrefly,check-api-paths uv run pre-commit run --all-files
	@echo "✅ All lint checks passed"

.PHONY: typecheck
typecheck: ## Run type checking only with mypy
	@echo "🔍 Running type checking..."
	uv run mypy --strict src/ tests/
	@echo "✅ Type checking completed"

.PHONY: typecheck-pyrefly
typecheck-pyrefly: ## Run type checking with pyrefly (~3s, used in pre-commit)
	@echo "🔍 Running type checking (pyrefly)..."
	uv run --with pyrefly pyrefly check
	@echo "✅ Type checking completed"

.PHONY: check-migrations
check-migrations: _ensure-secrets ## Validate migrations: conflicts, pending changes, and upgrade/downgrade (uses testcontainers)
	@PODMAN_SOCK="$(PODMAN_SOCK)" POSTGRES_IMAGE="$(POSTGRES_IMAGE)" APP_ADMIN_PASSWORD_PATH=.secrets/admin-password \
		./tools/scripts/run-with-testcontainers.sh --label "🔍 Checking migrations" -- \
		uv run python tools/ci/check_migrations.py


# Static analysis
# ========================================================
.PHONY: check-api-paths
check-api-paths: ## Check API endpoint paths use snake_case (no hyphens)
	@echo "🔍 Checking API path naming..."
	uv run python tools/ci/check_api_path_naming.py
	@echo "✅ API path naming check passed"

.PHONY: check-dead-code
check-dead-code: ## Check for dead code with vulture
	@echo "🔍 Checking for dead code..."
	uv run vulture src/nexus/
	@echo "✅ No dead code detected"

.PHONY: check-cycles
check-cycles: ## Check for new import cycles with pyan3
	@echo "🔍 Checking for import cycles..."
	uv run pyan3 --module-level --cycles \
		--exclude 'test_*.py' --exclude '*/tests/*' --exclude '*_test.py' \
		--root src src/nexus/**/*.py 2>/dev/null | \
		uv run python tools/ci/check_import_cycles.py
	@echo "✅ No new import cycles detected"

.PHONY: check-orphans
check-orphans: ## Check for unimported Python modules
	@echo "🔍 Checking for orphan modules..."
	uv run python tools/ci/check_orphan_modules.py
	@echo "✅ No new orphan modules detected"


.PHONY: check-openapi-breaking
check-openapi-breaking: ## Check OpenAPI spec for breaking changes against devel branch
	@echo "Checking OpenAPI spec for breaking changes..."
	@if ! command -v oasdiff &> /dev/null; then \
		echo "Installing oasdiff..."; \
		./scripts/openapi/install-oasdiff.sh; \
	fi
	@PR_BODY_TEXT="$${PR_BODY:-$${OPENAPI_PR_BODY:-}}"; \
	if [ -n "$$PR_BODY_TEXT" ]; then \
		./scripts/openapi/check-breaking-changes.py \
			--base $(OPENAPI_BASE_REF) \
			--head HEAD \
			--format text \
			--pr-body "$$PR_BODY_TEXT"; \
	else \
		./scripts/openapi/check-breaking-changes.py \
			--base $(OPENAPI_BASE_REF) \
			--head HEAD \
			--format text; \
	fi
	@echo "OpenAPI breaking changes check complete"

.PHONY: check-openapi-breaking-pre-commit
check-openapi-breaking-pre-commit: ## Pre-commit: breaking changes when openapi.yaml changed vs base ref
	@BASE_REF=""; \
	if git rev-parse --verify $(OPENAPI_BASE_REF) >/dev/null 2>&1; then \
		BASE_REF="$(OPENAPI_BASE_REF)"; \
	elif git rev-parse --verify origin/$(OPENAPI_BASE_REF) >/dev/null 2>&1; then \
		BASE_REF="origin/$(OPENAPI_BASE_REF)"; \
	fi; \
	if [ -n "$$BASE_REF" ] && git diff --quiet "$$BASE_REF" -- $(OPENAPI_SPEC) 2>/dev/null; then \
		echo "OpenAPI spec unchanged vs $$BASE_REF, skipping breaking changes check"; \
		exit 0; \
	fi; \
	if [ -z "$$BASE_REF" ]; then \
		BASE_REF="$(OPENAPI_BASE_REF)"; \
	fi; \
	$(MAKE) check-openapi-breaking OPENAPI_BASE_REF="$$BASE_REF"

.PHONY: check-openapi-companion
check-openapi-companion: ## Check if frontend contracts are regenerated for OpenAPI changes
	@echo "Checking if frontend contracts are up to date..."
	@./scripts/openapi/check-companion-pr.py \
		--changed-files-from $(OPENAPI_BASE_REF) \
		--format text

.PHONY: check-openapi
check-openapi: check-openapi-breaking check-openapi-companion ## Run all OpenAPI checks


# Pre-commit targets
# ========================================================
.PHONY: update-hooks
update-hooks: ## Update pre-commit hooks to latest versions
	@echo "🔄 Updating pre-commit hooks..."
	uv run pre-commit autoupdate
	@echo "✅ Pre-commit hooks updated successfully"


# Clean targets
# ========================================================
.PHONY: _clean-test
_clean-test:
	@echo "🧹 Cleaning test artifacts..."
	rm -f .coverage
	rm -rf htmlcov/
	rm -rf .pytest_cache/
	rm -rf tests/__pycache__/
	rm -rf __pycache__/

.PHONY: clean
clean: _clean-test ## Clean up temporary files and development environment
	@echo "🧹 Cleaning up development environment..."
	find . -type f -name "*.pyc" -delete || true
	find . -type d -name "__pycache__" -exec rm -rf {} + || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
	rm -rf .ruff_cache/
	rm -rf .mypy_cache/
	rm -rf dist/ build/ *.egg-info/
	@if command -v uv >/dev/null 2>&1; then \
		echo "uv clean --force"; \
		uv clean --force; \
	fi
	@echo "✅ Cleanup complete"
