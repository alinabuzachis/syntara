"""Shared fixtures for contract tests.

Provides OPA mocking so that contract tests can run without an OPA server.
"""

from typing import Any
from unittest.mock import AsyncMock

import pytest


@pytest.fixture(autouse=True)
def _mock_opa_allow_all(monkeypatch: pytest.MonkeyPatch) -> None:
    """Replace OPA client with one that always allows requests.

    Contract tests validate API response shapes, not authorization logic.
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
