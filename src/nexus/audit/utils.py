"""Utility functions for the audit package."""

from uuid import UUID

import structlog

from nexus.audit.models.audit_event import ActorType, EventSeverity
from nexus.core.auth.jwt_utils import ActorClaims
from nexus.core.config.base import get_settings

logger = structlog.stdlib.get_logger(__name__)

# Ordering for EventSeverity (StrEnum does not provide natural ordering).
# Higher rank means more severe.
_SEVERITY_RANK: dict[EventSeverity, int] = {
    EventSeverity.INFO: 0,
    EventSeverity.WARNING: 1,
    EventSeverity.ERROR: 2,
    EventSeverity.CRITICAL: 3,
}


def escalate_severity(current: EventSeverity, minimum: EventSeverity) -> EventSeverity:
    """Return the more severe of ``current`` and ``minimum``.

    Used to ensure audit events emitted from exception paths carry at least
    ``minimum`` severity, without downgrading caller-declared severities that
    are already higher (e.g. ``CRITICAL`` remains ``CRITICAL`` when escalating
    to ``ERROR``).
    """
    return current if _SEVERITY_RANK[current] >= _SEVERITY_RANK[minimum] else minimum


def escalate_actor_type_from_jwt(actor_claims: ActorClaims) -> ActorType:
    """Determine ActorType from JWT authentication method reference (amr).

    Service-to-service tokens (amr containing "service") are classified as
    ActorType.SYSTEM. All other tokens are ActorType.USER.

    Args:
        actor_claims: Extracted JWT claims containing authentication method reference.

    Returns:
        ActorType.SYSTEM for service tokens, ActorType.USER otherwise.

    """
    is_service_token = isinstance(actor_claims.amr, list) and "service" in actor_claims.amr

    if is_service_token:
        logger.debug(
            "actor_type_escalated_from_jwt",
            amr=actor_claims.amr,
            actor_type=ActorType.SYSTEM,
            reason="service token detected in amr claim",
        )
        return ActorType.SYSTEM

    return ActorType.USER


def escalate_actor_type(actor_id: UUID) -> ActorType:
    """Determine ActorType by comparing actor_id against the system user ID.

    The system user (configured via SYSTEM_USER_ID) represents internal
    operations and is classified as ActorType.SYSTEM. All other users are
    ActorType.USER.

    Args:
        actor_id: UUID of the actor to classify.

    Returns:
        ActorType.SYSTEM if actor_id matches system_user_id, ActorType.USER otherwise.

    """
    settings = get_settings()
    is_system_user = actor_id == settings.system_user_id

    if is_system_user:
        logger.debug(
            "actor_type_escalated",
            actor_id=str(actor_id),
            system_user_id=str(settings.system_user_id),
            actor_type=ActorType.SYSTEM,
            reason="actor_id matches configured system_user_id",
        )
        return ActorType.SYSTEM

    return ActorType.USER
