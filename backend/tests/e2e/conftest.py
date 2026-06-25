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
from nexus_api_client.models.integration_create import IntegrationCreate
from nexus_api_client.models.integration_refresh_status import IntegrationRefreshStatus
from nexus_api_client.models.integration_status import IntegrationStatus
from nexus_api_client.models.integration_type import IntegrationType
from nexus_api_client.models.login_request import LoginRequest
from nexus_api_client.models.mcp_server_configuration_input import MCPServerConfigurationInput
from nexus_api_client.models.sub_resource_role_assignment_create import SubResourceRoleAssignmentCreate
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


# ============================================================================
# Pipeline Marker for Shift-Left E2E Testing
# ============================================================================


def pytest_addoption(parser: pytest.Parser) -> None:
    """Add custom command-line options for E2E test filtering."""
    parser.addoption(
        "--test-phase",
        action="store",
        type=str,
        default=None,
        help="Filter E2E tests by pipeline test_phase value",
    )
    parser.addoption(
        "--exclude-test-phase",
        action="store",
        type=str,
        default=None,
        help="Exclude E2E tests with specific pipeline test_phase value",
    )


def pytest_configure(config: pytest.Config) -> None:
    """Register pipeline marker for E2E test classification."""
    config.addinivalue_line(
        "markers",
        "pipeline(test_phase=str): Pipeline test classification for shift-left testing",
    )


def _matches_pipeline_filter(
    item: pytest.Item,
    test_phase: str | None,
    exclude_test_phase: str | None,
) -> bool:
    """Check if a test item matches the pipeline filter criteria.

    Implements shift-left testing pattern:
    - --test-phase: Include ONLY tests with matching marker (unmarked excluded)
    - --exclude-test-phase: Include all tests EXCEPT those with matching marker (unmarked included)

    Args:
        item: pytest test item
        test_phase: Include tests with this test_phase marker value
        exclude_test_phase: Exclude tests with this test_phase marker value

    Returns:
        True if test should be included, False otherwise

    """
    pipeline_markers = list(item.iter_markers(name="pipeline"))

    # When using --test-phase (inclusion), unmarked tests are excluded
    if test_phase is not None:
        if not pipeline_markers:
            return False
        return any(marker.kwargs.get("test_phase") == test_phase for marker in pipeline_markers)

    # When using --exclude-test-phase (exclusion), unmarked tests are included
    if exclude_test_phase is not None:
        if not pipeline_markers:
            return True  # Unmarked tests pass exclusion filter
        return all(marker.kwargs.get("test_phase") != exclude_test_phase for marker in pipeline_markers)

    # No filtering - shouldn't happen, but include the test
    return True


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    """Filter E2E tests by pipeline marker parameters (test_phase)."""
    test_phase = config.getoption("--test-phase", None)
    exclude_test_phase = config.getoption("--exclude-test-phase", None)

    if test_phase is None and exclude_test_phase is None:
        return  # No filtering needed

    selected = []
    deselected = []

    for item in items:
        if _matches_pipeline_filter(item, test_phase, exclude_test_phase):
            selected.append(item)
        else:
            deselected.append(item)

    config.hook.pytest_deselected(items=deselected)
    items[:] = selected


# ============================================================================
# E2E Test Fixtures
# ============================================================================

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
_REVOCATION_TTL_BUFFER = 15.0  # Slightly longer than server's _CACHE_TTL (10 s)


def _is_globally_revoked(response: httpx.Response) -> bool:
    """Return True when the response is a TOKEN_GLOBALLY_REVOKED 401."""
    try:
        return bool(response.json().get("code") == "TOKEN_GLOBALLY_REVOKED")
    except Exception:
        return False


class _AutoRefreshAuth(httpx.Auth):
    """httpx Auth that proactively and reactively refreshes expired JWT tokens.

    Proactive: re-authenticates when the token age exceeds _TOKEN_REFRESH_INTERVAL.
    Reactive: retries with a fresh token on any 401 response.
      - TOKEN_GLOBALLY_REVOKED: loops until the revocation TTL window (~10 s) expires,
        because freshly-issued tokens are also rejected until the cache clears.
      - Any other 401: retries exactly once (unchanged legacy behaviour).
    """

    def __init__(
        self,
        base_url: str,
        initial_token: str,
        *,
        username: str | None = None,
        password: str | None = None,
    ) -> None:
        self._base_url = base_url
        self.token = initial_token
        self._last_refresh = time.monotonic()
        self._username = username
        self._password = password

    def _refresh(self) -> None:
        last_exc: Exception | None = None
        for attempt in range(3):
            try:
                if self._username and self._password:
                    self.token = _login(self._base_url, self._username, self._password)
                else:
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
            deadline = time.monotonic() + _REVOCATION_TTL_BUFFER
            while True:
                self._refresh()
                request.headers["Authorization"] = f"Bearer {self.token}"
                response = yield request
                if response.status_code != 401 or not _is_globally_revoked(response) or time.monotonic() >= deadline:
                    break
                time.sleep(0.5)


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
def unauthenticated_client(nexus_base_url: str) -> AuthenticatedClient:
    """Return an unauthenticated Nexus API client for login flows and public endpoints.

    Uses an invalid token so requests are rejected with 401 by protected endpoints.
    SSL verification is disabled for E2E tests (localhost/test environment with
    self-signed certs). This is acceptable for test code but should NEVER be
    used in production.
    """
    return AuthenticatedClient(base_url=f"{nexus_base_url}/api/v1", token="unauthenticated", verify_ssl=False)  # noqa: S106


@pytest.fixture
def unauth_api(nexus_base_url: str, unauthenticated_client: AuthenticatedClient) -> NexusApiRegistry:
    """NexusApiRegistry backed by a client with no valid auth token.

    Used to verify that unauthenticated requests are rejected with 401.
    SSL verification is disabled for E2E tests (localhost/test environment with
    self-signed certs). This is acceptable for test code but should NEVER be
    used in production.
    """
    return NexusApiRegistry(unauthenticated_client)


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
    return AuthenticatedClient(
        base_url=f"{nexus_base_url}/api/v1",
        token=token,
        verify_ssl=False,
        timeout=httpx.Timeout(60.0),
        httpx_args={"auth": _AutoRefreshAuth(nexus_base_url, token, username=username, password=password)},
    )


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
    return AuthenticatedClient(
        base_url=f"{nexus_base_url}/api/v1",
        token=token,
        verify_ssl=False,
        timeout=httpx.Timeout(60.0),
        httpx_args={"auth": _AutoRefreshAuth(nexus_base_url, token, username=username, password=password)},
    )


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
    groups_resp = nexus_api.groups.list(additional_params={"name": "admins"}, limit=100)
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
def mcp_integration_id(nexus_api: NexusApiRegistry) -> str:
    """Return the ID of the shared MCP server Integration used by E2E tests.

    Checks that the MCP server is reachable, then either finds an existing
    Integration named MCP_PROVIDER_NAME or creates one.  The Integration is
    validated and polled until AVAILABLE before the ID is returned.
    """
    try:
        resp = httpx.get(MCP_HEALTH_URL, timeout=5, verify=False)  # noqa: S501
        resp.raise_for_status()
    except (httpx.RequestError, httpx.HTTPStatusError) as exc:
        pytest.skip(f"MCP server not reachable at {MCP_HEALTH_URL}: {exc}")

    # Look for an existing integration named MCP_PROVIDER_NAME
    integrations_resp = nexus_api.integrations.list(integration_type=IntegrationType.MCP_SERVER)
    integrations_list = integrations_resp.assert_and_get()

    existing = next(
        (i for i in integrations_list.resources if i.name == MCP_PROVIDER_NAME),
        None,
    )

    if existing is not None:
        integration_id = str(existing.id)
    else:
        create_resp = nexus_api.integrations.create(
            body=IntegrationCreate(
                name=MCP_PROVIDER_NAME,
                description="MCP server for E2E tests",
                integration_type=IntegrationType.MCP_SERVER,
                configuration=MCPServerConfigurationInput(base_url=MCP_PROVIDER_URL),
            )
        )
        integration = create_resp.assert_and_get()
        integration_id = str(integration.id)

    nexus_api.integrations.validate(integration_id=UUID(integration_id))

    # Wait for validation to complete before refreshing tools
    _timeout = 30.0
    _interval = 0.5
    deadline = time.monotonic() + _timeout
    while True:
        integration = nexus_api.integrations.get(integration_id=UUID(integration_id)).assert_and_get()
        if integration.validation_status == IntegrationStatus.AVAILABLE:
            break
        if time.monotonic() >= deadline:
            pytest.fail(
                f"MCP integration {integration_id} did not reach AVAILABLE status within {_timeout}s "
                f"(last status: {integration.validation_status})"
            )
        time.sleep(_interval)

    nexus_api.integrations.refresh_resources(integration_id=UUID(integration_id))

    # Wait for refresh to complete
    deadline = time.monotonic() + _timeout
    while True:
        integration = nexus_api.integrations.get(integration_id=UUID(integration_id)).assert_and_get()
        if integration.refresh_status == IntegrationRefreshStatus.AVAILABLE:
            return integration_id
        if time.monotonic() >= deadline:
            pytest.fail(
                f"MCP integration {integration_id} refresh did not complete within {_timeout}s "
                f"(last status: {integration.refresh_status})"
            )
        time.sleep(_interval)


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
def first_project_id(nexus_api: NexusApiRegistry) -> UUID:
    """Return the first available project ID.

    Tests that need a valid project ID can use this fixture.
    """
    projects_list = nexus_api.projects.list().assert_and_get()
    assert len(projects_list.resources) > 0, "No projects available"
    return UUID(str(projects_list.resources[0].id))


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
