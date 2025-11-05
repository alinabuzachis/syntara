"""Domain exceptions for tool management."""


# Domain Exceptions
class ToolManagerError(Exception):
    """Base exception for tool management errors."""

    def __init__(self, message: str) -> None:
        """Initialize error.

        Args:
            message: Error message describing the failure

        """
        self.message = message
        super().__init__(self.message)


class ProviderError(ToolManagerError):
    """Exception raised for provider-related errors."""


class ToolNotFoundError(ToolManagerError):
    """Exception raised when a tool is not found."""


class ValidationError(ToolManagerError):
    """Exception raised for validation errors."""


class ProviderNotFoundError(ToolManagerError):
    """Exception raised when a provider is not found."""


class ProviderNameConflictError(ToolManagerError):
    """Exception raised when a provider name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with provider name."""
        self.name = name
        super().__init__(f"Provider with name '{name}' already exists")
