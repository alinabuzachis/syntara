# Nexus

A distributed multi-agent system. Nexus enables coordinated AI agents to work together on complex tasks.
[![Maintained](https://img.shields.io/badge/Maintained%3F-yes-green.svg)](https://GitHub.com/syntara-orchestration/syntara/graphs/commit-activity)
[![CI](https://github.com/syntara-orchestration/syntara/actions/workflows/ci.yml/badge.svg)](https://github.com/syntara-orchestration/syntara-to-be-renamed/actions/workflows/ci.yml)
[![Python Version](https://img.shields.io/badge/python-3.11%20%7C%203.12-blue.svg)](https://pypi.python.org/pypi/)
[![Code style: ruff](https://img.shields.io/badge/code%20style-ruff-000000.svg)](https://github.com/astral-sh/ruff)
[![Ruff](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/astral-sh/ruff/main/assets/badge/v2.json)](https://github.com/astral-sh/ruff)

## Architecture

Nexus is built with Python 3.12, FastAPI, SQLModel, and PostgreSQL.

The system follows a domain-driven design with automatic router discovery and standardized patterns.

### Key Technologies

- [**Python 3.12**](https://www.python.org/) - Strict version requirement  
- [**FastAPI**](https://fastapi.tiangolo.com/) - Web framework with automatic OpenAPI generation
- [**SQLModel**](https://sqlmodel.tiangolo.com/) - Unified data modeling (combines Pydantic + SQLAlchemy)
- [**PostgreSQL 15**](https://www.postgresql.org/) - Primary database with async support
- [**Temporal**](https://temporal.io/) - Workflow orchestration engine for reliable multi-step task coordination
- [**uv**](https://docs.astral.sh/uv/) - Package management and execution
- [**Alembic**](https://alembic.sqlalchemy.org/) - Database migrations

### Project Structure

```
src/
└── nexus/
    ├── agent_orchestrator/    # Agent lifecycle management and request routing
    ├── api/                   # Legacy FastAPI routes (favour use of "domains")
    ├── core/                  # Base models, router discovery, database, utilities
    ├── example/               # Example implementations and WebSocket demos
    ├── files/                 # File management and document processing
    ├── invocations/           # Agent invocation tracking and execution
    ├── schemas/               # OpenAPI schema definitions for all domains
    ├── telemetry/             # Telemetry event collection and transmission
    ├── tool_manager/          # Tool provider interfaces and configuration
    ├── workflows/             # Temporal workflow definitions and engine
    └── ws/                    # WebSocket connection handling
```

### Domains

Each domain represents a set of related functionality and follows a consistent structure:

**Current domains:**
- **agent_orchestrator** - Manages agent lifecycle and routing requests to appropriate agents
- **files** - File management and storage operations
- **invocations** - Agent invocation tracking and execution history
- **tool_manager** - Tool provider interfaces and configuration
- **workflows** - Temporal workflow definitions and execution

```
src/nexus/{domain}/
├── router.py              # FastAPI routes (auto-discovered)
├── models/                # SQLModel classes
└── services/              # Business logic
```

**Router Discovery**: Routers in `src/nexus/{domain}/router.py` or `src/nexus/api/v1/{module}.py` are automatically discovered and registered.

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

### Dependency Management

This project uses `uv` for dependency management with two key files:

- **`uv.lock`** - The source of truth for exact dependency versions (managed by uv)
- **`requirements.txt`** - Production dependencies exported from `uv.lock` (for Konflux hermetic builds)

**Keeping files in sync:**

The `requirements.txt` file **must always be in sync** with `uv.lock`. This is enforced automatically:

```bash
# Manually sync requirements.txt (if needed)
make sync-requirements

# Pre-commit hook automatically does the sync when uv.lock changes and CI will fail if requirements.txt is out of sync
```

### Quick Start

**Option 1: Full Stack with Containers (Recommended)**

**NOTE**: The UI image is private and requires authentication to the Quay Container Registry (quay.io) and read permissions.

You can authenticate with:

```bash
podman login quay.io -u <your_quay_username> -p <your_quay_password>
```

**IMPORTANT**: Before starting the services for the first time, you must build the container images:

```bash
# Build container images (required before first run)
make build-images
```

```bash
# Start all services (API, UI, Database, Temporal, Worker)
make run-all
```

**Option 2: Local Development**
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
- `NEXUS_DB_POOL_SIZE` (default: `10`)
- `NEXUS_DB_MAX_OVERFLOW` (default: `20`)
- `NEXUS_DB_POOL_TIMEOUT_SECONDS` (default: `30`)

You can override individual variables or set `NEXUS_DATABASE_URL` directly:
```bash
export NEXUS_DATABASE_URL="postgresql+asyncpg://user:pass@host:port/dbname?sslmode=require"
```

**Troubleshooting**:
- **Port conflict**: Copy `.env.example` to `.env` and change `NEXUS_DB_PORT` to another value (e.g., 5433)
- **Container won't start**: Check the logs in the terminal where `make db-run` is running
- **Reset everything**: Stop the running database (Ctrl+C), then run `make db-clean`

### Data Modeling with SQLModel

**Important**: Nexus uses SQLModel as the single source of truth for both API schemas and database tables. **Never create separate Pydantic models** - SQLModel serves both purposes.

Most domain models should extend the `Resource` base class:

```python
from nexus.core.models import Resource

class ToolProvider(Resource, table=True):
    """Extends Resource with provider-specific fields."""
    __tablename__ = "tool_providers"

    enabled: bool = Field(default=True)
    configuration: dict[str, Any] = Field(sa_type=JSONB)
    # Inherits: id, name, description, timestamps, ownership, labels
```


### Temporal Workflow Engine Setup

The project uses Temporal for workflow orchestration. You can run Temporal locally with PostgreSQL backend.

**Start Temporal server and UI** (runs in foreground):
```bash
make temporal-run
# Press Ctrl+C to stop
```

**Start all services** (database + temporal + temporal UI + worker in background - recommended):
```bash
make services-run
# View logs: make services-logs
# Stop services: make services-stop
```

**Run Temporal worker separately** (for development without containers):
```bash
uv run python -m nexus.workflows.worker
# Or use: make worker-run
```

**Temporal Configuration**:
The application uses these environment variables (with defaults):
- `NEXUS_TEMPORAL_ADDRESS` (default: `localhost:7233`)
- `NEXUS_TEMPORAL_NAMESPACE` (default: `default`)
- `NEXUS_TEMPORAL_PORT` (default: `7233`)
- `NEXUS_TEMPORAL_UI_PORT` (default: `8081`)
- `NEXUS_TASK_QUEUE` (default: `nexus-workflow-queue`)

**Access Temporal UI** (Development/Debugging Only):
Once Temporal is running, access the web UI at: http://localhost:8081

The UI is for **local development and debugging only**. The local UI allows you to:
- Monitor workflow executions in real-time
- View workflow history and activity details
- Debug failed workflows
- Query and filter workflows

**View individual service logs**:
```bash
make db-logs          # Database logs
make temporal-logs    # Temporal server logs
make temporal-ui-logs # Temporal UI logs
make worker-logs      # Temporal worker logs
```

**Clean up Temporal data**:
```bash
make temporal-clean  # Stop Temporal server and UI only
make services-clean  # Stop and remove all data (database + temporal)
```

### Containerized Deployment

Nexus provides a complete containerized stack using `podman-compose` for easy deployment and development.

#### Available Services

The `podman-compose.yml` defines the following services:

| Service | Description | Port | Image |
|---------|-------------|------|-------|
| **database** | PostgreSQL 15 database | 5432 | `postgres:15` |
| **redis** | Cache service | 6379 | `redis-6-c9s` |
| **temporal** | Temporal workflow engine | 7233 | `temporalio/auto-setup:1.25.1` |
| **temporal-ui** | Temporal web UI (dev only) | 8081 | `temporalio/ui:2.31.2` |
| **temporal-worker** | Temporal workflow worker | - | Built from `containers/nexus/Containerfile` |
| **nexus** | Nexus API service | 8000 | Built from `containers/nexus/Containerfile` |
| **nexus-ui** | Nexus web interface | 8080 | `ghcr.io/syntara-orchestration/syntara-ui` |

#### Container Commands

**Build container images** (required before first run):
```bash
make build-images
```

**Start all services** (foreground):
```bash
make run-all
# Access:
# - API: http://localhost:8000
# - UI: http://localhost:8080
# - Temporal UI: http://localhost:8081
# - Database: postgresql://admin:admin@localhost:5432/nexus_api
```

**Start all services** (background):
```bash
make services-run         # Start all services
make services-logs        # View logs from all services
make services-stop        # Stop all services
make services-clean       # Stop and remove all data (destructive)
```

**Individual service logs**:
```bash
make db-logs              # Database logs
make temporal-logs        # Temporal server and worker logs
make temporal-ui-logs     # Temporal UI logs
```

#### Running Multiple Instances

You can run multiple isolated instances of Nexus simultaneously using the `PODMAN_PROJECT` environment variable. This is useful for:
- Running different feature branches side-by-side
- Maintaining separate dev/staging environments locally
- Testing interactions between multiple Nexus instances

**Example: Running two instances**:
```bash
# Terminal 1: Run default instance
make services-run
# Containers: nexus_database_1, nexus_temporal_1, etc.

# Terminal 2: Run a separate dev instance
PODMAN_PROJECT=nexus-dev make services-run
# Containers: nexus-dev_database_1, nexus-dev_temporal_1, etc.
```

**Note**: Each instance requires unique ports. Configure ports via `.env` file or environment variables to avoid conflicts:
```bash
# For the second instance
export PODMAN_PROJECT=nexus-dev
export NEXUS_DB_PORT=5433
export NEXUS_API_PORT=8001
export NEXUS_UI_PORT=8081
export NEXUS_TEMPORAL_PORT=7234
export NEXUS_TEMPORAL_UI_PORT=8082
export NEXUS_CACHE_PORT=6380
make services-run
```

**Environment Variables**:

All services can be configured via `.env` file or environment variables:
Set `NEXUS_ENV_FILE_PATH` to point at an alternate `.env` file if you want Nexus to load settings from a non-default location.

```bash
# Project Configuration
PODMAN_PROJECT=nexus  # Project name for container orchestration (default: nexus)
                      # Use this to run multiple isolated instances of Nexus
                      # Example: PODMAN_PROJECT=nexus-dev make services-run

# API Configuration
NEXUS_API_PORT=8000

# UI Configuration
NEXUS_API_URL=http://localhost:8000
NEXUS_UI_PORT=8080
NEXUS_UI_IMAGE=ghcr.io/syntara-orchestration/syntara-ui
NEXUS_UI_VERSION=latest

# Database Configuration
NEXUS_DB_HOST=localhost
NEXUS_DB_PORT=5432
NEXUS_DB_USER=admin
NEXUS_DB_PASSWORD=admin
NEXUS_DB_NAME=nexus_api
NEXUS_DB_POOL_SIZE=10
NEXUS_DB_MAX_OVERFLOW=20
NEXUS_DB_POOL_TIMEOUT_SECONDS=30

# Cache Configuration
NEXUS_CACHE_PORT=6379

# Temporal Configuration
NEXUS_TEMPORAL_ADDRESS=localhost:7233
NEXUS_TEMPORAL_PORT=7233
NEXUS_TEMPORAL_UI_PORT=8081
NEXUS_TEMPORAL_NAMESPACE=default
NEXUS_TASK_QUEUE=nexus-workflow-queue

# Logging
NEXUS_LOG_LEVEL=INFO
```

### LLM and Agent Configuration

Nexus uses LangChain with OpenRouter for intelligent agent responses. The GenericAgent handles information queries using various LLMs.

**OpenRouter Setup**:

1. **Get your API key** from [https://openrouter.ai/keys](https://openrouter.ai/keys)

2. **Configure environment variables**:
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your OpenRouter API key
   NEXUS_OPENROUTER_API_KEY=your_openrouter_api_key_here
   NEXUS_OPENROUTER_MODEL=anthropic/claude-3.5-sonnet  # or openai/gpt-4, google/gemini-pro
   NEXUS_OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
   ```

3. **Available models** (see [https://openrouter.ai/models](https://openrouter.ai/models)):
   - `anthropic/claude-3.5-sonnet` - Best for complex reasoning (default)
   - `openai/gpt-4` - OpenAI's most capable model
   - `google/gemini-pro` - Google's flagship model
   - `meta-llama/llama-3-70b` - Open source alternative
   - Many more available through OpenRouter

**Agent Routing**:

Nexus automatically routes requests to the appropriate agent:
- **GenericAgent**: Information queries, questions, explanations
  - Uses LangChain + OpenRouter LLM
  - Returns natural language responses
  - Example: "What tools are available for deployment?"

- **WorkflowGeneratorAgent**: Workflow creation requests
  - Uses Temporal workflows
  - Returns structured workflow results
  - Example: "Deploy customer service app to production"

**Testing without OpenRouter**:

For development and testing without configuring OpenRouter:
```bash
# The system works without NEXUS_OPENROUTER_API_KEY set
# GenericAgent will be disabled but other features work normally
make test-all
```

**Environment Variables**:
- `NEXUS_OPENROUTER_API_KEY` (required for GenericAgent, get from https://openrouter.ai/keys)
- `NEXUS_OPENROUTER_MODEL` (default: `anthropic/claude-3.5-sonnet`)
- `NEXUS_OPENROUTER_BASE_URL` (default: `https://openrouter.ai/api/v1`)

**Example API Usage**:

First, ensure database migrations have been run:
```bash
uv run alembic upgrade head
```

Then you can invoke agents:

```bash
# 1. Create an information query (routes to GenericAgent)
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "What is Docker?", "createdBy": "550e8400-e29b-41d4-a716-446655440000", "sessionId": "session-456"}'

# Response includes the invocation ID and result:
# {
#   "id": "4e51166b-f57f-4f19-a04a-69ae9afc6e2f",
#   "status": "completed",
#   "result": {
#     "type": "answer",
#     "content": "Docker is a platform that packages applications...",
#     "metadata": {"model": "anthropic/claude-3.5-sonnet"}
#   },
#   ...
# }

# 2. Get invocation details by ID (NOTE: This endpoint is for testing/debugging)
# Use the "id" field from the response above
curl 'http://localhost:8000/api/v1/invocations/4e51166b-f57f-4f19-a04a-69ae9afc6e2f'

# 3. Workflow request (routes to WorkflowGeneratorAgent)
curl -X POST http://localhost:8000/api/v1/invocations \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Deploy customer service app to production", "createdBy": "550e8400-e29b-41d4-a716-446655440000", "sessionId": "session-789", "contextData": {"environment": "production"}}'

# 4. List all completed invocations
curl 'http://localhost:8000/api/v1/invocations?status=completed'
```

**NOTE**: The GET `/api/v1/invocations/{id}` endpoint is designed for **testing and debugging**. In production, you would typically use WebSockets or Server-Sent Events for real-time result streaming instead of polling this endpoint.

**Field Names**: The API uses camelCase field names per the OpenAPI contract:
- `createdBy` (UUID) - user identifier (previously `user_id`)
- `sessionId` (string) - session identifier (previously `session_id`)
- `contextData` (object) - additional context (previously `context`)
- Response fields: `id`, `createdAt`, `updatedAt`, `startedAt`, `completedAt`, etc.

### Development Commands

| Command | Description |
|---------|-------------|
| `make help` | Show all available commands |
| `make build-images` | Build container images (required before first run) |
| `make install` | Complete setup from scratch |
| `make dev` | Run development server with auto-reload |
| `make test-all` | Run all tests |
| `make lint` | Run linting and type checking |
| `make format` | Format code |
| `make init-worktree` | Initialize a new git worktree for parallel development |

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

## Telemetry

Telemetry is always enabled and collects workflow execution metrics transmitted to Red Hat via Segment.com for product improvement. No PII or credentials are collected.

### Collected Data

**Workflow execution events:**

- `workflow_execution_id` -- unique execution identifier (UUID v4)
- `status` -- final execution status (completed, failed, cancelled)
- `duration_ms` -- execution duration in milliseconds
- `activity_count` -- total number of activities executed
- `error_count` -- number of activities that failed
- `error_type` -- categorized error type (if failed)

**Activity execution events:**

- `workflow_execution_id` -- parent workflow execution identifier
- `activity_type` -- type of activity (task, parallel, sequence, condition, loop, converge, approval)
- `activity_hash` -- SHA-256 hash of the activity definition (anonymized)
- `status` -- execution outcome (completed, failed, skipped, cancelled)
- `duration_ms` -- activity duration in milliseconds
- `action_type` -- action type for task activities
- `inbound_activities` -- hashes of preceding activities in the execution graph
- `outbound_activities` -- hashes of following activities in the execution graph
- `error_type` -- categorized error type (if failed)

**API call events:**

- `endpoint` -- request path
- `http_method` -- HTTP request method
- `status_code` -- HTTP response status code
- `response_time_ms` -- response time in milliseconds
- `request_payload_size` -- request body size in bytes

### Configuration

Telemetry is configured via environment variables:

- `NEXUS_SEGMENT_WRITE_KEY` -- Segment.com write key for event transmission
- `NEXUS_SEGMENT_ENDPOINT` -- Segment.com endpoint URL

## Further reading

- 📖 **[Developer Getting Started Guide](docs/developer-getting-started.md)** - Architecture deep dive with examples
- 📖 **[Development with Worktrees Guide](docs/development-with-worktrees.md)** - Parallel development setup
- 📖 **[Architecture Decision Records](decision-records.md)** - Design rationale and decisions
