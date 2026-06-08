"""Unit tests for post-LLM token update logic in InvocationExecutor (T014)."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
from uuid import UUID, uuid4

import pytest

from nexus.agent_orchestrator.executor.invocation_executor import InvocationExecutor
from nexus.agent_orchestrator.models import Invocation, InvocationStatus


def _make_invocation(user_id: UUID | None = None, invocation_id: UUID | None = None) -> MagicMock:
    """Create a mock Invocation object."""
    inv = MagicMock(spec=Invocation)
    inv.id = invocation_id or uuid4()
    inv.prompt = "test prompt"
    inv.session_id = "test-session"
    inv.status = InvocationStatus.RUNNING
    inv.context_data = {}
    inv.created_by = user_id or uuid4()
    inv.result = None
    inv.started_at = None
    inv.completed_at = None
    inv.error_message = None
    return inv


def _make_executor(mock_repo: AsyncMock) -> InvocationExecutor:
    """Create an InvocationExecutor with injected mock repository."""
    return InvocationExecutor(token_usage_repository=mock_repo)


class TestInvocationExecutorTokenUpdate:
    """Tests for post-LLM token update in InvocationExecutor."""

    @pytest.mark.asyncio
    async def test_aggregates_single_call_token_usage(self) -> None:
        """Test single LLM call: usage_details is a list with one element."""
        inv = _make_invocation()
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {
                    "input_tokens": 943,
                    "output_tokens": 500,
                    "usage_details": {"prompt_tokens": 943, "completion_tokens": 500, "total_tokens": 1443},
                }
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(return_value=None)
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(return_value=True)

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        # Check result_dict was modified (llm_token_usage_log popped)
        assert "llm_token_usage_log" not in result_dict
        # usage_details is always a list (even for single call)
        call_kwargs = mock_repo.update_with_actual_token_usage.call_args[1]
        assert isinstance(call_kwargs["usage_details"], list)
        assert len(call_kwargs["usage_details"]) == 1

    @pytest.mark.asyncio
    async def test_aggregates_multi_call_token_usage(self) -> None:
        """Test multi-call: usage_details is a list of dicts."""
        inv = _make_invocation()
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {
                    "input_tokens": 500,
                    "output_tokens": 100,
                    "usage_details": {"prompt_tokens": 500, "completion_tokens": 100},
                },
                {
                    "input_tokens": 300,
                    "output_tokens": 200,
                    "usage_details": {"prompt_tokens": 300, "completion_tokens": 200},
                },
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(return_value=None)
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(return_value=True)

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        mock_repo.update_with_actual_token_usage.assert_called_once()
        call_kwargs = mock_repo.update_with_actual_token_usage.call_args[1]
        assert call_kwargs["prompt_tokens"] == 800  # 500 + 300
        assert call_kwargs["completion_tokens"] == 300  # 100 + 200
        assert call_kwargs["token_count"] == 1100  # 800 + 300
        # Multi-call should produce a list of usage_details
        assert isinstance(call_kwargs["usage_details"], list)
        assert len(call_kwargs["usage_details"]) == 2

    @pytest.mark.asyncio
    async def test_multi_call_filters_none_usage_details(self) -> None:
        """Test multi-call: None usage_details entries are filtered out."""
        inv = _make_invocation()
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {
                    "input_tokens": 500,
                    "output_tokens": 100,
                    "usage_details": {"prompt_tokens": 500, "completion_tokens": 100},
                },
                {
                    "input_tokens": 300,
                    "output_tokens": 200,
                    # No usage_details key — .get() returns None
                },
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(return_value=None)
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(return_value=True)

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        call_kwargs = mock_repo.update_with_actual_token_usage.call_args[1]
        # None entries should be filtered, leaving only 1 dict
        assert isinstance(call_kwargs["usage_details"], list)
        assert len(call_kwargs["usage_details"]) == 1
        assert call_kwargs["usage_details"][0] == {"prompt_tokens": 500, "completion_tokens": 100}

    @pytest.mark.asyncio
    async def test_multi_call_all_none_usage_details_becomes_none(self) -> None:
        """Test multi-call: when ALL entries lack usage_details, result is None (not empty list)."""
        inv = _make_invocation()
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {"input_tokens": 500, "output_tokens": 100},
                {"input_tokens": 300, "output_tokens": 200},
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(return_value=None)
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(return_value=True)

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        call_kwargs = mock_repo.update_with_actual_token_usage.call_args[1]
        assert call_kwargs["usage_details"] is None

    @pytest.mark.asyncio
    async def test_non_blocking_on_failure(self) -> None:
        """Test that token update failure doesn't raise (FR-007)."""
        inv = _make_invocation()
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {"input_tokens": 500, "output_tokens": 100, "usage_details": {}},
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(side_effect=Exception("DB error"))
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(side_effect=Exception("DB error"))

        executor = _make_executor(mock_repo)
        # Should NOT raise
        await executor._update_token_usage(result_dict, inv, mock_session)

    @pytest.mark.asyncio
    async def test_skips_update_when_no_usage_log(self) -> None:
        """Test no update when llm_token_usage_log is empty or missing."""
        inv = _make_invocation()
        result_dict = {"content": "test"}

        mock_session = AsyncMock()
        mock_repo = AsyncMock()

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        mock_repo.update_with_actual_token_usage.assert_not_called()

    @pytest.mark.asyncio
    async def test_uses_invocation_id_uuid_not_string(self) -> None:
        """Test that invocation_id is passed as UUID from Invocation object."""
        inv_id = uuid4()
        inv = _make_invocation(invocation_id=inv_id)
        result_dict = {
            "content": "test",
            "llm_token_usage_log": [
                {"input_tokens": 100, "output_tokens": 50, "usage_details": {}},
            ],
        }

        mock_session = AsyncMock()
        mock_nested = AsyncMock()
        mock_nested.__aenter__ = AsyncMock(return_value=None)
        mock_nested.__aexit__ = AsyncMock(return_value=None)
        mock_session.begin_nested = MagicMock(return_value=mock_nested)

        mock_repo = AsyncMock()
        mock_repo.update_with_actual_token_usage = AsyncMock(return_value=True)

        executor = _make_executor(mock_repo)
        await executor._update_token_usage(result_dict, inv, mock_session)

        call_kwargs = mock_repo.update_with_actual_token_usage.call_args[1]
        assert call_kwargs["invocation_id"] == inv_id
        assert isinstance(call_kwargs["invocation_id"], type(inv_id))
