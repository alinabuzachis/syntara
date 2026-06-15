"""Shared pytest fixtures for all tests.

This module provides:
- Database fixtures for API/database tests
- Temporal testserver fixtures for workflow tests
"""

# Prevent local .env from leaking into tests. Must be set before Settings is
# imported, since _get_env_file() is evaluated at class-definition time.
import os as _os

_os.environ.setdefault("APP_ENV_FILE_PATH", "/dev/null")
_os.environ.setdefault(
    "APP_SECRET_ENCRYPTION_KEY",
    "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
)

import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator, Awaitable, Callable, Generator
from contextlib import AbstractContextManager, ExitStack, contextmanager
from datetime import UTC, datetime
from importlib.util import find_spec
from pathlib import Path
from typing import TYPE_CHECKING, Any
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
from testcontainers.postgres import PostgresContainer  # type: ignore[import-untyped]
from testcontainers.redis import RedisContainer  # type: ignore[import-untyped]

from nexus.agent_orchestrator.models.invocation import Invocation
from nexus.api.main import app
from nexus.auth.dependencies import get_current_user
from nexus.auth.services.token_service import TokenService
from nexus.core.config.base import Settings, get_settings
from nexus.core.database.session import get_db
from nexus.core.logging.logging import configure_structlog
from nexus.core.models import User
from nexus.core.models.group import Group
from nexus.files.models import FileMetadata
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory
from nexus.tool_manager.models import Tool, ToolProvider
from nexus.tool_manager.services.tool_provider_service import ToolProviderService
from nexus.tool_manager.services.tool_service import ToolService
from nexus.workflows.models import ActivityExecution, ActivityStatus, Workflow, WorkflowVersion, WorkflowVersionStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.services.execution_streaming_service import ExecutionStreamingService
from nexus.workflows.workflow_engine.activities.condition import condition
from nexus.workflows.workflow_engine.activities.converge import converge
from nexus.workflows.workflow_engine.activities.manual_trigger import manual_trigger
from nexus.workflows.workflow_engine.activities.runtime_settings_activity import fetch_workflow_runtime_settings
from nexus.workflows.workflow_engine.activities.script_activity import execute_script_activity
from nexus.workflows.workflow_engine.dynamic_workflow import NexusWorkflow
from tests.fixtures.mock_mcp_provider import MockMCPProvider
from tests.helpers.approval import ApprovalsFactory
from tests.helpers.credential import CredentialFactory
from tests.helpers.execution import ExecutionFactory
from tests.helpers.identity_provider import IdentityProviderFactory
from tests.helpers.token_usage import TokenUsageFactory
from tests.helpers.tool_manager import ToolFactory
from tests.helpers.tool_provider import ToolProviderFactory
from tests.helpers.workflow import ActivitiesFactory, ExecutionsFactory, WorkflowFactory

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry

_EXTERNAL_SERVICES_AVAILABLE = find_spec("external_services") is not None

pytest_plugins = [
    "tests.fixtures.external_services.azuread",
]

if _EXTERNAL_SERVICES_AVAILABLE:
    pytest_plugins = [
        *pytest_plugins,
        "tests.fixtures.external_services.base",
        "tests.fixtures.external_services.keycloak",
        "tests.fixtures.external_services.keycloak_groups",
        "tests.fixtures.external_services.openldap",
        "tests.fixtures.external_services.logstash",
    ]

_ = (Invocation, User, Workflow, WorkflowVersion, Execution, FileMetadata, Group)

# Configure structlog for consistent test logging
# This ensures that all tests have proper structlog configuration,
# preventing unpredictable behavior when error handlers or other components
# use structlog.stdlib.get_logger(__name__) without configuration.
configure_structlog()

logger = structlog.stdlib.get_logger(__name__)


# ============================================================================
# Pytest Configuration Hooks
# ============================================================================

_EXTERNAL_SERVICES_FIXTURES = frozenset(
    {
        "gke_ext_service_client",
        "gke_ext_service_provider",
        "gke_ext_service_url_retriever",
        "keycloak_auth_client",
        "keycloak_nexus_api",
        "keycloak_service",
        "keycloak_user_factory",
        "logstash_service",
        "logstash_nginx_web_service",
        "oidc_provider_factory",
        "oidc_user_factory",
        "openldap_service",
    }
)


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add custom command-line options for pytest."""
    parser.addoption(
        "--run-performance",
        action="store_true",
        default=False,
        help="Run performance tests (excluded by default)",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Skip performance tests unless --run-performance is provided.

    Also skips tests that depend on external-services fixtures when the
    external-services package is not installed.
    """
    if not config.getoption("--run-performance"):
        skip_performance = pytest.mark.skip(reason="need --run-performance option to run")
        for item in items:
            if "performance" in item.keywords:
                item.add_marker(skip_performance)

    if not _EXTERNAL_SERVICES_AVAILABLE:
        skip_ext = pytest.mark.skip(reason="external-services package not installed")
        for item in items:
            if _EXTERNAL_SERVICES_FIXTURES.intersection(getattr(item, "fixturenames", [])):
                item.add_marker(skip_ext)


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
# Live Deployment Fixtures (shared by e2e and performance tests)
# ============================================================================


def _generate_live_token(base_url: str) -> str:
    """Obtain a JWT access token for tests that hit a live Nexus deployment.

    Resolution order:
    1. NEXUS_API_TOKEN env var (pre-generated token for remote deployments)
    2. POST /auth/login using admin password from APP_ADMIN_PASSWORD_PATH
    """
    import httpx  # local import to avoid affecting unit tests that don't need httpx

    env_token = os.environ.get("NEXUS_API_TOKEN")
    if env_token:
        return env_token

    password_path = Path(os.environ.get("APP_ADMIN_PASSWORD_PATH", ".secrets/admin-password"))
    if not password_path.exists():
        msg = f"Admin password file not found: {password_path}. Set NEXUS_API_TOKEN or run 'make secrets-generate'."
        raise RuntimeError(msg)

    password = password_path.read_text().strip()
    if not password:
        msg = f"Admin password file is empty: {password_path}"
        raise RuntimeError(msg)

    response = httpx.post(
        f"{base_url}/api/v1/auth/login",
        json={"username": "admin", "password": password},
        verify=False,  # noqa: S501
        timeout=10,
    )
    response.raise_for_status()
    token: str = response.json()["access_token"]
    return token


@pytest.fixture(scope="session")
def nexus_base_url() -> str:
    """Return the Nexus API base URL from the environment."""
    return os.environ.get("APP_BASE_URL", "http://localhost:8000").rstrip("/")


@pytest.fixture(scope="session")
def auth_headers(nexus_base_url: str) -> dict[str, str]:
    """Return Bearer auth headers for raw httpx calls."""
    token = _generate_live_token(nexus_base_url)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def nexus_client(nexus_base_url: str) -> "AuthenticatedClient":
    """Return an authenticated Nexus API client for the target deployment."""
    import httpx  # local import to avoid affecting unit tests that don't need httpx
    from nexus_api_client import AuthenticatedClient

    try:
        response = httpx.get(f"{nexus_base_url}/health", timeout=5, verify=False)  # noqa: S501
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Nexus deployment not available at {nexus_base_url}: {exc}\n"
            "Start the services first with: make services-run && make dev",
            returncode=1,
        )

    access_token = _generate_live_token(nexus_base_url)
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=access_token, verify_ssl=False)


@pytest.fixture(scope="session")
def nexus_api(nexus_base_url: str, nexus_client: "AuthenticatedClient") -> "NexusApiRegistry":
    """Return a NexusApiRegistry with internal_metrics wired to the root URL.

    The ``nexus_client`` has ``base_url=…/api/v1`` so regular API endpoints
    (``/workflows``, ``/executions``, …) resolve correctly.  However the
    generated ``InternalMetricsApi`` uses paths like
    ``/_internal/metrics/summary`` which must resolve against the
    **deployment root**, not ``/api/v1`` (httpx concatenates relative paths,
    so ``/api/v1`` + ``/_internal/metrics/summary`` →
    ``/api/v1/_internal/metrics/summary`` which 404s).

    This builds the registry normally, then replaces its ``internal_metrics``
    cached_property with an instance backed by a root-level client that
    shares the same auth token.
    """
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.api.internal_metrics import InternalMetricsApi

    registry = NexusApiRegistry(nexus_client)

    root_client = AuthenticatedClient(
        base_url=nexus_base_url,
        token=nexus_client.token,
        verify_ssl=False,
    )
    registry.__dict__["internal_metrics"] = InternalMetricsApi(client=root_client)

    return registry


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


class FakeSettingsCache:
    """In-memory SettingsCache replacement for tests.

    Seeded from SETTINGS_CATALOG defaults, with test-specific overrides applied on top.
    """

    def __init__(self, overrides: dict[str, object] | None = None) -> None:
        """Seed from catalog defaults and apply overrides.

        Args:
            overrides: Mapping of dot-namespaced key to value.

        """
        from nexus.settings.catalog import SETTINGS_CATALOG

        self._store: dict[str, object] = {entry.key: entry.default_value for entry in SETTINGS_CATALOG}
        if overrides:
            unknown = [k for k in overrides if k not in self._store]
            if unknown:
                msg = f"Runtime setting(s) not in SETTINGS_CATALOG: {unknown}"
                raise KeyError(msg)
            self._store.update(overrides)

    async def get(self, key: str) -> Any:  # noqa: ANN401
        """Return the setting value, or None if unknown."""
        return self._store.get(key)

    async def _get_typed(
        self,
        key: str,
        expected_types: type | tuple[type, ...],
        type_name: str,
        *,
        default: Any = None,  # noqa: ANN401
        reject_bool: bool = False,
    ) -> Any:  # noqa: ANN401
        """Fetch a setting and validate its runtime type."""
        from nexus.settings.exceptions import SettingTypeError

        value = await self.get(key)
        if value is None:
            if default is not None:
                return default
            raise SettingTypeError(key, type_name, "None")
        if reject_bool and isinstance(value, bool):
            raise SettingTypeError(key, type_name, "bool")
        if not isinstance(value, expected_types):
            raise SettingTypeError(key, type_name, type(value).__name__)
        return self._validate_against_catalog(key, value, default)

    def _validate_against_catalog(
        self,
        key: str,
        value: Any,  # noqa: ANN401
        default: Any,  # noqa: ANN401
    ) -> Any:  # noqa: ANN401
        """Mirror SettingsCache._validate_against_catalog for test parity."""
        from nexus.settings.catalog import SETTINGS_CATALOG
        from nexus.settings.exceptions import SettingValidationError
        from nexus.settings.validators import validate_setting_value

        defn = next((d for d in SETTINGS_CATALOG if d.key == key), None)
        if defn is None or defn.validation_schema is None:
            return value

        try:
            validate_setting_value(
                key=key,
                value=value,
                value_type=defn.value_type,
                validation_schema=defn.validation_schema,
            )
        except SettingValidationError:
            return defn.default_value if defn.default_value is not None else default

        return value

    async def get_int(self, key: str, *, default: int | None = None) -> int:
        """Return the setting value as an ``int``."""
        return await self._get_typed(key, int, "int", default=default, reject_bool=True)  # type: ignore[no-any-return]

    async def get_float(self, key: str, *, default: float | None = None) -> float:
        """Return the setting value as a ``float``."""
        value = await self._get_typed(key, (int, float), "float", default=default, reject_bool=True)
        return float(value)

    async def get_str(self, key: str, *, default: str | None = None) -> str:
        """Return the setting value as a ``str``."""
        return await self._get_typed(key, str, "str", default=default)  # type: ignore[no-any-return]

    async def get_bool(self, key: str, *, default: bool | None = None) -> bool:
        """Return the setting value as a ``bool``."""
        return await self._get_typed(key, bool, "bool", default=default)  # type: ignore[no-any-return]

    async def invalidate(self, key: str) -> None:
        """Evict key from store."""
        self._store.pop(key, None)

    async def publish_change(self, key: str) -> None:
        """No-op in tests."""

    def on_change(self, key: str, callback: Any) -> None:  # noqa: ANN401
        """Register a callback (no-op in tests — no polling)."""

    def start_watching(self) -> None:
        """No-op in tests."""

    async def stop_watching(self) -> None:
        """No-op in tests."""


@pytest.fixture
def override_runtime_settings() -> Callable[..., AbstractContextManager[FakeSettingsCache]]:
    """Temporarily override runtime settings in tests.

    Swaps the process-wide SettingsCache singleton with a FakeSettingsCache
    seeded from SETTINGS_CATALOG defaults. Only the keys passed in overrides
    differ from catalog defaults.

    Example:
        def test_custom_timeout(override_runtime_settings):
            with override_runtime_settings({"context_manager.request_timeout_seconds": 3}):
                # All runtime settings return catalog defaults except the override
                ...

    """

    @contextmanager
    def _override(
        overrides: dict[str, object] | None = None,
        /,
    ) -> Generator[FakeSettingsCache, None, None]:
        import nexus.settings.cache.settings_cache as _mod

        original = _mod._runtime_settings
        fake = FakeSettingsCache(overrides)
        _mod._runtime_settings = fake  # type: ignore[assignment]
        try:
            yield fake
        finally:
            _mod._runtime_settings = original

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


# ============================================================================
# Database Fixtures
# ============================================================================

# Test database configuration
TEST_DB_USER = os.getenv("APP_DB_USER", "admin")
TEST_DB_PASSWORD = os.getenv("APP_DB_PASSWORD", "admin")
TEST_DB_HOST = os.getenv("APP_DB_HOST", "localhost")
TEST_DB_PORT = os.getenv("APP_DB_PORT", "5432")
PROJECT_ROOT = Path(__file__).resolve().parent.parent


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


@pytest_asyncio.fixture(scope="session")
async def test_db_engine(worker_id: str) -> AsyncGenerator[AsyncEngine, None]:
    """Create a test database engine with the migrated schema.

    Auto-starts a PostgreSQL container via testcontainers (requires Docker or Podman).
    Each xdist worker gets its own container for full isolation.

    Args:
        worker_id: pytest-xdist worker ID

    Yields:
        Async engine for test database

    """
    logger.debug("Starting PostgreSQL container for worker '%s'", worker_id)
    postgres_image = os.getenv("POSTGRES_IMAGE", "quay.io/sclorg/postgresql-15-c9s")
    pg_container = PostgresContainer(postgres_image)
    # sclorg images require POSTGRESQL_* env vars instead of POSTGRES_*
    if "sclorg" in postgres_image:
        pg_container.with_env("POSTGRESQL_USER", pg_container.username)
        pg_container.with_env("POSTGRESQL_PASSWORD", pg_container.password)
        pg_container.with_env("POSTGRESQL_DATABASE", pg_container.dbname)
    with pg_container as pg:
        test_database_url = pg.get_connection_url(driver="asyncpg")
        engine = create_async_engine(test_database_url, echo=False, poolclass=NullPool)

        # APP_ADMIN_PASSWORD_PATH is required for bootstrap admin seeding
        # during migrations AND when test fixtures call seed_authz_data.
        # Keep the temp file and env var alive for the entire test session.
        with tempfile.NamedTemporaryFile(mode="w", suffix="-admin-pw", delete=False) as pw_file:
            pw_file.write("test-admin-password")
            pw_path = pw_file.name
        os.environ["APP_ADMIN_PASSWORD_PATH"] = pw_path
        get_settings.cache_clear()
        try:
            await _upgrade_database_schema(test_database_url)

            logger.debug("Test database ready (container) for worker '%s'", worker_id)
            yield engine
            await engine.dispose()
        finally:
            os.environ.pop("APP_ADMIN_PASSWORD_PATH", None)
            Path(pw_path).unlink(missing_ok=True)


@pytest.fixture(scope="session")
def test_cache(worker_id: str) -> Generator[None, None, None]:
    """Set up Redis cache for tests.

    Auto-starts a Redis container via testcontainers (requires Docker or Podman).
    Patches cache_host, cache_port, and cache_password on the shared Settings
    instance so that StreamClient and any direct redis.Redis() callers both
    use the container automatically.

    Args:
        worker_id: pytest-xdist worker ID

    Yields:
        None (fixture effect is applied via settings patch)

    """
    redis_image = os.getenv("REDIS_IMAGE", "quay.io/sclorg/redis-6-c9s")
    logger.debug("Starting Redis container for worker '%s'", worker_id)
    with RedisContainer(redis_image, password="cache") as redis_container:  # noqa: S106
        host = redis_container.get_container_host_ip()
        port = int(redis_container.get_exposed_port(redis_container.port))
        logger.debug("Test Redis ready (container) for worker '%s' at %s:%s", worker_id, host, port)
        os.environ["APP_CACHE_HOST"] = host
        os.environ["APP_CACHE_PORT"] = str(port)
        get_settings.cache_clear()
        try:
            yield
        finally:
            os.environ.pop("APP_CACHE_HOST", None)
            os.environ.pop("APP_CACHE_PORT", None)
            get_settings.cache_clear()


@pytest_asyncio.fixture
async def test_db_session(test_db_engine: AsyncEngine) -> AsyncGenerator[AsyncSession, None]:
    """Create a test database session with rollback-based isolation.

    Uses a connection-level transaction that is rolled back after each test,
    so every test starts with a clean database without paying the cost of
    TRUNCATE on every table.  Session.commit() calls are transparently
    converted to SAVEPOINTs so they succeed but never hit the real DB.

    Args:
        test_db_engine: Test database engine

    Yields:
        AsyncSession for tests

    """
    async with test_db_engine.connect() as conn:
        transaction = await conn.begin()
        session = AsyncSession(bind=conn, expire_on_commit=False, join_transaction_mode="create_savepoint")
        try:
            yield session
        finally:
            await session.close()
            await transaction.rollback()


@pytest_asyncio.fixture(scope="session")
async def test_session_factory(test_db_engine: AsyncEngine) -> async_sessionmaker[AsyncSession]:
    """Create an async session factory from the test database engine."""
    return async_sessionmaker(test_db_engine, class_=AsyncSession, expire_on_commit=False)


@pytest_asyncio.fixture(scope="session")
async def session_app(
    worker_id: str,
    test_db_engine: AsyncEngine,
    test_cache: None,
    test_session_factory: async_sessionmaker[AsyncSession],
) -> AsyncGenerator[FastAPI, None]:
    """Create a session-scoped app with routers discovered once per worker.

    This fixture performs router discovery once when the worker starts,
    eliminating the need to run discovery for every test. This prevents
    file lock contention and significantly improves test performance.

    The module-level ``AsyncSessionLocal`` and ``engine`` are patched to use
    the testcontainers database so that lifespan operations (settings seeder,
    runtime settings cache) use the test database instead of production.

    Args:
        worker_id: pytest-xdist worker ID
        test_db_engine: Test database engine from testcontainers
        test_cache: fixture that ensures the cache is ready
        test_session_factory: Test database session factory

    Yields:
        FastAPI application with routers registered

    """
    # Mock OPA client so the lifespan health check passes without a running OPA server.
    # Individual tests use their own OPA mocks (e.g. CLI-based evaluation).
    mock_opa_client = AsyncMock()
    mock_opa_client.health = AsyncMock(return_value=True)
    mock_opa_client.start = MagicMock()
    mock_opa_client.stop = AsyncMock()

    # Patch module-level DB objects so the lifespan
    # (set_runtime_settings, engine.dispose) uses the test database.
    with (
        patch("nexus.core.database.session.engine", test_db_engine),
        patch("nexus.core.database.session.AsyncSessionLocal", test_session_factory),
        patch("nexus.api.main.engine", test_db_engine),
        patch("nexus.api.main.AsyncSessionLocal", test_session_factory),
        patch("nexus.audit.outbox.worker.AsyncSessionLocal", test_session_factory),
        patch("nexus.api.main.OPAClient", return_value=mock_opa_client),
    ):
        # Seed all required data before app startup (normally done post-migration
        # via ``python -m nexus.seed``).
        from nexus.core.seed import run_seeders

        await run_seeders(test_session_factory)

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

    # Patch get_openrouter_llm in executor and CompressorService for planner integration
    # AND patch OrchestrationService._get_tools to avoid slow tool synchronization retry logic
    with (
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
    """Provide default user attributes.

    Note: username/email are made unique per-user in user_factory to prevent
    parallel test conflicts while preserving test expectations for username="testuser".
    """
    from nexus.auth.passwords import hash_password

    return {
        "username": "testuser",
        "email": "testuser@example.com",
        "first_name": "Test",
        "last_name": "User",
        "password_hash": hash_password("password123"),
    }


@pytest_asyncio.fixture
async def user_factory(
    test_db_session: AsyncSession, default_user_data: dict[str, Any]
) -> Callable[..., Awaitable["User"]]:
    """Factory fixture for creating a custom user."""

    async def _create_user(**overrides: object) -> "User":
        group_names: list[str] | None = overrides.pop("group_names", None)  # type: ignore[assignment]
        # Generate fresh UUID suffix per user to ensure uniqueness when creating multiple users in one test
        if "username" not in overrides and "email" not in overrides:
            unique_suffix = str(uuid4())[:8]
            user_data = {
                **default_user_data,
                "username": f"testuser-{unique_suffix}",
                "email": f"testuser-{unique_suffix}@example.com",
                **overrides,
            }
        else:
            user_data = {**default_user_data, **overrides}
        user = User(**user_data)
        test_db_session.add(user)
        await test_db_session.flush()

        if group_names:
            from sqlalchemy import insert

            from nexus.core.models.group import Group, user_groups

            for name in group_names:
                group = (await test_db_session.exec(select(Group).where(Group.name == name))).one()
                await test_db_session.exec(insert(user_groups).values(user_id=user.id, group_id=group.id))

        await test_db_session.commit()
        return user

    return _create_user


@pytest_asyncio.fixture
async def test_user(user_factory: Callable[..., Awaitable["User"]]) -> "User":
    """Create test user with default attributes.

    Explicitly sets username='testuser' to maintain backward compatibility
    with tests that expect this exact username (e.g., integration tests).
    """
    return await user_factory(username="testuser", email="testuser@example.com")


@pytest_asyncio.fixture
async def system_user(test_db_session: AsyncSession, user_factory: Callable[..., Awaitable["User"]]) -> "User":
    """Get or create system user with default attributes."""
    settings = get_settings()

    async with test_db_session:
        system_user = await test_db_session.get(User, settings.system_user_id)
        if system_user is None:
            system_user = await user_factory(
                username="system",
                email="system@example.com",
                id=settings.system_user_id,
            )
    return system_user


@pytest_asyncio.fixture
async def non_local_user(test_db_session: AsyncSession) -> "User":
    """Create a non-local (federated) user without a password hash."""
    from nexus.core.models.user import AuthType

    user = User(
        id=uuid4(),
        username="federateduser",
        email="federated@example.com",
        first_name="Federated",
        last_name="User",
        auth_type=AuthType.FEDERATED,
    )
    test_db_session.add(user)
    await test_db_session.commit()
    return user


@pytest_asyncio.fixture
async def test_workflow_definition() -> dict[str, Any]:
    """Create a test V2 workflow definition."""
    return {
        "schema_version": "2.0.0",
        "name": "test-workflow",
        "description": "Test workflow",
        "triggers": [
            {
                "id": "trigger_manual",
                "type": "manual_trigger",
            }
        ],
        "nodes": [
            {
                "id": "test_activity",
                "name": "test_activity",
                "type": "script",
                "parameters": {
                    "language": "bash",
                    "code": "echo 'test'",
                },
            }
        ],
        "edges": [
            {"from": "trigger_manual", "to": "test_activity"},
        ],
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
        published_version=1,
        current_version=1,
    )
    test_db_session.add(workflow)

    version = WorkflowVersion(
        workflow_id=workflow.id,
        version=1,
        schema_version="2.0.0",
        workflow_definition=test_workflow_definition,
        created_by=test_user.id,
        status=WorkflowVersionStatus.PUBLISHED,
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
        "type": "script",
        "parameters": {"language": "python", "code": "print('test')"},
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
    session_app: FastAPI,
    test_db_session: AsyncSession,
    test_db_engine: AsyncEngine,
) -> Generator[TestClient, None, None]:
    """Create a synchronous test client with DB and streaming overrides.

    Ensures WebSocket handlers (which bypass FastAPI dependencies) use the same
    test database as HTTP requests by overriding both get_db and the execution
    streaming service to point at the per-test database engine.

    The session-scoped ``session_app`` fixture owns application lifespan.  This
    client must not enter its context manager, which would re-run startup and
    shutdown against the shared application for every WebSocket test.

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

    # Mock OPA client so the lifespan health check passes without a running OPA server.
    mock_opa_client = AsyncMock()
    mock_opa_client.health = AsyncMock(return_value=True)
    mock_opa_client.start = MagicMock()
    mock_opa_client.stop = AsyncMock()

    try:
        with (
            patch("nexus.core.database.session.engine", test_db_engine),
            patch("nexus.core.database.session.AsyncSessionLocal", session_factory),
            patch("nexus.api.main.engine", test_db_engine),
            patch("nexus.api.main.AsyncSessionLocal", session_factory),
            patch("nexus.audit.outbox.worker.AsyncSessionLocal", session_factory),
            patch("nexus.api.main.OPAClient", return_value=mock_opa_client),
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

    This worker is configured with the NexusWorkflow and the unified script
    activity executor.

    Args:
        temporal_env: The Temporal test environment fixture

    Yields:
        Worker: Configured Temporal worker

    """
    import nexus.settings.cache.settings_cache as _settings_mod

    task_queue = "test-workflow-queue"

    logger.info("Starting test worker on queue: %s", task_queue)

    # Activities like execute_script_activity call get_runtime_settings()
    # which requires a real SettingsCache singleton. Always install FakeSettingsCache
    # here so a leaked mock from another test in the same xdist worker cannot
    # interfere (the guard `if original is None` was insufficient).
    original = _settings_mod._runtime_settings
    _settings_mod._runtime_settings = FakeSettingsCache()  # type: ignore[assignment]

    try:
        async with Worker(
            temporal_env.client,
            task_queue=task_queue,
            workflows=[NexusWorkflow],
            activities=[execute_script_activity, manual_trigger, condition, converge, fetch_workflow_runtime_settings],
        ) as worker:
            logger.info("Test worker started on queue: %s", task_queue)
            yield worker

        logger.info("Test worker stopped")
    finally:
        _settings_mod._runtime_settings = original


@pytest.fixture
def task_queue() -> str:
    """Provide the task queue name for tests.

    Returns:
        str: Task queue name

    """
    return "test-workflow-queue"


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


@pytest_asyncio.fixture
async def test_tool_service(test_db_session: AsyncSession, test_user: User) -> "ToolService":
    """Create a ToolService for testing.

    Args:
        test_db_session: Test database session
        test_user: Test User

    Returns:
        ToolService: Service instance

    """
    return ToolService(test_db_session, test_user)


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
async def workflow_factory(test_db_session: AsyncSession, test_user: User) -> WorkflowFactory:
    """Factory for creating workflows with versions for telemetry tests."""
    return WorkflowFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def execution_factory(test_db_session: AsyncSession, test_user: User) -> ExecutionFactory:
    """Factory for creating executions for telemetry tests."""
    return ExecutionFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def credential_factory(test_db_session: AsyncSession, test_user: User) -> CredentialFactory:
    """Factory for creating credentials and credential types for telemetry tests."""
    return CredentialFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def token_usage_factory(test_db_session: AsyncSession, test_user: User) -> TokenUsageFactory:
    """Factory for creating invocations with linked token usage records."""
    return TokenUsageFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def tool_provider_factory(test_db_session: AsyncSession, test_user: User) -> ToolProviderFactory:
    """Factory for creating tool providers for tests."""
    return ToolProviderFactory(test_db_session, test_user)


@pytest_asyncio.fixture
async def identity_provider_factory(test_db_session: AsyncSession, test_user: User) -> IdentityProviderFactory:
    """Factory for creating identity providers for tests."""
    return IdentityProviderFactory(test_db_session, test_user)


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


# ============================================================================
# JWT Authentication Fixtures
# ============================================================================


@pytest.fixture
def token_service() -> TokenService:
    """Create a TokenService instance for generating test tokens.

    Returns:
        TokenService: Service for creating and validating JWT tokens

    """
    return TokenService()


@pytest_asyncio.fixture
async def jwt_access_token(test_user: User, token_service: TokenService) -> str:
    """Generate a valid JWT access token for the test user.

    This fixture creates a real JWT token signed with the server's key,
    suitable for testing authenticated endpoints without dependency overrides.

    Args:
        test_user: Test user to create token for
        token_service: JWT token service

    Returns:
        str: Encoded JWT access token

    """
    return token_service.create_access_token(
        user_id=test_user.id,
        username=test_user.username,
        email=test_user.email or "",
    )


@pytest_asyncio.fixture
async def jwt_auth_headers(jwt_access_token: str) -> dict[str, str]:
    """Create authorization headers with JWT Bearer token.

    Args:
        jwt_access_token: Valid JWT access token

    Returns:
        dict: Headers dictionary with Authorization header

    """
    return {"Authorization": f"Bearer {jwt_access_token}"}


@pytest_asyncio.fixture
async def jwt_client(
    test_db_session: AsyncSession,
    session_app: FastAPI,
    test_user: User,
    token_service: TokenService,
) -> AsyncGenerator[AsyncClient, None]:
    """Create a test client with real JWT authentication.

    This fixture creates an AsyncClient that includes a valid JWT token
    in all requests, testing the full authentication flow without
    dependency overrides.

    Unlike auth_client which overrides get_current_user, this fixture
    tests the actual JWT validation logic.

    Args:
        test_db_session: Test database session
        session_app: Session-scoped FastAPI app
        test_user: Test user for authentication
        token_service: JWT token service

    Yields:
        AsyncClient: HTTP client with JWT authentication

    """
    # Generate real JWT token for the test user
    access_token = token_service.create_access_token(
        user_id=test_user.id,
        username=test_user.username,
        email=test_user.email or "",
    )

    # Override database session for test isolation
    async def override_get_db() -> AsyncGenerator[AsyncSession, None]:
        yield test_db_session

    session_app.dependency_overrides[get_db] = override_get_db

    # Create client with Authorization header
    async with AsyncClient(
        transport=ASGITransport(app=session_app),
        base_url="http://test",
        headers={"Authorization": f"Bearer {access_token}"},
    ) as client:
        yield client

    session_app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def jwt_client_with_mocked_llm(
    jwt_client: AsyncClient,
    mock_openrouter_llm: MagicMock,
) -> AsyncClient:
    """Create a JWT-authenticated test client with mocked OpenRouter LLM.

    Use this fixture for tests that need real JWT authentication AND a mocked LLM.

    Args:
        jwt_client: JWT-authenticated test client
        mock_openrouter_llm: Mock for OpenRouter LLM

    Returns:
        AsyncClient: JWT-authenticated client with mocked LLM

    """
    return jwt_client


@pytest.fixture
def create_jwt_for_user(token_service: TokenService) -> Callable[[User], str]:
    """Factory fixture to create JWT tokens for any user.

    Returns a function that generates JWT tokens, useful for testing
    different user roles or multiple users in the same test.

    Args:
        token_service: JWT token service

    Returns:
        Callable: Function that takes a User and returns a JWT token

    Usage:
        def test_multiple_users(create_jwt_for_user, admin_user, regular_user):
            admin_token = create_jwt_for_user(admin_user)
            user_token = create_jwt_for_user(regular_user)

    """

    def _create_token(user: User) -> str:
        return token_service.create_access_token(
            user_id=user.id,
            username=user.username,
            email=user.email or "",
        )

    return _create_token


@pytest_asyncio.fixture
async def jwt_client_with_provider_factory(
    jwt_client: AsyncClient,
    test_provider_factory: ProviderFactory,
) -> AsyncClient:
    """Create a JWT-authenticated test client with provider factory.

    Use this fixture for tests that need real JWT authentication
    AND MockMCPProvider registered.

    Args:
        jwt_client: JWT-authenticated test client
        test_provider_factory: Provider factory with MockMCPProvider

    Returns:
        AsyncClient: JWT-authenticated client with provider factory

    """

    async def override_get_provider_factory() -> ProviderFactory:
        return test_provider_factory

    app.dependency_overrides[get_provider_factory] = override_get_provider_factory

    return jwt_client


# ============================================================================
# User Management Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def admin_user(test_db_session: AsyncSession, user_factory: Callable[..., Awaitable["User"]]) -> "User":
    """Get or create admin user with username 'admin'.

    This is the built-in admin user that has special self-disable restrictions.

    Args:
        test_db_session: Test database session
        user_factory: Factory for creating users

    Returns:
        User: Admin user instance

    """
    async with test_db_session:
        query = select(User).filter(
            User.username == "admin"  # type: ignore[arg-type]
        )
        result = await test_db_session.exec(query)
        admin_user = result.one_or_none()
        if admin_user is None:
            admin_user = await user_factory(
                username="admin",
                first_name="Admin",
                last_name="User",
            )
        return admin_user


@pytest_asyncio.fixture
async def auth_client_as_admin(base_client: AsyncClient, admin_user: "User") -> AsyncClient:
    """Create an authenticated test client with admin user.

    Args:
        base_client: Base test client without authentication
        admin_user: Admin user for authentication

    Returns:
        AsyncClient: Authenticated test client as admin

    """

    async def override_get_current_user() -> User:
        return admin_user

    app.dependency_overrides[get_current_user] = override_get_current_user

    return base_client


@pytest_asyncio.fixture
async def multiple_local_users(test_db_session: AsyncSession, test_user: User) -> list[User]:
    """Create multiple test users for pagination, filtering, and sorting tests.

    Args:
        test_db_session: Test database session
        test_user: Existing test user (dependency ensures it exists)

    Returns:
        list[User]: List of additional user instances (excludes the base test_user)

    """
    from nexus.auth.passwords import hash_password

    users = [
        User(
            id=uuid4(),
            username="alice",
            email="alice@example.com",
            first_name="Alice",
            last_name="Anderson",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="bob",
            email="bob@example.com",
            first_name="Bob",
            last_name="Brown",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="charlie",
            email="charlie@example.com",
            first_name="Charlie",
            last_name="Clark",
            password_hash=hash_password("password123"),
            is_enabled=False,
        ),
        User(
            id=uuid4(),
            username="diana",
            email="diana@example.com",
            first_name="Diana",
            last_name="Davis",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="edward",
            email="edward@example.com",
            first_name="Edward",
            last_name="Evans",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
        User(
            id=uuid4(),
            username="fiona",
            email="fiona@example.com",
            first_name="Fiona",
            last_name="Foster",
            password_hash=hash_password("password123"),
            is_enabled=True,
        ),
    ]

    for user in users:
        test_db_session.add(user)

    await test_db_session.commit()

    for user in users:
        await test_db_session.refresh(user)

    return users


# ============================================================================
# Group Fixtures
# ============================================================================


@pytest_asyncio.fixture
async def test_group(test_db_session: AsyncSession, test_user: User) -> Group:
    """Create a single test group.

    Args:
        test_db_session: Test database session
        test_user: Test user who creates the group

    Returns:
        Group: Test group instance

    """
    group = Group(
        id=uuid4(),
        name="test-group",
        description="A test group",
        created_by=test_user.id,
    )
    test_db_session.add(group)
    await test_db_session.commit()
    await test_db_session.refresh(group)
    return group


@pytest_asyncio.fixture
async def group_with_members(
    test_db_session: AsyncSession, test_user: User, test_group: Group, multiple_local_users: list[User]
) -> tuple[Group, list[User]]:
    """Create a group with members for membership tests.

    Adds the first 3 users from multiple_local_users to test_group.

    Args:
        test_db_session: Test database session
        test_user: Test user (dependency)
        test_group: Test group to add members to
        multiple_local_users: List of test users

    Returns:
        Tuple of (group, list of member users)

    """
    from sqlalchemy import insert

    from nexus.core.models.group import user_groups

    members = multiple_local_users[:3]
    for user in members:
        await test_db_session.exec(insert(user_groups).values(user_id=user.id, group_id=test_group.id))
    await test_db_session.commit()

    return test_group, members


@pytest_asyncio.fixture
async def multiple_test_groups(test_db_session: AsyncSession, test_user: User) -> list[Group]:
    """Create multiple test groups for pagination, filtering, and sorting tests.

    Args:
        test_db_session: Test database session
        test_user: Test user who creates the groups

    Returns:
        list[Group]: List of test group instances

    """
    groups = [
        Group(id=uuid4(), name="Alpha Group", description="First group", created_by=test_user.id),
        Group(id=uuid4(), name="Beta Group", description="Second group", created_by=test_user.id),
        Group(id=uuid4(), name="Gamma Group", description="Third group", created_by=test_user.id),
        Group(id=uuid4(), name="Delta Group", description="Fourth group", created_by=test_user.id),
        Group(id=uuid4(), name="Echo Group", description="Fifth group", created_by=test_user.id),
        Group(id=uuid4(), name="Foxtrot Group", description="Sixth group", created_by=test_user.id),
    ]

    for group in groups:
        test_db_session.add(group)

    await test_db_session.commit()

    for group in groups:
        await test_db_session.refresh(group)

    return groups
