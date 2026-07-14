"""FastAPI test client fixtures for integration tests."""

from __future__ import annotations

from collections.abc import AsyncGenerator, Generator
from contextlib import asynccontextmanager
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
import structlog
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.auth.dependencies import get_current_user
from nexus.core.database.session import get_db
from nexus.core.models import User
from nexus.workflows.services.execution_streaming_service import ExecutionStreamingService

if TYPE_CHECKING:
    from temporalio.testing import WorkflowEnvironment
    from temporalio.worker import Worker
    from nexus.tool_manager.lib.providers.factory import ProviderFactory

logger = structlog.stdlib.get_logger(__name__)


@asynccontextmanager
async def _scoped_overrides(app: FastAPI) -> AsyncGenerator[None, None]:
    """Save and restore dependency_overrides around a test fixture."""
    saved = dict(app.dependency_overrides)
    try:
        yield
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(saved)


@pytest_asyncio.fixture(scope="session")
async def session_app(
    worker_id: str,
    test_db_engine: AsyncEngine,
    test_cache: None,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[FastAPI, None]:
    """Create a session-scoped app with routers discovered once per worker."""
    from nexus.api.main import app

    mock_evaluator = AsyncMock()
    mock_evaluator.health = AsyncMock(return_value=True)
    mock_evaluator.start = MagicMock()
    mock_evaluator.stop = AsyncMock()
    mock_evaluator.evaluate = AsyncMock(return_value={"allow": True})

    with (
        patch("nexus.core.database.session.engine", test_db_engine),
        patch("nexus.core.database.session.AsyncSessionLocal", test_session_factory),
        patch("nexus.api.main.engine", test_db_engine),
        patch("nexus.api.main.AsyncSessionLocal", test_session_factory),
        patch("nexus.audit.outbox.worker.AsyncSessionLocal", test_session_factory),
        patch("nexus.audit.outbox.worker.AuditWorkerAsyncSessionLocal", test_session_factory),
        patch("nexus.audit.outbox.session.AuditWorkerAsyncSessionLocal", test_session_factory),
        patch("nexus.api.main.RegoEvaluator", return_value=mock_evaluator),
    ):
        from nexus.core.seed import run_seeders

        await run_seeders(test_session_factory)

        async with app.router.lifespan_context(app):
            logger.info("Session app initialized for worker '%s'", worker_id)
            yield app


@pytest_asyncio.fixture
async def base_client(test_db_session: AsyncSession, session_app: FastAPI) -> AsyncGenerator[AsyncClient, None]:
    """Create a base test client with database session override (no authentication)."""
    async with _scoped_overrides(session_app):

        async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
            yield test_db_session

        session_app.dependency_overrides[get_db] = override_get_db

        async with AsyncClient(
            transport=ASGITransport(app=session_app),
            base_url="http://test",
        ) as client:
            yield client


@pytest.fixture
def _override_temporal(
    session_app: FastAPI,
    temporal_env: "WorkflowEnvironment",
    temporal_worker: "Worker",
) -> None:
    """Add Temporal execution service to dependency overrides."""
    from nexus.workflows.executions_router import get_temporal_execution_service
    from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

    _svc = TemporalExecutionService(temporal_env.client, "test-workflow-queue", "test-workflow-queue")
    session_app.dependency_overrides[get_temporal_execution_service] = lambda: _svc


@pytest_asyncio.fixture
async def base_client_with_mocked_llm(
    base_client: AsyncClient, mock_openrouter_llm: MagicMock, _override_temporal: None
) -> AsyncClient:
    """Base test client with mocked LLM and Temporal support."""
    return base_client


@pytest_asyncio.fixture
async def base_client_with_provider_factory(
    base_client: AsyncClient, test_provider_factory: "ProviderFactory"
) -> AsyncClient:
    """Create a base test client with ProviderFactory override."""
    from nexus.api.main import app
    from nexus.tool_manager.lib.providers.factory import get_provider_factory

    async def override_get_provider_factory() -> "ProviderFactory":
        return test_provider_factory

    app.dependency_overrides[get_provider_factory] = override_get_provider_factory
    return base_client


@pytest_asyncio.fixture
async def auth_client(base_client: AsyncClient, test_user: User) -> AsyncClient:
    """Create an authenticated test client with test_user."""
    from nexus.api.main import app

    async def override_get_current_user() -> User:
        return test_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    return base_client


@pytest_asyncio.fixture
async def auth_client_with_mocked_llm(base_client_with_mocked_llm: AsyncClient, test_user: User) -> AsyncClient:
    """Create an authenticated test client with mocked OpenRouter LLM."""
    from nexus.api.main import app

    async def override_get_current_user() -> User:
        return test_user

    app.dependency_overrides[get_current_user] = override_get_current_user
    return base_client_with_mocked_llm


@pytest.fixture
def sync_test_client(
    session_app: FastAPI,
    test_db_session: AsyncSession,
    test_db_engine: AsyncEngine,
) -> Generator[TestClient, None, None]:
    """Create a synchronous test client with DB and streaming overrides."""
    from nexus.api.main import app

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

    mock_evaluator = AsyncMock()
    mock_evaluator.health = AsyncMock(return_value=True)
    mock_evaluator.start = MagicMock()
    mock_evaluator.stop = AsyncMock()
    mock_evaluator.evaluate = AsyncMock(return_value={"allow": True})

    try:
        with (
            patch("nexus.core.database.session.engine", test_db_engine),
            patch("nexus.core.database.session.AsyncSessionLocal", session_factory),
            patch("nexus.api.main.engine", test_db_engine),
            patch("nexus.api.main.AsyncSessionLocal", session_factory),
            patch("nexus.audit.outbox.worker.AsyncSessionLocal", session_factory),
            patch("nexus.audit.outbox.worker.AuditWorkerAsyncSessionLocal", session_factory),
            patch("nexus.audit.outbox.session.AuditWorkerAsyncSessionLocal", session_factory),
            patch("nexus.api.main.RegoEvaluator", return_value=mock_evaluator),
        ):
            client = TestClient(app)
            try:
                yield client
            finally:
                client.close()
    finally:
        if previous_get_db is not None:
            app.dependency_overrides[get_db] = previous_get_db
        else:
            app.dependency_overrides.pop(get_db, None)

        if previous_streaming_service is not None:
            app.state.execution_streaming_service = previous_streaming_service
        elif hasattr(app.state, "execution_streaming_service"):
            delattr(app.state, "execution_streaming_service")
