"""Unit tests for the webhook reception router.

Tests cover the helper functions (_get_service_user, _check_payload_size) and
the receive_webhook / receive_eda_webhook endpoints with mocked dependencies.
"""

from collections.abc import AsyncIterator, Callable
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import uuid4

import pytest
from fastapi import Request
from sqlmodel.ext.asyncio.session import AsyncSession

from nexus.core.constants import WebhookLimits
from nexus.core.models import User
from nexus.core.models.principal import service_principal_id
from nexus.workflows.exceptions import (
    PayloadTooLargeError,
    TemporalUnavailableError,
    TriggerValidationError,
)
from nexus.workflows.models.webhook_trigger import WebhookTrigger
from nexus.workflows.webhook_router import (
    WebhookResponse,
    _check_payload_size,
    _get_service_user,
    receive_eda_webhook,
    receive_webhook,
)
from nexus.workflows.workflow_engine.models.workflow_definition import NodeType
from nexus.workflows.workflow_engine.services.temporal_execution_service import TemporalExecutionService

# ============================================================================
# _get_service_user tests
# ============================================================================


class TestGetServiceUser:
    """Test suite for _get_service_user helper."""

    def test_returns_synthetic_user_with_service_principal_id(self) -> None:
        """Test that a synthetic User is returned with the correct service principal ID."""
        with patch("nexus.workflows.webhook_router.get_settings") as mock_settings:
            mock_settings.return_value.service_identity = "backend.ao.svc"
            result = _get_service_user()

        assert result.id == service_principal_id("backend.ao.svc")
        assert result.username == "backend.ao.svc"
        assert result.email == "backend.ao.svc@internal"
        assert result.first_name == "backend.ao.svc"
        assert result.is_enabled is True

    def test_uses_configured_service_identity(self) -> None:
        """Test that the service identity CN from settings is used."""
        with patch("nexus.workflows.webhook_router.get_settings") as mock_settings:
            mock_settings.return_value.service_identity = "worker.ao.svc"
            result = _get_service_user()

        assert result.id == service_principal_id("worker.ao.svc")
        assert result.username == "worker.ao.svc"


# ============================================================================
# _check_payload_size tests
# ============================================================================


def _mock_request_with_stream(
    headers: dict[str, str],
    body: bytes,
    *,
    chunk_size: int = 8192,
) -> Mock:
    """Build a mock Request whose .stream() yields *body* in chunks."""
    mock = Mock(spec=Request)
    mock.headers = headers

    async def _stream() -> AsyncIterator[bytes]:
        for i in range(0, len(body), chunk_size):
            yield body[i : i + chunk_size]

    mock.stream = _stream
    return mock


class TestCheckPayloadSize:
    """Test suite for _check_payload_size dependency."""

    @pytest.mark.asyncio
    async def test_under_limit_passes(self) -> None:
        """Test that a payload under the size limit is accepted."""
        mock_request = _mock_request_with_stream({"content-length": "1024"}, b"x" * 1024)
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_over_limit_raises(self) -> None:
        """Test that a payload over the size limit raises PayloadTooLargeError via header."""
        mock_request = Mock(spec=Request)
        oversized = str(WebhookLimits.PAYLOAD_MAX_BYTES + 1)
        mock_request.headers = {"content-length": oversized}

        with pytest.raises(PayloadTooLargeError, match="Payload too large"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_no_content_length_small_body_passes(self) -> None:
        """Test that requests without Content-Length but small body are allowed."""
        mock_request = _mock_request_with_stream({}, b'{"event": "test"}')
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_no_content_length_oversized_body_raises(self) -> None:
        """Test that oversized body is rejected even without Content-Length header."""
        mock_request = _mock_request_with_stream({}, b"x" * (WebhookLimits.PAYLOAD_MAX_BYTES + 1))
        with pytest.raises(PayloadTooLargeError, match="Payload too large"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_spoofed_content_length_oversized_body_raises(self) -> None:
        """Test that spoofed Content-Length (small header, large body) is caught."""
        mock_request = _mock_request_with_stream(
            {"content-length": "100"},
            b"x" * (WebhookLimits.PAYLOAD_MAX_BYTES + 1),
        )
        with pytest.raises(PayloadTooLargeError, match="Payload too large"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_exact_limit_passes(self) -> None:
        """Test that a payload exactly at the size limit is accepted."""
        mock_request = _mock_request_with_stream(
            {"content-length": str(WebhookLimits.PAYLOAD_MAX_BYTES)},
            b"x" * WebhookLimits.PAYLOAD_MAX_BYTES,
        )
        await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_non_numeric_content_length_raises(self) -> None:
        """Test that a non-numeric Content-Length header raises TriggerValidationError."""
        mock_request = Mock(spec=Request)
        mock_request.headers = {"content-length": "abc"}

        with pytest.raises(TriggerValidationError, match="Invalid Content-Length"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_streaming_abort_does_not_buffer_entire_body(self) -> None:
        """Test that oversized body is rejected mid-stream without reading all chunks."""
        oversized = b"x" * (WebhookLimits.PAYLOAD_MAX_BYTES + 8192)
        mock_request = _mock_request_with_stream({}, oversized, chunk_size=8192)
        with pytest.raises(PayloadTooLargeError, match="Payload too large"):
            await _check_payload_size(mock_request)

    @pytest.mark.asyncio
    async def test_body_cached_for_downstream(self) -> None:
        """Test that the body is cached on the request for FastAPI Body() parsing."""
        payload = b'{"key": "value"}'
        mock_request = _mock_request_with_stream({"content-length": str(len(payload))}, payload)
        await _check_payload_size(mock_request)
        assert mock_request._body == payload


# ============================================================================
# receive_webhook / receive_eda_webhook endpoint tests
# ============================================================================

_ENDPOINT_PARAMS = [
    pytest.param(receive_webhook, NodeType.WEBHOOK_TRIGGER, "webhook", "test-hook", id="generic"),
    pytest.param(receive_eda_webhook, NodeType.EDA_TRIGGER, "EDA webhook", "eda-hook", id="eda"),
]


def _make_trigger(
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


class TestReceiveWebhookEndpoints:
    """Shared tests for receive_webhook and receive_eda_webhook.

    Since both endpoints delegate to _handle_webhook_request, the core
    behaviour (temporal check, happy path, validation) is tested once per
    endpoint via parametrization to avoid duplication.
    """

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("endpoint_fn", "trigger_type", "label", "default_path"), _ENDPOINT_PARAMS)
    async def test_temporal_unavailable_raises_error(
        self, endpoint_fn: Callable[..., Any], trigger_type: str, label: str, default_path: str
    ) -> None:
        """None temporal service raises TemporalUnavailableError."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = _make_trigger(webhook_path=default_path)

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)

        with pytest.raises(TemporalUnavailableError):
            await endpoint_fn(
                webhook_path=default_path,
                payload={"event": "push"},
                webhook_service=mock_svc,
                temporal_service=None,
                db=mock_db,
                _payload_size=None,
            )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("endpoint_fn", "trigger_type", "label", "default_path"), _ENDPOINT_PARAMS)
    async def test_happy_path_returns_webhook_response(
        self, endpoint_fn: Callable[..., Any], trigger_type: str, label: str, default_path: str
    ) -> None:
        """Successful reception creates execution and returns WebhookResponse."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = _make_trigger(webhook_path=default_path)
        execution_id = uuid4()

        mock_execution = Mock()
        mock_execution.id = execution_id

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)
        mock_svc.user = Mock(spec=User)

        mock_temporal = AsyncMock(spec=TemporalExecutionService)

        with (
            patch("nexus.workflows.webhook_router._get_service_user") as mock_get_user,
            patch("nexus.workflows.webhook_router.ExecutionService") as mock_exec_svc_cls,
        ):
            mock_get_user.return_value = Mock(spec=User)

            mock_exec_svc = AsyncMock()
            mock_exec_svc.create_execution = AsyncMock(return_value=mock_execution)
            mock_exec_svc_cls.return_value = mock_exec_svc

            result = await endpoint_fn(
                webhook_path=default_path,
                payload={"event": "push"},
                webhook_service=mock_svc,
                temporal_service=mock_temporal,
                db=mock_db,
                _payload_size=None,
            )

            assert isinstance(result, WebhookResponse)
            assert result.execution_id == execution_id
            assert label in result.message
            assert default_path in result.message

            mock_exec_svc.create_execution.assert_awaited_once_with(
                workflow_id=trigger.workflow_id,
                input_data={"payload": {"event": "push"}},
                trigger_node_id=trigger.trigger_node_id,
                use_published=True,
            )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(("endpoint_fn", "trigger_type", "label", "default_path"), _ENDPOINT_PARAMS)
    async def test_lookup_uses_correct_trigger_type(
        self, endpoint_fn: Callable[..., Any], trigger_type: str, label: str, default_path: str
    ) -> None:
        """Trigger lookup passes the correct trigger_type to the service."""
        mock_db = AsyncMock(spec=AsyncSession)
        trigger = _make_trigger(webhook_path=default_path)
        mock_execution = Mock()
        mock_execution.id = uuid4()

        mock_svc = AsyncMock()
        mock_svc.get_by_webhook_path = AsyncMock(return_value=trigger)
        mock_svc.user = Mock(spec=User)

        mock_temporal = AsyncMock(spec=TemporalExecutionService)

        with patch("nexus.workflows.webhook_router.ExecutionService") as mock_exec_svc_cls:
            mock_exec_svc = AsyncMock()
            mock_exec_svc.create_execution = AsyncMock(return_value=mock_execution)
            mock_exec_svc_cls.return_value = mock_exec_svc

            await endpoint_fn(
                webhook_path=default_path,
                payload={},
                webhook_service=mock_svc,
                temporal_service=mock_temporal,
                db=mock_db,
                _payload_size=None,
            )

            mock_svc.get_by_webhook_path.assert_awaited_once_with(default_path, trigger_type=trigger_type)
