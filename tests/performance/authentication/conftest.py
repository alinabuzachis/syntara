"""Shared fixtures for Suite 21: Authentication Overhead performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Authentication Overhead KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled) and helpers
(compute_percentile, timed_http_request, run_concurrent_http_requests,
poll_for_metric_records) are defined in the parent
tests/performance/conftest.py and inherited automatically.  This file adds
authentication-specific constants, helpers, and fixtures.

Auth endpoints under test:
    - POST /api/v1/auth/login
    - POST /api/v1/auth/refresh
    - GET  /api/v1/auth/me
    - GET  /api/v1/workflows  (authenticated lightweight endpoint)
    - GET  /api/v1/auth/oidc/authorize  (if OIDC provider is configured)
    - GET  /api/v1/auth/oidc/callback   (if OIDC provider is configured)

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with:
    make test-performance
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import httpx
import pytest
import structlog

from tests.performance.conftest import timed_http_request

logger = structlog.get_logger(__name__)

# ---------------------------------------------------------------------------
# Targets from the Performance Test Plan
# ---------------------------------------------------------------------------

TARGET_JWT_OVERHEAD_MS = 5
TARGET_LOGIN_P95_MS = 500
TARGET_REFRESH_P95_MS = 200
TARGET_REJECTION_P95_MS = 50
TARGET_OIDC_E2E_LATENCY_S = 3
TARGET_AUTH_STABILITY_ERROR_RATE = 0.01

SUSTAINED_RPS = 100
SUSTAINED_DURATION_SECONDS = 30
CONCURRENT_LOGIN_COUNT = 50
CONCURRENT_REFRESH_COUNT = 50
INVALID_TOKEN_REQUEST_COUNT = 100
OIDC_CONCURRENT_COUNT = 20
STABILITY_DURATION_SECONDS = 120


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def get_admin_credentials() -> tuple[str, str]:
    """Return (username, password) for the admin user.

    Reads the admin password from the same path used by the root
    ``tests/conftest.py`` live-deployment fixtures.
    """
    password_path = Path(os.environ.get("APP_ADMIN_PASSWORD_PATH", ".secrets/admin-password"))
    if not password_path.exists():
        msg = f"Admin password file not found: {password_path}. Set NEXUS_API_TOKEN or run 'make secrets-generate'."
        raise RuntimeError(msg)
    password = password_path.read_text().strip()
    if not password:
        msg = f"Admin password file is empty: {password_path}"
        raise RuntimeError(msg)
    return "admin", password


def login_and_get_tokens(
    base_url: str,
    username: str,
    password: str,
    *,
    verify_ssl: bool = False,
) -> tuple[str, dict[str, str]]:
    """Login to the deployment and return (access_token, cookies_dict).

    The returned cookies contain the ``ao_refresh_token`` HttpOnly cookie
    set by the login endpoint.
    """
    response = httpx.post(
        f"{base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        verify=verify_ssl,
        timeout=30,
    )
    response.raise_for_status()
    access_token: str = response.json()["access_token"]
    cookies = dict(response.cookies)
    return access_token, cookies


def do_token_refresh(
    base_url: str,
    cookies: dict[str, str],
    *,
    verify_ssl: bool = False,
) -> tuple[float, int, dict[str, Any]]:
    """Call POST /api/v1/auth/refresh using the refresh cookie.

    Returns (elapsed_ms, status_code, response_json).
    """
    return timed_http_request(
        base_url,
        "POST",
        "/api/v1/auth/refresh",
        cookies=cookies,
        verify_ssl=verify_ssl,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def admin_credentials() -> tuple[str, str]:
    """Return (username, password) for the admin user."""
    return get_admin_credentials()


@pytest.fixture(scope="module")
def admin_tokens(
    nexus_base_url: str,
    admin_credentials: tuple[str, str],
) -> tuple[str, dict[str, str]]:
    """Login as admin and return (access_token, cookies).

    The cookies contain the ``ao_refresh_token`` HttpOnly cookie needed
    for refresh tests.
    """
    username, password = admin_credentials
    return login_and_get_tokens(nexus_base_url, username, password)


@pytest.fixture(scope="module")
def admin_auth_headers(admin_tokens: tuple[str, dict[str, str]]) -> dict[str, str]:
    """Return Bearer auth headers from the admin login."""
    access_token, _ = admin_tokens
    return {"Authorization": f"Bearer {access_token}"}


@pytest.fixture(scope="module")
def admin_refresh_cookies(admin_tokens: tuple[str, dict[str, str]]) -> dict[str, str]:
    """Return the cookies from admin login (contains ao_refresh_token)."""
    _, cookies = admin_tokens
    return cookies


@pytest.fixture(scope="module")
def oidc_provider_id(
    nexus_base_url: str,
    admin_auth_headers: dict[str, str],
) -> str | None:
    """Discover the first enabled OIDC identity provider, or None.

    Calls GET /api/v1/auth/providers (public endpoint) to list enabled
    identity providers.
    """
    _, status, body = timed_http_request(
        nexus_base_url,
        "GET",
        "/api/v1/auth/providers",
    )
    if status != 200:
        return None
    providers = body.get("providers", [])
    for provider in providers:
        if provider.get("provider_type") in ("oidc", "openid_connect"):
            provider_id: str | None = provider.get("id")
            return provider_id
    return None
