"""Unit tests for tool filtering functions.

Tests filtering LangChain BaseTools by Tool.enabled field and functions
for identifying missing and unregistered tools.
"""

from unittest.mock import Mock
from uuid import uuid4

from langchain_core.tools import BaseTool

from nexus.agent_orchestrator.tool_manager import tool_filtering
from nexus.agent_orchestrator.tool_manager.types import NamespacedBaseTool
from nexus.tool_manager.models.tool import ToolStatus, ToolWithParameters


class TestToolFiltering:
    """Test tool filtering by enabled status and synchronization logic."""

    def test_filter_base_tools_by_enabled_tools(
        self, mock_namespaced_tools: list[NamespacedBaseTool], sample_tools: list[ToolWithParameters]
    ) -> None:
        """Test filtering LangChain BaseTools by enabled ToolWithParameters using namespaced_name."""
        filtered_tools = tool_filtering.filter_base_tools_by_enabled(
            namespaced_tools=mock_namespaced_tools, enabled_tools=sample_tools
        )

        # Should only return BaseTools that match enabled ToolWithParameters
        assert len(filtered_tools) == 2
        assert filtered_tools[0].name == "code_search"
        assert filtered_tools[1].name == "file_read"

    def test_identify_missing_tools_in_mcp(
        self, mock_namespaced_tools: list[NamespacedBaseTool], sample_tools: list[ToolWithParameters]
    ) -> None:
        """Test identifying ToolWithParameters that are missing from MCP server BaseTools."""
        missing_tools = tool_filtering.identify_missing_tools(
            namespaced_tools=mock_namespaced_tools, enabled_tools=sample_tools
        )

        # Should identify missing tool and disabled tool from MCP
        assert len(missing_tools) == 2
        missing_names = [t.namespaced_name for t in missing_tools]
        assert "dev_tools::missing_tool" in missing_names
        assert "dev_tools::disabled_tool" in missing_names

    def test_identify_unregistered_tools_in_mcp(
        self, mock_namespaced_tools: list[NamespacedBaseTool], sample_tools: list[ToolWithParameters]
    ) -> None:
        """Test identifying BaseTools that are not registered in Tool Manager."""
        unregistered_tools = tool_filtering.identify_unregistered_tools(
            namespaced_tools=mock_namespaced_tools, enabled_tools=sample_tools
        )

        # Should identify unregistered tools (build_project and unregistered_tool)
        assert len(unregistered_tools) == 2
        unregistered_names = [t.name for t in unregistered_tools]
        assert "build_project" in unregistered_names
        assert "unregistered_tool" in unregistered_names

    def test_filter_preserves_base_tool_objects(
        self, mock_namespaced_tools: list[NamespacedBaseTool], sample_tools: list[ToolWithParameters]
    ) -> None:
        """Test that filtering returns original BaseTool objects, not copies."""
        filtered_tools = tool_filtering.filter_base_tools_by_enabled(
            namespaced_tools=mock_namespaced_tools, enabled_tools=sample_tools
        )

        # Should be original objects, not copies
        original_tools = [tool for _, tool in mock_namespaced_tools]
        for i, filtered_tool in enumerate(filtered_tools):
            assert filtered_tool in original_tools
            assert isinstance(filtered_tool, type(original_tools[i]))

    def test_empty_lists_handling(self) -> None:
        """Test handling of empty tool lists."""
        # Test empty NamespacedTools
        result1 = tool_filtering.filter_base_tools_by_enabled(namespaced_tools=[], enabled_tools=[])
        assert result1 == []

        # Test empty enabled tools
        dummy_tool = Mock(spec=BaseTool)
        dummy_tool.name = "test_tool"
        dummy_namespaced_tool = ("test::test_tool", dummy_tool)

        result2 = tool_filtering.filter_base_tools_by_enabled(
            namespaced_tools=[dummy_namespaced_tool], enabled_tools=[]
        )
        assert result2 == []

    def test_identify_re_enableable_tools_respects_manual_vs_automatic_disable(self) -> None:
        """Test critical distinction: only re-enable automatically disabled tools (MISSING), not manual (AVAILABLE)."""
        # Create mock MCP tools that are available
        available_tool_1 = Mock(spec=BaseTool)
        available_tool_1.name = "tool_1"
        available_tool_2 = Mock(spec=BaseTool)
        available_tool_2.name = "tool_2"

        namespaced_tools: list[tuple[str, BaseTool]] = [
            ("provider::tool_1", available_tool_1),
            ("provider::tool_2", available_tool_2),
        ]

        # Create disabled tools with different scenarios
        user_id = uuid4()
        disabled_tools = [
            # Tool 1: Manually disabled by user (enabled=False, status=AVAILABLE)
            # This should NOT be re-enabled automatically
            ToolWithParameters(
                id=uuid4(),
                name="tool_1",
                namespaced_name="provider::tool_1",
                description="Manually disabled tool",
                provider_id=uuid4(),
                enabled=False,  # User disabled
                status=ToolStatus.AVAILABLE,  # Manual disable (status remains AVAILABLE)
                parameters=[],
                created_by=user_id,
            ),
            # Tool 2: Automatically disabled by system (enabled=False, status=MISSING)
            # This SHOULD be re-enabled automatically
            ToolWithParameters(
                id=uuid4(),
                name="tool_2",
                namespaced_name="provider::tool_2",
                description="Automatically disabled tool",
                provider_id=uuid4(),
                enabled=False,  # System disabled
                status=ToolStatus.MISSING,  # Automatic disable (marked as MISSING)
                parameters=[],
                created_by=user_id,
            ),
        ]

        # Test the function
        re_enableable_tools = tool_filtering.identify_re_enableable_tools(
            namespaced_tools=namespaced_tools, disabled_tools=disabled_tools
        )

        # Critical assertion: Only the automatically disabled tool should be re-enabled
        assert len(re_enableable_tools) == 1
        assert re_enableable_tools[0].name == "tool_2"
        assert re_enableable_tools[0].status == ToolStatus.MISSING

        # Verify the manually disabled tool is NOT included
        re_enabled_names = [tool.name for tool in re_enableable_tools]
        assert "tool_1" not in re_enabled_names
