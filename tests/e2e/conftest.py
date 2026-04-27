"""Shared fixtures for Nexus E2E tests.

The core live-deployment fixtures (nexus_base_url, auth_headers,
nexus_client, nexus_api) are defined in the root tests/conftest.py and
inherited automatically.  This file adds e2e-specific fixtures.
"""

import os
from http import HTTPStatus

import httpx
import pytest
from nexus_api_client import AuthenticatedClient
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.user_create import UserCreate


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
def auditor_client(
    nexus_base_url: str, nexus_client: AuthenticatedClient, nexus_api: NexusApiRegistry
) -> AuthenticatedClient:
    """Return an authenticated client for a user with the auditor role.

    Creates the user and assigns the auditor role via the generated API
    client on first use.  The user has read-only access to most resources
    including settings, but cannot perform write operations.
    """
    username = "e2e-auditor"
    password = "AuditorPass1234!"  # noqa: S105

    resp = nexus_api.users.create(
        body=UserCreate(
            username=username,
            email="e2e-auditor@example.com",
            full_name="E2E Auditor",
            password=password,
        ),
    )
    if resp.status_code not in (HTTPStatus.CREATED, HTTPStatus.CONFLICT):
        pytest.fail(f"Failed to create auditor user: {resp.status_code} {resp.content!r}")

    if resp.status_code == HTTPStatus.CONFLICT:
        lookup = nexus_api.users.list(username=username)
        assert lookup.parsed is not None, "Failed to look up auditor user"
        user_id = lookup.parsed.resources[0].id
    else:
        assert resp.parsed is not None, "Failed to parse created auditor user"
        user_id = resp.parsed.id

    role_resp = nexus_api.users.create_role_assignment(
        user_id=user_id,
        body=SubResourceRoleAssignmentCreate(role_name="auditor"),
    )
    if role_resp.status_code not in (HTTPStatus.CREATED, HTTPStatus.CONFLICT):
        pytest.fail(f"Failed to assign auditor role: {role_resp.status_code} {role_resp.content!r}")

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
def worker_base_url() -> str:
    """Return the URL the Temporal worker uses to reach the Nexus API.

    The worker runs inside a container, so it cannot use localhost or the
    nexus_base_url (which is host-side).  The default uses the podman host
    gateway so the containerised worker can reach the API process running on
    the host.  Override with APP_WORKER_BASE_URL in CI or other environments.
    """
    return os.environ.get("APP_WORKER_BASE_URL", "http://host.containers.internal:8000")
