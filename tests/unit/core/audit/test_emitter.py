"""Unit tests for audit event emission utilities."""

from contextvars import copy_context
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest

from nexus.core.audit.emitter import (
    _do_emit_audit_event,
    _get_current_actor_context,
    _sanitizer,
    actor_id_context_var,
    actor_type_context_var,
    emit_audit_event,
    execution_id_context_var,
    workflow_id_context_var,
)
from nexus.core.audit.sanitization import EventSanitizer
from nexus.core.audit.types import ActorType, AuditEvent, EventCategory


class TestEventCaptureContextMethods:
    """Test EventCapture context management methods."""

    def test_get_current_actor_context_defaults(self) -> None:
        """Test getting context with default values."""
        context = _get_current_actor_context()

        assert context["actor_id"] is None
        assert context["actor_type"] == ActorType.SYSTEM
        assert context["workflow_id"] is None
        assert context["execution_id"] is None

    def test_get_current_actor_context_with_set_values(self) -> None:
        """Test getting context with set values."""
        test_actor_id = uuid4()
        test_workflow_id = uuid4()
        test_execution_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.USER)
            workflow_id_context_var.set(test_workflow_id)
            execution_id_context_var.set(test_execution_id)

            context = _get_current_actor_context()

            assert context["actor_id"] == test_actor_id
            assert context["actor_type"] == ActorType.USER
            assert context["workflow_id"] == test_workflow_id
            assert context["execution_id"] == test_execution_id

        ctx.run(test_in_context)

    def test_get_current_actor_context_partial_values(self) -> None:
        """Test getting context with only some values set."""
        test_actor_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.SERVICE)

            context = _get_current_actor_context()

            assert context["actor_id"] == test_actor_id
            assert context["actor_type"] == ActorType.SERVICE
            assert context["workflow_id"] is None  # Still default
            assert context["execution_id"] is None  # Still default

        ctx.run(test_in_context)


class TestEventCaptureSanitizerConfiguration:
    """Test EventCapture sanitizer configuration."""

    def test_default_sanitizer_exists(self) -> None:
        """Test that sanitizer is properly configured at bootstrap."""
        assert _sanitizer is not None
        assert isinstance(_sanitizer, EventSanitizer)
        assert len(_sanitizer.detectors) > 0


class TestEventCaptureEmitAuditEvent:
    """Test EventCapture.emit_audit_event method."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_basic(self, mock_do_emit: Mock) -> None:
        """Test basic audit event emission."""
        # Create test event
        event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="test_action",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="test_component",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message="Test message",
            structured_data={"key": "value"},
        )

        # Emit the event
        emit_audit_event(event)

        # Verify _do_emit_audit_event was called once
        mock_do_emit.assert_called_once()

        # Verify the event dict passed to _do_emit_audit_event
        call_args = mock_do_emit.call_args[0][0]  # First positional argument
        assert "event_id" in call_args
        assert call_args["event_category"] == EventCategory.USER_ACTION
        assert call_args["event_action"] == "test_action"
        assert call_args["actor_type"] == ActorType.USER
        assert call_args["source_component"] == "test_component"
        assert call_args["event_message"] == "Test message"
        assert "structured_data" in call_args

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_with_context_injection(self, mock_do_emit: Mock) -> None:
        """Test audit event emission with context injection."""
        test_actor_id = uuid4()
        test_workflow_id = uuid4()
        test_execution_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            # Set context variables
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.SERVICE)
            workflow_id_context_var.set(test_workflow_id)
            execution_id_context_var.set(test_execution_id)

            # Create event without actor/context info
            event = AuditEvent(
                event_category=EventCategory.SYSTEM_OPERATION,
                event_action="auto_action",
                actor_id=None,  # Will be injected from context
                actor_type=ActorType.SYSTEM,
                source_component="test_component",
                workflow_id=None,
                activity_id=None,
                execution_id=None,
                event_message="Auto message",
            )

            # Emit the event
            emit_audit_event(event)

            # Verify _do_emit_audit_event was called
            mock_do_emit.assert_called_once()
            event_dict = mock_do_emit.call_args[0][0]

            # Verify context injection worked for None fields only
            assert event_dict["actor_id"] == str(test_actor_id)  # UUIDs are serialized as strings
            assert event_dict["actor_type"] == ActorType.SYSTEM.value  # actor_type is not context-injected
            assert event_dict["workflow_id"] == str(test_workflow_id)
            assert event_dict["execution_id"] == str(test_execution_id)

        ctx.run(test_in_context)

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_no_context_override(self, mock_do_emit: Mock) -> None:
        """Test that existing event values are not overridden by context."""
        event_actor_id = uuid4()
        event_workflow_id = uuid4()
        context_actor_id = uuid4()
        context_workflow_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            # Set context variables
            actor_id_context_var.set(context_actor_id)
            workflow_id_context_var.set(context_workflow_id)

            # Create event with existing values
            event = AuditEvent(
                event_category=EventCategory.USER_ACTION,
                event_action="user_action",
                actor_id=event_actor_id,  # Should not be overridden
                actor_type=ActorType.USER,
                workflow_id=event_workflow_id,  # Should not be overridden
                activity_id=None,
                execution_id=None,
                source_component="test_component",
                event_message="User message",
            )

            # Emit the event
            emit_audit_event(event)

            # Verify original values were preserved
            event_dict = mock_do_emit.call_args[0][0]
            assert event_dict["actor_id"] == str(event_actor_id)  # Not context_actor_id
            assert event_dict["workflow_id"] == str(event_workflow_id)  # Not context_workflow_id

        ctx.run(test_in_context)

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_data_sanitization(self, mock_do_emit: Mock) -> None:
        """Test that structured_data is sanitized before emission."""
        # Create event with sensitive data
        event = AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_action="login",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="auth_service",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message="User login",
            structured_data={
                "username": "testuser",
                "password": "secret123",
                "email": "test@example.com",
                "normal_data": "safe_value",
            },
        )

        # Emit the event
        emit_audit_event(event)

        # Verify sanitization occurred
        event_dict = mock_do_emit.call_args[0][0]
        structured_data = event_dict["structured_data"]

        assert structured_data["username"] == "testuser"
        assert structured_data["password"] == "[REDACTED]"  # Should be sanitized  # noqa: S105
        assert structured_data["email"] == "[EMAIL_REDACTED]"  # Should be sanitized
        assert structured_data["normal_data"] == "safe_value"

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_comprehensive_sensitive_data_sanitization(self, mock_do_emit: Mock) -> None:
        """Test that all sensitive data patterns are properly sanitized."""
        # Create event with various types of sensitive data
        event = AuditEvent(
            event_category=EventCategory.SECURITY_EVENT,
            event_action="authentication",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="auth_service",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message="User authentication attempt",
            structured_data={
                # Original patterns
                "password": "secret123",
                "secret": "mysecret",
                "token": "abc123",
                "api_key": "key123",
                "auth": "bearer xyz",
                # New comprehensive patterns
                "credential": "cred123",
                "private_key": "-----BEGIN PRIVATE KEY-----",
                "session": "session123",
                "cookie": "sessionid=abc123",
                "jwt": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
                "bearer": "Bearer token123",
                "client_secret": "client_secret_abc",
                "access_token": "access_xyz",
                "refresh_token": "refresh_xyz",
                # Safe data
                "username": "testuser",
                "normal_data": "safe_value",
            },
        )

        # Emit the event
        emit_audit_event(event)

        # Verify comprehensive sanitization occurred
        event_dict = mock_do_emit.call_args[0][0]
        structured_data = event_dict["structured_data"]

        assert structured_data["password"] == "[REDACTED]"  # noqa: S105
        assert structured_data["secret"] == "[REDACTED]"  # noqa: S105
        assert structured_data["token"] == "[REDACTED]"  # noqa: S105
        assert structured_data["api_key"] == "[REDACTED]"
        assert structured_data["auth"] == "[REDACTED]"

        assert structured_data["credential"] == "[REDACTED]"
        assert structured_data["private_key"] == "[REDACTED]"
        assert structured_data["session"] == "[REDACTED]"
        assert structured_data["cookie"] == "[REDACTED]"
        assert structured_data["jwt"] == "[REDACTED]"
        assert structured_data["bearer"] == "[REDACTED]"
        assert structured_data["client_secret"] == "[REDACTED]"  # noqa: S105
        assert structured_data["access_token"] == "[REDACTED]"  # noqa: S105
        assert structured_data["refresh_token"] == "[REDACTED]"  # noqa: S105

        # Safe data should remain unchanged
        assert structured_data["username"] == "testuser"
        assert structured_data["normal_data"] == "safe_value"

    @pytest.mark.parametrize(
        ("field_name", "field_value", "expected_result", "test_description"),
        [
            # Safe fields that should NOT be redacted
            ("key", "database.timeout", "database.timeout", "legitimate standalone key usage"),
            ("keyspace", "redis.namespace", "redis.namespace", "legitimate keyspace usage"),
            ("keymap", "user.mappings", "user.mappings", "legitimate keymap usage"),
            ("keyboard", "en-US", "en-US", "legitimate keyboard usage"),
            ("username", "testuser", "testuser", "legitimate username"),
            ("value", "30000", "30000", "legitimate value"),
            ("configuration", "app_config", "app_config", "legitimate configuration"),
            ("endpoint", "/api/v1/users", "/api/v1/users", "legitimate endpoint"),
            # Redaction patterns from emitter.py L#26-44 that SHOULD be redacted
            # password patterns
            ("password", "secret123", "[REDACTED]", "direct password match"),
            ("user_password", "userpass456", "[REDACTED]", "password with prefix"),
            ("admin_password", "adminpass789", "[REDACTED]", "password with prefix"),
            # secret patterns
            ("secret", "topsecret", "[REDACTED]", "direct secret match"),
            ("client_secret", "oauth_secret_123", "[REDACTED]", "secret with prefix"),
            ("app_secret", "application_secret", "[REDACTED]", "secret with prefix"),
            # token patterns
            ("token", "abc123token", "[REDACTED]", "direct token match"),
            ("auth_token", "bearer_token_456", "[REDACTED]", "token with prefix"),
            ("access_token", "oauth_access_789", "[REDACTED]", "token with prefix"),
            # _key patterns (ends with _key)
            ("config_key", "app.settings.debug", "[REDACTED]", "_key pattern ending"),
            ("lookup_key", "user.preferences.theme", "[REDACTED]", "_key pattern ending"),
            ("database_key", "db_connection_key", "[REDACTED]", "_key pattern ending"),
            ("api_key", "sk-123abc", "[REDACTED]", "_key pattern ending"),
            ("private_key", "-----BEGIN RSA PRIVATE KEY-----", "[REDACTED]", "_key pattern ending"),
            ("public_key", "-----BEGIN PUBLIC KEY-----", "[REDACTED]", "_key pattern ending"),
            ("encryption_key", "aes256_encryption_key", "[REDACTED]", "_key pattern ending"),
            ("signing_key", "rsa_signing_key", "[REDACTED]", "_key pattern ending"),
            ("access_key", "AKIA1234567890", "[REDACTED]", "_key pattern ending"),
            ("ssh_key", "ssh-rsa AAAAB3NzaC1yc2E...", "[REDACTED]", "_key pattern ending"),
            # key_ patterns (starts with key_)
            ("key_value", "some_key_value", "[REDACTED]", "key_ pattern starting"),
            ("key_store", "redis_key_store", "[REDACTED]", "key_ pattern starting"),
            ("key_manager", "key_management_service", "[REDACTED]", "key_ pattern starting"),
            # auth patterns
            ("auth", "basic_auth_string", "[REDACTED]", "direct auth match"),
            ("oauth", "oauth_token_data", "[REDACTED]", "direct oauth match"),
            ("authentication", "auth_header_data", "[REDACTED]", "direct authentication match"),
            # credential patterns
            ("credential", "user_credentials", "[REDACTED]", "direct credential match"),
            ("credentials", "login_credentials", "[REDACTED]", "direct credentials match"),
            ("user_credential", "account_credential", "[REDACTED]", "credential with prefix"),
            # session patterns
            ("session", "session_id_12345", "[REDACTED]", "direct session match"),
            ("session_id", "sess_abcdef123456", "[REDACTED]", "session with suffix"),
            ("user_session", "active_session_token", "[REDACTED]", "session with prefix"),
            # cookie patterns
            ("cookie", "sessioncookie=value", "[REDACTED]", "direct cookie match"),
            ("auth_cookie", "authentication_cookie", "[REDACTED]", "cookie with prefix"),
            ("session_cookie", "session_cookie_data", "[REDACTED]", "cookie with prefix"),
            # jwt patterns
            ("jwt", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...", "[REDACTED]", "direct jwt match"),
            ("jwt_token", "jwt_bearer_token", "[REDACTED]", "jwt with suffix"),
            ("access_jwt", "access_jwt_token", "[REDACTED]", "jwt with prefix"),
            # bearer patterns
            ("bearer", "Bearer token_value", "[REDACTED]", "direct bearer match"),
            ("bearer_token", "Bearer abc123", "[REDACTED]", "bearer with suffix"),
            ("authorization_bearer", "Bearer xyz789", "[REDACTED]", "bearer with prefix"),
            # authorization_code patterns
            ("authorization_code", "auth_code_123456", "[REDACTED]", "direct authorization_code match"),
            ("oauth_authorization_code", "oauth_code_789", "[REDACTED]", "authorization_code with prefix"),
            ("auth_code", "authorization_code_abc", "[REDACTED]", "authorization_code partial match"),
            # certificate patterns
            ("certificate", "-----BEGIN CERTIFICATE-----", "[REDACTED]", "direct certificate match"),
            ("ssl_certificate", "x509_certificate_data", "[REDACTED]", "certificate with prefix"),
            ("client_certificate", "client_cert_data", "[REDACTED]", "certificate with prefix"),
            # cert patterns
            ("cert", "certificate_content", "[REDACTED]", "direct cert match"),
            ("ssl_cert", "ssl_certificate", "[REDACTED]", "cert with prefix"),
            ("client_cert", "client_certificate_data", "[REDACTED]", "cert with prefix"),
            # pem patterns
            ("pem", "-----BEGIN PRIVATE KEY-----", "[REDACTED]", "direct pem match"),
            ("pem_file", "certificate.pem_content", "[REDACTED]", "pem with suffix"),
            ("ssl_pem", "ssl_certificate_pem", "[REDACTED]", "pem with prefix"),
        ],
    )
    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_field_redaction(
        self,
        mock_do_emit: Mock,
        field_name: str,
        field_value: str,
        expected_result: str,
        test_description: str,
    ) -> None:
        """Test that specific fields are redacted according to defined patterns from emitter.py L#26-44."""
        # Create event with the specific field to test
        event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="field_test",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="test_service",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message=f"Testing {test_description}",
            structured_data={field_name: field_value},
        )

        # Emit the event
        emit_audit_event(event)

        # Verify the specific field was handled correctly
        event_dict = mock_do_emit.call_args[0][0]
        structured_data = event_dict["structured_data"]

        assert structured_data[field_name] == expected_result, (
            f"Field '{field_name}' with value '{field_value}' should result in '{expected_result}' "
            f"for {test_description}, but got '{structured_data[field_name]}'"
        )

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_empty_structured_data(self, mock_do_emit: Mock) -> None:
        """Test audit event emission with empty structured data."""
        # Create event with empty structured data
        event = AuditEvent(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="system_startup",
            actor_id=uuid4(),
            actor_type=ActorType.SYSTEM,
            source_component="core_service",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message="System starting up",
            # structured_data defaults to empty dict
        )

        # Emit the event
        emit_audit_event(event)

        # Verify empty dict was handled correctly
        event_dict = mock_do_emit.call_args[0][0]
        assert event_dict["structured_data"] == {}

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_complex_structured_data(self, mock_do_emit: Mock) -> None:
        """Test audit event emission with complex nested structured data."""
        # Create event with complex structured data
        complex_data = {
            "user_info": {
                "username": "testuser",
                "email": "test@example.com",
                "preferences": {"theme": "dark", "api_token": "secret_token_123"},
            },
            "request_data": {"method": "POST", "url": "/api/v1/users", "headers": {"Authorization": "Bearer token123"}},
            "response_data": {"status": 201, "message": "User created successfully"},
        }

        event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="create_user",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="user_service",
            workflow_id=None,
            activity_id=None,
            execution_id=None,
            event_message="User creation request",
            structured_data=complex_data,
        )

        # Emit the event
        emit_audit_event(event)

        # Verify complex data was sanitized appropriately
        event_dict = mock_do_emit.call_args[0][0]
        sanitized_data = event_dict["structured_data"]

        # Check that nested sensitive data was sanitized
        assert sanitized_data["user_info"]["username"] == "testuser"
        assert sanitized_data["user_info"]["email"] == "[EMAIL_REDACTED]"
        assert sanitized_data["user_info"]["preferences"]["theme"] == "dark"
        assert sanitized_data["user_info"]["preferences"]["api_token"] == "[REDACTED]"  # noqa: S105
        assert sanitized_data["request_data"]["method"] == "POST"
        assert sanitized_data["response_data"]["status"] == 201


class TestEventCaptureDoEmitAuditEvent:
    """Test EventCapture._do_emit_audit_event method."""

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_logger_setup(self, mock_logger: Mock) -> None:
        """Test that _do_emit_audit_event uses the module-level logger correctly."""
        test_event_dict = {
            "event_id": str(uuid4()),
            "event_category": EventCategory.USER_ACTION,
            "event_action": "test_action",
            "actor_type": ActorType.USER,
            "structured_data": {"key": "value"},
        }

        # Call the method
        _do_emit_audit_event(test_event_dict)

        # Verify info method was called with correct arguments
        mock_logger.info.assert_called_once_with("audit_event", **test_event_dict)

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_with_all_fields(self, mock_logger: Mock) -> None:
        """Test _do_emit_audit_event with all possible fields."""
        test_event_dict = {
            "event_id": str(uuid4()),
            "event_category": EventCategory.WORKFLOW_EVENT,
            "event_action": "workflow_started",
            "event_time": "2024-01-01T12:00:00Z",
            "actor_id": str(uuid4()),
            "actor_type": ActorType.SYSTEM,
            "source_component": "workflow_engine",
            "workflow_id": str(uuid4()),
            "activity_id": "activity_123",
            "execution_id": str(uuid4()),
            "event_message": "Workflow execution started",
            "structured_data": {"workflow_name": "test_workflow", "input_params": {"param1": "value1"}},
        }

        # Call the method
        _do_emit_audit_event(test_event_dict)

        # Verify all fields were passed to logger
        call_args = mock_logger.info.call_args
        assert call_args[0][0] == "audit_event"

        kwargs = call_args[1]
        for key, value in test_event_dict.items():
            assert kwargs[key] == value

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_minimal_fields(self, mock_logger: Mock) -> None:
        """Test _do_emit_audit_event with minimal required fields."""
        test_event_dict = {
            "event_category": EventCategory.SYSTEM_OPERATION,
            "event_action": "minimal_action",
            "structured_data": {},
        }

        # Call the method
        _do_emit_audit_event(test_event_dict)

        # Verify minimal fields were passed
        kwargs = mock_logger.info.call_args[1]
        assert kwargs["event_category"] == EventCategory.SYSTEM_OPERATION
        assert kwargs["event_action"] == "minimal_action"
        assert kwargs["structured_data"] == {}


class TestEventCaptureIntegration:
    """Integration tests for EventCapture functionality."""

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_full_emission_flow(self, mock_do_emit: Mock) -> None:
        """Test the complete flow from event creation to emission."""
        test_actor_id = uuid4()
        test_workflow_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            # Set up context
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.USER)
            workflow_id_context_var.set(test_workflow_id)

            # Create and emit event
            event = AuditEvent(
                event_category=EventCategory.AGENT_INTERACTION,
                event_action="agent_query",
                actor_id=None,  # Will be injected
                actor_type=ActorType.SYSTEM,
                source_component="agent_service",
                workflow_id=None,
                activity_id=None,
                execution_id=None,
                event_message="User queried agent",
                structured_data={
                    "query": "What is the weather?",
                    "password": "secret123",  # Should be sanitized
                    "user_email": "user@example.com",  # Should be sanitized
                },
            )

            emit_audit_event(event)

            # Comprehensive verification
            mock_do_emit.assert_called_once()
            event_dict = mock_do_emit.call_args[0][0]

            # Verify context injection
            assert event_dict["actor_id"] == str(test_actor_id)  # UUIDs are serialized as strings
            assert event_dict["actor_type"] == ActorType.SYSTEM.value  # actor_type is not context-injected
            assert event_dict["workflow_id"] == str(test_workflow_id)

            # Verify event data
            assert event_dict["event_category"] == EventCategory.AGENT_INTERACTION
            assert event_dict["event_action"] == "agent_query"
            assert event_dict["source_component"] == "agent_service"
            assert event_dict["event_message"] == "User queried agent"

            # Verify sanitization
            structured_data = event_dict["structured_data"]
            assert structured_data["query"] == "What is the weather?"
            assert structured_data["password"] == "[REDACTED]"  # noqa: S105
            assert structured_data["user_email"] == "[EMAIL_REDACTED]"

            # Verify event_id was generated
            assert "event_id" in event_dict
            assert "event_time" in event_dict

        ctx.run(test_in_context)

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_multiple_events_emission(self, mock_do_emit: Mock) -> None:
        """Test emitting multiple events in sequence."""
        # Create and emit multiple events
        events = [
            AuditEvent(
                event_category=EventCategory.USER_ACTION,
                event_action=f"action_{i}",
                actor_id=uuid4(),
                actor_type=ActorType.USER,
                source_component="test_component",
                workflow_id=None,
                activity_id=None,
                execution_id=None,
                event_message=f"Test message {i}",
                structured_data={"index": i},
            )
            for i in range(3)
        ]

        for event in events:
            emit_audit_event(event)

        # Verify all events were emitted
        assert mock_do_emit.call_count == 3

        # Verify each event was logged with correct action
        for i, call in enumerate(mock_do_emit.call_args_list):
            event_dict = call[0][0]  # First positional argument
            assert event_dict["event_action"] == f"action_{i}"
            assert event_dict["structured_data"]["index"] == i
