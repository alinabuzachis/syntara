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
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlmodel import text

from nexus.api.constants import API_V1_PATH_PREFIX
from nexus.core.config.base import get_settings
from nexus.core.database.session import get_db
from nexus.core.logging.logging import configure_structlog
from nexus.core.router_discovery import _get_lock_file_path, discover_and_register_routers
from nexus.core.websocket.manager import get_connection_lifecycle_manager
from nexus.core.websocket.router import build_websocket_router

configure_structlog()
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

    # Start WebSocket connection health monitoring
    # This background task runs every 30 seconds to clean up stale connections
    # that haven't responded to ping frames within the timeout period (60s)
    lifecycle_manager = get_connection_lifecycle_manager()
    lifecycle_manager.start_monitoring()
    logger.info("WebSocket connection health monitoring started")

    try:
        yield
    finally:
        # Stop WebSocket connection monitoring
        lifecycle_manager.stop_monitoring()
        logger.info("WebSocket connection health monitoring stopped")

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
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "timestamp": timestamp,
                "checks": {"database": "error"},
                "error": str(e),
            },
        ) from e

    return {
        "status": "healthy",
        "timestamp": timestamp,
        "checks": {
            "database": db_status,
        },
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:  # noqa: ARG001
    """Handle HTTP exceptions consistently.

    Args:
        request: FastAPI request object
        exc: HTTP exception

    Returns:
        JSONResponse: Formatted error response

    """
    detail: Any = exc.detail
    content = detail if isinstance(detail, dict) else {"detail": detail}

    return JSONResponse(
        status_code=exc.status_code,
        content=content,
    )


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
