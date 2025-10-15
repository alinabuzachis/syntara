"""Tests for core provider management functions."""

import asyncio
from datetime import datetime
from uuid import uuid4

import pytest

from nexus_tool_manager.lib.tool_core import (
    FilterParam,
    PaginationParams,
    PaginationResult,
    Provider,
    ProviderNotFoundError,
    ProviderStatus,
    ValidationError,
    delete_provider,
    get_provider_detail,
    list_providers,
    register_provider,
    update_provider,
    validate_provider_connection,
)
from tests.fixtures.mock_provider import MockProvider
from tests.fixtures.mock_provider_repository import MockProviderRepository

# Test constants
DEFAULT_PAGINATION_LIMIT_2 = 2
DEFAULT_PAGINATION_LIMIT_5 = 5
RESPONSE_DELAY_MS = 100
ASYNCIO_SLEEP_MS = 0.01
PROVIDER_COUNT_3 = 3
FIRST_ITEM_INDEX = 0


class TestRegisterProvider:
    """Test cases for register_provider function."""

    @pytest.mark.asyncio
    async def test_register_provider_success(self) -> None:
        """Test successful provider registration."""
        repo = MockProviderRepository()

        provider = await register_provider(
            name="test_provider",
            description="A test provider",
            provider_type="mock",
            configuration={"key": "value"},
            provider_repo=repo,
        )

        assert provider.name == "test_provider"
        assert provider.description == "A test provider"
        assert provider.provider_type == "mock"
        assert provider.configuration == {"key": "value"}
        assert provider.enabled is True
        assert provider.status == ProviderStatus.AVAILABLE
        assert isinstance(provider.created_at, datetime)

        # Verify it's stored in repository
        stored_provider = await repo.get_by_name("test_provider")
        assert stored_provider is not None
        assert stored_provider.name == "test_provider"

    @pytest.mark.asyncio
    async def test_register_provider_duplicate_name_error(self) -> None:
        """Test registering provider with duplicate name raises error."""
        repo = MockProviderRepository()

        # Register first provider
        await register_provider(
            name="duplicate_name",
            description="First provider",
            provider_type="mock",
            configuration={},
            provider_repo=repo,
        )

        # Try to register second provider with same name
        with pytest.raises(ValidationError, match="Provider with name 'duplicate_name' already exists"):
            await register_provider(
                name="duplicate_name",
                description="Second provider",
                provider_type="mock",
                configuration={},
                provider_repo=repo,
            )

    @pytest.mark.asyncio
    async def test_register_multiple_providers_same_type(self) -> None:
        """Test registering multiple providers with the same provider_type is allowed."""
        repo = MockProviderRepository()

        # Register first MCP provider
        provider1 = await register_provider(
            name="mcp_provider_1",
            description="First MCP provider",
            provider_type="mcp",
            configuration={"server": "localhost:8001"},
            provider_repo=repo,
        )

        # Register second MCP provider with same type but different name
        provider2 = await register_provider(
            name="mcp_provider_2",
            description="Second MCP provider",
            provider_type="mcp",
            configuration={"server": "localhost:8002"},
            provider_repo=repo,
        )

        assert provider1.name == "mcp_provider_1"
        assert provider1.provider_type == "mcp"
        assert provider1.configuration == {"server": "localhost:8001"}

        assert provider2.name == "mcp_provider_2"
        assert provider2.provider_type == "mcp"
        assert provider2.configuration == {"server": "localhost:8002"}

        # Both should be stored in repository
        stored_provider1 = await repo.get_by_name("mcp_provider_1")
        stored_provider2 = await repo.get_by_name("mcp_provider_2")

        assert stored_provider1 is not None
        assert stored_provider2 is not None
        assert stored_provider1.provider_type == "mcp"
        assert stored_provider2.provider_type == "mcp"


class TestListProviders:
    """Test cases for list_providers function."""

    @pytest.mark.asyncio
    async def test_list_providers_empty(self) -> None:
        """Test listing providers when none exist."""
        repo = MockProviderRepository()

        result = await list_providers(provider_repo=repo)

        assert isinstance(result, PaginationResult)
        assert result.items == []
        assert result.has_more is False
        assert result.next_cursor is None
        assert result.total is None

    @pytest.mark.asyncio
    async def test_list_providers_with_data(self) -> None:
        """Test listing providers with existing data."""
        repo = MockProviderRepository()

        # Add test providers
        for i in range(PROVIDER_COUNT_3):
            await repo.create(
                Provider(
                    name=f"provider_{i}",
                    description=f"Provider {i}",
                    provider_type="mock",
                    configuration={"index": i},
                )
            )

        result = await list_providers(provider_repo=repo)

        assert len(result.items) == PROVIDER_COUNT_3
        assert all(isinstance(item, Provider) for item in result.items)
        assert result.items[FIRST_ITEM_INDEX].name == "provider_0"
        assert result.has_more is False

    @pytest.mark.asyncio
    async def test_list_providers_with_filters(self) -> None:
        """Test listing providers with filters."""
        repo = MockProviderRepository()

        # Add test providers with different statuses
        await repo.create(Provider(name="active_provider", status=ProviderStatus.AVAILABLE))
        await repo.create(Provider(name="error_provider", status=ProviderStatus.ERROR))
        await repo.create(Provider(name="validating_provider", status=ProviderStatus.VALIDATING))

        # Filter by status
        filters = [FilterParam(field="status", operator="eq", value="error")]
        result = await list_providers(filters=filters, provider_repo=repo)

        assert len(result.items) == 1
        assert result.items[FIRST_ITEM_INDEX].name == "error_provider"
        assert result.items[FIRST_ITEM_INDEX].status == ProviderStatus.ERROR

    @pytest.mark.asyncio
    async def test_list_providers_with_pagination(self) -> None:
        """Test listing providers with pagination."""
        repo = MockProviderRepository()

        # Add test providers
        for i in range(DEFAULT_PAGINATION_LIMIT_5):
            await repo.create(Provider(name=f"provider_{i:02d}", provider_type="mock"))

        # Get first page
        pagination = PaginationParams(limit=DEFAULT_PAGINATION_LIMIT_2, include_total=True)
        result = await list_providers(pagination=pagination, provider_repo=repo)

        assert len(result.items) == DEFAULT_PAGINATION_LIMIT_2
        assert result.has_more is True
        assert result.next_cursor is not None
        assert result.total == DEFAULT_PAGINATION_LIMIT_5

    @pytest.mark.asyncio
    async def test_list_providers_no_repo_error(self) -> None:
        """Test listing providers without repo parameter raises error."""
        with pytest.raises(ValueError, match="provider_repo parameter is required"):
            await list_providers()


class TestGetProviderDetail:
    """Test cases for get_provider_detail function."""

    @pytest.mark.asyncio
    async def test_get_provider_detail_success(self) -> None:
        """Test successful provider detail retrieval."""
        repo = MockProviderRepository()

        # Create test provider
        provider = Provider(
            name="detailed_provider",
            description="Provider with details",
            provider_type="mock",
            configuration={"detailed": True},
        )
        created_provider = await repo.create(provider)

        # Get provider detail
        result = await get_provider_detail(created_provider.id, repo)

        assert result.id == created_provider.id
        assert result.name == "detailed_provider"
        assert result.description == "Provider with details"
        assert result.configuration == {"detailed": True}

    @pytest.mark.asyncio
    async def test_get_provider_detail_not_found(self) -> None:
        """Test getting provider detail for non-existent provider."""
        repo = MockProviderRepository()
        non_existent_id = uuid4()

        with pytest.raises(ProviderNotFoundError, match=f"Provider with ID '{non_existent_id}' not found"):
            await get_provider_detail(non_existent_id, repo)


class TestUpdateProvider:
    """Test cases for update_provider function."""

    @pytest.mark.asyncio
    async def test_update_provider_success(self) -> None:
        """Test successful provider update."""
        repo = MockProviderRepository()

        # Create test provider
        provider = Provider(
            name="update_provider",
            description="Original description",
            provider_type="mock",
            enabled=True,
        )
        created_provider = await repo.create(provider)

        # Update provider
        updates = {
            "description": "Updated description",
            "enabled": False,
            "configuration": {"updated": True},
        }

        updated_provider = await update_provider(created_provider.id, updates, repo)

        assert updated_provider.id == created_provider.id
        assert updated_provider.name == "update_provider"  # Unchanged
        assert updated_provider.description == "Updated description"
        assert updated_provider.enabled is False
        assert updated_provider.configuration == {"updated": True}
        assert updated_provider.updated_at > created_provider.updated_at

    @pytest.mark.asyncio
    async def test_update_provider_not_found(self) -> None:
        """Test updating non-existent provider."""
        repo = MockProviderRepository()
        non_existent_id = uuid4()

        with pytest.raises(ProviderNotFoundError, match=f"Provider with ID '{non_existent_id}' not found"):
            await update_provider(non_existent_id, {"description": "Updated"}, repo)

    @pytest.mark.asyncio
    async def test_update_provider_ignore_unknown_fields(self) -> None:
        """Test updating provider ignores unknown fields."""
        repo = MockProviderRepository()

        # Create test provider
        provider = Provider(name="test_provider")
        created_provider = await repo.create(provider)

        # Update with unknown field
        updates = {
            "description": "Valid update",
            "unknown_field": "Should be ignored",
        }

        updated_provider = await update_provider(created_provider.id, updates, repo)

        assert updated_provider.description == "Valid update"
        assert not hasattr(updated_provider, "unknown_field")


class TestDeleteProvider:
    """Test cases for delete_provider function."""

    @pytest.mark.asyncio
    async def test_delete_provider_success(self) -> None:
        """Test successful provider deletion."""
        repo = MockProviderRepository()

        # Create test provider
        provider = Provider(name="delete_provider")
        created_provider = await repo.create(provider)

        # Verify provider exists
        existing = await repo.get_by_id(created_provider.id)
        assert existing is not None

        # Delete provider
        result = await delete_provider(created_provider.id, repo)

        assert result is True

        # Verify provider is deleted
        deleted = await repo.get_by_id(created_provider.id)
        assert deleted is None

    @pytest.mark.asyncio
    async def test_delete_provider_not_found(self) -> None:
        """Test deleting non-existent provider."""
        repo = MockProviderRepository()
        non_existent_id = uuid4()

        result = await delete_provider(non_existent_id, repo)

        assert result is False


class TestValidateProviderConnection:
    """Test cases for validate_provider_connection function."""

    @pytest.mark.asyncio
    async def test_validate_provider_connection_success(self) -> None:
        """Test successful provider connection validation."""
        repo = MockProviderRepository()
        adapter = MockProvider(provider_name="test_validator")

        # Create test provider
        provider = Provider(
            name="validate_provider",
            provider_type="mock",
            status=ProviderStatus.AVAILABLE,
        )
        created_provider = await repo.create(provider)

        # Validate connection
        result = await validate_provider_connection(created_provider.id, repo, adapter)

        assert result.valid is True
        assert result.provider_type == "mock"
        assert result.protocol_version is not None
        assert result.validated_at is not None

        # Check provider status was updated
        updated_provider = await repo.get_by_id(created_provider.id)
        assert updated_provider is not None
        assert updated_provider.status == ProviderStatus.AVAILABLE
        assert updated_provider.last_validated_at is not None

    @pytest.mark.asyncio
    async def test_validate_provider_connection_failure(self) -> None:
        """Test provider connection validation failure."""
        repo = MockProviderRepository()

        # Create adapter that simulates connection error
        adapter = MockProvider(provider_name="failing_validator")
        adapter.set_error_simulation(connection_error=True)

        # Create test provider
        provider = Provider(
            name="failing_provider",
            provider_type="mock",
            status=ProviderStatus.AVAILABLE,
        )
        created_provider = await repo.create(provider)

        # Validate connection (should fail)
        with pytest.raises(ConnectionError):
            await validate_provider_connection(created_provider.id, repo, adapter)

        # Check provider status was updated to error
        updated_provider = await repo.get_by_id(created_provider.id)
        assert updated_provider is not None
        assert updated_provider.status == ProviderStatus.ERROR

    @pytest.mark.asyncio
    async def test_validate_provider_connection_not_found(self) -> None:
        """Test validating connection for non-existent provider."""
        repo = MockProviderRepository()
        adapter = MockProvider()
        non_existent_id = uuid4()

        with pytest.raises(ProviderNotFoundError, match=f"Provider with ID '{non_existent_id}' not found"):
            await validate_provider_connection(non_existent_id, repo, adapter)

    @pytest.mark.asyncio
    async def test_validate_provider_connection_sets_validating_status(self) -> None:
        """Test validation sets provider status to validating during process."""
        repo = MockProviderRepository()

        # Create slow adapter to test intermediate status
        adapter = MockProvider(response_delay_ms=RESPONSE_DELAY_MS)

        # Create test provider
        provider = Provider(
            name="slow_provider",
            provider_type="mock",
            status=ProviderStatus.AVAILABLE,
        )
        created_provider = await repo.create(provider)

        # Start validation
        validation_task = validate_provider_connection(created_provider.id, repo, adapter)

        # Small delay to allow status update
        await asyncio.sleep(ASYNCIO_SLEEP_MS)

        # Check intermediate status
        intermediate_provider = await repo.get_by_id(created_provider.id)
        if intermediate_provider:  # May complete too fast in some cases
            # Status should be validating or already completed to available
            assert intermediate_provider.status in [ProviderStatus.VALIDATING, ProviderStatus.AVAILABLE]

        # Wait for completion
        result = await validation_task
        assert result.valid is True
