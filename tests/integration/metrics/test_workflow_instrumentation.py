"""Integration tests for workflow metrics instrumentation (FR-014 to FR-017).

Uses real database fixtures to validate that ``ExecutionService`` emits the
expected metrics records when encountering terminal executions.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from prometheus_client import CollectorRegistry

from nexus.core.models import User
from nexus.metrics.emission import reset_emission_trackers
from nexus.metrics.recorder import MetricsRecorder
from nexus.metrics.types import MetricType
from nexus.workflows.models.activity_execution import ActivityStatus
from nexus.workflows.models.execution import Execution, ExecutionStatus
from nexus.workflows.services.execution_service import ExecutionService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from tests.helpers.workflow import ActivitiesFactory, ExecutionsFactory

PATCH_TARGET = "nexus.workflows.services.execution_service.get_metrics_recorder"


@pytest.fixture
def recorder() -> MetricsRecorder:
    """Fresh MetricsRecorder with an isolated Prometheus registry."""
    return MetricsRecorder(
        retention_seconds=3600,
        max_records=10_000,
        prometheus_registry=CollectorRegistry(),
    )


@pytest_asyncio.fixture
async def completed_execution(
    executions_factory: ExecutionsFactory,
    test_db_session: AsyncSession,
) -> Execution:
    """A single COMPLETED execution with ``completed_at`` set."""
    execs = await executions_factory.create_executions(count=1, status=ExecutionStatus.COMPLETED)
    execution = execs[0]
    execution.completed_at = datetime.now(UTC)
    test_db_session.add(execution)
    await test_db_session.commit()
    await test_db_session.refresh(execution)
    return execution


@pytest_asyncio.fixture
async def failed_execution(
    executions_factory: ExecutionsFactory,
    test_db_session: AsyncSession,
) -> Execution:
    """A single FAILED execution with ``completed_at`` set."""
    execs = await executions_factory.create_executions(count=1, status=ExecutionStatus.FAILED)
    execution = execs[0]
    execution.completed_at = datetime.now(UTC)
    test_db_session.add(execution)
    await test_db_session.commit()
    await test_db_session.refresh(execution)
    return execution


def _make_service(session: AsyncSession) -> ExecutionService:
    user = MagicMock(spec=User)
    return ExecutionService(session, user, temporal_service=None)


# =============================================================================
# Workflow completion metrics
# =============================================================================


class TestWorkflowCompletionMetrics:
    """Tests for workflow-level metrics emitted by _emit_completion_metrics."""

    def setup_method(self) -> None:
        reset_emission_trackers()

    @pytest.mark.asyncio
    async def test_records_duration_with_workflow_type(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        test_db_session: AsyncSession,
    ) -> None:
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        results = list(recorder.query(metric_types={MetricType.WORKFLOW_DURATION}))
        assert len(results) == 1
        assert results[0].labels["status"] == "completed"
        assert results[0].labels["workflow_type"] == "test-workflow"
        assert results[0].labels["execution_id"] == str(completed_execution.id)
        assert results[0].value > 0

    @pytest.mark.asyncio
    async def test_records_status_for_failed_execution(
        self,
        recorder: MetricsRecorder,
        failed_execution: Execution,
        test_db_session: AsyncSession,
    ) -> None:
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(failed_execution)

        results = list(recorder.query(metric_types={MetricType.WORKFLOW_STATUS}))
        assert len(results) == 1
        assert results[0].labels["status"] == "failed"

    @pytest.mark.asyncio
    async def test_skips_non_terminal_execution(
        self,
        recorder: MetricsRecorder,
        executions_factory: ExecutionsFactory,
        test_db_session: AsyncSession,
    ) -> None:
        execs = await executions_factory.create_executions(count=1, status=ExecutionStatus.RUNNING)
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(execs[0])

        assert len(list(recorder.query(metric_types={MetricType.WORKFLOW_DURATION}))) == 0

    @pytest.mark.asyncio
    async def test_idempotent_emission(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        test_db_session: AsyncSession,
    ) -> None:
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)
            await service._emit_completion_metrics(completed_execution)

        assert len(list(recorder.query(metric_types={MetricType.WORKFLOW_DURATION}))) == 1

    @pytest.mark.asyncio
    async def test_decrements_active_workflows_gauge(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        test_db_session: AsyncSession,
    ) -> None:
        recorder.increment("active_workflows", 3)
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        assert recorder.get_summary().active_workflows == 2

    @pytest.mark.asyncio
    async def test_observes_prometheus_histogram(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        test_db_session: AsyncSession,
    ) -> None:
        service = _make_service(test_db_session)

        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        assert recorder.prometheus.workflow_duration_seconds._sum.get() > 0


# =============================================================================
# Per-activity duration metrics
# =============================================================================


class TestActivityDurationMetrics:
    """Tests for activity-level metrics emitted alongside workflow completion."""

    def setup_method(self) -> None:
        reset_emission_trackers()

    @pytest.mark.asyncio
    async def test_records_durations_with_workflow_type(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        activities_factory: ActivitiesFactory,
        test_db_session: AsyncSession,
    ) -> None:
        await activities_factory.create_activities(completed_execution, ["step-one", "step-two"], duration_seconds=2.0)

        service = _make_service(test_db_session)
        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        results = list(recorder.query(metric_types={MetricType.ACTIVITY_DURATION}))
        assert len(results) == 2
        names = {r.labels["activity_name"] for r in results}
        assert names == {"step-one", "step-two"}
        for r in results:
            assert r.labels["workflow_type"] == "test-workflow"

    @pytest.mark.asyncio
    async def test_skips_running_activities(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        activities_factory: ActivitiesFactory,
        test_db_session: AsyncSession,
    ) -> None:
        await activities_factory.create_activities(completed_execution, ["in-progress"], status=ActivityStatus.RUNNING)

        service = _make_service(test_db_session)
        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        assert len(list(recorder.query(metric_types={MetricType.ACTIVITY_DURATION}))) == 0

    @pytest.mark.asyncio
    async def test_idempotent_activity_emission(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        activities_factory: ActivitiesFactory,
        test_db_session: AsyncSession,
    ) -> None:
        await activities_factory.create_activities(completed_execution, ["step-one"])

        service = _make_service(test_db_session)
        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)
            await service._emit_completion_metrics(completed_execution)

        assert len(list(recorder.query(metric_types={MetricType.ACTIVITY_DURATION}))) == 1

    @pytest.mark.asyncio
    async def test_observes_prometheus_histogram(
        self,
        recorder: MetricsRecorder,
        completed_execution: Execution,
        activities_factory: ActivitiesFactory,
        test_db_session: AsyncSession,
    ) -> None:
        await activities_factory.create_activities(completed_execution, ["say_hello"], duration_seconds=1.5)

        service = _make_service(test_db_session)
        with patch(PATCH_TARGET, return_value=recorder):
            await service._emit_completion_metrics(completed_execution)

        assert recorder.prometheus.activity_duration_seconds._sum.get() > 0
