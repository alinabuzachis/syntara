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
