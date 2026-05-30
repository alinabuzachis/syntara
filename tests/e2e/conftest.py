"""Shared fixtures for Nexus E2E tests.

The core live-deployment fixtures (nexus_base_url, auth_headers,
nexus_client, nexus_api) are defined in the root tests/conftest.py and
inherited automatically.  This file adds e2e-specific fixtures.
"""

import logging
import os
import secrets
import time
from collections.abc import Callable, Generator
from http import HTTPStatus
from pathlib import Path
from typing import Any, cast
from uuid import UUID, uuid4

import httpx
import pytest
from click.testing import Result
from nexus_api_client import AuthenticatedClient, Client
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.mcp_configuration import MCPConfiguration
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.tool_provider_create import ToolProviderCreate
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.user_info import UserInfo
from nexus_api_client.models.user_read import UserRead
from nexus_api_client.models.workflow_create import WorkflowCreate
from nexus_api_client.models.workflow_read import WorkflowRead
from nexus_api_client.types import Response
from typer.testing import CliRunner

logger = logging.getLogger(__name__)


def unique_name(base: str) -> str:
    """Generate a unique resource name to avoid conflicts across E2E test runs."""
    return f"{base}-{uuid4().hex[:8]}"


def generate_test_password() -> str:
    """Return a random password that always satisfies the server's complexity rules.

    Uses a fixed prefix that covers uppercase, lowercase, digit, and special char,
    then appends random hex so each call produces a unique value.
    """
    return f"Test@Pass1{secrets.token_hex(8)}"


def _admin_password() -> str:
    password_path = Path(os.environ.get("APP_ADMIN_PASSWORD_PATH", ".secrets/admin-password"))
    if not password_path.exists():
        msg = f"Admin password file not found: {password_path}. Run 'make secrets-generate'."
        raise RuntimeError(msg)

    password = password_path.read_text().strip()
    if not password:
        msg = f"Admin password file is empty: {password_path}"
        raise RuntimeError(msg)

    return password


_TOKEN_REFRESH_INTERVAL = 300  # Re-authenticate after 5 minutes (token lifetime is 15 min)


class _AutoRefreshAuth(httpx.Auth):
    """httpx Auth that proactively and reactively refreshes expired JWT tokens.

    Proactive: re-authenticates when the token age exceeds _TOKEN_REFRESH_INTERVAL.
    Reactive: retries once with a fresh token on any 401 response.
    """

    def __init__(self, base_url: str, initial_token: str) -> None:
        self._base_url = base_url
        self.token = initial_token
        self._last_refresh = time.monotonic()

    def _refresh(self) -> None:
        self.token = _generate_e2e_token(self._base_url)
        self._last_refresh = time.monotonic()

    def auth_flow(self, request: httpx.Request) -> Generator[httpx.Request, httpx.Response, None]:
        if time.monotonic() - self._last_refresh > _TOKEN_REFRESH_INTERVAL:
            self._refresh()
        request.headers["Authorization"] = f"Bearer {self.token}"
        response = yield request
        if response.status_code == 401:
            self._refresh()
            request.headers["Authorization"] = f"Bearer {self.token}"
            yield request


MCP_PROVIDER_NAME = "mcp"
MCP_PORT = os.environ.get("MCP_PORT", "8765")
MCP_PROVIDER_URL = os.environ.get("MCP_BASE_URL", f"http://mcp-server:{MCP_PORT}/mcp")
MCP_HEALTH_URL = f"http://localhost:{MCP_PORT}/health"


def _login(base_url: str, username: str, password: str) -> str:
    """Obtain a JWT access token via the generated login endpoint."""
    unauthenticated = Client(base_url=f"{base_url}/api/v1", verify_ssl=False)
    resp = login_sync(client=unauthenticated, body=LoginRequest(username=username, password=password))
    if resp.status_code != HTTPStatus.OK or not isinstance(resp.parsed, AccessTokenResponse):
        msg = f"Login failed for {username}: {resp.status_code} {resp.content!r}"
        raise RuntimeError(msg)
    return resp.parsed.access_token


def _generate_e2e_token(base_url: str) -> str:
    """Obtain a JWT access token for e2e tests via POST /auth/login."""
    password = _admin_password()
    return _login(base_url, "admin", password)


def local_user_login(
    base_url: str,
    *,
    username: str | None = None,
    password: str | None = None,
) -> Response[Any]:
    """Login local user in Unauthenticated client. By default, login built-in admin."""
    resolved_username = username or "admin"
    resolved_password = password if password else _admin_password()
    unauthenticated = Client(base_url=f"{base_url}/api/v1", verify_ssl=False)
    return login_sync(client=unauthenticated, body=LoginRequest(username=resolved_username, password=resolved_password))


@pytest.fixture(scope="session")
def auth_headers(nexus_base_url: str) -> dict[str, str]:
    """Return Bearer auth headers for raw httpx calls."""
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

    return AuthenticatedClient(
        base_url=f"{base_url}/api/v1",
        token=access_token,
        verify_ssl=False,
        timeout=httpx.Timeout(60.0),
        httpx_args={"auth": _AutoRefreshAuth(base_url, access_token)},
    )


@pytest.fixture(scope="session")
def nexus_api(nexus_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the authenticated test client."""
    return NexusApiRegistry(nexus_client)


@pytest.fixture(autouse=True)
def reset_async_client(nexus_client: AuthenticatedClient) -> Generator[None, None, None]:
    """Reset the cached async httpx client between tests.

    nexus_client is session-scoped but async tests run with function-scoped event loops.
    Without this, the AsyncClient created in one test's loop becomes stale for the next.
    Token refresh is handled transparently by _AutoRefreshAuth on every request.
    """
    yield
    nexus_client._async_client = None


@pytest.fixture(scope="session")
def viewer_client(nexus_base_url: str, nexus_api: NexusApiRegistry) -> AuthenticatedClient:
    """Return an authenticated client for a non-admin (viewer) user.

    Creates the user via the admin client on first use.  The user has no
    role assignments, so all permission-gated endpoints should deny access.
    """
    username = "e2e-viewer"
    password = "ViewerPass1234!"  # noqa: S105

    resp = nexus_api.users.create(
        body=UserCreate(
            username=username,
            email="e2e-viewer@example.com",
            first_name="E2E Viewer",
            password=password,
        ),
    )
    if resp.status_code not in (HTTPStatus.CREATED, HTTPStatus.CONFLICT):
        pytest.fail(f"Failed to create viewer user: {resp.status_code} {resp.content!r}")

    token = _login(nexus_base_url, username, password)
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=token, verify_ssl=False)


@pytest.fixture(scope="session")
def viewer_api(viewer_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the non-admin viewer client."""
    return NexusApiRegistry(viewer_client)


@pytest.fixture(scope="session")
def auditor_client(nexus_base_url: str, nexus_api: NexusApiRegistry) -> AuthenticatedClient:
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
            first_name="E2E Auditor",
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
    if role_resp.status_code not in (
        HTTPStatus.CREATED,
        HTTPStatus.CONFLICT,
        HTTPStatus.UNPROCESSABLE_ENTITY,  # role already assigned
    ):
        pytest.fail(f"Failed to assign auditor role: {role_resp.status_code} {role_resp.content!r}")

    token = _login(nexus_base_url, username, password)
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token=token, verify_ssl=False)


@pytest.fixture(scope="session")
def auditor_api(auditor_client: AuthenticatedClient) -> NexusApiRegistry:
    """Return a NexusApiRegistry bound to the auditor client."""
    return NexusApiRegistry(auditor_client)


@pytest.fixture(scope="session")
def worker_base_url() -> str:
    """Return the URL the Temporal worker uses to reach the Nexus API.

    The worker runs inside a container, so it cannot use localhost or the
    nexus_base_url (which is host-side).  The default uses the podman host
    gateway so the containerised worker can reach the API process running on
    the host.  Override with APP_WORKER_BASE_URL in CI or other environments.
    """
    return os.environ.get("APP_WORKER_BASE_URL", "http://host.containers.internal:8000")


@pytest.fixture(scope="session")
def nexus_api_admin_group_id(nexus_api: NexusApiRegistry) -> UUID:
    """Get admin role group ID for Nexus API."""
    groups_resp = nexus_api.groups.list()
    if groups_resp.parsed is None or len(groups_resp.parsed.resources) == 0:
        msg = "Unable to retrieve admin group ID."
        raise RuntimeError(msg)
    admins_group_id = [g.id for g in groups_resp.parsed.resources if g.name == "admins"]
    if len(admins_group_id) != 1:
        msg = "Unable to retrieve admin group ID."
        raise RuntimeError(msg)
    return cast("UUID", admins_group_id[0])


@pytest.fixture(scope="session")
def mcp_provider_id(nexus_api: NexusApiRegistry) -> str:
    """Register the shared MCP tool provider once, validate and refresh its tools.

    Reuses an existing provider named "mcp" if one is already present.
    Skips the entire test if the MCP server is not reachable.

    Returns the provider ID as a string.
    """
    try:
        r = httpx.get(MCP_HEALTH_URL, timeout=5)
        r.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.skip(f"MCP server not reachable at {MCP_HEALTH_URL}: {exc}")

    providers = nexus_api.tool_manager.get_tool_providers().assert_and_get()
    existing = [p for p in providers.resources if p.name == MCP_PROVIDER_NAME]

    if existing:
        provider_id = str(existing[0].id)
    else:
        resp = nexus_api.tool_manager.register_tool_provider(
            body=ToolProviderCreate(
                name=MCP_PROVIDER_NAME,
                description="MCP server for E2E tests",
                configuration=MCPConfiguration(base_url=MCP_PROVIDER_URL),
            ),
        )
        assert resp.is_success, f"Failed to register MCP provider: {resp.content!r}"
        assert resp.parsed is not None
        provider_id = str(resp.parsed.id)

    pid = UUID(provider_id)
    validate_resp = nexus_api.tool_manager.validate_tool_provider(provider_id=pid)
    assert validate_resp.is_success, f"MCP provider validation request failed: {validate_resp.content!r}"
    assert validate_resp.parsed is not None
    assert validate_resp.parsed.valid is True, f"MCP provider validation failed: {validate_resp.parsed.error}"

    refresh_resp = nexus_api.tool_manager.refresh_tool_provider(provider_id=pid)
    assert refresh_resp.is_success, f"MCP provider refresh failed: {refresh_resp.content!r}"

    return provider_id


@pytest.fixture(scope="session")
def unauthenticated_client(nexus_base_url: str) -> Client:
    """Return an unauthenticated Nexus API client for testing public endpoints."""
    return Client(base_url=f"{nexus_base_url}/api/v1", verify_ssl=False)


@pytest.fixture(scope="session")
def nexus_admin_user(nexus_api: NexusApiRegistry) -> UserInfo:
    """Get admin user ID for Nexus API."""
    curr_user_resp = nexus_api.authentication.get_current_user()
    assert curr_user_resp.parsed is not None
    return cast("UserInfo", curr_user_resp.parsed)


@pytest.fixture
def workflow_factory(nexus_api: NexusApiRegistry) -> Generator[Callable[[WorkflowCreate], WorkflowRead], None, None]:
    """Factory that creates workflows with automatic cleanup."""
    created_workflow_ids: list[UUID] = []

    def _create(workflow_data: WorkflowCreate) -> WorkflowRead:
        response = nexus_api.workflows.create(body=workflow_data)
        assert response.status_code == HTTPStatus.CREATED
        assert response.parsed is not None
        created_workflow_ids.append(response.parsed.id)
        return cast("WorkflowRead", response.parsed)

    yield _create

    for workflow_id in created_workflow_ids:
        try:
            nexus_api.workflows.delete(workflow_id=workflow_id)
        except Exception:
            pass  # Best effort cleanup


@pytest.fixture(scope="session")
def llm_model() -> str:
    """Return the LLM model to use in agentic node configs.

    Reads APP_OPENROUTER_MODEL from the environment; falls back to the
    app's default so local runs work without any extra configuration.
    """
    return os.environ.get("APP_OPENROUTER_MODEL", "anthropic/claude-sonnet-4")


@pytest.fixture(scope="session")
def llm_credential_id(nexus_api: NexusApiRegistry, worker_id: str) -> Generator[str, None, None]:
    """Create an LLM Provider credential for e2e tests and yield its UUID.

    Reads APP_OPENROUTER_API_KEY from the environment; skips if not set.
    The credential is deleted on teardown.
    """
    api_key = os.environ.get("APP_OPENROUTER_API_KEY")
    if not api_key:
        pytest.skip("APP_OPENROUTER_API_KEY not set — LLM credential required")

    types_resp = nexus_api.credentials.list_types()
    assert types_resp.is_success
    assert types_resp.parsed is not None
    llm_type_id: UUID | None = None
    for ct in types_resp.parsed.resources:
        if "llm" in ct.name.lower():
            llm_type_id = UUID(str(ct.id))
            break
    assert llm_type_id is not None, "LLM Provider credential type not found — is the database seeded?"

    projects_resp = nexus_api.projects.list()
    assert projects_resp.is_success
    assert projects_resp.parsed is not None
    assert len(projects_resp.parsed.resources) > 0, "No projects available"
    project_id = UUID(str(projects_resp.parsed.resources[0].id))

    cred_name = f"e2e-llm-credential-{worker_id}"
    cred = nexus_api.credentials.create(
        body=CredentialCreate(
            name=cred_name,
            credential_type_id=llm_type_id,
            project_id=project_id,
            inputs=CredentialCreateInputs.from_dict(
                {
                    "provider": "openrouter",
                    "api_key": api_key,
                    "base_url": "https://openrouter.ai/api/v1",
                }
            ),
        ),
    ).assert_and_get()
    cred_id = str(cred.id)

    yield cred_id

    try:
        nexus_api.credentials.delete(credential_id=UUID(cred_id))
    except Exception:
        pass


@pytest.fixture
def local_user_factory(
    nexus_api: NexusApiRegistry,
) -> Generator[Callable[..., tuple[UserRead, str]], None, None]:
    """Factory that creates a local user and cleans up after the test.

    Returns a tuple of (UserRead, password) so tests can verify login behavior.
    Accepts optional overrides for username, email, first/last name, and password.
    """
    created_user_ids: list[UUID] = []

    def _create(
        *,
        username: str | None = None,
        email: str | None = None,
        first_name: str = "Test",
        last_name: str = "Local User",
        password: str | None = None,
    ) -> tuple[UserRead, str]:
        username = username or unique_name("e2e-test-user")
        password = password or generate_test_password()
        email = email or f"{username}@example.com"

        resp = nexus_api.users.create(
            body=UserCreate(
                username=username,
                email=email,
                first_name=first_name,
                last_name=last_name,
                password=password,
                is_enabled=True,
            )
        )
        assert resp.status_code == 201
        assert resp.parsed is not None
        created_user_ids.append(resp.parsed.id)
        return resp.parsed, password

    yield _create

    for user_id in created_user_ids:
        try:
            nexus_api.users.delete(user_id=user_id)
        except Exception:
            logger.warning("Failed to clean up local user %s", user_id, exc_info=True)


@pytest.fixture
def ao_authenticated_cli(nexus_base_url: str) -> Callable[[list[str]], Result]:
    """Invokable aap automation cli with base url and a fresh admin token."""
    from aap_orchestrator_cli import app

    runner = CliRunner()
    token = _generate_e2e_token(nexus_base_url)

    def invoke(args: list[str]) -> Result:
        return runner.invoke(
            app,
            [
                "--base-url",
                nexus_base_url,
                "--token",
                token,
                *args,
            ],
        )

    return invoke
