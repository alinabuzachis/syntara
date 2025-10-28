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
- `NEXUS_TEMPORAL_UI_PORT` (default: `8080`)
- `NEXUS_TASK_QUEUE` (default: `nexus-workflow-queue`)

**Access Temporal UI** (Development/Debugging Only):
Once Temporal is running, access the web UI at: http://localhost:8080

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

### LLM and Agent Configuration

Nexus uses LangChain with OpenRouter for intelligent agent responses. The GenericAgent handles information queries using various LLMs.

**OpenRouter Setup**:

1. **Get your API key** from [https://openrouter.ai/keys](https://openrouter.ai/keys)

2. **Configure environment variables**:
   ```bash
   # Copy the example environment file
   cp .env.example .env

   # Edit .env and add your OpenRouter API key
   OPENROUTER_API_KEY=your_openrouter_api_key_here
   OPENROUTER_MODEL=anthropic/claude-3.5-sonnet  # or openai/gpt-4, google/gemini-pro
   OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
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
# The system works without OPENROUTER_API_KEY set
# GenericAgent will be disabled but other features work normally
make test-all
```

**Environment Variables**:
- `OPENROUTER_API_KEY` (required for GenericAgent, get from https://openrouter.ai/keys)
- `OPENROUTER_MODEL` (default: `anthropic/claude-3.5-sonnet`)
- `OPENROUTER_BASE_URL` (default: `https://openrouter.ai/api/v1`)

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

### Project Structure

```
src/
└── nexus/
    ├── api/             # FastAPI service, Temporal workflows, database models
    ├── agents/          # Agent implementations (generic, research prototypes, etc.)
    └── tool_manager/    # Tool provider interfaces, adapters, core domain logic

tests/
├── integration/
├── unit/
└── e2e/
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
