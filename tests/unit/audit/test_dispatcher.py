"""Unit tests for AuditEventDispatcher dispatch and lifecycle management."""

from dataclasses import dataclass
from unittest.mock import patch

from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.handler import AuditEventHandler
from nexus.audit.models.audit_event import AuditEvent, EventCategory
from nexus.audit.models.structured_data import AuditContextData


@dataclass
class _DispatchEvent:
    message: str


@dataclass
class _OtherEvent:
    value: int


@dataclass
class _UnknownEvent:
    pass


class _DispatchHandler(AuditEventHandler["_DispatchEvent"]):
    def handle(self, event: "_DispatchEvent") -> AuditEvent:
        return AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="dispatched",
            event_message=event.message,
            source_component="test",
            structured_data=AuditContextData(data_type="test"),
        )


class _OtherHandler(AuditEventHandler["_OtherEvent"]):
    def handle(self, event: "_OtherEvent") -> AuditEvent:
        return AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="other",
            event_message=str(event.value),
            source_component="test",
            structured_data=AuditContextData(data_type="test"),
        )


class _ReplacementDispatchHandler(AuditEventHandler["_DispatchEvent"]):
    def handle(self, event: "_DispatchEvent") -> AuditEvent:
        return AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="replaced",
            event_message=event.message,
            source_component="test",
            structured_data=AuditContextData(data_type="test"),
        )


class TestAuditEventDispatcher:
    """Tests for AuditEventDispatcher.dispatch() logic."""

    def setup_method(self) -> None:
        AuditEventDispatcher.reset()
        AuditEventDispatcher.register({_DispatchEvent: _DispatchHandler()})

    def teardown_method(self) -> None:
        AuditEventDispatcher.reset()

    def test_dispatches_to_matching_handler(self) -> None:
        """dispatch() finds the correct handler and calls emit_audit_event."""
        with patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit:
            AuditEventDispatcher.dispatch(_DispatchEvent(message="hello"))

        mock_emit.assert_called_once()
        emitted = mock_emit.call_args[0][0]
        assert isinstance(emitted, AuditEvent)
        assert emitted.event_action == "dispatched"
        assert emitted.event_message == "hello"

    def test_unknown_event_type_does_not_raise(self) -> None:
        """dispatch() silently skips events with no registered handler."""
        with patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit:
            AuditEventDispatcher.dispatch(_UnknownEvent())

        mock_emit.assert_not_called()

    def test_unknown_event_type_logs_warning(self) -> None:
        """dispatch() logs a warning for unhandled event types."""
        AuditEventDispatcher.reset()

        with patch("nexus.audit.dispatcher.logger") as mock_logger:
            AuditEventDispatcher.dispatch(_UnknownEvent())

        mock_logger.warning.assert_called_once()

    def test_handler_raises_logs_exception_and_does_not_propagate(self) -> None:
        """When a handler.handle() raises, dispatch logs and swallows the error."""
        AuditEventDispatcher.reset()

        class _RaisingHandler(AuditEventHandler["_DispatchEvent"]):
            def handle(self, event: "_DispatchEvent") -> AuditEvent:
                msg = "boom"
                raise RuntimeError(msg)

        AuditEventDispatcher.register({_DispatchEvent: _RaisingHandler()})

        with (
            patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit,
            patch("nexus.audit.dispatcher.logger") as mock_logger,
        ):
            AuditEventDispatcher.dispatch(_DispatchEvent(message="x"))

        mock_emit.assert_not_called()
        mock_logger.exception.assert_called_once()


class TestDispatcherLifecycle:
    """Tests for register/reset lifecycle."""

    def setup_method(self) -> None:
        AuditEventDispatcher.reset()

    def teardown_method(self) -> None:
        AuditEventDispatcher.reset()

    def test_register_merges_across_calls(self) -> None:
        """register() adds handlers without clearing previous registrations."""
        AuditEventDispatcher.register({_DispatchEvent: _DispatchHandler()})
        AuditEventDispatcher.register({_OtherEvent: _OtherHandler()})

        with patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit:
            AuditEventDispatcher.dispatch(_DispatchEvent(message="hi"))
            AuditEventDispatcher.dispatch(_OtherEvent(value=42))

        assert mock_emit.call_count == 2
        actions = [call.args[0].event_action for call in mock_emit.call_args_list]
        assert actions == ["dispatched", "other"]

    def test_register_overwrite_logs_warning(self) -> None:
        """Registering a second handler for the same event type warns but succeeds."""
        AuditEventDispatcher.register({_DispatchEvent: _DispatchHandler()})

        with patch("nexus.audit.dispatcher.logger") as mock_logger:
            AuditEventDispatcher.register({_DispatchEvent: _ReplacementDispatchHandler()})

        mock_logger.warning.assert_called_once()

        with patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit:
            AuditEventDispatcher.dispatch(_DispatchEvent(message="hi"))

        mock_emit.assert_called_once()
        assert mock_emit.call_args[0][0].event_action == "replaced"

    def test_reset_clears_registry(self) -> None:
        """reset() empties the registry so subsequent dispatches find nothing."""
        AuditEventDispatcher.register({_DispatchEvent: _DispatchHandler()})
        AuditEventDispatcher.reset()

        with patch("nexus.audit.dispatcher.emit_audit_event") as mock_emit:
            AuditEventDispatcher.dispatch(_DispatchEvent(message="after reset"))

        mock_emit.assert_not_called()
