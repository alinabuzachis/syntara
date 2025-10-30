"""Mock provider repository for testing purposes."""

import copy
from datetime import UTC, datetime
from uuid import UUID

from nexus.core.utils.cursor import CursorData, SortDirection, extract_sort_from_cursor
from nexus.core.utils.filters import Filter, FilterOperator
from nexus.tool_manager.lib.exceptions import ProviderNotFoundError, ValidationError
from nexus.tool_manager.lib.interfaces import ToolProviderRepository
from nexus.tool_manager.models import ToolProvider


class MockToolProviderRepository(ToolProviderRepository):
    """Mock repository for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock repository with in-memory storage."""
        self._providers: dict[UUID, ToolProvider] = {}
        self._providers_by_name: dict[str, ToolProvider] = {}

    async def create(self, provider: ToolProvider) -> ToolProvider:
        """Create a new provider."""
        if provider.name in self._providers_by_name:
            msg = f"Provider with name '{provider.name}' already exists"
            raise ValidationError(msg)

        provider.created_at = datetime.now(UTC)
        provider.updated_at = provider.created_at
        self._providers[provider.id] = provider
        self._providers_by_name[provider.name] = provider
        return provider

    async def get_by_id(self, provider_id: UUID) -> ToolProvider | None:
        """Get provider by ID."""
        return self._providers.get(provider_id)

    async def get_by_name(self, name: str) -> ToolProvider | None:
        """Get provider by name."""
        return self._providers_by_name.get(name)

    def _apply_filters(self, items: list[ToolProvider], filters: list[Filter] | None) -> list[ToolProvider]:
        """Apply filtering to the list of providers."""
        if not filters:
            return items

        filtered_items = items
        for filter_obj in filters:
            if filter_obj.field == "name" and filter_obj.operator == FilterOperator.CONTAINS:
                filtered_items = [p for p in filtered_items if str(filter_obj.value).lower() in p.name.lower()]
            elif filter_obj.field == "status" and filter_obj.operator == FilterOperator.EQ:
                filtered_items = [p for p in filtered_items if p.status.value == filter_obj.value]

        return filtered_items

    def _apply_sorting(self, items: list[ToolProvider], cursor_data: CursorData | None) -> list[ToolProvider]:
        """Apply sorting to the list of providers."""
        sort_field = "created_at"
        sort_direction = SortDirection.DESC

        if cursor_data:
            sort_field, sort_direction = extract_sort_from_cursor(cursor_data)

        # Handle different sort fields
        if sort_field == "name":
            items.sort(key=lambda x: x.name, reverse=(sort_direction == SortDirection.DESC))
        elif sort_field == "updated_at":
            items.sort(key=lambda x: x.updated_at, reverse=(sort_direction == SortDirection.DESC))
        else:  # Default to created_at
            items.sort(key=lambda x: x.created_at, reverse=(sort_direction == SortDirection.DESC))

        return items

    def _apply_pagination(
        self, items: list[ToolProvider], cursor_data: CursorData | None, limit: int
    ) -> list[ToolProvider]:
        """Apply cursor-based pagination to the list of providers."""
        start_index = 0
        if cursor_data and "id" in cursor_data:
            # Find the position of the cursor ID in the sorted list
            cursor_id = cursor_data["id"]
            try:
                cursor_uuid = UUID(cursor_id)
                for i, item in enumerate(items):
                    if item.id == cursor_uuid:
                        # Start from next item for pagination
                        start_index = i + 1
                        break
            except (ValueError, TypeError):
                # Invalid cursor ID, start from beginning
                start_index = 0

        # Return the requested page
        end_index = start_index + limit
        return items[start_index:end_index]

    async def list_providers(
        self,
        filters: list[Filter] | None = None,
        cursor_data: CursorData | None = None,
        limit: int = 20,
    ) -> list[ToolProvider]:
        """List providers with optional filtering and pagination."""
        items = list(self._providers.values())

        # Apply filtering, sorting, and pagination in sequence
        items = self._apply_filters(items, filters)
        items = self._apply_sorting(items, cursor_data)
        items = self._apply_pagination(items, cursor_data, limit)

        return items  # noqa: RET504

    async def update(self, provider: ToolProvider) -> ToolProvider:
        """Update an existing provider."""
        if provider.id not in self._providers:
            msg = f"Provider with ID '{provider.id}' not found"
            raise ProviderNotFoundError(msg)

        # Clone the existing provider to avoid modifying the original instance
        old_provider = self._providers[provider.id]
        updated_provider = copy.deepcopy(provider)

        # Update name mapping if name changed
        if old_provider.name != updated_provider.name:
            del self._providers_by_name[old_provider.name]
            self._providers_by_name[updated_provider.name] = updated_provider

        updated_provider.updated_at = datetime.now(UTC)
        self._providers[updated_provider.id] = updated_provider
        return updated_provider

    async def delete(self, provider_id: UUID) -> bool:
        """Delete a provider."""
        provider = self._providers.get(provider_id)
        if not provider:
            return False

        del self._providers[provider_id]
        del self._providers_by_name[provider.name]
        return True
