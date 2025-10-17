"""Tests for pagination and filtering logic."""

from uuid import uuid4

import pytest

from nexus.tool_manager.lib.tool_core import (
    FilterParam,
    PaginationParams,
    PaginationResult,
    Provider,
    ProviderStatus,
    Tool,
    ValidationError,
    list_providers,
    list_tools,
)
from tests.fixtures.mock_provider_repository import MockProviderRepository
from tests.fixtures.mock_tool_repository import MockToolRepository

# Test constants
DEFAULT_PAGINATION_LIMIT = 20
CUSTOM_PAGINATION_LIMIT = 50
SMALL_PAGINATION_LIMIT = 1
LARGE_PAGINATION_LIMIT = 1000
PAGE_LIMIT_3 = 3
PAGE_LIMIT_10 = 10
PROVIDER_COUNT_5 = 5
PROVIDER_COUNT_7 = 7
PROVIDER_COUNT_10 = 10
TOTAL_ITEMS_COUNT_100 = 100
TEST_NUMERIC_VALUE = 42
TEST_LIST_COUNT_2 = 2
TEST_LIST_COUNT_3 = 3
FIRST_ITEM_INDEX = 0
TEST_ID_1 = 1
TEST_ID_2 = 2
TEST_ID_3 = 3
EMPTY_RESULT_COUNT = 0
SINGLE_RESULT_COUNT = 1


class TestPaginationParams:
    """Test cases for PaginationParams functionality."""

    def test_pagination_params_defaults(self) -> None:
        """Test default pagination parameters."""
        params = PaginationParams()

        assert params.limit == DEFAULT_PAGINATION_LIMIT
        assert params.cursor is None
        assert params.include_total is False

    def test_pagination_params_custom_values(self) -> None:
        """Test custom pagination parameters."""
        params = PaginationParams(
            limit=CUSTOM_PAGINATION_LIMIT,
            cursor="page_token_123",
            include_total=True,
        )

        assert params.limit == CUSTOM_PAGINATION_LIMIT
        assert params.cursor == "page_token_123"
        assert params.include_total is True

    def test_pagination_params_edge_cases(self) -> None:
        """Test pagination parameters edge cases."""
        # Very small limit
        params_small = PaginationParams(limit=SMALL_PAGINATION_LIMIT)
        assert params_small.limit == SMALL_PAGINATION_LIMIT

        # Large limit
        params_large = PaginationParams(limit=LARGE_PAGINATION_LIMIT)
        assert params_large.limit == LARGE_PAGINATION_LIMIT

        # Empty cursor
        params_empty_cursor = PaginationParams(cursor="")
        assert params_empty_cursor.cursor == ""


class TestFilterParam:
    """Test cases for FilterParam functionality."""

    def test_filter_param_all_valid_operators(self) -> None:
        """Test filter parameter with all valid operators."""
        valid_operators = ["eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"]

        for operator in valid_operators:
            filter_param = FilterParam(
                field="test_field",
                operator=operator,
                value="test_value",
            )
            assert filter_param.field == "test_field"
            assert filter_param.operator == operator
            assert filter_param.value == "test_value"

    def test_filter_param_invalid_operators(self) -> None:
        """Test filter parameter with invalid operators."""
        invalid_operators = ["invalid", "like", "regex", "starts_with", "ends_with"]

        for operator in invalid_operators:
            with pytest.raises(ValidationError, match=f"Invalid operator '{operator}'"):
                FilterParam(
                    field="test_field",
                    operator=operator,
                    value="test_value",
                )

    def test_filter_param_various_value_types(self) -> None:
        """Test filter parameter with various value types."""
        # String value
        str_filter = FilterParam("name", "eq", "test_string")
        assert str_filter.value == "test_string"

        # Integer value
        int_filter = FilterParam("count", "gt", TEST_NUMERIC_VALUE)
        assert int_filter.value == TEST_NUMERIC_VALUE

        # Boolean value
        bool_filter = FilterParam("enabled", "eq", value=True)
        assert bool_filter.value is True

        # List value for "in" operator
        list_filter = FilterParam("status", "in", ["active", "pending"])
        assert list_filter.value == ["active", "pending"]

        # None value
        with pytest.raises(
            ValidationError,
            match="Filter value cannot be None for operator 'eq'",
        ):
            FilterParam("optional_field", "eq", None)


class TestPaginationResult:
    """Test cases for PaginationResult functionality."""

    def test_pagination_result_empty(self) -> None:
        """Test pagination result with empty items."""
        result = PaginationResult(items=[])

        assert result.items == []
        assert result.next_cursor is None
        assert result.has_more is False
        assert result.total is None

    def test_pagination_result_with_data(self) -> None:
        """Test pagination result with data."""
        items = [{"id": TEST_ID_1}, {"id": TEST_ID_2}, {"id": TEST_ID_3}]
        result = PaginationResult(
            items=items,
            next_cursor="next_page_token",
            has_more=True,
            total=TOTAL_ITEMS_COUNT_100,
        )

        assert result.items == items
        assert result.next_cursor == "next_page_token"
        assert result.has_more is True
        assert result.total == TOTAL_ITEMS_COUNT_100

    def test_pagination_result_last_page(self) -> None:
        """Test pagination result for last page."""
        items = [{"id": TEST_ID_1}, {"id": TEST_ID_2}]
        result = PaginationResult(
            items=items,
            next_cursor=None,
            has_more=False,
            total=TEST_LIST_COUNT_2,
        )

        assert len(result.items) == TEST_LIST_COUNT_2
        assert result.next_cursor is None
        assert result.has_more is False
        assert result.total == TEST_LIST_COUNT_2


class TestProviderPagination:
    """Test cases for provider pagination functionality."""

    @pytest.mark.asyncio
    async def test_provider_pagination_first_page(self) -> None:
        """Test first page of provider pagination."""
        repo = MockProviderRepository()

        # Create test providers
        for i in range(PROVIDER_COUNT_10):
            await repo.create(
                Provider(
                    name=f"provider_{i:02d}",
                    description=f"Provider {i}",
                    provider_type="mock",
                )
            )

        # Get first page
        pagination = PaginationParams(limit=PAGE_LIMIT_3, include_total=True)
        result = await list_providers(pagination=pagination, provider_repo=repo)

        assert len(result.items) == PAGE_LIMIT_3
        assert result.has_more is True
        assert result.next_cursor is not None
        assert result.total == PROVIDER_COUNT_10

    @pytest.mark.asyncio
    async def test_provider_pagination_subsequent_pages(self) -> None:
        """Test subsequent pages of provider pagination."""
        repo = MockProviderRepository()

        # Create test providers
        for i in range(PROVIDER_COUNT_10):
            await repo.create(
                Provider(
                    name=f"provider_{i:02d}",
                    provider_type="mock",
                )
            )

        # Get first page
        first_page = PaginationParams(limit=PAGE_LIMIT_3)
        first_result = await list_providers(pagination=first_page, provider_repo=repo)

        # Get second page using cursor
        second_page = PaginationParams(limit=PAGE_LIMIT_3, cursor=first_result.next_cursor)
        second_result = await list_providers(pagination=second_page, provider_repo=repo)

        # Results should be different
        assert len(second_result.items) == PAGE_LIMIT_3
        assert first_result.items != second_result.items
        assert second_result.has_more is True

    @pytest.mark.asyncio
    async def test_provider_pagination_last_page(self) -> None:
        """Test last page of provider pagination."""
        repo = MockProviderRepository()

        # Create test providers (PROVIDER_COUNT_5 total)
        for i in range(PROVIDER_COUNT_5):
            await repo.create(Provider(name=f"provider_{i}", provider_type="mock"))

        # Get page that should contain remaining items
        pagination = PaginationParams(limit=PAGE_LIMIT_10)  # Larger than total
        result = await list_providers(pagination=pagination, provider_repo=repo)

        assert len(result.items) == PROVIDER_COUNT_5
        assert result.has_more is False
        assert result.next_cursor is None

    @pytest.mark.asyncio
    async def test_provider_pagination_empty_result(self) -> None:
        """Test pagination with empty result set."""
        repo = MockProviderRepository()

        pagination = PaginationParams(limit=PAGE_LIMIT_10)
        result = await list_providers(pagination=pagination, provider_repo=repo)

        assert len(result.items) == EMPTY_RESULT_COUNT
        assert result.has_more is False
        assert result.next_cursor is None


class TestProviderFiltering:
    """Test cases for provider filtering functionality."""

    @pytest.mark.asyncio
    async def test_provider_filter_by_name(self) -> None:
        """Test filtering providers by name."""
        repo = MockProviderRepository()

        # Create test providers
        await repo.create(Provider(name="alpha_provider", provider_type="mock"))
        await repo.create(Provider(name="beta_provider", provider_type="mock"))
        await repo.create(Provider(name="alpha_secondary", provider_type="mock"))

        # Filter by name containing "alpha"
        filters = [FilterParam("name", "contains", "alpha")]
        result = await list_providers(filters=filters, provider_repo=repo)

        assert len(result.items) == TEST_LIST_COUNT_2
        assert all("alpha" in provider.name.lower() for provider in result.items)

    @pytest.mark.asyncio
    async def test_provider_filter_by_status(self) -> None:
        """Test filtering providers by status."""
        repo = MockProviderRepository()

        # Create test providers with different statuses
        await repo.create(Provider(name="available_provider", status=ProviderStatus.AVAILABLE))
        await repo.create(Provider(name="error_provider", status=ProviderStatus.ERROR))
        await repo.create(Provider(name="validating_provider", status=ProviderStatus.VALIDATING))
        await repo.create(Provider(name="another_available", status=ProviderStatus.AVAILABLE))

        # Filter by error status
        filters = [FilterParam("status", "eq", "error")]
        result = await list_providers(filters=filters, provider_repo=repo)

        assert len(result.items) == SINGLE_RESULT_COUNT
        assert result.items[FIRST_ITEM_INDEX].name == "error_provider"
        assert result.items[FIRST_ITEM_INDEX].status == ProviderStatus.ERROR

    @pytest.mark.asyncio
    async def test_provider_filter_by_enabled(self) -> None:
        """Test filtering providers by enabled status."""
        repo = MockProviderRepository()

        # Create test providers
        await repo.create(Provider(name="enabled_provider", enabled=True))
        await repo.create(Provider(name="disabled_provider", enabled=False))
        await repo.create(Provider(name="another_enabled", enabled=True))

        # Filter by enabled status
        filters = [FilterParam("enabled", "eq", value=False)]
        result = await list_providers(filters=filters, provider_repo=repo)

        assert len(result.items) == SINGLE_RESULT_COUNT
        assert result.items[FIRST_ITEM_INDEX].name == "disabled_provider"
        assert result.items[FIRST_ITEM_INDEX].enabled is False

    @pytest.mark.asyncio
    async def test_provider_multiple_filters(self) -> None:
        """Test filtering providers with multiple filters."""
        repo = MockProviderRepository()

        # Create test providers
        await repo.create(Provider(name="prod_alpha", enabled=True, status=ProviderStatus.AVAILABLE))
        await repo.create(Provider(name="prod_beta", enabled=False, status=ProviderStatus.AVAILABLE))
        await repo.create(Provider(name="dev_alpha", enabled=True, status=ProviderStatus.ERROR))
        await repo.create(Provider(name="prod_gamma", enabled=True, status=ProviderStatus.AVAILABLE))

        # Filter by name containing "prod" AND enabled=True
        filters = [
            FilterParam("name", "contains", "prod"),
            FilterParam("enabled", "eq", value=True),
        ]
        result = await list_providers(filters=filters, provider_repo=repo)

        assert len(result.items) == TEST_LIST_COUNT_2
        assert all("prod" in provider.name for provider in result.items)
        assert all(provider.enabled for provider in result.items)


class TestToolPagination:
    """Test cases for tool pagination functionality."""

    @pytest.mark.asyncio
    async def test_tool_pagination_basic(self) -> None:
        """Test basic tool pagination."""
        repo = MockToolRepository()

        # Create test tools
        for i in range(PROVIDER_COUNT_7):
            await repo.create(
                Tool(
                    name=f"tool_{i:02d}",
                    namespaced_name=f"provider::tool_{i:02d}",
                    description=f"Tool {i}",
                )
            )

        # Get first page
        pagination = PaginationParams(limit=PAGE_LIMIT_3, include_total=True)
        result = await list_tools(pagination=pagination, tool_repo=repo)

        assert len(result.items) == PAGE_LIMIT_3
        assert result.has_more is True
        assert result.next_cursor is not None
        assert result.total == PROVIDER_COUNT_7

    @pytest.mark.asyncio
    async def test_tool_filtering_by_enabled(self) -> None:
        """Test filtering tools by enabled status."""
        repo = MockToolRepository()

        # Create test tools
        await repo.create(Tool(name="enabled_tool", namespaced_name="enabled_tool", enabled=True))
        await repo.create(Tool(name="disabled_tool", namespaced_name="disabled_tool", enabled=False))
        await repo.create(Tool(name="another_enabled", namespaced_name="another_enabled", enabled=True))

        # Filter by enabled status
        filters = [FilterParam("enabled", "eq", value=True)]
        result = await list_tools(filters=filters, tool_repo=repo)

        assert len(result.items) == TEST_LIST_COUNT_2
        assert all(tool.enabled for tool in result.items)

    @pytest.mark.asyncio
    async def test_tool_filtering_by_provider_id(self) -> None:
        """Test filtering tools by provider ID."""
        repo = MockToolRepository()
        provider_id = uuid4()
        other_provider_id = uuid4()

        # Create test tools with different provider IDs
        await repo.create(Tool(name="tool1", namespaced_name="tool1", provider_id=provider_id))
        await repo.create(Tool(name="tool2", namespaced_name="tool2", provider_id=other_provider_id))
        await repo.create(Tool(name="tool3", namespaced_name="tool3", provider_id=provider_id))

        # Filter by specific provider ID
        filters = [FilterParam("provider_id", "eq", str(provider_id))]
        result = await list_tools(filters=filters, tool_repo=repo)

        assert len(result.items) == TEST_LIST_COUNT_2
        assert all(tool.provider_id == provider_id for tool in result.items)


class TestPaginationConsistency:
    """Test cases for pagination consistency and edge cases."""

    @pytest.mark.asyncio
    async def test_pagination_ordering_consistency(self) -> None:
        """Test that pagination ordering is consistent across requests."""
        repo = MockProviderRepository()

        # Create test providers
        for i in range(PROVIDER_COUNT_10):
            await repo.create(
                Provider(
                    name=f"provider_{i:02d}",
                    provider_type="mock",
                )
            )

        # Get multiple small pages
        all_items = []
        pagination = PaginationParams(limit=TEST_LIST_COUNT_2)
        cursor = None

        for _ in range(PROVIDER_COUNT_5):  # Get 5 pages of 2 items each
            pagination.cursor = cursor
            result = await list_providers(pagination=pagination, provider_repo=repo)

            all_items.extend(result.items)
            cursor = result.next_cursor

            if not result.has_more:
                break

        # Check that all items are unique (no duplicates from overlapping pages)
        item_ids = [item.id for item in all_items]
        assert len(item_ids) == len(set(item_ids)), "Found duplicate items across pages"

        # Check ordering consistency (should be ordered by created_at)
        created_times = [item.created_at for item in all_items]
        assert created_times == sorted(created_times), "Items not properly ordered across pages"

    @pytest.mark.asyncio
    async def test_pagination_with_filters_consistency(self) -> None:
        """Test pagination consistency when filters are applied."""
        repo = MockProviderRepository()

        # Create test providers with mixed enabled status
        for i in range(PROVIDER_COUNT_10):
            enabled = i % TEST_LIST_COUNT_2 == 0  # Even indices are enabled
            await repo.create(
                Provider(
                    name=f"provider_{i:02d}",
                    enabled=enabled,
                    provider_type="mock",
                )
            )

        # Get all enabled providers using pagination
        filters = [FilterParam("enabled", "eq", value=True)]
        all_enabled = []
        pagination = PaginationParams(limit=TEST_LIST_COUNT_2)
        cursor = None

        while True:
            pagination.cursor = cursor
            result = await list_providers(filters=filters, pagination=pagination, provider_repo=repo)

            all_enabled.extend(result.items)
            cursor = result.next_cursor

            if not result.has_more:
                break

        # Should have PROVIDER_COUNT_5 enabled providers
        assert len(all_enabled) == PROVIDER_COUNT_5
        assert all(provider.enabled for provider in all_enabled)

    @pytest.mark.asyncio
    async def test_pagination_invalid_cursor(self) -> None:
        """Test pagination behavior with invalid cursor."""
        repo = MockProviderRepository()

        # Create test providers
        for i in range(PROVIDER_COUNT_5):
            await repo.create(Provider(name=f"provider_{i}", provider_type="mock"))

        # Use invalid cursor - should gracefully handle and start from beginning
        pagination = PaginationParams(limit=PAGE_LIMIT_3, cursor="invalid_cursor")
        result = await list_providers(pagination=pagination, provider_repo=repo)

        # Should return results starting from the beginning
        assert len(result.items) <= PAGE_LIMIT_3
        assert isinstance(result.items, list)
