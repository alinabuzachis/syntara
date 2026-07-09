"""Audit events for service account token rejections in StaleTokenMiddleware."""

from dataclasses import dataclass
from urllib.parse import quote

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import (
    AuditEvent,
    EventCategory,
    EventSeverity,
    EventStatus,
)
from nexus.audit.models.structured_data import AuditContextData
from nexus.core.models.principal import PrincipalType


@dataclass
class DisabledSARejectionEvent:
    """Emitted when a request from a disabled or deleted service account is rejected."""

    service_account_id: str
    sa_status: str
    is_alive: bool


class DisabledSARejectionHandler(AuditEventHandler[DisabledSARejectionEvent]):
    """Maps a DisabledSARejectionEvent to a normalized AuditEvent."""

    def handle(self, event: DisabledSARejectionEvent) -> AuditEvent:
        """Map a DisabledSARejectionEvent to a normalized AuditEvent."""
        data = AuditContextData(
            data_type="disabled-sa-rejection",
            sa_status=event.sa_status,
            is_alive=event.is_alive,
        )

        return AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=EventSeverity.WARNING,
            event_status=EventStatus.ERROR,
            event_action="disabled_sa_rejected",
            event_message=f"Rejected request from disabled/deleted service account ({event.sa_status})",
            source_component="nexus.auth.middleware",
            structured_data=data,
            actor_type=PrincipalType.SERVICE_ACCOUNT,
            resource_urn=f"urn:nexus:service-account:{quote(event.service_account_id, safe='')}",
            resource_name=event.service_account_id,
        )


@dataclass
class StaleSATokenDetectionEvent:
    """Emitted when a stale service account token is detected."""

    service_account_id: str
    token_version: int
    current_version: int


class StaleSATokenDetectionHandler(AuditEventHandler[StaleSATokenDetectionEvent]):
    """Maps a StaleSATokenDetectionEvent to a normalized AuditEvent."""

    def handle(self, event: StaleSATokenDetectionEvent) -> AuditEvent:
        """Map a StaleSATokenDetectionEvent to a normalized AuditEvent."""
        data = AuditContextData(
            data_type="stale-sa-token-detection",
            token_version=event.token_version,
            current_version=event.current_version,
        )

        return AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_severity=EventSeverity.INFO,
            event_status=EventStatus.SUCCESS,
            event_action="stale_sa_token_detected",
            event_message="Stale service account token detected",
            source_component="nexus.auth.middleware",
            structured_data=data,
            actor_type=PrincipalType.SERVICE_ACCOUNT,
            resource_urn=f"urn:nexus:service-account:{quote(event.service_account_id, safe='')}",
            resource_name=event.service_account_id,
        )
