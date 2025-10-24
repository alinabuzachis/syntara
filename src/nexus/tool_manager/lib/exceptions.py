"""Domain exceptions for tool management."""


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
