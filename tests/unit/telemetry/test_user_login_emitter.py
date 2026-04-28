"""Unit tests for UserLoginTelemetryHandler."""

import hashlib
from unittest.mock import MagicMock, patch
from uuid import uuid4

from nexus.auth.audit.user_login import AMR, UserLoginEvent
from nexus.telemetry.events.new_user import NewUserEvent
from nexus.telemetry.events.user_login import UserLoginEvent as UserLoginTelemetryEvent
from nexus.telemetry.handlers.user_login import UserLoginTelemetryHandler


class TestUserLoginHandlerTelemetry:
    """Test that the handler emits Segment telemetry correctly."""

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_emits_user_login_event(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        registry.entitlement_id = "ent-123"
        mock_get_registry.return_value = registry

        user_id = uuid4()
        domain_event = UserLoginEvent(user_id=user_id, amr=[AMR.FEDERATED], idp="okta")
        result = UserLoginTelemetryHandler().handle(domain_event)

        assert result is None
        registry.send_event.assert_called_once()
        event = registry.send_event.call_args[0][0]
        assert isinstance(event, UserLoginTelemetryEvent)
        assert event.user_id_hash == hashlib.sha256(str(user_id).encode()).hexdigest()
        assert event.amr == ["fed"]
        assert event.idp == "okta"
        assert event.entitlement_id == "ent-123"

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_first_login_emits_both_events(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        registry.entitlement_id = ""
        mock_get_registry.return_value = registry

        user_id = uuid4()
        domain_event = UserLoginEvent(user_id=user_id, amr=[AMR.PASSWORD], idp="local", is_first_login=True)
        result = UserLoginTelemetryHandler().handle(domain_event)

        assert result is None
        assert registry.send_event.call_count == 2
        events = [call.args[0] for call in registry.send_event.call_args_list]
        assert isinstance(events[0], UserLoginTelemetryEvent)
        assert isinstance(events[1], NewUserEvent)
        expected_hash = hashlib.sha256(str(user_id).encode()).hexdigest()
        assert events[1].user_id_hash == expected_hash

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_non_first_login_does_not_emit_new_user(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        registry.entitlement_id = ""
        mock_get_registry.return_value = registry

        domain_event = UserLoginEvent(user_id=uuid4(), amr=[AMR.PASSWORD], idp="local", is_first_login=False)
        UserLoginTelemetryHandler().handle(domain_event)

        registry.send_event.assert_called_once()
        assert isinstance(registry.send_event.call_args[0][0], UserLoginTelemetryEvent)

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_skips_when_not_initialized(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = False
        mock_get_registry.return_value = registry

        domain_event = UserLoginEvent(user_id=uuid4(), amr=[AMR.PASSWORD], idp="local")
        result = UserLoginTelemetryHandler().handle(domain_event)

        assert result is None
        registry.send_event.assert_not_called()

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_does_not_raise_on_telemetry_error(self, mock_get_registry: MagicMock) -> None:
        mock_get_registry.side_effect = RuntimeError("boom")

        domain_event = UserLoginEvent(user_id=uuid4(), amr=[AMR.PASSWORD], idp="local")
        result = UserLoginTelemetryHandler().handle(domain_event)
        assert result is None

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_amr_fed(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        registry.entitlement_id = ""
        mock_get_registry.return_value = registry

        domain_event = UserLoginEvent(user_id=uuid4(), amr=[AMR.FEDERATED], idp="okta")
        UserLoginTelemetryHandler().handle(domain_event)

        event = registry.send_event.call_args[0][0]
        assert event.amr == ["fed"]
        assert event.idp == "okta"

    @patch("nexus.telemetry.handlers.user_login.get_telemetry_registry")
    def test_amr_pwd(self, mock_get_registry: MagicMock) -> None:
        registry = MagicMock()
        registry.is_initialized.return_value = True
        registry.entitlement_id = ""
        mock_get_registry.return_value = registry

        domain_event = UserLoginEvent(user_id=uuid4(), amr=[AMR.PASSWORD], idp="local")
        UserLoginTelemetryHandler().handle(domain_event)

        event = registry.send_event.call_args[0][0]
        assert event.amr == ["pwd"]
        assert event.idp == "local"
