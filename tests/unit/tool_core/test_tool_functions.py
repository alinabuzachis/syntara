"""Tests for core tool management functions."""

from datetime import UTC, datetime
from uuid import uuid4

import pytest

from nexus.tool_manager.lib.tool_core import (
    FilterParam,
    Provider,
    ProviderNotFoundError,
    Tool,
    ToolNotFoundError,
    ToolParameter,
    bulk_update_tools,
    get_tool_detail,
    list_tools,
    refresh_tools,
    update_tool_enabled,
    validate_tool,
)
from tests.fixtures.mock_provider import MockProvider
from tests.fixtures.mock_provider_repository import MockProviderRepository
from tests.fixtures.mock_tool_repository import MockToolRepository

# Test constants
TOOL_COUNT_3 = 3
TEST_LIST_COUNT_2 = 2
RESPONSE_DELAY_MS = 50
DURATION_MS_1500 = 1500
DURATION_MS_2000 = 2000
MIN_DURATION_MS = 40
MAX_DURATION_VARIANCE_MS = 100
MILLISECONDS_CONVERSION_FACTOR = 1000
FIRST_PARAMETER_INDEX = 0
UPDATE_COUNT_ZERO = 0
UPDATE_COUNT_ONE = 1
PARAMETER_COUNT_1 = 1
RESULT_COUNT_GREATER_THAN_ZERO = 0
RESULT_COUNT_GREATER_OR_EQUAL_ONE = 1


class TestRefreshTools:
    """Test cases for refresh_tools function."""

    @pytest.mark.asyncio
    async def test_refresh_tools_success(self) -> None:
        """Test successful tool refresh from provider."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()
        adapter = MockProvider(provider_name="test_provider")

        # Create test provider
        provider = Provider(
            name="test_provider",
            provider_type="mock",
            configuration={"url": "http://localhost"},
        )
        created_provider = await provider_repo.create(provider)

        # Refresh tools
        result = await refresh_tools(created_provider.id, provider_repo, tool_repo, adapter)

        assert result.refreshed_count is not None
        assert result.updated_count is not None
        assert result.disabled_count is not None
        assert result.refreshed_at is not None

        # Should have created new tools
        assert result.refreshed_count > RESULT_COUNT_GREATER_THAN_ZERO
        assert result.updated_count == UPDATE_COUNT_ZERO  # No existing tools to update

        # Verify tools were added to repository
        tools_result = await tool_repo.list_tools()
        assert len(tools_result.items) == result.refreshed_count

        # Verify namespaced names are set correctly
        for tool in tools_result.items:
            assert tool.namespaced_name.startswith("test_provider::")
            assert tool.provider_id == created_provider.id

    @pytest.mark.asyncio
    async def test_refresh_tools_updates_existing(self) -> None:
        """Test refreshing tools updates existing tools."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()
        adapter = MockProvider(provider_name="update_provider")

        # Create test provider
        provider = Provider(name="update_provider", provider_type="mock")
        created_provider = await provider_repo.create(provider)

        # Create existing tool
        existing_tool = Tool(
            provider_id=created_provider.id,
            name="echo_tool",
            namespaced_name="update_provider::echo_tool",
            description="Old description",
            input_schema={"old": "schema"},
        )
        await tool_repo.create(existing_tool)

        # Refresh tools (should update existing tool)
        result = await refresh_tools(created_provider.id, provider_repo, tool_repo, adapter)

        # Should have updated existing tools and created new ones
        assert result.updated_count >= RESULT_COUNT_GREATER_OR_EQUAL_ONE
        assert result.refreshed_count >= RESULT_COUNT_GREATER_THAN_ZERO

        # Verify existing tool was updated
        updated_tool = await tool_repo.get_by_namespaced_name("update_provider::echo_tool")
        assert updated_tool is not None
        assert updated_tool.description != "Old description"  # Should be updated
        assert updated_tool.input_schema != {"old": "schema"}

    @pytest.mark.asyncio
    async def test_refresh_tools_provider_not_found(self) -> None:
        """Test refreshing tools for non-existent provider."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()
        adapter = MockProvider()
        non_existent_id = uuid4()
        expected_msg = f"Provider with ID '{non_existent_id}' not found"

        with pytest.raises(ProviderNotFoundError, match=expected_msg):
            await refresh_tools(non_existent_id, provider_repo, tool_repo, adapter)

    @pytest.mark.asyncio
    async def test_refresh_tools_adapter_error(self) -> None:
        """Test refresh tools handles adapter errors."""
        provider_repo = MockProviderRepository()
        tool_repo = MockToolRepository()
        adapter = MockProvider()
        adapter.set_error_simulation(connection_error=True)

        # Create test provider
        provider = Provider(name="error_provider", provider_type="mock")
        created_provider = await provider_repo.create(provider)

        # Refresh should propagate the connection error
        with pytest.raises(ConnectionError):
            await refresh_tools(created_provider.id, provider_repo, tool_repo, adapter)


class TestListTools:
    """Test cases for list_tools function."""

    @pytest.mark.asyncio
    async def test_list_tools_empty(self) -> None:
        """Test listing tools when none exist."""
        tool_repo = MockToolRepository()

        result = await list_tools(tool_repo=tool_repo)

        assert result.items == []
        assert result.has_more is False

    @pytest.mark.asyncio
    async def test_list_tools_with_data(self) -> None:
        """Test listing tools with existing data."""
        tool_repo = MockToolRepository()

        # Add test tools
        for i in range(TOOL_COUNT_3):
            await tool_repo.create(
                Tool(
                    name=f"tool_{i}",
                    namespaced_name=f"provider::tool_{i}",
                    description=f"Tool {i}",
                    enabled=i % TEST_LIST_COUNT_2 == 0,  # Alternate enabled status
                )
            )

        result = await list_tools(tool_repo=tool_repo)

        assert len(result.items) == TOOL_COUNT_3
        assert all(isinstance(tool, Tool) for tool in result.items)

    @pytest.mark.asyncio
    async def test_list_tools_with_filters(self) -> None:
        """Test listing tools with filters."""
        tool_repo = MockToolRepository()

        # Add test tools with different properties
        await tool_repo.create(Tool(name="enabled_tool", namespaced_name="enabled_tool", enabled=True))
        await tool_repo.create(Tool(name="disabled_tool", namespaced_name="disabled_tool", enabled=False))
        await tool_repo.create(Tool(name="search_tool", namespaced_name="search_tool", enabled=True))

        # Filter by enabled status
        filters = [FilterParam(field="enabled", operator="eq", value=True)]
        result = await list_tools(filters=filters, tool_repo=tool_repo)

        assert len(result.items) == TEST_LIST_COUNT_2
        assert all(tool.enabled for tool in result.items)

    @pytest.mark.asyncio
    async def test_list_tools_no_repo_error(self) -> None:
        """Test listing tools without repo parameter raises error."""
        with pytest.raises(ValueError, match="tool_repo parameter is required"):
            await list_tools()


class TestGetToolDetail:
    """Test cases for get_tool_detail function."""

    @pytest.mark.asyncio
    async def test_get_tool_detail_success(self) -> None:
        """Test successful tool detail retrieval."""
        tool_repo = MockToolRepository()

        # Create test tool
        tool = Tool(
            name="detailed_tool",
            namespaced_name="provider::detailed_tool",
            description="Tool with details",
            input_schema={"type": "object", "properties": {"input": {"type": "string"}}},
            parameters=[ToolParameter("input", "string", "Input parameter", required=True)],
        )
        created_tool = await tool_repo.create(tool)

        # Get tool detail
        result = await get_tool_detail(created_tool.id, tool_repo)

        assert result.id == created_tool.id
        assert result.name == "detailed_tool"
        assert result.description == "Tool with details"
        assert len(result.parameters) == PARAMETER_COUNT_1
        assert result.parameters[FIRST_PARAMETER_INDEX].name == "input"

    @pytest.mark.asyncio
    async def test_get_tool_detail_not_found(self) -> None:
        """Test getting tool detail for non-existent tool."""
        tool_repo = MockToolRepository()
        non_existent_id = uuid4()
        expected_msg = f"Tool with ID '{non_existent_id}' not found"

        with pytest.raises(ToolNotFoundError, match=expected_msg):
            await get_tool_detail(non_existent_id, tool_repo)


class TestUpdateToolEnabled:
    """Test cases for update_tool_enabled function."""

    @pytest.mark.asyncio
    async def test_update_tool_enabled_success(self) -> None:
        """Test successful tool enabled status update."""
        tool_repo = MockToolRepository()

        # Create test tool (enabled by default)
        tool = Tool(name="toggle_tool", enabled=True)
        created_tool = await tool_repo.create(tool)

        # Disable tool
        updated_tool = await update_tool_enabled(created_tool.id, enabled=False, tool_repo=tool_repo)

        assert updated_tool.id == created_tool.id
        assert updated_tool.enabled is False
        assert updated_tool.updated_at > created_tool.updated_at

        # Re-enable tool
        re_enabled_tool = await update_tool_enabled(created_tool.id, enabled=True, tool_repo=tool_repo)

        assert re_enabled_tool.enabled is True
        assert re_enabled_tool.updated_at > updated_tool.updated_at

    @pytest.mark.asyncio
    async def test_update_tool_enabled_not_found(self) -> None:
        """Test updating enabled status for non-existent tool."""
        tool_repo = MockToolRepository()
        non_existent_id = uuid4()
        expected_msg = f"Tool with ID '{non_existent_id}' not found"

        with pytest.raises(ToolNotFoundError, match=expected_msg):
            await update_tool_enabled(non_existent_id, enabled=False, tool_repo=tool_repo)


class TestBulkUpdateTools:
    """Test cases for bulk_update_tools function."""

    @pytest.mark.asyncio
    async def test_bulk_update_tools_success(self) -> None:
        """Test successful bulk tool update."""
        tool_repo = MockToolRepository()

        # Create test tools
        tool_ids = []
        tool: Tool | None = None
        for i in range(TOOL_COUNT_3):
            tool = Tool(name=f"bulk_tool_{i}", namespaced_name=f"bulk_tool_{i}", enabled=True)
            created_tool = await tool_repo.create(tool)
            tool_ids.append(created_tool.id)

        # Bulk disable tools
        result = await bulk_update_tools(tool_ids, enabled=False, tool_repo=tool_repo)

        assert result.updated_count == TOOL_COUNT_3
        assert result.requested_count == TOOL_COUNT_3
        assert result.success is True

        # Verify all tools were disabled
        for tool_id in tool_ids:
            tool = await tool_repo.get_by_id(tool_id)
            assert tool is not None
            assert tool.enabled is False

    @pytest.mark.asyncio
    async def test_bulk_update_tools_partial_success(self) -> None:
        """Test bulk tool update with some non-existent tools."""
        tool_repo = MockToolRepository()

        # Create one real tool
        tool = Tool(name="real_tool", enabled=True)
        created_tool = await tool_repo.create(tool)

        # Mix real and non-existent tool IDs
        tool_ids = [created_tool.id, uuid4(), uuid4()]

        result = await bulk_update_tools(tool_ids, enabled=False, tool_repo=tool_repo)

        assert result.updated_count == UPDATE_COUNT_ONE  # Only real tool updated
        assert result.requested_count == TOOL_COUNT_3
        assert result.success is False

    @pytest.mark.asyncio
    async def test_bulk_update_tools_empty_list(self) -> None:
        """Test bulk tool update with empty tool list."""
        tool_repo = MockToolRepository()

        result = await bulk_update_tools([], enabled=True, tool_repo=tool_repo)

        assert result.updated_count == UPDATE_COUNT_ZERO
        assert result.requested_count == UPDATE_COUNT_ZERO
        assert result.success is True


class TestValidateTool:
    """Test cases for validate_tool function."""

    @pytest.mark.asyncio
    async def test_validate_tool_success(self) -> None:
        """Test successful tool validation."""
        tool_repo = MockToolRepository()
        adapter = MockProvider()

        # Create test tool
        tool = Tool(
            name="echo_tool",
            namespaced_name="provider::echo_tool",
            description="Echo tool for testing",
        )
        created_tool = await tool_repo.create(tool)

        # Validate tool
        test_params = {"message": "Hello, World!"}
        result = await validate_tool(created_tool.id, test_params, tool_repo, adapter)

        assert result.success is True
        assert result.status == "success"
        assert result.duration_ms is not None
        assert result.validated_at is not None
        assert result.validation_output is not None
        assert isinstance(result.duration_ms, int)
        assert result.duration_ms >= RESULT_COUNT_GREATER_THAN_ZERO

    @pytest.mark.asyncio
    async def test_validate_tool_with_no_parameters(self) -> None:
        """Test tool validation with no parameters."""
        tool_repo = MockToolRepository()
        adapter = MockProvider()

        # Create test tool
        tool = Tool(name="random_number", namespaced_name="provider::random_number")
        created_tool = await tool_repo.create(tool)

        # Validate tool without parameters
        result = await validate_tool(created_tool.id, None, tool_repo, adapter)

        assert result.success is True
        assert result.validation_output is not None

    @pytest.mark.asyncio
    async def test_validate_tool_not_found(self) -> None:
        """Test validating non-existent tool."""
        tool_repo = MockToolRepository()
        adapter = MockProvider()
        non_existent_id = uuid4()
        expected_msg = f"Tool with ID '{non_existent_id}' not found"

        with pytest.raises(ToolNotFoundError, match=expected_msg):
            await validate_tool(non_existent_id, {}, tool_repo, adapter)

    @pytest.mark.asyncio
    async def test_validate_tool_adapter_error(self) -> None:
        """Test tool validation with adapter error."""
        tool_repo = MockToolRepository()
        adapter = MockProvider()
        adapter.set_error_simulation(timeout=True)

        # Create test tool
        tool = Tool(name="failing_tool")
        created_tool = await tool_repo.create(tool)

        # Validate tool (should handle error gracefully)
        result = await validate_tool(created_tool.id, {}, tool_repo, adapter)

        assert result.success is False
        assert result.status == "failure"
        assert result.duration_ms is not None
        assert result.message is not None
        assert result.validated_at is not None

    @pytest.mark.asyncio
    async def test_validate_tool_measures_duration(self) -> None:
        """Test that tool validation measures duration correctly."""
        tool_repo = MockToolRepository()
        adapter = MockProvider(response_delay_ms=RESPONSE_DELAY_MS)  # 50ms delay

        # Create test tool
        tool = Tool(name="slow_tool")
        created_tool = await tool_repo.create(tool)

        # Validate tool and measure duration
        start_time = datetime.now(UTC)
        result = await validate_tool(created_tool.id, {}, tool_repo, adapter)
        end_time = datetime.now(UTC)

        actual_duration = int((end_time - start_time).total_seconds() * MILLISECONDS_CONVERSION_FACTOR)
        reported_duration = result.duration_ms

        # Duration should be approximately correct (allow some variance)
        assert reported_duration >= MIN_DURATION_MS  # At least 40ms (allowing for variance)
        assert abs(reported_duration - actual_duration) < MAX_DURATION_VARIANCE_MS  # Within 100ms of actual
