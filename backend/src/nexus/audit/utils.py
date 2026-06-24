"""Utility functions for the audit package."""

from uuid import UUID

import structlog

from nexus.audit.models.audit_event import EventSeverity
from nexus.core.auth.jwt_utils import ActorClaims
from nexus.core.config.base import get_settings
from nexus.core.models.principal import PrincipalType

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


def escalate_actor_type_from_jwt(actor_claims: ActorClaims) -> PrincipalType:
    """Determine PrincipalType from JWT authentication method reference (amr).

    Service-to-service tokens (amr containing "service") are classified as
    SERVICE_ACCOUNT. All other tokens are USER.

    Args:
        actor_claims: Extracted JWT claims containing authentication method reference.

    Returns:
        PrincipalType.SERVICE_ACCOUNT for service tokens, PrincipalType.USER otherwise.

    """
    is_service_token = isinstance(actor_claims.amr, list) and "service" in actor_claims.amr

    if is_service_token:
        logger.debug(
            "actor_type_escalated_from_jwt",
            amr=actor_claims.amr,
            actor_type=PrincipalType.SERVICE_ACCOUNT,
            reason="service token detected in amr claim",
        )
        return PrincipalType.SERVICE_ACCOUNT

    return PrincipalType.USER


def escalate_actor_type(actor_id: UUID) -> PrincipalType:
    """Determine PrincipalType by comparing actor_id against the system user ID.

    The system user (configured via SYSTEM_USER_ID) represents internal
    operations and is classified as SYSTEM. All other users are USER.

    Args:
        actor_id: UUID of the actor to classify.

    Returns:
        PrincipalType.SYSTEM if actor_id matches system_user_id, PrincipalType.USER otherwise.

    """
    settings = get_settings()
    is_system_user = actor_id == settings.system_user_id

    if is_system_user:
        logger.debug(
            "actor_type_escalated",
            actor_id=str(actor_id),
            system_user_id=str(settings.system_user_id),
            actor_type=PrincipalType.SYSTEM,
            reason="actor_id matches configured system_user_id",
        )
        return PrincipalType.SYSTEM

    return PrincipalType.USER
