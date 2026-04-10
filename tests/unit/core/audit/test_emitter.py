"""Unit tests for audit event emission utilities."""

from contextvars import copy_context
from unittest.mock import Mock, patch
from uuid import uuid4

import pytest

from nexus.core.audit.emitter import (
    _do_emit_audit_event,
    _get_current_actor_context,
    _sanitizer,
    activity_id_context_var,
    actor_id_context_var,
    actor_type_context_var,
    emit_audit_event,
    execution_id_context_var,
    workflow_id_context_var,
)
from nexus.core.audit.sanitization import EventSanitizer
from nexus.core.audit.schemas import AuditContextData, BaseAuditData
from nexus.core.audit.types import ActorType, AuditEvent, EventCategory


class TestEventCaptureContextMethods:
    """Test EventCapture context management methods."""

    def test_get_current_actor_context_defaults(self) -> None:
        """Test getting context with default values."""
        context = _get_current_actor_context()

        assert context["actor_id"] is None
        assert context["actor_type"] is None
        assert context["workflow_id"] is None
        assert context["activity_id"] is None
        assert context["execution_id"] is None

    def test_get_current_actor_context_with_set_values(self) -> None:
        """Test getting context with set values."""
        test_actor_id = uuid4()
        test_workflow_id = uuid4()
        test_activity_id = "activity_id"
        test_execution_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.USER)
            workflow_id_context_var.set(test_workflow_id)
            activity_id_context_var.set(test_activity_id)
            execution_id_context_var.set(test_execution_id)

            context = _get_current_actor_context()

            assert context["actor_id"] == test_actor_id
            assert context["actor_type"] == ActorType.USER
            assert context["workflow_id"] == test_workflow_id
            assert context["activity_id"] == test_activity_id
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
            assert context["activity_id"] is None  # Still default
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
            event_message="Test message",
            structured_data=BaseAuditData(status="success"),
        )

        # Emit the event
        emit_audit_event(event)

        # Verify _do_emit_audit_event was called once
        mock_do_emit.assert_called_once()

        # Verify the event object passed to _do_emit_audit_event
        call_args = mock_do_emit.call_args[0][0]  # First positional argument
        assert call_args.event_id is not None
        assert call_args.event_category == EventCategory.USER_ACTION
        assert call_args.event_action == "test_action"
        assert call_args.actor_type == ActorType.USER
        assert call_args.source_component == "test_component"
        assert call_args.event_message == "Test message"
        assert call_args.structured_data is not None

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_with_context_injection(self, mock_do_emit: Mock) -> None:
        """Test audit event emission with context injection."""
        test_actor_id = uuid4()
        test_workflow_id = uuid4()
        test_activity_id = "activity_id"
        test_execution_id = uuid4()

        # Use context copy to isolate the test
        ctx = copy_context()

        def test_in_context() -> None:
            # Set context variables
            actor_id_context_var.set(test_actor_id)
            actor_type_context_var.set(ActorType.SERVICE)
            workflow_id_context_var.set(test_workflow_id)
            activity_id_context_var.set(test_activity_id)
            execution_id_context_var.set(test_execution_id)

            # Create event without actor/context info
            event = AuditEvent(
                event_category=EventCategory.SYSTEM_OPERATION,
                event_action="auto_action",
                actor_type=ActorType.SYSTEM,  # Required field, will not be overridden since it's truthy
                source_component="test_component",
                event_message="Auto message",
            )

            # Emit the event
            emit_audit_event(event)

            # Verify _do_emit_audit_event was called
            mock_do_emit.assert_called_once()
            event_obj = mock_do_emit.call_args[0][0]

            # Verify context injection worked for None fields only
            assert event_obj.actor_id == test_actor_id
            assert event_obj.actor_type == ActorType.SYSTEM  # Not overridden because it was already set
            assert event_obj.workflow_id == test_workflow_id
            assert event_obj.activity_id == test_activity_id
            assert event_obj.execution_id == test_execution_id

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
                source_component="test_component",
                event_message="User message",
            )

            # Emit the event
            emit_audit_event(event)

            # Verify original values were preserved
            event_obj = mock_do_emit.call_args[0][0]
            assert event_obj.actor_id == event_actor_id  # Not context_actor_id
            assert event_obj.workflow_id == event_workflow_id  # Not context_workflow_id

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
            event_message="User login",
            structured_data=AuditContextData(
                status="success",
                username="testuser",
                password="secret123",  # noqa: S106
                email="test@example.com",
                normal_data="safe_value",
            ),
        )

        # Emit the event
        emit_audit_event(event)

        # Verify sanitization occurred
        event_obj = mock_do_emit.call_args[0][0]
        context_data = event_obj.structured_data
        assert isinstance(context_data, AuditContextData)

        assert context_data.username == "testuser"  # type: ignore[attr-defined]
        assert context_data.password == "[REDACTED]"  # type: ignore[attr-defined]  # Should be sanitized  # noqa: S105
        assert context_data.email == "[EMAIL_REDACTED]"  # type: ignore[attr-defined]  # Should be sanitized
        assert context_data.normal_data == "safe_value"  # type: ignore[attr-defined]

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
            event_message="User authentication attempt",
            structured_data=AuditContextData(
                status="success",
                # Original patterns
                password="secret123",  # noqa: S106
                secret="mysecret",  # noqa: S106
                token="abc123",  # noqa: S106
                api_key="key123",
                auth="bearer xyz",
                # New comprehensive patterns
                credential="cred123",
                private_key="-----BEGIN PRIVATE KEY-----",
                session="session123",
                cookie="sessionid=abc123",
                jwt="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
                bearer="Bearer token123",
                client_secret="client_secret_abc",  # noqa: S106
                access_token="access_xyz",  # noqa: S106
                refresh_token="refresh_xyz",  # noqa: S106
                # Safe data
                username="testuser",
                normal_data="safe_value",
            ),
        )

        # Emit the event
        emit_audit_event(event)

        # Verify comprehensive sanitization occurred
        event_obj = mock_do_emit.call_args[0][0]
        context_data = event_obj.structured_data
        assert isinstance(context_data, AuditContextData)

        assert context_data.password == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
        assert context_data.secret == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
        assert context_data.token == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
        assert context_data.api_key == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.auth == "[REDACTED]"  # type: ignore[attr-defined]

        assert context_data.credential == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.private_key == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.session == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.cookie == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.jwt == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.bearer == "[REDACTED]"  # type: ignore[attr-defined]
        assert context_data.client_secret == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
        assert context_data.access_token == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
        assert context_data.refresh_token == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105

        # Safe data should remain unchanged
        assert context_data.username == "testuser"  # type: ignore[attr-defined]
        assert context_data.normal_data == "safe_value"  # type: ignore[attr-defined]

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
            ("auth_code", "authorization_code_abc", "[REDACTED]", "auth pattern match"),
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
        structured_data = {"status": "success", field_name: field_value}
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
            structured_data=AuditContextData(**structured_data),
        )

        # Emit the event
        emit_audit_event(event)

        # Verify the specific field was handled correctly
        event_obj = mock_do_emit.call_args[0][0]
        # After sanitization, structured_data remains as model but in-place sanitized
        base_data = event_obj.structured_data
        assert isinstance(base_data, AuditContextData)
        assert base_data.status == "success"

        assert getattr(base_data, field_name) == expected_result, (
            f"Field '{field_name}' with value '{field_value}' should result in '{expected_result}' "
            f"for {test_description}, but got '{getattr(base_data, field_name)}'"
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
            event_message="System starting up",
            # structured_data defaults to empty dict
        )

        # Emit the event
        emit_audit_event(event)

        # Verify default structured_data was handled correctly
        event_obj = mock_do_emit.call_args[0][0]
        # After sanitization, structured_data remains as model but in-place sanitized
        base_data = event_obj.structured_data
        assert isinstance(base_data, BaseAuditData)
        assert base_data.status is None

    @patch("nexus.core.audit.emitter._do_emit_audit_event")
    def test_emit_audit_event_complex_structured_data(self, mock_do_emit: Mock) -> None:
        """Test audit event emission with complex nested structured data."""
        # Create event with complex structured data
        event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="create_user",
            actor_id=uuid4(),
            actor_type=ActorType.USER,
            source_component="user_service",
            event_message="User creation request",
            structured_data=AuditContextData(
                status="success",
                user_info={
                    "username": "testuser",
                    "email": "test@example.com",
                    "preferences": {"theme": "dark", "api_token": "secret_token_123"},
                },
                request_data={
                    "method": "POST",
                    "url": "/api/v1/users",
                    "headers": {"Authorization": "Bearer token123"},
                },
                response_data={"status": 201, "message": "User created successfully"},
            ),
        )

        # Emit the event
        emit_audit_event(event)

        # Verify complex data was sanitized appropriately
        event_obj = mock_do_emit.call_args[0][0]
        context_data = event_obj.structured_data
        assert isinstance(context_data, AuditContextData)

        # Check that nested sensitive data was sanitized
        user_info = context_data.user_info  # type: ignore[attr-defined]
        assert user_info["username"] == "testuser"
        assert user_info["email"] == "[EMAIL_REDACTED]"
        assert user_info["preferences"]["theme"] == "dark"
        assert user_info["preferences"]["api_token"] == "[REDACTED]"  # noqa: S105
        request_data = context_data.request_data  # type: ignore[attr-defined]
        assert request_data["method"] == "POST"
        response_data = context_data.response_data  # type: ignore[attr-defined]
        assert response_data["status"] == 201


class TestEventCaptureDoEmitAuditEvent:
    """Test EventCapture._do_emit_audit_event method."""

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_logger_setup(self, mock_audit_logger: Mock) -> None:
        """Test that _do_emit_audit_event uses the audit logger correctly."""
        # Create test event
        test_event = AuditEvent(
            event_category=EventCategory.USER_ACTION,
            event_action="test_action",
            actor_type=ActorType.USER,
            source_component="test_component",
            event_message="Test message",
            structured_data=BaseAuditData(status="success"),
        )

        # Call the method
        _do_emit_audit_event(test_event)

        # Verify info method was called with serialized event data
        expected_data = test_event.model_dump(mode="json")
        mock_audit_logger.info.assert_called_once_with("audit_event", **expected_data)

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_with_all_fields(self, mock_audit_logger: Mock) -> None:
        """Test _do_emit_audit_event with all possible fields."""
        actor_id = uuid4()
        workflow_id = uuid4()
        execution_id = uuid4()

        test_event = AuditEvent(
            event_category=EventCategory.WORKFLOW_EVENT,
            event_action="workflow_started",
            actor_id=actor_id,
            actor_type=ActorType.SYSTEM,
            source_component="workflow_engine",
            workflow_id=workflow_id,
            activity_id="activity_123",
            execution_id=execution_id,
            event_message="Workflow execution started",
            structured_data=AuditContextData(
                status="success",
                workflow_name="test_workflow",
                input_params={"param1": "value1"},
            ),
        )

        # Call the method
        _do_emit_audit_event(test_event)

        # Verify all fields were passed to logger
        call_args = mock_audit_logger.info.call_args
        assert call_args[0][0] == "audit_event"

        kwargs = call_args[1]
        assert kwargs["event_category"] == EventCategory.WORKFLOW_EVENT
        assert kwargs["event_action"] == "workflow_started"
        assert kwargs["actor_id"] == str(actor_id)
        assert kwargs["actor_type"] == ActorType.SYSTEM
        assert kwargs["source_component"] == "workflow_engine"
        assert kwargs["workflow_id"] == str(workflow_id)
        assert kwargs["activity_id"] == "activity_123"
        assert kwargs["execution_id"] == str(execution_id)
        assert kwargs["event_message"] == "Workflow execution started"
        assert kwargs["structured_data"]["workflow_name"] == "test_workflow"
        assert kwargs["structured_data"]["input_params"] == {"param1": "value1"}

    @patch("nexus.core.audit.emitter.audit_logger")
    def test_do_emit_audit_event_minimal_fields(self, mock_audit_logger: Mock) -> None:
        """Test _do_emit_audit_event with minimal required fields."""
        test_event = AuditEvent(
            event_category=EventCategory.SYSTEM_OPERATION,
            event_action="minimal_action",
            actor_type=ActorType.SYSTEM,
            source_component="test_component",
            event_message="Minimal test",
            structured_data=BaseAuditData(status="success"),
        )

        # Call the method
        _do_emit_audit_event(test_event)

        # Verify minimal fields were passed
        kwargs = mock_audit_logger.info.call_args[1]
        assert kwargs["event_category"] == EventCategory.SYSTEM_OPERATION
        assert kwargs["event_action"] == "minimal_action"
        assert kwargs["structured_data"]["status"] == "success"


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
            activity_id_context_var.set("activity_id")

            # Create and emit event
            event = AuditEvent(
                event_category=EventCategory.AGENT_INTERACTION,
                event_action="agent_query",
                actor_id=None,  # Will be injected
                actor_type=ActorType.SYSTEM,  # Required field, will NOT be overridden since it's truthy
                source_component="agent_service",
                event_message="User queried agent",
                structured_data=AuditContextData(
                    status="success",
                    query="What is the weather?",
                    password="secret123",  # noqa: S106  # Should be sanitized
                    user_email="user@example.com",  # Should be sanitized
                ),
            )

            emit_audit_event(event)

            # Comprehensive verification
            mock_do_emit.assert_called_once()
            event_obj = mock_do_emit.call_args[0][0]

            # Verify context injection
            assert event_obj.actor_id == test_actor_id
            assert event_obj.actor_type == ActorType.SYSTEM  # Not overridden because it was already set
            assert event_obj.workflow_id == test_workflow_id

            # Verify event data
            assert event_obj.event_category == EventCategory.AGENT_INTERACTION
            assert event_obj.event_action == "agent_query"
            assert event_obj.source_component == "agent_service"
            assert event_obj.event_message == "User queried agent"

            # Verify sanitization
            context_data = event_obj.structured_data
            assert isinstance(context_data, AuditContextData)
            assert context_data.query == "What is the weather?"  # type: ignore[attr-defined]
            assert context_data.password == "[REDACTED]"  # type: ignore[attr-defined]  # noqa: S105
            assert context_data.user_email == "[EMAIL_REDACTED]"  # type: ignore[attr-defined]

            # Verify event_id was generated
            assert event_obj.event_id is not None
            assert event_obj.event_time is not None

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
                event_message=f"Test message {i}",
                structured_data=AuditContextData(status="success", index=i),
            )
            for i in range(3)
        ]

        for event in events:
            emit_audit_event(event)

        # Verify all events were emitted
        assert mock_do_emit.call_count == 3

        # Verify each event was logged with correct action
        for i, call in enumerate(mock_do_emit.call_args_list):
            event_obj = call[0][0]  # First positional argument
            assert event_obj.event_action == f"action_{i}"
            context_data = event_obj.structured_data
            assert isinstance(context_data, AuditContextData)
            assert context_data.index == i  # type: ignore[attr-defined]
