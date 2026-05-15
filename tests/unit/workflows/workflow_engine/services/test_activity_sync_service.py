"""Unit tests for ActivitySyncService."""

import asyncio
from collections.abc import AsyncIterator
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from temporalio.api.enums.v1 import EventType

from nexus.core.exceptions import SafeValueError
from nexus.workflows.models.activity_execution import ActivityExecution, ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.workflow_engine.activities.internal import register_activity_monitoring
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName, NodeType
from nexus.workflows.workflow_engine.services.activity_sync_service import (
    _PENDING_ACTIVITY_STATE_STARTED as STARTED_STATE,
)
from nexus.workflows.workflow_engine.services.activity_sync_service import (
    ActivitySyncService,
    ExecutionMonitorMetadata,
    SyntheticActivityStarted,
)


def create_test_metadata(
    execution_id: UUID | None = None,
    last_processed_event_id: int = 0,
    activity_definitions_map: dict[str, dict[str, Any]] | None = None,
    activity_index_map: dict[str, int] | None = None,
    pending_activity_updates: dict[int, dict[str, Any]] | None = None,
    pending_sync_event_ids: set[int] | None = None,
) -> ExecutionMonitorMetadata:
    """Create ExecutionMonitorMetadata for testing with sensible defaults."""
    updates = pending_activity_updates or {}
    return ExecutionMonitorMetadata(
        execution_id=execution_id or uuid4(),
        last_processed_event_id=last_processed_event_id,
        activity_definitions_map=activity_definitions_map or {},
        activity_index_map=activity_index_map or {},
        pending_activity_updates=updates,
        pending_sync_event_ids=pending_sync_event_ids if pending_sync_event_ids is not None else set(updates.keys()),
    )


class TestActivitySyncService:
    """Test ActivitySyncService class."""

    def test_init(self, mock_session_factory) -> None:
        """Test service initialization."""
        mock_client = Mock()

        service = ActivitySyncService(
            temporal_client=mock_client,
            session_factory=mock_session_factory,
        )

        assert service.temporal_client is mock_client
        assert service.session_factory is mock_session_factory
        assert service._sync_tasks == {}
        assert service._shutdown is False

    def test_is_monitoring_execution_returns_false_when_not_monitoring(self, mock_session_factory) -> None:
        """Test is_monitoring_execution returns False when execution not monitored."""
        mock_client = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        execution_id = uuid4()

        assert service.is_monitoring_execution(execution_id) is False

    def test_is_monitoring_execution_returns_true_when_monitoring(self, mock_session_factory) -> None:
        """Test is_monitoring_execution returns True when execution is monitored."""
        mock_client = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        execution_id = uuid4()
        mock_task = Mock(spec=asyncio.Task)
        service._sync_tasks[str(execution_id)] = mock_task

        assert service.is_monitoring_execution(execution_id) is True

    @pytest.mark.asyncio
    async def test_start_monitoring_execution_stores_task(self, mock_session_factory) -> None:
        """Test start_monitoring_execution stores monitoring task."""
        mock_client = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        execution_id = uuid4()
        temporal_workflow_id = "workflow-123"
        task_key = str(execution_id)

        async def long_running_monitor(exec_id, workflow_id, request_id) -> None:
            await asyncio.sleep(10)

        with patch.object(service, "_monitor_execution", side_effect=long_running_monitor):
            service.start_monitoring_execution(execution_id, temporal_workflow_id)

            await asyncio.sleep(0.01)

            assert task_key in service._sync_tasks
            assert isinstance(service._sync_tasks[task_key], asyncio.Task)
            assert not service._sync_tasks[task_key].done()

            # Cancel and clean up the task
            task = service._sync_tasks[task_key]
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task

    @pytest.mark.asyncio
    async def test_start_monitoring_execution_skips_if_already_monitoring(self, mock_session_factory) -> None:
        """Test start_monitoring_execution skips if already monitoring."""
        mock_client = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        execution_id = uuid4()
        temporal_workflow_id = "workflow-123"

        mock_task = Mock(spec=asyncio.Task)
        service._sync_tasks[str(execution_id)] = mock_task

        with patch.object(service, "_monitor_execution", new_callable=AsyncMock) as mock_monitor:
            service.start_monitoring_execution(execution_id, temporal_workflow_id)

            mock_monitor.assert_not_called()

    @pytest.mark.asyncio
    async def test_shutdown_cancels_all_tasks(self, mock_session_factory) -> None:
        """Test shutdown cancels all monitoring tasks."""
        mock_client = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        task1 = asyncio.create_task(asyncio.sleep(100))
        task2 = asyncio.create_task(asyncio.sleep(100))

        service._sync_tasks["exec1"] = task1
        service._sync_tasks["exec2"] = task2

        await service.shutdown()

        assert service._shutdown is True
        assert task1.cancelled()
        assert task2.cancelled()
        assert service._sync_tasks == {}


class TestRegisterActivityMonitoring:
    """Test register_activity_monitoring activity function."""

    @pytest.mark.asyncio
    async def test_register_monitoring_success_on_first_attempt(self) -> None:
        """Test successful registration on first attempt."""
        execution_id = str(uuid4())
        temporal_workflow_id = "workflow-123"

        mock_sync_service = Mock()
        mock_sync_service.is_monitoring_execution.return_value = False
        mock_sync_service.start_monitoring_execution = Mock()

        mock_execution = Mock(spec=Execution)
        mock_execution.id = UUID(execution_id)

        mock_result = Mock()
        mock_result.one_or_none.return_value = mock_execution

        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.get_activity_sync_service",
                return_value=mock_sync_service,
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.AsyncSessionLocal",
                return_value=mock_session,
            ),
        ):
            await register_activity_monitoring(execution_id, temporal_workflow_id)

            mock_sync_service.start_monitoring_execution.assert_called_once_with(
                UUID(execution_id), temporal_workflow_id, request_id=None
            )

    @pytest.mark.asyncio
    async def test_register_monitoring_skips_if_already_monitoring(self) -> None:
        """Test registration skips if already monitoring."""
        execution_id = str(uuid4())
        temporal_workflow_id = "workflow-123"

        mock_sync_service = Mock()
        mock_sync_service.is_monitoring_execution.return_value = True
        mock_sync_service.start_monitoring_execution = Mock()

        with patch(
            "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.get_activity_sync_service",
            return_value=mock_sync_service,
        ):
            await register_activity_monitoring(execution_id, temporal_workflow_id)

            mock_sync_service.start_monitoring_execution.assert_not_called()

    @pytest.mark.asyncio
    async def test_register_monitoring_retries_when_execution_not_found(self) -> None:
        """Test registration retries with exponential backoff when execution not found."""
        execution_id = str(uuid4())
        temporal_workflow_id = "workflow-123"

        mock_sync_service = Mock()
        mock_sync_service.is_monitoring_execution.return_value = False
        mock_sync_service.start_monitoring_execution = Mock()

        mock_execution = Mock(spec=Execution)
        mock_execution.id = UUID(execution_id)

        mock_result_not_found = Mock()
        mock_result_not_found.one_or_none.return_value = None

        mock_result_found = Mock()
        mock_result_found.one_or_none.return_value = mock_execution

        mock_session = Mock()
        mock_session.exec = AsyncMock(side_effect=[mock_result_not_found, mock_result_found])
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.get_activity_sync_service",
                return_value=mock_sync_service,
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.AsyncSessionLocal",
                return_value=mock_session,
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            await register_activity_monitoring(execution_id, temporal_workflow_id)

            assert mock_session.exec.await_count == 2
            mock_sync_service.start_monitoring_execution.assert_called_once()

    @pytest.mark.asyncio
    async def test_register_monitoring_raises_after_max_retries(self) -> None:
        """Test registration raises RuntimeError after max retries exhausted."""
        execution_id = str(uuid4())
        temporal_workflow_id = "workflow-123"

        mock_sync_service = Mock()
        mock_sync_service.is_monitoring_execution.return_value = False

        mock_result = Mock()
        mock_result.one_or_none.return_value = None

        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        with (
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.get_activity_sync_service",
                return_value=mock_sync_service,
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.AsyncSessionLocal",
                return_value=mock_session,
            ),
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.asyncio.sleep",
                new_callable=AsyncMock,
            ),
        ):
            with pytest.raises(RuntimeError, match="not found in database after 5 retries"):
                await register_activity_monitoring(execution_id, temporal_workflow_id)

            assert mock_session.exec.await_count == 5

    @pytest.mark.asyncio
    async def test_register_monitoring_raises_when_sync_service_not_available(self) -> None:
        """Test registration raises RuntimeError when sync service not available."""
        execution_id = str(uuid4())
        temporal_workflow_id = "workflow-123"

        with (
            patch(
                "nexus.workflows.workflow_engine.activities.internal.activity_monitoring.get_activity_sync_service",
                return_value=None,
            ),
            pytest.raises(RuntimeError, match="Activity sync service not available"),
        ):
            await register_activity_monitoring(execution_id, temporal_workflow_id)


class TestActivityEventProcessing:
    """Test activity event processing methods."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.metadata = create_test_metadata()

    def _create_mock_event(
        self,
        event_type: int,
        event_id: int,
        scheduled_event_id: int | None = None,
        activity_id: str = "test-activity",
        attempt: int = 1,
        failure_message: str | None = None,
    ) -> Mock:
        """Create a mock Temporal history event."""
        event = Mock()
        event.event_type = event_type
        event.event_id = event_id
        event.event_time = datetime.now(UTC)

        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            attrs = Mock()
            attrs.activity_id = activity_id
            attrs.start_to_close_timeout = None
            event.activity_task_scheduled_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            attrs.attempt = attempt
            attrs.last_failure = None
            event.activity_task_started_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            event.activity_task_completed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.activity_task_failed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.activity_task_timed_out_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            event.activity_task_canceled_event_attributes = attrs

        return event

    def test_process_activity_scheduled(self) -> None:
        """Test processing ACTIVITY_TASK_SCHEDULED event sets status to PENDING."""
        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=1,
            activity_id="my-activity",
        )

        self.service._process_activity_scheduled(event, self.metadata)

        assert 1 in self.metadata.pending_activity_updates
        assert self.metadata.pending_activity_updates[1]["activity_id"] == "my-activity"
        assert self.metadata.pending_activity_updates[1]["status"] == ActivityStatus.PENDING
        assert self.metadata.pending_activity_updates[1]["started_at"] is None
        assert self.metadata.pending_activity_updates[1]["completed_at"] is None
        assert self.metadata.pending_activity_updates[1]["error_details"] is None
        assert self.metadata.pending_activity_updates[1]["retry_count"] == 0

    def test_process_activity_scheduled_skips_internal_activities(self) -> None:
        """Test processing ACTIVITY_TASK_SCHEDULED skips internal activities."""
        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=1,
            activity_id="__internal__register_monitoring",
        )

        self.service._process_activity_scheduled(event, self.metadata)

        assert 1 not in self.metadata.pending_activity_updates

    @pytest.mark.parametrize(
        ("attempt", "expected_retry_count", "expected_status"),
        [
            (1, 0, ActivityStatus.RUNNING),
            (2, 1, ActivityStatus.RETRYING),
            (3, 2, ActivityStatus.RETRYING),
        ],
    )
    def test_process_activity_started(
        self, attempt: int, expected_retry_count: int, expected_status: ActivityStatus
    ) -> None:
        """Test processing ACTIVITY_TASK_STARTED event sets status to RUNNING or RETRYING based on attempt."""
        self.metadata.pending_activity_updates[1] = {
            "activity_id": "test-activity",
            "status": ActivityStatus.PENDING,
            "started_at": None,
            "retry_count": 0,
        }

        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED,
            event_id=2,
            scheduled_event_id=1,
            attempt=attempt,
        )

        self.service._process_activity_started(event, self.metadata)

        assert self.metadata.pending_activity_updates[1]["status"] == expected_status
        assert self.metadata.pending_activity_updates[1]["started_at"] is not None
        assert self.metadata.pending_activity_updates[1]["retry_count"] == expected_retry_count

    @pytest.mark.parametrize(
        ("failure_message", "expected_error"),
        [
            ("Connection timeout", "Connection timeout"),
            (None, None),
        ],
    )
    def test_process_activity_failed(self, failure_message: str | None, expected_error: str | None) -> None:
        """Test processing ACTIVITY_TASK_FAILED event sets status to FAILED."""
        self.metadata.pending_activity_updates[1] = {
            "activity_id": "test-activity",
            "status": ActivityStatus.RUNNING,
            "completed_at": None,
            "error_details": None,
        }

        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED,
            event_id=3,
            scheduled_event_id=1,
            failure_message=failure_message,
        )

        self.service._process_activity_failed(event, self.metadata)

        assert self.metadata.pending_activity_updates[1]["status"] == ActivityStatus.FAILED
        assert self.metadata.pending_activity_updates[1]["completed_at"] is not None
        assert self.metadata.pending_activity_updates[1]["error_details"] == expected_error

    @pytest.mark.parametrize(
        ("event_type", "expected_status", "expected_error", "failure_message"),
        [
            (EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED, ActivityStatus.COMPLETED, None, None),
            (
                EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT,
                ActivityStatus.FAILED,
                "Activity timeout",
                "Activity timeout",
            ),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED, ActivityStatus.CANCELLED, "Activity was canceled", None),
        ],
    )
    def test_process_activity_terminal_events(
        self,
        event_type: int,
        expected_status: ActivityStatus,
        expected_error: str | None,
        failure_message: str | None,
    ) -> None:
        """Test processing terminal activity events (completed, timed_out, canceled)."""
        self.metadata.pending_activity_updates[1] = {
            "activity_id": "test-activity",
            "status": ActivityStatus.RUNNING,
            "completed_at": None,
            "error_details": None,
        }

        event = self._create_mock_event(
            event_type,
            event_id=3,
            scheduled_event_id=1,
            failure_message=failure_message,
        )

        # Call the appropriate processor based on event type
        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            self.service._process_activity_completed(event, self.metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            self.service._process_activity_timed_out(event, self.metadata)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            self.service._process_activity_canceled(event, self.metadata)

        assert self.metadata.pending_activity_updates[1]["status"] == expected_status
        assert self.metadata.pending_activity_updates[1]["completed_at"] is not None
        if expected_error:
            assert self.metadata.pending_activity_updates[1]["error_details"] == expected_error

    def test_process_activity_completed_sets_completed_for_approval_nodes(self) -> None:
        """Test that approval activities get COMPLETED status on ACTIVITY_TASK_COMPLETED."""
        self.metadata.activity_definitions_map = {
            "approval-node": {"id": "approval-node", "type": "approval", "config": {}},
        }
        self.metadata.pending_activity_updates[1] = {
            "activity_id": "approval-node",
            "status": ActivityStatus.RUNNING,
            "completed_at": None,
            "error_details": None,
        }

        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
            event_id=3,
            scheduled_event_id=1,
        )

        self.service._process_activity_completed(event, self.metadata)

        assert self.metadata.pending_activity_updates[1]["status"] == ActivityStatus.COMPLETED
        assert self.metadata.pending_activity_updates[1]["completed_at"] is not None

    def test_process_activity_completed_sets_completed_for_non_approval_nodes(self) -> None:
        """Test that non-approval activities still get COMPLETED status."""
        self.metadata.activity_definitions_map = {
            "script-node": {"id": "script-node", "type": "script", "config": {}},
        }
        self.metadata.pending_activity_updates[1] = {
            "activity_id": "script-node",
            "status": ActivityStatus.RUNNING,
            "completed_at": None,
            "error_details": None,
        }

        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
            event_id=3,
            scheduled_event_id=1,
        )

        self.service._process_activity_completed(event, self.metadata)

        assert self.metadata.pending_activity_updates[1]["status"] == ActivityStatus.COMPLETED
        assert self.metadata.pending_activity_updates[1]["completed_at"] is not None

    def test_process_activity_event_delegates_to_correct_handler(self) -> None:
        """Test _process_activity_event delegates to the correct handler method."""
        test_cases = [
            (EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, "_process_activity_scheduled"),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED, "_process_activity_started"),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED, "_process_activity_completed"),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED, "_process_activity_failed"),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT, "_process_activity_timed_out"),
            (EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED, "_process_activity_canceled"),
        ]

        for event_type, handler_name in test_cases:
            metadata = create_test_metadata()
            event = self._create_mock_event(event_type, event_id=1, scheduled_event_id=1)

            with patch.object(self.service, handler_name) as mock_handler:
                self.service._process_activity_event(event, metadata)
                mock_handler.assert_called_once_with(event, metadata)


class TestHandleEventPostProcessing:
    """Test _handle_event_post_processing sync trigger logic."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.execution_id = uuid4()
        self.metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"test-activity": 0},
            pending_activity_updates={
                1: {
                    "activity_id": "test-activity",
                    "status": ActivityStatus.RUNNING,
                }
            },
        )
        self.mock_handle = Mock()

    def _create_mock_event(
        self,
        event_type: int,
        event_id: int,
        scheduled_event_id: int | None = None,
    ) -> Mock:
        """Create a mock Temporal history event."""
        event = Mock()
        event.event_type = event_type
        event.event_id = event_id
        event.event_time = datetime.now(UTC)

        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            attrs = Mock()
            attrs.activity_id = "test-activity"
            attrs.start_to_close_timeout = None
            event.activity_task_scheduled_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            attrs.attempt = 1
            attrs.last_failure = None
            event.activity_task_started_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            event.activity_task_completed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            attrs.failure = None
            event.activity_task_failed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            attrs.failure = None
            event.activity_task_timed_out_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            event.activity_task_canceled_event_attributes = attrs

        return event

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "event_type",
        [
            EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_FAILED,
            EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT,
            EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED,
        ],
    )
    async def test_sync_triggered_for_started_and_terminal_events(self, event_type: int) -> None:
        """Test that STARTED and terminal events trigger database sync."""
        event = self._create_mock_event(event_type, event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            result = await self.service._handle_event_post_processing(
                event,
                self.metadata,
                self.mock_handle,
            )

            mock_sync.assert_called_once_with(
                self.metadata,
                self.mock_handle,
            )
            # Verify metadata was updated with event ID
            assert self.metadata.last_processed_event_id == event.event_id
            assert result == event.event_id

    @pytest.mark.asyncio
    async def test_sync_not_triggered_for_scheduled_event(self) -> None:
        """Test that SCHEDULED events do NOT trigger database sync."""
        event = self._create_mock_event(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            result = await self.service._handle_event_post_processing(
                event,
                self.metadata,
                self.mock_handle,
            )

            mock_sync.assert_not_called()
            assert result is None

    @pytest.mark.asyncio
    @pytest.mark.asyncio
    async def test_no_modulo_based_sync(self) -> None:
        """Test that events at multiples of 10 do NOT automatically trigger sync (modulo check removed)."""
        # Create a non-sync event (SCHEDULED) at event_id 10 (multiple of 10)
        event = self._create_mock_event(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, event_id=10)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            result = await self.service._handle_event_post_processing(
                event,
                self.metadata,
                self.mock_handle,
            )

            # Should NOT sync just because event_id is 10
            mock_sync.assert_not_called()
            assert result is None


class TestControlNodeSyncTrigger:
    """Test that control node completions trigger _sync_skipped_nodes."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.mock_handle = Mock()

    def _create_completed_event(self, scheduled_event_id: int = 1, event_id: int = 5) -> Mock:
        event = Mock()
        event.event_type = EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED
        event.event_id = event_id
        attrs = Mock()
        attrs.scheduled_event_id = scheduled_event_id
        event.activity_task_completed_event_attributes = attrs
        return event

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "node_type",
        [NodeType.CONDITION, NodeType.APPROVAL, NodeType.CONVERGE],
    )
    async def test_sync_skipped_after_control_node_completes(self, node_type: str) -> None:
        """Completing a control node (condition, approval, converge) syncs skipped nodes."""
        metadata = create_test_metadata(
            activity_definitions_map={"ctrl_node": {"type": node_type}},
            pending_activity_updates={1: {"activity_id": "ctrl_node", "status": ActivityStatus.RUNNING}},
        )
        event = self._create_completed_event()

        with (
            patch.object(self.service, "_sync_skipped_nodes", new_callable=AsyncMock) as mock_skipped,
            patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock),
        ):
            await self.service._handle_event_post_processing(event, metadata, self.mock_handle)
            mock_skipped.assert_called_once_with(metadata, self.mock_handle)

    @pytest.mark.asyncio
    async def test_no_sync_skipped_for_script_node(self) -> None:
        """Completing a non-control node (script) does NOT sync skipped nodes."""
        metadata = create_test_metadata(
            activity_definitions_map={"script_node": {"type": NodeType.SCRIPT}},
            pending_activity_updates={1: {"activity_id": "script_node", "status": ActivityStatus.RUNNING}},
        )
        event = self._create_completed_event()

        with (
            patch.object(self.service, "_sync_skipped_nodes", new_callable=AsyncMock) as mock_skipped,
            patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock),
        ):
            await self.service._handle_event_post_processing(event, metadata, self.mock_handle)
            mock_skipped.assert_not_called()


class TestWorkflowEventExtraction:
    """Test workflow completion event extraction."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())

    def _create_workflow_event(
        self,
        event_type: int,
        event_id: int = 100,
        failure_message: str | None = None,
    ) -> Mock:
        """Create a mock workflow completion event."""
        event = Mock()
        event.event_type = event_type
        event.event_id = event_id
        event.event_time = datetime(2025, 1, 20, 12, 0, 0, tzinfo=UTC)

        if event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
            attrs = Mock()
            event.workflow_execution_started_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
            attrs = Mock()
            event.workflow_execution_completed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
            attrs = Mock()
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.workflow_execution_failed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED:
            attrs = Mock()
            event.workflow_execution_canceled_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT:
            attrs = Mock()
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.workflow_execution_timed_out_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED:
            attrs = Mock()
            event.workflow_execution_terminated_event_attributes = attrs

        return event

    @pytest.mark.parametrize(
        ("event_type", "expected_status", "expected_error"),
        [
            (EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, "completed", None),
            (EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED, "failed", None),
            (EventType.EVENT_TYPE_WORKFLOW_EXECUTION_CANCELED, "cancelled", None),
            (EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT, "failed", "Workflow execution timed out"),
            (EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TERMINATED, "cancelled", "Workflow was forcibly terminated"),
        ],
    )
    def test_extract_execution_status_from_event(
        self, event_type: int, expected_status: str, expected_error: str | None
    ) -> None:
        """Test extracting execution status from workflow completion events."""
        event = self._create_workflow_event(event_type)

        status, completed_at, error_details = self.service._extract_execution_status_from_event(event)

        assert status.value == expected_status
        assert completed_at == datetime(2025, 1, 20, 12, 0, 0, tzinfo=UTC)
        assert error_details == expected_error

    def test_extract_execution_status_with_failure_message(self) -> None:
        """Test extracting status from FAILED event includes error message."""
        from nexus.workflows.models.execution import ExecutionStatus

        event = self._create_workflow_event(
            EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED, failure_message="Database connection failed"
        )

        status, _completed_at, error_details = self.service._extract_execution_status_from_event(event)

        assert status == ExecutionStatus.FAILED
        assert error_details == "Database connection failed"

    def test_extract_execution_status_with_timeout_uses_default_message(self) -> None:
        """Test extracting status from TIMED_OUT event uses default message (not custom)."""
        from nexus.workflows.models.execution import ExecutionStatus

        event = self._create_workflow_event(
            EventType.EVENT_TYPE_WORKFLOW_EXECUTION_TIMED_OUT, failure_message="Workflow exceeded 5 minute timeout"
        )

        status, _completed_at, error_details = self.service._extract_execution_status_from_event(event)

        assert status == ExecutionStatus.FAILED
        # Implementation uses default message, not custom failure message
        assert error_details == "Workflow execution timed out"

    def test_extract_execution_status_raises_on_invalid_event(self) -> None:
        """Test extraction raises SafeValueError for non-completion events."""
        # Use an activity event instead of a workflow event
        event = self._create_workflow_event(EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED)

        with pytest.raises(SafeValueError, match="is not a workflow completion event"):
            self.service._extract_execution_status_from_event(event)


class TestExecutionStatusUpdates:
    """Test execution status updates during monitoring."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.mock_session_factory = Mock()
        self.mock_activity_publisher = AsyncMock()
        self.service = ActivitySyncService(Mock(), self.mock_session_factory, self.mock_activity_publisher)
        self.execution_id = uuid4()

    def _create_mock_execution(
        self,
        execution_id: UUID,
        status: str = "PENDING",
        created_at: datetime | None = None,
    ) -> Mock:
        """Create a mock Execution object."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = Mock(spec=Execution)
        execution.id = execution_id
        execution.status = ExecutionStatus[status]
        execution.temporal_workflow_id = f"exec-{execution_id}"
        execution.created_at = created_at or datetime(2025, 1, 20, 10, 0, 0, tzinfo=UTC)
        execution.updated_at = execution.created_at
        execution.completed_at = None
        execution.error_details = None
        execution.activities = []
        return execution

    def _create_workflow_event(
        self,
        event_type: int,
        event_id: int = 1,
        event_time: datetime | None = None,
        failure_message: str | None = None,
    ) -> Mock:
        """Create a mock workflow event."""
        event = Mock()
        event.event_type = event_type
        event.event_id = event_id
        event.event_time = event_time or datetime(2025, 1, 20, 12, 0, 0, tzinfo=UTC)

        if event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED:
            attrs = Mock()
            attrs.workflow_run_timeout = None
            event.workflow_execution_started_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
            attrs = Mock()
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.workflow_execution_failed_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
            attrs = Mock()
            event.workflow_execution_completed_event_attributes = attrs

        return event

    @pytest.mark.asyncio
    async def test_update_execution_to_running_from_pending(self) -> None:
        """Test updating execution status from PENDING to RUNNING."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="PENDING")

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event = self._create_workflow_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED, event_id=5)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_to_running(metadata, event)

        # Verify status changed to RUNNING
        assert execution.status == ExecutionStatus.RUNNING
        assert execution.last_processed_event_id == 5
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_execution_to_running_skips_if_already_running(self) -> None:
        """Test updating to RUNNING is idempotent (service restart scenario)."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="RUNNING")
        original_status = execution.status

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event = self._create_workflow_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_to_running(metadata, event)

        # Verify status unchanged (idempotent)
        assert execution.status == original_status
        assert execution.status == ExecutionStatus.RUNNING
        # Commit should not be called since no changes
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_execution_to_running_skips_if_terminal_state(self) -> None:
        """Test updating to RUNNING skips if execution already in terminal state."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="COMPLETED")
        original_status = execution.status

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event = self._create_workflow_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_to_running(metadata, event)

        # Verify status unchanged
        assert execution.status == original_status
        assert execution.status == ExecutionStatus.COMPLETED
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_execution_status_on_completion(self) -> None:
        """Test updating execution status to COMPLETED when workflow completes."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="RUNNING")

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event_time = datetime(2025, 1, 20, 12, 30, 0, tzinfo=UTC)
        event = self._create_workflow_event(
            EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, event_id=100, event_time=event_time
        )

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_status_from_event(metadata, event)

        # Verify status changed to COMPLETED
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.completed_at == event_time
        assert execution.last_processed_event_id == 100
        assert execution.error_details is None
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_execution_status_on_failure_with_error(self) -> None:
        """Test updating execution status to FAILED with error message."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="RUNNING")

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event = self._create_workflow_event(
            EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED,
            event_id=100,
            failure_message="Database connection timeout",
        )

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_status_from_event(metadata, event)

        # Verify status changed to FAILED with error
        assert execution.status == ExecutionStatus.FAILED
        assert execution.completed_at is not None
        assert execution.error_details == "Database connection timeout"
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_update_execution_status_skips_if_already_terminal(self) -> None:
        """Test updating status is idempotent (service restart after completion)."""
        from nexus.workflows.models.execution import ExecutionStatus

        execution = self._create_mock_execution(self.execution_id, status="COMPLETED")
        execution.completed_at = datetime(2025, 1, 20, 12, 0, 0, tzinfo=UTC)
        original_status = execution.status
        original_completed_at = execution.completed_at

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        event = self._create_workflow_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_status_from_event(metadata, event)

        # Verify execution not modified (idempotent)
        assert execution.status == original_status
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.completed_at == original_completed_at
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_update_execution_status_adjusts_timestamp_if_before_created_at(self) -> None:
        """Test completion timestamp is adjusted if before created_at (database constraint)."""
        from nexus.workflows.models.execution import ExecutionStatus

        created_at = datetime(2025, 1, 20, 12, 0, 0, tzinfo=UTC)
        execution = self._create_mock_execution(self.execution_id, status="RUNNING", created_at=created_at)

        # Mock session
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session

        # Completion time before creation time (edge case)
        event_time = datetime(2025, 1, 20, 11, 0, 0, tzinfo=UTC)
        event = self._create_workflow_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, event_time=event_time)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        # Execute
        await self.service._update_execution_status_from_event(metadata, event)

        # Verify completed_at was adjusted to be after created_at
        assert execution.status == ExecutionStatus.COMPLETED
        assert execution.completed_at > created_at
        # Should be created_at + 1 microsecond
        assert execution.completed_at == created_at + datetime.resolution
        mock_session.commit.assert_awaited_once()


class TestAgenticActivityFinalizationOnWorkflowCompletion:
    """Test that RUNNING agentic activities are finalized when the workflow completes."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        from nexus.workflows.models.execution import ExecutionStatus

        self.mock_session_factory = Mock()
        self.mock_activity_publisher = AsyncMock()
        self.service = ActivitySyncService(Mock(), self.mock_session_factory, self.mock_activity_publisher)
        self.execution_id = uuid4()
        self.ExecutionStatus = ExecutionStatus

    def _create_mock_execution(self, status: str = "RUNNING", activities: list[Mock] | None = None) -> Mock:
        execution = Mock(spec=Execution)
        execution.id = self.execution_id
        execution.status = self.ExecutionStatus[status]
        execution.temporal_workflow_id = f"exec-{self.execution_id}"
        execution.created_at = datetime(2025, 1, 20, 10, 0, 0, tzinfo=UTC)
        execution.updated_at = execution.created_at
        execution.completed_at = None
        execution.error_details = None
        execution.activities = activities or []
        return execution

    def _create_mock_activity(self, status: ActivityStatus, executor: str = "agentic") -> Mock:
        act = Mock()
        act.id = uuid4()
        act.activity_name = "test-activity"
        act.temporal_activity_id = "test-activity"
        act.status = status
        act.completed_at = None
        act.error_details = None
        act.output_data = None
        # V2 format: type is at top level
        act.activity_definition = {"type": executor}
        return act

    def _create_workflow_event(self, event_type: int, failure_message: str | None = None) -> Mock:
        event = Mock()
        event.event_type = event_type
        event.event_id = 100
        event.event_time = datetime(2025, 1, 20, 12, 30, 0, tzinfo=UTC)

        if event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED:
            attrs = Mock()
            attrs.result = Mock(payloads=[])
            event.workflow_execution_completed_event_attributes = attrs
        elif event_type == EventType.EVENT_TYPE_WORKFLOW_EXECUTION_FAILED:
            attrs = Mock()
            attrs.failure = Mock(message=failure_message) if failure_message else None
            event.workflow_execution_failed_event_attributes = attrs

        return event

    def _mock_session(self, execution: Mock) -> Mock:
        mock_result = Mock()
        mock_result.one_or_none.return_value = execution
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        self.mock_session_factory.return_value = mock_session
        return mock_session

    @staticmethod
    def _mock_handle(output_data: dict[str, object] | None = None) -> Mock:
        """Create a mock workflow handle that returns output_data for queries."""
        handle = AsyncMock()
        handle.query = AsyncMock(return_value=output_data)
        return handle


class TestParseErrorFromOutput:
    """Test _parse_error_from_output static method."""

    @pytest.mark.parametrize(
        ("output", "expected"),
        [
            ({"status": "failed", "error": {"message": "timeout"}}, "timeout"),
            ({"status": "failed", "error": "plain error string"}, "plain error string"),
            ({"status": "failed", "error": {"type": "X"}}, "Activity failed"),
            ({"status": "failed"}, "Activity failed"),
            ({"status": "failed", "error": ""}, "Activity failed"),
            ({"status": "completed"}, None),
            ({"status": "completed", "error": {"message": "ignored"}}, None),
            ({}, None),
            (None, None),
        ],
        ids=[
            "dict_error_with_message",
            "string_error",
            "dict_error_no_message",
            "no_error_key",
            "empty_string_error",
            "completed_status",
            "completed_with_error_ignored",
            "empty_dict",
            "none_input",
        ],
    )
    def test_parse_error_from_output(self, output: dict[str, Any] | None, expected: str | None) -> None:
        """Test error extraction from various output shapes."""
        assert ActivitySyncService._parse_error_from_output(output) == expected


class TestIsAgenticActivity:
    """Test _is_agentic_activity with v1 and v2 formats."""

    @pytest.mark.parametrize(
        ("activity_def", "expected"),
        [
            ({"type": "agentic"}, True),
            ({"type": "script"}, False),
            ({"type": "aap_job_template"}, False),
            ({}, False),
        ],
        ids=["agentic", "script", "aap", "empty"],
    )
    def test_is_agentic_activity(self, activity_def: dict[str, object], expected: bool) -> None:  # noqa: FBT001
        """Test agentic detection for activity definitions."""
        assert ActivitySyncService._is_agentic_activity(activity_def) == expected


class TestExtractTriggerActivityType:
    """Test _extract_trigger_activity_type static method."""

    @pytest.mark.parametrize(
        ("activity_definitions_map", "expected"),
        [
            ({"trigger-1": {"type": "manual_trigger"}}, "manual_trigger"),
            ({"trigger-1": {"type": "scheduled_trigger"}}, "scheduled_trigger"),
            ({"trigger-1": {"type": "webhook_trigger"}}, "webhook_trigger"),
            ({"trigger-1": {"type": "eda_trigger"}}, "eda_trigger"),
            (
                {
                    "node-1": {"type": "script"},
                    "trigger-1": {"type": "manual_trigger"},
                    "node-2": {"type": "condition"},
                },
                "manual_trigger",
            ),
            ({"node-1": {"type": "script"}, "node-2": {"type": "agentic"}}, None),
            ({}, None),
            ({"node-1": {"type": 123}}, None),
            ({"node-1": {"name": "test"}}, None),
            ({"node-1": {}}, None),
            ({"trigger-1": {"type": "unknown_trigger"}}, None),
        ],
        ids=[
            "manual_trigger",
            "scheduled_trigger",
            "webhook_trigger",
            "eda_trigger",
            "mixed_nodes_with_trigger",
            "no_trigger_nodes",
            "empty_map",
            "non_string_type",
            "missing_type_key",
            "empty_definition",
            "unknown_trigger_type_not_matched",
        ],
    )
    def test_extract_trigger_activity_type(
        self, activity_definitions_map: dict[str, dict[str, Any]], expected: ActivityName | None
    ) -> None:
        """Test trigger type extraction from various activity definition maps."""
        assert ActivitySyncService._extract_trigger_activity_type(activity_definitions_map) == expected


class TestActivitySyncTerminalCleanup:
    """Test terminal activity cleanup logic in _sync_activities_to_db."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.execution_id = uuid4()
        self.mock_session_factory = Mock()
        self.mock_activity_publisher = AsyncMock()
        self.service = ActivitySyncService(Mock(), self.mock_session_factory, self.mock_activity_publisher)

    def _create_mock_activity_execution(
        self,
        activity_name: str = "approval-node",
        status: ActivityStatus = ActivityStatus.PENDING,
    ) -> Mock:
        """Create a mock ActivityExecution database record."""
        activity = Mock()
        activity.activity_name = activity_name
        activity.status = status
        activity.started_at = None
        activity.completed_at = None
        activity.error_details = None
        activity.retry_count = 0
        activity.input_data = {}
        activity.output_data = None
        activity.updated_at = None
        return activity

    def _mock_session_with_activities(self, activities: list[Mock]) -> Mock:
        """Create a mock session that returns the given activities and a mock execution."""
        from nexus.workflows.models.execution import Execution

        # Mock for the activity query
        mock_activity_result = Mock()
        mock_activity_result.all.return_value = activities

        # Mock for the execution query (used to update last_processed_event_id)
        mock_execution = Mock(spec=Execution)
        mock_execution.id = self.execution_id
        mock_execution.last_processed_event_id = 0
        mock_execution_result = Mock()
        mock_execution_result.one_or_none.return_value = mock_execution

        mock_session = Mock()
        mock_session.exec = AsyncMock(side_effect=[mock_activity_result, mock_execution_result])
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        self.mock_session_factory.return_value = mock_session
        return mock_session

    def _create_mock_handle(
        self,
        input_data: dict[str, Any] | None = None,
        output_data: dict[str, Any] | None = None,
    ) -> AsyncMock:
        """Create a mock workflow handle that returns given data for queries."""
        handle = AsyncMock()

        async def mock_query(query_name: str, activity_id: str) -> dict[str, object] | None:
            if query_name == "get_activity_input":
                return input_data or {}
            if query_name == "get_activity_output":
                return output_data
            return None

        handle.query = AsyncMock(side_effect=mock_query)
        return handle

    @pytest.mark.asyncio
    async def test_completed_activity_cleared_from_pending(self) -> None:
        """A completed activity with output_data is cleared from pending_activity_updates."""
        activity = self._create_mock_activity_execution(activity_name="script-node")
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(output_data={"stdout": "hello", "exit_code": 0})

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"script-node": 0},
            pending_activity_updates={
                10: {
                    "activity_id": "script-node",
                    "activity_name": "script-node",
                    "status": ActivityStatus.COMPLETED,
                    "started_at": datetime.now(UTC),
                    "completed_at": datetime.now(UTC),
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        # Should be cleared from pending (terminal + has output)
        assert 10 not in metadata.pending_activity_updates

    @pytest.mark.asyncio
    async def test_non_completed_activity_stays_in_pending(self) -> None:
        """Activities in non-terminal states (RUNNING, FAILED) remain in pending_activity_updates."""
        activity = self._create_mock_activity_execution(activity_name="running-node")
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(output_data=None)

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"running-node": 0},
            pending_activity_updates={
                10: {
                    "activity_id": "running-node",
                    "activity_name": "running-node",
                    "status": ActivityStatus.RUNNING,
                    "started_at": datetime.now(UTC),
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        # RUNNING activity should remain in pending (not terminal)
        assert 10 in metadata.pending_activity_updates

    @pytest.mark.asyncio
    async def test_waiting_approval_stays_waiting_when_no_output(self) -> None:
        """WAITING approval activity remains WAITING when output_data is still None."""
        activity = self._create_mock_activity_execution(
            activity_name="approval-node",
            status=ActivityStatus.WAITING,
        )
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(output_data=None)

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"approval-node": 0},
            pending_activity_updates={
                10: {
                    "activity_id": "approval-node",
                    "activity_name": "approval-node",
                    "status": ActivityStatus.WAITING,
                    "started_at": datetime.now(UTC),
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        assert activity.status == ActivityStatus.WAITING
        assert activity.completed_at is None

    @pytest.mark.asyncio
    async def test_running_agentic_stays_running_when_no_output(self) -> None:
        """RUNNING agentic activity remains RUNNING when output_data is still None."""
        activity = self._create_mock_activity_execution(
            activity_name="agent-node",
            status=ActivityStatus.RUNNING,
        )
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(output_data=None)

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"agent-node": 0},
            activity_definitions_map={
                "agent-node": {"type": "agentic"},
            },
            pending_activity_updates={
                10: {
                    "activity_id": "agent-node",
                    "activity_name": "agent-node",
                    "status": ActivityStatus.RUNNING,
                    "started_at": datetime.now(UTC),
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        assert activity.status == ActivityStatus.RUNNING
        assert activity.completed_at is None


class TestExtractFailedActivityErrors:
    """Test _extract_failed_activity_errors static method."""

    def test_with_failed_activities(self) -> None:
        """Test extraction from failed_activities dict."""
        result_data = {"failed_activities": {"node-1": "error A", "node-2": "error B"}}
        result = ActivitySyncService._extract_failed_activity_errors(result_data)
        assert "node-1: error A" in result
        assert "node-2: error B" in result

    def test_empty_failed_activities(self) -> None:
        """Test fallback when failed_activities is empty."""
        result_data: dict[str, object] = {"failed_activities": {}}
        result = ActivitySyncService._extract_failed_activity_errors(result_data)
        assert result == "One or more workflow activities failed"

    def test_no_failed_activities_key(self) -> None:
        """Test fallback when no failed_activities key."""
        result = ActivitySyncService._extract_failed_activity_errors({})
        assert result == "One or more workflow activities failed"


class TestSyncNodesToTerminalStatus:
    """Test _sync_nodes_to_terminal_status shared method and its callers.

    Both _sync_skipped_nodes and _sync_failed_nodes delegate to a shared
    method that handles DB updates and WebSocket patch publishing.
    """

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.execution_id = uuid4()
        self.mock_session_factory = Mock()
        self.mock_activity_publisher = AsyncMock()
        self.service = ActivitySyncService(Mock(), self.mock_session_factory, self.mock_activity_publisher)

    def _create_metadata(
        self,
        activity_index_map: dict[str, int] | None = None,
    ) -> ExecutionMonitorMetadata:
        return create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map=activity_index_map or {},
        )

    def _create_mock_activity_execution(
        self,
        activity_name: str,
        status: ActivityStatus = ActivityStatus.PENDING,
    ) -> Mock:
        """Create a mock ActivityExecution database record."""
        activity = Mock()
        activity.activity_name = activity_name
        activity.status = status
        activity.started_at = None
        activity.completed_at = None
        activity.error_details = None
        activity.updated_at = None
        return activity

    def _mock_session(
        self,
        activities: list[Mock],
        actually_updated_names: set[str] | None = None,
    ) -> Mock:
        """Create a mock session returning given activities.

        activities: PENDING activities returned by the SELECT (Phase 1).
        actually_updated_names: names returned by the RETURNING clause of the atomic
            UPDATE (Phase 2). Defaults to all activity names, simulating every
            activity being updated successfully.
        """
        mock_result = Mock()
        mock_result.all.return_value = activities
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)

        names = actually_updated_names if actually_updated_names is not None else {a.activity_name for a in activities}
        mock_update_result = Mock()
        mock_update_result.fetchall.return_value = [(name,) for name in names]
        mock_session.execute = AsyncMock(return_value=mock_update_result)

        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        self.mock_session_factory.return_value = mock_session
        return mock_session

    # -- _sync_failed_nodes tests --

    @pytest.mark.asyncio
    async def test_failed_node_marked_as_failed_in_database(self) -> None:
        """Node that failed during expression resolution should be marked FAILED."""
        activity = self._create_mock_activity_execution("node-A")
        self._mock_session([activity])
        metadata = self._create_metadata(activity_index_map={"node-A": 0})

        handle = AsyncMock()
        handle.query = AsyncMock(return_value={"node-A": "Key 'output' not found in namespace path"})

        await self.service._sync_failed_nodes(metadata, handle)

        handle.query.assert_awaited_once_with("get_failed_nodes")
        assert activity.status == ActivityStatus.FAILED
        assert activity.completed_at is not None
        assert activity.error_details == "Key 'output' not found in namespace path"

    @pytest.mark.asyncio
    async def test_multiple_failed_nodes_all_marked(self) -> None:
        """Multiple failed nodes should each get the correct error message."""
        activity_a = self._create_mock_activity_execution("node-A")
        activity_b = self._create_mock_activity_execution("node-B")
        self._mock_session([activity_a, activity_b])
        metadata = self._create_metadata(activity_index_map={"node-A": 0, "node-B": 1})

        handle = AsyncMock()
        handle.query = AsyncMock(
            return_value={
                "node-A": "Key 'output' not found",
                "node-B": "Namespace 'missing' not found",
            }
        )

        await self.service._sync_failed_nodes(metadata, handle)

        assert activity_a.status == ActivityStatus.FAILED
        assert activity_a.error_details == "Key 'output' not found"
        assert activity_b.status == ActivityStatus.FAILED
        assert activity_b.error_details == "Namespace 'missing' not found"

    @pytest.mark.asyncio
    async def test_no_failed_nodes_is_noop(self) -> None:
        """When no nodes failed, no database operations should occur."""
        metadata = self._create_metadata()
        handle = AsyncMock()
        handle.query = AsyncMock(return_value={})

        await self.service._sync_failed_nodes(metadata, handle)

        self.mock_session_factory.assert_not_called()

    @pytest.mark.asyncio
    async def test_failed_sync_skips_already_failed_node(self) -> None:
        """Node already in FAILED status is filtered out by the PENDING WHERE clause.

        The SELECT in Phase 1 filters to status=PENDING, so Temporal-synced FAILED
        activities are never loaded and the atomic UPDATE never runs.
        """
        mock_session = self._mock_session([])  # FAILED activity excluded by WHERE status=PENDING
        metadata = self._create_metadata()

        handle = AsyncMock()
        handle.query = AsyncMock(return_value={"node-A": "some error"})

        await self.service._sync_failed_nodes(metadata, handle)

        mock_session.execute.assert_not_awaited()
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_failed_sync_preserves_temporal_error_details(self) -> None:
        """Temporal-synced FAILED activities must not be overwritten by query-based sync.

        In production the SELECT WHERE status=PENDING excludes already-FAILED records.
        This test verifies that when no PENDING activities are found (because Temporal
        already synced them), no UPDATE is executed and no patches are published —
        preserving the rich Temporal error details.
        """
        mock_session = self._mock_session([])  # Temporal-synced FAILED not in PENDING results
        metadata = self._create_metadata()

        handle = AsyncMock()
        handle.query = AsyncMock(return_value={"node-A": "Key 'output' not found in namespace path"})

        with patch.object(self.service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await self.service._sync_failed_nodes(metadata, handle)

        mock_session.execute.assert_not_awaited()
        mock_session.commit.assert_not_awaited()
        mock_publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_failed_sync_publishes_websocket_patches(self) -> None:
        """Status changes should be published to WebSocket via activity patches."""
        activity = self._create_mock_activity_execution("node-A")
        self._mock_session([activity])
        metadata = self._create_metadata(activity_index_map={"node-A": 0})

        handle = AsyncMock()
        handle.query = AsyncMock(return_value={"node-A": "expression error"})

        with patch.object(self.service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await self.service._sync_failed_nodes(metadata, handle)

            mock_publish.assert_awaited_once()
            call_args = mock_publish.call_args
            assert call_args[0][0] is metadata
            updated = call_args[0][1]
            assert len(updated) == 1
            assert updated[0][0] is activity
            assert updated[0][1]["status"] == ActivityStatus.PENDING

    @pytest.mark.asyncio
    async def test_failed_sync_query_error_does_not_propagate(self) -> None:
        """Errors during failed node sync should be logged, not raised."""
        metadata = self._create_metadata()
        handle = AsyncMock()
        handle.query = AsyncMock(side_effect=RuntimeError("workflow not reachable"))

        await self.service._sync_failed_nodes(metadata, handle)

    # -- _sync_skipped_nodes tests --

    @pytest.mark.asyncio
    async def test_skipped_node_marked_as_skipped_in_database(self) -> None:
        """Node on non-taken condition branch should be marked SKIPPED."""
        activity = self._create_mock_activity_execution("node-B")
        self._mock_session([activity])
        metadata = self._create_metadata(activity_index_map={"node-B": 1})

        handle = AsyncMock()
        skipped_return = ["node-B"]
        pre_resolved_return: list[str] = []
        handle.query = AsyncMock(side_effect=[skipped_return, pre_resolved_return])

        await self.service._sync_skipped_nodes(metadata, handle)

        assert handle.query.await_count == 2
        handle.query.assert_any_await("get_skipped_nodes")
        handle.query.assert_any_await("get_pre_resolved_nodes")
        assert activity.status == ActivityStatus.SKIPPED
        assert activity.completed_at is not None
        assert activity.error_details is None

    @pytest.mark.asyncio
    async def test_skipped_sync_publishes_websocket_patches(self) -> None:
        """Skipped nodes should trigger WebSocket activity patches after DB commit."""
        activity = self._create_mock_activity_execution("node-B")
        self._mock_session([activity])
        metadata = self._create_metadata(activity_index_map={"node-B": 1})

        handle = AsyncMock()
        handle.query = AsyncMock(side_effect=[["node-B"], []])

        with patch.object(self.service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await self.service._sync_skipped_nodes(metadata, handle)

            mock_publish.assert_awaited_once()
            call_args = mock_publish.call_args
            assert call_args[0][0] is metadata
            updated = call_args[0][1]
            assert len(updated) == 1
            assert updated[0][0] is activity
            assert updated[0][1]["status"] == ActivityStatus.PENDING

    @pytest.mark.asyncio
    async def test_no_skipped_nodes_is_noop(self) -> None:
        """When no nodes skipped, no database operations should occur."""
        metadata = self._create_metadata()
        handle = AsyncMock()
        handle.query = AsyncMock(side_effect=[[], []])

        await self.service._sync_skipped_nodes(metadata, handle)

        self.mock_session_factory.assert_not_called()

    @pytest.mark.asyncio
    async def test_skipped_sync_query_error_does_not_propagate(self) -> None:
        """Errors during skipped node sync should be logged, not raised."""
        metadata = self._create_metadata()
        handle = AsyncMock()
        handle.query = AsyncMock(side_effect=RuntimeError("workflow not reachable"))

        await self.service._sync_skipped_nodes(metadata, handle)

    # -- _ensure_activity_records_exist tests --

    @pytest.mark.asyncio
    async def test_ensure_activity_records_creates_missing_records(self) -> None:
        """Pre-resolved nodes without existing records get SKIPPED ActivityExecution rows."""
        mock_result = Mock()
        mock_result.all.return_value = []
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        self.mock_session_factory.return_value = mock_session

        node_def = {"id": "node-A", "type": "script"}
        metadata = self._create_metadata()
        metadata.activity_definitions_map = {"node-A": node_def}

        await self.service._ensure_activity_records_exist(metadata, ["node-A"], ActivityStatus.SKIPPED)

        mock_session.add.assert_called_once()
        record = mock_session.add.call_args[0][0]
        assert record.activity_name == "node-A"
        assert record.status == ActivityStatus.SKIPPED
        assert record.activity_definition == node_def
        assert record.temporal_activity_id.startswith("pre-resolved-")
        assert record.started_at is not None
        assert record.completed_at is not None
        mock_session.commit.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_ensure_activity_records_skips_existing(self) -> None:
        """Nodes that already have records are not duplicated."""
        mock_result = Mock()
        mock_result.all.return_value = ["node-A"]
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        self.mock_session_factory.return_value = mock_session

        metadata = self._create_metadata()

        await self.service._ensure_activity_records_exist(metadata, ["node-A"], ActivityStatus.SKIPPED)

        mock_session.add.assert_not_called()
        mock_session.commit.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_ensure_activity_records_mixed_existing_and_missing(self) -> None:
        """Only missing nodes get new records when some already exist."""
        mock_result = Mock()
        mock_result.all.return_value = ["node-A"]
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.add = Mock()
        mock_session.commit = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)
        self.mock_session_factory.return_value = mock_session

        metadata = self._create_metadata()

        await self.service._ensure_activity_records_exist(metadata, ["node-A", "node-B"], ActivityStatus.SKIPPED)

        mock_session.add.assert_called_once()
        record = mock_session.add.call_args[0][0]
        assert record.activity_name == "node-B"
        mock_session.commit.assert_awaited_once()


# ---------------------------------------------------------------------------
# Tests: input_data credential scrubbing before DB persistence (AAP-74431)
# ---------------------------------------------------------------------------


class TestInputDataCredentialScrubbing(TestActivitySyncTerminalCleanup):
    """Verify input_data is scrubbed before writing to ActivityExecution (AAP-74431)."""

    @pytest.mark.asyncio
    async def test_credential_fields_scrubbed_before_persistence(self) -> None:
        """Input data containing credential fields should be redacted before DB write."""
        from nexus.workflows.workflow_engine.utils.credential_scrubber import REDACTED

        activity = self._create_mock_activity_execution(activity_name="approval-node")
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(
            input_data={"url": "http://example.com", "bearer_token": "sk-secret-123"},
            output_data={"status": "ok"},
        )

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"approval-node": 0},
            pending_activity_updates={
                10: {
                    "activity_id": "approval-node",
                    "activity_name": "approval-node",
                    "status": ActivityStatus.COMPLETED,
                    "started_at": datetime.now(UTC),
                    "completed_at": datetime.now(UTC),
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        assert activity.input_data["bearer_token"] == REDACTED
        assert activity.input_data["url"] == "http://example.com"

    @pytest.mark.asyncio
    async def test_clean_input_data_preserved(self) -> None:
        """Input data without credential fields should pass through unchanged."""
        activity = self._create_mock_activity_execution(activity_name="approval-node")
        self._mock_session_with_activities([activity])

        handle = self._create_mock_handle(
            input_data={"url": "http://example.com", "method": "GET"},
            output_data={"status": "ok"},
        )

        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map={"approval-node": 0},
            pending_activity_updates={
                10: {
                    "activity_id": "approval-node",
                    "activity_name": "approval-node",
                    "status": ActivityStatus.COMPLETED,
                    "started_at": datetime.now(UTC),
                    "completed_at": datetime.now(UTC),
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        await self.service._sync_activities_to_db(metadata, handle)

        assert activity.input_data == {"url": "http://example.com", "method": "GET"}


class TestSyntheticActivityStarted:
    """Test synthetic STARTED event processing from describe() probing."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.execution_id = uuid4()

    @pytest.mark.asyncio
    async def test_updates_pending_activity_to_running(self) -> None:
        """Test that a synthetic STARTED event transitions PENDING to RUNNING."""
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_definitions_map={"my-activity": {"type": "script"}},
            pending_activity_updates={
                5: {
                    "activity_id": "my-activity",
                    "activity_name": "my-activity",
                    "status": ActivityStatus.PENDING,
                    "started_at": None,
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        event = SyntheticActivityStarted(activity_id="my-activity", scheduled_event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock):
            await self.service._process_synthetic_activity_started(event, metadata, Mock())

        assert metadata.pending_activity_updates[5]["status"] == ActivityStatus.RUNNING
        assert metadata.pending_activity_updates[5]["started_at"] is not None

    @pytest.mark.asyncio
    async def test_updates_approval_activity_to_waiting(self) -> None:
        """Test that a synthetic STARTED event transitions approval nodes to WAITING."""
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_definitions_map={"approval-node": {"type": "approval"}},
            pending_activity_updates={
                5: {
                    "activity_id": "approval-node",
                    "activity_name": "approval-node",
                    "status": ActivityStatus.PENDING,
                    "started_at": None,
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        event = SyntheticActivityStarted(activity_id="approval-node", scheduled_event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock):
            await self.service._process_synthetic_activity_started(event, metadata, Mock())

        assert metadata.pending_activity_updates[5]["status"] == ActivityStatus.WAITING
        assert metadata.pending_activity_updates[5]["started_at"] is not None

    @pytest.mark.asyncio
    async def test_skips_if_already_running(self) -> None:
        """Test that synthetic STARTED is a no-op if activity is already RUNNING."""
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            pending_activity_updates={
                5: {
                    "activity_id": "my-activity",
                    "status": ActivityStatus.RUNNING,
                    "started_at": datetime.now(UTC),
                },
            },
        )

        event = SyntheticActivityStarted(activity_id="my-activity", scheduled_event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            await self.service._process_synthetic_activity_started(event, metadata, Mock())
            mock_sync.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_if_already_completed(self) -> None:
        """Test that synthetic STARTED is a no-op if activity is already COMPLETED."""
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            pending_activity_updates={
                5: {
                    "activity_id": "my-activity",
                    "status": ActivityStatus.COMPLETED,
                },
            },
        )

        event = SyntheticActivityStarted(activity_id="my-activity", scheduled_event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            await self.service._process_synthetic_activity_started(event, metadata, Mock())
            mock_sync.assert_not_called()

    @pytest.mark.asyncio
    async def test_skips_if_not_in_pending_updates(self) -> None:
        """Test that synthetic STARTED is a no-op if activity not found in pending updates."""
        metadata = create_test_metadata(execution_id=self.execution_id)
        event = SyntheticActivityStarted(activity_id="unknown", scheduled_event_id=99)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            await self.service._process_synthetic_activity_started(event, metadata, Mock())
            mock_sync.assert_not_called()


class TestScheduleDescribeProbe:
    """Test _schedule_describe_probe describe() polling logic."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())

    @pytest.mark.asyncio
    async def test_pushes_synthetic_event_when_activity_started(self) -> None:
        """Test that probe pushes SyntheticActivityStarted when describe reports STARTED."""
        mock_handle = AsyncMock()
        pa = Mock()
        pa.activity_id = "my-activity"
        pa.state = STARTED_STATE
        mock_desc = Mock()
        mock_desc.raw_description.pending_activities = [pa]
        mock_handle.describe.return_value = mock_desc

        queue: asyncio.Queue[Any] = asyncio.Queue()

        await self.service._schedule_describe_probe(
            handle=mock_handle,
            queue=queue,
            activity_id="my-activity",
            scheduled_event_id=5,
        )

        assert not queue.empty()
        item = await queue.get()
        assert isinstance(item, SyntheticActivityStarted)
        assert item.activity_id == "my-activity"
        assert item.scheduled_event_id == 5

    @pytest.mark.asyncio
    async def test_stops_when_activity_no_longer_pending(self) -> None:
        """Test that probe stops when activity disappears from pending list."""
        mock_handle = AsyncMock()
        mock_desc = Mock()
        mock_desc.raw_description.pending_activities = []
        mock_handle.describe.return_value = mock_desc

        queue: asyncio.Queue[Any] = asyncio.Queue()

        await self.service._schedule_describe_probe(
            handle=mock_handle,
            queue=queue,
            activity_id="my-activity",
            scheduled_event_id=5,
        )

        assert queue.empty()
        mock_handle.describe.assert_called_once()

    @pytest.mark.asyncio
    async def test_retries_with_backoff_when_still_scheduled(self) -> None:
        """Test that probe retries with backoff when activity is still SCHEDULED."""
        pa_scheduled = Mock()
        pa_scheduled.activity_id = "my-activity"
        pa_scheduled.state = 1  # SCHEDULED

        pa_started = Mock()
        pa_started.activity_id = "my-activity"
        pa_started.state = STARTED_STATE

        desc_scheduled = Mock()
        desc_scheduled.raw_description.pending_activities = [pa_scheduled]

        desc_started = Mock()
        desc_started.raw_description.pending_activities = [pa_started]

        mock_handle = AsyncMock()
        mock_handle.describe.side_effect = [desc_scheduled, desc_scheduled, desc_started]

        queue: asyncio.Queue[Any] = asyncio.Queue()

        with patch(
            "nexus.workflows.workflow_engine.services.activity_sync_service.asyncio.sleep", new_callable=AsyncMock
        ):
            await self.service._schedule_describe_probe(
                handle=mock_handle,
                queue=queue,
                activity_id="my-activity",
                scheduled_event_id=5,
            )

        assert mock_handle.describe.call_count == 3
        item = await queue.get()
        assert isinstance(item, SyntheticActivityStarted)

    @pytest.mark.asyncio
    async def test_retries_on_exception(self) -> None:
        """Test that probe retries when describe() raises an exception."""
        pa_started = Mock()
        pa_started.activity_id = "my-activity"
        pa_started.state = STARTED_STATE
        desc_started = Mock()
        desc_started.raw_description.pending_activities = [pa_started]

        mock_handle = AsyncMock()
        mock_handle.describe.side_effect = [RuntimeError("connection failed"), desc_started]

        queue: asyncio.Queue[Any] = asyncio.Queue()

        with patch(
            "nexus.workflows.workflow_engine.services.activity_sync_service.asyncio.sleep", new_callable=AsyncMock
        ):
            await self.service._schedule_describe_probe(
                handle=mock_handle,
                queue=queue,
                activity_id="my-activity",
                scheduled_event_id=5,
            )

        assert mock_handle.describe.call_count == 2
        item = await queue.get()
        assert isinstance(item, SyntheticActivityStarted)

    @pytest.mark.asyncio
    async def test_stops_on_shutdown(self) -> None:
        """Test that probe stops when service is shutting down."""
        self.service._shutdown = True

        mock_handle = AsyncMock()
        queue: asyncio.Queue[Any] = asyncio.Queue()

        await self.service._schedule_describe_probe(
            handle=mock_handle,
            queue=queue,
            activity_id="my-activity",
            scheduled_event_id=5,
        )

        assert queue.empty()
        mock_handle.describe.assert_not_called()


class TestHistoryEventProducer:
    """Test _history_event_producer streaming into queue."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())

    @pytest.mark.asyncio
    async def test_streams_events_into_queue(self) -> None:
        """Test that history events are pushed into the queue."""
        event1 = Mock()
        event2 = Mock()

        mock_handle = AsyncMock()

        async def mock_fetch(**kwargs: int) -> AsyncIterator[Mock]:
            yield event1
            yield event2

        mock_handle.fetch_history_events = mock_fetch

        queue: asyncio.Queue[Any] = asyncio.Queue()
        await self.service._history_event_producer(mock_handle, queue, uuid4())

        items = []
        while not queue.empty():
            items.append(await queue.get())

        assert items == [event1, event2, None]

    @pytest.mark.asyncio
    async def test_pushes_none_sentinel_on_completion(self) -> None:
        """Test that None sentinel is pushed when history stream ends."""
        mock_handle = AsyncMock()

        async def mock_fetch(**kwargs: int) -> AsyncIterator[Mock]:
            return
            yield

        mock_handle.fetch_history_events = mock_fetch

        queue: asyncio.Queue[Any] = asyncio.Queue()
        await self.service._history_event_producer(mock_handle, queue, uuid4())

        item = await queue.get()
        assert item is None

    @pytest.mark.asyncio
    async def test_pushes_none_sentinel_on_error(self) -> None:
        """Test that None sentinel is pushed even when producer encounters an error."""
        mock_handle = AsyncMock()

        async def mock_fetch(**kwargs: int) -> AsyncIterator[Mock]:
            yield Mock()
            msg = "connection lost"
            raise RuntimeError(msg)

        mock_handle.fetch_history_events = mock_fetch

        queue: asyncio.Queue[Any] = asyncio.Queue()
        await self.service._history_event_producer(mock_handle, queue, uuid4())

        items = []
        while not queue.empty():
            items.append(await queue.get())

        assert len(items) == 2
        assert items[-1] is None

    @pytest.mark.asyncio
    async def test_stops_on_shutdown(self) -> None:
        """Test that producer stops streaming when shutdown is requested."""
        self.service._shutdown = True

        event1 = Mock()
        mock_handle = AsyncMock()

        async def mock_fetch(**kwargs: int) -> AsyncIterator[Mock]:
            yield event1

        mock_handle.fetch_history_events = mock_fetch

        queue: asyncio.Queue[Any] = asyncio.Queue()
        await self.service._history_event_producer(mock_handle, queue, uuid4())

        items = []
        while not queue.empty():
            items.append(await queue.get())

        assert items == [None]


class TestProcessHistoryEvent:
    """Test _process_history_event dispatching logic."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.execution_id = uuid4()
        self.metadata = create_test_metadata(
            execution_id=self.execution_id,
            last_processed_event_id=0,
        )
        self.mock_handle = AsyncMock()
        self.queue: asyncio.Queue[Any] = asyncio.Queue()
        self.probe_tasks: list[asyncio.Task[None]] = []

    def _create_event(self, event_type: int, event_id: int, activity_id: str = "test-activity") -> Mock:
        """Create a mock Temporal history event."""
        event = Mock()
        event.event_type = event_type
        event.event_id = event_id
        event.event_time = datetime.now(UTC)

        attrs = Mock()
        if event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED:
            attrs.activity_id = activity_id
            attrs.start_to_close_timeout = None
            event.activity_task_scheduled_event_attributes = attrs
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs.scheduled_event_id = 1
            attrs.attempt = 1
            attrs.last_failure = None
            event.activity_task_started_event_attributes = attrs
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_COMPLETED:
            attrs.scheduled_event_id = 1
            attrs.result = None
            event.activity_task_completed_event_attributes = attrs

        return event

    @pytest.mark.asyncio
    async def test_skips_already_processed_events(self) -> None:
        """Test that events with IDs <= last_processed are skipped."""
        self.metadata.last_processed_event_id = 10
        event = self._create_event(EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED, event_id=5)

        with patch.object(self.service, "_process_activity_event") as mock_process:
            result = await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert result is True
        mock_process.assert_not_called()

    @pytest.mark.asyncio
    async def test_handles_workflow_started_event(self) -> None:
        """Test that WORKFLOW_EXECUTION_STARTED updates execution to RUNNING."""
        event = self._create_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_STARTED, event_id=1)

        with patch.object(self.service, "_update_execution_to_running", new_callable=AsyncMock) as mock_update:
            result = await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert result is True
        mock_update.assert_called_once_with(self.metadata, event)
        assert self.metadata.last_processed_event_id == 1

    @pytest.mark.asyncio
    async def test_handles_workflow_completion_event(self) -> None:
        """Test that workflow completion events trigger final sync."""
        event = self._create_event(EventType.EVENT_TYPE_WORKFLOW_EXECUTION_COMPLETED, event_id=20)

        with (
            patch.object(self.service, "_update_execution_status_from_event", new_callable=AsyncMock) as mock_status,
            patch.object(self.service, "_sync_skipped_nodes", new_callable=AsyncMock) as mock_skipped,
            patch.object(self.service, "_sync_failed_nodes", new_callable=AsyncMock) as mock_failed,
        ):
            result = await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert result is True
        mock_status.assert_called_once()
        mock_skipped.assert_called_once()
        mock_failed.assert_called_once()
        assert self.metadata.last_processed_event_id == 20

    @pytest.mark.asyncio
    async def test_processes_activity_events(self) -> None:
        """Test that activity events are processed and post-processed."""
        event = self._create_event(EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED, event_id=5)

        with (
            patch.object(self.service, "_process_activity_event") as mock_process,
            patch.object(
                self.service, "_handle_event_post_processing", new_callable=AsyncMock, return_value=5
            ) as mock_post,
        ):
            result = await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert result is True
        mock_process.assert_called_once_with(event, self.metadata)
        mock_post.assert_called_once()
        assert self.metadata.last_processed_event_id == 5

    @pytest.mark.asyncio
    async def test_launches_probe_on_scheduled_event(self) -> None:
        """Test that SCHEDULED events launch a describe probe task."""
        event = self._create_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=10,
            activity_id="my-activity",
        )

        with (
            patch.object(self.service, "_process_activity_event"),
            patch.object(self.service, "_handle_event_post_processing", new_callable=AsyncMock, return_value=10),
            patch.object(self.service, "_schedule_describe_probe", new_callable=AsyncMock) as mock_probe,
        ):
            await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert len(self.probe_tasks) == 1
        # Wait for the task and verify it called the probe
        await self.probe_tasks[0]
        mock_probe.assert_called_once()

    @pytest.mark.asyncio
    async def test_skips_probe_for_internal_activities(self) -> None:
        """Test that __internal__ activities do not launch probes."""
        event = self._create_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=10,
            activity_id="__internal__monitoring",
        )

        with (
            patch.object(self.service, "_process_activity_event"),
            patch.object(self.service, "_handle_event_post_processing", new_callable=AsyncMock, return_value=10),
        ):
            await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        assert len(self.probe_tasks) == 0

    @pytest.mark.asyncio
    async def test_caps_probe_tasks(self) -> None:
        """Test that probe tasks are capped at _DESCRIBE_PROBE_MAX_TASKS."""
        from nexus.workflows.workflow_engine.services.activity_sync_service import _DESCRIBE_PROBE_MAX_TASKS

        # Fill probe_tasks with non-done tasks to hit the cap
        for _ in range(_DESCRIBE_PROBE_MAX_TASKS):
            self.probe_tasks.append(asyncio.create_task(asyncio.sleep(100)))

        event = self._create_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=10,
            activity_id="my-activity",
        )

        with (
            patch.object(self.service, "_process_activity_event"),
            patch.object(self.service, "_handle_event_post_processing", new_callable=AsyncMock, return_value=10),
        ):
            await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        # No new task should have been added
        assert len(self.probe_tasks) == _DESCRIBE_PROBE_MAX_TASKS

        # Cleanup
        for t in self.probe_tasks:
            t.cancel()
        await asyncio.gather(*self.probe_tasks, return_exceptions=True)

    @pytest.mark.asyncio
    async def test_prunes_done_tasks_before_cap_check(self) -> None:
        """Test that completed probe tasks are pruned before checking the cap."""
        from nexus.workflows.workflow_engine.services.activity_sync_service import _DESCRIBE_PROBE_MAX_TASKS

        # Fill with done tasks
        for _ in range(_DESCRIBE_PROBE_MAX_TASKS):
            task = asyncio.create_task(asyncio.sleep(0))
            await task
            self.probe_tasks.append(task)

        event = self._create_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=10,
            activity_id="my-activity",
        )

        with (
            patch.object(self.service, "_process_activity_event"),
            patch.object(self.service, "_handle_event_post_processing", new_callable=AsyncMock, return_value=10),
            patch.object(self.service, "_schedule_describe_probe", new_callable=AsyncMock),
        ):
            await self.service._process_history_event(
                event,
                self.metadata,
                self.mock_handle,
                self.queue,
                self.probe_tasks,
            )

        # Done tasks pruned, new one added
        assert len(self.probe_tasks) == 1


class TestMonitorExecutionIntegration:
    """Integration tests for _monitor_execution queue-based consumer."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.execution_id = uuid4()

    @pytest.mark.asyncio
    async def test_processes_synthetic_started_events(self) -> None:
        """Test that SyntheticActivityStarted events are processed by the consumer."""
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_definitions_map={"my-activity": {"type": "script"}},
            pending_activity_updates={
                5: {
                    "activity_id": "my-activity",
                    "activity_name": "my-activity",
                    "status": ActivityStatus.PENDING,
                    "started_at": None,
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                },
            },
        )

        with (
            patch.object(self.service, "_initialize_monitoring", new_callable=AsyncMock, return_value=metadata),
            patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync,
        ):

            async def mock_producer(handle: Mock, queue: asyncio.Queue[Any], exec_id: UUID) -> None:
                await queue.put(SyntheticActivityStarted(activity_id="my-activity", scheduled_event_id=5))
                await queue.put(None)

            with patch.object(self.service, "_history_event_producer", side_effect=mock_producer):
                await self.service._monitor_execution(
                    self.execution_id,
                    "temporal-wf-id",
                )

            assert metadata.pending_activity_updates[5]["status"] == ActivityStatus.RUNNING
            assert metadata.pending_activity_updates[5]["started_at"] is not None
            mock_sync.assert_called()

    @pytest.mark.asyncio
    async def test_stops_on_shutdown(self) -> None:
        """Test that the consumer stops when shutdown is requested."""
        metadata = create_test_metadata(execution_id=self.execution_id)
        self.service._shutdown = True

        event = Mock()
        event.event_type = EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED
        event.event_id = 5

        with patch.object(self.service, "_initialize_monitoring", new_callable=AsyncMock, return_value=metadata):

            async def mock_producer(handle: Mock, queue: asyncio.Queue[Any], exec_id: UUID) -> None:
                await queue.put(event)
                await queue.put(None)

            with (
                patch.object(self.service, "_history_event_producer", side_effect=mock_producer),
                patch.object(self.service, "_process_history_event", new_callable=AsyncMock) as mock_process,
            ):
                await self.service._monitor_execution(
                    self.execution_id,
                    "temporal-wf-id",
                )

            mock_process.assert_not_called()

    @pytest.mark.asyncio
    async def test_cleans_up_tasks_on_completion(self) -> None:
        """Test that producer and probe tasks are cancelled on normal completion."""
        metadata = create_test_metadata(execution_id=self.execution_id)

        with patch.object(self.service, "_initialize_monitoring", new_callable=AsyncMock, return_value=metadata):

            async def mock_producer(handle: Mock, queue: asyncio.Queue[Any], exec_id: UUID) -> None:
                await queue.put(None)

            with patch.object(self.service, "_history_event_producer", side_effect=mock_producer):
                await self.service._monitor_execution(
                    self.execution_id,
                    "temporal-wf-id",
                )


class TestPendingSyncEventIds:
    """Test pending_sync_event_ids mechanism."""

    def test_scheduled_event_adds_to_pending_sync(self) -> None:
        """Test that SCHEDULED events add to pending_sync_event_ids."""
        mock_client = Mock()
        mock_session_factory = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        metadata = create_test_metadata()
        event = Mock()
        event.event_id = 10
        event.event_type = None
        event.event_time = Mock()
        event.activity_task_scheduled_event_attributes = Mock()
        event.activity_task_scheduled_event_attributes.activity_id = "test_activity"
        event.activity_task_scheduled_event_attributes.start_to_close_timeout = None

        service._process_activity_scheduled(event, metadata)

        assert 10 in metadata.pending_sync_event_ids
        assert metadata.pending_activity_updates[10]["activity_id"] == "test_activity"

    def test_started_event_adds_to_pending_sync(self) -> None:
        """Test that STARTED events add to pending_sync_event_ids."""
        mock_client = Mock()
        mock_session_factory = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        metadata = create_test_metadata(
            pending_activity_updates={
                5: {
                    "activity_id": "test_activity",
                    "activity_name": "test_activity",
                    "status": ActivityStatus.PENDING,
                    "started_at": None,
                    "completed_at": None,
                    "error_details": None,
                    "retry_count": 0,
                }
            }
        )

        event = Mock()
        event.event_id = 11
        event.event_time = Mock()
        event.event_time.ToDatetime = Mock(return_value=datetime.now(UTC))
        event.activity_task_started_event_attributes = Mock()
        event.activity_task_started_event_attributes.scheduled_event_id = 5
        event.activity_task_started_event_attributes.attempt = 1

        service._process_activity_started(event, metadata)

        assert 5 in metadata.pending_sync_event_ids
        assert metadata.pending_activity_updates[5]["status"] == ActivityStatus.RUNNING


class TestUpdatePendingActivitiesToCancelled:
    """Test _update_pending_activities_to_cancelled method."""

    def test_updates_pending_activities_to_cancelled(self) -> None:
        """Test that unfinished activities are updated to CANCELLED."""
        mock_client = Mock()
        mock_session_factory = Mock()
        service = ActivitySyncService(mock_client, mock_session_factory)

        execution_id = uuid4()
        cancelled_at = datetime.now(UTC)

        execution = Execution(
            id=execution_id,
            workflow_id=uuid4(),
            workflow_version_id=uuid4(),
            temporal_workflow_id=f"workflow-{execution_id}",
            status=ExecutionStatus.CANCELLED,
            created_by=uuid4(),
            input_data={},
            labels={},
        )

        pending_activity = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="pending_activity",
            status=ActivityStatus.PENDING,
        )

        running_activity = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="running_activity",
            status=ActivityStatus.RUNNING,
            started_at=datetime.now(UTC),
        )

        completed_activity = ActivityExecution(
            id=uuid4(),
            execution_id=execution_id,
            activity_name="completed_activity",
            status=ActivityStatus.COMPLETED,
            started_at=datetime.now(UTC),
            completed_at=datetime.now(UTC),
        )

        execution.activities = [pending_activity, running_activity, completed_activity]

        updated_activities = service._update_pending_activities_to_cancelled(execution, cancelled_at)

        assert len(updated_activities) == 2
        assert pending_activity.status == ActivityStatus.CANCELLED
        assert pending_activity.completed_at == cancelled_at
        assert pending_activity.error_details == "Workflow was cancelled"

        assert running_activity.status == ActivityStatus.CANCELLED
        assert running_activity.completed_at == cancelled_at

        # Completed activity should not be touched
        assert completed_activity.status == ActivityStatus.COMPLETED


class TestFinalizeNonTerminalActivities:
    """Tests for _finalize_non_terminal_activities."""

    def test_marks_pending_activities_as_skipped(self) -> None:
        execution = Mock(spec=Execution)
        pending_activity = Mock()
        pending_activity.status = ActivityStatus.PENDING
        completed_activity = Mock()
        completed_activity.status = ActivityStatus.COMPLETED
        execution.activities = [pending_activity, completed_activity]

        ActivitySyncService._finalize_non_terminal_activities(execution, uuid4())

        assert pending_activity.status == ActivityStatus.SKIPPED
        assert pending_activity.completed_at is not None
        assert completed_activity.status == ActivityStatus.COMPLETED

    def test_marks_running_activities_as_skipped(self) -> None:
        execution = Mock(spec=Execution)
        running_activity = Mock()
        running_activity.status = ActivityStatus.RUNNING
        execution.activities = [running_activity]

        ActivitySyncService._finalize_non_terminal_activities(execution, uuid4())

        assert running_activity.status == ActivityStatus.SKIPPED

    def test_noop_when_all_terminal(self) -> None:
        execution = Mock(spec=Execution)
        done = Mock()
        done.status = ActivityStatus.COMPLETED
        skipped = Mock()
        skipped.status = ActivityStatus.SKIPPED
        execution.activities = [done, skipped]

        ActivitySyncService._finalize_non_terminal_activities(execution, uuid4())

        assert done.status == ActivityStatus.COMPLETED
        assert skipped.status == ActivityStatus.SKIPPED

    def test_noop_when_no_activities(self) -> None:
        execution = Mock(spec=Execution)
        execution.activities = None
        ActivitySyncService._finalize_non_terminal_activities(execution, uuid4())
