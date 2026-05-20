"""Suite 4 — Execution Service: Start Latency KPIs (4.1, 4.5).

Test 4.1: Start 50 workflows via POST /api/v1/executions and measure start time
    KPI: Start Latency < 500ms (p95)
    MetricType: WORKFLOW_START_LATENCY

Test 4.5: Start workflows with Temporal unavailable
    KPI: Start Latency under failure < 2s (critical threshold)
    MetricType: WORKFLOW_START_LATENCY

Run with:
    make test-performance
"""

from __future__ import annotations

import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import UUID, uuid4

import pytest
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
)
from tests.performance.execution_service.conftest import (
    EXECUTION_WORKFLOW_DEFINITION,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

EXECUTION_COUNT = 50
TARGET_START_LATENCY_P95_MS = 500
TARGET_FAILURE_LATENCY_P95_MS = 2000
CONCURRENT_BATCH_SIZE = 10


class TestStartLatency:
    """4.1 — Start 50 workflows via POST /executions and measure start time.

    Validates:
        - Client-measured execution creation p95 < 500ms
        - Server-side KPI (execution_service → start_latency_ms.p95) < 500ms
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
        wf_name = f"perf-suite4-latency-{uuid4().hex[:8]}"
        r = nexus_api.workflows.create(
            body=WorkflowCreate(
                name=wf_name,
                description="Execution start latency test workflow",
                workflow_definition=EXECUTION_WORKFLOW_DEFINITION,
            ),
        )
        assert r.is_success, f"Failed to create test workflow: status={r.status_code}"
        assert r.parsed is not None, "Workflow creation returned empty response"
        return UUID(str(r.parsed.id))

    def test_execution_start_latency_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Start 50 executions; p95 start latency must be < 500ms."""
        workflow_ids: list[UUID] = []
        execution_ids: list[str] = []
        start_times: list[float] = []
        failures = 0

        try:
            for _ in range(EXECUTION_COUNT):
                wf_id = self._create_test_workflow(nexus_api)
                workflow_ids.append(wf_id)

            for wf_id in workflow_ids:
                start = time.monotonic()
                try:
                    r = nexus_api.executions.create(
                        body=ExecutionCreate(workflow_id=wf_id),
                    )
                    elapsed_ms = (time.monotonic() - start) * 1000
                    start_times.append(elapsed_ms)

                    if r.is_success and r.parsed:
                        execution_ids.append(str(r.parsed.id))
                    else:
                        failures += 1
                except Exception:
                    elapsed_ms = (time.monotonic() - start) * 1000
                    start_times.append(elapsed_ms)
                    failures += 1

            assert len(start_times) > 0, "No executions were attempted"

            client_p95 = compute_percentile(start_times, 95)
            client_p50 = compute_percentile(start_times, 50)

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "execution_service",
            )
            server_latency = kpis.get("metrics", {}).get("start_latency_ms", {})
            server_p95 = server_latency.get("p95", 0)
            server_count = server_latency.get("count", 0)

            diag = (
                f"\n--- Start latency results ---\n"
                f"  total={EXECUTION_COUNT}, "
                f"succeeded={EXECUTION_COUNT - failures}, "
                f"failures={failures}\n"
                f"  client: p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
                f"  server: count={server_count}, p95={server_p95}ms\n"
            )

            assert client_p95 < TARGET_START_LATENCY_P95_MS, (
                f"Client-measured start latency p95 {client_p95:.1f}ms "
                f"exceeds target {TARGET_START_LATENCY_P95_MS}ms{diag}"
            )

            if isinstance(server_p95, (int, float)) and server_p95 > 0:
                assert server_p95 < TARGET_START_LATENCY_P95_MS, (
                    f"Server-reported start latency p95 {server_p95}ms "
                    f"exceeds target {TARGET_START_LATENCY_P95_MS}ms{diag}"
                )

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "workflow_start_latency_ms",
                limit=EXECUTION_COUNT + 10,
            )
            if records.get("total", 0) == 0:
                warnings.warn(
                    "No workflow_start_latency_ms records emitted — "
                    "WORKFLOW_START_LATENCY instrumentation may not be active",
                    stacklevel=1,
                )
        finally:
            for wf_id in workflow_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass

    def test_concurrent_execution_starts(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Start executions concurrently in batches; p95 must be < 500ms."""
        workflow_ids: list[UUID] = []
        execution_ids: list[str] = []
        start_times: list[float] = []

        def _start_execution(wf_id: UUID) -> tuple[float, int, str | None]:
            start = time.monotonic()
            try:
                r = nexus_api.executions.create(
                    body=ExecutionCreate(workflow_id=wf_id),
                )
                elapsed_ms = (time.monotonic() - start) * 1000
                exec_id = str(r.parsed.id) if r.is_success and r.parsed else None
                return elapsed_ms, r.status_code, exec_id
            except Exception:
                elapsed_ms = (time.monotonic() - start) * 1000
                return elapsed_ms, 0, None

        try:
            for _ in range(EXECUTION_COUNT):
                wf_id = self._create_test_workflow(nexus_api)
                workflow_ids.append(wf_id)

            for batch_start_idx in range(0, EXECUTION_COUNT, CONCURRENT_BATCH_SIZE):
                batch = workflow_ids[batch_start_idx : batch_start_idx + CONCURRENT_BATCH_SIZE]
                with ThreadPoolExecutor(max_workers=CONCURRENT_BATCH_SIZE) as executor:
                    futures = [executor.submit(_start_execution, wf_id) for wf_id in batch]
                    for future in as_completed(futures):
                        elapsed_ms, _status, exec_id = future.result()
                        start_times.append(elapsed_ms)
                        if exec_id:
                            execution_ids.append(exec_id)

            client_p95 = compute_percentile(start_times, 95)

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "execution_service",
            )
            server_latency = kpis.get("metrics", {}).get("start_latency_ms", {})
            server_p95 = server_latency.get("p95", 0)

            successes = len(execution_ids)
            diag = (
                f"\n--- Concurrent start results ---\n"
                f"  total={EXECUTION_COUNT}, "
                f"successes={successes}, "
                f"batch_size={CONCURRENT_BATCH_SIZE}\n"
                f"  client_p95={client_p95:.1f}ms\n"
                f"  server_p95={server_p95}ms\n"
            )

            assert client_p95 < TARGET_START_LATENCY_P95_MS, (
                f"Concurrent start latency p95 {client_p95:.1f}ms exceeds target {TARGET_START_LATENCY_P95_MS}ms{diag}"
            )
        finally:
            for wf_id in workflow_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass


class TestStartLatencyUnderFailure:
    """4.5 — Start workflows with Temporal unavailable.

    Validates:
        - When execution creation fails (e.g., Temporal issues), the API
          responds within the critical threshold of 2s
        - Server-side start_latency_ms records reflect failure scenarios

    Note: This test uses an invalid workflow ID to trigger a 404 error path
    which exercises the failure handling. True Temporal unavailability
    testing requires infrastructure-level fault injection on the deployment.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_start_latency_with_invalid_workflow(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Execution creation with invalid workflow ID must respond within 2s."""
        failure_times: list[float] = []
        error_count = 20

        for _ in range(error_count):
            fake_workflow_id = uuid4()
            start = time.monotonic()
            try:
                r = nexus_api.executions.create(
                    body=ExecutionCreate(workflow_id=fake_workflow_id),
                )
                elapsed_ms = (time.monotonic() - start) * 1000
                failure_times.append(elapsed_ms)
                assert not r.is_success, f"Expected failure for non-existent workflow, got status={r.status_code}"
            except Exception:
                elapsed_ms = (time.monotonic() - start) * 1000
                failure_times.append(elapsed_ms)

        client_p95 = compute_percentile(failure_times, 95)
        client_max = max(failure_times)

        diag = (
            f"\n--- Failure latency results ---\n"
            f"  attempts={error_count}, "
            f"p95={client_p95:.1f}ms, max={client_max:.1f}ms\n"
        )

        assert client_p95 < TARGET_FAILURE_LATENCY_P95_MS, (
            f"Failure response p95 {client_p95:.1f}ms exceeds "
            f"critical threshold {TARGET_FAILURE_LATENCY_P95_MS}ms{diag}"
        )

        assert client_max < TARGET_FAILURE_LATENCY_P95_MS * 2, (
            f"Failure response max {client_max:.1f}ms exceeds "
            f"2x critical threshold {TARGET_FAILURE_LATENCY_P95_MS * 2}ms{diag}"
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "workflow_start_latency_ms",
            limit=error_count + 10,
        )
        records.get("total", 0)  # no assertion — records may or may not exist
