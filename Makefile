# Nexus Development Makefile

.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


# Container runtime detection
# ========================================================
# Use podman-compose for container orchestration (via uv)
COMPOSE_CMD := uv run podman-compose


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
	@if ! python -c "import src" 2>/dev/null; then \
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
	uv run pytest tests/integration/ -v

.PHONY: test-coverage
test-coverage: check-deps ## Run tests with coverage report
	@echo "🧪 Running tests with coverage..."
	uv run pytest tests/ --cov=src --cov-report=html --cov-report=term --cov-config=pyproject.toml --cov-report=xml --junitxml=pytest-results.xml

.PHONY: test-fast
test-fast: check-deps ## Run tests with fail-fast and short traceback
	@echo "🧪 Running fast tests..."
	uv run pytest tests/ -x --tb=short

.PHONY: test-all
test-all: check-deps ## Run all tests
	@echo "🧪 Running all tests..."
	uv run pytest tests/ -v

.PHONY: test-all-parallel
test-all-parallel: check-deps ## Run tests in parallel
	@echo "🧪 Running tests in parallel..."
	uv run pytest tests/ -n auto


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
	uv run python -m nexus_api.main


# Database
# ========================================================
.PHONY: db-run
db-run: ## Start PostgreSQL database container (foreground, Ctrl+C to stop)
	@echo "🚀 Starting PostgreSQL database..."
	@echo "📍 Connection: postgresql://admin:admin@localhost:$${NEXUS_DB_PORT:-5432}/nexus_api"
	@echo "Press Ctrl+C to stop"
	@echo ""
	$(COMPOSE_CMD) -f podman-compose.yml up database

.PHONY: db-clean
db-clean: ## Stop database and remove all data (destructive)
	@echo "🧹 Stopping database and removing data..."
	@echo "⚠️  WARNING: This will delete all database data!"
	$(COMPOSE_CMD) -f podman-compose.yml down -v
	@echo "✅ Database stopped and data purged"


# Tools
# ========================================================
.PHONY: install-cursor-commands
install-cursor-commands: ## Sync Claude commands to Cursor format
	@echo "🔄 Syncing commands from .claude/ to .cursor/..."
	uv run python tools/install_cursor_commands.py


# Code quality
# ========================================================
.PHONY: check-path-sequence
check-path-sequence: ## Validate numbering sequence under specs/
	@echo "🔢 Validating numbered entries in specs/..."
	uv run python tools/ci/check_path_sequence.py specs/ --strict

.PHONY: format
format: ## Format code
	@echo "🎨 Formatting code..."
	uv run pre-commit run trailing-whitespace --all-files
	uv run pre-commit run end-of-file-fixer --all-files
	uv run pre-commit run mixed-line-ending --all-files
	uv run ruff format .
	uv run ruff check . --fix
	@find . -type f \( -name "*.yml" -o -name "*.yaml" \) -print0 | xargs -0 -r uvx yamlfmt -w
	@echo "✅ Code formatting completed"

.PHONY: lint
lint: ## Run linting and type checking with ruff and mypy
	@echo "📝 Running ruff linter..."
	uv run ruff check .
	@echo "🧪 Running YAML linting..."
	uvx yamllint src tests
	make typecheck --no-print-directory
	pre-commit run --all-files

.PHONY: typecheck
typecheck: ## Run type checking only with mypy
	@echo "🔍 Running type checking..."
	uv run mypy --strict src/ tests/
	@echo "✅ Type checking completed"


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
