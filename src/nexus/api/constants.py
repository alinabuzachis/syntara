"""Application-wide constants.

This module contains true constants that don't change based on environment.
For configurable values, use get_settings() from nexus.core.config.base.
"""

# API configuration

API_V1_PATH_PREFIX = "/api/v1"

# Paths excluded from middleware instrumentation (analytics, metrics).
# Health checks, documentation, and root informational endpoints are not
# business API endpoints and would generate noise in observability data.
EXCLUDED_PATHS: frozenset[str] = frozenset(
    {
        "/health",
        "/",
        "/docs",
        "/redoc",
        "/openapi.json",
    }
)
