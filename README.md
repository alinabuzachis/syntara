# Nexus

A distributed multi-agent system. Nexus enables coordinated AI agents to work together on complex tasks.
[![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/syntara-orchestration/syntara/graphs/commit-activity)
[![CI](https://github.com/syntara-orchestration/syntara/actions/workflows/ci.yml/badge.svg)](https://github.com/syntara-orchestration/syntara-to-be-renamed/actions/workflows/ci.yml)
[![Python Version](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://pypi.python.org/pypi/)
[![Code style: ruff](https://img.shields.io/badge/code%20style-ruff-000000.svg)](https://github.com/astral-sh/ruff)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

## Documentation

For architectural decisions and design rationale, see [decision-records.md](decision-records.md).

## Developer Workflow

This project uses `uv` for dependency management and provides a comprehensive Makefile for development tasks.

### Prerequisites

- Python 3.12 (strict version requirement)
- `uv` package manager
- [Podman](https://podman.io/docs/installation) (for rootless containers)

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

# Start the database
make db-run

# Start the development server
make dev

# Run tests
make test-all

# Check code quality
make lint
```

### Database Setup

The project includes a PostgreSQL 17 database for local development.

**Start database** (runs in foreground):
```bash
make db-run
# Press Ctrl+C to stop
```

**Reset database** (removes all data):
```bash
make db-clean
```

**Database Configuration**:
The application uses these environment variables (with defaults):
- `NEXUS_DB_USER` (default: `admin`)
- `NEXUS_DB_PASSWORD` (default: `admin`)
- `NEXUS_DB_HOST` (default: `localhost`)
- `NEXUS_DB_PORT` (default: `5432`)
- `NEXUS_DB_NAME` (default: `nexus_api`)

You can override individual variables or set `DATABASE_URL` directly:
```bash
export DATABASE_URL="postgresql+asyncpg://user:pass@host:port/dbname"
```

**Troubleshooting**:
- **Port conflict**: Copy `.env.example` to `.env` and change `NEXUS_DB_PORT` to another value (e.g., 5433)
- **Container won't start**: Check the logs in the terminal where `make db-run` is running
- **Reset everything**: Stop the running database (Ctrl+C), then run `make db-clean`

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

**Prerequisites**: PostgreSQL must be running (use `make db-run` in a separate terminal)

Tests use a PostgreSQL test database. Configure with the `TEST_DATABASE_URL` environment variable if needed:
```bash
export TEST_DATABASE_URL="postgresql+asyncpg://postgres:postgres@localhost:5432/nexus_test"
```

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
