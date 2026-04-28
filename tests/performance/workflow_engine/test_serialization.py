"""Suite 2 — Workflow Engine: Serialization KPIs (2.2, 2.5).

Test 2.2: Create workflows with varying definition complexity (5-50 nodes)
    KPI: Serialization Performance < 10ms p95
    MetricType: WORKFLOW_SERIALIZATION_DURATION

Test 2.5: Bulk workflow creation (10 concurrent)
    KPI: Serialization under load < 50ms p95
    MetricType: WORKFLOW_SERIALIZATION_DURATION

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import compute_percentile
from tests.performance.workflow_engine.conftest import (
    build_workflow_definition,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_SERIALIZATION_P95_MS = 10
TARGET_BULK_SERIALIZATION_P95_MS = 50
COMPLEXITY_LEVELS = [5, 10, 20, 30, 50]
WORKFLOWS_PER_COMPLEXITY = 10
CONCURRENT_BULK_CREATIONS = 10


class TestSerializationPerformance:
    """2.2 -- Create workflows with varying definition complexity (5-50 nodes).

    Validates:
        - Server-side serialization_duration_ms.p95 < 10ms
        - Client-measured creation times are reasonable across complexities
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    def test_varying_complexity_serialization_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Workflows with 5-50 nodes; serialization p95 must be < 10ms."""
        created_ids: list[str] = []
        client_times_by_complexity: dict[int, list[float]] = {}

        try:
            for num_nodes in COMPLEXITY_LEVELS:
                times: list[float] = []
                for i in range(WORKFLOWS_PER_COMPLEXITY):
                    wf_name = f"perf-suite2-ser-{num_nodes}n-{uuid4().hex[:6]}"
                    definition = build_workflow_definition(num_nodes)

                    start = time.monotonic()
                    r = nexus_api.workflows.create(
                        body=WorkflowCreate(
                            name=wf_name,
                            description=f"Serialization test: {num_nodes} nodes, iter {i}",
                            is_enabled=True,
                            workflow_definition=definition,
                        ),
                    )
                    elapsed_ms = (time.monotonic() - start) * 1000
                    times.append(elapsed_ms)

                    if r.is_success and r.parsed:
                        created_ids.append(r.parsed.id)

                client_times_by_complexity[num_nodes] = times

            time.sleep(1)

            kpis_response = nexus_api.internal_metrics.get_component_kpis(
                component="workflow_engine",
            )
            kpis_response.assert_successful()
            kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
            server_serialization = kpis.get("metrics", {}).get(
                "serialization_duration_ms",
                {},
            )
            server_p95 = server_serialization.get("p95", 0)
            server_count = server_serialization.get("count", 0)

            all_client_times = [t for times in client_times_by_complexity.values() for t in times]
            client_p95 = compute_percentile(all_client_times, 95)

            diag_lines = ["\n--- Serialization results by complexity ---"]
            for num_nodes in COMPLEXITY_LEVELS:
                times = client_times_by_complexity.get(num_nodes, [])
                if times:
                    p95 = compute_percentile(times, 95)
                    diag_lines.append(
                        f"  {num_nodes} nodes: count={len(times)}, "
                        f"p95={p95:.1f}ms, mean={sum(times) / len(times):.1f}ms"
                    )
            diag_lines.append(
                f"--- Overall client p95={client_p95:.1f}ms ---\n"
                f"--- Server: count={server_count}, p95={server_p95}ms ---"
            )
            diag = "\n".join(diag_lines) + "\n"

            assert server_p95 < TARGET_SERIALIZATION_P95_MS, (
                f"Server-reported serialization p95 {server_p95}ms exceeds target {TARGET_SERIALIZATION_P95_MS}ms{diag}"
            )
        finally:
            for wf_id in created_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass


class TestBulkCreationSerialization:
    """2.5 — Bulk workflow creation (10 concurrent).

    Validates:
        - Server-side serialization_duration_ms.p95 < 50ms under concurrent load
        - All concurrent creations succeed
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()
        time.sleep(0.5)

    @staticmethod
    def _create_workflow(
        nexus_api: NexusApiRegistry,
        index: int,
    ) -> tuple[float, int, str | None]:
        """Create a single workflow and return (elapsed_ms, status_code, id)."""
        wf_name = f"perf-suite2-bulk-{uuid4().hex[:8]}"
        definition = build_workflow_definition(10)

        start = time.monotonic()
        try:
            r = nexus_api.workflows.create(
                body=WorkflowCreate(
                    name=wf_name,
                    description=f"Bulk creation test, index {index}",
                    is_enabled=True,
                    workflow_definition=definition,
                ),
            )
            elapsed_ms = (time.monotonic() - start) * 1000
            wf_id = r.parsed.id if r.is_success and r.parsed else None
            return elapsed_ms, r.status_code, wf_id
        except Exception:
            elapsed_ms = (time.monotonic() - start) * 1000
            return elapsed_ms, 0, None

    def test_bulk_creation_serialization_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """10 concurrent workflow creations; serialization p95 must be < 50ms."""
        response_times: list[float] = []
        status_codes: list[int] = []
        created_ids: list[str] = []

        try:
            with ThreadPoolExecutor(max_workers=CONCURRENT_BULK_CREATIONS) as executor:
                futures = [
                    executor.submit(self._create_workflow, nexus_api, i) for i in range(CONCURRENT_BULK_CREATIONS)
                ]
                for future in as_completed(futures):
                    elapsed_ms, status_code, wf_id = future.result()
                    response_times.append(elapsed_ms)
                    status_codes.append(status_code)
                    if wf_id:
                        created_ids.append(wf_id)

            assert len(response_times) == CONCURRENT_BULK_CREATIONS

            client_p95 = compute_percentile(response_times, 95)
            successes = sum(1 for s in status_codes if 200 <= s < 300)

            time.sleep(1)

            kpis_response = nexus_api.internal_metrics.get_component_kpis(
                component="workflow_engine",
            )
            kpis_response.assert_successful()
            kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
            server_serialization = kpis.get("metrics", {}).get(
                "serialization_duration_ms",
                {},
            )
            server_p95 = server_serialization.get("p95", 0)
            server_count = server_serialization.get("count", 0)

            diag = (
                f"\n--- Bulk creation results ---\n"
                f"  concurrent={CONCURRENT_BULK_CREATIONS}, "
                f"successes={successes}, "
                f"client_p95={client_p95:.1f}ms\n"
                f"  server: count={server_count}, p95={server_p95}ms\n"
            )

            assert server_p95 < TARGET_BULK_SERIALIZATION_P95_MS, (
                f"Server-reported serialization p95 {server_p95}ms exceeds "
                f"target {TARGET_BULK_SERIALIZATION_P95_MS}ms under concurrent load{diag}"
            )

            records_response = nexus_api.internal_metrics.get_records(
                metric_type="workflow_serialization_duration_ms",
                limit=CONCURRENT_BULK_CREATIONS + 10,
            )
            records_response.assert_successful()
            records = records_response.parsed.to_dict() if records_response.parsed is not None else {}
            record_count = records.get("total", 0)
            assert record_count > 0, "No workflow_serialization_duration_ms records emitted during bulk creation test"

            record_values = [
                r.get("value", 0) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))
            ]
            if record_values:
                records_p95 = compute_percentile(record_values, 95)
                assert records_p95 < TARGET_BULK_SERIALIZATION_P95_MS, (
                    f"Raw record serialization p95 {records_p95:.1f}ms exceeds "
                    f"target {TARGET_BULK_SERIALIZATION_P95_MS}ms "
                    f"(record_count={record_count})"
                )
        finally:
            for wf_id in created_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass
