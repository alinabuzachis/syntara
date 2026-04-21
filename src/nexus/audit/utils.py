"""Utility functions for the audit package."""

from nexus.audit.models.audit_event import EventSeverity

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
