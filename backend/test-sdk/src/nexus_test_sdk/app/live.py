"""Live deployment fixtures for E2E and performance tests."""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

import pytest

from nexus_test_sdk.e2e.tls import e2e_ssl_context

if TYPE_CHECKING:
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry


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
        verify=e2e_ssl_context(),
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
        response = httpx.get(f"{nexus_base_url}/health", timeout=5, verify=e2e_ssl_context())  # noqa: S501
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Nexus deployment not available at {nexus_base_url}: {exc}\n"
            "Start the services first with: make services-run && make dev",
            returncode=1,
        )

    access_token = _generate_live_token(nexus_base_url)
    ssl_ctx = e2e_ssl_context()
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=access_token, verify_ssl=ssl_ctx)


@pytest.fixture(scope="session")
def nexus_api(nexus_base_url: str, nexus_client: "AuthenticatedClient") -> "NexusApiRegistry":
    """Return a NexusApiRegistry with internal_metrics wired to the root URL."""
    from nexus_api_client import AuthenticatedClient
    from nexus_api_client.api import NexusApiRegistry
    from nexus_api_client.api.internal_metrics import InternalMetricsApi

    registry = NexusApiRegistry(nexus_client)

    root_client = AuthenticatedClient(
        base_url=nexus_base_url,
        token=nexus_client.token,
        verify_ssl=e2e_ssl_context(),
    )
    registry.__dict__["internal_metrics"] = InternalMetricsApi(client=root_client)

    return registry
