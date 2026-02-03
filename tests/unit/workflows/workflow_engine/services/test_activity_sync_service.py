"""Unit tests for ActivitySyncService."""

import asyncio
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from temporalio.api.enums.v1 import EventType

from nexus.workflows.models.activity_execution import ActivityStatus
from nexus.workflows.models.execution import Execution
from nexus.workflows.workflow_engine.activities.internal import register_activity_monitoring
from nexus.workflows.workflow_engine.services.activity_sync_service import (
    ActivitySyncService,
    ExecutionMonitorMetadata,
)


def create_test_metadata(
    execution_id: UUID | None = None,
    last_processed_event_id: int = 0,
    activity_definitions_map: dict[str, dict[str, Any]] | None = None,
    branch_head_map: dict[str, dict[str, Any]] | None = None,
    activity_index_map: dict[str, int] | None = None,
    pending_activity_updates: dict[int, dict[str, Any]] | None = None,
    conditions_handled: set[str] | None = None,
) -> ExecutionMonitorMetadata:
    """Create ExecutionMonitorMetadata for testing with sensible defaults."""
    return ExecutionMonitorMetadata(
        execution_id=execution_id or uuid4(),
        last_processed_event_id=last_processed_event_id,
        activity_definitions_map=activity_definitions_map or {},
        branch_head_map=branch_head_map or {},
        activity_index_map=activity_index_map or {},
        pending_activity_updates=pending_activity_updates or {},
        conditions_handled=conditions_handled or set(),
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

        async def long_running_monitor(exec_id, workflow_id) -> None:
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
                UUID(execution_id), temporal_workflow_id
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
            event.activity_task_scheduled_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id
            attrs.attempt = attempt
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
            event.activity_task_scheduled_event_attributes = attrs

        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED:
            attrs = Mock()
            attrs.scheduled_event_id = scheduled_event_id or 1
            attrs.attempt = 1
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
    async def test_condition_branch_skipping_called_for_started_event(self) -> None:
        """Test that STARTED events trigger condition branch skipping logic."""
        event = self._create_mock_event(EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED, event_id=2, scheduled_event_id=1)

        with (
            patch.object(self.service, "_handle_condition_branch_skipping", new_callable=AsyncMock) as mock_branch_skip,
            patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock),
        ):
            await self.service._handle_event_post_processing(
                event,
                self.metadata,
                self.mock_handle,
            )

            mock_branch_skip.assert_called_once_with(
                self.metadata,
                "test-activity",
            )

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
        """Test extraction raises ValueError for non-completion events."""
        # Use an activity event instead of a workflow event
        event = self._create_workflow_event(EventType.EVENT_TYPE_ACTIVITY_TASK_STARTED)

        with pytest.raises(ValueError, match="is not a workflow completion event"):
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


class TestMarkActivitiesSkipped:
    """Test _mark_activities_skipped method with patch publishing."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.mock_session_factory = Mock()
        self.mock_activity_publisher = Mock()
        self.service = ActivitySyncService(Mock(), self.mock_session_factory, self.mock_activity_publisher)
        self.execution_id = uuid4()

    def _create_mock_activity(self, name: str, status: ActivityStatus) -> Mock:
        """Create a mock activity with common fields."""
        activity = Mock()
        activity.activity_name = name
        activity.status = status
        activity.started_at = None
        activity.completed_at = None
        activity.error_details = None
        return activity

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("num_activities", "should_publish"),
        [
            (2, True),  # Multiple activities - should publish
            (1, True),  # Single activity - should publish
            (0, False),  # No activities - should not publish
        ],
    )
    async def test_mark_activities_skipped_publishes_patches(self, num_activities: int, should_publish: bool) -> None:  # noqa: FBT001
        """Test that marking activities as SKIPPED publishes patches to Valkey."""
        # Create mock activities
        activities = [
            self._create_mock_activity(f"activity-{i}", ActivityStatus.PENDING) for i in range(num_activities)
        ]

        # Mock database query
        mock_result = Mock()
        mock_result.all.return_value = activities
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        # Create mock session factory
        mock_factory = Mock(return_value=mock_session)
        service = ActivitySyncService(Mock(), mock_factory, self.mock_activity_publisher)

        activity_index_map = {f"activity-{i}": i for i in range(max(num_activities, 1))}

        # Create metadata
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map=activity_index_map,
        )

        with patch.object(service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await service._mark_activities_skipped(metadata, [f"activity-{i}" for i in range(num_activities)])

            # Verify status changes
            for activity in activities:
                assert activity.status == ActivityStatus.SKIPPED

            # Verify publishing behavior
            if should_publish:
                mock_publish.assert_awaited_once()
                call_args = mock_publish.call_args[0]
                assert call_args[0].execution_id == self.execution_id
                assert len(call_args[1]) == num_activities
            else:
                mock_publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_mark_activities_skipped_handles_empty_list(self) -> None:
        """Test that marking an empty list of activities is a no-op."""
        mock_factory = Mock()
        service = ActivitySyncService(Mock(), mock_factory, self.mock_activity_publisher)

        # Create metadata
        metadata = create_test_metadata(execution_id=self.execution_id)

        with patch.object(service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await service._mark_activities_skipped(metadata, [])

            mock_factory.assert_not_called()
            mock_publish.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_mark_activities_skipped_stores_old_values_for_patches(self) -> None:
        """Test that old values are captured correctly for patch generation."""
        activity = self._create_mock_activity("activity-1", ActivityStatus.PENDING)

        mock_result = Mock()
        mock_result.all.return_value = [activity]
        mock_session = Mock()
        mock_session.exec = AsyncMock(return_value=mock_result)
        mock_session.commit = AsyncMock()
        mock_session.rollback = AsyncMock()
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=None)

        mock_factory = Mock(return_value=mock_session)
        service = ActivitySyncService(Mock(), mock_factory, self.mock_activity_publisher)

        activity_index_map = {"activity-1": 0}

        # Create metadata
        metadata = create_test_metadata(
            execution_id=self.execution_id,
            activity_index_map=activity_index_map,
        )

        with patch.object(service, "_publish_activity_patches", new_callable=AsyncMock) as mock_publish:
            await service._mark_activities_skipped(metadata, ["activity-1"])

            # Verify old values were captured
            updated_activities = mock_publish.call_args[0][1]
            assert len(updated_activities) == 1
            assert updated_activities[0][0] == activity
            assert updated_activities[0][1]["status"] == ActivityStatus.PENDING
            assert updated_activities[0][1]["started_at"] is None
            assert updated_activities[0][1]["completed_at"] is None
            assert updated_activities[0][1]["error_details"] is None
