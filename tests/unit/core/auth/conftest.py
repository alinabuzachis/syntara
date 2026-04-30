"""Shared fixtures for auth unit tests."""

from collections.abc import Generator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


@pytest.fixture
def mock_session_store() -> Generator[MagicMock]:
    """Prevent Redis connection by mocking SessionStore in unit tests."""
    mock_store = AsyncMock()
    mock_store.revoke_all_for_user.return_value = 0
    mock_store.increment_token_version.return_value = None
    with (
        patch("nexus.users.services.user_identity_service.SessionStore") as svc_cls,
        patch("nexus.users.users_router.SessionStore") as router_cls,
    ):
        for mock_cls in (svc_cls, router_cls):
            mock_cls.return_value.__aenter__ = AsyncMock(return_value=mock_store)
            mock_cls.return_value.__aexit__ = AsyncMock(return_value=False)
        yield svc_cls
