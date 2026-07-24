"""JWT authentication fixtures specific to unit tests."""

from __future__ import annotations

import pytest

from nexus.auth.services.token_service import TokenService


@pytest.fixture
def token_service() -> TokenService:
    """Create a TokenService instance for generating test tokens."""
    return TokenService()
