"""Telemetry handler for UserLoginEvent.

Emits Segment telemetry events on successful authentication:
- ``user_login`` on every login
- ``new_user`` additionally on the user's first login
"""

import hashlib

import structlog

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import AuditEvent
from nexus.auth.audit.user_login import UserLoginEvent
from nexus.telemetry.client import get_telemetry_registry
from nexus.telemetry.events.new_user import NewUserEvent
from nexus.telemetry.events.user_login import UserLoginEvent as UserLoginTelemetryEvent

logger = structlog.stdlib.get_logger(__name__)


class UserLoginTelemetryHandler(AuditEventHandler[UserLoginEvent]):
    """Emits Segment telemetry events on user login."""

    def handle(self, event: UserLoginEvent) -> AuditEvent | None:
        """Emit telemetry (side-effect only, no AuditEvent produced)."""
        try:
            registry = get_telemetry_registry()
            if not registry.is_initialized():
                return None

            user_id_hash = hashlib.sha256(str(event.user_id).encode()).hexdigest()

            entitlement_id = registry.entitlement_id

            registry.send_event(
                UserLoginTelemetryEvent(
                    user_id_hash=user_id_hash,
                    amr=event.amr,
                    idp=event.idp,
                    entitlement_id=entitlement_id,
                )
            )
            logger.debug("Emitted user_login telemetry", amr=event.amr, idp=event.idp)

            if event.is_first_login:
                registry.send_event(
                    NewUserEvent(
                        user_id_hash=user_id_hash,
                        amr=event.amr,
                        idp=event.idp,
                        entitlement_id=entitlement_id,
                    )
                )
                logger.debug("Emitted new_user telemetry", amr=event.amr, idp=event.idp)
        except Exception:
            logger.exception("Failed to emit login telemetry (non-fatal)")

        return None
