"""Role assignment domain events and audit handlers.

Emits audit trail events for role assignment and revocation.

Requirements: AAP-73907
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import TYPE_CHECKING

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData

if TYPE_CHECKING:
    from uuid import UUID


# ---------------------------------------------------------------------------
# Domain events
# ---------------------------------------------------------------------------


@dataclass
class RoleAssignmentEvent:
    """Domain event fired when a role is assigned to or revoked from a principal."""

    assignment_id: UUID
    principal_type: str  # "user" | "group"
    principal_id: UUID
    principal_name: str
    role_name: str
    action: str  # "assigned" | "revoked"
    project_id: UUID | None = field(default=None)
    error_type: str | None = field(default=None)


# ---------------------------------------------------------------------------
# Audit handlers (produce AuditEvent for persistence)
# ---------------------------------------------------------------------------


class RoleAssignmentHandler(AuditEventHandler[RoleAssignmentEvent]):
    """Maps a RoleAssignmentEvent to an AuditEvent."""

    def handle(self, event: RoleAssignmentEvent) -> AuditEvent:
        """Map a RoleAssignmentEvent to a normalized AuditEvent."""
        is_error = event.error_type is not None

        severity = EventSeverity.ERROR if is_error else EventSeverity.INFO

        data = AuditContextData(
            data_type="role-assignment",
            action=event.action,
            principal_type=event.principal_type,
            principal_name=event.principal_name,
            role_name=event.role_name,
        )
        if event.project_id is not None:
            data.project_id = str(event.project_id)
        if is_error:
            data.error_type = event.error_type

        return AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=severity,
            event_status=EventStatus.ERROR if is_error else EventStatus.SUCCESS,
            event_action=f"role_{event.action}",
            event_message=f"Role {event.action}: {event.role_name} -> {event.principal_type} {event.principal_name}",
            source_component="nexus.authz",
            structured_data=data,
            resource_urn=f"urn:nexus:role-assignment:{event.assignment_id}",
        )
