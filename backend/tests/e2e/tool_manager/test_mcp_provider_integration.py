"""E2E tests for MCP provider with the MCP server started by the e2e infrastructure.

Tests complete MCP provider workflow including:
- Provider status and tool discovery via the shared MCP provider
- Tool parameters persistence
- Tools API integration
- Connection failure scenarios
"""

import os
import time
from http import HTTPStatus
from typing import Any
from uuid import UUID

import httpx
import pytest
from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models import MCPConfiguration, ToolProviderCreate
from nexus_api_client.models.provider_status import ProviderStatus
from nexus_api_client.models.tool_status import ToolStatus
from nexus_api_client.types import Response

from tests.e2e.conftest import unique_name
from tests.e2e.helpers import _retry_api_call

pytestmark = [pytest.mark.e2e]

MCP_PORT = os.environ.get("MCP_PORT", "8765")
MCP_PROVIDER_URL = os.environ.get("MCP_BASE_URL", f"http://mcp-server:{MCP_PORT}/mcp")


TRANSIENT_STATUSES = {HTTPStatus.INTERNAL_SERVER_ERROR, HTTPStatus.BAD_GATEWAY, HTTPStatus.SERVICE_UNAVAILABLE}


def _validate_provider(
    nexus_api: NexusApiRegistry,
    provider_id: UUID,
    *,
    timeout: float = 10.0,
    interval: float = 0.5,
) -> Response[Any]:
    """Call validate, retrying on 404 and transient errors until the provider is findable."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            resp = nexus_api.tool_manager.validate_tool_provider(provider_id=provider_id)
        except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(interval)
            continue
        if resp.status_code not in {HTTPStatus.NOT_FOUND, *TRANSIENT_STATUSES}:
            return resp
        if time.monotonic() >= deadline:
            msg = f"Provider {provider_id} still returns {resp.status_code} after {timeout}s"
            raise AssertionError(msg)
        time.sleep(interval)


def _wait_for_provider_status(
    nexus_api: NexusApiRegistry,
    provider_id: UUID,
    expected: ProviderStatus,
    *,
    timeout: float = 30.0,
    interval: float = 0.5,
) -> None:
    """Poll until the provider reaches the expected status."""
    deadline = time.monotonic() + timeout
    while True:
        try:
            resp = nexus_api.tool_manager.get_tool_provider(provider_id=provider_id)
        except (httpx.RemoteProtocolError, httpx.ConnectError, httpx.ReadError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(interval)
            continue
        if resp.status_code in TRANSIENT_STATUSES:
            if time.monotonic() >= deadline:
                msg = f"Provider {provider_id} still returns {resp.status_code} after {timeout}s"
                raise AssertionError(msg)
            time.sleep(interval)
            continue
        provider = resp.assert_and_get()
        if provider.status == expected:
            return
        if time.monotonic() >= deadline:
            msg = (
                f"Provider {provider_id} status is {provider.status}, expected {expected} (timed out after {timeout}s)"
            )
            raise AssertionError(msg)
        time.sleep(interval)


class TestMCPProviderIntegration:
    """E2E tests for MCP provider with the running MCP server."""

    @pytest.mark.mcp
    def test_provider_status_and_tools(self, nexus_api: NexusApiRegistry, mcp_provider_id: str) -> None:
        """Test that the shared MCP provider is available with discovered tools."""
        provider_id = UUID(mcp_provider_id)

        # Check provider status
        provider = nexus_api.tool_manager.get_tool_provider(provider_id=provider_id).assert_and_get()
        assert provider.status == ProviderStatus.AVAILABLE
        assert provider.enabled is True
        assert provider.validation_error is None
        assert provider.last_validated_at is not None
        assert provider.configuration.provider_type == "mcp"

        # Verify discovered tools
        tools_list = nexus_api.tool_manager.get_tools(
            additional_params={"provider_id[eq]": mcp_provider_id}
        ).assert_and_get()
        tools = tools_list.resources
        expected_tools = {"calculate_sum", "calculate_product", "get_greeting"}
        discovered_names = {t.name for t in tools}
        assert len(tools) == 3, f"Expected 3 tools, got {len(tools)}: {discovered_names}"
        assert discovered_names == expected_tools

        for tool in tools:
            assert tool.provider_id == provider_id
            assert tool.status == ToolStatus.AVAILABLE
            assert tool.last_refreshed_at is not None
            assert tool.description is not None
            assert len(tool.description) > 0

        # Verify tool detail endpoint
        sum_tool = next(t for t in tools if t.name == "calculate_sum")
        nexus_api.tool_manager.get_tool(tool_id=sum_tool.id).assert_and_get()

    @pytest.mark.mcp
    def test_tool_parameters_persistence(self, nexus_api: NexusApiRegistry, mcp_provider_id: str) -> None:
        """Test that MCP tool parameters are properly persisted to database."""
        provider_id = UUID(mcp_provider_id)

        tools_list = nexus_api.tool_manager.get_tools(
            additional_params={"provider_id[eq]": mcp_provider_id}
        ).assert_and_get()
        tools = tools_list.resources
        assert len(tools) == 3

        sum_tool = next((t for t in tools if t.name == "calculate_sum"), None)
        assert sum_tool is not None

        tool_detail = nexus_api.tool_manager.get_tool(tool_id=sum_tool.id).assert_and_get()
        assert tool_detail.provider_id == provider_id
        assert tool_detail.name == "calculate_sum"
        assert tool_detail.description is not None

    @pytest.mark.mcp
    def test_mcp_provider_connection_failure_handling(self, nexus_api: NexusApiRegistry) -> None:
        """Test MCP provider creation with unreachable server."""
        create_resp = _retry_api_call(
            lambda: nexus_api.tool_manager.register_tool_provider(
                body=ToolProviderCreate(
                    name=unique_name("test-mcp-unreachable"),
                    description="Test MCP provider with unreachable server",
                    configuration=MCPConfiguration(base_url="http://localhost:9999/nonexistent", api_key="test-key"),
                ),
            )
        )
        provider = create_resp.assert_and_get()
        provider_id = provider.id
        assert provider.status == ProviderStatus.VALIDATING

        validate_result = _validate_provider(nexus_api, provider_id).assert_and_get()
        assert validate_result.valid is False
        assert "All connection attempts failed" in validate_result.error

        _wait_for_provider_status(nexus_api, provider_id, ProviderStatus.ERROR)

        provider_after = nexus_api.tool_manager.get_tool_provider(provider_id=provider_id).assert_and_get()
        assert provider_after.validation_error is not None

        tools_list = nexus_api.tool_manager.get_tools(
            additional_params={"provider_id[eq]": str(provider_id)}
        ).assert_and_get()
        assert len(tools_list.resources) == 0

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_connection_failure_unauthorized(self, nexus_api: NexusApiRegistry) -> None:
        """Test MCP provider validation fails when the server requires auth."""
        from fastmcp.server.auth import StaticTokenVerifier

        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="0.0.0.0", auth=StaticTokenVerifier(tokens={"an-api-key": {}}))  # noqa: S104

        async with test_server.running():
            provider_url = f"http://host.containers.internal:{test_server.port}/mcp"

            create_resp = _retry_api_call(
                lambda: nexus_api.tool_manager.register_tool_provider(
                    body=ToolProviderCreate(
                        name=unique_name("test-mcp-unauthorised"),
                        description="Test MCP provider with unauthorised user",
                        configuration=MCPConfiguration(base_url=provider_url, api_key=None),
                    ),
                )
            )
            provider = create_resp.assert_and_get()
            provider_id = provider.id
            assert provider.status == ProviderStatus.VALIDATING

            validate_result = _validate_provider(nexus_api, provider_id).assert_and_get()
            assert validate_result.valid is False

            _wait_for_provider_status(nexus_api, provider_id, ProviderStatus.ERROR)

            tools_list = nexus_api.tool_manager.get_tools(
                additional_params={"provider_id[eq]": str(provider_id)}
            ).assert_and_get()
            assert len(tools_list.resources) == 0

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_connection_failure_forbidden(self, nexus_api: NexusApiRegistry) -> None:
        """Test MCP provider validation fails when the server returns 403."""
        from tests.fixtures.example_mcp_server import ForbiddenMCPServer

        test_server = ForbiddenMCPServer(host="0.0.0.0")  # noqa: S104

        async with test_server.running():
            provider_url = f"http://host.containers.internal:{test_server.port}/mcp"

            create_resp = _retry_api_call(
                lambda: nexus_api.tool_manager.register_tool_provider(
                    body=ToolProviderCreate(
                        name=unique_name("test-mcp-forbidden"),
                        description="Test MCP provider with forbidden user",
                        configuration=MCPConfiguration(base_url=provider_url),
                    ),
                )
            )
            provider = create_resp.assert_and_get()
            provider_id = provider.id
            assert provider.status == ProviderStatus.VALIDATING

            validate_result = _validate_provider(nexus_api, provider_id).assert_and_get()
            assert validate_result.valid is False

            _wait_for_provider_status(nexus_api, provider_id, ProviderStatus.ERROR)

            tools_list = nexus_api.tool_manager.get_tools(
                additional_params={"provider_id[eq]": str(provider_id)}
            ).assert_and_get()
            assert len(tools_list.resources) == 0
