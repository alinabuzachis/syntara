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

---

## Testing Individual Agents

All agents run as standalone A2A servers and can be tested independently. Each agent supports the A2A protocol with metadata-based dynamic configuration.

### Prerequisites

```bash
# Set required environment variables
export OPENROUTER_API_KEY="sk-or-v1-..."  # Get from https://openrouter.ai
export POSTGRES_URI="postgresql://postgres:postgres@localhost:5432/nexus"

# Or create .env file
cat > .env << EOF
OPENROUTER_API_KEY=sk-or-v1-...
POSTGRES_URI=postgresql://postgres:postgres@localhost:5432/nexus
EOF
```

### Available Agents

| Agent | Port | Framework | Purpose |
|-------|------|-----------|---------|
| generic-agent | 8001 | LangGraph | General-purpose ReAct pattern |

### Quick Start: Test Any Agent

```bash
# 1. Start PostgreSQL (required for all agents)
podman-compose up -d postgres

# 2. Wait for PostgreSQL to be ready
sleep 10

# 3. Start an agent (example: generic-agent)
AGENT_NAME=generic-agent AGENT_PORT=8001 python -m src.nexus.agents

# In another terminal, test the agent:
curl http://localhost:8001/.well-known/agent-card.json | jq
```

### Example 1: Simple Message (React Agent)

Send a message and get a response:

```bash
# Start react agent
export OPENROUTER_API_KEY="sk-or-v1-..."
AGENT_NAME=generic-agent AGENT_PORT=8001 python -m src.nexus.agents

# Send message
curl -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "What is 2+2?"}]
      }
    }
  }' | jq
```

**Response**:
```json
{
  "id": "req-1",
  "jsonrpc": "2.0",
  "result": {
    "artifacts": [
      {
        "artifactId": "...",
        "name": "response",
        "parts": [{"kind": "text", "text": "2+2 equals 4"}]
      }
    ],
    "status": {"state": "completed"}
  }
}
```

### Example 2: Dynamic Agent Configuration (React Agent)

Override default model, temperature, and tools via metadata:

```bash
curl -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-2",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-2",
        "role": "user",
        "parts": [{"kind": "text", "text": "Search for the latest news about AI agents"}]
      },
      "metadata": {
        "nexus:agentConfig": {
          "model": "anthropic/claude-3.5-sonnet",
          "temperature": 0.3,
          "maxTokens": 2048,
          "tools": ["web_search", "calculator"]
        }
      }
    }
  }' | jq
```

**Configuration applied**:
- Model: `anthropic/claude-3.5-sonnet` (overrides default `openai/gpt-4o-mini`)
- Temperature: `0.3` (overrides default `0.7`)
- Tools: `web_search`, `calculator`

Logs will show:
```
generic-agent using effective config: model=anthropic/claude-3.5-sonnet, temp=0.3, source=metadata
```

### Example 3: Multi-Turn Conversation with Memory (React Agent)

Demonstrate conversation memory using PostgreSQL checkpointer with A2A `message.contextId`:

```bash
# Message 1: Introduce yourself - get context ID
CONTEXT_ID=$(curl -s -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-1",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-1",
        "role": "user",
        "parts": [{"kind": "text", "text": "My name is Alice and I live in Prague"}]
      }
    }
  }' | jq -r '.result.contextId')

echo "Context ID: $CONTEXT_ID"

# Message 2: Ask about name and city - agent should remember
curl -s -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-2",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-2",
        "role": "user",
        "contextId": "'"$CONTEXT_ID"'",
        "parts": [{"kind": "text", "text": "What is my name and city?"}]
      }
    }
  }' | jq -r '.result.artifacts[0].parts[0].text'
```

**Expected Response**:
```
Your name is Alice and you live in Prague.
```

**How it works** (A2A Protocol v0.3.8):
1. First message creates a new conversation (returns `contextId`)
2. Subsequent messages include `message.contextId` to continue the same conversation
3. Agent uses `contextId` as thread ID for PostgreSQL checkpointer
4. Checkpointer stores conversation history for each thread
5. Agent can access previous messages to maintain context

### Example 4: Viewing Response History (React Agent)

The response includes a `history` field showing all messages and status updates:

```bash
curl -s -X POST http://localhost:8001/ \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "req-4",
    "method": "message/send",
    "params": {
      "message": {
        "messageId": "msg-4",
        "role": "user",
        "parts": [{"kind": "text", "text": "What is the capital of France?"}]
      }
    }
  }' | jq '{
    status: .result.status.state,
    answer: .result.artifacts[0].parts[0].text,
    history: .result.history | map({role, text: .parts[0].text})
  }'
```

**Output**:
```json
{
  "status": "completed",
  "answer": "The capital of France is Paris.",
  "history": [
    {
      "role": "user",
      "text": "What is the capital of France?"
    },
    {
      "role": "agent",
      "text": "Processing your request..."
    }
  ]
}
```

The `history` field shows:
1. Original user message
2. Agent status update ("Processing your request...")
3. Final response is in the `artifacts` field

## E2E Testing

E2E tests verify that agents work end-to-end with real LLM calls. The workflow is unified between local and CI environments - both use podman-compose/docker-compose to start services.

### Local E2E Testing

```bash
# 1. Setup environment
cp .env.example .env
# Edit .env and add your OPENROUTER_API_KEY

# 2. Start services with podman-compose
podman-compose up -d generic-agent

# 3. Wait for services to be healthy (check logs)
podman-compose logs -f generic-agent

# 4. Run e2e tests
./scripts/run-e2e-tests.sh

# Or run specific tests
PYTHONPATH=src python3 -m pytest tests/e2e/test_generic_agent_a2a.py -v -s

# 5. Cleanup
podman-compose down -v
```

### CI E2E Testing

GitHub Actions uses the same approach - it runs docker-compose with podman-compose.yml:

```yaml
# .github/workflows/e2e-generic-agent.yml
- name: Start services with docker-compose
  run: docker-compose -f podman-compose.yml up -d generic-agent

- name: Run E2E tests
  run: pytest tests/e2e/test_generic_agent_a2a.py -v -s
```

Benefits of unified workflow:
- **Consistency**: Same environment locally and in CI
- **Reproducibility**: If it works locally, it works in CI
- **Easy debugging**: Test locally before pushing
- **Simple scaling**: Easy to add more agents/services

### E2E Test Coverage

The e2e tests verify:
1. **Agent Card**: Agent metadata is accessible
2. **Simple Messages**: Basic request/response works
3. **Dynamic Configuration**: Metadata overrides work (model, temperature, tools)
4. **Multi-Turn Conversations**: Conversation memory via PostgreSQL checkpointer
5. **Response History**: Full history is returned in responses
6. **Conversation Isolation**: Different context IDs create separate conversations

## A2A Protocol v0.3.8 Notes

### Message Format
- **Endpoint**: `http://localhost:{port}/` (root path, not `/a2a`)
- **Agent Card**: `http://localhost:{port}/.well-known/agent-card.json`
- **messageId**: Required in all messages
- **Parts**: Use `"kind": "text"` (not `"type": "text"`)
- **Metadata**: At `params.metadata` level (not inside `configuration`)

### Configuration Hierarchy
1. **Dynamic (highest priority)**: `params.metadata.nexus:agentConfig`
2. **Default (fallback)**: Agent card defaults

### Supported Models (via OpenRouter)
- `openai/gpt-4o-mini` (default for generic-agent)
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash-exp:free`
- Any OpenRouter-supported model

### Run All Agents with Podman Compose

```bash
# Start all services (PostgreSQL + all 6 agents)
podman-compose up -d

# Check status
podman-compose ps

# View logs for specific agent
podman-compose logs -f generic-agent

# Test all agent health checks
for port in 8001 8002 8003 8004 8005 8006; do
  echo "Testing agent on port $port:"
  curl -s http://localhost:$port/.well-known/agent-card.json | jq -r '.name'
done

# Stop all services
podman-compose down
```
