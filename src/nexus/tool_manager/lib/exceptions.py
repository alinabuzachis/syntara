"""Domain exceptions for tool management."""

from nexus.core.exception_registry import fastapi_exception
from nexus.tool_manager.error_handlers import (
    tool_bulk_update_validation_error_handler,
    tool_manager_error_handler,
    tool_not_found_handler,
    tool_provider_name_conflict_handler,
    tool_provider_not_found_handler,
    tool_refresh_error_handler,
)


# Domain Exceptions
@fastapi_exception(handler=tool_manager_error_handler)
class ToolManagerError(Exception):
    """Base exception for tool management errors."""

    def __init__(self, message: str) -> None:
        """Initialize error.

        Args:
            message: Error message describing the failure

        """
        self.message = message
        super().__init__(self.message)


@fastapi_exception(handler=tool_refresh_error_handler)
class ToolRefreshError(ToolManagerError):
    """Exception raised for provider-related errors."""


@fastapi_exception(handler=tool_not_found_handler)
class ToolNotFoundError(ToolManagerError):
    """Exception raised when a tool is not found."""


@fastapi_exception(handler=tool_bulk_update_validation_error_handler)
class ToolBulkUpdateValidationError(ToolManagerError):
    """Exception raised for validation errors."""


@fastapi_exception(handler=tool_provider_not_found_handler)
class ProviderNotFoundError(ToolManagerError):
    """Exception raised when a provider is not found."""


@fastapi_exception(handler=tool_provider_name_conflict_handler)
class ProviderNameConflictError(ToolManagerError):
    """Exception raised when a provider name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with provider name."""
        self.name = name
        super().__init__(f"Provider with name '{name}' already exists")
