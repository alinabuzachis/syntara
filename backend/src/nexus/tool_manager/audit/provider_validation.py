"""ToolProviderValidationEvent and handler for tool provider validation audit."""

from dataclasses import dataclass, field
from uuid import UUID

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData
from nexus.tool_manager.models.tool_provider import ProviderStatus

# ---------------------------------------------------------------------------
# Domain event
# ---------------------------------------------------------------------------


@dataclass
class ToolProviderValidationEvent:
    """Domain event representing tool provider validation.

    Used for both validate_provider (existing provider) and validate_provider_definition
    (pre-creation validation).

    The error_type field can be:
    - None: Success (validation passed)
    - str: Technical exception class name (e.g., "ValidationError", "TimeoutError")
    """

    provider_name: str
    provider_type: str
    provider_id: UUID | None = field(default=None)
    timeout: bool = field(default=False)
    result_status: ProviderStatus | None = field(default=None)
    is_definition_validation: bool = field(default=False)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Handler
# ---------------------------------------------------------------------------


class ToolProviderValidationHandler(AuditEventHandler[ToolProviderValidationEvent]):
    """Maps a ToolProviderValidationEvent to a normalized AuditEvent."""

    def handle(self, event: ToolProviderValidationEvent) -> AuditEvent:
        """Map a ToolProviderValidationEvent to a normalized AuditEvent."""
        # Determine action based on validation type
        action = "provider_definition_validated" if event.is_definition_validation else "provider_validated"

        is_error = event.error_type is not None

        if is_error:
            if event.timeout:
                category = EventCategory.SYSTEM_OPERATION
                severity = EventSeverity.WARNING
                status = EventStatus.ERROR
                message = f"Tool provider validation timeout: {event.provider_name}"
            else:
                category = EventCategory.SYSTEM_OPERATION
                severity = EventSeverity.WARNING
                status = EventStatus.ERROR
                message = f"Tool provider validation failed: {event.provider_name}"
            error_message: str | None = "Look at the Operational Logs for full diagnosis"
        else:
            category = EventCategory.SYSTEM_OPERATION
            severity = EventSeverity.INFO
            status = EventStatus.SUCCESS
            message = f"Tool provider validation successful: {event.provider_name}"
            error_message = None

        data = AuditContextData(
            data_type="provider-validation-context",
            error_type=event.error_type,
            error_message=error_message,
            provider_name=event.provider_name,
            provider_type=event.provider_type,
            timeout=event.timeout,
            result_status=event.result_status.value if event.result_status else None,
            is_definition_validation=event.is_definition_validation,
        )

        return AuditEvent(
            event_category=category,
            event_severity=severity,
            event_status=status,
            event_action=action,
            event_message=message,
            source_component="nexus.tool_manager.provider",
            structured_data=data,
            resource_urn=f"urn:nexus:tool-provider:{event.provider_id}" if event.provider_id else None,
            resource_name=event.provider_name,
        )
