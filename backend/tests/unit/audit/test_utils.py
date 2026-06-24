"""Unit tests for audit utilities."""

import itertools
from uuid import UUID, uuid4

import pytest

from nexus.audit.models.audit_event import EventSeverity
from nexus.audit.utils import escalate_actor_type, escalate_actor_type_from_jwt, escalate_severity
from nexus.core.auth.jwt_utils import ActorClaims
from nexus.core.config.base import get_settings
from nexus.core.models.principal import PrincipalType


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


class TestEscalateActorTypeFromJwt:
    """Unit tests for ``escalate_actor_type_from_jwt``.

    Validates that service tokens (amr containing "service") are classified
    as PrincipalType.SERVICE_ACCOUNT while all other tokens are PrincipalType.USER.
    """

    @pytest.mark.parametrize(
        ("amr", "expected"),
        [
            # Service tokens → SERVICE_ACCOUNT
            (["service"], PrincipalType.SERVICE_ACCOUNT),
            (["service", "mfa"], PrincipalType.SERVICE_ACCOUNT),
            (["mfa", "service"], PrincipalType.SERVICE_ACCOUNT),
            # Non-service tokens → USER
            (None, PrincipalType.USER),
            ([], PrincipalType.USER),
            (["pwd"], PrincipalType.USER),
            (["pwd", "mfa"], PrincipalType.USER),
            (["mfa"], PrincipalType.USER),
        ],
    )
    def test_escalate_actor_type_from_jwt(
        self,
        amr: list[str] | None,
        expected: PrincipalType,
    ) -> None:
        """Service tokens return SERVICE_ACCOUNT, all others return USER."""
        actor_claims = ActorClaims(
            actor_id=uuid4(),
            actor_username="test-user",
            amr=amr,
        )
        assert escalate_actor_type_from_jwt(actor_claims) == expected


class TestEscalateActorType:
    """Unit tests for ``escalate_actor_type``.

    Validates that the configured system user ID is classified as
    PrincipalType.SYSTEM while all other user IDs are PrincipalType.USER.
    """

    @pytest.mark.parametrize(
        ("actor_id", "expected"),
        [
            # System user → SYSTEM
            (get_settings().system_user_id, PrincipalType.SYSTEM),
            # Regular users → USER
            (uuid4(), PrincipalType.USER),
            (UUID("00000000-0000-0000-0000-000000000000"), PrincipalType.USER),
        ],
    )
    def test_escalate_actor_type(
        self,
        actor_id: UUID,
        expected: PrincipalType,
    ) -> None:
        """System user returns SYSTEM, all others return USER."""
        # Skip the regular user test if it happens to match system_user_id
        if actor_id != get_settings().system_user_id and expected == PrincipalType.SYSTEM:
            pytest.skip("Test UUID randomly matched system_user_id")

        assert escalate_actor_type(actor_id) == expected
