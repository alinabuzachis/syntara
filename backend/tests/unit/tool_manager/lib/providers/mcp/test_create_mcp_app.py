"""Unit tests for the create_mcp_app factory function."""

from typing import Any

import pytest
from orchestrator_test_sdk.app.mcp_servers import ExampleMCPServer, create_mcp_app


def _custom_tool(x: int, y: int) -> dict[str, Any]:
    """A custom tool for testing."""
    return {"result": x + y}


def _another_tool(name: str) -> str:
    """Another custom tool for testing."""
    return f"hello {name}"


async def _tool_names(server: ExampleMCPServer) -> list[str]:
    tools = await server.mcp_app.local_provider.list_tools()
    return [t.name for t in tools]


class TestCreateMcpApp:
    """Tests for create_mcp_app factory."""

    def test_returns_example_mcp_server(self) -> None:
        server = create_mcp_app([_custom_tool])
        assert isinstance(server, ExampleMCPServer)

    @pytest.mark.asyncio
    async def test_registers_custom_tools(self) -> None:
        server = create_mcp_app([_custom_tool, _another_tool])
        names = await _tool_names(server)
        assert "_custom_tool" in names
        assert "_another_tool" in names

    @pytest.mark.asyncio
    async def test_preserves_builtin_tools(self) -> None:
        server = create_mcp_app([_custom_tool])
        names = await _tool_names(server)
        assert "calculate_sum" in names
        assert "calculate_product" in names
        assert "get_greeting" in names

    def test_passes_host_and_port(self) -> None:
        server = create_mcp_app([_custom_tool], host="0.0.0.0", port=9999)  # noqa: S104
        assert server.host == "0.0.0.0"  # noqa: S104
        assert server.port == 9999

    @pytest.mark.asyncio
    async def test_empty_tools_list_keeps_builtins(self) -> None:
        server = create_mcp_app([])
        names = await _tool_names(server)
        assert "calculate_sum" in names
        assert len(names) >= 3

    @pytest.mark.asyncio
    async def test_server_starts_with_custom_tools(self) -> None:
        server = create_mcp_app([_custom_tool], port=0)
        try:
            await server.start()
            assert server.port != 0
            assert server.base_url.endswith("/mcp")
        finally:
            await server.stop()
