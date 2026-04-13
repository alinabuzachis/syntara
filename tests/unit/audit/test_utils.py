"""Unit tests for audit utilities."""

import itertools

import pytest

from nexus.audit.models import EventSeverity
from nexus.audit.utils import escalate_severity


class TestEscalateSeverity:
    """Direct unit tests for ``escalate_severity``.

    These tests lock in the ``>=`` boundary semantics of the helper
    independently of the context managers and decorators that call it,
    so a regression in the ordering table cannot be masked by higher-level
    tests that only exercise a subset of the matrix.
    """

    @pytest.mark.parametrize(
        ("current", "minimum", "expected"),
        [
            # current == INFO: always escalated to minimum
            (EventSeverity.INFO, EventSeverity.INFO, EventSeverity.INFO),
            (EventSeverity.INFO, EventSeverity.WARNING, EventSeverity.WARNING),
            (EventSeverity.INFO, EventSeverity.ERROR, EventSeverity.ERROR),
            (EventSeverity.INFO, EventSeverity.CRITICAL, EventSeverity.CRITICAL),
            # current == WARNING: preserved when >= minimum
            (EventSeverity.WARNING, EventSeverity.INFO, EventSeverity.WARNING),
            (EventSeverity.WARNING, EventSeverity.WARNING, EventSeverity.WARNING),
            (EventSeverity.WARNING, EventSeverity.ERROR, EventSeverity.ERROR),
            (EventSeverity.WARNING, EventSeverity.CRITICAL, EventSeverity.CRITICAL),
            # current == ERROR: preserved when >= minimum
            (EventSeverity.ERROR, EventSeverity.INFO, EventSeverity.ERROR),
            (EventSeverity.ERROR, EventSeverity.WARNING, EventSeverity.ERROR),
            (EventSeverity.ERROR, EventSeverity.ERROR, EventSeverity.ERROR),
            (EventSeverity.ERROR, EventSeverity.CRITICAL, EventSeverity.CRITICAL),
            # current == CRITICAL: never downgraded — this is the core
            # correctness property the helper exists to guarantee.
            (EventSeverity.CRITICAL, EventSeverity.INFO, EventSeverity.CRITICAL),
            (EventSeverity.CRITICAL, EventSeverity.WARNING, EventSeverity.CRITICAL),
            (EventSeverity.CRITICAL, EventSeverity.ERROR, EventSeverity.CRITICAL),
            (EventSeverity.CRITICAL, EventSeverity.CRITICAL, EventSeverity.CRITICAL),
        ],
    )
    def test_escalate_severity_matrix(
        self,
        current: EventSeverity,
        minimum: EventSeverity,
        expected: EventSeverity,
    ) -> None:
        """Every (current, minimum) pair returns the more severe of the two."""
        assert escalate_severity(current, minimum) == expected

    def test_escalate_severity_covers_every_enum_member(self) -> None:
        """Exhaustiveness guard: the ranking table must cover every member.

        If a new ``EventSeverity`` member is ever added without updating the
        internal ordering, ``escalate_severity`` would raise ``KeyError`` at
        runtime. Iterating the full cartesian product catches that regression
        at test time instead.
        """
        for current, minimum in itertools.product(EventSeverity, EventSeverity):
            # Must not raise, and must return one of the two inputs.
            result = escalate_severity(current, minimum)
            assert result in {current, minimum}
