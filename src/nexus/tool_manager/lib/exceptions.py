"""Domain exceptions for tool management."""

from nexus.core.exception_registry import fastapi_exception


# Domain Exceptions
@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_manager_error_handler")
class ToolManagerError(Exception):
    """Base exception for tool management errors."""

    def __init__(self, message: str) -> None:
        """Initialize error.

        Args:
            message: Error message describing the failure

        """
        self.message = message
        super().__init__(self.message)


@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_provider_error_handler")
class ProviderError(ToolManagerError):
    """Exception raised for provider-related errors."""


@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_not_found_handler")
class ToolNotFoundError(ToolManagerError):
    """Exception raised when a tool is not found."""


@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_validation_error_handler")
class ValidationError(ToolManagerError):
    """Exception raised for validation errors."""


@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_provider_not_found_handler")
class ProviderNotFoundError(ToolManagerError):
    """Exception raised when a provider is not found."""


@fastapi_exception(handler="nexus.tool_manager.error_handlers.tool_provider_name_conflict_handler")
class ProviderNameConflictError(ToolManagerError):
    """Exception raised when a provider name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with provider name."""
        self.name = name
        super().__init__(f"Provider with name '{name}' already exists")
