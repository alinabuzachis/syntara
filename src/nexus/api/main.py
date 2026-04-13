"""Main FastAPI application module for Nexus."""

import json
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
import nexus.identity_providers.exceptions  # noqa: F401 - Side-effect import to trigger exception handler registration
from nexus.api.constants import API_V1_PATH_PREFIX
from nexus.audit.middleware import AuditMiddleware
from nexus.core.config.base import get_settings
from nexus.core.database.session import AsyncSessionLocal, engine, get_db
from nexus.core.error_handlers import (
    generic_exception_handler,
    integrity_error_handler,
    validation_error_handler,
    value_error_handler,
)
from nexus.core.error_handlers import (
    http_exception_handler as core_http_exception_handler,
)
from nexus.core.exception_registry import register_exceptions
from nexus.core.router_discovery import _get_lock_file_path, discover_and_register_routers
from nexus.core.websocket.manager import get_connection_lifecycle_manager
from nexus.core.websocket.router import build_websocket_router
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
from nexus.settings.cache.settings_cache import SettingsCache, set_runtime_settings
from nexus.telemetry.client import flush_telemetry, get_telemetry_registry, initialize_telemetry
from nexus.telemetry.middleware import AnalyticsMiddleware
from nexus.telemetry.periodic_collector import PeriodicCollector
from nexus.workflows.error_handlers import (
    temporal_rpc_error_handler,
)

logger = structlog.stdlib.get_logger(__name__)


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
    # Initialise the process-wide settings cache (lazy, no background worker).
    # Settings catalog must be seeded first: uv run python tools/seed_settings.py
    set_runtime_settings(SettingsCache(session_factory=AsyncSessionLocal))

    # Discover and register all routers automatically
    # This replaces manual router imports and registration
    settings = get_settings()

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

    # Initialize telemetry (reads installation ID from database)
    await initialize_telemetry()

    # Start WebSocket connection health monitoring
    # This background task runs every 30 seconds to clean up stale connections
    # that haven't responded to ping frames within the timeout period (60s)
    lifecycle_manager = get_connection_lifecycle_manager()
    lifecycle_manager.start_monitoring()
    logger.info("WebSocket connection health monitoring started")

    # Initialize periodic analytics collector
    periodic_collector = PeriodicCollector(
        registry=get_telemetry_registry(),
    )

    completion_poller = get_completion_poller()
    completion_poller.start()

    metrics_cleanup_worker = get_metrics_cleanup_worker()
    metrics_cleanup_worker.start()

    try:
        periodic_collector.start()
        logger.info("Periodic analytics collector started")

        yield
    finally:
        await metrics_cleanup_worker.stop()

        await completion_poller.stop()

        # Stop periodic analytics collector
        await periodic_collector.stop()
        logger.info("Periodic analytics collector stopped")

        # Flush any remaining telemetry events (e.g. from middleware)
        flush_telemetry()

        # Stop WebSocket connection monitoring
        lifecycle_manager.stop_monitoring()
        logger.info("WebSocket connection health monitoring stopped")

        # Dispose SQLAlchemy engine/pool for clean shutdown during restarts/deployments
        await engine.dispose()
        logger.info("Database engine disposed")

        # Clean up lock file created by this server instance
        lock_file = _get_lock_file_path()
        try:
            lock_file.unlink(missing_ok=True)
            logger.debug("Cleaned up lock file", lock_file=lock_file)
        except OSError as e:
            logger.warning("Failed to clean up lock file", lock_file=lock_file, error=str(e))


# Create FastAPI application
app = FastAPI(
    title="Nexus API",
    description="A distributed multi-agent workflow orchestration system",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
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

# Register analytics middleware.
# Added after CORS so it wraps the entire request lifecycle.
# Telemetry is initialized asynchronously in the lifespan handler;
# the middleware uses the registry which will be populated by that point.
app.add_middleware(AnalyticsMiddleware, registry=get_telemetry_registry())

# Register metrics middleware (outermost = first to execute).
# Added after analytics so it captures full request duration including
# analytics overhead.  Records REQUEST_DURATION and ERROR metrics.
app.add_middleware(MetricsMiddleware, recorder=get_metrics_recorder())

# Register audit middleware.
# Added after metrics so it executes as the outermost HTTP middleware.
# Logs request completion (with status code) as audit events.
app.add_middleware(AuditMiddleware)

# RFC 9457 compliant error handlers
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
            result = await session.execute(text("SELECT 1"))
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

    return {
        "status": "healthy",
        "timestamp": timestamp,
        "checks": {
            "database": db_status,
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


def main() -> None:
    """Entry point for running the application with uvicorn.

    This function is called when the module is run directly.
    For development, you can also use:
        uvicorn nexus.api.main:app --reload
    """
    settings = get_settings()
    uvicorn.run(
        "nexus.api.main:app",
        host=settings.server_host,
        port=settings.server_port,
        reload=settings.server_reload,
        log_config=settings.uvicorn_logging_config,
        log_level=settings.log_level.lower(),
    )


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
