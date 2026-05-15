"""Suite 3 — Temporal Worker: Queue Depth KPIs (3.1, 3.4).

Test 3.1: Submit 50 workflow executions and monitor queue
    KPI: Queue Depth — < 10 pending tasks
    MetricType: TEMPORAL_QUEUE_DEPTH
    Validation: /_internal/metrics/kpis/temporal_worker → queue_depth

Test 3.4: Saturate worker with 100+ concurrent executions
    KPI: Queue Depth Under Load — < 100 (critical threshold)
    MetricType: TEMPORAL_QUEUE_DEPTH
    Validation: /_internal/metrics/kpis/temporal_worker → queue_depth

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    create_perf_test_workflow,
    poll_for_component_kpis,
    scrape_prometheus_metric,
    submit_execution,
)
from tests.performance.temporal_worker.conftest import (
    SLOW_WORKFLOW_DEFINITION,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

# 3.1 constants
TARGET_MAX_QUEUE_DEPTH = 10
NORMAL_LOAD_EXECUTION_COUNT = 50
NORMAL_LOAD_WORKERS = 10

# 3.4 constants
CRITICAL_QUEUE_DEPTH_THRESHOLD = 100
SATURATION_EXECUTION_COUNT = 120
SATURATION_WORKERS = 30


def _poll_for_queue_depth_stats(
    nexus_api: NexusApiRegistry,
) -> dict[str, Any]:
    """Poll temporal_worker KPIs until queue_depth stats appear."""
    kpis = poll_for_component_kpis(nexus_api.internal_metrics, "temporal_worker")
    qd = kpis.get("metrics", {}).get("queue_depth", {})
    return qd if isinstance(qd, dict) else {}


def _submit_executions_concurrently(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
    count: int,
    max_workers: int,
) -> tuple[list[float], int, int]:
    """Submit *count* executions and return (times, successes, failures)."""
    submission_times: list[float] = []
    successes = 0
    failures = 0

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        futures = [executor.submit(submit_execution, nexus_api, workflow_id) for _ in range(count)]
        for future in as_completed(futures):
            elapsed_ms, ok, _ = future.result()
            submission_times.append(elapsed_ms)
            if ok:
                successes += 1
            else:
                failures += 1

    return submission_times, successes, failures


class TestQueueDepth:
    """3.1 — Submit 50 workflow executions and monitor queue depth.

    Queue depth is read directly from the metrics shared by the temporal
    worker:
        - ``GET /metrics`` → ``nexus_temporal_queue_depth`` Prometheus gauge
        - ``GET /_internal/metrics/kpis/temporal_worker`` → ``queue_depth``
          percentile stats (max, p95, etc.) already computed server-side
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_queue_depth_under_target(
        self,
        nexus_api: NexusApiRegistry,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """Submit 50 executions; queue depth must stay < 10 pending tasks."""
        workflow_id = create_perf_test_workflow(
            nexus_api,
            "perf-queue-depth",
            SLOW_WORKFLOW_DEFINITION,
        )
        assert workflow_id is not None, "Failed to create test workflow"
        cleanup_workflow_ids.append(workflow_id)

        submission_times, successes, failures = _submit_executions_concurrently(
            nexus_api,
            workflow_id,
            NORMAL_LOAD_EXECUTION_COUNT,
            NORMAL_LOAD_WORKERS,
        )

        assert successes > 0, (
            f"No workflow executions were accepted (failures={failures}/{NORMAL_LOAD_EXECUTION_COUNT})"
        )

        queue_depth_stats = _poll_for_queue_depth_stats(nexus_api)

        assert queue_depth_stats.get("count", 0) > 0, (
            f"No queue_depth metrics recorded after {successes} accepted executions — "
            f"temporal worker may not be emitting TEMPORAL_QUEUE_DEPTH records"
        )

        server_max = queue_depth_stats.get("max", 0)
        server_p95 = queue_depth_stats.get("p95", 0)

        assert server_max < TARGET_MAX_QUEUE_DEPTH, (
            f"Server-reported max queue depth {server_max} exceeds "
            f"target {TARGET_MAX_QUEUE_DEPTH} "
            f"(p95={server_p95}, count={queue_depth_stats.get('count')})"
        )

        avg_submission = sum(submission_times) / len(submission_times) if submission_times else 0
        assert successes >= NORMAL_LOAD_EXECUTION_COUNT * 0.9, (
            f"Too many submission failures: {successes}/{NORMAL_LOAD_EXECUTION_COUNT} "
            f"succeeded (minimum 90% required)\n"
            f"  Avg submission time: {avg_submission:.1f}ms\n"
            f"  Server KPI queue_depth: {queue_depth_stats}"
        )

    def test_queue_depth_reported_on_prometheus_endpoint(
        self,
        nexus_base_url: str,
    ) -> None:
        """Verify nexus_temporal_queue_depth is exposed on /metrics."""
        samples = scrape_prometheus_metric(
            nexus_base_url,
            "nexus_temporal_queue_depth",
        )
        assert len(samples) > 0, (
            "nexus_temporal_queue_depth gauge not found in Prometheus "
            "/metrics output — ensure the metric is registered and the "
            "openmetrics endpoint is enabled"
        )

    def test_temporal_worker_kpis_accessible(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        """Verify /_internal/metrics/kpis/temporal_worker returns valid KPIs."""
        kpis_response = nexus_api.internal_metrics.get_component_kpis(
            component="temporal_worker",
        )
        kpis_response.assert_successful()

        kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}

        assert kpis.get("component") == "temporal_worker", (
            f"Expected component='temporal_worker', got {kpis.get('component')}"
        )

        metrics = kpis.get("metrics", {})
        expected_keys = {"queue_depth", "activity_success_rate", "activity_duration_ms"}
        actual_keys = set(metrics.keys())

        assert expected_keys.issubset(actual_keys), (
            f"Missing expected KPI keys: {expected_keys - actual_keys} (present: {actual_keys})"
        )


class TestQueueDepthUnderSaturation:
    """3.4 — Saturate worker with 100+ concurrent executions.

    Pushes the worker past normal load by submitting 120 executions with
    high concurrency (30 threads), then reads ``queue_depth`` from the
    temporal worker KPI endpoint to verify the queue never breaches the
    critical threshold.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_queue_depth_below_critical_threshold(
        self,
        nexus_api: NexusApiRegistry,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """120 concurrent executions; queue depth must stay < 100."""
        workflow_id = create_perf_test_workflow(
            nexus_api,
            "perf-saturation",
            SLOW_WORKFLOW_DEFINITION,
        )
        assert workflow_id is not None, "Failed to create test workflow"
        cleanup_workflow_ids.append(workflow_id)

        _, total_accepted, _ = _submit_executions_concurrently(
            nexus_api,
            workflow_id,
            SATURATION_EXECUTION_COUNT,
            SATURATION_WORKERS,
        )

        assert total_accepted > 0, f"No executions were accepted ({SATURATION_EXECUTION_COUNT} submitted)"

        queue_depth_stats = _poll_for_queue_depth_stats(nexus_api)

        assert queue_depth_stats.get("count", 0) > 0, (
            f"No queue_depth metrics recorded after {total_accepted} accepted executions — "
            f"temporal worker may not be emitting TEMPORAL_QUEUE_DEPTH records"
        )

        server_max = queue_depth_stats.get("max", 0)
        server_p95 = queue_depth_stats.get("p95", 0)

        assert server_max < CRITICAL_QUEUE_DEPTH_THRESHOLD, (
            f"Peak queue depth {server_max} breaches critical threshold "
            f"{CRITICAL_QUEUE_DEPTH_THRESHOLD}\n"
            f"  Executions accepted: {total_accepted}/{SATURATION_EXECUTION_COUNT}\n"
            f"  p95={server_p95}, count={queue_depth_stats.get('count')}"
        )
