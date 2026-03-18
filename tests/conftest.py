"""Shared pytest fixtures for all tests.

This module provides:
- Database fixtures for API/database tests
- Temporal testserver fixtures for workflow tests
"""

import asyncio
import gc
import os
import tempfile
from collections.abc import AsyncGenerator, Awaitable, Callable, Generator
from contextlib import AbstractContextManager, ExitStack, contextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, Mock, patch
from uuid import uuid4

import pytest
import pytest_asyncio
import sqlalchemy
import structlog
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from langchain_core.messages import AIMessage
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.api.auth.dependencies import get_current_user
from nexus.api.main import app
from nexus.core.config.base import Settings, get_settings
from nexus.core.database.session import get_db
from nexus.core.logging.logging import configure_structlog
from nexus.core.models import User, UserRole
from nexus.files.models import FileMetadata
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory
from nexus.tool_manager.models import Tool, ToolProvider
from nexus.tool_manager.services.tool_provider_service import ToolProviderService
from nexus.workflows.models import ActivityExecution, ActivityStatus, Workflow, WorkflowVersion
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.services.execution_streaming_service import ExecutionStreamingService
from nexus.workflows.workflow_engine.activities.api_activity import execute_api_request
from nexus.workflows.workflow_engine.activities.script_activity import execute_bash_script, execute_python_script
from nexus.workflows.workflow_engine.dynamic_workflow import DynamicWorkflow
from nexus.workflows.workflow_engine.models import WorkflowDefinition
from nexus.workflows.workflow_engine.yaml_workflow_parser import parse_workflow_yaml
from tests.fixtures.mock_mcp_provider import MockMCPProvider
from tests.helpers.approval import ApprovalsFactory
from tests.helpers.tool_manager import ToolFactory
from tests.helpers.workflow import ActivitiesFactory, ExecutionsFactory

_ = (Invocation, User, Workflow, WorkflowVersion, Execution, FileMetadata)

# Configure structlog for consistent test logging
# This ensures that all tests have proper structlog configuration,
# preventing unpredictable behavior when error handlers or other components
# use structlog.stdlib.get_logger(__name__) without configuration.
configure_structlog()

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Pytest Configuration Hooks
# ============================================================================


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add custom command-line options for pytest."""
    parser.addoption(
        "--run-performance",
        action="store_true",
        default=False,
        help="Run performance tests (excluded by default)",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip performance tests unless --run-performance is provided."""
    if config.getoption("--run-performance"):
        # --run-performance given: do not skip performance tests
        return

    skip_performance = pytest.mark.skip(reason="need --run-performance option to run")
    for item in items:
        if "performance" in item.keywords:
            item.add_marker(skip_performance)


def pytest_sessionfinish(session: pytest.Session, exitstatus: int) -> None:
    """Clean up lock files after test session completes.

    This hook runs after all tests have finished, cleaning up lock files
    created by pytest-xdist workers during parallel test execution.

    Only cleans up worker lock files (nexus_router_discovery_gw*.lock),
    preserving the main lock file for non-parallel test runs.

    Args:
        session: pytest session object
        exitstatus: pytest exit status

    """
    temp_dir = Path(tempfile.gettempdir())
    lock_pattern = "nexus_router_discovery_gw*.lock"

    for lock_file in temp_dir.glob(lock_pattern):
        try:
            lock_file.unlink()
            logger.debug("Cleaned up test lock file: %s", lock_file)
        except FileNotFoundError:
            # File already deleted, ignore
            pass
        except OSError as e:
            logger.warning("Failed to clean up lock file %s: %s", lock_file, e)


# ============================================================================
# Test Utilities
# ============================================================================


@pytest.fixture
def override_settings() -> Callable[..., AbstractContextManager[object]]:
    """Fixture in django-style API for temporaly override settings in tests.

    Raises:
        AttributeError: If setting does not exist.

    Example:
        def test_meaning_of_life(override_settings):
            with override_settings(meaning_of_life=42):
                settings = get_settings()
                assert settings.meaning_of_life == 42

    """

    @contextmanager
    def _override(**overrides: object) -> Generator[Settings, None, None]:
        settings = get_settings()
        with ExitStack() as stack:
            for name, value in overrides.items():
                if not hasattr(settings, name):
                    msg = f"Setting '{name}' does not exist on Settings object"
                    raise AttributeError(msg)
                stack.enter_context(patch.object(settings, name, value))
            yield settings

    return _override


@pytest.fixture(scope="session")
def worker_id(request: pytest.FixtureRequest) -> str:
    """Get pytest-xdist worker ID.

    Args:
        request: pytest request fixture

    Returns:
        Worker ID ('master' for non-parallel, 'gw0', 'gw1', etc. for parallel)

    """
    if hasattr(request.config, "workerinput"):
        return request.config.workerinput["workerid"]  # type: ignore[no-any-return]
    return "master"


@pytest.fixture(scope="session")
def event_loop() -> Generator[asyncio.AbstractEventLoop, None, None]:
    """Create an event loop for the test session.

    This ensures async fixtures work correctly across the test session.
    Includes cleanup to prevent subprocess warnings.

    Yields:
        Event loop for async tests

    """
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop

    # Cleanup to prevent subprocess transport warnings
    try:
        # Force garbage collection to cleanup subprocess transports
        gc.collect()

        # Cancel all remaining tasks
        pending = asyncio.all_tasks(loop)
        for task in pending:
            task.cancel()

        # Run the loop briefly to process cancellations
        if pending:
            loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))

        # Small delay to allow subprocess cleanup
        loop.run_until_complete(asyncio.sleep(0.01))
    except (RuntimeError, asyncio.CancelledError):
        # Ignore errors during cleanup
        pass

    loop.close()


# ============================================================================
# Database Fixtures
# ============================================================================

# Test database configuration
TEST_DB_USER = os.getenv("NEXUS_DB_USER", "admin")
TEST_DB_PASSWORD = os.getenv("NEXUS_DB_PASSWORD", "admin")
TEST_DB_HOST = os.getenv("NEXUS_DB_HOST", "localhost")
TEST_DB_PORT = os.getenv("NEXUS_DB_PORT", "5432")
PROJECT_ROOT = Path(__file__).resolve().parent.parent


def get_test_database_url(worker_id: str = "master") -> str:
    """Get test database URL, with per-worker database for parallel execution.

    Args:
        worker_id: pytest-xdist worker ID (e.g., 'gw0', 'gw1', or 'master' for non-parallel)

    Returns:
        Database URL string

    """
    # Use worker-specific database for parallel execution
    db_name = f"nexus_test_{worker_id}" if worker_id != "master" else "nexus_test"

    return os.getenv(
        "TEST_DATABASE_URL",
        f"postgresql+asyncpg://{TEST_DB_USER}:{TEST_DB_PASSWORD}@{TEST_DB_HOST}:{TEST_DB_PORT}/{db_name}",
    )


def _get_alembic_config(db_url: str) -> Config:
    """Build an Alembic Config pointing at the test database."""
    alembic_cfg = Config(str(PROJECT_ROOT / "alembic.ini"))
    alembic_cfg.set_main_option(
        "script_location",
        str(PROJECT_ROOT / "src" / "nexus" / "core" / "database" / "migrations"),
    )
    alembic_cfg.set_main_option("sqlalchemy.url", db_url)
    return alembic_cfg


def _safe_url(url: str | sqlalchemy.engine.URL) -> str:
    """Render URL with credentials redacted for logging."""
    return make_url(str(url)).render_as_string(hide_password=True)


async def _upgrade_database_schema(db_url: str) -> None:
    """Apply Alembic migrations to the test database (runs in a thread)."""
    logger.debug("Applying Alembic migrations to test database %s", db_url)
    try:
        await asyncio.to_thread(command.upgrade, _get_alembic_config(db_url), "head")
        logger.debug("Successfully applied migrations to %s", db_url)
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to apply migrations to %s", _safe_url(db_url))
        raise


async def _reset_schema(engine: AsyncEngine, schema_name: str = "public") -> None:
    """Drop and recreate the given schema to ensure a clean slate."""
    logger.debug("Resetting schema '%s' on %s", schema_name, engine.url)
    preparer = engine.dialect.identifier_preparer
    quoted_schema = preparer.quote_schema(schema_name)
    drop_schema_sql = sqlalchemy.text(f"DROP SCHEMA IF EXISTS {quoted_schema} CASCADE")
    create_schema_sql = sqlalchemy.text(f"CREATE SCHEMA {quoted_schema}")
    try:
        async with engine.begin() as conn:
            await conn.execute(drop_schema_sql)
            await conn.execute(create_schema_sql)
        logger.debug("Schema '%s' reset complete on %s", schema_name, engine.url)
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to reset schema '%s' on %s", schema_name, _safe_url(engine.url))
        raise


async def _truncate_all_tables(engine: AsyncEngine) -> None:
    """Remove all data from user tables without touching migration state."""
    logger.debug("Truncating all user tables on %s", _safe_url(engine.url))
    preparer = engine.dialect.identifier_preparer
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                sqlalchemy.text(
                    """
                    SELECT table_schema, table_name
                    FROM information_schema.tables
                    WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
                    ORDER BY table_schema, table_name
                    """
                )
            )
            tables = [
                f"{preparer.quote_schema(schema)}.{preparer.quote(table_name)}"
                if schema and schema != "public"
                else preparer.quote(table_name)
                for schema, table_name in result
                if table_name not in ("alembic_version", "installation")
            ]

            if not tables:
                logger.debug("No user tables found to truncate on %s", _safe_url(engine.url))
                return

            truncate_stmt = sqlalchemy.text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE")
            await conn.execute(truncate_stmt)
        logger.debug("Truncated user tables on %s", _safe_url(engine.url))
    except Exception:  # pragma: no cover - defensive logging
        logger.exception("Failed to truncate tables on %s", _safe_url(engine.url))
        raise


@pytest_asyncio.fixture(scope="session")
async def test_db_engine(worker_id: str) -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine with the migrated schema.

    Args:
        worker_id: pytest-xdist worker ID

    Yields:
        Async engine for test database

    """
    # Get worker-specific database URL
    test_database_url = get_test_database_url(worker_id)
    db_name = f"nexus_test_{worker_id}" if worker_id != "master" else "nexus_test"

    # First, connect to the default database to create test database if needed
    logger.debug("Ensuring test database exists for worker '%s' (%s)", worker_id, db_name)
    default_db_url = f"postgresql+asyncpg://{TEST_DB_USER}:{TEST_DB_PASSWORD}@{TEST_DB_HOST}:{TEST_DB_PORT}/postgres"
    temp_engine = create_async_engine(default_db_url, isolation_level="AUTOCOMMIT", poolclass=NullPool)

    try:
        async with temp_engine.connect() as conn:
            # Check if test database exists
            result = await conn.execute(
                sqlalchemy.text("SELECT 1 FROM pg_database WHERE datname = :db_name"),
                {"db_name": db_name},
            )
            exists = result.scalar() is not None

            if not exists:
                # Create test database - database names cannot be parameterized
                # db_name is constructed from trusted sources only (worker_id fixture)
                await conn.execute(sqlalchemy.text(f"CREATE DATABASE {db_name}"))
    finally:
        await temp_engine.dispose()

    # Now connect to the test database
    engine = create_async_engine(
        test_database_url,
        echo=False,
        poolclass=NullPool,
    )

    # Ensure a clean schema and apply migrations so tests exercise real DB structure
    await _reset_schema(engine)
    await _upgrade_database_schema(test_database_url)
    logger.debug("Test database ready for worker '%s' at %s", worker_id, test_database_url)

    yield engine

    # Clean up schema and dispose engine after session
    await _reset_schema(engine)
    logger.debug("Test database schema reset complete for worker '%s'", worker_id)
    await engine.dispose()


@pytest_asyncio.fixture
async def test_db_session(test_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session.

    Args:
        test_db_engine: Test database engine

    Yields:
        AsyncSession for tests

    """
    # Clear data before each test while keeping the migrated schema intact
    await _truncate_all_tables(test_db_engine)
    logger.debug("Created clean test session for %s", _safe_url(test_db_engine.url))

    async_session = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    session = async_session()
    try:
        yield session
        # Only commit if session is still active (constraint violation tests cause automatic rollback during flush)
        if session.is_active:
            await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@pytest_asyncio.fixture(scope="session")
async def session_app(worker_id: str) -> AsyncGenerator[FastAPI, None]:
    """Create a session-scoped app with routers discovered once per worker.

    This fixture performs router discovery once when the worker starts,
    eliminating the need to run discovery for every test. This prevents
    file lock contention and significantly improves test performance.

    Args:
        worker_id: pytest-xdist worker ID

    Yields:
        FastAPI application with routers registered

    """
    # Trigger app lifespan startup (which includes router discovery)
    # This happens once per worker session
    async with app.router.lifespan_context(app):
        logger.info("Session app initialized for worker '%s'", worker_id)

        yield app


@pytest.fixture
def mock_openrouter_llm() -> Generator[MagicMock, None, None]:
    """Mock get_openrouter_llm to avoid requiring OPENROUTER_API_KEY.

    Use this fixture in tests that call API endpoints which check for LLM configuration.
    This prevents 503 errors when the API key is not set in the test environment.

    The mock LLM supports async invocation (ainvoke) and returns a properly structured
    AIMessage response that matches what the GenericAgent expects.

    Also mocks CompressorService to avoid requiring OpenRouter API key during
    planner integration (which now creates CompressorService via factory).

    Yields:
        MagicMock representing the LLM instance with async support

    """
    mock_llm = MagicMock()

    # Create mock for LLM with tools bound (pattern used by GenericAgent)
    mock_llm_with_tools = AsyncMock()
    mock_llm_with_tools.ainvoke = AsyncMock(
        return_value=AIMessage(
            content="Mock LLM response for testing",
            response_metadata={"model": "mock-model", "finish_reason": "stop"},
        )
    )

    # Setup bind_tools method to return the tool-bound mock
    mock_llm.bind_tools = MagicMock(return_value=mock_llm_with_tools)
    mock_llm.model_name = "mock-model"

    # Mock CompressorService for planner integration
    mock_compressor = AsyncMock()
    mock_compressor.compress = AsyncMock(return_value="Compressed content for testing")

    # Patch in all locations where get_openrouter_llm is imported
    # AND patch CompressorService.__init__ to avoid OpenRouter API key requirement
    # AND patch OrchestrationService._get_tools to avoid slow tool synchronization retry logic
    with (
        patch(
            "nexus.invocations.router.get_openrouter_llm",
            return_value=mock_llm,
        ),
        patch(
            "nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm",
            return_value=mock_llm,
        ),
        patch(
            "nexus.agent_orchestrator.context_manager.compressor.CompressorService",
            return_value=mock_compressor,
        ),
        patch(
            "nexus.agent_orchestrator.services.orchestration_service.OrchestrationService._get_tools",
            return_value=[],
        ),
    ):
        yield mock_llm


@pytest.fixture
def mock_session_factory() -> Callable[[], AsyncGenerator[Any, None]]:
    """Provide a mock database session factory for unit tests.

    This fixture creates a mock AsyncSession that can be used as a session factory
    in components that require database access. The mock session is properly configured
    with async context manager support (__aenter__ and __aexit__).

    Returns:
        Callable that returns an async generator yielding a mock AsyncSession

    Example:
        async def test_something(mock_session_factory):
            component = MyComponent(session_factory=mock_session_factory)
            # component will use the mock session

    """
    mock_session = AsyncMock()
    mock_session.__aenter__ = AsyncMock(return_value=mock_session)
    mock_session.__aexit__ = AsyncMock(return_value=None)

    async def session_gen() -> AsyncGenerator[Any, None]:
        yield mock_session

    return session_gen


@pytest_asyncio.fixture
async def base_client(test_db_session: AsyncSession, session_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create a base test client with database session override (no authentication).

    Uses the session-scoped app to avoid triggering router discovery on every test.
    Only the database session is overridden per-test for proper isolation.

    Args:
        test_db_session: Test database session
        session_app: Session-scoped app with routers already registered

    Yields:
        AsyncClient for API testing without authentication

    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    session_app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=session_app),
        base_url="http://test",
    ) as client:
        yield client

    session_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def base_client_with_mocked_llm(base_client: AsyncClient, mock_openrouter_llm: MagicMock) -> AsyncClient:
    """Create a base test client with mocked OpenRouter LLM.

    Use this fixture for tests that need to:
    - Bypass the 503 check when OpenRouter API key is not configured
    - Test invocation execution with a mocked LLM response

    The mock LLM supports async invocation (ainvoke) and returns a properly
    structured AIMessage response.

    Args:
        base_client: Base test client with database session
        mock_openrouter_llm: Mock for OpenRouter LLM configuration

    Returns:
        AsyncClient for API testing with mocked LLM

    """
    return base_client


@pytest_asyncio.fixture
async def base_client_with_provider_factory(
    base_client: AsyncClient, test_provider_factory: ProviderFactory
) -> AsyncClient:
    """Create a base test client with dependency overrides.

        - Database session (no authentication).
        - ProviderFactory (MockMCPProvider registered).

    Yields:
        AsyncClient for API testing without authentication and MockMCPProvider

    """

    async def override_get_provider_factory() -> ProviderFactory:
        return test_provider_factory

    app.dependency_overrides[get_provider_factory] = override_get_provider_factory

    return base_client


@pytest.fixture
def default_user_data() -> dict[str, Any]:
    """Provide default user attributes."""
    return {
        "username": "testuser",
        "email": "testuser@example.com",
        "full_name": "Test User",
        "role": UserRole.CREATOR,
    }


@pytest_asyncio.fixture
async def user_factory(
    test_db_session: AsyncSession, default_user_data: dict[str, Any]
) -> Callable[..., Awaitable["User"]]:
    """Factory fixture for creating a custom user."""

    async def _create_user(**overrides: object) -> "User":
        user_data = {**default_user_data, **overrides}
        user = User(**user_data)
        test_db_session.add(user)
        await test_db_session.commit()
        return user

    return _create_user


@pytest_asyncio.fixture
async def test_user(user_factory: Callable[..., Awaitable["User"]]) -> "User":
    """Create test user with default attributes."""
    return await user_factory()


@pytest_asyncio.fixture
async def test_workflow_definition() -> dict[str, Any]:
    """Create a test workflow definition."""
    return {
        "schemaVersion": "1.0.0",
        "version": 1,
        "metadata": {
            "name": "test-workflow",
            "description": "Test workflow",
        },
        "triggers": [
            {
                "type": "manual",
            }
        ],
        "workflow": {
            "activities": [
                {
                    "id": "test_activity",
                    "name": "test_activity",
                    "type": "task",
                    "task": {
                        "executor": "script",
                        "config": {
                            "language": "bash",
                            "code": "echo 'test'",
                        },
                    },
                }
            ],
        },
    }


@pytest_asyncio.fixture
async def test_workflow(
    test_db_session: AsyncSession, test_user: "User", test_workflow_definition: dict[str, Any]
) -> "Workflow":
    """Create a test workflow with version.

    Args:
        test_db_session: Test database session
        test_user: Test user
        test_workflow_definition: Test Workflow definition

    Returns:
        Workflow: Test workflow instance

    """
    workflow = Workflow(
        name="test-workflow",
        description="Test workflow for execution tests",
        created_by=test_user.id,
        is_enabled=True,
        current_version=1,
    )
    test_db_session.add(workflow)

    version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition=test_workflow_definition,
        created_by=test_user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    return workflow


@pytest_asyncio.fixture
async def test_execution(test_db_session: AsyncSession, test_user: "User", test_workflow: "Workflow") -> "Execution":
    """Create a test execution.

    Args:
        test_db_session: Test database session
        test_user: Test user
        test_workflow: Test workflow

    Returns:
        Execution: Test execution instance

    """
    # Get the workflow version ID
    result = await test_db_session.exec(
        select(WorkflowVersion.id).where(
            WorkflowVersion.workflow_id == test_workflow.id,
            WorkflowVersion.version == test_workflow.current_version,
        )
    )
    version_id = result.one()

    execution = Execution(
        workflow_id=test_workflow.id,
        workflow_version_id=version_id,
        temporal_workflow_id=f"exec-{uuid4()}",
        status=ExecutionStatus.PENDING,
        input_data={},
        created_by=test_user.id,
    )
    test_db_session.add(execution)
    await test_db_session.commit()
    return execution


@pytest_asyncio.fixture
async def test_activity_definition() -> dict[str, Any]:
    """Create a test workflow activity definition."""
    return {
        "id": "test_activity",
        "type": "task",
        "task": {"executor": "script", "config": {"code": "print('test')"}},
    }


@pytest_asyncio.fixture
async def test_activity(
    test_db_session: AsyncSession, test_execution: Execution, test_activity_definition: dict[str, Any]
) -> "ActivityExecution":
    """Create a test workflow activity.

    Args:
        test_db_session: Test database session
        test_execution: Test Execution
        test_activity_definition: Test ActivityExecution definition

    Returns:
        ActivityExecution: Test workflow instance

    """
    now = datetime.now(UTC)

    activity = ActivityExecution(
        execution_id=test_execution.id,
        activity_name=test_activity_definition.get("id"),
        temporal_activity_id="temporal-123",
        status=ActivityStatus.COMPLETED,
        activity_definition=test_activity_definition,
        labels={"environment": "test"},
        started_at=now,
        completed_at=now,
        input_data={"param": "value"},
        output_data={"result": "success"},
        error_details=None,
        retry_count=0,
        iteration=None,
    )

    test_db_session.add(activity)
    await test_db_session.commit()
    return activity


@pytest_asyncio.fixture
async def auth_client(base_client: AsyncClient, test_user: "User") -> AsyncClient:
    """Create an authenticated test client with test_user.

    Args:
        base_client: Base test client without authentication
        test_user: Test user for authentication

    Returns:
        AsyncClient: Authenticated test client

    """

    async def override_get_current_user() -> User:
        return test_user

    app.dependency_overrides[get_current_user] = override_get_current_user

    return base_client


@pytest_asyncio.fixture
async def auth_client_with_mocked_llm(base_client_with_mocked_llm: AsyncClient, test_user: "User") -> AsyncClient:
    """Create an authenticated test client with mocked OpenRouter LLM.

    Use this fixture for tests that need authentication AND a mocked LLM.
    This is useful for integration tests that test invocation execution
    without requiring a real OpenRouter API key.

    Args:
        base_client_with_mocked_llm: Base test client with mocked LLM
        test_user: Test user for authentication

    Returns:
        AsyncClient: Authenticated test client with mocked LLM

    """

    async def override_get_current_user() -> User:
        return test_user

    app.dependency_overrides[get_current_user] = override_get_current_user

    return base_client_with_mocked_llm


@pytest.fixture
def sync_test_client(
    test_db_session: AsyncSession,
    test_db_engine: AsyncEngine,
) -> Generator[TestClient, None, None]:
    """Create a synchronous test client with DB and streaming overrides.

    Ensures WebSocket handlers (which bypass FastAPI dependencies) use the same
    test database as HTTP requests by overriding both get_db and the execution
    streaming service to point at the per-test database engine.

    Yields:
        TestClient for synchronous API testing

    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    previous_get_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = override_get_db

    session_factory = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    previous_streaming_service = getattr(app.state, "execution_streaming_service", None)
    app.state.execution_streaming_service = ExecutionStreamingService(session_factory=session_factory)

    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous_get_db is not None:
            app.dependency_overrides[get_db] = previous_get_db
        else:
            app.dependency_overrides.pop(get_db, None)

        if previous_streaming_service is not None:
            app.state.execution_streaming_service = previous_streaming_service
        elif hasattr(app.state, "execution_streaming_service"):
            delattr(app.state, "execution_streaming_service")


# ============================================================================
# Temporal Fixtures
# ============================================================================


@pytest_asyncio.fixture(scope="session")
async def temporal_env() -> AsyncGenerator[WorkflowEnvironment, None]:
    """Provide a Temporal test environment.

    This fixture starts an in-memory Temporal test server for integration tests.
    The server is shared across all tests in the session for performance.

    Yields:
        WorkflowEnvironment: Temporal test environment with client

    """
    logger.info("Starting Temporal test environment...")

    async with await WorkflowEnvironment.start_time_skipping() as env:
        logger.info("Temporal test environment started (namespace: %s)", env.client.namespace)
        yield env

    logger.info("Temporal test environment stopped")


@pytest_asyncio.fixture
async def temporal_client(temporal_env: WorkflowEnvironment) -> Client:
    """Provide a Temporal client connected to the test environment.

    Args:
        temporal_env: The Temporal test environment fixture

    Returns:
        Client: Temporal client for test use

    """
    return temporal_env.client


@pytest_asyncio.fixture
async def temporal_worker(temporal_env: WorkflowEnvironment) -> AsyncGenerator[Worker, None]:
    """Provide a Temporal worker for testing.

    This worker is configured with the DynamicWorkflow and all activity executors
    (bash, Python, and API).

    Args:
        temporal_env: The Temporal test environment fixture

    Yields:
        Worker: Configured Temporal worker

    """
    task_queue = "test-workflow-queue"

    logger.info("Starting test worker on queue: %s", task_queue)

    async with Worker(
        temporal_env.client,
        task_queue=task_queue,
        workflows=[DynamicWorkflow],
        activities=[execute_bash_script, execute_python_script, execute_api_request],
    ) as worker:
        logger.info("Test worker started on queue: %s", task_queue)
        yield worker

    logger.info("Test worker stopped")


@pytest.fixture
def task_queue() -> str:
    """Provide the task queue name for tests.

    Returns:
        str: Task queue name

    """
    return "test-workflow-queue"


@pytest_asyncio.fixture
async def run_workflow_from_file(
    temporal_client: Client,
    temporal_worker: Worker,
    task_queue: str,
) -> Callable[..., Awaitable[dict[str, Any]]]:
    """Return a function that runs a workflow from a YAML file.

    Returns a function that loads and executes a workflow, reducing test boilerplate.

    Usage:
        result = await run_workflow_from_file(
            "examples/basic/hello-world.yaml",
            workflow_id="test-hello",
            inputs={"name": "World"}
        )
    """

    async def _run(
        workflow_path: str,
        workflow_id: str | None = None,
        inputs: dict[str, Any] | None = None,
        execution_timeout: timedelta | None = None,
    ) -> dict[str, Any]:
        """Load and execute a workflow from a YAML file.

        Args:
            workflow_path: Path to workflow YAML file relative to tests/integration/workflow/
            workflow_id: Optional workflow ID (auto-generated if not provided)
            inputs: Optional workflow inputs
            execution_timeout: Optional execution timeout

        Returns:
            Workflow execution result

        """
        # Load workflow
        full_path = Path("tests/integration/workflow") / workflow_path
        workflow_yaml = full_path.read_text()
        workflow_def = parse_workflow_yaml(workflow_yaml)

        # Generate workflow ID if not provided
        if workflow_id is None:
            workflow_id = f"test-{workflow_def.metadata.name}-{uuid4()}"

        # Start workflow
        kwargs: dict[str, Any] = {
            "args": [workflow_def.model_dump(mode="json", by_alias=True), f"exec-{uuid4()}", inputs or {}],
            "id": workflow_id,
            "task_queue": task_queue,
        }
        if execution_timeout:
            kwargs["execution_timeout"] = execution_timeout

        handle = await temporal_client.start_workflow(DynamicWorkflow.run, **kwargs)

        # Return result
        result: dict[str, Any] = await handle.result()
        return result

    return _run


@pytest.fixture
def load_workflow() -> Callable[[str], Any]:
    """Return a function that loads and parses a workflow YAML file.

    Returns a function that loads a workflow definition without executing it.

    Usage:
        workflow_def = load_workflow("examples/basic/hello-world.yaml")
    """

    def _load(workflow_path: str) -> WorkflowDefinition:
        """Load a workflow definition from a YAML file.

        Args:
            workflow_path: Path to workflow YAML file relative to tests/integration/workflow/

        Returns:
            WorkflowDefinition: Parsed workflow definition

        """
        full_path = Path("tests/integration/workflow") / workflow_path
        workflow_yaml = full_path.read_text()
        return parse_workflow_yaml(workflow_yaml)

    return _load


# ============================================================================
# Agent Orchestrator Fixtures
# ============================================================================


@pytest.fixture
def fast_retry_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure fast retry settings for agent orchestrator tests.

    This fixture applies to tests that need faster retry operations
    and makes retry operations run much faster for testing, particularly
    for invocation execution retry workflows that would otherwise be slow.

    Patches get_settings() to return a Settings object with fast adapter retry values
    while preserving access to all other settings.
    """
    with override_settings(
        adapter_max_retries=3,
        adapter_initial_backoff_seconds=0.1,
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=1.0,
        adapter_request_timeout_seconds=5.0,
    ):
        yield


@pytest.fixture
def disabled_retry_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure disabled retry settings for agent orchestrator tests.

    This fixture sets adapter retry settings with retries disabled (max_retries=0)
    to test immediate failure scenarios without retry attempts.

    Patches get_settings() to return a Settings object with disabled adapter retry values
    while preserving access to all other settings.
    """
    with override_settings(
        adapter_max_retries=0,
        adapter_initial_backoff_seconds=1.0,
        adapter_backoff_growth_factor=2.0,
        adapter_max_backoff_seconds=10.0,
        adapter_request_timeout_seconds=30.0,
    ):
        yield


# ============================================================================
# Tool Manager Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def test_tool_provider(test_db_session: AsyncSession, test_user: User) -> "ToolProvider":
    """Create a test Tool Provider.

    Args:
        test_db_session: Test database session
        test_user: Test User

    Returns:
        ToolProvider: Test Tool Provider instance

    """
    tool_provider = ToolProvider(
        name="mock-provider",
        configuration={"provider_type": "mcp", "base_url": "http://localhost:8080", "api_key": "test-key"},
        created_by=test_user.id,
    )
    test_db_session.add(tool_provider)
    await test_db_session.commit()
    return tool_provider


@pytest_asyncio.fixture
async def multiple_test_providers(test_db_session: AsyncSession, test_user: User) -> list[ToolProvider]:
    """Create multiple test providers for pagination, filtering, and sorting tests."""
    providers = [
        ToolProvider(
            name="Alpha Provider",
            description="First provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://alpha.example.com", "api_key": "alpha-key"},
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Beta Provider",
            description="Second provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://beta.example.com", "api_key": "beta-key"},
            enabled=False,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Gamma Provider",
            description="Third provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://gamma.example.com", "api_key": "gamma-key"},
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Delta Provider",
            description="Fourth provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://delta.example.com", "api_key": "delta-key"},
            enabled=True,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Echo Provider",
            description="Fifth provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://echo.example.com", "api_key": "echo-key"},
            enabled=False,
            created_by=test_user.id,
        ),
        ToolProvider(
            name="Foxtrot Provider",
            description="Sixth provider for testing",
            configuration={"provider_type": "mcp", "base_url": "https://foxtrot.example.com", "api_key": "foxtrot-key"},
            enabled=True,
            created_by=test_user.id,
        ),
    ]

    for provider in providers:
        test_db_session.add(provider)

    await test_db_session.commit()

    for provider in providers:
        await test_db_session.refresh(provider)

    return providers


@pytest_asyncio.fixture
async def test_tool(test_db_session: AsyncSession, test_tool_provider: ToolProvider, test_user: User) -> "Tool":
    """Create a test Tool.

    Args:
        test_db_session: Test database session
        test_tool_provider: Test Tool Provider
        test_user: Test User

    Returns:
        Tool: Test Tool instance

    """
    tool = Tool(
        name="mock-tool", provider_id=test_tool_provider.id, namespaced_name="mock::tool", created_by=test_user.id
    )
    test_db_session.add(tool)
    await test_db_session.commit()
    return tool


@pytest_asyncio.fixture
async def tool_factory(test_db_session: AsyncSession, test_tool_provider: ToolProvider, test_user: User) -> ToolFactory:
    """Create a factory fixture for multiple test tools with configurable properties.

    Returns a ToolFactory instance that can create tools with various configurations for different test scenarios.

    Usage:
        # Create tools for bulk operations
        tools = await tool_factory.create_bulk_tools(count=3)

        # Create tools for concurrency testing
        tools = await tool_factory.create_concurrency_tools(count=6)

        # Create tools for list/filter testing
        tools = await tool_factory.create_list_tools()

        # Create custom tools
        tools = await tool_factory.create_tools(
            count=5,
            name_prefix="Custom",
            statuses=[ToolStatus.AVAILABLE, ToolStatus.ERROR]
        )
    """
    return ToolFactory(test_db_session, test_tool_provider, test_user)


@pytest_asyncio.fixture
async def test_provider_factory() -> "ProviderFactory":
    """Create a ProviderFactory with MockMCPProvider registered for testing.

    Returns:
        ProviderFactory: Provider Factory instance with MockMCPProvider registered

    """
    provider_factory = ProviderFactory()
    provider_factory.register_provider_type("mcp", MockMCPProvider)
    return provider_factory


@pytest_asyncio.fixture
async def test_tool_provider_service(
    test_db_session: AsyncSession, test_user: User, test_provider_factory: ProviderFactory
) -> "ToolProviderService":
    """Create a ToolProviderService with MCP provider registered for testing.

    Args:
        test_db_session: Test database session
        test_user: Test User
        test_provider_factory: Test Provider Factory

    Returns:
        ToolProviderService: Service instance with MCP provider registered

    """
    return ToolProviderService(test_db_session, test_user, test_provider_factory)


# ============================================================================
# Workflow Executions Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def executions_factory(
    test_db_session: AsyncSession, test_workflow: Workflow, test_user: User
) -> ExecutionsFactory:
    """Create a factory fixture for multiple test executions with configurable properties.

    Returns an ExecutionsFactory instance that can create executions with various
    configurations for different test scenarios.

    Usage:
        # Create executions with default settings
        executions = await executions_factory.create_executions(count=3)

        # Create executions with specific status and labels
        executions = await executions_factory.create_executions(
            count=5,
            status=ExecutionStatus.RUNNING,
            labels={"environment": "production", "team": "backend"}
        )
    """
    return ExecutionsFactory(test_db_session, test_workflow, test_user)


@pytest_asyncio.fixture
async def activities_factory(test_db_session: AsyncSession) -> ActivitiesFactory:
    """Create a factory fixture for test activity executions.

    Returns an ActivitiesFactory instance that can create ActivityExecution
    rows for any execution via ``create_activities(execution, names, ...)``.
    """
    return ActivitiesFactory(test_db_session)


@pytest_asyncio.fixture
async def approvals_factory(test_db_session: AsyncSession, test_user: User) -> ApprovalsFactory:
    """Create a factory fixture for multiple test approval requests with configurable properties.

    Returns an ApprovalsFactory instance that can create approval requests with various
    configurations for different test scenarios.

    Usage:
        # Create pending approvals with default settings
        approvals = await approvals_factory.create_pending_approvals(count=3)

        # Create approvals with mixed statuses
        approvals = await approvals_factory.create_mixed_status_approvals(
            pending_count=2,
            approved_count=1,
            rejected_count=1
        )

        # Create custom approvals
        approvals = await approvals_factory.create_approvals(
            count=5,
            name_prefix="Custom Approval",
            statuses=[ApprovalRequestStatus.PENDING, ApprovalRequestStatus.APPROVED]
        )
    """
    return ApprovalsFactory(test_db_session, test_user)


@pytest.fixture
def fast_workflow_client_settings(
    override_settings: Callable[..., AbstractContextManager[object]],
) -> Generator[None, None, None]:
    """Configure fast workflow client settings for approval tests.

    This fixture applies fast retry settings for WorkflowApiClient tests
    to make retry operations run much faster for testing.

    Patches get_settings() to return a Settings object with fast workflow client retry values
    while preserving access to all other settings.
    """
    with override_settings(
        workflow_client_max_retries=2,
        workflow_client_initial_backoff_seconds=0.01,
        workflow_client_backoff_growth_factor=2.0,
        workflow_client_max_backoff_seconds=0.1,
        workflow_client_request_timeout_seconds=1.0,
    ):
        yield


# ============================================================================
# Mock Fixtures
# ============================================================================


@pytest.fixture
def mock_token_calculator() -> Mock:
    """Create a mock TokenCalculator for testing.

    This fixture provides a Mock with spec matching TokenCalculator,
    useful for testing compression and token validation logic without
    actual tokenization overhead.

    Returns:
        Mock: A mock TokenCalculator instance.

    """
    from nexus.agent_orchestrator.token_manager.services import TokenCalculator

    return Mock(spec=TokenCalculator)


@pytest.fixture
def mock_compressor() -> AsyncMock:
    """Create a mock CompressorService for testing.

    This fixture provides an AsyncMock for CompressorService,
    useful for testing context manager and assembler logic without
    actual compression overhead.

    Returns:
        AsyncMock: A mock CompressorService instance.

    """
    return AsyncMock()


@pytest.fixture
def mock_websocket() -> MagicMock:
    """Create a mock WebSocket for testing.

    This fixture provides a MagicMock configured for WebSocket testing,
    useful for testing WebSocket handlers and streaming services.

    Returns:
        MagicMock: A mock WebSocket instance with client info and app state.

    """
    websocket = MagicMock()
    websocket.send_json = AsyncMock()
    websocket.close = AsyncMock()
    websocket.client.host = "127.0.0.1"
    websocket.client.port = 12345
    websocket.app.state = MagicMock()
    return websocket
