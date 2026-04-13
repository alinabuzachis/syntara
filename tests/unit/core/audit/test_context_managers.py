"""Unit tests for audit context managers."""

from typing import Any
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest

from nexus.core.audit.context_managers import actor_context, audit_context
from nexus.core.audit.decorators import track_event
from nexus.core.audit.emitter import (
    activity_id_context_var,
    actor_id_context_var,
    actor_type_context_var,
    execution_id_context_var,
    workflow_id_context_var,
)
from nexus.core.audit.schemas import AuditContextData, FunctionData
from nexus.core.audit.types import ActorType, AuditEvent, EventCategory, EventSeverity, EventStatus


class TestActorContext:
    """Test the actor_context context manager."""

    def test_actor_context_sets_and_resets_context_variables(self) -> None:
        """Test that actor_context properly sets and resets context variables."""
        # Arrange
        test_actor_id = uuid4()
        test_workflow_id = uuid4()
        test_activity_id = "test_activity"
        test_execution_id = uuid4()

        # Act & Assert - context variables should be set inside context
        with actor_context(
            actor_id=test_actor_id,
            actor_type=ActorType.USER,
            workflow_id=test_workflow_id,
            activity_id=test_activity_id,
            execution_id=test_execution_id,
        ):
            assert actor_id_context_var.get() == test_actor_id
            assert actor_type_context_var.get() == ActorType.USER
            assert workflow_id_context_var.get() == test_workflow_id
            assert activity_id_context_var.get() == test_activity_id
            assert execution_id_context_var.get() == test_execution_id

        # Assert - context variables should be reset after context
        assert actor_id_context_var.get() is None
        assert actor_type_context_var.get() is None
        assert workflow_id_context_var.get() is None
        assert activity_id_context_var.get() is None
        assert execution_id_context_var.get() is None

    def test_actor_context_with_defaults(self) -> None:
        """Test actor_context with default values."""
        with actor_context():
            assert actor_id_context_var.get() is None
            assert actor_type_context_var.get() == ActorType.USER
            assert workflow_id_context_var.get() is None
            assert activity_id_context_var.get() is None
            assert execution_id_context_var.get() is None

    def test_actor_context_resets_on_exception(self) -> None:
        """Test that actor_context resets context variables even when exception occurs."""
        # Arrange
        test_actor_id = uuid4()
        original_actor_id = actor_id_context_var.get()
        original_actor_type = actor_type_context_var.get()
        error_msg = "test error"

        # Act & Assert
        with (
            pytest.raises(ValueError, match="test error"),
            actor_context(actor_id=test_actor_id, actor_type=ActorType.SYSTEM),
        ):
            assert actor_id_context_var.get() == test_actor_id
            assert actor_type_context_var.get() == ActorType.SYSTEM
            raise ValueError(error_msg)

        # Assert - context should be reset even after exception
        assert actor_id_context_var.get() == original_actor_id
        assert actor_type_context_var.get() == original_actor_type

    def test_actor_context_nested_contexts(self) -> None:
        """Test nested actor_context managers."""
        # Arrange
        outer_actor_id = uuid4()
        inner_actor_id = uuid4()

        # Act & Assert
        with actor_context(actor_id=outer_actor_id, actor_type=ActorType.USER):
            assert actor_id_context_var.get() == outer_actor_id
            assert actor_type_context_var.get() == ActorType.USER

            with actor_context(actor_id=inner_actor_id, actor_type=ActorType.SYSTEM):
                assert actor_id_context_var.get() == inner_actor_id
                assert actor_type_context_var.get() == ActorType.SYSTEM

            # Should restore outer context
            assert actor_id_context_var.get() == outer_actor_id
            assert actor_type_context_var.get() == ActorType.USER

        # Should restore original context
        assert actor_id_context_var.get() is None
        assert actor_type_context_var.get() is None


class TestAuditContext:
    """Test the audit_context context manager."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_success_emits_audit_event(self, mock_emit: Mock) -> None:
        """Test that audit_context emits success event when no exception occurs."""
        # Arrange
        test_context_data: dict[str, Any] = {"test_field": "test_value"}

        # Act
        test_actor_id = uuid4()

        with audit_context(
            event_category=EventCategory.USER_ACTION,
            event_action="test_action",
            source_component="test.component",
            actor_id=test_actor_id,
            actor_type=ActorType.USER,
            **test_context_data,
        ):
            pass  # Successful execution

        # Assert
        mock_emit.assert_called_once()
        emitted_event = mock_emit.call_args[0][0]

        assert isinstance(emitted_event, AuditEvent)
        assert emitted_event.event_category == EventCategory.USER_ACTION
        assert emitted_event.event_severity == EventSeverity.INFO
        assert emitted_event.event_action == "test_action"
        assert emitted_event.event_message == "Operation test_action completed successfully"
        assert emitted_event.source_component == "test.component"
        assert emitted_event.actor_id == test_actor_id
        assert emitted_event.actor_type == ActorType.USER

        assert emitted_event.event_status == EventStatus.SUCCESS
        assert isinstance(emitted_event.structured_data, AuditContextData)
        # Access additional fields through model_dump since extra="allow"
        structured_dict = emitted_event.structured_data.model_dump()
        assert structured_dict["test_field"] == "test_value"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_error_emits_error_event(self, mock_emit: Mock) -> None:
        """Test that audit_context emits error event when exception occurs."""
        # Arrange
        test_context_data: dict[str, Any] = {"test_field": "test_value"}
        error_msg = "test error"

        # Act & Assert
        with (
            pytest.raises(ValueError, match="test error"),
            audit_context(
                event_category=EventCategory.API_EXECUTION,
                event_action="test_action",
                source_component="test.component",
                actor_id=uuid4(),
                actor_type=ActorType.SYSTEM,
                **test_context_data,
            ),
        ):
            raise ValueError(error_msg)

        # Assert
        mock_emit.assert_called_once()
        emitted_event = mock_emit.call_args[0][0]

        assert isinstance(emitted_event, AuditEvent)
        assert emitted_event.event_category == EventCategory.API_EXECUTION
        # Default severity (INFO) is escalated to ERROR on exception
        assert emitted_event.event_severity == EventSeverity.ERROR
        assert emitted_event.event_action == "test_action_error"
        assert emitted_event.event_message == "Operation test_action failed with ValueError"
        assert emitted_event.source_component == "test.component"
        assert emitted_event.actor_type == ActorType.SYSTEM

        assert emitted_event.event_status == EventStatus.ERROR
        assert isinstance(emitted_event.structured_data, AuditContextData)
        assert emitted_event.structured_data.error_type == "ValueError"
        assert emitted_event.structured_data.error_message == "Look at the Operational Logs for full diagnosis"
        # Access additional fields through model_dump since extra="allow"
        structured_dict = emitted_event.structured_data.model_dump()
        assert structured_dict["test_field"] == "test_value"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_with_no_context_data(self, mock_emit: Mock) -> None:
        """Test audit_context with no additional context data."""
        # Act
        with audit_context(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="simple_action",
            source_component="simple.component",
            actor_id=uuid4(),
            actor_type=ActorType.SYSTEM,
        ):
            pass

        # Assert
        mock_emit.assert_called_once()
        emitted_event = mock_emit.call_args[0][0]

        assert emitted_event.event_status == EventStatus.SUCCESS
        assert isinstance(emitted_event.structured_data, AuditContextData)
        assert emitted_event.actor_type == ActorType.SYSTEM
        # Should only have base fields (error_type, error_message with defaults)
        structured_dict = emitted_event.structured_data.model_dump()
        expected_keys = {"error_type", "error_message"}
        assert set(structured_dict.keys()) == expected_keys
        assert structured_dict["error_type"] is None
        assert structured_dict["error_message"] is None

    @pytest.mark.parametrize("field_name", ["error_type", "error_message"])
    def test_audit_context_rejects_reserved_field_names(self, field_name: str) -> None:
        """Test that audit_context raises ValueError when context_data contains reserved fields."""
        with (
            pytest.raises(ValueError, match="Reserved audit field names"),
            audit_context(
                event_category=EventCategory.USER_ACTION,
                event_action="test_action",
                source_component="test.component",
                actor_id=uuid4(),
                actor_type=ActorType.USER,
                event_severity=EventSeverity.INFO,
                **{field_name: "injected_value"},
            ),
        ):
            pass  # pragma: no cover

    def test_audit_context_rejects_multiple_reserved_fields(self) -> None:
        """Test that audit_context rejects multiple reserved fields at once."""
        with (
            pytest.raises(ValueError, match="Reserved audit field names"),
            audit_context(
                event_category=EventCategory.USER_ACTION,
                event_action="test_action",
                source_component="test.component",
                actor_id=uuid4(),
                actor_type=ActorType.USER,
                error_type="injected",
                error_message="injected",
            ),
        ):
            pass  # pragma: no cover

    @pytest.mark.parametrize(
        ("severity", "category", "action", "source_component"),
        [
            (EventSeverity.WARNING, EventCategory.SECURITY_EVENT, "security_check", "security.module"),
            (EventSeverity.ERROR, EventCategory.LLM_INTERACTION, "llm_operation", "llm.service"),
            (EventSeverity.CRITICAL, EventCategory.SYSTEM_OPERATION, "critical_operation", "critical.module"),
        ],
    )
    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_custom_severity_success(
        self, mock_emit: Mock, severity: EventSeverity, category: EventCategory, action: str, source_component: str
    ) -> None:
        """Test audit_context with custom severity levels for successful operations."""
        # Act
        with audit_context(
            event_category=category,
            event_action=action,
            source_component=source_component,
            event_severity=severity,
            actor_id=uuid4(),
            actor_type=ActorType.USER,
        ):
            pass

        # Assert
        mock_emit.assert_called_once()
        emitted_event = mock_emit.call_args[0][0]

        assert emitted_event.event_category == category
        assert emitted_event.event_severity == severity
        assert emitted_event.event_action == action
        assert emitted_event.event_message == f"Operation {action} completed successfully"
        assert emitted_event.source_component == source_component
        assert emitted_event.event_status == EventStatus.SUCCESS

    @pytest.mark.parametrize(
        ("declared_severity", "expected_error_severity", "category", "action", "source_component"),
        [
            # INFO and WARNING escalate to ERROR on exception
            (
                EventSeverity.INFO,
                EventSeverity.ERROR,
                EventCategory.USER_ACTION,
                "info_operation",
                "info.module",
            ),
            (
                EventSeverity.WARNING,
                EventSeverity.ERROR,
                EventCategory.SECURITY_EVENT,
                "security_check",
                "security.module",
            ),
            # ERROR stays ERROR (no-op escalation)
            (
                EventSeverity.ERROR,
                EventSeverity.ERROR,
                EventCategory.LLM_INTERACTION,
                "llm_operation",
                "llm.service",
            ),
            # CRITICAL is preserved — never downgraded to ERROR
            (
                EventSeverity.CRITICAL,
                EventSeverity.CRITICAL,
                EventCategory.SYSTEM_OPERATION,
                "critical_operation",
                "critical.module",
            ),
        ],
    )
    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_severity_escalated_on_exception(
        self,
        mock_emit: Mock,
        declared_severity: EventSeverity,
        expected_error_severity: EventSeverity,
        category: EventCategory,
        action: str,
        source_component: str,
    ) -> None:
        """Custom severity is escalated to at least ERROR on exception; CRITICAL is preserved."""
        # Act & Assert
        with (
            pytest.raises(ValueError, match="test error"),
            audit_context(
                event_category=category,
                event_action=action,
                source_component=source_component,
                event_severity=declared_severity,
                actor_id=uuid4(),
                actor_type=ActorType.USER,
            ),
        ):
            error_msg = "test error"
            raise ValueError(error_msg)

        # Assert
        mock_emit.assert_called_once()
        emitted_event = mock_emit.call_args[0][0]

        assert emitted_event.event_category == category
        assert emitted_event.event_severity == expected_error_severity
        assert emitted_event.event_action == f"{action}_error"
        assert emitted_event.event_message == f"Operation {action} failed with ValueError"
        assert emitted_event.source_component == source_component
        assert emitted_event.event_status == EventStatus.ERROR


class TestContextManagersWithTrackEventDecorator:
    """Test context managers working with @track_event decorator."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_actor_context_with_track_event_decorator(self, mock_emit: Mock) -> None:
        """Test that actor_context provides context for @track_event decorated function."""
        # Arrange
        test_actor_id = uuid4()

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(param1: str) -> str:
            return f"result_{param1}"

        # Act
        with actor_context(actor_id=test_actor_id, actor_type=ActorType.USER):
            result = test_function("test_value")

        # Assert
        assert result == "result_test_value"
        mock_emit.assert_called_once()

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_id == test_actor_id
        assert emitted_event.actor_type == ActorType.USER
        assert isinstance(emitted_event.structured_data, FunctionData)
        assert emitted_event.structured_data.function_args == {"param1": "test_value"}

    @patch("nexus.core.audit.decorators.emit_audit_event")  # intercepts decorator's emit call
    @patch("nexus.core.audit.emitter._do_emit_audit_event")  # intercepts context manager's final emit
    def test_audit_context_with_track_event_decorator_success(
        self, mock_context_emit: Mock, mock_decorator_emit: Mock
    ) -> None:
        """Test audit_context with @track_event decorated function - success case."""

        # Arrange
        @track_event(EventCategory.API_EXECUTION)
        def test_function() -> str:
            return "success"

        # Act
        with audit_context(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="wrapper_operation",
            source_component="test.wrapper",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
        ):
            result = test_function()

        # Assert
        assert result == "success"

        # Both the decorator and context manager should emit events
        mock_decorator_emit.assert_called_once()
        mock_context_emit.assert_called_once()

        # Verify decorator event
        decorator_event = mock_decorator_emit.call_args[0][0]
        assert decorator_event.event_category == EventCategory.API_EXECUTION
        assert decorator_event.event_action == "test_function"
        assert decorator_event.actor_type == ActorType.USER

        # Verify context manager event
        context_event = mock_context_emit.call_args[0][0]
        assert context_event.event_category == EventCategory.SYSTEM_OPERATION
        assert context_event.event_action == "wrapper_operation"
        assert context_event.actor_type == ActorType.USER
        assert context_event.event_status == EventStatus.SUCCESS

    @patch("nexus.core.audit.decorators.emit_audit_event")  # intercepts decorator's emit call
    @patch("nexus.core.audit.emitter._do_emit_audit_event")  # intercepts context manager's final emit
    def test_audit_context_with_track_event_decorator_error(
        self, mock_context_emit: Mock, mock_decorator_emit: Mock
    ) -> None:
        """Test audit_context with @track_event decorated function - error case."""
        # Arrange
        error_msg = "function error"

        @track_event(EventCategory.API_EXECUTION)
        def test_function() -> str:
            raise RuntimeError(error_msg)

        # Act & Assert
        with (
            pytest.raises(RuntimeError, match="function error"),
            audit_context(
                event_category=EventCategory.SYSTEM_OPERATION,
                event_action="wrapper_operation",
                source_component="test.wrapper",
                actor_id=uuid4(),
                actor_type=ActorType.SERVICE,
            ),
        ):
            test_function()

        # Assert
        # Both the decorator and context manager should emit error events
        mock_decorator_emit.assert_called_once()
        mock_context_emit.assert_called_once()

        # Verify decorator error event
        decorator_event = mock_decorator_emit.call_args[0][0]
        assert decorator_event.event_category == EventCategory.API_EXECUTION
        assert decorator_event.event_action == "test_function_error"
        assert decorator_event.actor_type == ActorType.SERVICE

        # Verify context manager error event
        context_event = mock_context_emit.call_args[0][0]
        assert context_event.event_category == EventCategory.SYSTEM_OPERATION
        assert context_event.event_action == "wrapper_operation_error"
        assert context_event.actor_type == ActorType.SERVICE
        assert context_event.event_status == EventStatus.ERROR
        assert context_event.structured_data.error_type == "RuntimeError"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_nested_context_managers_with_track_event(self, mock_emit: Mock) -> None:
        """Test nested actor_context and audit_context with @track_event decorator."""
        # Arrange
        test_actor_id = uuid4()
        test_workflow_id = uuid4()

        @track_event(EventCategory.USER_ACTION, capture_result=True)
        def test_function(value: str) -> dict[str, str]:
            return {"result": f"processed_{value}"}

        # Act
        with actor_context(
            actor_id=test_actor_id,
            actor_type=ActorType.SERVICE,
            workflow_id=test_workflow_id,
        ):
            result = test_function("test_data")

        # Assert
        assert result == {"result": "processed_test_data"}
        mock_emit.assert_called_once()

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_id == test_actor_id
        assert emitted_event.actor_type == ActorType.SERVICE
        assert emitted_event.workflow_id == test_workflow_id
        assert isinstance(emitted_event.structured_data, FunctionData)
        assert emitted_event.structured_data.function_result == {"result": "processed_test_data"}

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_async_function_with_actor_context(self, mock_emit: Mock) -> None:
        """Test actor_context with async @track_event decorated function."""
        # Arrange
        test_actor_id = uuid4()

        @track_event(EventCategory.API_EXECUTION)
        async def async_test_function(param: str) -> str:
            return f"async_result_{param}"

        # Act
        async def run_test() -> str:
            with actor_context(actor_id=test_actor_id, actor_type=ActorType.SYSTEM):
                return await async_test_function("test")

        import asyncio

        result = asyncio.run(run_test())

        # Assert
        assert result == "async_result_test"
        mock_emit.assert_called_once()

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_id == test_actor_id
        assert emitted_event.actor_type == ActorType.SYSTEM
        assert emitted_event.event_action == "async_test_function"


class TestActorContextSanitizationAndTruncation:
    """Test that events emitted within actor_context have sanitized and truncated payloads."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_actor_context_emitted_event_has_sanitized_payload(self, mock_emit: Mock) -> None:
        """Test that sensitive data in captured arguments is redacted when using actor_context."""
        test_actor_id = uuid4()

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(api_secret: str, name: str) -> str:
            return "ok"

        with actor_context(actor_id=test_actor_id, actor_type=ActorType.USER):
            test_function("my_secret_key", "alice")

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_type == ActorType.USER
        function_data = emitted_event.structured_data
        assert isinstance(function_data, FunctionData)

        # Secret field should be redacted by the sanitizer
        assert isinstance(function_data.function_args, dict)
        assert function_data.function_args["api_secret"] == "[REDACTED]"  # noqa: S105
        # Non-sensitive field should be preserved
        assert function_data.function_args["name"] == "alice"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_actor_context_emitted_event_has_truncated_payload(self, mock_emit: Mock) -> None:
        """Test that oversized captured results are truncated when using actor_context."""
        test_actor_id = uuid4()

        @track_event(EventCategory.USER_ACTION, capture_result=True)
        def test_function() -> dict[str, str]:
            return {"large_value": "x" * 20_000}

        with actor_context(actor_id=test_actor_id, actor_type=ActorType.USER):
            test_function()

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_type == ActorType.USER
        function_data = emitted_event.structured_data
        assert isinstance(function_data, FunctionData)

        # The dict structure should be preserved with truncated string leaves
        assert isinstance(function_data.function_result, dict)
        assert "...<truncated>" in function_data.function_result["large_value"]


class TestAuditContextSanitizationAndTruncation:
    """Test that events emitted by audit_context have sanitized and truncated payloads."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_emitted_event_has_sanitized_payload(self, mock_emit: Mock) -> None:
        """Test that sensitive data in context_data is redacted by audit_context."""
        with audit_context(
            event_category=EventCategory.USER_ACTION,
            event_action="test_action",
            source_component="test.component",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            user_password="super_secret",  # noqa: S106
            username="alice",
        ):
            pass

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_type == ActorType.USER
        assert emitted_event.event_status == EventStatus.SUCCESS
        assert isinstance(emitted_event.structured_data, AuditContextData)

        structured_dict = emitted_event.structured_data.model_dump()
        # Password field should be redacted by the sanitizer
        assert structured_dict["user_password"] == "[REDACTED]"  # noqa: S105
        # Non-sensitive field should be preserved
        assert structured_dict["username"] == "alice"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_audit_context_emitted_event_has_truncated_payload(self, mock_emit: Mock) -> None:
        """Test that oversized context_data is truncated by audit_context."""
        with audit_context(
            event_category=EventCategory.USER_ACTION,
            event_action="test_action",
            source_component="test.component",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            large_field="x" * 20_000,
        ):
            pass

        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_type == ActorType.USER
        assert emitted_event.event_status == EventStatus.SUCCESS
        assert isinstance(emitted_event.structured_data, AuditContextData)

        structured_dict = emitted_event.structured_data.model_dump()
        # The large field should have been truncated
        assert "...<truncated>" in structured_dict["large_field"]
