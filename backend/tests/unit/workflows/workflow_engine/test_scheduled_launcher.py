"""Tests for ScheduledExecutionLauncher metadata and metrics.

Covers:
- execution_metadata populated with trigger_type, schedule_id, scheduled_at, triggered_at
- Prometheus metrics recorded on success and failure
- Timing captured from activity.info()
"""

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from nexus.metrics.types import MetricType
from nexus.workflows.exceptions import WorkflowNotPublishedError
from nexus.workflows.workflow_engine.models.workflow_definition import ActivityName
from nexus.workflows.workflow_engine.scheduled_launcher import ScheduledExecutionLauncher


def _make_launcher() -> ScheduledExecutionLauncher:
    """Create a launcher with a mock session factory."""
    session_factory = MagicMock()
    return ScheduledExecutionLauncher(
        session_factory=session_factory,
        task_queue="test-queue",
    )


def _make_mock_activity_info(
    scheduled_time: datetime | None = None,
    started_time: datetime | None = None,
) -> MagicMock:
    """Create a mock activity.info() return value."""
    info = MagicMock()
    info.scheduled_time = scheduled_time or datetime(2024, 1, 1, 9, 0, 0, tzinfo=UTC)
    info.started_time = started_time or datetime(2024, 1, 1, 9, 0, 5, tzinfo=UTC)
    return info


class TestExecutionMetadata:
    """Tests for execution_metadata population."""

    async def test_create_execution_sets_trigger_type(self) -> None:
        """Execution metadata should include trigger_type as ActivityName enum."""
        launcher = _make_launcher()
        workflow_id = uuid4()
        scheduled_at = datetime(2024, 1, 1, 9, 0, 0, tzinfo=UTC)
        triggered_at = datetime(2024, 1, 1, 9, 0, 3, tzinfo=UTC)

        mock_workflow = MagicMock()
        mock_workflow.id = workflow_id
        mock_workflow.project_id = uuid4()
        mock_version = MagicMock()
        mock_version.id = uuid4()
        mock_version.workflow_definition = {
            "schema_version": "2.0.0",
            "triggers": [],
            "nodes": [],
            "edges": [],
        }

        mock_user = MagicMock()
        mock_user.id = uuid4()

        mock_temporal_result = MagicMock()
        mock_temporal_result.execution_id = str(uuid4())
        mock_temporal_result.temporal_workflow_id = "temporal-wf-123"

        with (
            patch.object(launcher, "_load_published_workflow", return_value=(mock_workflow, mock_version)),
            patch.object(launcher, "_get_system_user", return_value=mock_user),
            patch(
                "nexus.workflows.workflow_engine.scheduled_launcher.create_temporal_execution_service"
            ) as mock_create_svc,
        ):
            mock_svc = AsyncMock()
            mock_svc.start_workflow.return_value = mock_temporal_result
            mock_create_svc.return_value = mock_svc

            mock_session = AsyncMock()
            launcher._session_factory = MagicMock()
            launcher._session_factory.return_value.__aenter__ = AsyncMock(return_value=mock_session)
            launcher._session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            result = await launcher._create_execution(workflow_id, "trigger_1", scheduled_at, triggered_at)

        # Verify execution was added to session
        mock_session.add.assert_called_once()
        execution = mock_session.add.call_args[0][0]

        # Verify execution_metadata
        metadata = execution.execution_metadata
        assert metadata is not None
        assert metadata["trigger_type"] == ActivityName.SCHEDULED_TRIGGER
        assert metadata["schedule_id"] == f"nexus-sched-{workflow_id}-trigger_1"
        assert metadata["scheduled_at"] == scheduled_at.isoformat()
        assert metadata["triggered_at"] == triggered_at.isoformat()

        assert result["execution_id"] is not None
        assert result["temporal_workflow_id"] == "temporal-wf-123"


class TestMetricsRecording:
    """Tests for Prometheus metrics recording."""

    async def test_records_success_metrics(self) -> None:
        """Should record SCHEDULED_TRIGGER_FIRES and SCHEDULED_TRIGGER_LATENCY on success."""
        launcher = _make_launcher()
        workflow_id_str = str(uuid4())
        scheduled_at = datetime(2024, 1, 1, 9, 0, 0, tzinfo=UTC)
        triggered_at = scheduled_at + timedelta(seconds=5)

        mock_info = _make_mock_activity_info(scheduled_at, triggered_at)
        mock_recorder = MagicMock()

        with (
            patch("nexus.workflows.workflow_engine.scheduled_launcher.activity") as mock_activity,
            patch(
                "nexus.workflows.workflow_engine.scheduled_launcher.get_metrics_recorder", return_value=mock_recorder
            ),
            patch.object(launcher, "_create_execution", new_callable=AsyncMock) as mock_create,
        ):
            mock_activity.info.return_value = mock_info
            mock_create.return_value = {"execution_id": "exec-1", "temporal_workflow_id": "tw-1"}

            launcher._session_factory = MagicMock()
            launcher._session_factory.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            launcher._session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            await launcher.run(workflow_id_str, "trigger_1")

        calls = mock_recorder.record.call_args_list
        assert len(calls) == 2

        fires_call = calls[0]
        assert fires_call[0][0] == MetricType.SCHEDULED_TRIGGER_FIRES
        assert fires_call[1]["labels"]["status"] == "success"

        latency_call = calls[1]
        assert latency_call[0][0] == MetricType.SCHEDULED_TRIGGER_LATENCY
        assert latency_call[1]["value"] == pytest.approx(5000.0)

    async def test_records_error_metrics_on_failure(self) -> None:
        """Should record SCHEDULED_TRIGGER_FIRES with status=error on failure."""
        launcher = _make_launcher()
        workflow_id_str = str(uuid4())
        scheduled_at = datetime(2024, 1, 1, 9, 0, 0, tzinfo=UTC)
        triggered_at = scheduled_at + timedelta(seconds=2)

        mock_info = _make_mock_activity_info(scheduled_at, triggered_at)
        mock_recorder = MagicMock()

        with (
            patch("nexus.workflows.workflow_engine.scheduled_launcher.activity") as mock_activity,
            patch(
                "nexus.workflows.workflow_engine.scheduled_launcher.get_metrics_recorder", return_value=mock_recorder
            ),
            patch.object(launcher, "_create_execution", new_callable=AsyncMock) as mock_create,
        ):
            mock_activity.info.return_value = mock_info
            mock_create.side_effect = RuntimeError("Workflow not published")

            launcher._session_factory = MagicMock()
            launcher._session_factory.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            launcher._session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(RuntimeError, match="Workflow not published"):
                await launcher.run(workflow_id_str, "trigger_1")

        calls = mock_recorder.record.call_args_list
        assert len(calls) == 1
        error_call = calls[0]
        assert error_call[0][0] == MetricType.SCHEDULED_TRIGGER_FIRES
        assert error_call[1]["labels"]["status"] == "error"

    async def test_metrics_error_does_not_swallow_original_exception(self) -> None:
        """If recorder.record() fails on the error path, the original exception should still propagate."""
        launcher = _make_launcher()
        workflow_id_str = str(uuid4())
        scheduled_at = datetime(2024, 1, 1, 9, 0, 0, tzinfo=UTC)
        triggered_at = scheduled_at + timedelta(seconds=2)

        mock_info = _make_mock_activity_info(scheduled_at, triggered_at)
        mock_recorder = MagicMock()
        mock_recorder.record.side_effect = RuntimeError("metrics broken")

        with (
            patch("nexus.workflows.workflow_engine.scheduled_launcher.activity") as mock_activity,
            patch(
                "nexus.workflows.workflow_engine.scheduled_launcher.get_metrics_recorder", return_value=mock_recorder
            ),
            patch.object(launcher, "_create_execution", new_callable=AsyncMock) as mock_create,
        ):
            mock_activity.info.return_value = mock_info
            mock_create.side_effect = ValueError("workflow not found")

            launcher._session_factory = MagicMock()
            launcher._session_factory.return_value.__aenter__ = AsyncMock(return_value=AsyncMock())
            launcher._session_factory.return_value.__aexit__ = AsyncMock(return_value=False)

            with pytest.raises(ValueError, match="workflow not found"):
                await launcher.run(workflow_id_str, "trigger_1")


class TestLoadPublishedWorkflow:
    """Tests for _load_published_workflow static method."""

    async def test_returns_workflow_and_version(self) -> None:
        """Should return (Workflow, WorkflowVersion) tuple when found."""
        mock_workflow = MagicMock()
        mock_version = MagicMock()

        mock_result = MagicMock()
        mock_result.first.return_value = (mock_workflow, mock_version)

        session = AsyncMock()
        session.exec.return_value = mock_result

        wf, ver = await ScheduledExecutionLauncher._load_published_workflow(session, uuid4())
        assert wf is mock_workflow
        assert ver is mock_version

    async def test_raises_when_not_found(self) -> None:
        """Should raise WorkflowNotPublishedError when workflow is missing, deleted, or disabled."""
        mock_result = MagicMock()
        mock_result.first.return_value = None

        session = AsyncMock()
        session.exec.return_value = mock_result

        with pytest.raises(WorkflowNotPublishedError):
            await ScheduledExecutionLauncher._load_published_workflow(session, uuid4())


class TestGetSystemUser:
    """Tests for _get_system_user static method."""

    async def test_returns_user_when_found(self) -> None:
        """Should return the system user from settings."""
        mock_user = MagicMock()
        session = AsyncMock()
        session.get.return_value = mock_user

        with patch("nexus.workflows.workflow_engine.scheduled_launcher.get_settings") as mock_settings:
            mock_settings.return_value.system_user_id = uuid4()
            user = await ScheduledExecutionLauncher._get_system_user(session)

        assert user is mock_user

    async def test_raises_when_not_found(self) -> None:
        """Should raise RuntimeError with guidance when system user is missing."""
        session = AsyncMock()
        session.get.return_value = None

        with patch("nexus.workflows.workflow_engine.scheduled_launcher.get_settings") as mock_settings:
            mock_settings.return_value.system_user_id = uuid4()
            with pytest.raises(RuntimeError, match=r"System user .* not found"):
                await ScheduledExecutionLauncher._get_system_user(session)
