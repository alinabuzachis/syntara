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

    return AuthenticatedClient(base_url=f"{base_url}/api/v1", token=access_token, verify_ssl=False)


@pytest.fixture(scope="session")
def nexus_api(nexus_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the authenticated test client."""
    return NexusApiRegistry(nexus_client)


@pytest.fixture(scope="session")
def viewer_client(nexus_base_url: str, nexus_client: AuthenticatedClient) -> AuthenticatedClient:
    """Return an authenticated client for a non-admin (viewer) user.

    Creates the user via the admin client on first use.  The user has no
    role assignments, so all permission-gated endpoints should deny access.
    """
    admin_http = nexus_client.get_httpx_client()
    username = "e2e-viewer"
    password = "ViewerPass1234!"  # noqa: S105

    # Create the viewer user (ignore 409 if it already exists from a previous run)
    resp = admin_http.post(
        "/users",
        json={
            "username": username,
            "email": "e2e-viewer@example.com",
            "full_name": "E2E Viewer",
            "password": password,
        },
    )
    if resp.status_code not in (200, 201, 409):
        pytest.fail(f"Failed to create viewer user: {resp.status_code} {resp.text}")

    # Login as the viewer to get a token
    login_resp = httpx.post(
        f"{nexus_base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        verify=False,  # noqa: S501
        timeout=10,
    )
    login_resp.raise_for_status()
    token: str = login_resp.json()["access_token"]

    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=token, verify_ssl=False)


@pytest.fixture(scope="session")
def viewer_api(viewer_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the non-admin viewer client."""
    return NexusApiRegistry(viewer_client)


@pytest.fixture(scope="session")
def worker_base_url() -> str:
    """Return the URL the Temporal worker uses to reach the Nexus API.

    The worker runs inside a container, so it cannot use localhost or the
    nexus_base_url (which is host-side).  The default uses the podman host
    gateway so the containerised worker can reach the API process running on
    the host.  Override with APP_WORKER_BASE_URL in CI or other environments.
    """
    return os.environ.get("APP_WORKER_BASE_URL", "http://host.containers.internal:8000")
