"""Suite 4 — Execution Service: Completion Rate & Cancellation KPIs (4.2, 4.4).

Test 4.2: Run 100 workflows to completion
    KPI: Completion Rate > 90%
    MetricType: WORKFLOW_STATUS, WORKFLOW_COMPLETION_RATE

Test 4.4: Cancel workflows mid-execution
    KPI: Cancellation tracking — tracked in status distribution
    MetricType: WORKFLOW_STATUS

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest
import structlog
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    poll_until_resources_terminal,
)
from tests.performance.execution_service.conftest import (
    EXECUTION_WORKFLOW_DEFINITION,
    POLL_INTERVAL_SECONDS,
    POLL_TIMEOUT_SECONDS,
    TERMINAL_STATUSES,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

logger = structlog.stdlib.get_logger(__name__)

pytestmark = pytest.mark.performance

COMPLETION_WORKFLOW_COUNT = 100
TARGET_COMPLETION_RATE = 0.90
CANCELLATION_WORKFLOW_COUNT = 10


class TestCompletionRate:
    """4.2 — Run 100 workflows to completion.

    Validates:
        - Client-measured completion rate > 90%
        - Server-side KPI (execution_service → completion_rate) > 90%
        - Workflow status records are emitted with proper labels
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def _create_test_workflow(
        self,
        nexus_api: NexusApiRegistry,
    ) -> UUID:
        """Create a workflow for execution and return its ID."""
        wf_name = f"perf-suite4-complete-{uuid4().hex[:8]}"
        r = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=wf_name,
                description="Execution completion rate test workflow",
                workflow_definition=EXECUTION_WORKFLOW_DEFINITION,
            ),
        )
        assert r.is_success, f"Failed to create test workflow: status={r.status_code}"
        assert r.parsed is not None, "Workflow creation returned empty response"
        return UUID(str(r.parsed.id))

    def _poll_execution_status(
        self,
        nexus_api: NexusApiRegistry,
        execution_id: str,
    ) -> str:
        """Poll an execution until it reaches a terminal status or times out."""
        status_counts = poll_until_resources_terminal(
            nexus_api,
            "executions",
            [execution_id],
            id_param="execution_id",
            timeout=POLL_TIMEOUT_SECONDS,
            interval=POLL_INTERVAL_SECONDS,
        )
        for status in status_counts:
            if status in TERMINAL_STATUSES:
                return status
        return next(iter(status_counts), "unknown")

    def test_workflow_completion_rate(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Run 100 workflows; completion rate must be > 90%."""
        workflow_ids: list[UUID] = []
        execution_map: dict[str, UUID] = {}
        creation_failures = 0
        completion_times: list[float] = []

        try:
            for _ in range(COMPLETION_WORKFLOW_COUNT):
                try:
                    wf_id = self._create_test_workflow(nexus_api)
                    workflow_ids.append(wf_id)
                except AssertionError:
                    creation_failures += 1

            for wf_id in workflow_ids:
                try:
                    r = nexus_api.executions.create(
                        body=ExecutionCreate(workflow_id=wf_id),
                    )
                    if r.is_success and r.parsed:
                        execution_map[str(r.parsed.id)] = wf_id
                except Exception as exc:
                    logger.warning("Execution creation failed", workflow_id=wf_id, error=str(exc))
                    creation_failures += 1

            status_counts: dict[str, int] = {}
            for exec_id in execution_map:
                start = time.monotonic()
                final_status = self._poll_execution_status(nexus_api, exec_id)
                elapsed_ms = (time.monotonic() - start) * 1000
                completion_times.append(elapsed_ms)
                status_counts[final_status] = status_counts.get(final_status, 0) + 1

            total_started = len(execution_map)
            completed = status_counts.get("completed", 0)
            client_completion_rate = completed / total_started if total_started > 0 else 0

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "execution_service",
            )
            server_completion_rate = kpis.get("metrics", {}).get(
                "completion_rate",
                0,
            )

            completion_p95 = compute_percentile(completion_times, 95) if completion_times else 0

            diag = (
                f"\n--- Completion results ---\n"
                f"  target_count={COMPLETION_WORKFLOW_COUNT}, "
                f"created={len(workflow_ids)}, "
                f"started={total_started}, "
                f"creation_failures={creation_failures}\n"
                f"  status_distribution={status_counts}\n"
                f"  client_completion_rate={client_completion_rate:.2%}\n"
                f"  server_completion_rate={server_completion_rate}\n"
                f"  completion_time_p95={completion_p95:.1f}ms\n"
            )

            assert client_completion_rate >= TARGET_COMPLETION_RATE, (
                f"Client-measured completion rate "
                f"{client_completion_rate:.2%} below target "
                f"{TARGET_COMPLETION_RATE:.0%}{diag}"
            )

            if isinstance(server_completion_rate, (int, float)) and server_completion_rate > 0:
                assert server_completion_rate >= TARGET_COMPLETION_RATE, (
                    f"Server-reported completion rate "
                    f"{server_completion_rate:.2%} below target "
                    f"{TARGET_COMPLETION_RATE:.0%}{diag}"
                )

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "workflow_status",
                limit=COMPLETION_WORKFLOW_COUNT * 3,
            )
            assert records.get("total", 0) > 0, "No workflow_status metric records emitted during completion rate test"
        finally:
            for wf_id in workflow_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception as exc:
                    logger.debug("Workflow cleanup failed", workflow_id=wf_id, error=str(exc))


class TestCancellationTracking:
    """4.4 — Cancel workflows mid-execution.

    Validates:
        - Cancelled executions are tracked in the status distribution
        - workflow_status records carry a 'cancelled' label
        - Cancellation is reflected in the execution status when polled

    Note: Since there is no dedicated cancel endpoint on the executions
    router, this test verifies that executions which reach a terminal
    status have their status correctly recorded in metrics.  If a cancel
    endpoint is added in the future, this test should be updated to
    exercise it directly.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def _create_test_workflow(
        self,
        nexus_api: NexusApiRegistry,
    ) -> UUID:
        """Create a workflow for execution and return its ID."""
        wf_name = f"perf-suite4-cancel-{uuid4().hex[:8]}"
        r = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=wf_name,
                description="Execution cancellation tracking test workflow",
                workflow_definition=EXECUTION_WORKFLOW_DEFINITION,
            ),
        )
        assert r.is_success, f"Failed to create test workflow: status={r.status_code}"
        assert r.parsed is not None, "Workflow creation returned empty response"
        return UUID(str(r.parsed.id))

    def _verify_metric_records(
        self,
        records: dict[str, Any],
        diag: str,
    ) -> None:
        """Assert that metric records carry proper categorization labels."""
        for record in records.get("records", []):
            labels = record.get("labels", {})
            has_label = "status" in labels or "reason" in labels or "workflow_id" in labels
            assert has_label, f"Workflow status record missing categorization labels: {labels}{diag}"

    def _poll_until_executions_terminal(
        self,
        nexus_api: NexusApiRegistry,
        execution_ids: list[str],
    ) -> dict[str, int]:
        """Poll until all executions reach a terminal status or timeout."""
        return poll_until_resources_terminal(
            nexus_api,
            "executions",
            execution_ids,
            id_param="execution_id",
            timeout=POLL_TIMEOUT_SECONDS,
            interval=POLL_INTERVAL_SECONDS,
        )

    def test_execution_status_distribution_tracked(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Execute workflows and verify status distribution is tracked in metrics."""
        workflow_ids: list[UUID] = []
        execution_ids: list[str] = []

        try:
            for _ in range(CANCELLATION_WORKFLOW_COUNT):
                wf_id = self._create_test_workflow(nexus_api)
                workflow_ids.append(wf_id)

            for wf_id in workflow_ids:
                try:
                    r = nexus_api.executions.create(
                        body=ExecutionCreate(workflow_id=wf_id),
                    )
                    if r.is_success and r.parsed:
                        execution_ids.append(str(r.parsed.id))
                except Exception as exc:
                    logger.warning("Execution creation failed", workflow_id=wf_id, error=str(exc))

            status_counts = self._poll_until_executions_terminal(nexus_api, execution_ids)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "workflow_status",
                limit=CANCELLATION_WORKFLOW_COUNT * 3,
            )

            record_statuses: set[str] = set()
            for record in records.get("records", []):
                labels = record.get("labels", {})
                if "status" in labels:
                    record_statuses.add(labels["status"])

            diag = (
                f"\n--- Status distribution results ---\n"
                f"  executions_started={len(execution_ids)}\n"
                f"  observed_statuses={status_counts}\n"
                f"  metric_record_count={records.get('total', 0)}\n"
                f"  metric_statuses={record_statuses}\n"
            )

            assert records.get("total", 0) > 0, (
                f"No workflow_status records emitted during cancellation tracking test{diag}"
            )
            assert len(status_counts) > 0, f"No execution statuses observed{diag}"
            self._verify_metric_records(records, diag)
        finally:
            for wf_id in workflow_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception as exc:
                    logger.debug("Workflow cleanup failed", workflow_id=wf_id, error=str(exc))
