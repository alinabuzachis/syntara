"""Shared fixtures for Nexus E2E tests.

The core live-deployment fixtures (nexus_base_url, auth_headers,
nexus_client, nexus_api) are defined in this file and inherited by E2E tests.
This file adds e2e-specific fixtures and session helpers.
"""

import logging
import os
import secrets
import string
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
from nexus_api_client.api.authentication.get_csrf_token import sync_detailed as csrf_token_sync
from nexus_api_client.api.authentication.get_current_user import sync_detailed as get_user_sync
from nexus_api_client.api.authentication.login import sync_detailed as login_sync
from nexus_api_client.api.authentication.refresh_token import sync_detailed as refresh_sync
from nexus_api_client.models import (
    ExecutionRead,
    WorkflowCreate,
    WorkflowRead,
)
from nexus_api_client.models.access_token_response import AccessTokenResponse
from nexus_api_client.models.credential_create import CredentialCreate
from nexus_api_client.models.credential_create_inputs import CredentialCreateInputs
from nexus_api_client.models.csrf_token_response import CsrfTokenResponse
from nexus_api_client.models.error_data import ErrorData
from nexus_api_client.models.identity_provider_create import IdentityProviderCreate
from nexus_api_client.models.integration_create import IntegrationCreate
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.mcp_configuration import MCPConfiguration
from nexus_api_client.models.provider_status import ProviderStatus
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
from nexus_api_client.models.tool_provider_create import ToolProviderCreate
from nexus_api_client.models.user_create import UserCreate
from nexus_api_client.models.user_info import UserInfo
from nexus_api_client.models.user_read import UserRead
from nexus_api_client.models.user_update import UserUpdate
from nexus_api_client.types import UNSET, Response, Unset
from typer.testing import CliRunner

from nexus.core.models.user_schemas import UserCreate as UserCreateSchema
from nexus.workflows.models.execution import TERMINAL_EXECUTION_STATUSES

logger = logging.getLogger(__name__)

REFRESH_COOKIE_NAME = "ao_refresh_token"
CSRF_COOKIE_NAME = "ao_csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"

pytest_plugins = ["tests.e2e.fixtures.factories"]


_API_HEALTH_TIMEOUT = 15.0


@pytest.fixture(autouse=True)
def _wait_for_api(nexus_api: NexusApiRegistry) -> None:
    """Wait for the API to be healthy before each test.

    The database can become temporarily unreachable in the KinD CI cluster,
    causing cascading 500s. This fixture ensures the API is responsive before
    each test starts, absorbing any recovery window from prior tests.
    """
    deadline = time.monotonic() + _API_HEALTH_TIMEOUT
    while True:
        try:
            resp = nexus_api.settings.list(limit=1)
            if resp.status_code == HTTPStatus.OK:
                return
        except Exception:
            pass
        if time.monotonic() >= deadline:
            pytest.fail(f"API not healthy after {_API_HEALTH_TIMEOUT}s")
        time.sleep(0.5)


def unique_name(base: str) -> str:
    """Generate a unique resource name to avoid conflicts across E2E test runs."""
    return f"{base}-{uuid4().hex[:8]}"


def poll_execution_until_complete(
    nexus_api: NexusApiRegistry,
    execution_id: UUID,
    max_polls: int = 30,
    poll_interval: int = 2,
) -> ExecutionRead:
    """Poll execution until it reaches a terminal state.

    Args:
        nexus_api: API client for making requests
        execution_id: ID of the execution to poll
        max_polls: Maximum number of polling attempts (default: 30)
        poll_interval: Seconds to wait between polls (default: 2)

    Returns:
        ExecutionRead with final terminal state (completed, failed, cancelled, or completed_with_errors)

    Raises:
        AssertionError: If execution does not reach terminal state within timeout

    """
    for _ in range(max_polls):
        execution = nexus_api.executions.get(
            execution_id=execution_id,
            include="activities",
        ).assert_and_get()

        # Check against terminal statuses using the canonical constant
        # Convert both to strings since execution.status is a string from the API
        status = str(execution.status)
        if status in {str(s.value) for s in TERMINAL_EXECUTION_STATUSES}:
            return execution

        time.sleep(poll_interval)

    timeout_seconds = max_polls * poll_interval
    msg = (
        f"Execution {execution_id} did not complete within {timeout_seconds}s. "
        "Temporal may not be running. Start it with: make temporal-run"
    )
    raise AssertionError(msg)


_MIN_TEST_PASSWORD_LENGTH = 14
_SAFE_TEST_PASSWORD_PUNCTUATION = "!@#$%^&*(),.?-_"  # noqa: S105


def generate_test_password() -> str:
    """Return a random password that satisfies server complexity rules for E2E tests."""
    password_chars = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits),
        secrets.choice(_SAFE_TEST_PASSWORD_PUNCTUATION),
    ]
    all_chars = string.ascii_letters + string.digits + _SAFE_TEST_PASSWORD_PUNCTUATION
    extra_count = _MIN_TEST_PASSWORD_LENGTH - len(password_chars)
    password_chars.extend(secrets.choice(all_chars) for _ in range(extra_count))
    password_list = list(password_chars)
    secrets.SystemRandom().shuffle(password_list)
    password = "".join(password_list)
    UserCreateSchema(username="password-check", first_name="Password", password=password)
    return password


def admin_password() -> str:
    """Return the built-in admin password from the configured secrets file."""
    password_path = Path(os.environ.get("APP_ADMIN_PASSWORD_PATH", ".secrets/admin-password"))
    if not password_path.exists():
        msg = f"Admin password file not found: {password_path}. Run 'make secrets-generate'."
        raise RuntimeError(msg)

    password = password_path.read_text().strip()
    if not password:
        msg = f"Admin password file is empty: {password_path}"
        raise RuntimeError(msg)

    return password


def _require_session_cookies(cookies: dict[str, str]) -> None:
    missing = [name for name in (REFRESH_COOKIE_NAME, CSRF_COOKIE_NAME) if name not in cookies]
    if missing:
        msg = f"Session cookies missing required keys: {', '.join(missing)}"
        raise RuntimeError(msg)


def local_login_session(
    base_url: str,
    username: str,
    password: str,
) -> tuple[str, dict[str, str]]:
    """Log in via POST /auth/login and return (access_token, refresh cookies)."""
    response = httpx.post(
        f"{base_url}/api/v1/auth/login",
        json={"username": username, "password": password},
        verify=False,  # noqa: S501
        timeout=30,
    )
    if response.status_code != HTTPStatus.OK:
        msg = f"Login failed for {username}: {response.status_code} {response.text!r}"
        raise RuntimeError(msg)
    access_token: str = response.json()["access_token"]
    cookies = dict(response.cookies)
    _require_session_cookies(cookies)
    return access_token, cookies


def _csrf_headers_from_client(client: Client) -> dict[str, str]:
    csrf_resp = csrf_token_sync(client=client)
    if csrf_resp.status_code != HTTPStatus.OK or not isinstance(csrf_resp.parsed, CsrfTokenResponse):
        msg = f"CSRF token fetch failed: {csrf_resp.status_code} {csrf_resp.content!r}"
        raise RuntimeError(msg)
    csrf_token_response = cast("CsrfTokenResponse", csrf_resp.assert_and_get())
    return {CSRF_HEADER_NAME: csrf_token_response.csrf_token}


def csrf_headers_for_cookies(base_url: str, cookies: dict[str, str]) -> dict[str, str]:
    """Return X-CSRF-Token header derived from the session CSRF cookie."""
    _require_session_cookies(cookies)
    client = Client(base_url=f"{base_url}/api/v1", cookies=cookies, verify_ssl=False)
    return _csrf_headers_from_client(client)


def client_with_csrf_cookies(base_url: str, cookies: dict[str, str]) -> Client:
    """Return an API client with session cookies and X-CSRF-Token for cookie-auth endpoints."""
    _require_session_cookies(cookies)
    client = Client(base_url=f"{base_url}/api/v1", cookies=cookies, verify_ssl=False)
    return client.with_headers(_csrf_headers_from_client(client))


def refresh_with_cookies(
    base_url: str,
    cookies: dict[str, str],
) -> Response[AccessTokenResponse | Any | ErrorData]:
    """Call POST /auth/refresh using refresh and CSRF cookies plus X-CSRF-Token."""
    return refresh_sync(client=client_with_csrf_cookies(base_url, cookies))


def logout_with_session(
    base_url: str,
    access_token: str,
    cookies: dict[str, str],
) -> httpx.Response:
    """Call POST /auth/logout with Bearer token, session cookies, and X-CSRF-Token."""
    headers = {"Authorization": f"Bearer {access_token}", **csrf_headers_for_cookies(base_url, cookies)}
    return httpx.post(
        f"{base_url}/api/v1/auth/logout",
        headers=headers,
        cookies=cookies,
        verify=False,  # noqa: S501
        timeout=30,
    )


def get_current_user_with_token(
    base_url: str,
    access_token: str,
) -> Response[Any | ErrorData | UserInfo]:
    """Call GET /auth/me with a Bearer access token."""
    client = AuthenticatedClient(base_url=f"{base_url}/api/v1", token=access_token, verify_ssl=False)
    return get_user_sync(client=client)


def assert_refresh_succeeds(base_url: str, cookies: dict[str, str]) -> AccessTokenResponse:
    """Refresh must return 200 with an access token."""
    resp = refresh_with_cookies(base_url, cookies)
    assert resp.status_code == HTTPStatus.OK, f"Expected refresh 200, got {resp.status_code}: {resp.content!r}"
    assert isinstance(resp.parsed, AccessTokenResponse)
    return resp.parsed


def assert_refresh_unauthorized(base_url: str, cookies: dict[str, str]) -> None:
    """Refresh must return 401 when the session is revoked."""
    resp = refresh_with_cookies(base_url, cookies)
    assert resp.status_code == HTTPStatus.UNAUTHORIZED, (
        f"Expected refresh 401, got {resp.status_code}: {resp.content!r}"
    )


def logout_response_body(response: httpx.Response) -> dict[str, Any]:
    """Parse logout JSON body."""
    assert response.status_code == HTTPStatus.OK, f"Expected logout 200, got {response.status_code}: {response.text!r}"
    body: dict[str, Any] = response.json()
    assert body.get("detail") == "Successfully logged out"
    return body


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
        # Retry login on transient 401s that can occur when parallel xdist
        # workers modify auth/OIDC configuration mid-run.
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                self.token = _generate_e2e_token(self._base_url)
                self._last_refresh = time.monotonic()
                return
            except RuntimeError as exc:
                last_exc = exc
                time.sleep(2 * (attempt + 1))
        raise last_exc  # type: ignore[misc]

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
    access_token_response = cast("AccessTokenResponse", resp.assert_and_get())
    return access_token_response.access_token


def _make_client(base_url: str, token: str) -> AuthenticatedClient:
    """Create an authenticated API client for the given base URL and token."""
    return AuthenticatedClient(
        base_url=f"{base_url}/api/v1",
        token=token,
        verify_ssl=False,
        timeout=httpx.Timeout(60.0),
    )


def api_for(base_url: str, username: str, password: str) -> NexusApiRegistry:
    """Return a ``NexusApiRegistry`` authenticated as the given user."""
    token = _login(base_url, username, password)
    return NexusApiRegistry(_make_client(base_url, token))


def _generate_e2e_token(base_url: str) -> str:
    """Obtain a JWT access token for e2e tests via POST /auth/login."""
    password = admin_password()
    return _login(base_url, "admin", password)


def local_user_login(
    base_url: str,
    *,
    username: str | None = None,
    password: str | None = None,
) -> Response[Any]:
    """Login local user in Unauthenticated client. By default, login built-in admin."""
    resolved_username = username or "admin"
    resolved_password = password if password else admin_password()
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
    """Return a NexusApiRegistry bound to the session-scoped authenticated client.

    Uses ``nexus_client``, which refreshes the admin JWT via ``_AutoRefreshAuth`` on
    expiry or 401. Authentication E2E tests that revoke user/IdP sessions should use
    this fixture for admin API calls; those revocations do not invalidate unrelated
    admin tokens.
    """
    return NexusApiRegistry(nexus_client)


@pytest.fixture(scope="session")
def unauthenticated_client(nexus_base_url: str) -> Client:
    """Return an unauthenticated Nexus API client for login flows and public endpoints.

    SSL verification is disabled for E2E tests (localhost/test environment with
    self-signed certs). This is acceptable for test code but should NEVER be
    used in production.
    """
    return Client(base_url=f"{nexus_base_url}/api/v1", verify_ssl=False)


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
        users_list = nexus_api.users.list(username=username).assert_and_get()
        user_id = users_list.resources[0].id
    else:
        user = resp.assert_and_get()
        user_id = user.id

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
    groups_list = groups_resp.assert_and_get()
    admins_group_id = [g.id for g in groups_list.resources if g.name == "admins"]
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
        provider = resp.assert_and_get()
        provider_id = str(provider.id)

    pid = UUID(provider_id)
    validate_result = nexus_api.tool_manager.validate_tool_provider(provider_id=pid).assert_and_get()
    assert validate_result.valid is True, f"MCP provider validation failed: {validate_result.error}"

    # Wait for the provider to reach AVAILABLE before refreshing.
    # With xdist, another worker may have already started validation;
    # refreshing a VALIDATING provider returns TOOL_REFRESH_ERROR.
    deadline = time.monotonic() + 30.0
    while True:
        provider = nexus_api.tool_manager.get_tool_provider(provider_id=pid).assert_and_get()
        if provider.status == ProviderStatus.AVAILABLE:
            break
        if time.monotonic() >= deadline:
            pytest.fail(f"MCP provider {pid} stuck in {provider.status} after 30s")
        time.sleep(0.5)

    nexus_api.tool_manager.refresh_tool_provider(provider_id=pid).assert_and_get()

    return provider_id


@pytest.fixture(scope="session")
def nexus_admin_user(nexus_api: NexusApiRegistry) -> UserInfo:
    """Get admin user ID for Nexus API."""
    return cast("UserInfo", nexus_api.authentication.get_current_user().assert_and_get())


@pytest.fixture(scope="session")
def nexus_system_user(nexus_api: NexusApiRegistry) -> UserRead:
    """Get system user for Nexus API."""
    if "APP_SYSTEM_USER_ID" not in os.environ:
        pytest.skip("No APP_SYSTEM_USER_ID")
    system_user_id = os.environ["APP_SYSTEM_USER_ID"]
    system_user: UserRead = nexus_api.users.get(user_id=system_user_id).assert_and_get()
    return system_user


@pytest.fixture
def disable_system_user(nexus_api: NexusApiRegistry, nexus_system_user: UserRead) -> Generator[None, None, None]:
    """Returns the disabled system user and re-enable at end."""
    if nexus_system_user.is_builtin:
        """Skip this test is system user is built in."""
        pytest.skip("System user is a built in user. Data migration is required.")

    nexus_api.users.update(user_id=nexus_system_user.id, body=UserUpdate(is_enabled=False)).assert_successful()

    yield

    nexus_api.users.update(user_id=nexus_system_user.id, body=UserUpdate(is_enabled=True))


@pytest.fixture
def workflow_factory(nexus_api: NexusApiRegistry) -> Generator[Callable[[WorkflowCreate], WorkflowRead], None, None]:
    """Factory that creates workflows with automatic cleanup."""
    created_workflow_ids: list[UUID] = []

    def _create(workflow_data: WorkflowCreate) -> WorkflowRead:
        workflow: WorkflowRead = nexus_api.workflows.create(body=workflow_data).assert_and_get()
        created_workflow_ids.append(workflow.id)
        return workflow

    yield _create

    for workflow_id in created_workflow_ids:
        try:
            nexus_api.workflows.delete(workflow_id=workflow_id)
        except Exception:
            pass  # Best effort cleanup


@pytest.fixture
def cleanup_workflows(nexus_api: NexusApiRegistry) -> Generator[list[UUID], None, None]:
    """List to register workflow IDs for cleanup after test.

    Use when tests need to call nexus_api.workflows.create() directly
    (e.g., to validate response status codes) instead of using workflow_factory.

    Usage:
        def test_create_workflow(nexus_api, cleanup_workflows):
            response = nexus_api.workflows.create(...)
            if response.status_code == 201:
                cleanup_workflows.append(response.parsed.id)
            assert response.status_code == 201
    """
    workflow_ids: list[UUID] = []
    yield workflow_ids

    for workflow_id in workflow_ids:
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

    types_list = nexus_api.credentials.list_types().assert_and_get()
    llm_type_id: UUID | None = None
    for ct in types_list.resources:
        if "llm" in ct.name.lower():
            llm_type_id = UUID(str(ct.id))
            break
    assert llm_type_id is not None, "LLM Provider credential type not found — is the database seeded?"

    projects_list = nexus_api.projects.list().assert_and_get()
    assert len(projects_list.resources) > 0, "No projects available"
    project_id = UUID(str(projects_list.resources[0].id))

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


@pytest.fixture(scope="session")
def bearer_token_type_id(nexus_api: NexusApiRegistry) -> UUID:
    """Return the credential type ID for 'HTTP Bearer Token'.

    This is a preseeded credential type used in E2E tests.
    """
    types_list = nexus_api.credentials.list_types().assert_and_get()
    for ct in types_list.resources:
        if ct.name == "HTTP Bearer Token":
            return UUID(str(ct.id))
    pytest.fail("Preseeded 'HTTP Bearer Token' credential type not found")


@pytest.fixture(scope="session")
def first_project_id(nexus_api: NexusApiRegistry) -> UUID:
    """Return the first available project ID.

    Tests that need a valid project ID can use this fixture.
    """
    projects_list = nexus_api.projects.list().assert_and_get()
    assert len(projects_list.resources) > 0, "No projects available"
    return UUID(str(projects_list.resources[0].id))


@pytest.fixture
def credential_factory(
    nexus_api: NexusApiRegistry,
    bearer_token_type_id: UUID,
    first_project_id: UUID,
) -> Generator[Callable[..., dict[str, Any]], None, None]:
    """Factory that creates HTTP Bearer Token credentials with automatic cleanup.

    Usage:
        def test_something(credential_factory):
            cred = credential_factory("my-cred-name")
            # Use cred["id"], cred["inputs"], etc.
            # Cleanup happens automatically after test

    The factory function takes:
        name: Credential name
        inputs: Optional credential inputs dict (defaults to {"token": "test-secret-value-e2e"})

    And returns:
        Credential data as dict with keys: id, name, inputs, etc.

    Args:
        nexus_api: Admin API client for creating credentials
        bearer_token_type_id: Pre-fetched bearer token credential type ID
        first_project_id: Pre-fetched project ID to scope credentials to

    """
    created_credential_ids: list[UUID] = []

    def _create(name: str, inputs: dict[str, Any] | None = None) -> dict[str, Any]:
        cred = nexus_api.credentials.create(
            body=CredentialCreate(
                name=name,
                credential_type_id=bearer_token_type_id,
                project_id=first_project_id,
                inputs=CredentialCreateInputs.from_dict(inputs or {"token": "test-secret-value-e2e"}),
            ),
        ).assert_and_get()
        created_credential_ids.append(UUID(str(cred.id)))
        result: dict[str, Any] = cred.to_dict()
        return result

    yield _create

    for cred_id in created_credential_ids:
        try:
            nexus_api.credentials.delete(credential_id=cred_id)
        except Exception:
            pass  # Best effort cleanup


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
        email: str | None | Unset = UNSET,
        first_name: str = "Test",
        last_name: str = "Local User",
        password: str | None = None,
    ) -> tuple[UserRead, str]:
        username = username or unique_name("e2e-test-user")
        password = password or generate_test_password()
        if isinstance(email, Unset):
            email = f"{username}@example.com"

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
        user = resp.assert_and_get()
        created_user_ids.append(user.id)
        return user, password

    yield _create

    for user_id in created_user_ids:
        try:
            nexus_api.users.delete(user_id=user_id)
        except Exception:
            logger.warning("Failed to clean up local user %s", user_id, exc_info=True)


@pytest.fixture
def identity_provider_factory(
    nexus_api: NexusApiRegistry,
    nexus_base_url: str,
) -> Generator[Callable[[IdentityProviderCreate], Any], None, None]:
    """Factory that creates identity providers with automatic cleanup.

    Eliminates try/finally blocks by tracking created providers and cleaning up
    automatically on test teardown. Use this instead of manual create/delete.

    Usage:
        def test_something(identity_provider_factory):
            provider = identity_provider_factory(
                IdentityProviderCreate(
                    name="test-provider",
                    configuration=OIDCConfiguration(...),
                )
            )
            # Use provider.id
            # Cleanup happens automatically

    Args:
        nexus_api: Admin API client for creating providers
        nexus_base_url: Base URL for redirect URI construction

    Returns:
        Factory function that creates and tracks identity providers

    """
    created_provider_ids: list[UUID] = []

    def _create(body: IdentityProviderCreate) -> Any:  # noqa: ANN401
        provider = nexus_api.identity_providers.create(body=body).assert_and_get()
        created_provider_ids.append(UUID(str(provider.id)))
        return provider

    yield _create

    for provider_id in created_provider_ids:
        try:
            nexus_api.identity_providers.delete(provider_id=provider_id)
        except Exception:
            pass


@pytest.fixture
def integration_factory(
    nexus_api: NexusApiRegistry,
) -> Generator[Callable[[IntegrationCreate], dict[str, Any]], None, None]:
    """Factory that creates integrations with automatic cleanup.

    Creates integrations (MCP servers, LLM providers, AAP gateways) and tracks
    them for automatic cleanup on test teardown.

    Usage:
        def test_something(integration_factory):
            integration = integration_factory(
                IntegrationCreate(
                    name="test-mcp",
                    integration_type=IntegrationType.MCP_SERVER,
                    configuration=MCPServerConfiguration(...),
                )
            )
            # Use integration["id"]
            # Cleanup happens automatically

    Args:
        nexus_api: Admin API client for creating integrations

    Returns:
        Factory function that creates and tracks integrations

    """
    created_ids: list[UUID] = []

    def _create(body: IntegrationCreate) -> dict[str, Any]:
        integration = nexus_api.integrations.create(body=body).assert_and_get()
        created_ids.append(integration.id)
        result: dict[str, Any] = integration.to_dict()
        return result

    yield _create

    for integration_id in created_ids:
        try:
            nexus_api.integrations.delete(integration_id=integration_id)
        except Exception:
            pass


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
