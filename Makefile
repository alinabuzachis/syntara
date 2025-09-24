# Nexus-NG Development Makefile

.PHONY: help install install-local deps-install-python deps-install-dev deps-install-uv install-pip venv test test-unit test-integration test-coverage test-fast test-parallel clean-test run dev format lint clean logs status check-deps setup docs

.PHONY: help
help: ## Show this help message
	@echo "Available targets:"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

# UV and Python environment setup
deps-install-uv: ## Install uv package manager
	@echo "📦 Installing uv package manager..."
	@if command -v uv >/dev/null 2>&1; then \
		echo "✅ uv is already installed"; \
		uv --version; \
	else \
		echo "Installing uv..."; \
		curl -LsSf https://astral.sh/uv/install.sh | sh; \
		echo "✅ uv installed successfully"; \
		echo "Please restart your shell or run 'source ~/.bashrc' to use uv"; \
	fi

deps-install-python: ## Install Python dependencies using uv
	@echo "📦 Installing Python dependencies with uv..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	uv sync
	@echo "✅ Dependencies installed successfully"

# Install dev dependencies
deps-install-dev: ## Install development dependencies
	@echo "📦 Installing development dependencies with uv..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	uv sync --extra dev
	@echo "✅ Development dependencies installed successfully"

_check-dependencies: ## Check if all dependencies are available
	# TODO check uv
	# TODO check python

install-pip: ## Install Python dependencies using pip (fallback)
	@echo "📦 Installing Python dependencies with pip..."
	python -m pip install -e ".[dev]"
	@echo "✅ Dependencies installed successfully"

# Virtual environment (fallback for systems without uv)
venv: ## Create a virtual environment using venv
	python3 -m venv venv
	./venv/bin/pip install -U pip setuptools
	./venv/bin/pip install -e ".[dev]"

# Testing targets
test: ## Run all tests
	@echo "🧪 Running all tests..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	uv run pytest tests/ -v

test-unit: ## Run unit tests only
	@echo "🧪 Running unit tests..."
	uv run pytest tests/ -m "not integration" -v

test-integration: ## Run integration tests
	@echo "🧪 Running integration tests..."
	uv run pytest tests/ -m "integration" -v

test-coverage: ## Run tests with coverage report
	@echo "🧪 Running tests with coverage..."
	uv run pytest tests/ --cov=src --cov-report=html --cov-report=term

test-fast: ## Run tests with fail-fast and short traceback
	@echo "🧪 Running fast tests..."
	uv run pytest tests/ -x --tb=short

test-parallel: ## Run tests in parallel
	@echo "🧪 Running tests in parallel..."
	uv run pytest tests/ -n auto

# Clean up test artifacts
clean-test: ## Clean up test artifacts
	@echo "🧹 Cleaning test artifacts..."
	rm -rf .coverage htmlcov/ .pytest_cache/ tests/__pycache__/ __pycache__/

# Running the application
run: check-deps ## Run the FastAPI application
	@echo "🚀 Starting Nexus-NG FastAPI server..."
	uv run python -m src.api.main

dev: check-deps ## Run the FastAPI application in development mode with auto-reload
	@echo "🚀 Starting Nexus-NG FastAPI server in development mode..."
	uv run uvicorn src.api.main:app --host 0.0.0.0 --port 8000 --reload

# Code quality
.PHONY: format
format: ## Format code with ruff and black
	@echo "🎨 Formatting code..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	uv run ruff format .
	uv run black .
	@echo "✅ Code formatting completed"

.PHONY: lint
lint: ## Run linting with ruff and mypy
	@echo "🔍 Running linters..."
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	uv run ruff check .
	uv run mypy src/
	@echo "✅ Linting completed"

# Utilities
status: ## Show status of all components
	@echo "📊 Nexus-NG Project Status"
	@echo "=========================="
	@echo ""
	@echo "🐍 Python Environment:"
	@if command -v uv >/dev/null 2>&1; then \
		echo "   ✅ uv: $$(uv --version)"; \
	else \
		echo "   ❌ uv not installed"; \
	fi
	@echo "   🐍 Python: $$(python --version)"
	@if python -c "import src" 2>/dev/null; then \
		echo "   ✅ nexus-ng package available"; \
	else \
		echo "   ❌ nexus-ng package not installed"; \
	fi
	@echo ""
	@echo "📁 Project Structure:"
	@if [ -d "src/" ]; then \
		echo "   ✅ src/ directory exists"; \
		echo "   📂 Modules: $$(find src/ -maxdepth 1 -type d ! -name src ! -name __pycache__ | wc -l) found"; \
	else \
		echo "   ❌ src/ directory missing"; \
	fi
	@if [ -f "pyproject.toml" ]; then \
		echo "   ✅ pyproject.toml exists"; \
	else \
		echo "   ❌ pyproject.toml missing"; \
	fi
	@echo ""
	@echo "🔧 Available Services:"
	@echo "   🌐 FastAPI: http://localhost:8000"
	@echo "   📚 API Docs: http://localhost:8000/docs"
	@echo "   📖 ReDoc: http://localhost:8000/redoc"

check-deps: ## Check if all dependencies are available
	@if ! command -v uv >/dev/null 2>&1; then \
		echo "❌ uv not found. Run 'make deps-install-uv' first"; \
		exit 1; \
	fi
	@if ! python -c "import src" 2>/dev/null; then \
		echo "❌ nexus-ng package not installed. Run 'make deps-install-python' first"; \
		exit 1; \
	fi

clean: ## Clean up temporary files and development environment
	@echo "🧹 Cleaning up development environment..."
	find . -type f -name "*.pyc" -delete || true
	find . -type d -name "__pycache__" -exec rm -rf {} + || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + || true
	rm -rf .ruff_cache/ || true
	rm -rf venv/ || true
	rm -rf .pytest_cache/ || true
	rm -rf htmlcov/ || true
	rm -f .coverage* coverage.xml || true
	rm -rf dist/ build/ *.egg-info/ || true
	@if command -v uv >/dev/null 2>&1; then \
		uv clean; \
	fi
	@echo "✅ Cleanup complete"

# Development workflow
setup: deps-install-uv deps-install-dev ## Complete setup from scratch
	@echo ""
	@echo "🎉 Nexus-NG setup complete!"
	@echo ""
	@echo "Ready to use:"
	@echo "  make dev     # Start development server"
	@echo "  make test    # Test the implementation"
	@echo "  make status  # Check system status"
	@echo "  make format  # Format code"
	@echo "  make lint    # Lint code"

# Documentation and information
docs: ## Show important URLs and information
	@echo "📚 Nexus-NG Documentation"
	@echo "========================="
	@echo ""
	@echo "🌐 Web Interfaces (when running):"
	@echo "   FastAPI App:    http://localhost:8000/"
	@echo "   API Docs:       http://localhost:8000/docs"
	@echo "   ReDoc:          http://localhost:8000/redoc"
	@echo "   Health Check:   http://localhost:8000/health"
	@echo "   App Info:       http://localhost:8000/info"
	@echo ""
	@echo "📁 Project Structure:"
	@echo "   src/api/        FastAPI application"
	@echo "   src/utils/      Utility functions"
	@echo "   tests/          Test files"
	@echo "   pyproject.toml  Project configuration"
	@echo "   Makefile        Development commands"
	@echo ""
	@echo "🔧 Development Commands:"
	@echo "   make setup      # Complete initial setup"
	@echo "   make dev        # Start development server"
	@echo "   make test       # Run all tests"
	@echo "   make format     # Format code"
	@echo "   make lint       # Lint code"
	@echo "   make status     # Check system status"
	@echo "   make clean      # Clean temporary files"

# Quick start commands
start: dev ## Alias for 'make dev' - start development server
stop: ## Stop the development server (use Ctrl+C)
	@echo "To stop the server, press Ctrl+C in the terminal where it's running"

logs: ## Show application logs (placeholder for future log file support)
	@echo "📋 Application logs will be shown in the terminal where 'make dev' is running"
	@echo "For persistent logging, consider redirecting output: make dev > app.log 2>&1 &"
