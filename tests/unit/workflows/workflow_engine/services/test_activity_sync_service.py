"""Unit tests for ActivitySyncService."""

import asyncio
from datetime import UTC, datetime
from unittest.mock import AsyncMock, Mock, patch
from uuid import UUID, uuid4

import pytest
from temporalio.api.enums.v1 import EventType

from nexus.workflows.models.activity_execution import ActivityStatus
from nexus.workflows.models.execution import Execution
from nexus.workflows.workflow_engine.activities.internal import register_activity_monitoring
from nexus.workflows.workflow_engine.services.activity_sync_service import ActivitySyncService


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
        self.temp_map: dict[int, dict[str, object]] = {}

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

        self.service._process_activity_scheduled(event, self.temp_map)

        assert 1 in self.temp_map
        assert self.temp_map[1]["activity_id"] == "my-activity"
        assert self.temp_map[1]["status"] == ActivityStatus.PENDING
        assert self.temp_map[1]["started_at"] is None
        assert self.temp_map[1]["completed_at"] is None
        assert self.temp_map[1]["error_details"] is None
        assert self.temp_map[1]["retry_count"] == 0

    def test_process_activity_scheduled_skips_internal_activities(self) -> None:
        """Test processing ACTIVITY_TASK_SCHEDULED skips internal activities."""
        event = self._create_mock_event(
            EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED,
            event_id=1,
            activity_id="__internal__register_monitoring",
        )

        self.service._process_activity_scheduled(event, self.temp_map)

        assert 1 not in self.temp_map

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
        self.temp_map[1] = {
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

        self.service._process_activity_started(event, self.temp_map)

        assert self.temp_map[1]["status"] == expected_status
        assert self.temp_map[1]["started_at"] is not None
        assert self.temp_map[1]["retry_count"] == expected_retry_count

    @pytest.mark.parametrize(
        ("failure_message", "expected_error"),
        [
            ("Connection timeout", "Connection timeout"),
            (None, None),
        ],
    )
    def test_process_activity_failed(self, failure_message: str | None, expected_error: str | None) -> None:
        """Test processing ACTIVITY_TASK_FAILED event sets status to FAILED."""
        self.temp_map[1] = {
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

        self.service._process_activity_failed(event, self.temp_map)

        assert self.temp_map[1]["status"] == ActivityStatus.FAILED
        assert self.temp_map[1]["completed_at"] is not None
        assert self.temp_map[1]["error_details"] == expected_error

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
        self.temp_map[1] = {
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
            self.service._process_activity_completed(event, self.temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_TIMED_OUT:
            self.service._process_activity_timed_out(event, self.temp_map)
        elif event_type == EventType.EVENT_TYPE_ACTIVITY_TASK_CANCELED:
            self.service._process_activity_canceled(event, self.temp_map)

        assert self.temp_map[1]["status"] == expected_status
        assert self.temp_map[1]["completed_at"] is not None
        if expected_error:
            assert self.temp_map[1]["error_details"] == expected_error

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
            temp_map: dict[int, dict[str, object]] = {}
            event = self._create_mock_event(event_type, event_id=1, scheduled_event_id=1)

            with patch.object(self.service, handler_name) as mock_handler:
                self.service._process_activity_event(event, temp_map)
                mock_handler.assert_called_once_with(event, temp_map)


class TestHandleEventPostProcessing:
    """Test _handle_event_post_processing sync trigger logic."""

    def setup_method(self) -> None:
        """Set up test fixtures."""
        self.service = ActivitySyncService(Mock(), Mock())
        self.execution_id = uuid4()
        self.temp_map: dict[int, dict[str, object]] = {
            1: {
                "activity_id": "test-activity",
                "status": ActivityStatus.RUNNING,
            }
        }
        self.branch_head_map: dict[str, dict[str, object]] = {}
        self.conditions_handled: set[str] = set()
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
                self.execution_id,
                self.temp_map,
                self.branch_head_map,
                self.conditions_handled,
                self.mock_handle,
            )

            mock_sync.assert_called_once_with(
                self.execution_id,
                self.temp_map,
                self.mock_handle,
                event.event_id,
            )
            assert result == event.event_id

    @pytest.mark.asyncio
    async def test_sync_not_triggered_for_scheduled_event(self) -> None:
        """Test that SCHEDULED events do NOT trigger database sync."""
        event = self._create_mock_event(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, event_id=5)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            result = await self.service._handle_event_post_processing(
                event,
                self.execution_id,
                self.temp_map,
                self.branch_head_map,
                self.conditions_handled,
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
                self.execution_id,
                self.temp_map,
                self.branch_head_map,
                self.conditions_handled,
                self.mock_handle,
            )

            mock_branch_skip.assert_called_once_with(
                self.execution_id,
                "test-activity",
                self.branch_head_map,
                self.conditions_handled,
            )

    @pytest.mark.asyncio
    async def test_no_modulo_based_sync(self) -> None:
        """Test that events at multiples of 10 do NOT automatically trigger sync (modulo check removed)."""
        # Create a non-sync event (SCHEDULED) at event_id 10 (multiple of 10)
        event = self._create_mock_event(EventType.EVENT_TYPE_ACTIVITY_TASK_SCHEDULED, event_id=10)

        with patch.object(self.service, "_sync_activities_to_db", new_callable=AsyncMock) as mock_sync:
            result = await self.service._handle_event_post_processing(
                event,
                self.execution_id,
                self.temp_map,
                self.branch_head_map,
                self.conditions_handled,
                self.mock_handle,
            )

            # Should NOT sync just because event_id is 10
            mock_sync.assert_not_called()
            assert result is None
