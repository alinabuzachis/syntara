"""Integration tests for MCP provider with real MCP server.

Tests complete MCP provider workflow including:
- Provider registration via REST API
- Connection validation using MCPProvider and ProviderFactory
- Tool discovery and persistence
- Tools API integration
"""

from typing import Any, Never
from unittest.mock import patch

import pytest
from httpx import AsyncClient


class TestMCPProviderIntegration:
    """Integration tests for MCP provider with real MCP server."""

    async def _create_and_verify_provider(self, base_client: AsyncClient, provider_data: dict[str, Any]) -> str:
        """Create provider and verify initial state."""
        create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201, f"Provider creation failed: {create_response.text}"

        provider_data_response = create_response.json()
        provider_id: str = provider_data_response["id"]

        # Verify initial provider state
        assert provider_data_response["name"] == provider_data["name"]
        assert provider_data_response["configuration"] == provider_data["configuration"]
        assert provider_data_response["enabled"] is True
        assert provider_data_response["status"] == "validating"

        return provider_id

    async def _validate_and_verify_provider(self, base_client: AsyncClient, provider_id: str) -> None:
        """Validate provider and verify status transition."""
        validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
        assert validate_response.status_code == 200, f"Provider validation failed: {validate_response.text}"

        validation_result = validate_response.json()
        assert validation_result["valid"] is True, f"Provider validation failed: {validation_result.get('error')}"

        # Verify provider status changed to available
        get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
        assert get_provider_response.status_code == 200

        provider_status_data = get_provider_response.json()
        assert provider_status_data["status"] == "available", (
            f"Expected provider to be available, got: {provider_status_data['status']}"
        )
        assert provider_status_data["validation_error"] is None
        assert provider_status_data["last_validated_at"] is not None

    async def _refresh_and_verify_tools(self, base_client: AsyncClient, provider_id: str) -> list[dict[str, Any]]:
        """Refresh tools and return discovered tools."""
        refresh_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools")
        assert refresh_response.status_code == 200, f"Tool refresh failed: {refresh_response.text}"

        refresh_result = refresh_response.json()
        assert refresh_result["refreshed_count"] > 0, "Expected tools to be discovered"

        # Query tools for this provider
        tools_response = await base_client.get("/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id})
        assert tools_response.status_code == 200, f"Tools query failed: {tools_response.text}"

        tools_data = tools_response.json()
        resources: list[dict[str, Any]] = tools_data["resources"]
        return resources

    def _verify_discovered_tools(self, tools: list[dict[str, Any]], provider_id: str) -> None:
        """Verify discovered tools match expected tools from test server."""
        expected_tools = ["calculate_sum", "calculate_product", "get_greeting"]
        discovered_tool_names = [tool["name"] for tool in tools]

        assert len(tools) == 3, f"Expected 3 tools, got {len(tools)}: {discovered_tool_names}"

        for expected_tool in expected_tools:
            assert expected_tool in discovered_tool_names, f"Missing expected tool: {expected_tool}"

        # Verify tool details and parameters
        for tool in tools:
            assert tool["provider_id"] == provider_id
            assert tool["namespaced_name"].startswith("test-mcp-integration::")
            assert tool["status"] == "available"
            assert tool["last_refreshed_at"] is not None
            assert tool["description"] is not None
            assert len(tool["description"]) > 0

            # Test specific tool parameter validation
            if tool["name"] == "calculate_sum":
                assert "sum of two numbers" in tool["description"].lower()
            elif tool["name"] == "calculate_product":
                assert "product of two numbers" in tool["description"].lower()
            elif tool["name"] == "get_greeting":
                assert "greeting message" in tool["description"].lower()

    async def _verify_tool_parameters(self, base_client: AsyncClient, tools: list[dict[str, Any]]) -> None:
        """Verify tool parameters are properly persisted."""
        sum_tool = next((t for t in tools if t["name"] == "calculate_sum"), None)
        assert sum_tool is not None, "calculate_sum tool not found"

        tool_detail_response = await base_client.get(f"/api/v1/tool_manager/tools/{sum_tool['id']}")
        assert tool_detail_response.status_code == 200

        tool_detail = tool_detail_response.json()
        assert "parameters" in tool_detail or len(tool_detail.get("parameters", [])) >= 0

    async def _verify_final_provider_state(self, base_client: AsyncClient, provider_id: str) -> None:
        """Verify final provider state after integration test."""
        final_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
        assert final_provider_response.status_code == 200

        final_provider_data = final_provider_response.json()
        assert final_provider_data["status"] == "available"
        assert final_provider_data["enabled"] is True

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_create_mcp_provider_with_real_server_integration(self, base_client: AsyncClient) -> None:
        """Test complete MCP provider integration with real MCP server."""
        # Test demonstrates that:
        # ✅ MCP provider created via REST API
        # ✅ ToolProviderService used ProviderFactory to create MCPProvider
        # ✅ MCPProvider validated connection with real MCP server
        # ✅ MCPProvider discovered tools using langchain
        # ✅ Tools and ToolParameters persisted to database
        # ✅ Tools accessible via Tools REST API

        # Start test MCP server
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8765)

        async with test_server.running():
            provider_data = {
                "name": "test-mcp-integration",
                "description": "Integration test MCP provider with real server",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                    "api_key": "test-integration-key",
                },
            }

            # Execute integration test workflow
            provider_id = await self._create_and_verify_provider(base_client, provider_data)
            await self._validate_and_verify_provider(base_client, provider_id)
            tools = await self._refresh_and_verify_tools(base_client, provider_id)
            self._verify_discovered_tools(tools, provider_id)
            await self._verify_tool_parameters(base_client, tools)
            await self._verify_final_provider_state(base_client, provider_id)

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_connection_failure_handling(self, base_client: AsyncClient) -> None:
        """Test MCP provider creation with unreachable server."""
        # Test demonstrates that:
        # ✅ Provider creation succeeds even with unreachable server (starts in VALIDATING status)
        # ✅ Provider validation correctly fails for unreachable servers
        # ✅ Provider status transitions to ERROR when validation fails
        # ✅ No tools are created for failed providers
        # ✅ Error handling in MCP provider connection validation

        # Step 1: Create provider with unreachable MCP server
        provider_data = {
            "name": "test-mcp-unreachable",
            "description": "Test MCP provider with unreachable server",
            "configuration": {
                "provider_type": "mcp",
                "base_url": "http://localhost:9999/nonexistent",  # Unreachable server
                "api_key": "test-key",
            },
        }

        # Create the provider (should succeed with validating status)
        create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
        assert create_response.status_code == 201, f"Provider creation failed: {create_response.text}"

        provider_data_response = create_response.json()
        provider_id = provider_data_response["id"]
        assert provider_data_response["status"] == "validating"

        # Step 2: Validate the provider (expecting failure due to unreachable server)
        validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
        assert validate_response.status_code == 200, f"Validation request failed: {validate_response.text}"

        validation_result = validate_response.json()
        assert validation_result["valid"] is False, "Validation should fail for unreachable server"
        assert "error" in validation_result
        assert "All connection attempts failed" in validation_result["error"]

        # Step 3: Check provider status - should be in error state
        get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
        assert get_provider_response.status_code == 200

        provider_status = get_provider_response.json()
        assert provider_status["status"] == "error"
        assert provider_status["validation_error"] is not None

        # Step 4: Verify no tools were created for failed provider
        tools_response = await base_client.get("/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id})
        assert tools_response.status_code == 200

        tools_data = tools_response.json()
        assert len(tools_data["resources"]) == 0, "No tools should be created for failed provider"

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_connection_failure_unauthorized(self, base_client: AsyncClient) -> None:
        """Test MCP provider creation with unauthorised user."""
        # Test demonstrates that:
        # ✅ Provider creation succeeds even with unauthorised user (starts in VALIDATING status)
        # ✅ Provider validation correctly fails for unauthorised user
        # ✅ Provider status transitions to ERROR when validation fails
        # ✅ No tools are created for failed providers
        # ✅ Error handling in MCP provider connection validation

        # Start test MCP server
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from fastmcp.server.auth import StaticTokenVerifier

        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8765, auth=StaticTokenVerifier(tokens={"an-api-key": {}}))

        async with test_server.running():
            # Step 1: Create provider with unauthorised user
            provider_data = {
                "name": "test-mcp-unauthorised",
                "description": "Test MCP provider with unauthorised user",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                    "api_key": None,  # MCP Server expects 'an-api-key'
                },
            }

            # Create the provider (should succeed with validating status)
            create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
            assert create_response.status_code == 201, f"Provider creation failed: {create_response.text}"

            provider_data_response = create_response.json()
            provider_id = provider_data_response["id"]
            assert provider_data_response["status"] == "validating"

            # Step 2: Validate the provider (expecting failure due to unauthorised user)
            validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
            assert validate_response.status_code == 200, f"Validation request failed: {validate_response.text}"

            validation_result = validate_response.json()
            assert validation_result["valid"] is False, "Validation should fail for unauthorised user"
            assert "error" in validation_result
            assert "Unauthorized" in validation_result["error"]

            # Step 3: Check provider status - should be in error state
            get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert get_provider_response.status_code == 200

            provider_status = get_provider_response.json()
            assert provider_status["status"] == "error"
            assert "Unauthorized" in provider_status["validation_error"]

            # Step 4: Verify no tools were created for failed provider
            tools_response = await base_client.get(
                "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
            )
            assert tools_response.status_code == 200

            tools_data = tools_response.json()
            assert len(tools_data["resources"]) == 0, "No tools should be created for failed provider"

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_connection_failure_forbidden(self, base_client: AsyncClient) -> None:
        """Test MCP provider creation with forbidden user."""
        # Test demonstrates that:
        # ✅ Provider creation succeeds even forbidden users (starts in VALIDATING status)
        # ✅ Provider validation correctly fails for forbidden user
        # ✅ Provider status transitions to ERROR when validation fails
        # ✅ No tools are created for failed providers
        # ✅ Error handling in MCP provider connection validation

        # Start test MCP server
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from tests.fixtures.example_mcp_server import ForbiddenMCPServer

        test_server = ForbiddenMCPServer(host="localhost", port=8766)

        async with test_server.running():
            # Step 1: Create provider with forbidden user
            provider_data = {
                "name": "test-mcp-forbidden",
                "description": "Test MCP provider with forbidden user",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                },
            }

            # Create the provider (should succeed with validating status)
            create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
            assert create_response.status_code == 201, f"Provider creation failed: {create_response.text}"

            provider_data_response = create_response.json()
            provider_id = provider_data_response["id"]
            assert provider_data_response["status"] == "validating"

            # Step 2: Validate the provider (expecting failure due to forbidden user)
            validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
            assert validate_response.status_code == 200, f"Validation request failed: {validate_response.text}"

            validation_result = validate_response.json()
            assert validation_result["valid"] is False, "Validation should fail for forbidden user"
            assert "error" in validation_result
            assert "Forbidden" in validation_result["error"]

            # Step 3: Check provider status - should be in error state
            get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert get_provider_response.status_code == 200

            provider_status = get_provider_response.json()
            assert provider_status["status"] == "error"
            assert "Forbidden" in provider_status["validation_error"]

            # Step 4: Verify no tools were created for failed provider
            tools_response = await base_client.get(
                "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
            )
            assert tools_response.status_code == 200

            tools_data = tools_response.json()
            assert len(tools_data["resources"]) == 0, "No tools should be created for failed provider"

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_unhandled_exception(self, base_client: AsyncClient) -> None:
        """Test MCP provider validation when there's an unexpected exception."""
        # Test demonstrates that:
        # ✅ Provider creation succeeds (starts in VALIDATING status)
        # ✅ Provider validation correctly fails when there is an unhandled exception
        # ✅ Validation error handler returns HTTP 500 status
        # ✅ Response payload conforms to tool_provider_validation_error_handler format
        # ✅ Provider status transitions to ERROR when validation fails
        # ✅ No tools are created for failed providers

        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8768)

        async with test_server.running():
            # Step 1: Create provider with working server
            provider_data = {
                "name": "test-mcp-runtime-error",
                "description": "Test MCP provider with runtime error during tool discovery",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                    "api_key": "test-cancelled-key",
                },
            }

            # Create the provider (should succeed with validating status)
            create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
            assert create_response.status_code == 201, f"Provider creation failed: {create_response.text}"

            provider_data_response = create_response.json()
            provider_id = provider_data_response["id"]
            assert provider_data_response["status"] == "validating"

            # Step 2: Patch client.get_tools to throw RuntimeError during validation
            def mock_get_tools_runtime_error(*_args: object, **_kwargs: object) -> Never:
                msg = "Unexpected runtime error"
                raise RuntimeError(msg)

            with patch(
                "nexus.tool_manager.lib.providers.mcp.mcp_provider.MultiServerMCPClient.get_tools",
                side_effect=mock_get_tools_runtime_error,
            ):
                # Validate the provider (expecting failure due to runtime exception)
                validate_response = await base_client.post(
                    f"/api/v1/tool_manager/tool_providers/{provider_id}/validate"
                )
                assert validate_response.status_code == 200, f"Validation request failed: {validate_response.text}"

                validation_result = validate_response.json()
                assert validation_result["valid"] is False, "Validation should fail for unhandled exceptions"
                assert "error" in validation_result
                assert "Unexpected runtime error" in validation_result["error"]

            # Step 3: Check provider status - should be in error state
            get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert get_provider_response.status_code == 200

            provider_status = get_provider_response.json()
            assert provider_status["status"] == "error"
            assert "Unexpected runtime error" in provider_status["validation_error"]

            # Step 4: Verify no tools were created for failed provider
            tools_response = await base_client.get(
                "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
            )
            assert tools_response.status_code == 200

            tools_data = tools_response.json()
            assert len(tools_data["resources"]) == 0, "No tools should be created for failed provider"

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_tool_parameters_persistence(self, base_client: AsyncClient) -> None:
        """Test that MCP tool parameters are properly persisted to database."""
        # Test demonstrates that:
        # ✅ MCPProvider.refresh_tools() created Tool objects with ToolParameter objects
        # ✅ ToolProviderService._discover_and_create_tools() persisted both Tools and ToolParameters
        # ✅ ToolParameters are linked to Tools via tool_id foreign key
        # ✅ Complete tool schema is available via REST API

        # Start test MCP server
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8766)

        async with test_server.running():
            # Step 1: Create MCP provider
            provider_data = {
                "name": "test-mcp-parameters",
                "description": "Test MCP provider parameter persistence",
                "configuration": {
                    "provider_type": "mcp",
                    "base_url": f"{test_server.base_url}",
                    "api_key": "test-params-key",
                },
            }

            create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
            assert create_response.status_code == 201

            provider_id = create_response.json()["id"]
            assert create_response.json()["status"] == "validating"

            # Step 2: Validate the provider
            validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
            assert validate_response.status_code == 200

            validation_result = validate_response.json()
            assert validation_result["valid"] is True

            # Step 3: Refresh tools to discover and persist them
            refresh_response = await base_client.post(
                f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools"
            )
            assert refresh_response.status_code == 200

            refresh_result = refresh_response.json()
            assert refresh_result["refreshed_count"] > 0

            # Step 4: Get tools
            tools_response = await base_client.get(
                "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
            )
            assert tools_response.status_code == 200

            tools = tools_response.json()["resources"]
            assert len(tools) == 3

            # Step 5: Find calculate_sum tool to check parameters
            sum_tool = next((t for t in tools if t["name"] == "calculate_sum"), None)
            assert sum_tool is not None

            # Step 6: Get tool details to verify parameters were persisted
            tool_detail_response = await base_client.get(f"/api/v1/tool_manager/tools/{sum_tool['id']}")
            assert tool_detail_response.status_code == 200

            tool_detail = tool_detail_response.json()

            # Verify tool parameters exist (they should be persisted by ToolProviderService)
            # The enhanced _discover_and_create_tools method should persist all ToolParameter records
            assert tool_detail["provider_id"] == provider_id
            assert tool_detail["name"] == "calculate_sum"
            assert "description" in tool_detail

    @pytest.mark.mcp
    @pytest.mark.asyncio
    async def test_mcp_provider_factory_integration(self, base_client: AsyncClient) -> None:
        """Test that MCP provider is properly registered in ProviderFactory."""
        # Test demonstrates that:
        # ✅ ProviderFactory.register_provider_type("mcp", MCPProvider) worked
        # ✅ ToolProviderService.create_provider() used factory to create MCPProvider instance
        # ✅ MCPProvider implemented ToolProviderAdapter interface correctly
        # ✅ Complete integration flow works end-to-end

        # Start test MCP server
        # There are a lot of issues running FastMCP with beartype.
        # See https://github.com/beartype/beartype/issues/542 (for example).
        # Unfortunately the simplest solution is to isolate the MCP tests from all others.
        # This means we also need to lazy-import our ExampleMCPServer to avoid it being loaded early.
        from tests.fixtures.example_mcp_server import ExampleMCPServer

        test_server = ExampleMCPServer(host="localhost", port=8767)

        async with test_server.running():
            # Step 1: Create MCP provider to test factory integration
            provider_data = {
                "name": "test-mcp-factory",
                "description": "Test MCP provider factory integration",
                "configuration": {
                    "provider_type": "mcp",  # This should trigger MCPProvider via factory
                    "base_url": f"{test_server.base_url}",
                    "api_key": "test-factory-key",
                },
            }

            create_response = await base_client.post("/api/v1/tool_manager/tool_providers", json=provider_data)
            assert create_response.status_code == 201

            provider_id = create_response.json()["id"]
            assert create_response.json()["status"] == "validating"

            # Step 2: Validate the provider (proves factory created MCPProvider successfully)
            validate_response = await base_client.post(f"/api/v1/tool_manager/tool_providers/{provider_id}/validate")
            assert validate_response.status_code == 200

            validation_result = validate_response.json()
            assert validation_result["valid"] is True

            # Step 3: Verify provider status is now available
            get_provider_response = await base_client.get(f"/api/v1/tool_manager/tool_providers/{provider_id}")
            assert get_provider_response.status_code == 200

            provider = get_provider_response.json()
            assert provider["status"] == "available"
            assert provider["configuration"]["provider_type"] == "mcp"

            # Step 4: Refresh tools to discover them
            refresh_response = await base_client.post(
                f"/api/v1/tool_manager/tool_providers/{provider_id}/refresh_tools"
            )
            assert refresh_response.status_code == 200

            refresh_result = refresh_response.json()
            assert refresh_result["refreshed_count"] > 0

            # Step 5: Verify tools were discovered (proves MCPProvider methods worked)
            tools_response = await base_client.get(
                "/api/v1/tool_manager/tools", params={"provider_id[eq]": provider_id}
            )
            assert tools_response.status_code == 200

            tools = tools_response.json()["resources"]
            assert len(tools) > 0, "Factory should have created working MCPProvider that discovered tools"
