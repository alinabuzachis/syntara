"""Exception classes for audit component.

This module contains custom exceptions used by audit services and endpoints,
following the project's exception handling patterns.
"""

from nexus.core.exception_registry import fastapi_exception
from nexus.core.exceptions import NexusError


class AuditError(NexusError):
    """Base exception for all audit errors."""


@fastapi_exception(handler="nexus.audit.error_handlers.export_not_found_handler")
class AuditExportNotFoundError(AuditError):
    """Raised when an audit export file is not found."""

    def __init__(self, export_id: str) -> None:
        """Initialize exception with export ID."""
        self.export_id = export_id
        super().__init__(f"Audit export {export_id} not found.")


@fastapi_exception(handler="nexus.audit.error_handlers.export_not_ready_handler")
class AuditExportNotReadyError(AuditError):
    """Raised when a download is requested for an export that is still running."""

    def __init__(self, export_id: str) -> None:
        """Initialize exception with export ID."""
        self.export_id = export_id
        super().__init__(
            f"Audit export {export_id} is still in progress. Poll the status endpoint and retry when complete."
        )
