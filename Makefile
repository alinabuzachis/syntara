# Nexus Development Makefile

.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'


# UV environment setup
# ========================================================
.PHONY: install
install: _deps-install-dev ## Complete setup from scratch
	@echo ""
	@echo "🎉 Nexus setup complete!"
	@echo ""
	@echo "Ready to use:"
	@echo "  make help    # Show all available commands"

# Utilities
.PHONY: check-deps
check-deps: _check-dependency-binaries ## Check if all dependencies are available

_deps-install-dev: _check-dependency-binaries
	@echo "📦 Installing development dependencies with uv..."
	uv sync --extra dev
	@echo "✅ Development dependencies installed successfully"
	@echo "🪝 Installing pre-commit hooks..."
	uv run pre-commit install --hook-type commit-msg
	@echo "✅ Pre-commit hooks installed successfully"
	@echo "  To bypass hooks: git commit --no-verify"
	@echo "  To update hooks: make update-hooks"

_check-dependency-binaries:
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Please install uv first: https://github.com/astral-sh/uv"; \
		exit 1; \
	fi
	@if ! python -c "import src" 2>/dev/null; then \
		echo "❌ nexus package not installed. Run 'make deps-install-dev' first"; \
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
dev: check-deps ## Run the hello world application
	@echo "🚀 Running hello world application..."
	uv run python src/api/main.py


# Code quality
# ========================================================
.PHONY: format
format: ## Format code with ruff
	@echo "🎨 Formatting code..."
	uv run ruff format .
	@find . -type f \( -name "*.yml" -o -name "*.yaml" \) -print0 | xargs -0 -r uv run yamlfmt -w
	uv run ruff check . --fix
	@echo "✅ Code formatting completed"

.PHONY: lint
lint: ## Run linting and type checking with ruff and mypy
	@echo "📝 Running ruff linter..."
	uv run ruff check .
	@echo "🧪 Running YAML linting..."
	uv run yamllint src tests
	make typecheck --no-print-directory

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
