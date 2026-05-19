# Testing Standards

This document defines the testing conventions for the Nexus project. These standards ensure consistency, maintainability, and reliability across the test suite.

## Directory Structure

All tests reside under `tests/` and are organized by test type:

```
tests/
├── conftest.py          # Session-level fixtures
├── __init__.py
├── e2e/                 # End-to-end tests (full stack required)
│   └── telemetry/
├── fixtures/            # Shared test fixtures and mock resources
│   ├── external_services/
│   └── files/
├── helpers/             # Test helper utilities
├── integration/         # Integration tests (database, services)
│   ├── agent_orchestrator/
│   ├── api/             # API endpoint tests
│   ├── approvals/       # Approvals tests (includes contract tests)
│   ├── authz/           # Authorization tests
│   ├── core/            # Core infrastructure tests (includes websocket/)
│   ├── credentials/     # Credentials tests
│   ├── files/           # File management tests
│   ├── invocations/     # Invocation tests (includes contract tests)
│   ├── metrics/         # Metrics tests
│   ├── settings/        # Settings tests
│   ├── telemetry/       # Telemetry tests (includes contract tests)
│   ├── tool_manager/    # Tool manager tests
│   └── workflows/       # Workflow tests (includes contract tests, examples/, fixtures/, services/, workflow_engine/)
├── performance/         # Performance tests (opt-in via --run-performance)
│   ├── agent_orchestrator/
│   ├── api_service/
│   ├── chat_window/
│   ├── cli/
│   ├── database/
│   ├── execution_service/
│   ├── files/
│   ├── invocation_service/
│   ├── model_management/
│   ├── routing_service/
│   ├── system_wide/
│   ├── telemetry/
│   ├── temporal_worker/
│   ├── tool_manager/
│   └── workflow_engine/
└── unit/                # Unit tests (isolated, no external deps)
    ├── aap/
    ├── agent_orchestrator/  # Includes services/, agents/
    ├── api/
    ├── approvals/
    ├── audit/
    ├── authz/               # Includes services/
    ├── cli/
    ├── core/                # Includes services/, utils/, websocket/
    ├── credentials/
    ├── files/
    ├── identity_providers/  # Includes services/
    ├── invocations/         # Includes services/
    ├── metrics/
    ├── models/
    ├── projects/            # Includes services/
    ├── schemas/
    ├── settings/
    ├── telemetry/
    ├── tool_manager/
    ├── tools/
    ├── users/               # Includes services/
    ├── utils/
    ├── validators/
    └── workflows/           # Includes services/, workflow_engine/services/, validators/
```

**Organization Rules:**

- Test directory structure mirrors `src/nexus/` hierarchy within each test category
  - Example: `tests/unit/agent_orchestrator/` maps to `src/nexus/agent_orchestrator/`
- Domain-specific conftest files provide domain-specific fixtures at appropriate hierarchy levels
- Shared test data goes in `tests/fixtures/`
- Reusable test utilities go in `tests/helpers/`

## File Naming

- Test files MUST use `test_*.py` prefix pattern exclusively
- NEVER use `*_test.py` suffix pattern
- Test file names should clearly indicate what is being tested
  - Good: `test_user_model.py`, `test_workflows_get.py`
  - Bad: `user_tests.py`, `workflows.py`

## Test Type Definitions

### Unit Tests (`tests/unit/`)

**Scope:** Test a single unit of code in isolation.

**Characteristics:**
- No external dependencies (no database, network, file system)
- Use mocks for all external interfaces
- Fast execution (milliseconds)
- Function-scoped fixtures only
- Test internal logic, edge cases, validation

**Marker:** `@pytest.mark.unit` (optional, inferred by location)

**Example:**
```python
"""Unit tests for User model.

Tests cover:
- User creation with required fields
- Soft delete behavior
- Role enum validation
"""

async def test_create_user_with_required_fields(
    test_db_session: AsyncSession, default_user_data: dict[str, Any]
) -> None:
    """Test creating a user with all required fields."""
    user = User(id=uuid4(), **default_user_data)
    test_db_session.add(user)
    await test_db_session.commit()

    assert user.id is not None
    assert user.username == default_user_data["username"]
```

### Integration Tests (`tests/integration/`)

**Scope:** Test interaction between multiple components.

**Characteristics:**
- Uses real database (testcontainers)
- Tests API endpoints, repository layer, service integration
- Slower than unit tests (seconds)
- Session-scoped database fixtures, function-scoped sessions
- Tests component interactions, data persistence

**Marker:** `@pytest.mark.integration` (optional, inferred by location)

**Example:**
```python
"""Integration tests for GET /api/v1/workflows endpoint.

Tests for listing workflows with filtering and pagination.
"""

async def test_get_workflows_empty_list(base_client: AsyncClient) -> None:
    """Test getting workflows when none exist.

    Expected: 200 OK with empty array
    """
    response = await base_client.get("/api/v1/workflows")
    assert response.status_code == 200
    data = response.json()
    assert "resources" in data
    assert isinstance(data["resources"], list)
```

### Contract Tests (Organized by Domain)

**Scope:** Verify API contracts (request/response schemas, status codes, error formats).

**Location:** Contract tests are now integrated into domain directories within `tests/integration/`:
- `tests/integration/approvals/` - Approval API contract tests
- `tests/integration/invocations/` - Invocation API contract tests  
- `tests/integration/telemetry/` - Telemetry API contract tests
- `tests/integration/workflows/` - Workflow API contract tests

**Characteristics:**
- Tests API shape, not business logic
- Validates OpenAPI compliance
- Tests error cases and edge cases comprehensively
- Uses real or test database
- Fast feedback on API breaking changes
- OPA mocking provided automatically by root integration conftest

**Marker:** None (location-based)

**Example:**
```python
"""Contract tests for invocation file upload API.

Tests MUST FAIL before implementation (TDD approach).
"""

async def test_file_upload_invalid_file_type(base_client: AsyncClient) -> None:
    """Test file upload with invalid file type.

    Expected: 400 Bad Request with error details
    """
    # Test implementation
```

### End-to-End Tests (`tests/e2e/`)

**Scope:** Test complete user workflows across the entire system.

**Characteristics:**
- Requires full stack running (Nexus API, Temporal, MCP server, OpenRouter)
- Uses production-like configuration
- Tests real user scenarios end-to-end
- Slowest execution (minutes)
- Uses auto-generated API client (`nexus-api-client`)

**Marker:** `@pytest.mark.e2e` (REQUIRED)

**Running E2E Tests:**
- Auto-starts services if `APP_BASE_URL` not set: `make test-e2e`
- Uses existing services if `APP_BASE_URL` is set

**API Client Rules (REQUIRED):**

- All API calls MUST use the auto-generated client under `src/api_client/nexus_api_client/` — do NOT call HTTP libraries (e.g., `requests`, `httpx`) directly in test files
- All API calls MUST go through the `nexus_api` fixture (type: `NexusApiRegistry`)
- Use the typed property for the relevant API group: `nexus_api.workflows`, `nexus_api.executions`, `nexus_api.approvals`, `nexus_api.invocation`, `nexus_api.tool_manager`, `nexus_api.files`, `nexus_api.default`

**Example:**
```python
"""E2E tests for GET endpoints: workflows, executions, and approvals."""

import pytest
from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.e2e

class TestWorkflows:
    """E2E tests for workflow GET endpoints."""

    def test_list_workflows(self, nexus_api: NexusApiRegistry) -> None:
        workflows = nexus_api.workflows.list().assert_and_get()
        assert isinstance(workflows.resources, list)
```

### Performance Tests (`tests/performance/`)

**Scope:** Measure and validate performance characteristics.

**Characteristics:**
- Excluded from default test runs
- Opt-in via `--run-performance` flag or `make test-performance`
- Tests response times, throughput, resource usage
- May use specialized fixtures (performance_db_engine)

**Marker:** `@pytest.mark.performance` (REQUIRED)

**Example:**
```python
import pytest

@pytest.mark.performance
async def test_workflow_execution_performance(base_client: AsyncClient) -> None:
    """Test workflow execution completes within acceptable time."""
    # Performance test implementation
```

## conftest.py Hierarchy

The project uses a hierarchical conftest.py structure with 14 files at various levels:

**Root conftest.py (`tests/conftest.py`):**
- Session-scoped database engine (testcontainers)
- Temporal test environment fixtures
- FastAPI test clients (authenticated and base)
- Model factories (users, workflows, tools)
- Mock fixtures (MCP providers, external services)
- Pytest hooks (collection, performance test filtering)

**Domain-level conftest files:**
- Provide domain-specific fixtures
- Override or extend root fixtures where needed
- Keep fixtures close to tests that use them

**Fixture Scoping Rules:**

- **Session scope:** Expensive resources shared across all tests
  - Database engine (`test_db_engine`)
  - Temporal environment (`temporal_env`)
  - Redis container
- **Function scope:** Test isolation (default)
  - Database sessions (`test_db_session`)
  - Test clients (`base_client`, `authenticated_client`)
  - Test data (users, workflows, tools)
- **Module scope:** Rare, use only when necessary for performance

**Fixture Location Guidelines:**

1. If used across all test types → root conftest
2. If specific to a test type (unit, integration, e2e) → type-level conftest
3. If specific to a domain (workflows, agents, tools) → domain conftest
4. If used in one test file → define in that file

## Pytest Markers

Configure markers in `pyproject.toml` under `[tool.pytest.ini_options]`.

**Available Markers:**

- `slow` — Tests that take >5 seconds (deselect with `-m "not slow"`)
- `integration` — Integration tests (inferred by location)
- `unit` — Unit tests (inferred by location)
- `mcp` — Tests requiring MCP server infrastructure (deselect with `-m "not mcp"`)
- `performance` — Performance tests (excluded by default, run with `--run-performance`)
- `e2e` — End-to-end tests (required for tests in `tests/e2e/`)

**When to Apply Markers:**

- `@pytest.mark.e2e` — REQUIRED for all tests in `tests/e2e/`
- `@pytest.mark.performance` — REQUIRED for all tests in `tests/performance/`
- `@pytest.mark.mcp` — REQUIRED for tests that start MCP test servers
- `@pytest.mark.slow` — Optional, for any test taking >5 seconds
- `@pytest.mark.integration`, `@pytest.mark.unit` — Optional, inferred by location

**Marker Enforcement:**

- Strict markers enabled: `--strict-markers`
- Undefined markers cause test failures
- Add new markers to `pyproject.toml` before use

## Test Infrastructure

### Testcontainers

Tests use testcontainers for PostgreSQL and Redis:

**Container Runtime:**
- Prefers Podman (local dev)
- Falls back to Docker (CI)
- Detects container socket automatically

**Container Management:**
- One container per xdist worker for full isolation
- Session-scoped fixtures auto-start containers
- Ryuk disabled via `TESTCONTAINERS_RYUK_DISABLED=true`
- Custom images via `POSTGRES_IMAGE` and `REDIS_IMAGE` environment variables

**Database Migrations:**
- Applied automatically via Alembic in session fixture
- Tests run against fully migrated schema
- Function-scoped sessions get clean state via table truncation

### Temporal Test Environment

Workflow tests use Temporal's time-skipping test environment:

**Features:**
- Fast-forward time for workflow timers/sleep
- Full workflow execution without waiting
- Worker registration for activities and workflows

**Usage:**
```python
async def test_workflow_execution(temporal_env: WorkflowEnvironment) -> None:
    """Test workflow executes successfully."""
    async with Worker(
        temporal_env.client,
        task_queue="test-queue",
        workflows=[DynamicWorkflow],
        activities=[execute_api_request, execute_python_script],
    ):
        result = await temporal_env.client.execute_workflow(...)
```

### Parallel Execution

Tests run in parallel via pytest-xdist:

**Configuration:**
- `-n auto` uses all CPU cores
- Each worker gets isolated database container
- Worker ID available via `worker_id` fixture
- Session fixtures shared within worker, isolated across workers

## Async Test Patterns

**asyncio_mode = "auto":**
- All `async def test_*` functions auto-detected
- No need for `@pytest.mark.asyncio` (but doesn't hurt)
- Event loop managed automatically

**Async Fixtures:**
```python
@pytest_asyncio.fixture
async def test_data(test_db_session: AsyncSession) -> MyModel:
    """Create test data."""
    model = MyModel(...)
    test_db_session.add(model)
    await test_db_session.commit()
    await test_db_session.refresh(model)
    return model
```

**Best Practices:**
- Use `async with` for resource cleanup
- Await all async operations
- Use `AsyncClient` for HTTP requests
- Use `AsyncSession` for database operations

## Tooling Enforcement vs Convention

**Enforced by Tooling:**

- Test file discovery (`test_*.py` only)
- Strict markers (undefined markers fail)
- Strict config (invalid config fails)
- Coverage threshold (80% required, fails under)
- Performance test filtering (auto-skipped without flag)
- Async mode (auto-detected)
- Parallel execution (xdist)
- Linter rules (S101, ANN001, etc. ignored for tests)

**Convention Only:**

- Directory organization (mirrors src structure)
- Fixture scoping strategy
- Test type boundaries (unit vs integration)
- Docstring style for tests
- Helper vs fixture distinction

**Ruff Overrides for Tests:**

The following lint rules are relaxed for test code:

- `S101` — Allow `assert` statements
- `ANN001`, `ANN201` — No type annotations required for test args/returns
- `D102` — No docstrings required for test methods
- `PLR2004` — Allow magic values
- `ARG001` — Allow unused fixture arguments
- `SLF001` — Allow private member access (for unit testing internal state)
- Additional overrides listed in `pyproject.toml`

## Make Targets

**Primary Test Commands:**

```bash
make test              # Unit tests only (default)
make test-unit         # Explicit unit tests
make test-integration  # Integration tests (excludes MCP)
make test-e2e-mcp      # MCP E2E tests (auto-starts services)
make test-all          # All tests with coverage (excludes e2e, performance)
make test-e2e          # End-to-end tests (auto-starts services)
make test-performance  # Performance tests only
make test-coverage     # Coverage report (XML + terminal)
make test-fast         # Fail-fast mode with short traceback
```

**Test Execution Pattern:**

All test commands (except e2e, performance) use the `run-tests` make function:
1. Detect container runtime (Podman preferred, Docker fallback)
2. Set environment variables (DOCKER_HOST, TESTCONTAINERS_RYUK_DISABLED, etc.)
3. Run `uv run pytest` with specified arguments
4. Parallel execution via `-n auto` (when appropriate)

## Coverage Requirements

**Configuration (`pyproject.toml`):**
- Minimum coverage: 80% (`fail_under = 80`)
- Source: `src/`
- Omit: `*/tests/*`, `*/__init__.py`, `tools/*`

**Known Inconsistency:**
- Constitution specifies 90% coverage
- `pyproject.toml` enforces 80%
- This discrepancy is documented in `questions.md`

**Excluded Lines:**
- `pragma: no cover`
- `def __repr__`
- Debug-only code
- Abstract methods
- NotImplementedError
- Main blocks

## Adding Tests for a New Domain

When adding a new domain (e.g., `src/nexus/new_domain/`):

**Step 1: Create Test Directory Structure**

```bash
mkdir -p tests/unit/new_domain
mkdir -p tests/integration/new_domain
touch tests/unit/new_domain/__init__.py
touch tests/integration/new_domain/__init__.py
```

**Step 2: Add conftest.py (if needed)**

Only add if domain needs specific fixtures:

```python
# tests/unit/new_domain/conftest.py
"""Domain-specific test fixtures."""

import pytest
from nexus.new_domain.models import DomainModel

@pytest.fixture
def domain_model_data() -> dict[str, Any]:
    """Factory data for DomainModel."""
    return {"field": "value"}
```

**Step 3: Write Unit Tests**

```python
# tests/unit/new_domain/test_model.py
"""Unit tests for DomainModel."""

async def test_create_domain_model(domain_model_data: dict[str, Any]) -> None:
    """Test creating a domain model."""
    model = DomainModel(**domain_model_data)
    assert model.field == domain_model_data["field"]
```

**Step 4: Write Integration Tests**

```python
# tests/integration/new_domain/test_repository.py
"""Integration tests for DomainRepository."""

async def test_repository_create(
    test_db_session: AsyncSession,
    domain_model_data: dict[str, Any]
) -> None:
    """Test repository create operation."""
    repo = DomainRepository(test_db_session)
    model = await repo.create(domain_model_data)
    assert model.id is not None
```

**Step 5: Run Tests**

```bash
# Run new domain unit tests
make test-unit tests/unit/new_domain/

# Run new domain integration tests
make test-integration tests/integration/new_domain/

# Run all tests with coverage
make test-all
```

**Step 6: Verify Coverage**

```bash
make test-coverage
# Check coverage report for new domain
# Ensure >= 80% coverage
```

## Test Documentation

**File-Level Docstrings:**

Every test file should have a module docstring explaining:
- What is being tested
- Test coverage scope
- Special considerations (if any)

**Example:**
```python
"""Unit tests for User model.

Tests cover:
- User creation with required fields
- Soft delete behavior
- Role enum validation
- Unique constraint violations
"""
```

**Test Function Docstrings:**

Test functions should have concise docstrings:
- What is being tested
- Expected outcome (for contract tests)

**Example:**
```python
def test_create_user_with_required_fields() -> None:
    """Test creating a user with all required fields."""
```

## Common Patterns

**Database Test Pattern:**

```python
async def test_database_operation(test_db_session: AsyncSession) -> None:
    """Test database operation."""
    # Arrange
    model = MyModel(field="value")
    test_db_session.add(model)
    await test_db_session.commit()
    await test_db_session.refresh(model)

    # Act
    result = await some_operation(model)

    # Assert
    assert result.status == "expected"
```

**API Test Pattern:**

```python
async def test_api_endpoint(base_client: AsyncClient) -> None:
    """Test API endpoint behavior."""
    # Act
    response = await base_client.get("/api/v1/resource")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert "resources" in data
```

**Mock Pattern:**

```python
async def test_with_mock(monkeypatch: pytest.MonkeyPatch) -> None:
    """Test with mocked external dependency."""
    mock_service = Mock(return_value="mocked_value")
    monkeypatch.setattr("module.path.function", mock_service)

    result = await function_under_test()

    assert result == "expected"
    mock_service.assert_called_once()
```

## Reference

**Primary Test Configuration:**
- `pyproject.toml` — Pytest, coverage, markers
- `tests/conftest.py` — Root fixtures
- `Makefile` — Test execution targets

**Key Dependencies:**
- `pytest` — Test framework
- `pytest-asyncio` — Async test support
- `pytest-xdist` — Parallel execution
- `pytest-cov` — Coverage reporting
- `testcontainers` — Container management
- `temporalio` — Workflow testing
- `httpx` — HTTP client testing
- `respx` — HTTP mocking

Generated By: Claude Code (Claude Sonnet 4.5)
