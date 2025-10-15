"""Core domain models, exceptions, and functions for tool management."""

import logging
from abc import abstractmethod
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import Any, Protocol
from uuid import UUID, uuid4

from nexus_tool_manager.models import (
    BulkUpdateResult,
    ConnectionValidationResult,
    ToolMetricsSummary,
    ToolRefreshResult,
    ToolValidationResult,
)

# Configure logger
logger = logging.getLogger(__name__)


# Domain Exceptions
class ToolManagerError(Exception):
    """Base exception for tool management errors."""


class ProviderError(ToolManagerError):
    """Exception raised for provider-related errors."""


class ToolNotFoundError(ToolManagerError):
    """Exception raised when a tool is not found."""


class ValidationError(ToolManagerError):
    """Exception raised for validation errors."""


class ProviderNotFoundError(ToolManagerError):
    """Exception raised when a provider is not found."""


# Enums
class ProviderStatus(Enum):
    """Status of a tool provider."""

    AVAILABLE = "available"
    ERROR = "error"
    VALIDATING = "validating"


class ToolExecutionStatus(Enum):
    """Status of a tool execution."""

    SUCCESS = "success"
    FAILURE = "failure"
    TIMEOUT = "timeout"
    PENDING = "pending"


# Domain Models
@dataclass
class ToolParameter:
    """Parameter definition for a tool."""

    name: str
    type: str
    description: str
    required: bool = True
    default: Any = None
    constraints: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert parameter to dictionary representation."""
        return {
            "name": self.name,
            "type": self.type,
            "description": self.description,
            "required": self.required,
            "default": self.default,
            "constraints": self.constraints,
        }


@dataclass
class Tool:
    """Core tool domain model."""

    id: UUID = field(default_factory=uuid4)
    provider_id: UUID | None = None
    name: str = ""
    namespaced_name: str = ""
    description: str = ""
    input_schema: dict[str, Any] = field(default_factory=dict)
    parameters: list[ToolParameter] = field(default_factory=list)
    enabled: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Convert tool to dictionary representation."""
        return {
            "id": str(self.id),
            "provider_id": str(self.provider_id) if self.provider_id else None,
            "name": self.name,
            "namespaced_name": self.namespaced_name,
            "description": self.description,
            "input_schema": self.input_schema,
            "parameters": [param.to_dict() for param in self.parameters],
            "enabled": self.enabled,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class Provider:
    """Core provider domain model."""

    id: UUID = field(default_factory=uuid4)
    name: str = ""
    description: str = ""
    provider_type: str = ""
    configuration: dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    status: ProviderStatus = ProviderStatus.AVAILABLE
    last_validated_at: datetime | None = None
    created_at: datetime = field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Convert provider to dictionary representation."""
        return {
            "id": str(self.id),
            "name": self.name,
            "description": self.description,
            "provider_type": self.provider_type,
            "configuration": self.configuration,
            "enabled": self.enabled,
            "status": self.status.value,
            "last_validated_at": self.last_validated_at.isoformat() if self.last_validated_at else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


@dataclass
class ToolExecution:
    """Tool execution record."""

    id: UUID = field(default_factory=uuid4)
    tool_id: UUID | None = None
    provider_id: UUID | None = None
    user_id: UUID | None = None
    status: ToolExecutionStatus = ToolExecutionStatus.PENDING
    duration_ms: int = 0
    input_data: dict[str, Any] = field(default_factory=dict)
    output_data: dict[str, Any] = field(default_factory=dict)
    error_message: str | None = None
    executed_at: datetime = field(default_factory=lambda: datetime.now(UTC))

    def to_dict(self) -> dict[str, Any]:
        """Convert execution to dictionary representation."""
        return {
            "id": str(self.id),
            "tool_id": str(self.tool_id) if self.tool_id else None,
            "provider_id": str(self.provider_id) if self.provider_id else None,
            "user_id": str(self.user_id) if self.user_id else None,
            "status": self.status.value,
            "duration_ms": self.duration_ms,
            "input_data": self.input_data,
            "output_data": self.output_data,
            "error_message": self.error_message,
            "executed_at": self.executed_at.isoformat(),
        }


# Pagination and filtering support
@dataclass
class PaginationParams:
    """Parameters for pagination."""

    limit: int = 20
    cursor: str | None = None
    include_total: bool = False


@dataclass
class FilterParam:
    """Filter parameter for queries."""

    field: str
    operator: str
    value: Any

    def __post_init__(self) -> None:
        """Validate filter parameters."""
        # Validate field is not empty
        if not self.field or not isinstance(self.field, str):
            msg = "Filter field must be a non-empty string"
            raise ValidationError(msg)

        # Validate operator
        valid_operators = {"eq", "ne", "contains", "gt", "gte", "lt", "lte", "in"}
        if self.operator not in valid_operators:
            msg = f"Invalid operator '{self.operator}'. Valid operators: {valid_operators}"
            raise ValidationError(msg)

        # Validate value is provided for operators that require it
        # All current operators require a value
        if self.value is None:
            msg = f"Filter value cannot be None for operator '{self.operator}'"
            raise ValidationError(msg)


@dataclass
class PaginationResult:
    """Result of a paginated query."""

    items: list[Any]
    next_cursor: str | None = None
    has_more: bool = False
    total: int | None = None


# Repository Interfaces
class ProviderRepository(Protocol):
    """Repository interface for provider data persistence."""

    @abstractmethod
    async def create(self, provider: Provider) -> Provider:
        """Create a new provider."""

    @abstractmethod
    async def get_by_id(self, provider_id: UUID) -> Provider | None:
        """Get provider by ID."""

    @abstractmethod
    async def get_by_name(self, name: str) -> Provider | None:
        """Get provider by name."""

    @abstractmethod
    async def list_providers(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List providers with optional filtering and pagination."""

    @abstractmethod
    async def update(self, provider: Provider) -> Provider:
        """Update an existing provider."""

    @abstractmethod
    async def delete(self, provider_id: UUID) -> bool:
        """Delete a provider."""


class ToolRepository(Protocol):
    """Repository interface for tool data persistence."""

    @abstractmethod
    async def create(self, tool: Tool) -> Tool:
        """Create a new tool."""

    @abstractmethod
    async def get_by_id(self, tool_id: UUID) -> Tool | None:
        """Get tool by ID."""

    @abstractmethod
    async def get_by_namespaced_name(self, namespaced_name: str) -> Tool | None:
        """Get tool by namespaced name."""

    @abstractmethod
    async def list_tools(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List tools with optional filtering and pagination."""

    @abstractmethod
    async def update(self, tool: Tool) -> Tool:
        """Update an existing tool."""

    @abstractmethod
    async def delete(self, tool_id: UUID) -> bool:
        """Delete a tool."""

    @abstractmethod
    async def bulk_update_enabled(self, tool_ids: list[UUID], *, enabled: bool) -> int:
        """Bulk update enabled status for multiple tools."""


class ExecutionRepository(Protocol):
    """Repository interface for tool execution data persistence."""

    @abstractmethod
    async def create(self, execution: ToolExecution) -> ToolExecution:
        """Create a new execution record."""

    @abstractmethod
    async def get_by_id(self, execution_id: UUID) -> ToolExecution | None:
        """Get execution by ID."""

    @abstractmethod
    async def list_executions(
        self,
        filters: list[FilterParam] | None = None,
        pagination: PaginationParams | None = None,
    ) -> PaginationResult:
        """List executions with optional filtering and pagination."""


# Cache Adapter Interface
class CacheAdapter(Protocol):
    """Interface for caching operations."""

    @abstractmethod
    async def get(self, key: str) -> Any | None:  # noqa: ANN401
        """Get value from cache."""

    @abstractmethod
    async def set(self, key: str, value: Any, ttl: int | None = None) -> None:  # noqa: ANN401
        """Set value in cache with optional TTL."""

    @abstractmethod
    async def delete(self, key: str) -> None:
        """Delete value from cache."""

    @abstractmethod
    async def clear_pattern(self, pattern: str) -> int:
        """Clear all keys matching pattern."""


# Core provider management functions
async def register_provider(
    name: str,
    description: str,
    provider_type: str,
    configuration: dict[str, Any],
    provider_repo: ProviderRepository,
) -> Provider:
    """Register a new tool provider.

    Args:
        name: Unique name for the provider
        description: Human-readable description
        provider_type: Type identifier for the provider
        configuration: Provider-specific configuration
        provider_repo: Repository for provider persistence

    Returns:
        Provider: The created provider instance

    Raises:
        ValidationError: If a provider with the same name already exists

    """
    logger.info("Registering new provider: %s (type: %s)", name, provider_type)

    # Check if provider name already exists
    existing = await provider_repo.get_by_name(name)
    if existing:
        msg = f"Provider with name '{name}' already exists"
        raise ValidationError(msg)

    provider = Provider(
        name=name,
        description=description,
        provider_type=provider_type,
        configuration=configuration,
    )

    created_provider = await provider_repo.create(provider)
    logger.info("Successfully registered provider: %s (ID: %s)", created_provider.name, created_provider.id)
    return created_provider


async def list_providers(
    filters: list[FilterParam] | None = None,
    pagination: PaginationParams | None = None,
    provider_repo: ProviderRepository | None = None,
) -> PaginationResult:
    """List providers with optional filtering and pagination.

    Args:
        filters: Optional list of filter parameters
        pagination: Optional pagination parameters
        provider_repo: Repository for provider data access

    Returns:
        PaginationResult: Paginated list of providers

    Raises:
        ValueError: If provider_repo is None (no default available)

    """
    if provider_repo is None:
        msg = "provider_repo parameter is required"
        raise ValueError(msg)

    logger.debug("Listing providers with %d filters", len(filters) if filters else 0)
    result = await provider_repo.list_providers(filters, pagination)
    logger.debug("Found %d providers (total: %s)", len(result.items), result.total)
    return result


async def get_provider_detail(
    provider_id: UUID,
    provider_repo: ProviderRepository,
) -> Provider:
    """Get detailed information about a provider.

    Args:
        provider_id: ID of the provider to retrieve
        provider_repo: Repository for provider data access

    Returns:
        Provider: The provider instance

    Raises:
        ProviderNotFoundError: If provider doesn't exist

    """
    logger.debug("Retrieving provider details: %s", provider_id)

    provider = await provider_repo.get_by_id(provider_id)
    if not provider:
        msg = f"Provider with ID '{provider_id}' not found"
        raise ProviderNotFoundError(msg)

    return provider


async def update_provider(
    provider_id: UUID,
    updates: dict[str, Any],
    provider_repo: ProviderRepository,
) -> Provider:
    """Update provider configuration and settings.

    Args:
        provider_id: ID of the provider to update
        updates: Dictionary of fields to update
        provider_repo: Repository for provider persistence

    Returns:
        Provider: The updated provider instance

    Raises:
        ProviderNotFoundError: If provider doesn't exist
        ValidationError: If update data is invalid

    """
    logger.info("Updating provider: %s", provider_id)

    provider = await provider_repo.get_by_id(provider_id)
    if not provider:
        msg = f"Provider with ID '{provider_id}' not found"
        raise ProviderNotFoundError(msg)

    # Apply updates
    for f, value in updates.items():
        if hasattr(provider, f):
            setattr(provider, f, value)
        else:
            logger.warning("Ignoring unknown field in update: %s", f)

    updated_provider = await provider_repo.update(provider)
    logger.info("Successfully updated provider: %s", updated_provider.id)
    return updated_provider


async def delete_provider(
    provider_id: UUID,
    provider_repo: ProviderRepository,
) -> bool:
    """Delete a provider (soft delete).

    Args:
        provider_id: ID of the provider to delete
        provider_repo: Repository for provider persistence

    Returns:
        bool: True if provider was deleted, False if not found

    """
    logger.info("Deleting provider: %s", provider_id)

    result = await provider_repo.delete(provider_id)
    if result:
        logger.info("Successfully deleted provider: %s", provider_id)
    else:
        logger.warning("Provider not found for deletion: %s", provider_id)

    return result


async def validate_provider_connection(
    provider_id: UUID,
    provider_repo: ProviderRepository,
    provider_adapter: Any,  # noqa: ANN401, ToolProviderAdapter - avoiding import cycle
) -> ConnectionValidationResult:
    """Validate connection to a provider.

    Args:
        provider_id: ID of the provider to validate
        provider_repo: Repository for provider data access
        provider_adapter: Provider adapter instance

    Returns:
        dict: Validation result with connection details

    Raises:
        ProviderNotFoundError: If provider doesn't exist

    """
    logger.info("Validating provider connection: %s", provider_id)

    provider = await provider_repo.get_by_id(provider_id)
    if not provider:
        msg = f"Provider with ID '{provider_id}' not found"
        raise ProviderNotFoundError(msg)

    try:
        # Update provider status to validating
        provider.status = ProviderStatus.VALIDATING
        await provider_repo.update(provider)

        # Perform validation
        validation_result: ConnectionValidationResult = await provider_adapter.validate_connection()

        # Update provider status based on result
        if validation_result.valid:
            provider.status = ProviderStatus.AVAILABLE
            provider.last_validated_at = datetime.now(UTC)
        else:
            provider.status = ProviderStatus.ERROR

        await provider_repo.update(provider)

        logger.info("Provider validation completed: %s (valid: %s)", provider_id, validation_result.valid)
        return validation_result

    except Exception:
        # Update provider status to error
        provider.status = ProviderStatus.ERROR
        await provider_repo.update(provider)
        logger.exception("Provider validation failed: %s", provider_id)
        raise


# Core tool management functions
async def refresh_tools(
    provider_id: UUID,
    provider_repo: ProviderRepository,
    tool_repo: ToolRepository,
    provider_adapter: Any,  # noqa: ANN401, ToolProviderAdapter - avoiding import cycle
) -> ToolRefreshResult:
    """Refresh tools from a provider.

    Args:
        provider_id: ID of the provider to refresh tools from
        provider_repo: Repository for provider data access
        tool_repo: Repository for tool persistence
        provider_adapter: Provider adapter instance

    Returns:
        dict: Refresh statistics (refreshed_count, updated_count, etc.)

    Raises:
        ProviderNotFoundError: If provider doesn't exist

    """
    logger.info("Refreshing tools from provider: %s", provider_id)

    provider = await provider_repo.get_by_id(provider_id)
    if not provider:
        msg = f"Provider with ID '{provider_id}' not found"
        raise ProviderNotFoundError(msg)

    try:
        # Fetch tools from provider
        discovered_tools = await provider_adapter.refresh_tools()

        refreshed_count = 0
        updated_count = 0

        for tool_data in discovered_tools:
            # Set provider_id and create namespaced name
            tool_data.provider_id = provider_id
            if not tool_data.namespaced_name:
                tool_data.namespaced_name = f"{provider.name}::{tool_data.name}"

            # Check if tool exists
            existing_tool = await tool_repo.get_by_namespaced_name(tool_data.namespaced_name)

            if existing_tool:
                # Update existing tool
                existing_tool.description = tool_data.description
                existing_tool.input_schema = tool_data.input_schema
                existing_tool.parameters = tool_data.parameters
                await tool_repo.update(existing_tool)
                updated_count += 1
            else:
                # Create new tool
                await tool_repo.create(tool_data)
                refreshed_count += 1

        result = ToolRefreshResult(
            refreshed_count=refreshed_count,
            updated_count=updated_count,
            disabled_count=0,  # Will be implemented in later tickets
            refreshed_at=datetime.now(UTC),
        )

        logger.info("Tool refresh completed for provider %s: %s", provider_id, result)
        return result

    except Exception:
        logger.exception("Tool refresh failed for provider %s", provider_id)
        raise


async def list_tools(
    filters: list[FilterParam] | None = None,
    pagination: PaginationParams | None = None,
    tool_repo: ToolRepository | None = None,
) -> PaginationResult:
    """List tools with optional filtering and pagination.

    Args:
        filters: Optional list of filter parameters
        pagination: Optional pagination parameters
        tool_repo: Repository for tool data access

    Returns:
        PaginationResult: Paginated list of tools

    Raises:
        ValueError: If tool_repo is None (no default available)

    """
    if tool_repo is None:
        msg = "tool_repo parameter is required"
        raise ValueError(msg)

    logger.debug("Listing tools with %d filters", len(filters) if filters else 0)
    result = await tool_repo.list_tools(filters, pagination)
    logger.debug("Found %d tools (total: %s)", len(result.items), result.total)
    return result


async def get_tool_detail(
    tool_id: UUID,
    tool_repo: ToolRepository,
) -> Tool:
    """Get detailed information about a tool.

    Args:
        tool_id: ID of the tool to retrieve
        tool_repo: Repository for tool data access

    Returns:
        Tool: The tool instance with full schema

    Raises:
        ToolNotFoundError: If tool doesn't exist

    """
    logger.debug("Retrieving tool details: %s", tool_id)

    tool = await tool_repo.get_by_id(tool_id)
    if not tool:
        msg = f"Tool with ID '{tool_id}' not found"
        raise ToolNotFoundError(msg)

    return tool


async def update_tool_enabled(
    tool_id: UUID,
    *,
    enabled: bool,
    tool_repo: ToolRepository,
) -> Tool:
    """Enable or disable a tool.

    Args:
        tool_id: ID of the tool to update
        enabled: Whether tool should be enabled
        tool_repo: Repository for tool persistence

    Returns:
        Tool: The updated tool instance

    Raises:
        ToolNotFoundError: If tool doesn't exist

    """
    logger.info("Updating tool enabled status: %s -> %s", tool_id, enabled)

    tool = await tool_repo.get_by_id(tool_id)
    if not tool:
        msg = f"Tool with ID '{tool_id}' not found"
        raise ToolNotFoundError(msg)

    tool.enabled = enabled
    updated_tool = await tool_repo.update(tool)

    logger.info("Successfully updated tool enabled status: %s", tool_id)
    return updated_tool


async def bulk_update_tools(
    tool_ids: list[UUID],
    *,
    enabled: bool,
    tool_repo: ToolRepository,
) -> BulkUpdateResult:
    """Bulk enable/disable multiple tools.

    Args:
        tool_ids: List of tool IDs to update
        enabled: Whether tools should be enabled
        tool_repo: Repository for tool persistence

    Returns:
        dict: Update statistics and results

    """
    logger.info("Bulk updating %d tools enabled status -> %s", len(tool_ids), enabled)

    updated_count = await tool_repo.bulk_update_enabled(tool_ids, enabled=enabled)

    result = BulkUpdateResult(
        updated_count=updated_count,
        requested_count=len(tool_ids),
        success=updated_count == len(tool_ids),
    )

    logger.info("Bulk tool update completed: %s", result)
    return result


async def validate_tool(
    tool_id: UUID,
    parameters: dict[str, Any] | None,
    tool_repo: ToolRepository,
    provider_adapter: Any,  # noqa: ANN401, ToolProviderAdapter - avoiding import cycle
) -> ToolValidationResult:
    """Validate tool functionality and server communication.

    Args:
        tool_id: ID of the tool to validate
        parameters: Optional parameters for validation
        tool_repo: Repository for tool data access
        provider_adapter: Provider adapter instance

    Returns:
        dict: Validation result with success status and timing

    Raises:
        ToolNotFoundError: If tool doesn't exist

    """
    logger.info("Validating tool: %s", tool_id)

    tool = await tool_repo.get_by_id(tool_id)
    if not tool:
        msg = f"Tool with ID '{tool_id}' not found"
        raise ToolNotFoundError(msg)

    start_time = datetime.now(UTC)

    try:
        validation_result: ToolValidationResult = await provider_adapter.validate_tool(tool.name, parameters or {})

        # Calculate duration
        end_time = datetime.now(UTC)
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        # Add timing information
        validation_result.duration_ms = duration_ms
        validation_result.validated_at = end_time

        logger.info(
            "Tool validation completed: %s (success: %s, duration: %dms)",
            tool_id,
            validation_result.success,
            duration_ms,
        )
        return validation_result

    except Exception:
        end_time = datetime.now(UTC)
        duration_ms = int((end_time - start_time).total_seconds() * 1000)

        logger.exception("Tool validation failed: %s", tool_id)

        return ToolValidationResult(
            success=False,
            duration_ms=duration_ms,
            status="failure",
            message="Tool validation failed",
            validated_at=end_time,
        )


async def get_tool_metrics_summary(
    filters: list[FilterParam] | None = None,  # noqa: ARG001
    time_window: str = "day",
) -> ToolMetricsSummary:
    """Get aggregated tool usage metrics (mock implementation).

    Args:
        filters: Optional filters for metrics aggregation
        time_window: Time window for aggregation (hour/day/week/month)

    Returns:
        dict: Mock metrics summary

    """
    logger.debug("Getting tool metrics summary (mock implementation)")

    # Mock metrics data
    return ToolMetricsSummary(
        total_executions=42,
        success_count=38,
        failure_count=4,
        avg_duration_ms=1250,
        p95_duration_ms=2100,
        time_window=time_window,
        generated_at=datetime.now(UTC),
    )


async def list_executions(
    filters: list[FilterParam] | None = None,
    pagination: PaginationParams | None = None,
    execution_repo: ExecutionRepository | None = None,
) -> PaginationResult:
    """List tool execution history.

    Args:
        filters: Optional list of filter parameters
        pagination: Optional pagination parameters
        execution_repo: Repository for execution data access

    Returns:
        PaginationResult: Paginated list of executions

    Raises:
        ValueError: If execution_repo is None (no default available)

    """
    if execution_repo is None:
        msg = "execution_repo parameter is required"
        raise ValueError(msg)

    logger.debug("Listing executions")
    result = await execution_repo.list_executions(filters, pagination)
    return result  # noqa: RET504
