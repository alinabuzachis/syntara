"""Unit tests for audit event tracking decorators."""

# mypy: disable-error-code="attr-defined"

from typing import Any
from unittest.mock import Mock, patch
from uuid import UUID, uuid4

import pytest

from nexus.audit.actor_extractor import ActorContext
from nexus.audit.decorators import track_event
from nexus.audit.dispatcher import AuditEventDispatcher
from nexus.audit.events.function_execution import FunctionExecutionEvent, FunctionExecutionHandler
from nexus.audit.models.audit_event import ActorType, AuditEvent, EventCategory, EventSeverity, EventStatus
from nexus.audit.models.structured_data import AuditContextData


@pytest.fixture(autouse=True)
def _register_audit_event_handler() -> Any:  # noqa: ANN401
    """Register FunctionExecutionHandler for decorator tests."""
    AuditEventDispatcher.register({FunctionExecutionEvent: FunctionExecutionHandler()})
    yield
    AuditEventDispatcher.reset()


def _assert_audit_event_fields(
    event_obj: AuditEvent,
    expected_category: EventCategory,
    expected_severity: EventSeverity,
    expected_action: str,
    expected_source: str,
    expected_message: str,
    expected_actor_id: UUID | None = None,
    expected_actor_type: ActorType = ActorType.SYSTEM,
    expected_status: EventStatus | None = EventStatus.SUCCESS,
    expected_workflow_id: UUID | None = None,
    expected_activity_id: str | None = None,
    expected_execution_id: UUID | None = None,
) -> None:
    """Helper function to verify all AuditEvent fields are correctly populated."""
    # Core identification (id and created_at inherited from BaseResource)
    assert event_obj.event_id is not None
    assert isinstance(event_obj.event_id, UUID)
    assert event_obj.event_category == expected_category
    assert event_obj.event_severity == expected_severity
    assert event_obj.event_status == expected_status
    assert event_obj.event_action == expected_action

    # Actor and source information
    assert event_obj.actor_id == expected_actor_id
    assert event_obj.actor_type == expected_actor_type
    assert event_obj.source_component == expected_source

    # Context tracking
    assert event_obj.workflow_id == expected_workflow_id
    assert event_obj.activity_id == expected_activity_id
    assert event_obj.execution_id == expected_execution_id

    # Human-readable message
    assert event_obj.event_message == expected_message

    # Event data (structured_data should always be present and be AuditContextData for track_event)
    assert event_obj.structured_data is not None
    assert isinstance(event_obj.structured_data, AuditContextData)


class TestTrackEventDecorator:
    """Test the track_event decorator functionality."""

    def test_track_event_basic_decoration(self) -> None:
        """Test basic function decoration and execution."""

        @track_event(EventCategory.USER_ACTION)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = test_function()

            assert result == "success"
            assert mock_emit.call_count == 1

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

    def test_track_event_custom_parameters(self) -> None:
        """Test decorator with custom action and component."""

        @track_event(EventCategory.WORKFLOW_EVENT, event_action="custom_action", source_component="test.module")
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.WORKFLOW_EVENT,
                EventSeverity.INFO,
                "custom_action",
                "test.module",
                "Function custom_action executed successfully",
            )

    def test_track_event_argument_capture(self) -> None:
        """Test function argument capture functionality."""

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(arg1: str, arg2: int, kwarg1: str = "default") -> str:
            return f"{arg1}-{arg2}-{kwarg1}"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = test_function("test", 42, kwarg1="custom")

            assert result == "test-42-custom"

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

            # Verify function arguments capture
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.function_args == {"arg1": "test", "arg2": 42, "kwarg1": "custom"}

    def test_track_event_no_argument_capture(self) -> None:
        """Test with argument capture disabled."""

        @track_event(EventCategory.USER_ACTION, capture_args=False)
        def test_function(arg1: str, arg2: int) -> str:
            return f"{arg1}-{arg2}"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function("test", 42)

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

            # Verify no function arguments captured
            function_data = event_obj.structured_data
            assert function_data is not None
            assert isinstance(function_data, AuditContextData)
            assert function_data.function_args is not None
            assert isinstance(function_data.function_args, dict)
            assert len(function_data.function_args.items()) == 0

    def test_track_event_result_capture(self) -> None:
        """Test function result capture functionality."""

        @track_event(EventCategory.USER_ACTION, capture_args=True, capture_result=True)
        def test_function(value: str) -> dict[str, str]:
            return {"result": value}

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = test_function("test")

            assert result == {"result": "test"}

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

            # Verify function result capture and argument capture
            function_data = event_obj.structured_data
            assert function_data.function_args is not None
            assert isinstance(function_data, AuditContextData)
            # Both the function argument and result should contain the same "test" value
            assert function_data.function_args["value"] == "test"
            assert function_data.function_result == {"result": "test"}

    def test_track_event_actor_extraction_from_parameter(self) -> None:
        """Test actor extraction from function parameters."""
        user_id = uuid4()

        @track_event(EventCategory.USER_ACTION)
        def test_function(user_id: UUID) -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function(user_id)

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
                expected_actor_id=user_id,
                expected_actor_type=ActorType.USER,
            )

    def test_track_event_actor_param_specification(self) -> None:
        """Test explicit actor parameter specification."""
        admin_id = uuid4()

        @track_event(EventCategory.SYSTEM_OPERATION, actor_param="admin_id")
        def test_function(admin_id: UUID, other_param: str) -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function(admin_id, "other")

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.SYSTEM_OPERATION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
                expected_actor_id=admin_id,
                expected_actor_type=ActorType.USER,
            )

    def test_track_event_actor_fallback(self) -> None:
        """Test actor fallback when no actor can be detected."""
        fallback_id = uuid4()
        fallback_context = ActorContext(actor_id=fallback_id, actor_type=ActorType.SYSTEM)

        @track_event(EventCategory.SYSTEM_OPERATION, actor_fallback=fallback_context)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.SYSTEM_OPERATION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
                expected_actor_id=fallback_id,
                expected_actor_type=ActorType.SYSTEM,
            )

    def test_track_event_system_actor_default(self) -> None:
        """Test default system actor when no actor can be determined."""

        @track_event(EventCategory.SYSTEM_OPERATION)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.SYSTEM_OPERATION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

    def test_track_event_exception_handling(self) -> None:
        """Test exception handling and error event emission."""

        @track_event(EventCategory.USER_ACTION)
        def test_function(*, should_fail: bool = False) -> str:
            if should_fail:
                error_msg = "Test error message"
                raise ValueError(error_msg)
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            # Test successful execution first
            result = test_function(should_fail=False)
            assert result == "success"
            assert mock_emit.call_count == 1

            # Test exception handling
            with pytest.raises(ValueError, match="Test error message"):
                test_function(should_fail=True)

            # Should have emitted 2 events total (Complete for success, Failed for error)
            assert mock_emit.call_count == 2

            # Verify all AuditEvent fields in the error event.
            # Default severity (INFO) is escalated to ERROR on exception.
            error_event = mock_emit.call_args_list[1][0][0]
            _assert_audit_event_fields(
                error_event,
                EventCategory.USER_ACTION,
                EventSeverity.ERROR,
                "test_function_error",
                "tests.unit.audit.test_decorators",
                "Function test_function failed with ValueError",
                expected_status=EventStatus.ERROR,
            )

            # Verify error-specific structured data
            function_data = error_event.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.error_type == "ValueError"
            assert function_data.error_message == "Look at the Operational Logs for full diagnosis"

    def test_track_event_sanitizes_sensitive_data_in_exception_messages(self) -> None:
        """Test that exception messages with sensitive data are sanitized and don't leak into audit events."""

        @track_event(EventCategory.SECURITY_EVENT)
        def test_function_with_password_leak(password: str) -> str:
            msg = f"Invalid password: {password}"
            raise ValueError(msg)

        @track_event(EventCategory.SECURITY_EVENT)
        def test_function_with_token_leak(token: str) -> str:
            msg = f"Token {token} expired"
            raise RuntimeError(msg)

        @track_event(EventCategory.SECURITY_EVENT)
        def test_function_with_api_key_leak(api_key: str) -> str:
            msg = f"Missing API key: {api_key}"
            raise KeyError(msg)

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            # Test password in exception message
            with pytest.raises(ValueError, match="Invalid password: secret123"):
                test_function_with_password_leak("secret123")

            # Test token in exception message
            with pytest.raises(RuntimeError, match="Token abc123xyz expired"):
                test_function_with_token_leak("abc123xyz")

            # Test API key in exception message
            with pytest.raises(KeyError, match="Missing API key: sk-1234567890abcdef"):
                test_function_with_api_key_leak("sk-1234567890abcdef")

            # Should have emitted 3 events total (Failed for each function)
            assert mock_emit.call_count == 3

            # Check error events (indices 0, 1, 2)
            error_events = [mock_emit.call_args_list[i][0][0] for i in [0, 1, 2]]
            sensitive_patterns = ["secret123", "abc123xyz", "sk-1234567890abcdef"]

            for error_event, sensitive_pattern in zip(error_events, sensitive_patterns, strict=True):
                # 1. error_message should be the generic sanitized message
                assert error_event.structured_data.error_message == "Look at the Operational Logs for full diagnosis"

                # 2. error_type should be captured correctly
                assert error_event.structured_data.error_type in ["ValueError", "RuntimeError", "KeyError"]

                # 3. event_message should NOT contain the raw exception text with sensitive data
                assert sensitive_pattern not in error_event.event_message
                # event_message should be generic like "Function test_function_with_password_leak failed"
                assert "test_function_with" in error_event.event_message
                assert "failed with" in error_event.event_message

                # 4. Verify sensitive pattern is NOT in any audit event field
                event_dict = error_event.model_dump()
                for field_name, field_value in event_dict.items():
                    if isinstance(field_value, str):
                        assert sensitive_pattern not in field_value, (
                            f"Sensitive data '{sensitive_pattern}' leaked into field '{field_name}'"
                        )

    def test_track_event_exception_with_args_capture(self) -> None:
        """Test exception handling with argument capture."""

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(param1: str, param2: int) -> str:
            error_msg = "Function failed"
            raise RuntimeError(error_msg)

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            with pytest.raises(RuntimeError):
                test_function("test", 42)

            # Verify all AuditEvent fields in the error event.
            # Default severity (INFO) is escalated to ERROR on exception.
            error_event = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                error_event,
                EventCategory.USER_ACTION,
                EventSeverity.ERROR,
                "test_function_error",
                "tests.unit.audit.test_decorators",
                "Function test_function failed with RuntimeError",
                expected_status=EventStatus.ERROR,
            )

            # Verify error-specific structured data with captured arguments
            function_data = error_event.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.error_type == "RuntimeError"
            assert function_data.error_message == "Look at the Operational Logs for full diagnosis"
            assert function_data.function_args == {"param1": "test", "param2": 42}

    def test_track_event_async_function_support(self) -> None:
        """Test decorator works with async functions."""
        import asyncio

        @track_event(EventCategory.USER_ACTION)
        async def async_function(value: str) -> str:
            await asyncio.sleep(0)  # Simulate async operation
            return f"async_{value}"

        async def run_test() -> None:
            with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
                result = await async_function("test")

                assert result == "async_test"
                assert mock_emit.call_count == 1

                # Verify all AuditEvent fields are correctly populated
                event_obj = mock_emit.call_args[0][0]
                _assert_audit_event_fields(
                    event_obj,
                    EventCategory.USER_ACTION,
                    EventSeverity.INFO,
                    "async_function",
                    "tests.unit.audit.test_decorators",
                    "Function async_function executed successfully",
                )

        # Run the async test
        asyncio.run(run_test())

    def test_track_event_argument_capture_failure_fallback(self) -> None:
        """Test handling of argument capture failures."""

        @track_event(EventCategory.USER_ACTION, capture_args=True, capture_result=True)
        def test_function(*args: str) -> str:
            return "success"

        # Mock inspect.signature to raise an exception
        with (
            patch("nexus.audit.decorators.inspect.signature") as mock_signature,
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit,
        ):
            mock_signature.side_effect = TypeError("Signature failed")
            test_function("arg1", "arg2")

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

            # Verify secure fallback when signature fails (no sensitive data exposure)
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            function_args = function_data.function_args
            # Should contain error indicator instead of raw args/kwargs
            assert function_args == {"capture_error": "Failed to bind function signature"}

    def test_track_event_context_variable_injection(self) -> None:
        """Test that context variables are properly injected into events."""
        from nexus.audit.emitter import (
            activity_id_context_var,
            actor_id_context_var,
            actor_type_context_var,
            execution_id_context_var,
            workflow_id_context_var,
        )

        user_id = uuid4()
        workflow_id = uuid4()
        activity_id = "activity-id"
        execution_id = uuid4()

        @track_event(EventCategory.USER_ACTION)
        def test_function() -> str:
            return "success"

        # Set context variables
        token_actor_id = actor_id_context_var.set(user_id)
        token_actor_type = actor_type_context_var.set(ActorType.USER)
        token_workflow_id = workflow_id_context_var.set(workflow_id)
        token_activity_id = activity_id_context_var.set(activity_id)
        token_execution_id = execution_id_context_var.set(execution_id)

        try:
            with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
                test_function()

                # Verify all AuditEvent fields with context variable injection
                event_obj = mock_emit.call_args[0][0]
                _assert_audit_event_fields(
                    event_obj,
                    EventCategory.USER_ACTION,
                    EventSeverity.INFO,
                    "test_function",
                    "tests.unit.audit.test_decorators",
                    "Function test_function executed successfully",
                    expected_actor_id=user_id,
                    expected_actor_type=ActorType.USER,
                    expected_workflow_id=workflow_id,
                    expected_activity_id=activity_id,
                    expected_execution_id=execution_id,
                )
        finally:
            # Clean up context variables
            actor_id_context_var.reset(token_actor_id)
            actor_type_context_var.reset(token_actor_type)
            workflow_id_context_var.reset(token_workflow_id)
            activity_id_context_var.reset(token_activity_id)
            execution_id_context_var.reset(token_execution_id)


class TestTrackEventEdgeCases:
    """Test edge cases and error conditions for track_event decorator."""

    def test_track_event_multiple_decorators(self) -> None:
        """Test function with multiple track_event decorators."""

        @track_event(EventCategory.USER_ACTION, event_action="outer")
        @track_event(EventCategory.SYSTEM_OPERATION, event_action="inner")
        def double_decorated_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = double_decorated_function()

            assert result == "success"
            # Should emit 4 events (Attempting+Complete for each decorator)
            assert mock_emit.call_count == 2

            # Check that both decorators were applied with correct actions
            calls = mock_emit.call_args_list
            actions = [call[0][0].event_action for call in calls]
            assert "outer" in actions
            assert "inner" in actions

            # No actor context set — defaults to SYSTEM
            for call in calls:
                assert call[0][0].actor_type == ActorType.SYSTEM

    def test_track_event_comprehensive_parameter_usage(self) -> None:
        """Test decorator with all parameters specified."""
        fallback_context = ActorContext(actor_id=None, actor_type=ActorType.SYSTEM)

        @track_event(
            EventCategory.SYSTEM_OPERATION,
            event_action="comprehensive_test",
            source_component="test.comprehensive",
            capture_args=True,
            capture_result=True,
            actor_param="admin_user",
            actor_fallback=fallback_context,
        )
        def comprehensive_function(admin_user: str, data: dict[str, str]) -> dict[str, dict[str, str]]:
            return {"processed": data}

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = comprehensive_function("admin", {"key": "value"})

            assert result == {"processed": {"key": "value"}}

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.SYSTEM_OPERATION,
                EventSeverity.INFO,
                "comprehensive_test",
                "test.comprehensive",
                "Function comprehensive_test executed successfully",
            )

            # Verify captured args and result
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.function_args is not None
            assert isinstance(function_data.function_args, dict)
            assert function_data.function_args["admin_user"] == "admin"
            assert isinstance(function_data.function_result, dict)

    def test_track_event_with_fastapi_user_object(self) -> None:
        """Test actor extraction from FastAPI-style user objects."""
        user_id = uuid4()

        # Simulate a FastAPI user object
        user = Mock()
        user.id = user_id

        @track_event(EventCategory.USER_ACTION, capture_args=False)  # Avoid Mock serialization
        def test_function(current_user: Mock) -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function(current_user=user)

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
                expected_actor_id=user_id,
                expected_actor_type=ActorType.USER,
            )

    def test_track_event_data_sanitization(self) -> None:
        """Test that structured data goes through sanitization pipeline."""

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(password: str, username: str) -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function(password="secret123", username="testuser")  # noqa: S106

            # Verify all AuditEvent fields are correctly populated
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

            # Verify sanitization pipeline redacted the sensitive field
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.function_args is not None
            assert function_data.function_args["password"] == "[REDACTED]"  # noqa: S105
            assert function_data.function_args["username"] == "testuser"

    async def test_track_event_async_function_with_result_capture(self) -> None:
        """Test async function with result capture."""
        import asyncio

        @track_event(EventCategory.USER_ACTION, capture_result=True)
        async def async_function(value: str) -> str:
            await asyncio.sleep(0)  # Simulate async operation
            return f"processed_{value}"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = await async_function("test_data")

            assert result == "processed_test_data"
            assert mock_emit.call_count == 1

            # Verify result was captured correctly
            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.function_result == "processed_test_data"

    async def test_track_event_async_function_error_handling(self) -> None:
        """Test async function error handling and audit event emission."""
        import asyncio

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        async def async_function_with_error(value: str) -> str:
            await asyncio.sleep(0)  # Simulate async operation before error
            error_msg = "Async function error"
            raise ValueError(error_msg)

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            with pytest.raises(ValueError, match="Async function error"):
                await async_function_with_error("test")

            assert mock_emit.call_count == 1

            # Verify error event was captured correctly
            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            assert event_obj.event_action == "async_function_with_error_error"
            assert "failed with ValueError" in event_obj.event_message

            # Verify error details in structured data
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)
            assert function_data.error_type == "ValueError"
            assert function_data.error_message == "Look at the Operational Logs for full diagnosis"
            assert function_data.function_args == {"value": "test"}

    def test_track_event_selective_argument_capture(self) -> None:
        """Test selective argument capture with set of parameter names."""

        @track_event(EventCategory.USER_ACTION, capture_args={"username", "action"})
        def test_function(username: str, password: str, action: str, token: str) -> str:
            return f"{username} performed {action}"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function("john", "secret123", "login", "abc123")

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should only capture specified parameters
            assert function_data.function_args is not None
            assert isinstance(function_data.function_args, dict)
            args = function_data.function_args
            assert args["username"] == "john"
            assert args["action"] == "login"
            # Should NOT capture sensitive parameters
            assert "password" not in args
            assert "token" not in args

    def test_track_event_selective_result_capture_dict(self) -> None:
        """Test selective result capture from dictionary return."""

        @track_event(EventCategory.USER_ACTION, capture_result={"user_id", "status"})
        def test_function() -> dict[str, Any]:
            return {
                "user_id": "123",
                "status": "success",
                "password": "secret",
                "token": "abc123",
                "metadata": {"internal": "data"},
            }

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should only capture specified fields
            assert function_data.function_result is not None
            result = function_data.function_result
            assert result["user_id"] == "123"
            assert result["status"] == "success"
            # Should NOT capture sensitive fields
            assert "password" not in result
            assert "token" not in result
            assert "metadata" not in result

    def test_track_event_selective_result_capture_object(self) -> None:
        """Test selective result capture from object return."""

        class UserResult:
            def __init__(self) -> None:
                self.user_id = "456"
                self.name = "Jane"
                self.password = "secret"  # noqa: S105
                self.token = "xyz789"  # noqa: S105

        @track_event(EventCategory.USER_ACTION, capture_result={"user_id", "name"})
        def test_function() -> UserResult:
            return UserResult()

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should only capture specified attributes
            assert function_data.function_result is not None
            result = function_data.function_result
            assert result["user_id"] == "456"
            assert result["name"] == "Jane"
            # Should NOT capture sensitive attributes
            assert "password" not in result
            assert "token" not in result

    def test_track_event_selective_capture_empty_set(self) -> None:
        """Test that empty set results in no capture."""

        @track_event(EventCategory.USER_ACTION, capture_args=set(), capture_result=set())
        def test_function(username: str, password: str) -> dict[str, str]:
            return {"result": "data", "sensitive": "info"}

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function("john", "secret")

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Empty set behaves like False — no capture keys present
            assert isinstance(getattr(function_data, "function_args", None), dict)
            assert len(getattr(function_data, "function_args", {}).items()) == 0
            assert getattr(function_data, "function_result", None) is None

    def test_track_event_selective_args_signature_failure(self) -> None:
        """Test selective argument capture behavior when signature binding fails."""

        @track_event(EventCategory.USER_ACTION, capture_args={"param1"})
        def test_function(*args: str, **kwargs: str) -> str:
            return "success"

        # Mock inspect.signature to raise an error
        with (
            patch("nexus.audit.decorators.inspect.signature", side_effect=TypeError("Mock error")),
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit,
        ):
            test_function("arg1", "arg2", kwarg1="value1")

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # For selective capture, should return error indicator instead of empty dict
            assert function_data.function_args == {"capture_error": "Failed to bind function signature"}

    def test_track_event_backward_compatibility(self) -> None:
        """Test that existing boolean usage still works."""

        @track_event(EventCategory.USER_ACTION, capture_args=True, capture_result=True)
        def test_function(username: str, safe_param: str) -> dict[str, str]:
            return {"result": "data", "status": "success"}

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function("john", "safe_value")

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should capture everything (backward compatibility)
            assert function_data.function_args == {"username": "john", "safe_param": "safe_value"}
            assert function_data.function_result == {"result": "data", "status": "success"}

    async def test_track_event_async_vs_sync_timing(self) -> None:
        """Test event emits after function completes."""
        import asyncio

        events_captured = []

        def capture_event(event_obj: AuditEvent) -> None:
            events_captured.append((event_obj.event_action, "emitted"))

        @track_event(EventCategory.USER_ACTION)
        async def async_function() -> str:
            events_captured.append(("async_function", "started"))
            await asyncio.sleep(0)
            events_captured.append(("async_function", "finished"))
            return "async_result"

        @track_event(EventCategory.USER_ACTION)
        def sync_function() -> str:
            events_captured.append(("sync_function", "started"))
            events_captured.append(("sync_function", "finished"))
            return "sync_result"

        events_captured.clear()

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            mock_emit.side_effect = capture_event

            await async_function()
            async_events = events_captured.copy()

            events_captured.clear()

            sync_function()
            sync_events = events_captured.copy()

        # body (start/finish) → complete
        assert async_events == [
            ("async_function", "started"),
            ("async_function", "finished"),
            ("async_function", "emitted"),
        ]

        assert sync_events == [
            ("sync_function", "started"),
            ("sync_function", "finished"),
            ("sync_function", "emitted"),
        ]

        # No actor context set — both events default to SYSTEM
        for call in mock_emit.call_args_list:
            assert call[0][0].actor_type == ActorType.SYSTEM

    async def test_track_event_async_context_variables_cleanup(self) -> None:
        """Test that async functions properly clean up context variables."""
        import asyncio

        from nexus.audit.emitter import actor_id_context_var, actor_type_context_var

        @track_event(EventCategory.USER_ACTION)
        async def async_function() -> str:
            # Verify context is set during execution (no actor provided defaults to SYSTEM)
            assert actor_id_context_var.get() is None
            assert actor_type_context_var.get() == ActorType.SYSTEM
            await asyncio.sleep(0)
            return "result"

        # Store initial context state
        initial_actor_id = None
        initial_actor_type = None
        try:
            initial_actor_id = actor_id_context_var.get()
        except LookupError:
            pass
        try:
            initial_actor_type = actor_type_context_var.get()
        except LookupError:
            pass

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            await async_function()

        # Verify emitted event has SYSTEM actor_type
        emitted_event = mock_emit.call_args[0][0]
        assert emitted_event.actor_type == ActorType.SYSTEM

        # Verify context is restored to initial state
        final_actor_id = None
        final_actor_type = None
        try:
            final_actor_id = actor_id_context_var.get()
        except LookupError:
            pass
        try:
            final_actor_type = actor_type_context_var.get()
        except LookupError:
            pass

        assert final_actor_id == initial_actor_id
        assert final_actor_type == initial_actor_type

    def test_track_event_string_result_capture_true(self) -> None:
        """Test that capture_result=True captures string return values."""

        @track_event(EventCategory.USER_ACTION, capture_result=True)
        def test_function() -> str:
            return "Hello World"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = test_function()

            assert result == "Hello World"
            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should capture the entire string result
            assert function_data.function_result == "Hello World"

    def test_track_event_string_result_capture_false(self) -> None:
        """Test that capture_result=False does not capture string return values."""

        @track_event(EventCategory.USER_ACTION, capture_result=False)
        def test_function() -> str:
            return "Hello World"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = test_function()

            assert result == "Hello World"
            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should not capture anything
            assert getattr(function_data, "function_result", None) is None

    def test_track_event_string_result_capture_set(self) -> None:
        """Test that capture_result=set does not capture string return values and logs warning."""

        @track_event(EventCategory.USER_ACTION, capture_result={"field1", "field2"})
        def test_function() -> str:
            return "Hello World"

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit,
            patch("nexus.audit.decorators.logger") as mock_logger,
        ):
            result = test_function()

            assert result == "Hello World"
            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Should not capture anything (safer audit default)
            assert getattr(function_data, "function_result", None) is None

            # Should have logged a warning
            mock_logger.warning.assert_called_once()
            warning_call = mock_logger.warning.call_args
            assert "Selective result capture not supported for primitive return type" in warning_call[0][0]
            assert warning_call[1]["function_name"] == "test_function"
            assert warning_call[1]["result_type"] == "str"
            assert set(warning_call[1]["requested_fields"]) == {"field1", "field2"}


class TestTrackEventSanitizationAndTruncation:
    """Test that emitted audit events from @track_event have sanitized and truncated payloads."""

    def test_track_event_emitted_event_has_sanitized_payload(self) -> None:
        """Test that sensitive data in captured arguments is redacted in the emitted event."""

        @track_event(EventCategory.USER_ACTION, capture_args=True)
        def test_function(user_password: str, username: str) -> str:
            return "ok"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function("super_secret_123", "alice")

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # Password field should be redacted by the sanitizer
            assert isinstance(function_data.function_args, dict)
            assert function_data.function_args["user_password"] == "[REDACTED]"  # noqa: S105
            # Non-sensitive field should be preserved
            assert function_data.function_args["username"] == "alice"

    def test_track_event_emitted_event_has_truncated_payload(self) -> None:
        """Test that oversized captured results are truncated in the emitted event."""

        @track_event(EventCategory.USER_ACTION, capture_result=True)
        def test_function() -> dict[str, str]:
            # Return a payload that exceeds DEFAULT_MAX_PAYLOAD_BYTES (10,000)
            return {"large_value": "x" * 20_000}

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            event_obj = mock_emit.call_args[0][0]
            assert event_obj.actor_type == ActorType.SYSTEM
            function_data = event_obj.structured_data
            assert isinstance(function_data, AuditContextData)

            # The dict structure should be preserved with truncated string leaves
            assert isinstance(function_data.function_result, dict)
            assert "...<truncated>" in function_data.function_result["large_value"]


class TestEventSeverity:
    """Test event severity override functionality."""

    def test_track_event_default_severity_info(self) -> None:
        """Test that the default event severity is INFO."""

        @track_event(EventCategory.USER_ACTION)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.USER_ACTION,
                EventSeverity.INFO,
                "test_function",
                "tests.unit.audit.test_decorators",
                "Function test_function executed successfully",
            )

    @pytest.mark.parametrize(
        ("severity", "category", "action", "expected_action"),
        [
            (EventSeverity.WARNING, EventCategory.USER_ACTION, None, "test_function"),
            (EventSeverity.ERROR, EventCategory.SYSTEM_OPERATION, "critical_operation", "critical_operation"),
            (EventSeverity.CRITICAL, EventCategory.SECURITY_EVENT, None, "test_function"),
        ],
    )
    def test_track_event_severity_override(
        self, severity: EventSeverity, category: EventCategory, action: str | None, expected_action: str
    ) -> None:
        """Test that event severity can be overridden for various severity levels."""

        @track_event(category, event_action=action, event_severity=severity)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                category,
                severity,
                expected_action,
                "tests.unit.audit.test_decorators",
                f"Function {expected_action} executed successfully",
            )

    @pytest.mark.parametrize(
        ("declared_severity", "expected_error_severity"),
        [
            # INFO and WARNING escalate to ERROR when an exception is raised
            (EventSeverity.INFO, EventSeverity.ERROR),
            (EventSeverity.WARNING, EventSeverity.ERROR),
            # ERROR stays ERROR (no-op escalation)
            (EventSeverity.ERROR, EventSeverity.ERROR),
            # CRITICAL is preserved — never downgraded to ERROR
            (EventSeverity.CRITICAL, EventSeverity.CRITICAL),
        ],
    )
    def test_track_event_severity_escalated_on_error(
        self, declared_severity: EventSeverity, expected_error_severity: EventSeverity
    ) -> None:
        """Custom severity is escalated to at least ERROR on exception; CRITICAL is preserved."""

        @track_event(EventCategory.USER_ACTION, event_severity=declared_severity)
        def test_function() -> str:
            error_msg = "Test error"
            raise RuntimeError(error_msg)

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            with pytest.raises(RuntimeError):
                test_function()

            error_event = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                error_event,
                EventCategory.USER_ACTION,
                expected_error_severity,
                "test_function_error",
                "tests.unit.audit.test_decorators",
                "Function test_function failed with RuntimeError",
                expected_status=EventStatus.ERROR,
            )

    async def test_track_event_severity_async_function(self) -> None:
        """Test that custom event severity works with async functions."""
        import asyncio

        @track_event(EventCategory.LLM_INTERACTION, event_severity=EventSeverity.ERROR)
        async def async_function() -> str:
            await asyncio.sleep(0)
            return "async_result"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            result = await async_function()

            assert result == "async_result"
            event_obj = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                event_obj,
                EventCategory.LLM_INTERACTION,
                EventSeverity.ERROR,
                "async_function",
                "tests.unit.audit.test_decorators",
                "Function async_function executed successfully",
            )

    @pytest.mark.parametrize(
        ("declared_severity", "expected_error_severity"),
        [
            (EventSeverity.INFO, EventSeverity.ERROR),
            (EventSeverity.WARNING, EventSeverity.ERROR),
            (EventSeverity.ERROR, EventSeverity.ERROR),
            (EventSeverity.CRITICAL, EventSeverity.CRITICAL),
        ],
    )
    async def test_track_event_severity_escalated_on_error_async(
        self, declared_severity: EventSeverity, expected_error_severity: EventSeverity
    ) -> None:
        """Custom severity is escalated to at least ERROR on exception in async functions; CRITICAL is preserved."""
        import asyncio

        @track_event(EventCategory.USER_ACTION, event_severity=declared_severity)
        async def test_function() -> str:
            await asyncio.sleep(0)
            error_msg = "Test error"
            raise RuntimeError(error_msg)

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            with pytest.raises(RuntimeError):
                await test_function()

            error_event = mock_emit.call_args[0][0]
            _assert_audit_event_fields(
                error_event,
                EventCategory.USER_ACTION,
                expected_error_severity,
                "test_function_error",
                "tests.unit.audit.test_decorators",
                "Function test_function failed with RuntimeError",
                expected_status=EventStatus.ERROR,
            )


class TestTrackEventAttemptingEvent:
    """Tests for event emission timing."""

    def test_single_event_emitted_on_success(self) -> None:
        """Only one event is emitted on successful function completion."""

        @track_event(EventCategory.USER_ACTION)
        def test_function() -> str:
            return "success"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            test_function()

            assert mock_emit.call_count == 1
            event = mock_emit.call_args_list[0][0][0]
            assert event.event_action == "test_function"
            assert event.event_status == EventStatus.SUCCESS

    def test_single_event_emitted_on_error(self) -> None:
        """Only one event is emitted on function error."""

        @track_event(EventCategory.USER_ACTION)
        def test_function() -> str:
            msg = "test error"
            raise ValueError(msg)

        with (
            patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit,
            pytest.raises(ValueError, match="test error"),
        ):
            test_function()

            assert mock_emit.call_count == 1
            event = mock_emit.call_args_list[0][0][0]
            assert event.event_action == "test_function_error"
            assert event.event_status == EventStatus.ERROR

    def test_nested_decorators_produce_correct_order(self) -> None:
        """Nested @track_event produces: Complete inner, Complete outer."""

        @track_event(EventCategory.USER_ACTION, event_action="outer")
        def outer_function() -> str:
            return inner_function()

        @track_event(EventCategory.USER_ACTION, event_action="inner")
        def inner_function() -> str:
            return "done"

        with patch("nexus.audit.emitter._do_emit_audit_event") as mock_emit:
            outer_function()

            assert mock_emit.call_count == 2
            actions = [call[0][0].event_action for call in mock_emit.call_args_list]
            assert actions == [
                "inner",
                "outer",
            ]
