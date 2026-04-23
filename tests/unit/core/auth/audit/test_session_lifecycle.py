"""Unit tests for SessionLifecycleEvent and SessionLifecycleHandler."""

from uuid import uuid4

from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import ActorType, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData
from nexus.auth.audit.session_lifecycle import (
    SessionAction,
    SessionLifecycleEvent,
    SessionLifecycleHandler,
)


class TestSessionLifecycleEvent:
    """Tests for SessionLifecycleEvent dataclass."""

    def test_minimal_construction_defaults(self) -> None:
        """SessionLifecycleEvent can be constructed with action + user_id; error_type defaults to None."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.CREATE, user_id=uid)
        assert event.action == SessionAction.CREATE
        assert event.user_id == uid
        assert event.jti is None
        assert event.idp is None
        assert event.error_type is None

    def test_enrichment_after_construction(self) -> None:
        """Jti and idp can be set after construction."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.CREATE, user_id=uid)
        event.jti = "tok-abc"
        event.idp = "github"
        assert event.jti == "tok-abc"
        assert event.idp == "github"


class TestSessionLifecycleHandler:
    """Tests for SessionLifecycleHandler."""

    def test_is_audit_event_handler_subclass(self) -> None:
        """SessionLifecycleHandler is a subclass of AuditEventHandler."""
        assert issubclass(SessionLifecycleHandler, AuditEventHandler)

    def test_successful_create(self) -> None:
        """Successful create → USER_ACTION / INFO / SUCCESS / 'session_created' / USER actor."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.CREATE, user_id=uid)
        handler = SessionLifecycleHandler()
        result = handler.handle(event)

        assert result.event_category == EventCategory.USER_ACTION
        assert result.event_severity == EventSeverity.INFO
        assert result.event_status == EventStatus.SUCCESS
        assert result.event_action == "session_created"
        assert result.actor_type == ActorType.USER
        assert result.actor_id == uid
        assert result.source_component == "nexus.auth.session"

    def test_successful_revoke(self) -> None:
        """Successful revoke → action='session_revoked'."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.REVOKE, user_id=uid)
        handler = SessionLifecycleHandler()
        result = handler.handle(event)

        assert result.event_action == "session_revoked"
        assert result.event_status == EventStatus.SUCCESS

    def test_successful_refresh(self) -> None:
        """Successful refresh → action='session_refreshed'."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.REFRESH, user_id=uid)
        handler = SessionLifecycleHandler()
        result = handler.handle(event)

        assert result.event_action == "session_refreshed"
        assert result.event_status == EventStatus.SUCCESS

    def test_error_event(self) -> None:
        """Error event (error_type set) → SECURITY_EVENT / ERROR / ERROR / 'session_created'."""
        uid = uuid4()
        event = SessionLifecycleEvent(action=SessionAction.CREATE, user_id=uid, error_type="RedisConnectionError")
        handler = SessionLifecycleHandler()
        result = handler.handle(event)

        assert result.event_category == EventCategory.SECURITY_EVENT
        assert result.event_severity == EventSeverity.ERROR
        assert result.event_status == EventStatus.ERROR
        assert result.event_action == "session_created"
        assert result.actor_type == ActorType.USER
        assert result.actor_id == uid
        assert isinstance(result.structured_data, AuditContextData)
        assert result.structured_data.data_type == "session-lifecycle-context"
        assert result.structured_data.error_message == "Look at the Operational Logs for full diagnosis"
        assert result.structured_data.error_type == "RedisConnectionError"
