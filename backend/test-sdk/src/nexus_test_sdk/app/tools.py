"""Tool manager fixtures for integration tests."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest_asyncio
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.integrations.models.integration import Integration, IntegrationType
from nexus.integrations.models.integration_configuration import MCPServerConfiguration
from nexus.tool_manager.lib.providers.factory import ProviderFactory, get_provider_factory
from nexus.tool_manager.models import Tool
from nexus.tool_manager.services.tool_service import ToolService
from nexus_test_sdk.app.mock_mcp_provider import MockMCPProvider
from nexus_test_sdk.helpers.tool_manager import ToolFactory

if TYPE_CHECKING:
    from nexus.core.models import User


@pytest_asyncio.fixture
async def test_mcp_integration(test_db_session: AsyncSession, test_user: "User") -> Integration:
    """Create a test MCP server Integration."""
    unique_suffix = uuid4().hex[:8]
    integration = Integration(
        name=f"mock-provider-{unique_suffix}",
        integration_type=IntegrationType.MCP_SERVER,
        configuration=MCPServerConfiguration(
            integration_type="mcp_server",
            base_url="http://localhost:8080",
        ),
        created_by=test_user.id,
        updated_by=test_user.id,
    )
    test_db_session.add(integration)
    await test_db_session.commit()
    return integration


@pytest_asyncio.fixture
async def test_tool(test_db_session: AsyncSession, test_mcp_integration: Integration, test_user: "User") -> Tool:
    """Create a test Tool linked to an Integration."""
    unique_suffix = uuid4().hex[:8]
    tool = Tool(
        name=f"mock-tool-{unique_suffix}",
        integration_id=test_mcp_integration.id,
        namespaced_name=f"mock-{unique_suffix}::tool",
        created_by=test_user.id,
    )
    test_db_session.add(tool)
    await test_db_session.commit()
    return tool


@pytest_asyncio.fixture
async def tool_factory(
    test_db_session: AsyncSession, test_mcp_integration: Integration, test_user: "User"
) -> ToolFactory:
    """Create a factory fixture for multiple test tools with configurable properties."""
    return ToolFactory(test_db_session, test_mcp_integration, test_user)


@pytest_asyncio.fixture
async def test_provider_factory() -> ProviderFactory:
    """Create a ProviderFactory with MockMCPProvider registered for testing."""
    provider_factory = ProviderFactory()
    provider_factory.register_provider_type("mcp", MockMCPProvider)
    return provider_factory


@pytest_asyncio.fixture
async def test_tool_service(test_db_session: AsyncSession, test_user: "User") -> ToolService:
    """Create a ToolService for testing."""
    return ToolService(test_db_session, test_user)
