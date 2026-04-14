"""Shared fixtures for all integration tests.

Provides OPA mocking so that integration tests outside ``tests/integration/api/``
(which has its own richer OPA mock using the CLI) can still run without an OPA
server.
"""

from typing import Any
from unittest.mock import AsyncMock

import pytest


@pytest.fixture(autouse=True)
def _mock_opa_allow_all(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace OPA client with one that always allows requests.

    This is a lightweight fallback for integration tests that don't live
    under ``tests/integration/api/`` (those use the CLI-based mock).
    The ``api`` conftest's ``_mock_opa`` fixture overrides this one for
    tests in that directory because pytest uses the most-specific conftest.
    """
    mock_opa = AsyncMock()
    mock_opa.evaluate = AsyncMock(
        return_value={
            "allow": True,
            "deny": False,
            "matched_policy": "test-allow-all",
            "allowed_projects": ["*"],
        }
    )

    def _mock_getter(request: Any = None) -> AsyncMock:  # noqa: ANN401
        return mock_opa

    monkeypatch.setattr("nexus.authz.dependencies.get_opa_client", _mock_getter)
    monkeypatch.setattr("nexus.workflows.executions_router.get_opa_client", _mock_getter)
