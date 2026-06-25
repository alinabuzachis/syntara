"""Reusable factory helpers and pytest fixtures for E2E resource creation.

Provides three layers:

1. **Plain helper functions** — ``create_user``, ``create_project``, etc.
   Callable from any pytest scope; no automatic cleanup.

2. **ResourceTracker** — a plain class that wraps the helpers and tracks
   created IDs for batch cleanup.  Designed for module-scoped fixtures
   that cannot depend on function-scoped factory fixtures.

3. **Pytest factory fixtures** — function-scoped fixtures that yield a
   callable and clean up on teardown.
"""

from __future__ import annotations

import time
from http import HTTPStatus

import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.conftest import _login, admin_password

# ---------------------------------------------------------------------------
# Module-scoped admin fixture (fresh token per module — avoids 15-min expiry)
# ---------------------------------------------------------------------------

_ADMIN_TOKEN_READY_TIMEOUT = 20.0


@pytest.fixture(scope="module")
def admin_api(nexus_base_url: str) -> NexusApiRegistry:
    """Admin API registry with a fresh JWT per test module.

    Retries login until the issued token is accepted by the API. This guards
    against the global-revocation TTL window that test_global_revocation.py
    leaves behind — tokens issued within that window are rejected even though
    login returns 200, until the cache expires (~10 s).
    """
    from tests.e2e.conftest import _make_client

    password = admin_password()
    deadline = time.monotonic() + _ADMIN_TOKEN_READY_TIMEOUT

    last_exc: Exception | None = None
    last_status: int | None = None
    while True:
        try:
            token = _login(nexus_base_url, "admin", password)
            client = _make_client(nexus_base_url, token)
            api = NexusApiRegistry(client)
            resp = api.settings.list(limit=1)
            if resp.status_code == HTTPStatus.OK:
                return api
            last_status = resp.status_code
        except Exception as exc:
            last_exc = exc
        if time.monotonic() >= deadline:
            if last_exc:
                detail = f" (last error: {last_exc})"
            elif last_status:
                detail = f" (last HTTP status: {last_status})"
            else:
                detail = ""
            pytest.fail(f"admin_api: API did not accept a fresh token within {_ADMIN_TOKEN_READY_TIMEOUT:.0f}s{detail}")
        time.sleep(0.5)
