"""Main FastAPI application module for Nexus."""

import json
import ssl
import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.exc import IntegrityError
from sqlmodel import text
from temporalio.service import RPCError

import nexus.auth.exceptions  # Side-effect import to trigger exception handler registration
import nexus.identity_providers.exceptions
from nexus.api.constants import API_V1_PATH_PREFIX
from nexus.audit.lifecycle import start_audit_subsystems, stop_audit_subsystems
from nexus.audit.middleware import AuditMiddleware
from nexus.audit.registration import discover_and_register_all_handlers
from nexus.auth.cert_middleware import ClientCertAuthMiddleware
from nexus.auth.middleware import StaleTokenMiddleware
from nexus.auth.session.cleanup import get_session_cleanup_worker
from nexus.authz.exceptions import (  # noqa: F401
    BuiltinProtectionError,
    PolicyNameConflictError,
    PolicyNotFoundError,
    RoleNameConflictError,
    RoleNotFoundError,
)
from nexus.authz.opa_client import OPAClient
from nexus.core.config.base import get_settings, validate_encryption_key_at_startup
from nexus.core.database.session import AsyncSessionLocal, engine, get_db
from nexus.core.error_handlers import (
    generic_exception_handler,
    integrity_error_handler,
    problem_details_response_map,
    validation_error_handler,
    value_error_handler,
)
from nexus.core.error_handlers import (
    http_exception_handler as core_http_exception_handler,
)
from nexus.core.exception_registry import register_exceptions
from nexus.core.logging.logging import apply_runtime_log_level, build_uvicorn_logging_config
from nexus.core.router_discovery import _get_lock_file_path, discover_and_register_routers
from nexus.core.websocket.manager import get_connection_lifecycle_manager
from nexus.core.websocket.router import build_websocket_router
from nexus.files.health import check_file_storage_health, validate_file_storage_at_startup
from nexus.files.workers.file_cleanup import get_multipart_cleanup_worker
from nexus.metrics.cleanup import get_metrics_cleanup_worker
from nexus.metrics.completion_poller import get_completion_poller
from nexus.metrics.dependencies import get_metrics_recorder
from nexus.metrics.internal_api import (
    metrics_store_component_kpis,
    metrics_store_kpis,
    metrics_store_records,
    metrics_store_reset,
    metrics_store_summary,
)
from nexus.metrics.middleware import MetricsMiddleware
from nexus.metrics.openmetrics import openmetrics_endpoint
from nexus.metrics.queue_depth_poller import get_queue_depth_poller
from nexus.settings.cache.settings_cache import SettingsCache, set_runtime_settings
from nexus.settings.store import check_catalog_completeness
from nexus.telemetry.client import flush_telemetry, get_telemetry_registry, initialize_telemetry
from nexus.telemetry.periodic_collector import PeriodicCollector
from nexus.workflows.error_handlers import (
    temporal_rpc_error_handler,
)

logger = structlog.stdlib.get_logger(__name__)


async def _check_settings_catalog(session_factory: Any = None) -> None:  # noqa: ANN401
    """Verify every catalog setting has been seeded into the database."""
    factory = session_factory or AsyncSessionLocal
    async with factory() as session:
        missing_keys = await check_catalog_completeness(session)
    if missing_keys:
        sorted_keys = ", ".join(sorted(missing_keys))
        logger.error(
            "Runtime settings catalog is out of date",
            missing_count=len(missing_keys),
            missing_keys=sorted_keys,
        )
        msg = (
            f"Cannot start: runtime settings have not been seeded. "
            f"{len(missing_keys)} setting(s) missing from the database.\n"
            f"Missing keys: {sorted_keys}"
        )
        raise RuntimeError(msg)


async def _lifespan_startup(app: FastAPI) -> dict[str, Any]:
    """Initialize application resources during startup.

    Returns a dict of resources needed for shutdown.
    """
    validate_encryption_key_at_startup()

    # Initialize logging and audit subsystems
    start_audit_subsystems()

    # Register audit/telemetry handlers so domain events are captured
    discover_and_register_all_handlers()

    # Initialise Settings
    settings = get_settings()
    await _check_settings_catalog()

    # Initialize the process-wide settings cache
    runtime_settings = SettingsCache(session_factory=AsyncSessionLocal)
    set_runtime_settings(runtime_settings)

    # Install database metrics event listeners on the main engine.
    from nexus.metrics.database import install_database_metrics  # noqa: PLC0415

    install_database_metrics(engine)

    # Apply runtime log level (overrides the startup static config if a
    # runtime override has been set by an operator).
    await apply_runtime_log_level()

    # Import telemetry watcher so @watch_setting("telemetry.segment_write_key")
    # is registered before start_watching() applies pending watchers.
    import nexus.telemetry.client  # noqa: F401, PLC0415

    # Watch for runtime log level changes and start polling
    runtime_settings.start_watching()

    # Discover and register all routers automatically
    if settings.router_discovery_enabled:
        discover_and_register_routers(
            app=app,
            prefix=API_V1_PATH_PREFIX,
            enable_validation=settings.openapi_validation_enabled,
        )
    else:
        logger.warning("Router discovery disabled - no routers will be automatically registered")

    # Register WebSocket router manually (excluded from router discovery)
    # WebSocket routers use AsyncAPI specification instead of OpenAPI,
    # so they're excluded from the OpenAPI-based validation system and
    # registered manually here instead of through router discovery
    ws_router = build_websocket_router()
    app.include_router(ws_router)

    # Build the resource_actions registry by introspecting all registered
    # routes and merging with BUILTIN_POLICIES.  Must run after all routers
    # (including WebSocket) are registered.
    from nexus.authz.resource_actions import build_resource_actions  # noqa: PLC0415

    app.state.resource_actions = build_resource_actions(app)

    # Initialize OPA client for authorization
    opa_client = OPAClient(base_url=settings.opa_url)
    opa_client.start()
    if await opa_client.health():
        logger.info("OPA client connected", opa_url=settings.opa_url)
    else:
        logger.error("OPA server not reachable — cannot start without OPA", opa_url=settings.opa_url)
        msg = f"OPA server not reachable at {settings.opa_url}"
        raise RuntimeError(msg)
    app.state.opa_client = opa_client

    await validate_file_storage_at_startup(settings)

    from nexus.authz.engine import init_opa_cache  # noqa: PLC0415

    init_opa_cache(
        enabled=settings.opa_cache_enabled,
        ttl_seconds=settings.opa_cache_ttl_seconds,
        maxsize=settings.opa_cache_maxsize,
    )

    # Initialize telemetry (reads installation ID from database)
    await initialize_telemetry()

    # Start WebSocket connection health monitoring
    lifecycle_manager = get_connection_lifecycle_manager()
    lifecycle_manager.start_monitoring()
    logger.info("WebSocket connection health monitoring started")

    # Initialize periodic analytics collector
    periodic_collector = PeriodicCollector(
        registry=get_telemetry_registry(),
        settings_cache=runtime_settings,
    )

    completion_poller = get_completion_poller()
    completion_poller.start()

    metrics_cleanup_worker = get_metrics_cleanup_worker()
    metrics_cleanup_worker.start()

    queue_depth_poller = get_queue_depth_poller()
    queue_depth_poller.start()

    session_cleanup_worker = get_session_cleanup_worker()
    session_cleanup_worker.start()

    multipart_cleanup_worker = get_multipart_cleanup_worker()
    multipart_cleanup_worker.start()

    periodic_collector.start()
    logger.info("Periodic analytics collector started")

    return {
        "opa_client": opa_client,
        "lifecycle_manager": lifecycle_manager,
        "periodic_collector": periodic_collector,
        "completion_poller": completion_poller,
        "metrics_cleanup_worker": metrics_cleanup_worker,
        "queue_depth_poller": queue_depth_poller,
        "session_cleanup_worker": session_cleanup_worker,
        "multipart_cleanup_worker": multipart_cleanup_worker,
        "runtime_settings": runtime_settings,
    }


async def _lifespan_shutdown(resources: dict[str, Any]) -> None:
    """Clean up application resources during shutdown."""
    await resources["multipart_cleanup_worker"].stop()
    await resources["queue_depth_poller"].stop()
    await resources["session_cleanup_worker"].stop()
    await resources["metrics_cleanup_worker"].stop()
    await resources["completion_poller"].stop()

    await resources["periodic_collector"].stop()
    logger.info("Periodic analytics collector stopped")

    flush_telemetry()

    resources["lifecycle_manager"].stop_monitoring()
    logger.info("WebSocket connection health monitoring stopped")

    # Stop settings watcher (also disconnects Redis) before disposing DB connections
    await resources["runtime_settings"].stop_watching()

    await resources["opa_client"].stop()

    await engine.dispose()
    logger.info("Database engine disposed")

    lock_file = _get_lock_file_path()
    try:
        lock_file.unlink(missing_ok=True)
        logger.debug("Cleaned up lock file", lock_file=lock_file)
    except OSError as e:
        logger.warning("Failed to clean up lock file", lock_file=lock_file, error=str(e))

    # Flush and stop audit and logging subsystems (last to capture all events)
    await stop_audit_subsystems()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, Any]:
    """Manage FastAPI application lifespan events.

    Handles initialization and cleanup of application-scoped resources
    like the provider factory.

    Database connections are managed by SQLAlchemy via the get_db() dependency.
    Migrations should be run via Alembic before starting the application:
        uv run alembic upgrade head

    Args:
        app: FastAPI application instance

    Yields:
        None

    """
    resources = await _lifespan_startup(app)
    try:
        yield
    finally:
        await _lifespan_shutdown(resources)


# Create FastAPI application
app = FastAPI(
    title="Nexus API",
    description="A distributed multi-agent workflow orchestration system",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    responses=problem_details_response_map(),
)

# Configure CORS middleware using centralized settings
_cors_settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_settings.cors_allow_origins,
    allow_credentials=_cors_settings.cors_allow_credentials,
    allow_methods=_cors_settings.cors_allow_methods,
    allow_headers=_cors_settings.cors_allow_headers,
)

# Register stale token rejection middleware.
app.add_middleware(StaleTokenMiddleware)

# Register metrics middleware.
app.add_middleware(MetricsMiddleware, recorder=get_metrics_recorder())

# Register audit middleware.
app.add_middleware(AuditMiddleware, fastapi_app=app)

# Register mTLS client certificate authentication middleware (outermost).
# Must be outermost to access the raw uvicorn transport for cert extraction.
app.add_middleware(ClientCertAuthMiddleware)

# RFC 9457 compliant error handlers
# Import exception modules so @fastapi_exception decorators populate the registry
import nexus.aap.exceptions  # noqa: E402
import nexus.core.storage_exceptions  # noqa: E402
import nexus.credentials.exceptions  # noqa: E402
import nexus.integrations.exceptions  # noqa: E402
import nexus.service_accounts.exceptions  # noqa: E402, F401

# Register decorated exceptions automatically
register_exceptions(app)

# Non-decorated exceptions that still need manual registration
app.add_exception_handler(RPCError, temporal_rpc_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(PydanticValidationError, validation_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, validation_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(IntegrityError, integrity_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(ValueError, value_error_handler)  # type: ignore[arg-type]
app.add_exception_handler(HTTPException, core_http_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(Exception, generic_exception_handler)

# Routers are automatically discovered and registered via router_discovery system
# See lifespan function above for router registration logic


@app.get("/health", tags=["Health"])
async def health_check(request: Request) -> dict[str, Any]:  # noqa: ARG001
    """Health check endpoint with database connectivity test.

    Returns:
        dict: Health status with database status

    Responses:
        200: Service is healthy and database is connected
        503: Service is unavailable (database connection failed)

    Example:
        ```bash
        curl http://localhost:8000/health
        ```

        Response:
        ```json
        {
            "status": "healthy",
            "timestamp": "2025-10-09T12:00:00Z",
            "checks": {
                "database": "ok"
            }
        }
        ```

    """
    timestamp = datetime.now(UTC).isoformat()

    # Check database connectivity
    db_status = "unknown"
    try:
        async for session in get_db():
            result = await session.exec(text("SELECT 1"))  # type: ignore[call-overload]
            result.scalar()
            db_status = "ok"
            break
    except Exception as e:
        logger.debug("Health check failed: database connectivity error", error=str(e), exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "timestamp": timestamp,
                "checks": {"database": "error"},
            },
        ) from e

    file_storage_status = await check_file_storage_health()

    return {
        "status": "healthy",
        "timestamp": timestamp,
        "checks": {
            "database": db_status,
            "file_storage": file_storage_status,
        },
    }


app.get("/metrics", tags=["Observability"])(openmetrics_endpoint)


@app.get("/", tags=["Root"])
async def root() -> dict[str, str]:
    """Root endpoint.

    Returns:
        dict: Welcome message with API information

    """
    return {
        "message": "Nexus API",
        "version": "0.1.0",
        "docs": "/docs",
    }


# ---------------------------------------------------------------------------
# Internal metrics-store endpoints (perf-testing only)
# ---------------------------------------------------------------------------
# Routes are always registered but hidden from OpenAPI.
# Access is gated at runtime by the ``metrics.perf_test_mode`` runtime setting.
_INTERNAL_METRICS_PREFIX = "/_internal/metrics"
app.get(f"{_INTERNAL_METRICS_PREFIX}/summary", include_in_schema=False)(metrics_store_summary)
app.get(f"{_INTERNAL_METRICS_PREFIX}/records", include_in_schema=False)(metrics_store_records)
app.get(f"{_INTERNAL_METRICS_PREFIX}/kpis", include_in_schema=False)(metrics_store_kpis)
app.get(f"{_INTERNAL_METRICS_PREFIX}/kpis/{{component}}", include_in_schema=False)(
    metrics_store_component_kpis,
)
app.post(f"{_INTERNAL_METRICS_PREFIX}/reset", include_in_schema=False)(metrics_store_reset)


def _ssl_context_factory(
    config: uvicorn.Config,  # noqa: ARG001
    default_ssl_context_factory: Any,  # noqa: ANN401 - Callable[[], ssl.SSLContext]
) -> ssl.SSLContext:
    """Build SSL context with TLS 1.3 minimum for Uvicorn server.

    Called by Uvicorn when S2S TLS is enabled. Wraps the default context
    factory to inject minimum_version.
    """
    ctx: ssl.SSLContext = default_ssl_context_factory()
    ctx.minimum_version = ssl.TLSVersion.TLSv1_3
    return ctx


def main() -> None:
    """Entry point for running the application with uvicorn.

    This function is called when the module is run directly.
    For development, you can also use:
        uvicorn nexus.api.main:app --reload
    """
    # Initially configure using the 'fallback_log_level' from static settings.
    # This is necessary so that we can send log messages before the database
    # is available. Once the app starts and database-backed runtime settings are
    # available, the logger will be reconfigured to use the runtime logging.log_level setting.
    settings = get_settings()
    fallback_log_level = settings.fallback_log_level
    uvicorn_kwargs: dict[str, Any] = {
        "app": "nexus.api.main:app",
        "host": settings.server_host,
        "port": settings.server_port,
        "reload": settings.server_reload,
        "log_config": build_uvicorn_logging_config(fallback_log_level),
        "log_level": fallback_log_level.lower(),
    }

    if settings.s2s_tls_enabled:
        uvicorn_kwargs["ssl_certfile"] = settings.s2s_tls_cert_path
        uvicorn_kwargs["ssl_keyfile"] = settings.s2s_tls_key_path
        uvicorn_kwargs["ssl_ca_certs"] = settings.s2s_tls_ca_cert_path
        # CERT_OPTIONAL: kubelet health probes don't present client certs.
        # Client cert enforcement on non-health routes is handled by auth middleware.
        uvicorn_kwargs["ssl_cert_reqs"] = ssl.CERT_OPTIONAL
        uvicorn_kwargs["ssl_context_factory"] = _ssl_context_factory
        uvicorn_kwargs["http"] = "nexus.core.tls.protocol:TLSAutoProtocol"

    uvicorn.run(**uvicorn_kwargs)


# Export OpenAPI spec for documentation generation
def export_openapi() -> None:
    """Export OpenAPI specification to JSON file.

    This function is used to generate the OpenAPI spec for documentation.
    Run with: python -m nexus.api.main --export-openapi
    """
    spec = app.openapi()
    docs_dir = Path("docs")
    docs_dir.mkdir(exist_ok=True)

    openapi_path = docs_dir / "openapi.json"
    with openapi_path.open("w") as f:
        json.dump(spec, f, indent=2)

    print(f"OpenAPI specification exported to {openapi_path}")  # noqa: T201


if __name__ == "__main__":
    # Check for --export-openapi flag
    if "--export-openapi" in sys.argv:
        export_openapi()
    else:
        main()
