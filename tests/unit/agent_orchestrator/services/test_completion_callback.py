"""Unit tests for OrchestrationService._send_completion_callback.

Validates that callback_url is extracted from final_state metadata with
fallback to original invocation metadata, preventing duplicate signals.
"""

from typing import Any, cast
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest

from nexus.agent_orchestrator.models.agent_state import AgentState
from nexus.agent_orchestrator.services.orchestration_service import OrchestrationService


@pytest.fixture
def orchestration_service() -> OrchestrationService:
    """Create an OrchestrationService with mocked dependencies."""
    with patch.object(OrchestrationService, "__init__", lambda _self: None):
        return OrchestrationService.__new__(OrchestrationService)


def _make_final_state(
    metadata: dict[str, Any] | None = None,
    result: dict[str, Any] | None = None,
) -> AgentState:
    """Build a minimal final_state dict for testing."""
    return cast(
        "AgentState",
        {
            "prompt": "test",
            "original_prompt": "test",
            "session_id": "s",
            "correlation_id": "c",
            "invocation_id": "i",
            "user_id": None,
            "context_package": None,
            "current_agent": "orchestrator",
            "metadata": metadata,
            "messages": [],
            "result": result,
            "llm_token_usage_log": [],
        },
    )


class TestSendCompletionCallback:
    """Tests for _send_completion_callback callback_url resolution."""

    @pytest.mark.asyncio
    async def test_callback_url_from_final_state_metadata(self, orchestration_service: OrchestrationService) -> None:
        """When final_state has metadata.callback_url, use it."""
        callback_url = "http://nexus/signal/activity/123"
        invocation_id = uuid4()
        final_state = _make_final_state(
            metadata={"callback_url": callback_url},
            result={"content": "done"},
        )

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id)
            mock_signal.assert_awaited_once_with(callback_url, invocation_id, {"content": "done"})

    @pytest.mark.asyncio
    async def test_callback_url_falls_back_to_original_metadata(
        self, orchestration_service: OrchestrationService
    ) -> None:
        """When final_state has no metadata, fall back to original_metadata."""
        callback_url = "http://nexus/signal/activity/456"
        invocation_id = uuid4()
        final_state = _make_final_state(
            metadata=None,
            result={"content": "done"},
        )
        original_metadata = {"callback_url": callback_url}

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id, original_metadata)
            mock_signal.assert_awaited_once_with(callback_url, invocation_id, {"content": "done"})

    @pytest.mark.asyncio
    async def test_final_state_metadata_takes_precedence(self, orchestration_service: OrchestrationService) -> None:
        """When both sources have callback_url, final_state wins."""
        invocation_id = uuid4()
        final_state = _make_final_state(
            metadata={"callback_url": "http://from-state"},
            result={"content": "done"},
        )
        original_metadata = {"callback_url": "http://from-original"}

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id, original_metadata)
            mock_signal.assert_awaited_once_with("http://from-state", invocation_id, {"content": "done"})

    @pytest.mark.asyncio
    async def test_no_callback_url_skips_signal(self, orchestration_service: OrchestrationService) -> None:
        """When neither source has callback_url, no signal is sent."""
        invocation_id = uuid4()
        final_state = _make_final_state(metadata=None, result={"content": "done"})

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id)
            mock_signal.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_no_result_skips_signal(self, orchestration_service: OrchestrationService) -> None:
        """When final_state has no result, no signal is sent."""
        invocation_id = uuid4()
        final_state = _make_final_state(
            metadata={"callback_url": "http://nexus/signal"},
            result=None,
        )

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id)
            mock_signal.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_empty_metadata_in_final_state_falls_back(self, orchestration_service: OrchestrationService) -> None:
        """When final_state metadata is {} (no callback_url), fall back."""
        callback_url = "http://nexus/signal/activity/789"
        invocation_id = uuid4()
        final_state = _make_final_state(
            metadata={},
            result={"content": "done"},
        )
        original_metadata = {"callback_url": callback_url}

        with patch(
            "nexus.agent_orchestrator.services.orchestration_service.WorkflowSignalClient.send_success_signal",
            new_callable=AsyncMock,
        ) as mock_signal:
            await orchestration_service._send_completion_callback(final_state, invocation_id, original_metadata)
            mock_signal.assert_awaited_once_with(callback_url, invocation_id, {"content": "done"})
