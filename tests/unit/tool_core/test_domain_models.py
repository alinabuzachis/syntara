"""Tests for domain models and data structures."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest

from nexus_tool_manager.lib.tool_core import (
    FilterParam,
    PaginationParams,
    PaginationResult,
    Provider,
    ProviderStatus,
    Tool,
    ToolExecution,
    ToolExecutionStatus,
    ToolParameter,
    ValidationError,
)

# Test constants
DEFAULT_PAGINATION_LIMIT = 20
TEST_MAX_LENGTH_DEFAULT = 100
TEST_MAX_LENGTH_MIN = 1
TEST_MAX_LENGTH_MAX = 1000
TEST_TOOL_COUNT = 2
TEST_PORT_8080 = 8080
EXECUTION_DURATION_MS_1500 = 1500
EXECUTION_DURATION_MS_2000 = 2000
PAGINATION_LIMIT_50 = 50
MILLISECONDS_CONVERSION_FACTOR = 1000
FIRST_ITEM_INDEX = 0
FIRST_PARAMETER_INDEX = 0
PARAMETER_COUNT_1 = 1
ITEM_COUNT_2 = 2
DURATION_ZERO = 0


class TestToolParameter:
    """Test cases for ToolParameter model."""

    def test_tool_parameter_creation_required(self) -> None:
        """Test creating required tool parameter."""
        param = ToolParameter(
            name="input_text",
            type="string",
            description="Text input for processing",
            required=True,
        )

        assert param.name == "input_text"
        assert param.type == "string"
        assert param.description == "Text input for processing"
        assert param.required is True
        assert param.default is None
        assert param.constraints == {}

    def test_tool_parameter_creation_optional(self) -> None:
        """Test creating optional tool parameter with default value."""
        param = ToolParameter(
            name="max_length",
            type="integer",
            description="Maximum length of output",
            required=False,
            default=TEST_MAX_LENGTH_DEFAULT,
            constraints={"minimum": TEST_MAX_LENGTH_MIN, "maximum": TEST_MAX_LENGTH_MAX},
        )

        assert param.name == "max_length"
        assert param.required is False
        assert param.default == TEST_MAX_LENGTH_DEFAULT
        assert param.constraints == {"minimum": TEST_MAX_LENGTH_MIN, "maximum": TEST_MAX_LENGTH_MAX}

    def test_tool_parameter_to_dict(self) -> None:
        """Test converting parameter to dictionary."""
        param = ToolParameter(
            name="config",
            type="object",
            description="Configuration object",
            required=True,
            constraints={"properties": {"key": {"type": "string"}}},
        )

        result = param.to_dict()
        expected = {
            "name": "config",
            "type": "object",
            "description": "Configuration object",
            "required": True,
            "default": None,
            "constraints": {"properties": {"key": {"type": "string"}}},
        }

        assert result == expected


class TestTool:
    """Test cases for Tool domain model."""

    def test_tool_creation_minimal(self) -> None:
        """Test creating tool with minimal required fields."""
        tool = Tool(name="test_tool")

        assert isinstance(tool.id, UUID)
        assert tool.name == "test_tool"
        assert tool.namespaced_name == ""
        assert tool.description == ""
        assert tool.input_schema == {}
        assert tool.parameters == []
        assert tool.enabled is True
        assert isinstance(tool.created_at, datetime)
        assert isinstance(tool.updated_at, datetime)

    def test_tool_creation_complete(self) -> None:
        """Test creating tool with all fields."""
        tool_id = uuid4()
        provider_id = uuid4()
        created_time = datetime.now(UTC)

        parameters = [
            ToolParameter("input", "string", "Input text", required=True),
            ToolParameter("format", "string", "Output format", required=False, default="json"),
        ]

        tool = Tool(
            id=tool_id,
            provider_id=provider_id,
            name="text_processor",
            namespaced_name="ai_provider::text_processor",
            description="Process text using AI",
            input_schema={
                "type": "object",
                "properties": {
                    "input": {"type": "string"},
                    "format": {"type": "string", "default": "json"},
                },
                "required": ["input"],
            },
            parameters=parameters,
            enabled=False,
            created_at=created_time,
        )

        assert tool.id == tool_id
        assert tool.provider_id == provider_id
        assert tool.name == "text_processor"
        assert tool.namespaced_name == "ai_provider::text_processor"
        assert tool.enabled is False
        assert tool.created_at == created_time
        assert len(tool.parameters) == TEST_TOOL_COUNT
        assert tool.parameters[FIRST_PARAMETER_INDEX].name == "input"

    def test_tool_to_dict(self) -> None:
        """Test converting tool to dictionary."""
        tool = Tool(
            name="calculator",
            description="Basic calculator",
            parameters=[ToolParameter("a", "number", "First number", required=True)],
            enabled=True,
        )

        result = tool.to_dict()

        assert result["name"] == "calculator"
        assert result["description"] == "Basic calculator"
        assert result["enabled"] is True
        assert "id" in result
        assert "created_at" in result
        assert "updated_at" in result
        assert len(result["parameters"]) == PARAMETER_COUNT_1
        assert result["parameters"][FIRST_PARAMETER_INDEX]["name"] == "a"


class TestProvider:
    """Test cases for Provider domain model."""

    def test_provider_creation_minimal(self) -> None:
        """Test creating provider with minimal fields."""
        provider = Provider(name="test_provider")

        assert isinstance(provider.id, UUID)
        assert provider.name == "test_provider"
        assert provider.description == ""
        assert provider.provider_type == ""
        assert provider.configuration == {}
        assert provider.enabled is True
        assert provider.status == ProviderStatus.AVAILABLE
        assert provider.last_validated_at is None
        assert isinstance(provider.created_at, datetime)

    def test_provider_creation_complete(self) -> None:
        """Test creating provider with all fields."""
        provider_id = uuid4()
        validated_time = datetime.now(UTC)

        provider = Provider(
            id=provider_id,
            name="mcp_server",
            description="External MCP server",
            provider_type="mcp",
            configuration={
                "url": f"http://localhost:{TEST_PORT_8080}",
                "auth": {"type": "bearer", "token": "secret"},
            },
            enabled=False,
            status=ProviderStatus.VALIDATING,
            last_validated_at=validated_time,
        )

        assert provider.id == provider_id
        assert provider.name == "mcp_server"
        assert provider.provider_type == "mcp"
        assert provider.configuration["url"] == f"http://localhost:{TEST_PORT_8080}"
        assert provider.enabled is False
        assert provider.status == ProviderStatus.VALIDATING
        assert provider.last_validated_at == validated_time

    def test_provider_to_dict(self) -> None:
        """Test converting provider to dictionary."""
        provider = Provider(
            name="test_provider",
            provider_type="mock",
            status=ProviderStatus.ERROR,
        )

        result = provider.to_dict()

        assert result["name"] == "test_provider"
        assert result["provider_type"] == "mock"
        assert result["status"] == "error"
        assert result["enabled"] is True
        assert "id" in result
        assert "created_at" in result


class TestToolExecution:
    """Test cases for ToolExecution model."""

    def test_tool_execution_creation_minimal(self) -> None:
        """Test creating execution with minimal fields."""
        execution = ToolExecution()

        assert isinstance(execution.id, UUID)
        assert execution.tool_id is None
        assert execution.provider_id is None
        assert execution.user_id is None
        assert execution.status == ToolExecutionStatus.PENDING
        assert execution.duration_ms == DURATION_ZERO
        assert execution.input_data == {}
        assert execution.output_data == {}
        assert execution.error_message is None
        assert isinstance(execution.executed_at, datetime)

    def test_tool_execution_creation_complete(self) -> None:
        """Test creating execution with all fields."""
        execution_id = uuid4()
        tool_id = uuid4()
        provider_id = uuid4()
        user_id = uuid4()
        executed_time = datetime.now(UTC)

        execution = ToolExecution(
            id=execution_id,
            tool_id=tool_id,
            provider_id=provider_id,
            user_id=user_id,
            status=ToolExecutionStatus.SUCCESS,
            duration_ms=EXECUTION_DURATION_MS_1500,
            input_data={"message": "test"},
            output_data={"result": "processed"},
            executed_at=executed_time,
        )

        assert execution.id == execution_id
        assert execution.tool_id == tool_id
        assert execution.provider_id == provider_id
        assert execution.user_id == user_id
        assert execution.status == ToolExecutionStatus.SUCCESS
        assert execution.duration_ms == EXECUTION_DURATION_MS_1500
        assert execution.input_data == {"message": "test"}
        assert execution.output_data == {"result": "processed"}
        assert execution.executed_at == executed_time

    def test_tool_execution_to_dict(self) -> None:
        """Test converting execution to dictionary."""
        execution = ToolExecution(
            status=ToolExecutionStatus.FAILURE,
            duration_ms=EXECUTION_DURATION_MS_2000,
            error_message="Tool execution failed",
        )

        result = execution.to_dict()

        assert result["status"] == "failure"
        assert result["duration_ms"] == EXECUTION_DURATION_MS_2000
        assert result["error_message"] == "Tool execution failed"
        assert "id" in result
        assert "executed_at" in result


class TestPaginationParams:
    """Test cases for PaginationParams."""

    def test_pagination_params_defaults(self) -> None:
        """Test pagination parameters with defaults."""
        params = PaginationParams()

        assert params.limit == DEFAULT_PAGINATION_LIMIT
        assert params.cursor is None
        assert params.include_total is False

    def test_pagination_params_custom(self) -> None:
        """Test pagination parameters with custom values."""
        params = PaginationParams(
            limit=PAGINATION_LIMIT_50,
            cursor="abc123",
            include_total=True,
        )

        assert params.limit == PAGINATION_LIMIT_50
        assert params.cursor == "abc123"
        assert params.include_total is True


class TestFilterParam:
    """Test cases for FilterParam."""

    def test_filter_param_valid_operators(self) -> None:
        """Test filter parameter with valid operators."""
        valid_operators = ["eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"]

        for operator in valid_operators:
            filter_param = FilterParam(
                field="name",
                operator=operator,
                value="test_value",
            )
            assert filter_param.field == "name"
            assert filter_param.operator == operator
            assert filter_param.value == "test_value"

    def test_filter_param_invalid_operator(self) -> None:
        """Test filter parameter with invalid operator raises error."""
        with pytest.raises(ValidationError, match="Invalid operator 'invalid'"):
            FilterParam(
                field="name",
                operator="invalid",
                value="test_value",
            )

    def test_filter_param_complex_value(self) -> None:
        """Test filter parameter with complex value types."""
        # List value for "in" operator
        filter_param = FilterParam(
            field="status",
            operator="in",
            value=["active", "pending", "completed"],
        )

        assert filter_param.value == ["active", "pending", "completed"]

        # Numeric value
        filter_param_numeric = FilterParam(
            field="count",
            operator="gt",
            value=TEST_MAX_LENGTH_DEFAULT,
        )

        assert filter_param_numeric.value == TEST_MAX_LENGTH_DEFAULT


class TestPaginationResult:
    """Test cases for PaginationResult."""

    def test_pagination_result_minimal(self) -> None:
        """Test pagination result with minimal fields."""
        items = [{"id": 1, "name": "item1"}, {"id": 2, "name": "item2"}]
        result = PaginationResult(items=items)

        assert result.items == items
        assert result.next_cursor is None
        assert result.has_more is False
        assert result.total is None

    def test_pagination_result_complete(self) -> None:
        """Test pagination result with all fields."""
        items = [Tool(name="tool1"), Tool(name="tool2")]
        result = PaginationResult(
            items=items,
            next_cursor="next_page_token",
            has_more=True,
            total=TEST_MAX_LENGTH_DEFAULT,
        )

        assert len(result.items) == ITEM_COUNT_2
        assert result.items[FIRST_ITEM_INDEX].name == "tool1"
        assert result.next_cursor == "next_page_token"
        assert result.has_more is True
        assert result.total == TEST_MAX_LENGTH_DEFAULT
