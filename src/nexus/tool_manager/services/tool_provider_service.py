"""Tool Provider Service for database operations and business logic.

This module provides the service layer for Tool Provider management, wrapping
core domain logic with database persistence and transaction management.
"""

from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

from sqlalchemy import Select, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.utils import (
    Filter,
    FilterOperator,
    PaginationDirection,
    SortDirection,
    apply_filters,
    apply_sorting,
    decode_cursor,
    extract_pagination_from_cursor,
    generate_response,
    parse_filters,
    parse_sort,
)
from nexus.tool_manager.lib.exceptions import (
    ProviderError,
    ProviderNameConflictError,
    ProviderNotFoundError,
    ValidationError,
)
from nexus.tool_manager.lib.providers.factory import ProviderFactory
from nexus.tool_manager.models.tool import Tool, ToolStatus
from nexus.tool_manager.models.tool_provider import (
    ProviderStatus,
    ToolProvider,
    ToolProviderCreate,
    ToolProviderListResponse,
    ToolProviderPatch,
)
from nexus.tool_manager.models.tool_provider_refresh_result import ToolProviderRefreshResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult

SelectToolProvider = Select[tuple[ToolProvider]] | SelectOfScalar[tuple[ToolProvider]]


class ToolProviderService:
    """Service for Tool Provider CRUD operations and business logic.

    This service handles database persistence, transaction management, and integrates
    with the provider factory for validation and tool refresh operations.
    """

    def __init__(self, session: AsyncSession, user: User) -> None:
        """Initialize service with database session and current user.

        Args:
            session: Async database session for operations
            user: Current authenticated user for audit tracking

        """
        self.session = session
        self.user = user
        self.provider_factory = ProviderFactory()

    def _is_duplicate_name_error(self, e: IntegrityError) -> bool:
        """Check if IntegrityError is due to duplicate provider name.

        Args:
            e: The IntegrityError to check

        Returns:
            True if error is due to duplicate provider name constraint

        """
        error_str = str(e)
        return (
            "ix_tool_providers_name_unique" in error_str
            or "tool_providers.name" in error_str
            or ("duplicate key" in error_str.lower() and "name" in error_str.lower())
        )

    async def _handle_integrity_error(self, e: IntegrityError, provider_name: str) -> NoReturn:
        """Handle IntegrityError and raise appropriate domain exception.

        Args:
            e: The IntegrityError to handle
            provider_name: Name of the provider causing the conflict

        Raises:
            ProviderNameConflictError: If duplicate name constraint violated
            IntegrityError: For other integrity constraint violations

        """
        if self._is_duplicate_name_error(e):
            raise ProviderNameConflictError(provider_name) from e
        raise e

    def _apply_filters_to_query(
        self, query: SelectToolProvider, query_params: dict[str, str]
    ) -> tuple[SelectToolProvider, list[Filter]]:
        """Apply filters to query and return modified query and filter objects.

        Args:
            query: SQLAlchemy query to filter
            query_params: Query parameters for filtering

        Returns:
            Tuple of (filtered_query, filter_objects)

        Raises:
            ValidationError: If filter parameters are invalid

        """
        try:
            # Expand allowed fields to support bracket notation for all expected fields
            allowed_filter_fields = [
                "name",
                "status",
                "enabled",
                "provider_type",
                "configuration.provider_type",
                "configuration.base_url",
            ]
            filters = parse_filters(query_params, allowed_filter_fields)

            # Apply filters with special handling for JSON fields
            for filter_obj in filters:
                if filter_obj.field in ["provider_type", "configuration.provider_type"]:
                    # Handle provider_type in JSON configuration field
                    if filter_obj.operator == FilterOperator.EQ:
                        query = query.filter(ToolProvider.configuration["provider_type"].astext == filter_obj.value)
                elif filter_obj.field == "configuration.base_url":
                    # Handle base_url in JSON configuration field
                    if filter_obj.operator == FilterOperator.EQ:
                        query = query.filter(ToolProvider.configuration["base_url"].astext == filter_obj.value)
                    elif filter_obj.operator == FilterOperator.CONTAINS:
                        query = query.filter(
                            ToolProvider.configuration["base_url"].astext.ilike(f"%{filter_obj.value}%")
                        )
                else:
                    # Apply regular filters for non-JSON fields
                    single_filter_query = apply_filters(query, [filter_obj], ToolProvider)
                    query = single_filter_query

            return query, filters
        except ValueError as e:
            msg = f"Invalid filter parameter: {e}"
            raise ValidationError(msg) from e

    def _apply_sorting_to_query(
        self, query: SelectToolProvider, sort: str | None
    ) -> tuple[SelectToolProvider, SortDirection]:
        """Apply sorting to query and return modified query and sort direction.

        Args:
            query: SQLAlchemy query to sort
            sort: Sort parameter

        Returns:
            Tuple of (sorted_query, sort_direction)

        Raises:
            ValidationError: If sort parameter is invalid

        """
        try:
            allowed_sort_fields = ["name", "created_at", "updated_at", "status", "enabled"]
            sort_field, sort_direction = parse_sort(sort, allowed_sort_fields)
            query = apply_sorting(query, [(sort_field, sort_direction)], ToolProvider)
            return query, sort_direction
        except ValueError as e:
            msg = f"Invalid sort parameter: {e}"
            raise ValidationError(msg) from e

    def _apply_cursor_pagination_to_query(
        self,
        query: SelectToolProvider,
        cursor: str | None,
        sort_direction: SortDirection,
    ) -> SelectToolProvider:
        """Apply cursor-based pagination to query.

        Args:
            query: SQLAlchemy query to paginate
            cursor: Cursor token for pagination
            sort_direction: Sort direction from sorting step

        Returns:
            Query with cursor-based pagination applied

        """
        if not cursor:
            return query

        try:
            cursor_data = decode_cursor(cursor)
            resource_id, created_at, direction = extract_pagination_from_cursor(cursor_data)

            if resource_id and created_at:
                # Convert cursor data to proper types
                cursor_id = UUID(resource_id)
                cursor_timestamp = datetime.fromisoformat(created_at)

                # Apply cursor-based filtering based on sort direction and pagination direction
                if direction == PaginationDirection.NEXT:
                    if sort_direction.value == "desc":
                        query = query.filter(
                            (ToolProvider.created_at < cursor_timestamp)  # type: ignore[arg-type]
                            | ((ToolProvider.created_at == cursor_timestamp) & (ToolProvider.id < cursor_id))
                        )
                    else:
                        query = query.filter(
                            (ToolProvider.created_at > cursor_timestamp)  # type: ignore[arg-type]
                            | ((ToolProvider.created_at == cursor_timestamp) & (ToolProvider.id > cursor_id))
                        )
                elif sort_direction.value == "desc":
                    query = query.filter(
                        (ToolProvider.created_at > cursor_timestamp)  # type: ignore[arg-type]
                        | ((ToolProvider.created_at == cursor_timestamp) & (ToolProvider.id > cursor_id))
                    )
                else:
                    query = query.filter(
                        (ToolProvider.created_at < cursor_timestamp)  # type: ignore[arg-type]
                        | ((ToolProvider.created_at == cursor_timestamp) & (ToolProvider.id < cursor_id))
                    )
        except (ValueError, KeyError):
            # Invalid cursor - ignore and continue without cursor filtering
            pass

        return query

    async def _get_total_count(self, filters: list[Filter]) -> int | None:
        """Get total count of providers matching filters.

        Args:
            filters: List of filter objects to apply

        Returns:
            Total count of matching providers

        """
        count_query = select(func.count()).select_from(ToolProvider).filter(ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr]

        # Apply the same filters to count query
        for filter_obj in filters:
            if filter_obj.field in ["provider_type", "configuration.provider_type"]:
                if filter_obj.operator == FilterOperator.EQ:
                    count_query = count_query.filter(
                        ToolProvider.configuration["provider_type"].astext == filter_obj.value
                    )
            elif filter_obj.field == "configuration.base_url":
                if filter_obj.operator == FilterOperator.EQ:
                    count_query = count_query.filter(ToolProvider.configuration["base_url"].astext == filter_obj.value)
                elif filter_obj.operator == FilterOperator.CONTAINS:
                    count_query = count_query.filter(
                        ToolProvider.configuration["base_url"].astext.ilike(f"%{filter_obj.value}%")
                    )
            else:
                single_filter_count_query = apply_filters(count_query, [filter_obj], ToolProvider)
                count_query = single_filter_count_query  # type: ignore[assignment]

        total_result = await self.session.execute(count_query)
        return total_result.scalar()

    async def list_providers(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        *,
        include_total: bool = False,
        **query_params: Any,  # noqa: ANN401
    ) -> ToolProviderListResponse:
        """List tool providers with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of providers to return (max 100)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            include_total: Whether to include total count in response
            **query_params: Additional query parameters for filtering

        Returns:
            Dict with providers list, pagination metadata, and optional total

        """
        # Build base query with soft delete filter
        query: SelectToolProvider = select(ToolProvider).filter(ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr]

        # Apply filters, sorting, and pagination
        query, filters = self._apply_filters_to_query(query, query_params)
        query, sort_direction = self._apply_sorting_to_query(query, sort)
        query = self._apply_cursor_pagination_to_query(query, cursor, sort_direction)

        # Apply limit and execute query
        query = query.limit(limit)
        result = await self.session.execute(query)
        providers = result.scalars().all()

        # Get total count if requested
        total_count = None
        if include_total:
            total_count = await self._get_total_count(filters)

        # Generate pagination response
        pagination_metadata = generate_response(
            items=providers,
            limit=limit,
            cursor=cursor,
            include_total=include_total,
            total_count=total_count,
        )

        return ToolProviderListResponse(
            resources=providers,
            next=pagination_metadata["next"],
            prev=pagination_metadata["prev"],
            total=pagination_metadata["total"],
        )

    async def create_provider(self, provider_create: ToolProviderCreate) -> ToolProvider:
        """Create a new tool provider.

        Args:
            provider_create: ToolProviderCreate instance with provider data

        Returns:
            Created ToolProvider instance

        Raises:
            ValidationError: If provider data is invalid
            ProviderNameConflictError: If provider name already exists

        """
        # Create provider instance from ToolProviderCreate
        provider = ToolProvider(
            name=provider_create.name,
            description=provider_create.description,
            configuration=provider_create.configuration,
            enabled=True,  # Default enabled state
            status=ProviderStatus.VALIDATING,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(provider)

        try:
            await self.session.flush()
            await self.session.refresh(provider)
            return provider
        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_create.name)

    async def get_provider(self, provider_id: UUID) -> ToolProvider:
        """Get a tool provider by ID.

        Args:
            provider_id: UUID of the provider

        Returns:
            ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist or is deleted

        """
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.execute(query)
        provider = result.scalar_one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        return provider

    async def update_provider(self, provider_id: UUID, provider_update: ToolProviderCreate) -> ToolProvider:
        """Update a tool provider (complete replacement).

        Args:
            provider_id: UUID of the provider to update
            provider_update: ToolProviderCreate instance with new provider data

        Returns:
            Updated ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ValidationError: If update data is invalid
            ProviderNameConflictError: If new name conflicts with existing provider

        """
        provider = await self.get_provider(provider_id)

        # Update fields from ToolProviderCreate
        provider.name = provider_update.name
        provider.description = provider_update.description
        provider.configuration = provider_update.configuration

        provider.updated_by = self.user.id
        provider.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            await self.session.refresh(provider)
            return provider
        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_update.name)

    async def patch_provider(self, provider_id: UUID, provider_patch: ToolProviderPatch) -> ToolProvider:
        """Patch a tool provider.

        Args:
            provider_id: UUID of the provider to patch
            provider_patch: ToolProviderPatch instance with partial update data

        Returns:
            Updated ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ValidationError: If patch data is invalid
            ProviderNameConflictError: If new name conflicts with existing provider

        """
        provider = await self.get_provider(provider_id)

        # Capture the name that will be used (for error handling if needed)
        provider_name = provider_patch.name if provider_patch.name is not None else provider.name

        # Apply patch fields if they are provided (not None)
        if provider_patch.name is not None:
            provider.name = provider_patch.name

        if provider_patch.description is not None:
            provider.description = provider_patch.description

        if provider_patch.enabled is not None:
            provider.enabled = provider_patch.enabled

        if provider_patch.configuration is not None:
            # Validate merged configuration. Pydantic validates when the property is set.
            provider.configuration = provider_patch.configuration

        provider.updated_by = self.user.id
        provider.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            await self.session.refresh(provider)
            return provider
        except IntegrityError as e:
            # Use the captured provider name for error handling (don't access provider.name after rollback)
            await self._handle_integrity_error(e, provider_name)

    async def delete_provider(self, provider_id: UUID) -> None:
        """Soft delete a tool provider and associated tools.

        Args:
            provider_id: UUID of the provider to delete

        Raises:
            ProviderNotFoundError: If provider doesn't exist

        """
        provider = await self.get_provider(provider_id)

        # Soft delete provider
        provider.deleted_at = datetime.now(UTC)
        provider.deleted_by = self.user.id

        # Soft delete associated tools
        tools_query = select(Tool).filter(Tool.provider_id == provider_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
        tools_result = await self.session.execute(tools_query)
        tools = tools_result.scalars().all()

        for tool in tools:
            tool.deleted_at = datetime.now(UTC)
            tool.deleted_by = self.user.id

        await self.session.flush()

    async def validate_provider(self, provider_id: UUID) -> ToolProviderValidationResult:
        """Validate tool provider connection.

        Args:
            provider_id: UUID of the provider to validate

        Returns:
            ToolProviderValidationResult instance with status and details

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ProviderError: If validation fails

        """
        provider = await self.get_provider(provider_id)

        try:
            # Get provider adapter from factory
            provider_type = provider.configuration["provider_type"]
            config_params = {k: v for k, v in provider.configuration.items() if k != "provider_type"}
            adapter = self.provider_factory.create_provider_instance(provider_type, **config_params)

            # Validate connection
            validation_result = await adapter.validate_connection()

            # Update provider status based on validation
            if validation_result.valid:
                provider.status = ProviderStatus.AVAILABLE
                provider.last_validated_at = datetime.now(UTC)
                provider.validation_error = None
            else:
                provider.status = ProviderStatus.ERROR
                provider.validation_error = validation_result.error

            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            await self.session.flush()
            await self.session.refresh(provider)

            # Return the ToolProviderValidationResult with updated timestamp
            return ToolProviderValidationResult(
                valid=validation_result.valid,
                provider_type=validation_result.provider_type,
                validated_at=provider.last_validated_at or datetime.now(UTC),
                error=validation_result.error,
            )

        except Exception as e:
            # Update provider status to error
            provider.status = ProviderStatus.ERROR
            provider.validation_error = str(e)
            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            await self.session.flush()

            msg = f"Provider validation failed: {e}"
            raise ProviderError(msg) from e

    async def refresh_tools(self, provider_id: UUID) -> ToolProviderRefreshResult:
        """Refresh tools from tool provider.

        Args:
            provider_id: UUID of the provider to refresh

        Returns:
            ToolProviderRefreshResult instance with refresh statistics

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ProviderError: If refresh fails

        """
        provider = await self.get_provider(provider_id)

        if provider.status != ProviderStatus.AVAILABLE:
            msg = f"Provider {provider_id} is not available for tool refresh"
            raise ProviderError(msg)

        try:
            # Get provider adapter from factory
            provider_type = provider.configuration["provider_type"]
            config_params = {k: v for k, v in provider.configuration.items() if k != "provider_type"}
            adapter = self.provider_factory.create_provider_instance(provider_type, **config_params)

            # Refresh tools from provider
            tools_metadata = await adapter.refresh_tools()

            refreshed_count = 0
            updated_count = 0
            disabled_count = 0

            # Get existing tools for this provider
            existing_tools_query = select(Tool).filter(Tool.provider_id == provider_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
            existing_tools_result = await self.session.execute(existing_tools_query)
            existing_tools = {tool.name: tool for tool in existing_tools_result.scalars().all()}

            # Track which tools were found during refresh
            found_tool_names = set()

            # Update or create tools
            for tool_metadata in tools_metadata:
                found_tool_names.add(tool_metadata.name)
                namespaced_name = f"{provider.name}::{tool_metadata.name}"

                if tool_metadata.name in existing_tools:
                    # Update existing tool
                    tool = existing_tools[tool_metadata.name]
                    tool.description = tool_metadata.description
                    tool.last_refreshed_at = datetime.now(UTC)
                    tool.refresh_error = None
                    tool.updated_by = self.user.id
                    tool.updated_at = datetime.now(UTC)
                    updated_count += 1
                else:
                    # Create new tool
                    tool = Tool(
                        provider_id=provider_id,
                        name=tool_metadata.name,
                        namespaced_name=namespaced_name,
                        description=tool_metadata.description,
                        enabled=True,
                        last_refreshed_at=datetime.now(UTC),
                        created_by=self.user.id,
                        updated_by=self.user.id,
                    )
                    self.session.add(tool)
                    refreshed_count += 1

            # Disable tools that were not found in refresh
            for tool_name, tool in existing_tools.items():
                if tool_name not in found_tool_names:
                    tool.enabled = False
                    tool.status = ToolStatus.MISSING
                    tool.updated_by = self.user.id
                    tool.updated_at = datetime.now(UTC)
                    disabled_count += 1

            # Update provider metadata
            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            await self.session.flush()

            return ToolProviderRefreshResult(
                refreshed_count=refreshed_count,
                updated_count=updated_count,
                disabled_count=disabled_count,
                refreshed_at=datetime.now(UTC),
            )

        except Exception as e:
            msg = f"Tool refresh failed: {e}"
            raise ProviderError(msg) from e
