# Nexus

A distributed multi-agent system. Nexus enables coordinated AI agents to work together on complex tasks.
[![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/syntara-orchestration/syntara-to-be-renamed/graphs/commit-activity)
[![CI](https://github.com/syntara-orchestration/syntara-to-be-renamed/actions/workflows/ci.yml/badge.svg)](https://github.com/syntara-orchestration/syntara-to-be-renamed/actions/workflows/ci.yml)
[![Python Version](https://img.shields.io/badge/python-3.9%20%7C%203.10%20%7C%203.11%20%7C%203.12-blue.svg)](https://pypi.python.org/pypi/)
[![Code style: ruff](https://img.shields.io/badge/code%20style-ruff-000000.svg)](https://github.com/astral-sh/ruff)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

## Developer Workflow

This project uses `uv` for dependency management and provides a comprehensive Makefile for development tasks.

### Prerequisites

- Python 3.12 (strict version requirement)
- `uv` package manager

### Installation

1. **Install uv** (if not already installed):
   ```bash
   curl -LsSf https://astral.sh/uv/install.sh | sh
   ```

2. **Clone and setup the project**:
   ```bash
   git clone git@github.com:syntara-orchestration/syntara.git
   cd nexus
   make install
   ```

### Quick Start

```bash
# Install dependencies and setup project
make install

# Start the development server
make dev

# Run tests
make test-all

# Check code quality
make lint
```

### Development Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |

### Project Structure

```
src/
└── api/          # Module example
    ├── __init__.py
    └── main.py

tests/
└── api/          # API tests
    ├── __init__.py
    └── test_api.py
```

### Running Tests

```bash
# Run all tests
make test-all

# Run tests with coverage
make test-coverage

# Run only unit tests
make test-unit

# Run tests in parallel (requires pytest-xdist)
make test-all-parallel
```

### Code Quality

This project enforces strict code quality standards:

```bash
# Format code
make format

# Check linting and types
make lint

# Run only type checking
make typecheck
```

**Type checking is mandatory** - all code must pass mypy type checking.

### Commit Message Format

This project requires commit messages to follow the [Conventional Commits](https://www.conventionalcommits.org/) specification. Examples:

```
feat: add user authentication system
fix: resolve database connection timeout
docs: update API documentation
refactor: simplify error handling logic
```

### Development Server

```bash
# Start development server (auto-reload enabled)
make dev
```

### Project Configuration

- **Dependencies**: Managed with `uv` (see `pyproject.toml`)
- **Code formatting**: Ruff
- **Type checking**: MyPy with strict configuration
- **Testing**: Pytest with coverage reporting

### Troubleshooting

**Dependencies not found?**
```bash
make install
```

**Server won't start?**
```bash
make check-deps
```

**Need to clean everything?**
```bash
make clean
make install
```

For more information, run `make help` to see all available commands.
