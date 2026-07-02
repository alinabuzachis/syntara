"""Shared fixtures for integration unit tests."""

from __future__ import annotations

from contextlib import contextmanager
from typing import TYPE_CHECKING
from unittest.mock import AsyncMock

import pytest

from nexus.integrations.models.integration import IntegrationCreate, IntegrationType
from nexus.integrations.services.integration_service import IntegrationService

if TYPE_CHECKING:
    from collections.abc import Generator
    from unittest.mock import MagicMock

    from sqlmodel.ext.asyncio.session import AsyncSession

    from nexus.core.models import User
    from nexus.integrations.adapters.protocol import DiscoverResult, ValidateResult


@pytest.fixture
def integration_service(test_db_session: AsyncSession, test_user: User) -> IntegrationService:
    """IntegrationService with a real DB session (no secret service by default)."""
    return IntegrationService(test_db_session, test_user)


def make_llm_create(name: str = "My LLM Provider", **kwargs: object) -> IntegrationCreate:
    """Create an IntegrationCreate for an LLM provider with sensible defaults."""
    defaults: dict[str, object] = {
        "name": name,
        "integration_type": IntegrationType.LLM_PROVIDER,
        "configuration": {
            "integration_type": "llm_provider",
            "base_url": "https://api.openai.com",
            "provider_hint": "openai",
        },
    }
    defaults.update(kwargs)
    return IntegrationCreate(**defaults)


def make_mcp_create(name: str = "My MCP Server") -> IntegrationCreate:
    """Create an IntegrationCreate for an MCP server with sensible defaults."""
    return IntegrationCreate(
        name=name,
        integration_type=IntegrationType.MCP_SERVER,
        configuration={"integration_type": "mcp_server", "base_url": "https://mcp.example.com"},
    )


@contextmanager
def mock_adapter(
    *, discover_result: DiscoverResult | None = None, validate_result: ValidateResult | None = None
) -> Generator[MagicMock]:
    """Patch create_health_check_adapter and get_runtime_settings for lifecycle tests."""
    from unittest.mock import patch

    with (
        patch("nexus.integrations.services.integration_service.create_health_check_adapter") as mock_factory,
        patch("nexus.integrations.services.integration_service.get_runtime_settings") as mock_settings,
    ):
        mock_settings.return_value.get = AsyncMock(return_value=10)
        adapter = AsyncMock()
        if discover_result is not None:
            adapter.discover = AsyncMock(return_value=discover_result)
        if validate_result is not None:
            adapter.validate = AsyncMock(return_value=validate_result)
        mock_factory.return_value = adapter
        yield adapter
