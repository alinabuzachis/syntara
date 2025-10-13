"""Main FastAPI application module for Nexus Workflow Engine."""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from nexus_api.api.v1 import workflow_versions, workflows
from nexus_api.db import get_db

# Create FastAPI application
app = FastAPI(
    title="Nexus Workflow Engine API",
    description="A distributed multi-agent workflow orchestration system",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# Configure CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers
app.include_router(workflows.router, prefix="/api/v1")
app.include_router(workflow_versions.router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
async def health_check() -> dict[str, Any]:
    """Health check endpoint.

    Returns:
        dict: Health status with database connectivity check

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
        async for db in get_db():
            # Execute a simple query to verify connection
            result = await db.execute(text("SELECT 1"))
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
        "checks": {"database": db_status},
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
        "message": "Nexus Workflow Engine API",
        "version": "0.1.0",
        "docs": "/docs",
    }


def main() -> None:
    """Entry point for running the application with uvicorn.

    This function is called when the module is run directly.
    For development, you can also use:
        uvicorn nexus_api.main:app --reload
    """
    uvicorn.run(
        "nexus_api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
    )


# Export OpenAPI spec for documentation generation
def export_openapi() -> None:
    """Export OpenAPI specification to JSON file.

    This function is used to generate the OpenAPI spec for documentation.
    Run with: python -m nexus_api.main --export-openapi
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
