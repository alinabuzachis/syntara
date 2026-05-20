"""Domain exceptions for identity provider management."""

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError


@fastapi_exception(handler="nexus.identity_providers.error_handlers.identity_provider_error_handler")
class IdentityProviderError(NexusError):
    """Base exception for all identity provider errors."""


@fastapi_exception(handler="nexus.identity_providers.error_handlers.identity_provider_not_found_handler")
class IdentityProviderNotFoundError(IdentityProviderError):
    """Exception raised when an identity provider is not found."""


@fastapi_exception(handler="nexus.identity_providers.error_handlers.identity_provider_name_conflict_handler")
class IdentityProviderNameConflictError(IdentityProviderError):
    """Exception raised when an identity provider name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with provider name."""
        self.name = name
        super().__init__(f"Identity provider with name '{name}' already exists")
