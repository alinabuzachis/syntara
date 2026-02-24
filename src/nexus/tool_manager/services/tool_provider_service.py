"""Tool Provider Service for database operations and business logic.

This module provides the service layer for Tool Provider management, wrapping
core domain logic with database persistence and transaction management.
"""

from collections.abc import Iterable
from datetime import UTC, datetime
from typing import Any, NoReturn
from uuid import UUID

import structlog
from sqlalchemy import Select, text
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlmodel.sql._expression_select_cls import SelectOfScalar

from nexus.core.models import User
from nexus.core.services import BaseService
from nexus.core.services.extensions import ConvertResourceMixin
from nexus.core.utils.filters import Filter
from nexus.tool_manager.exceptions import (
    ProviderNameConflictError,
    ProviderNotFoundError,
    ToolRefreshError,
)
from nexus.tool_manager.lib.providers.factory import ProviderFactory
from nexus.tool_manager.models.tool import Tool, ToolParameter, ToolStatus
from nexus.tool_manager.models.tool_provider import (
    ProviderStatus,
    ToolProvider,
    ToolProviderBase,
    ToolProviderCreate,
    ToolProviderListResponse,
    ToolProviderPatch,
    ToolProviderWithConfiguration,
)
from nexus.tool_manager.models.tool_provider_configuration import ProviderConfiguration
from nexus.tool_manager.models.tool_provider_refresh_result import ToolProviderRefreshResult
from nexus.tool_manager.models.tool_provider_validation_result import ToolProviderValidationResult

SelectToolProvider = Select[tuple[ToolProvider]] | SelectOfScalar[tuple[ToolProvider]]

logger = structlog.stdlib.get_logger(__name__)


class ToolProviderServiceConvertResourceMixin(ConvertResourceMixin):
    """Mixin for converting ToolProvider resources to ToolProviderWithConfiguration format."""

    def convert_resource(self, resource: ToolProvider) -> ToolProviderWithConfiguration:  # type: ignore[override]
        """Convert ToolProvider to ToolProviderWithConfiguration format."""
        return ToolProviderWithConfiguration.model_validate(resource)


class ToolProviderService(BaseService):
    """Service for Tool Provider CRUD operations and business logic.

    This service handles database persistence, transaction management, and integrates
    with the provider factory for validation and tool refresh operations.
    """

    def __init__(self, session: AsyncSession, user: User, provider_factory: ProviderFactory) -> None:
        """Initialize service with database session, current user, and provider factory.

        Args:
            session: Async database session for operations
            user: Current authenticated user for audit tracking
            provider_factory: Shared provider factory instance from application state

        """
        super().__init__(session, user, convert_resource_mixin=ToolProviderServiceConvertResourceMixin())
        self.provider_factory = provider_factory

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

    def _get_special_field_handlers(self) -> dict[str, Any]:
        """Get special field handlers for tool provider specific filtering.

        Returns:
            Dict mapping field names to handler functions

        """

        def handle_provider_type(
            query: SelectToolProvider, filter_obj: Filter, _model: type[ToolProvider]
        ) -> SelectToolProvider:
            if filter_obj.operator.value == "eq":
                return query.filter(text("configuration->>'provider_type' = :value")).params(value=filter_obj.value)
            return query

        return {
            "provider_type": handle_provider_type,
            "configuration.provider_type": handle_provider_type,
        }

    async def _validate_provider_connection(
        self, provider_name: str, configuration: ProviderConfiguration, provider_id: UUID | None = None
    ) -> ToolProviderValidationResult:
        """Perform connection validation using configuration without updating database.

        Args:
            provider_name: Provider name
            configuration: Provider configuration containing provider_type and parameters
            provider_id: Optional provider ID (will generate temporary ID if not provided)

        Returns:
            ToolProviderValidationResult from the adapter's validate_connection method

        """
        # Extract provider type and configuration parameters
        provider_type = configuration.provider_type
        config_params = {k: v for k, v in configuration.model_dump().items() if k != "provider_type"}
        # Add provider context for adapters that need it
        config_params["provider_id"] = provider_id
        config_params["provider_name"] = provider_name

        # Create provider adapter from factory
        adapter = self.provider_factory.create_provider_instance(provider_type, **config_params)

        # Validate connection using the adapter
        return await adapter.validate_connection()

    async def _create_or_update_tool_parameters(self, tool: Tool, tool_parameters: list[ToolParameter]) -> None:
        """Create or update tool parameters for a given tool.

        Args:
            tool: Tool instance to create/update parameters for
            tool_parameters: List of ToolParameter instances to persist

        """
        # Clear existing parameters for this tool
        existing_params_query = select(ToolParameter).filter(ToolParameter.tool_id == tool.id)  # type: ignore[arg-type]
        existing_params_result = await self.session.exec(existing_params_query)
        existing_params = existing_params_result.all()

        for param in existing_params:
            await self.session.delete(param)

        # Create new parameter objects to ensure SQLAlchemy integrity
        for tool_parameter in tool_parameters:
            new_tool_parameter = ToolParameter(
                tool_id=tool.id,
                name=str(tool_parameter.name),
                type=tool_parameter.type,
                description=str(tool_parameter.description) if tool_parameter.description else "",
                required=bool(tool_parameter.required) if hasattr(tool_parameter, "required") else False,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            self.session.add(new_tool_parameter)

    async def _update_existing_tool(self, tool: Tool, tool_metadata: Tool) -> None:
        """Update an existing tool with metadata from the provider.

        Args:
            tool: Existing tool to update
            tool_metadata: Tool metadata from the provider

        """
        tool.description = tool_metadata.description
        tool.last_refreshed_at = datetime.now(UTC)
        tool.refresh_error = None
        tool.updated_by = self.user.id
        tool.updated_at = datetime.now(UTC)

        # Update tool parameters using helper method
        existing_tool_parameters: list[ToolParameter] = (
            tool_metadata.parameters.copy() if hasattr(tool_metadata, "parameters") and tool_metadata.parameters else []
        )
        await self._create_or_update_tool_parameters(tool, existing_tool_parameters)

    async def _create_new_tool(self, provider: ToolProviderBase, tool_metadata: Tool, namespaced_name: str) -> Tool:
        """Create a new tool from provider metadata.

        Args:
            provider: The provider this tool belongs to
            tool_metadata: Tool metadata from the provider
            namespaced_name: The namespaced name for the tool

        Returns:
            The created tool instance

        """
        # Create new tool
        new_tool = Tool(
            provider_id=provider.id,
            name=tool_metadata.name,
            namespaced_name=namespaced_name,
            description=tool_metadata.description,
            enabled=True,
            last_refreshed_at=datetime.now(UTC),
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(new_tool)

        # Update tool parameters using helper method
        new_tool_parameters: list[ToolParameter] = (
            tool_metadata.parameters.copy() if hasattr(tool_metadata, "parameters") and tool_metadata.parameters else []
        )
        await self._create_or_update_tool_parameters(new_tool, new_tool_parameters)

        return new_tool

    async def _disable_missing_tools(self, existing_tools: dict[str, Tool], found_tool_names: set[str]) -> int:
        """Disable tools that were not found in the current refresh.

        Args:
            existing_tools: Dictionary of existing tools by name
            found_tool_names: Set of tool names found in current refresh

        Returns:
            Number of tools that were disabled

        """
        disabled_count = 0
        for tool_name, tool in existing_tools.items():
            if tool_name not in found_tool_names:
                tool.enabled = False
                tool.status = ToolStatus.MISSING
                tool.updated_by = self.user.id
                tool.updated_at = datetime.now(UTC)
                disabled_count += 1
        return disabled_count

    async def list_providers(
        self,
        limit: int = 100,
        cursor: str | None = None,
        sort: str | None = None,
        query_params_items: Iterable[tuple[str, str]] | None = None,
        *,
        include_total: bool = False,
    ) -> ToolProviderListResponse:
        """List tool providers with filtering, sorting, and pagination.

        Args:
            limit: Maximum number of providers to return (max 100)
            cursor: Cursor token for pagination
            sort: Sort parameter (e.g., "name", "-created_at")
            query_params_items: Raw query parameter items from request (for filtering)
            include_total: Whether to include total count in response

        Returns:
            ToolProviderListResponse with providers, pagination metadata, and optional total

        """
        # Get special field handlers for JSON configuration fields
        special_field_handlers = self._get_special_field_handlers()

        # Use unified list_resources method (fields read from model automatically)
        return await self.list_resources(
            model=ToolProvider,
            response_type=ToolProviderListResponse,
            limit=limit,
            cursor=cursor,
            sort=sort,
            special_field_handlers=special_field_handlers,
            query_params_items=query_params_items,
            include_total=include_total,
        )

    async def create_provider(self, provider_create: ToolProviderCreate) -> ToolProviderWithConfiguration:
        """Create a new tool provider without validation or tool discovery.

        This method only creates the provider instance with VALIDATING status.
        Use validate_provider() to validate the connection and set status to AVAILABLE/ERROR.
        Use refresh_tools() to discover and create tools once the provider is validated.

        Args:
            provider_create: ToolProviderCreate instance with provider data

        Returns:
            Created ToolProvider instance with VALIDATING status

        Raises:
            ProviderNameConflictError: If provider name already exists
            pydantic.ValidationError: If provider data is invalid

        """
        # Create provider instance from ToolProviderCreate
        provider = ToolProvider(
            name=provider_create.name,
            description=provider_create.description,
            configuration=provider_create.configuration,
            enabled=True,
            status=ProviderStatus.VALIDATING,
            created_by=self.user.id,
            updated_by=self.user.id,
        )

        self.session.add(provider)

        try:
            await self.session.flush()
            logger.info("Successfully created provider with VALIDATING status", provider_name=provider.name)
            return ToolProviderWithConfiguration.model_validate(provider)

        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_create.name)

    async def get_provider(self, provider_id: UUID) -> ToolProviderWithConfiguration:
        """Get a tool provider by ID.

        Args:
            provider_id: UUID of the provider

        Returns:
            ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist or is deleted

        """
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        return ToolProviderWithConfiguration.model_validate(provider)

    async def update_provider(
        self, provider_id: UUID, provider_update: ToolProviderCreate
    ) -> ToolProviderWithConfiguration:
        """Update a tool provider (complete replacement).

        Args:
            provider_id: UUID of the provider to update
            provider_update: ToolProviderCreate instance with new provider data

        Returns:
            Updated ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ProviderNameConflictError: If new name conflicts with existing provider
            pydantic.ValidationError: If update data is invalid

        """
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        # Update fields from ToolProviderCreate
        provider.name = provider_update.name
        provider.description = provider_update.description
        provider.configuration = provider_update.configuration

        provider.updated_by = self.user.id
        provider.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            return await self.get_provider(provider.id)

        except IntegrityError as e:
            await self._handle_integrity_error(e, provider_update.name)

    async def patch_provider(
        self, provider_id: UUID, provider_patch: ToolProviderPatch
    ) -> ToolProviderWithConfiguration:
        """Patch a tool provider.

        Args:
            provider_id: UUID of the provider to patch
            provider_patch: ToolProviderPatch instance with partial update data

        Returns:
            Updated ToolProvider instance

        Raises:
            ProviderNotFoundError: If provider doesn't exist
            ProviderNameConflictError: If new name conflicts with existing provider
            pydantic.ValidationError: If patch data is invalid

        """
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        # Capture the name that will be used (for error handling if needed)
        provider_name = provider_patch.name if provider_patch.name is not None else provider.name

        # Apply patch fields if they are provided (not None)
        if provider_patch.name is not None:
            provider.name = provider_patch.name

        if provider_patch.description is not None:
            provider.description = provider_patch.description

        if provider_patch.enabled is not None:
            provider.enabled = provider_patch.enabled

        if provider_patch.status is not None:
            provider.status = provider_patch.status

        # Handle validation_error - check if field was explicitly provided (including None)
        if "validation_error" in provider_patch.model_fields_set:
            provider.validation_error = provider_patch.validation_error

        if provider_patch.configuration is not None:
            # Validate merged configuration. Pydantic validates when the property is set.
            provider.configuration = provider_patch.configuration

        provider.updated_by = self.user.id
        provider.updated_at = datetime.now(UTC)

        try:
            await self.session.flush()
            return await self.get_provider(provider.id)

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
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        # Soft delete provider
        provider.deleted_at = datetime.now(UTC)
        provider.deleted_by = self.user.id

        # Soft delete associated tools
        tools_query = select(Tool).filter(Tool.provider_id == provider_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
        tools_result = await self.session.exec(tools_query)
        tools = tools_result.all()

        for tool in tools:
            tool.deleted_at = datetime.now(UTC)
            tool.deleted_by = self.user.id

    async def validate_provider(self, provider_id: UUID) -> ToolProviderValidationResult:
        """Validate tool provider connection.

        Args:
            provider_id: UUID of the provider to validate

        Returns:
            ToolProviderValidationResult instance with status and details (never raises exceptions)

        Raises:
            ProviderNotFoundError: If provider doesn't exist

        """
        query = select(ToolProvider).filter(ToolProvider.id == provider_id, ToolProvider.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]

        result = await self.session.exec(query)
        provider = result.one_or_none()

        if not provider:
            msg = f"Provider {provider_id} not found"
            raise ProviderNotFoundError(msg)

        try:
            # Use shared validation method
            validation_result = await self._validate_provider_connection(
                provider.name, provider.configuration, provider.id
            )

            # Update provider status based on validation
            provider.status = ProviderStatus.AVAILABLE if validation_result.valid else ProviderStatus.ERROR
            provider.validation_error = None if validation_result.valid else validation_result.error
            provider.last_validated_at = validation_result.validated_at
            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            # Always return validation result - never raise exceptions for validation failures
            return ToolProviderValidationResult(
                valid=validation_result.valid,
                provider_type=validation_result.provider_type,
                validated_at=provider.last_validated_at or datetime.now(UTC),
                error=validation_result.error,
            )

        except Exception as e:  # noqa: BLE001
            # Handle other exceptions gracefully and return validation failure result
            provider.status = ProviderStatus.ERROR
            provider.validation_error = str(e)
            provider.last_validated_at = datetime.now(UTC)
            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            return ToolProviderValidationResult(
                valid=False,
                provider_type=provider.configuration.provider_type,
                validated_at=datetime.now(UTC),
                error=str(e),
            )

    async def validate_provider_definition(self, provider: ToolProviderCreate) -> ToolProviderValidationResult:
        """Validate tool provider definition without saving to database.

        Validates the provider configuration and tests connectivity using the appropriate adapter.
        This method does not persist any data to the database and never raises exceptions.

        Args:
            provider: Provider configuration to test

        Returns:
            ToolProviderValidationResult instance with test results (never raises exceptions)

        """
        try:
            # Validate provider configuration
            validation_result = await self._validate_provider_connection(provider.name, provider.configuration)

            # Return validation result as-is (no database updates needed)
            return ToolProviderValidationResult(
                valid=validation_result.valid,
                provider_type=validation_result.provider_type,
                validated_at=datetime.now(UTC),
                error=validation_result.error,
            )

        except Exception as e:  # noqa: BLE001
            # Handle all exceptions gracefully and return validation failure result
            return ToolProviderValidationResult(
                valid=False,
                provider_type=provider.configuration.provider_type,
                validated_at=datetime.now(UTC),
                error=str(e),
            )

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
            raise ToolRefreshError(msg)

        try:
            # Get provider adapter from factory
            provider_type = provider.configuration.provider_type
            config_params = {k: v for k, v in provider.configuration.model_dump().items() if k != "provider_type"}
            # Add provider context for adapters that need it
            config_params["provider_id"] = provider.id
            config_params["provider_name"] = provider.name
            adapter = self.provider_factory.create_provider_instance(provider_type, **config_params)

            # Refresh tools from provider
            tools_metadata = await adapter.refresh_tools()

            refreshed_count = 0
            updated_count = 0

            # Get existing tools for this provider
            existing_tools_query = select(Tool).filter(Tool.provider_id == provider_id, Tool.deleted_at.is_(None))  # type: ignore[union-attr,arg-type]
            existing_tools_result = await self.session.exec(existing_tools_query)
            existing_tools = {tool.name: tool for tool in existing_tools_result.all()}

            # Track which tools were found during refresh
            found_tool_names = set()

            # Update or create tools
            for tool_metadata in tools_metadata:
                found_tool_names.add(tool_metadata.name)
                namespaced_name = f"{provider.name}::{tool_metadata.name}"

                if tool_metadata.name in existing_tools:
                    # Update existing tool
                    tool = existing_tools[tool_metadata.name]
                    await self._update_existing_tool(tool, tool_metadata)
                    updated_count += 1
                else:
                    # Create new tool
                    await self._create_new_tool(provider, tool_metadata, namespaced_name)
                    refreshed_count += 1

            # Disable tools that were not found in refresh
            disabled_count = await self._disable_missing_tools(existing_tools, found_tool_names)

            # Update provider metadata
            provider.updated_by = self.user.id
            provider.updated_at = datetime.now(UTC)

            return ToolProviderRefreshResult(
                refreshed_count=refreshed_count,
                updated_count=updated_count,
                disabled_count=disabled_count,
                refreshed_at=datetime.now(UTC),
            )

        except Exception as e:
            msg = f"Tool refresh failed: {e}"
            raise ToolRefreshError(msg) from e
