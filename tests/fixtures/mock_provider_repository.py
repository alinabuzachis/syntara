"""Mock provider repository for testing purposes."""

import copy
from datetime import UTC, datetime
from uuid import UUID

from nexus.tool_manager.lib.tool_core import (
    FilterParam,
    PaginationParams,
    PaginationResult,
    Provider,
    ProviderNotFoundError,
    ProviderRepository,
    ValidationError,
)


class MockProviderRepository(ProviderRepository):
    """Mock repository for testing purposes."""

    def __init__(self) -> None:
        """Initialize mock repository with in-memory storage."""
        self._providers: dict[UUID, Provider] = {}
        self._providers_by_name: dict[str, Provider] = {}

    async def create(self, provider: Provider) -> Provider:
        """Create a new provider."""
        if provider.name in self._providers_by_name:
            msg = f"Provider with name '{provider.name}' already exists"
            raise ValidationError(msg)

        provider.created_at = datetime.now(UTC)
        provider.updated_at = provider.created_at
        self._providers[provider.id] = provider
        self._providers_by_name[provider.name] = provider
        return provider

    async def get_by_id(self, provider_id: UUID) -> Provider | None:
        """Get provider by ID."""
        return self._providers.get(provider_id)

    async def get_by_name(self, name: str) -> Provider | None:
        """Get provider by name."""
        return self._providers_by_name.get(name)

    async def list_providers(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List providers with optional filtering and pagination."""
        items = list(self._providers.values())

        # Apply basic filtering (simplified for mock)
        if filters:
            for filter_param in filters:
                if filter_param.field == "name" and filter_param.operator == "contains":
                    items = [p for p in items if filter_param.value.lower() in p.name.lower()]
                elif filter_param.field == "status" and filter_param.operator == "eq":
                    items = [p for p in items if p.status.value == filter_param.value]
                elif filter_param.field == "enabled" and filter_param.operator == "eq":
                    items = [p for p in items if p.enabled == filter_param.value]

        # Sort by created_at for consistent ordering
        items.sort(key=lambda x: x.created_at)

        # Apply pagination (simplified)
        pagination = pagination or PaginationParams()
        start = 0
        if pagination.cursor:
            # Simple cursor implementation using array index
            try:
                start = int(pagination.cursor)
            except (ValueError, TypeError):
                start = 0

        end = start + pagination.limit
        page_items = items[start:end]
        has_more = end < len(items)
        next_cursor = str(end) if has_more else None
        total = len(items) if pagination.include_total else None

        return PaginationResult(
            items=page_items,
            next_cursor=next_cursor,
            has_more=has_more,
            total=total,
        )

    async def update(self, provider: Provider) -> Provider:
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
