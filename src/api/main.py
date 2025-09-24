"""FastAPI Hello World application."""

from datetime import datetime
from typing import Dict, Any

from fastapi import FastAPI
from fastapi.responses import JSONResponse

# Create FastAPI app instance
app = FastAPI(
    title="Nexus-NG API",
    description="A simple FastAPI Hello World application",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)


@app.get("/")
async def root() -> Dict[str, Any]:
    """Root endpoint returning a hello world message."""
    return {
        "message": "Hello, World!",
        "timestamp": datetime.now().isoformat(),
        "version": "0.1.0",
        "status": "running"
    }


@app.get("/health")
async def health_check() -> JSONResponse:
    """Health check endpoint."""
    return JSONResponse(
        status_code=200,
        content={
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "service": "nexus-ng-api"
        }
    )


@app.get("/info")
async def app_info() -> Dict[str, Any]:
    """Application information endpoint."""
    return {
        "name": "Nexus-NG API",
        "description": "A multi-module Python project with FastAPI",
        "version": "0.1.0",
        "modules": ["api", "utils"],
        "endpoints": [
            {"path": "/", "method": "GET", "description": "Root hello world endpoint"},
            {"path": "/health", "method": "GET", "description": "Health check endpoint"},
            {"path": "/info", "method": "GET", "description": "Application information"},
            {"path": "/docs", "method": "GET", "description": "Interactive API documentation"},
            {"path": "/redoc", "method": "GET", "description": "ReDoc API documentation"},
        ]
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.api.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
