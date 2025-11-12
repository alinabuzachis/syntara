"""Unit tests for workflow service utilities."""

from datetime import datetime
from unittest.mock import AsyncMock, Mock
from uuid import uuid4

import pytest
from temporalio.service import RPCError, RPCStatusCode

from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.utils.temporal import (
    sync_execution_status_from_temporal,
    temporal_status_to_execution_status,
)


class TestTemporalStatusToExecutionStatus:
    """Test temporal_status_to_execution_status function."""

    @pytest.mark.parametrize(
        ("input_status", "expected_result"),
        [
            # Standard conversions
            ("completed", ExecutionStatus.COMPLETED),
            ("failed", ExecutionStatus.FAILED),
            ("running", ExecutionStatus.RUNNING),
            ("pending", ExecutionStatus.PENDING),
            # American spelling conversion
            ("canceled", ExecutionStatus.CANCELLED),
            # Case handling
            ("COMPLETED", ExecutionStatus.COMPLETED),
            ("CoMpLeTeD", ExecutionStatus.COMPLETED),
            # Whitespace handling
            ("  completed  ", ExecutionStatus.COMPLETED),
            # Unknown/invalid statuses
            ("unknown_status", None),
            ("", None),
        ],
    )
    def test_status_conversion(self, input_status: str, expected_result: ExecutionStatus | None) -> None:
        """Test temporal status conversion handles various inputs correctly."""
        result = temporal_status_to_execution_status(input_status)
        assert result == expected_result


class TestSyncExecutionStatusFromTemporal:
    """Test sync_execution_status_from_temporal function."""

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "terminal_status",
        [
            ExecutionStatus.COMPLETED,
            ExecutionStatus.FAILED,
            ExecutionStatus.CANCELLED,
        ],
    )
    async def test_skips_terminal_states(self, terminal_status: ExecutionStatus) -> None:
        """Test sync skips executions already in terminal states."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = terminal_status
        mock_temporal = Mock()

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is False
        mock_temporal.get_workflow_status.assert_not_called()

    @pytest.mark.asyncio
    async def test_syncs_status_from_temporal(self) -> None:
        """Test sync updates execution status from Temporal."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.PENDING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "running"
        status_response.close_time = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.RUNNING
        mock_temporal.get_workflow_status.assert_awaited_once_with(temporal_workflow_id="exec-123")

    @pytest.mark.asyncio
    async def test_returns_false_when_status_unchanged(self) -> None:
        """Test sync returns False when status doesn't change."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "running"
        status_response.close_time = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is False
        assert execution.status == ExecutionStatus.RUNNING

    @pytest.mark.asyncio
    async def test_sets_completed_at_for_terminal_state(self) -> None:
        """Test sync sets completed_at when transitioning to terminal state."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.completed_at = None

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "completed"
        status_response.close_time = "2025-01-31T12:00:00+00:00"
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.completed_at == datetime.fromisoformat("2025-01-31T12:00:00+00:00")

    @pytest.mark.asyncio
    async def test_handles_american_spelling_canceled(self) -> None:
        """Test sync handles American spelling 'canceled' from Temporal."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "canceled"
        status_response.close_time = "2025-01-31T12:00:00+00:00"
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.CANCELLED

    @pytest.mark.asyncio
    async def test_handles_unknown_temporal_status(self) -> None:
        """Test sync handles unknown status from Temporal gracefully."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "unknown_status"
        status_response.close_time = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is False
        assert execution.status == ExecutionStatus.RUNNING  # Status unchanged

    @pytest.mark.asyncio
    async def test_persist_without_session_raises_error(self) -> None:
        """Test persist=True without session raises ValueError."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        mock_temporal = Mock()

        with pytest.raises(ValueError, match="Cannot persist changes without a database session"):
            await sync_execution_status_from_temporal(execution, mock_temporal, session=None, persist=True)

    @pytest.mark.asyncio
    async def test_persist_commits_and_refreshes(self) -> None:
        """Test persist=True commits changes to database."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.PENDING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "running"
        status_response.close_time = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        mock_session = Mock()
        mock_session.commit = AsyncMock()
        mock_session.refresh = AsyncMock()

        result = await sync_execution_status_from_temporal(execution, mock_temporal, session=mock_session, persist=True)

        assert result is True
        assert execution.status == ExecutionStatus.RUNNING
        mock_session.commit.assert_awaited_once()
        mock_session.refresh.assert_awaited_once_with(execution)

    @pytest.mark.asyncio
    async def test_persist_skips_commit_when_no_change(self) -> None:
        """Test persist=True skips commit when status doesn't change."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "running"
        status_response.close_time = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        mock_session = Mock()
        mock_session.commit = AsyncMock()

        result = await sync_execution_status_from_temporal(execution, mock_temporal, session=mock_session, persist=True)

        assert result is False
        mock_session.commit.assert_not_called()

    @pytest.mark.asyncio
    async def test_captures_error_message_when_failed(self) -> None:
        """Test sync captures error message from Temporal when status transitions to FAILED."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.completed_at = None
        execution.error_details = None

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "failed"
        status_response.close_time = "2025-11-04T21:36:52.535665+00:00"
        status_response.failure_message = "Activity task timed out"
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.FAILED
        assert execution.completed_at == datetime.fromisoformat("2025-11-04T21:36:52.535665+00:00")
        assert execution.error_details == "Activity task timed out"

    @pytest.mark.asyncio
    async def test_preserves_timezone_in_completed_at(self) -> None:
        """Test sync preserves timezone information when setting completed_at from Temporal."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.completed_at = None

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "completed"
        # Temporal provides timezone-aware timestamp
        status_response.close_time = "2025-11-04T21:36:52.535665+00:00"
        status_response.failure_message = None
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.COMPLETED
        # Verify datetime.fromisoformat preserves timezone
        completed_dt = datetime.fromisoformat("2025-11-04T21:36:52.535665+00:00")
        assert execution.completed_at == completed_dt
        # Ensure it's timezone-aware
        assert execution.completed_at.tzinfo is not None

    @pytest.mark.asyncio
    async def test_does_not_set_error_details_when_no_failure_message(self) -> None:
        """Test sync doesn't set error_details when failure_message is None."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"
        execution.error_details = None

        mock_temporal = Mock()
        status_response = Mock()
        status_response.status = "failed"
        status_response.close_time = "2025-11-04T21:36:52.535665+00:00"
        status_response.failure_message = None  # No failure message
        mock_temporal.get_workflow_status = AsyncMock(return_value=status_response)

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        assert result is True
        assert execution.status == ExecutionStatus.FAILED
        # error_details should remain unchanged (None)
        assert execution.error_details is None

    @pytest.mark.asyncio
    async def test_handles_rpc_error_from_temporal(self) -> None:
        """Test sync handles RPCError from Temporal gracefully (e.g., workflow not found)."""
        execution = Mock(spec=Execution)
        execution.id = uuid4()
        execution.status = ExecutionStatus.RUNNING
        execution.temporal_workflow_id = "exec-123"

        mock_temporal = Mock()
        # Simulate Temporal RPC error (e.g., workflow not found)
        mock_temporal.get_workflow_status = AsyncMock(
            side_effect=RPCError("Workflow not found", status=RPCStatusCode.NOT_FOUND, raw_grpc_status=Mock())
        )

        result = await sync_execution_status_from_temporal(execution, mock_temporal)

        # Should return False and not raise exception
        assert result is False
        # Status should remain unchanged
        assert execution.status == ExecutionStatus.RUNNING
