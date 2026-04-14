"""Shared fixtures for Nexus E2E tests."""

import os
from pathlib import Path

import httpx
import pytest
from nexus_api_client import AuthenticatedClient
from nexus_api_client.api import NexusApiRegistry


def _generate_e2e_token(base_url: str) -> str:
    """Obtain a JWT access token for e2e tests via POST /auth/login.

    Reads the admin password from the file pointed to by APP_ADMIN_PASSWORD_PATH
    (default: .secrets/admin-password) and exchanges it for an access token using
    the running API.
    """
    password_path = Path(os.environ.get("APP_ADMIN_PASSWORD_PATH", ".secrets/admin-password"))
    if not password_path.exists():
        msg = f"Admin password file not found: {password_path}. Run 'make secrets-generate'."
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
    return os.environ.get("APP_BASE_URL", "http://localhost:8000")


@pytest.fixture(scope="session")
def auth_headers(nexus_base_url: str) -> dict[str, str]:
    """Return Bearer auth headers for raw httpx calls.

    Generates a JWT token using the same mechanism as the ``nexus_api``
    fixture, so raw HTTP requests authenticate consistently.
    """
    token = _generate_e2e_token(nexus_base_url)
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def nexus_client(nexus_base_url: str) -> AuthenticatedClient:
    """Return an authenticated Nexus API client connected to the test environment."""
    base_url = nexus_base_url

    try:
        response = httpx.get(f"{base_url}/health", timeout=5, verify=False)  # noqa: S501
        response.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.exit(
            f"Environment not available at {base_url}: {exc}\n"
            "Start the services first with: make services-run && make dev",
            returncode=1,
        )

    access_token = _generate_e2e_token(base_url)

    return AuthenticatedClient(base_url=base_url, token=access_token, verify_ssl=False)


@pytest.fixture(scope="session")
def nexus_api(nexus_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the authenticated test client."""
    return NexusApiRegistry(nexus_client)
