"""Shared pytest fixtures for all tests.

This module provides:
- Database fixtures for API/database tests
- Temporal testserver fixtures for workflow tests
"""

import asyncio
import gc
import logging
import os
from collections.abc import AsyncGenerator, Awaitable, Callable, Generator
from datetime import timedelta
from pathlib import Path
from typing import Any
from uuid import uuid4

import pytest
import pytest_asyncio
import sqlalchemy
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import NullPool
from sqlmodel import SQLModel
from temporalio.client import Client
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import Worker

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.api.auth.dependencies import get_current_user
from nexus.api.db import get_db
from nexus.api.main import app
from nexus.core.models import User, UserRole
from nexus.workflows.activities.script_activity import execute_bash_script
from nexus.workflows.dynamic_workflow import DynamicWorkflow
from nexus.workflows.models import Workflow, WorkflowVersion
from nexus.workflows.workflow_engine.models import WorkflowDefinition
from nexus.workflows.yaml_workflow_parser import parse_workflow_yaml

# Ensure models are registered with SQLModel metadata
_ = (Invocation, User, Workflow, WorkflowVersion)

logger = logging.getLogger(__name__)

# Test database configuration
TEST_DB_USER = os.getenv("NEXUS_DB_USER", "admin")
TEST_DB_PASSWORD = os.getenv("NEXUS_DB_PASSWORD", "admin")
TEST_DB_HOST = os.getenv("NEXUS_DB_HOST", "localhost")
TEST_DB_PORT = os.getenv("NEXUS_DB_PORT", "5432")


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


@pytest_asyncio.fixture(autouse=True)
async def cleanup_subprocesses() -> AsyncGenerator[None, None]:
    """Ensure subprocess cleanup after each async test.

    This fixture runs after every async test to give subprocess transports
    a chance to cleanup before the event loop closes, preventing
    "Event loop is closed" warnings.

    Note: Only applies to async tests. Sync tests don't need this cleanup.
    """
    yield

    # Force garbage collection multiple times to ensure subprocess cleanup
    for _ in range(3):
        gc.collect()
        await asyncio.sleep(0.01)

    # One final collection and delay
    gc.collect()
    await asyncio.sleep(0.05)


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


@pytest_asyncio.fixture(scope="session")
async def test_db_engine(worker_id: str) -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine.

    Args:
        worker_id: pytest-xdist worker ID

    Yields:
        Async engine for test database

    """
    # Get worker-specific database URL
    test_database_url = get_test_database_url(worker_id)
    db_name = f"nexus_test_{worker_id}" if worker_id != "master" else "nexus_test"

    # First, connect to the default database to create test database if needed
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

    # Import models and create tables once for the session
    async with engine.begin() as conn:
        # Create tables from SQLModel (for all models: User, Workflow, WorkflowVersion, Invocation)
        await conn.run_sync(SQLModel.metadata.create_all)

    yield engine

    # Drop tables and dispose engine after session
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture
async def test_db_session(test_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session.

    Args:
        test_db_engine: Test database engine

    Yields:
        AsyncSession for tests

    """
    # Clear all data before each test for isolation
    async with test_db_engine.begin() as conn:
        # Drop and recreate all SQLModel tables
        await conn.run_sync(SQLModel.metadata.drop_all)
        await conn.run_sync(SQLModel.metadata.create_all)

    async_session = async_sessionmaker(
        test_db_engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    session = async_session()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


@pytest_asyncio.fixture
async def base_client(test_db_session: AsyncSession) -> AsyncGenerator[AsyncClient, None]:
    """Create a base test client with database session override (no authentication).

    Args:
        test_db_session: Test database session

    Yields:
        AsyncClient for API testing without authentication

    """

    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def test_user(test_db_session: AsyncSession) -> "User":
    """Create a test user.

    Args:
        test_db_session: Test database session

    Returns:
        User: Test user instance

    """
    user = User(
        username="testuser",
        email="testuser@example.com",
        full_name="Test User",
        role=UserRole.CREATOR,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    await test_db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_workflow(test_db_session: AsyncSession, test_user: "User") -> "Workflow":
    """Create a test workflow with version.

    Args:
        test_db_session: Test database session
        test_user: Test user

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
    await test_db_session.flush()

    version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="1.0.0",
        workflow_definition={
            "schemaVersion": "1.0.0",
            "name": "test-workflow",
            "description": "Test workflow",
            "activities": [],
        },
        created_by=test_user.id,
    )
    test_db_session.add(version)
    await test_db_session.commit()
    await test_db_session.refresh(workflow)
    return workflow


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


@pytest.fixture
def sync_test_client() -> Generator[TestClient, None, None]:
    """Create a synchronous test client.

    Yields:
        TestClient for synchronous API testing

    """
    with TestClient(app) as client:
        yield client


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

    This worker is configured with the DynamicWorkflow and bash script activity.

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
        activities=[execute_bash_script],
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
