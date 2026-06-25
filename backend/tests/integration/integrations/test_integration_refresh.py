"""Contract tests for POST /api/v1/integrations/{integration_id}/refresh.

The refresh endpoint discovers and syncs resources (tools) for a saved
MCP server integration. It returns a RefreshResult with tool counts and
updates Integration.refresh_status / last_refreshed_at.
"""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from httpx import AsyncClient
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.models import User
from nexus.integrations.adapters.protocol import DiscoveredTool, DiscoveredToolParameter, DiscoverResult
from nexus.integrations.models.integration import (
    IntegrationCreate,
    IntegrationRefreshStatus,
    IntegrationType,
)
from nexus.integrations.services.integration_service import IntegrationService
from nexus.tool_manager.models.tool import Tool

BASE_URL = "/api/v1/integrations"

MCP_DISCOVER_PATCH = "nexus.integrations.adapters.mcp_server.MCPServerHealthCheck.discover"


def _fake_discovered_tool(name: str, *, with_params: bool = False) -> DiscoveredTool:
    params = None
    if with_params:
        params = [DiscoveredToolParameter(name="query", type="string", description="Query string", required=True)]
    return DiscoveredTool(name=name, description=f"Description for {name}", parameters=params)


@pytest.mark.asyncio
class TestIntegrationRefreshContract:
    """Contract tests for POST /integrations/{id}/refresh."""

    async def test_refresh_not_found_returns_404(self, auth_client: AsyncClient) -> None:
        """Non-existent integration returns 404."""
        response = await auth_client.post(f"{BASE_URL}/{uuid4()}/refresh")
        assert response.status_code == 404

    async def test_refresh_invalid_uuid_returns_422(self, auth_client: AsyncClient) -> None:
        """Invalid UUID in path returns 422."""
        response = await auth_client.post(f"{BASE_URL}/not-a-uuid/refresh")
        assert response.status_code == 422

    async def test_refresh_non_mcp_returns_422(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Refreshing an LLM integration type returns 422."""
        service = IntegrationService(test_db_session, test_user)
        created = await service.create_integration(
            IntegrationCreate(
                name=f"llm-refresh-{uuid4().hex[:8]}",
                integration_type=IntegrationType.LLM_PROVIDER,
                configuration={
                    "integration_type": "llm_provider",
                    "base_url": "http://localhost:11434",
                },
            )
        )
        await test_db_session.commit()

        response = await auth_client.post(f"{BASE_URL}/{created.id}/refresh")
        assert response.status_code == 422
        data = response.json()
        assert "detail" in data

    async def test_refresh_success_returns_refresh_result(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Successful refresh returns RefreshResult with tool counts."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-ok")

        discover_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_tools=[_fake_discovered_tool("tool_a"), _fake_discovered_tool("tool_b")],
        )

        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=discover_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200
        data = response.json()
        assert "tools_synced_count" in data
        assert "tools_updated_count" in data
        assert "tools_disabled_count" in data
        assert "refreshed_at" in data
        assert data["tools_synced_count"] == 2
        assert data["tools_updated_count"] == 0
        assert data["tools_disabled_count"] == 0

    async def test_refresh_creates_tool_records(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Successful refresh creates Tool records in the database."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-tools")

        discover_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_tools=[
                _fake_discovered_tool("alpha", with_params=True),
                _fake_discovered_tool("beta"),
            ],
        )

        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=discover_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200

        tools = (
            await test_db_session.exec(
                select(Tool).where(
                    Tool.integration_id == integration_id,
                    Tool.deleted_at.is_(None),  # type: ignore[union-attr]
                )
            )
        ).all()
        assert len(tools) == 2
        assert {t.name for t in tools} == {"alpha", "beta"}

    async def test_refresh_updates_refresh_status_to_available(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Successful refresh sets refresh_status=AVAILABLE and populates last_refreshed_at."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-status")

        discover_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_tools=[],
        )

        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=discover_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200

        get_resp = await auth_client.get(f"{BASE_URL}/{integration_id}")
        assert get_resp.status_code == 200
        data = get_resp.json()
        assert data["refresh_status"] == IntegrationRefreshStatus.AVAILABLE.value
        assert data["last_refreshed_at"] is not None
        assert data["refresh_error"] is None

    async def test_refresh_failure_sets_error_status(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Failed discover sets refresh_status=ERROR and refresh_error on the integration."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-err")

        discover_result = DiscoverResult(
            success=False,
            checked_at=datetime.now(UTC),
            error="Connection refused: simulated failure",
        )

        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=discover_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200
        data = response.json()
        assert data["tools_synced_count"] == 0
        assert data["tools_updated_count"] == 0
        assert data["tools_disabled_count"] == 0

        get_resp = await auth_client.get(f"{BASE_URL}/{integration_id}")
        assert get_resp.status_code == 200
        integration_data = get_resp.json()
        assert integration_data["refresh_status"] == IntegrationRefreshStatus.ERROR.value
        assert "Connection refused" in (integration_data.get("refresh_error") or "")
        assert integration_data["last_refreshed_at"] is not None

    async def test_refresh_disables_missing_tools(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """Tools no longer returned by MCP server are disabled (not deleted)."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-disable")

        # First refresh — creates alpha and beta
        first_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_tools=[_fake_discovered_tool("alpha"), _fake_discovered_tool("beta")],
        )
        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=first_result)):
            await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        # Second refresh — only alpha remains
        second_result = DiscoverResult(
            success=True,
            checked_at=datetime.now(UTC),
            discovered_tools=[_fake_discovered_tool("alpha")],
        )
        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=second_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200
        data = response.json()
        assert data["tools_updated_count"] == 1
        assert data["tools_disabled_count"] == 1

    async def test_refresh_refreshed_at_is_iso_timestamp(
        self, auth_client: AsyncClient, test_db_session: AsyncSession, test_user: User
    ) -> None:
        """refreshed_at in the response is an ISO 8601 timestamp string."""
        integration_id = await _create_mcp_integration(test_db_session, test_user, "refresh-ts")

        discover_result = DiscoverResult(success=True, checked_at=datetime.now(UTC), discovered_tools=[])

        with patch(MCP_DISCOVER_PATCH, new=AsyncMock(return_value=discover_result)):
            response = await auth_client.post(f"{BASE_URL}/{integration_id}/refresh")

        assert response.status_code == 200
        ts = response.json()["refreshed_at"]
        assert isinstance(ts, str)
        assert "T" in ts


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def _create_mcp_integration(
    session: AsyncSession,
    user: User,
    name_prefix: str,
) -> str:
    """Create an mcp_server integration (no real credential needed for refresh tests)."""
    service = IntegrationService(session, user)
    created = await service.create_integration(
        IntegrationCreate(
            name=f"{name_prefix}-{uuid4().hex[:8]}",
            integration_type=IntegrationType.MCP_SERVER,
            configuration={"integration_type": "mcp_server", "base_url": "http://localhost:8080"},
        )
    )
    await session.commit()
    return str(created.id)
