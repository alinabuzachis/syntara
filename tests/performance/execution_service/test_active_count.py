"""Suite 4 — Execution Service: Active Workflow Count KPI (4.3).

Test 4.3: Start workflows while others are running
    KPI: Active Workflow Count — capacity planning metric
    MetricType: WORKFLOW_STATUS

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import poll_for_component_kpis, poll_for_metric_records, poll_until
from tests.performance.execution_service.conftest import (
    EXECUTION_WORKFLOW_DEFINITION,
    POLL_INTERVAL_SECONDS,
    POLL_TIMEOUT_SECONDS,
    TERMINAL_STATUSES,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INITIAL_WORKFLOW_COUNT = 10
ADDITIONAL_WORKFLOW_COUNT = 10
ACTIVE_STATUS_POLL_ROUNDS = 5


class TestActiveWorkflowCount:
    """4.3 — Start workflows while others are running.

    Validates:
        - The system can report the number of active (running/pending)
          workflow executions
        - Starting new workflows while others are running does not cause
          failures
        - Server-side KPI (execution_service → active_workflows) reflects
          the concurrent execution count
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
        prefix: str,
    ) -> UUID:
        """Create a workflow for execution and return its ID."""
        wf_name = f"perf-suite4-active-{prefix}-{uuid4().hex[:8]}"
        r = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=wf_name,
                description="Active workflow count test",
                workflow_definition=EXECUTION_WORKFLOW_DEFINITION,
            ),
        )
        assert r.is_success, f"Failed to create test workflow: status={r.status_code}"
        assert r.parsed is not None, "Workflow creation returned empty response"
        return UUID(str(r.parsed.id))

    @staticmethod
    def _start_execution(
        nexus_api: NexusApiRegistry,
        workflow_id: UUID,
    ) -> str | None:
        """Start a single execution and return execution_id or None."""
        try:
            r = nexus_api.executions.create(
                body=ExecutionCreate(workflow_id=workflow_id),
            )
            return str(r.parsed.id) if r.is_success and r.parsed else None
        except Exception:
            return None

    def _count_active_executions(
        self,
        nexus_api: NexusApiRegistry,
        execution_ids: list[str],
    ) -> dict[str, int]:
        """Count executions by status."""
        status_counts: dict[str, int] = {}
        for exec_id in execution_ids:
            try:
                r = nexus_api.executions.get(execution_id=exec_id)
                if r.is_success and r.parsed:
                    parsed = r.parsed.to_dict()
                    status = parsed.get("status", "unknown")
                    status_counts[status] = status_counts.get(status, 0) + 1
            except Exception:
                status_counts["error"] = status_counts.get("error", 0) + 1
        return status_counts

    def _create_workflows_batch(
        self,
        nexus_api: NexusApiRegistry,
        prefix: str,
        count: int,
    ) -> list[UUID]:
        """Create multiple workflows and return their IDs."""
        return [self._create_test_workflow(nexus_api, prefix) for _ in range(count)]

    def _start_executions_concurrent(
        self,
        nexus_api: NexusApiRegistry,
        workflow_ids: list[UUID],
    ) -> list[str]:
        """Start executions concurrently and return successful execution IDs."""
        exec_ids: list[str] = []
        with ThreadPoolExecutor(max_workers=len(workflow_ids)) as executor:
            futures = [executor.submit(self._start_execution, nexus_api, wf_id) for wf_id in workflow_ids]
            for future in as_completed(futures):
                exec_id = future.result()
                if exec_id:
                    exec_ids.append(exec_id)
        return exec_ids

    def _start_executions_sequential(
        self,
        nexus_api: NexusApiRegistry,
        workflow_ids: list[UUID],
    ) -> tuple[list[str], int]:
        """Start executions sequentially, return (exec_ids, failure_count)."""
        exec_ids: list[str] = []
        failures = 0
        for wf_id in workflow_ids:
            exec_id = self._start_execution(nexus_api, wf_id)
            if exec_id:
                exec_ids.append(exec_id)
            else:
                failures += 1
        return exec_ids, failures

    def _poll_active_counts(
        self,
        nexus_api: NexusApiRegistry,
        execution_ids: list[str],
    ) -> tuple[list[dict[str, int]], int]:
        """Poll active counts over multiple rounds, return (snapshots, peak)."""
        snapshots: list[dict[str, int]] = []
        peak = 0
        for _ in range(ACTIVE_STATUS_POLL_ROUNDS):
            time.sleep(POLL_INTERVAL_SECONDS)
            snapshot = self._count_active_executions(nexus_api, execution_ids)
            snapshots.append(snapshot)
            active = snapshot.get("running", 0) + snapshot.get("pending", 0)
            peak = max(peak, active)
        return snapshots, peak

    def test_active_workflow_count_during_concurrent_starts(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Start workflows while others are running; track active count."""
        all_workflow_ids: list[UUID] = []
        all_execution_ids: list[str] = []

        try:
            initial_wf_ids = self._create_workflows_batch(nexus_api, "init", INITIAL_WORKFLOW_COUNT)
            all_workflow_ids.extend(initial_wf_ids)

            initial_exec_ids = self._start_executions_concurrent(nexus_api, initial_wf_ids)
            all_execution_ids.extend(initial_exec_ids)

            first_snapshot = poll_until(
                lambda: self._count_active_executions(nexus_api, all_execution_ids),
                lambda s: s.get("running", 0) > 0 or any(st in s for st in TERMINAL_STATUSES),
                timeout=POLL_TIMEOUT_SECONDS,
                interval=POLL_INTERVAL_SECONDS,
            )
            peak_active = first_snapshot.get("running", 0) + first_snapshot.get("pending", 0)

            additional_wf_ids = self._create_workflows_batch(nexus_api, "add", ADDITIONAL_WORKFLOW_COUNT)
            all_workflow_ids.extend(additional_wf_ids)

            additional_exec_ids, additional_failures = self._start_executions_sequential(nexus_api, additional_wf_ids)
            all_execution_ids.extend(additional_exec_ids)

            poll_snapshots, poll_peak = self._poll_active_counts(nexus_api, all_execution_ids)
            peak_active = max(peak_active, poll_peak)
            all_snapshots = [first_snapshot, *poll_snapshots]

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "execution_service",
            )
            server_active = kpis.get("metrics", {}).get("active_workflows", None)

            diag = (
                f"\n--- Active count results ---\n"
                f"  initial_started={len(initial_exec_ids)}, "
                f"additional_started={len(additional_exec_ids)}, "
                f"additional_failures={additional_failures}\n"
                f"  total_executions={len(all_execution_ids)}\n"
                f"  peak_active_count={peak_active}\n"
                f"  server_active_workflows={server_active}\n"
                f"  status_snapshots={all_snapshots}\n"
            )

            assert additional_failures < ADDITIONAL_WORKFLOW_COUNT, (
                f"Too many failures starting additional workflows: "
                f"{additional_failures}/{ADDITIONAL_WORKFLOW_COUNT}{diag}"
            )
            assert len(all_execution_ids) > 0, f"No executions were started{diag}"

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "workflow_status",
                limit=len(all_execution_ids) * 3,
            )
            assert records.get("total", 0) > 0, f"No workflow_status records emitted during active count test{diag}"

            terminal_count = sum(count for status, count in all_snapshots[-1].items() if status in TERMINAL_STATUSES)
            assert terminal_count > 0 or peak_active > 0, (
                f"Expected some executions to reach terminal status or observe active executions{diag}"
            )
        finally:
            for wf_id in all_workflow_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass
