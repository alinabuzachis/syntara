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

import pytest
from nexus_api_client.api import NexusApiRegistry

from tests.e2e.conftest import _login, admin_password

# ---------------------------------------------------------------------------
# Module-scoped admin fixture (fresh token per module — avoids 15-min expiry)
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def admin_api(nexus_base_url: str) -> NexusApiRegistry:
    """Admin API registry with a fresh JWT per test module."""
    from tests.e2e.conftest import _make_client

    token = _login(nexus_base_url, "admin", admin_password())
    return NexusApiRegistry(_make_client(nexus_base_url, token))
