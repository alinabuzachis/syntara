"""Domain exceptions for the integrations domain."""

from uuid import UUID

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_error_handler")
class IntegrationError(NexusError):
    """Base exception for all integration errors."""


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_not_found_handler")
class IntegrationNotFoundError(IntegrationError):
    """Exception raised when an integration is not found."""

    def __init__(self, integration_id: UUID) -> None:
        """Initialize exception with integration ID."""
        self.integration_id = integration_id
        super().__init__(f"Integration {integration_id} not found")


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_name_conflict_handler")
class IntegrationNameConflictError(IntegrationError):
    """Exception raised when an integration name already exists."""

    def __init__(self, name: str) -> None:
        """Initialize exception with integration name."""
        self.name = name
        super().__init__(f"Integration with name '{name}' already exists")


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_credential_required_handler")
class IntegrationCredentialRequiredError(IntegrationError):
    """Exception raised when a health check is attempted without a management credential."""

    def __init__(self, integration_id: UUID) -> None:
        """Initialize exception with integration ID."""
        self.integration_id = integration_id
        super().__init__(f"Integration {integration_id} requires a management credential for health checks")


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_credential_not_found_handler")
class IntegrationCredentialNotFoundError(IntegrationError):
    """Exception raised when a credential ID does not exist in the database."""

    def __init__(self, credential_id: UUID) -> None:
        """Initialize exception with credential ID."""
        self.credential_id = credential_id
        super().__init__(f"Credential {credential_id} not found")


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_credential_type_mismatch_handler")
class IntegrationCredentialTypeMismatchError(IntegrationError):
    """Exception raised when a credential's type is incompatible with the integration type."""

    def __init__(self, integration_type: str, credential_type_name: str, allowed: frozenset[str]) -> None:
        """Initialize exception with the mismatched types."""
        self.integration_type = integration_type
        self.credential_type_name = credential_type_name
        self.allowed = allowed
        allowed_str = ", ".join(sorted(allowed))
        super().__init__(
            f"Credential type '{credential_type_name}' is not valid for "
            f"integration type '{integration_type}'. Allowed types: {allowed_str}"
        )


@fastapi_exception(handler="nexus.integrations.error_handlers.integration_error_handler")
class AdapterNotRegisteredError(IntegrationError):
    """Exception raised when no health check adapter is registered for an integration type."""

    def __init__(self, integration_type: str) -> None:
        """Initialize exception with integration type."""
        self.integration_type = integration_type
        super().__init__(f"No health check adapter registered for integration type '{integration_type}'")
