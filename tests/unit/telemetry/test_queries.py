"""Unit tests for periodic analytics database queries.

All queries are tested with mocked AsyncSession to avoid DB dependency.
"""

from unittest.mock import AsyncMock, MagicMock

import pytest

from nexus.telemetry.events.system_analytics import (
    CredentialCounts,
    ExecutionCounts,
    ModelUsage,
    WorkflowCounts,
)
from nexus.telemetry.queries import (
    query_credential_counts,
    query_execution_counts,
    query_model_usage,
    query_workflow_counts,
)


@pytest.fixture
def mock_session() -> AsyncMock:
    """Create a mock AsyncSession."""
    return AsyncMock()


class TestQueryWorkflowCounts:
    """Tests for query_workflow_counts."""

    async def test_returns_counts(self, mock_session: AsyncMock):
        # First scalar call: total, second: enabled
        mock_session.scalar = AsyncMock(side_effect=[10, 7])

        result = await query_workflow_counts(mock_session)

        assert isinstance(result, WorkflowCounts)
        assert result.total == 10
        assert result.enabled == 7
        assert result.disabled == 3

    async def test_handles_none_from_db(self, mock_session: AsyncMock):
        mock_session.scalar = AsyncMock(side_effect=[None, None])

        result = await query_workflow_counts(mock_session)

        assert result.total == 0
        assert result.enabled == 0
        assert result.disabled == 0


class TestQueryExecutionCounts:
    """Tests for query_execution_counts."""

    async def test_counts_by_status(self, mock_session: AsyncMock):
        # exec() returns rows of (status, count)
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(
            return_value=iter(
                [
                    ("completed", 40),
                    ("failed", 5),
                    ("running", 3),
                    ("cancelled", 2),
                    ("pending", 1),
                    ("paused", 1),
                ]
            )
        )
        mock_session.exec = AsyncMock(return_value=mock_result)
        # scalar() for avg_duration
        mock_session.scalar = AsyncMock(return_value=125.3)

        result = await query_execution_counts(mock_session)

        assert isinstance(result, ExecutionCounts)
        assert result.total == 52
        assert result.completed == 40
        assert result.failed == 5
        assert result.running == 3
        assert result.cancelled == 2
        assert result.pending == 1
        assert result.paused == 1
        assert result.avg_duration_seconds == 125.3

    async def test_only_running(self, mock_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([("running", 5)]))
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.scalar = AsyncMock(return_value=None)

        result = await query_execution_counts(mock_session)

        assert result.running == 5
        assert result.completed == 0
        assert result.total == 5


class TestQueryModelUsage:
    """Tests for query_model_usage."""

    async def test_returns_model_usage_list(self, mock_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(
            return_value=iter(
                [
                    ("gpt-4", 5000, 2000, 10),
                    ("claude-3", 3000, 1500, 5),
                ]
            )
        )
        mock_session.exec = AsyncMock(return_value=mock_result)

        result = await query_model_usage(mock_session)

        assert len(result) == 2
        assert isinstance(result[0], ModelUsage)
        assert result[0].model == "gpt-4"
        assert result[0].total_prompt_tokens == 5000
        assert result[0].total_completion_tokens == 2000
        assert result[0].total_tokens == 7000
        assert result[0].invocation_count == 10
        assert result[1].model == "claude-3"
        assert result[1].total_tokens == 4500

    async def test_returns_empty_list_when_no_usage(self, mock_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.__iter__ = MagicMock(return_value=iter([]))
        mock_session.exec = AsyncMock(return_value=mock_result)

        result = await query_model_usage(mock_session)

        assert result == []


class TestQueryCredentialCounts:
    """Tests for query_credential_counts.

    TODO: Update when #ANSTRAT-1901 is implemented.
    """

    async def test_returns_zero_until_implemented(self):
        result = query_credential_counts()

        assert isinstance(result, CredentialCounts)
        assert result.total == 0
