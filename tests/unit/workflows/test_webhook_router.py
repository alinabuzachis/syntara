"""Unit tests for the webhook reception router.

Tests cover the helper functions (_validate_payload, _get_system_user,
_check_payload_size) and the receive_webhook endpoint with mocked dependencies.
"""

from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from fastapi import Request
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.constants import WebhookLimits
from nexus.core.models import User
from nexus.workflows.exceptions import (
    TemporalUnavailableError,
    TriggerValidationError,
)
from nexus.workflows.models.webhook_trigger import WebhookTrigger
from nexus.workflows.webhook_router import (
    WebhookResponse,
    _check_payload_size,
    _get_system_user,
    _validate_payload,
    receive_webhook,
)
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

# ============================================================================
# _validate_payload tests
# ============================================================================


class TestValidatePayload:
    """Test suite for _validate_payload helper."""

    def test_no_schema_does_nothing(self) -> None:
        """Test that validation is skipped when trigger has no input_schema."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = None

        # Should not raise
        _validate_payload(trigger, {"any": "data"})

    def test_valid_payload_passes(self) -> None:
        """Test that a valid payload passes schema validation."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }

        # Should not raise
        _validate_payload(trigger, {"name": "test"})

    def test_invalid_payload_raises_validation_error(self) -> None:
        """Test that an invalid payload raises TriggerValidationError."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
            "required": ["name"],
        }

        with pytest.raises(TriggerValidationError, match="validation failed"):
            _validate_payload(trigger, {"wrong_field": 123})

    def test_invalid_schema_raises_validation_error(self) -> None:
        """Test that a malformed JSON Schema raises TriggerValidationError."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.id = uuid4()
        trigger.webhook_path = "test-hook"
        # Invalid schema: 'type' is not a valid JSON Schema type keyword value
        trigger.input_schema = {"type": "not_a_real_type"}

        with pytest.raises(TriggerValidationError):
            _validate_payload(trigger, {"any": "data"})

    def test_empty_payload_with_no_requirements(self) -> None:
        """Test that an empty payload passes when schema has no requirements."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = {"type": "object"}

        # Should not raise
        _validate_payload(trigger, {})

    def test_ref_in_schema_raises_validation_error(self) -> None:
        """Test that a schema with $ref raises TriggerValidationError at runtime."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.id = uuid4()
        trigger.webhook_path = "test-hook"
        trigger.input_schema = {
            "type": "object",
            "properties": {
                "data": {"$ref": "http://internal-service/secret"},
            },
        }

        with pytest.raises(TriggerValidationError, match=r"\$ref"):
            _validate_payload(trigger, {"data": "test"})

    def test_additional_properties_allowed_by_default(self) -> None:
        """Test that extra properties pass when not explicitly forbidden."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = {
            "type": "object",
            "properties": {"name": {"type": "string"}},
        }

        # Should not raise - extra properties allowed by default in JSON Schema
        _validate_payload(trigger, {"name": "test", "extra": "field"})

    def test_array_payload_passes_without_schema(self) -> None:
        """Test that a JSON array payload is accepted when no schema is configured."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = None

        # Should not raise
        _validate_payload(trigger, [{"event": "push"}, {"event": "pull"}])

    def test_array_payload_validated_against_schema(self) -> None:
        """Test that a JSON array payload is validated against an array schema."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = {
            "type": "array",
            "items": {"type": "object", "required": ["event"]},
        }

        # Should not raise
        _validate_payload(trigger, [{"event": "push"}])

    def test_primitive_payload_passes_without_schema(self) -> None:
        """Test that a primitive JSON payload is accepted when no schema is configured."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.input_schema = None

        # Should not raise
        _validate_payload(trigger, "just a string")


# ============================================================================
# _get_system_user tests
# ============================================================================


class TestGetSystemUser:
    """Test suite for _get_system_user helper."""

    @pytest.mark.asyncio
    async def test_returns_user_when_found(self) -> None:
        """Test that the system user is returned when it exists."""
        mock_db = AsyncMock(spec=AsyncSession)
        mock_user = Mock(spec=User)
        mock_db.get = AsyncMock(return_value=mock_user)

        with patch("nexus.workflows.webhook_router.get_settings") as mock_settings:
            mock_settings.return_value.system_user_id = uuid4()
            result = await _get_system_user(mock_db)

        assert result is mock_user

    @pytest.mark.asyncio
    async def test_raises_runtime_error_when_not_found(self) -> None:
        """Test that RuntimeError is raised when the system user doesn't exist."""
        mock_db = AsyncMock(spec=AsyncSession)
        mock_db.get = AsyncMock(return_value=None)

        with (
            patch("nexus.workflows.webhook_router.get_settings") as mock_settings,
            pytest.raises(RuntimeError, match="System user"),
        ):
            mock_settings.return_value.system_user_id = uuid4()
            await _get_system_user(mock_db)


# ============================================================================
# _check_payload_size tests
# ============================================================================


class TestCheckPayloadSize:
    """Test suite for _check_payload_size dependency."""

    @pytest.mark.asyncio
    async def test_under_limit_passes(self) -> None:
        """Test that a payload under the size limit is accepted."""
        mock_request = Mock(spec=Request)
        mock_request.headers = {"content-length": "1024"}

        # Should not raise
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_over_limit_raises(self) -> None:
        """Test that a payload over the size limit raises TriggerValidationError."""
        mock_request = Mock(spec=Request)
        oversized = str(WebhookLimits.PAYLOAD_MAX_BYTES + 1)
        mock_request.headers = {"content-length": oversized}

        with pytest.raises(TriggerValidationError, match="Payload too large"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_no_content_length_passes(self) -> None:
        """Test that requests without Content-Length header are allowed through."""
        mock_request = Mock(spec=Request)
        mock_request.headers = {}

        # Should not raise — allows chunked/streaming transfers
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_exact_limit_passes(self) -> None:
        """Test that a payload exactly at the size limit is accepted."""
        mock_request = Mock(spec=Request)
        mock_request.headers = {"content-length": str(WebhookLimits.PAYLOAD_MAX_BYTES)}

        # Should not raise
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_non_numeric_content_length_raises(self) -> None:
        """Test that a non-numeric Content-Length header raises TriggerValidationError."""
        mock_request = Mock(spec=Request)
        mock_request.headers = {"content-length": "abc"}

        with pytest.raises(TriggerValidationError, match="Invalid Content-Length"):
            await _check_payload_size(mock_request)


# ============================================================================
# receive_webhook endpoint tests
# ============================================================================


class TestReceiveWebhook:
    """Test suite for the receive_webhook endpoint function."""

    def _make_trigger(
        self,
        *,
        webhook_path: str = "test-hook",
        trigger_node_id: str = "trigger-1",
        input_schema: dict[str, Any] | None = None,
    ) -> Mock:
        """Create a mock WebhookTrigger with sensible defaults."""
        trigger = Mock(spec=WebhookTrigger)
        trigger.id = uuid4()
        trigger.webhook_path = webhook_path
        trigger.workflow_id = uuid4()
        trigger.trigger_node_id = trigger_node_id
        trigger.input_schema = input_schema
        trigger.is_enabled = True
        return trigger

    @pytest.mark.asyncio
    async def test_temporal_unavailable_raises_error(self) -> None:
        """Test that None temporal service raises TemporalUnavailableError."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = self._make_trigger()

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)

        with patch("nexus.workflows.webhook_router._validate_payload"), pytest.raises(TemporalUnavailableError):
            await receive_webhook(
                webhook_path="test-hook",
                payload={"event": "push"},
                webhook_service=mock_svc,
                temporal_service=None,
                db=mock_db,
                _payload_size=None,
            )

    @pytest.mark.asyncio
    async def test_happy_path_returns_webhook_response(self) -> None:
        """Test successful webhook reception creates execution and returns response."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = self._make_trigger()
        execution_id = uuid4()

        mock_execution = Mock()
        mock_execution.id = execution_id

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)

        mock_temporal = AsyncMock(spec=TemporalExecutionService)

        with (
            patch("nexus.workflows.webhook_router._get_system_user") as mock_get_user,
            patch("nexus.workflows.webhook_router._validate_payload"),
            patch("nexus.workflows.webhook_router.ExecutionService") as mock_exec_svc_cls,
        ):
            mock_get_user.return_value = Mock(spec=User)

            mock_exec_svc = AsyncMock()
            mock_exec_svc.create_execution = AsyncMock(return_value=mock_execution)
            mock_exec_svc_cls.return_value = mock_exec_svc

            result = await receive_webhook(
                webhook_path="test-hook",
                payload={"event": "push"},
                webhook_service=mock_svc,
                temporal_service=mock_temporal,
                db=mock_db,
                _payload_size=None,
            )

            assert isinstance(result, WebhookResponse)
            assert result.execution_id == execution_id
            assert "test-hook" in result.message

            # Verify execution service was called with correct args
            mock_exec_svc.create_execution.assert_awaited_once_with(
                workflow_id=trigger.workflow_id,
                input_data={"payload": {"event": "push"}},
                trigger_node_id=trigger.trigger_node_id,
                use_published=True,
            )

    @pytest.mark.asyncio
    async def test_payload_validation_called(self) -> None:
        """Test that _validate_payload is called with trigger and payload."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = self._make_trigger()
        execution_id = uuid4()

        mock_execution = Mock()
        mock_execution.id = execution_id

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)

        mock_temporal = AsyncMock(spec=TemporalExecutionService)

        with (
            patch("nexus.workflows.webhook_router._get_system_user") as mock_get_user,
            patch("nexus.workflows.webhook_router._validate_payload") as mock_validate,
            patch("nexus.workflows.webhook_router.ExecutionService") as mock_exec_svc_cls,
        ):
            mock_get_user.return_value = Mock(spec=User)

            mock_exec_svc = AsyncMock()
            mock_exec_svc.create_execution = AsyncMock(return_value=mock_execution)
            mock_exec_svc_cls.return_value = mock_exec_svc

            await receive_webhook(
                webhook_path="test-hook",
                payload={"data": "test"},
                webhook_service=mock_svc,
                temporal_service=mock_temporal,
                db=mock_db,
                _payload_size=None,
            )

            mock_validate.assert_called_once_with(trigger, {"data": "test"})

    @pytest.mark.asyncio
    async def test_invalid_payload_raises_validation_error(self) -> None:
        """Test that invalid payload raises TriggerValidationError."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = self._make_trigger(
            input_schema={
                "type": "object",
                "properties": {"name": {"type": "string"}},
                "required": ["name"],
            },
        )

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)

        with pytest.raises(TriggerValidationError, match="validation failed"):
            await receive_webhook(
                webhook_path="test-hook",
                payload={"wrong": 123},
                webhook_service=mock_svc,
                temporal_service=None,
                db=mock_db,
                _payload_size=None,
            )
