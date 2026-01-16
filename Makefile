# Nexus Development Makefile
# Local makefile (optional).
-include Makefile.local


.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


# Container runtime detection
# ========================================================
# Use podman-compose for container orchestration (via uv)
# Support multiple project instances via PODMAN_PROJECT environment variable
PODMAN_PROJECT ?= nexus
COMPOSE_CMD ?= uv run podman-compose
COMPOSE_ARGS ?= -p $(PODMAN_PROJECT) -f podman-compose.yml
COMPOSE_FINAL_CMD := $(COMPOSE_CMD) $(COMPOSE_ARGS)


# UV environment setup
# ========================================================
.PHONY: install
install: _deps-install-dev _deps-install-pre-commit ## Complete setup from scratch
	@echo ""
	@echo "🎉 Nexus setup complete!"
	@echo ""
	@echo "Ready to use:"
	@echo "  make help    # Show all available commands"

# Utilities
.PHONY: check-deps
check-deps: _check-dependency-binaries ## Check if all dependencies are available

_deps-install-dev: _check-uv
	@echo "📦 Installing development dependencies with uv..."
	uv sync --extra dev
	@echo "✅ Development dependencies installed successfully"

_deps-install-pre-commit:
	@echo "🪝 Installing pre-commit hooks..."
	uv run pre-commit install --hook-type commit-msg
	@echo "✅ Pre-commit hooks installed successfully"
	@echo "  To bypass hooks: git commit --no-verify"
	@echo "  To update hooks: make update-hooks"

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
.PHONY: test
test: test-unit ## Alias to unit tests

.PHONY: test-unit
test-unit: check-deps ## Run unit tests only
	@echo "🧪 Running unit tests..."
	uv run pytest tests/unit/ -v

.PHONY: test-integration
test-integration: check-deps ## Run integration tests
	@echo "🧪 Running integration tests..."
	uv run pytest tests/integration/ -v -m "not mcp"

.PHONY: test-mcp
test-mcp: check-deps ## Run MCP tests only
	@echo "🧪 Running MCP tests..."
	uv run pytest tests/ -v -m "mcp"

.PHONY: test-performance
test-performance: check-deps ## Run performance tests only (excluded from default test runs)
	@echo "🧪 Running performance tests..."
	uv run pytest tests/performance/ -v --run-performance

.PHONY: test-coverage
test-coverage: check-deps ## Run tests with coverage report (XML)
	@echo "🧪 Running tests with coverage..."
	uv run pytest tests/ -n auto -m "not mcp" --cov=src --cov-report=xml --cov-report=term --cov-config=pyproject.toml --junitxml=pytest-results.xml

.PHONY: test-coverage-report
test-coverage-report: check-deps ## Run tests with coverage report (HTML)
	@echo "🧪 Running tests with coverage..."
	uv run pytest tests/ -n auto -m "not mcp" --cov=src --cov-report=html --cov-report=term --cov-config=pyproject.toml --junitxml=pytest-results.xml

.PHONY: test-fast
test-fast: check-deps ## Run tests with fail-fast and short traceback
	@echo "🧪 Running fast tests..."
	uv run pytest tests/ -x --tb=short

.PHONY: test-all
test-all: check-deps ## Run all tests
	@echo "🧪 Running all tests..."
	uv run pytest tests/ -v -n auto -m "not mcp" --cov=src --cov-config=pyproject.toml

# Development workflow
# ========================================================
.PHONY: dev
dev: check-deps ## Run development server with auto-reload
	@echo "🔄 Running database migrations..."
	@uv run alembic upgrade head
	@echo "✅ Migrations complete"
	@echo "🚀 Starting Nexus API server..."
	@echo "📍 API URL: http://localhost:8000"
	@echo "📍 API Docs: http://localhost:8000/docs"
	@echo "Press Ctrl+C to stop"
	@echo ""
	uv run python -m nexus.api.main


# Database
# ========================================================
.PHONY: db-run
db-run: ## Start PostgreSQL database container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting PostgreSQL database..."
	@echo "📍 Connection: postgresql://admin:admin@localhost:$${NEXUS_DB_PORT:-5432}/nexus_api"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up database

.PHONY: db-clean
db-clean: ## Stop database and remove all data (destructive)
	@echo "🧹 Stopping database and removing data..."
	@echo "⚠️  WARNING: This will delete all database data!"
	$(COMPOSE_FINAL_CMD) down -v
	@echo "✅ Database stopped and data purged"

.PHONY: valkey-run
valkey-run: ## Start Valkey cache container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting Valkey/Redis cache..."
	@echo "📍 Connection: valkey://localhost:$${VALKEY_PORT:-6379}"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up valkey

.PHONY: valkey-clean
valkey-clean: ## Stop Valkey and remove data
	@echo "🧹 Stopping Valkey cache..."
	$(COMPOSE_FINAL_CMD) stop valkey || true
	@if podman container exists nexus_valkey_1 2>/dev/null; then \
		echo "Removing valkey container..."; \
		podman container rm -f nexus_valkey_1; \
	fi
	@echo "✅ Valkey stopped"


# Temporal
# ========================================================
.PHONY: temporal-run
temporal-run: ## Start Temporal server, UI, and worker (foreground, Ctrl+C to stop)
	@echo "🚀 Starting Temporal server, UI, and worker..."
	@echo "📍 Temporal Server: localhost:$${NEXUS_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${NEXUS_TEMPORAL_UI_PORT:-8081}"
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

.PHONY: build-images
build-images: ## Build container images for nexus and temporal-worker
	@echo "🔨 Building container images..."
	@echo "📦 Building nexus image..."
	$(COMPOSE_FINAL_CMD) build nexus
	@echo "✅ Container images built successfully"
	@echo "   Image: $${NEXUS_IMAGE:-localhost/nexus:latest}"

.PHONY: run-all
run-all: ## Start all services (foreground, Ctrl+C to stop)
	@echo "🚀 Starting all services..."
	@echo "📍 Nexus API: http://localhost:$${NEXUS_API_PORT:-8000}"
	@echo "📍 Nexus UI: http://localhost:$${NEXUS_UI_PORT:-8080}"
	@echo "📍 Database: postgresql://admin:admin@localhost:$${NEXUS_DB_PORT:-5432}/nexus_api"
	@echo "📍 Valkey Cache: valkey://localhost:$${VALKEY_PORT:-6379}"
	@echo "📍 Temporal Server: localhost:$${NEXUS_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${NEXUS_TEMPORAL_UI_PORT:-8081}"
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_FINAL_CMD) up --build

.PHONY: services-run
services-run: ## Start all services (database + valkey + temporal + UI + worker + MCP) in background
	@echo "🚀 Starting all services (database + valkey + temporal + UI + worker + MCP)..."
	@echo "📍 Database: postgresql://admin:admin@localhost:$${NEXUS_DB_PORT:-5432}/nexus_api"
	@echo "📍 Valkey Cache: valkey://localhost:$${VALKEY_PORT:-6379}"
	@echo "📍 Temporal Server: localhost:$${NEXUS_TEMPORAL_PORT:-7233}"
	@echo "📍 Temporal UI: http://localhost:$${NEXUS_TEMPORAL_UI_PORT:-8081}"
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	$(COMPOSE_FINAL_CMD) up --build -d database valkey temporal temporal-ui temporal-worker mcp-server
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
	$(COMPOSE_FINAL_CMD) logs -f database valkey temporal temporal-ui temporal-worker mcp-server


.PHONY: db-logs
db-logs: ## View database logs only
	@echo "📋 Viewing database logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f database

.PHONY: valkey-logs
valkey-logs: ## View Valkey cache logs only
	@echo "📋 Viewing Valkey cache logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f valkey

.PHONY: temporal-logs
temporal-logs: ## View Temporal server and worker logs
	@echo "📋 Viewing Temporal server and worker logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f temporal temporal-worker

.PHONY: temporal-ui-logs
temporal-ui-logs: ## View Temporal UI logs only
	@echo "📋 Viewing Temporal UI logs (project: $(PODMAN_PROJECT))..."
	$(COMPOSE_FINAL_CMD) logs -f temporal-ui

.PHONY: mcp-start
mcp-start: ## Start MCP server in background
	@echo "🚀 Starting MCP server..."
	@echo "📍 MCP Server: http://localhost:$${MCP_PORT:-8765}/mcp"
	$(COMPOSE_FINAL_CMD) up --build -d mcp-server
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


# Tools
# ========================================================
.PHONY: install-cursor-commands
install-cursor-commands: ## Sync Claude commands to Cursor format
	@echo "🔄 Syncing commands from .claude/ to .cursor/..."
	uv run python tools/install_cursor_commands.py

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
	BASE_BRANCH="$${BASE_ARG:-main}"; \
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

.PHONY: check-path-sequence
check-path-sequence: ## Validate numbering sequence under specs/
	@echo "🔢 Validating numbered entries in specs/..."
	uv run python tools/ci/check_path_sequence.py specs/ --strict

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
	@echo "📝 Checking YAML formatting..."
	@if command -v podman >/dev/null 2>&1; then \
		podman run --rm -v "$$(pwd):/project" --security-opt label=disable ghcr.io/google/yamlfmt:latest -lint -formatter include_document_start=true,retain_line_breaks=true,scan_folded_as_literal=true -gitignore_excludes -exclude '**/.venv/**' /project; \
	else \
		echo "⚠️  WARNING: podman not found, skipping yamlfmt check"; \
	fi
	@echo "📝 Running type checking..."
	$(MAKE) typecheck
	@echo "📝 Running path sequence validation..."
	$(MAKE) check-path-sequence
	@echo "📝 Running pre-commit validation checks..."
	SKIP=ruff-format,yamlfmt,trailing-whitespace,end-of-file-fixer,mixed-line-ending,mypy,check-path-sequence uv run pre-commit run --all-files
	@echo "✅ All lint checks passed"

.PHONY: typecheck
typecheck: ## Run type checking only with mypy
	@echo "🔍 Running type checking..."
	uv run mypy --strict src/ tests/
	@echo "✅ Type checking completed"

.PHONY: check-migrations
check-migrations: ## Validate migrations: conflicts, pending changes, and upgrade/downgrade (requires DB)
	@tools/ci/check_migrations.sh


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
		echo "uv clean"; \
		uv clean; \
	fi
	@echo "✅ Cleanup complete"
