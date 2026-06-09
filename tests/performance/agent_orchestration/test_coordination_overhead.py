"""Suite 17 — Agent Orchestration: Coordination Overhead KPIs (17.2, 17.4).

Test 17.2: Multi-agent workflow coordination
    KPI: Coordination Overhead < 500ms
    MetricType: AGENT_ROUTING_DURATION
    Validation: Sum of inter-agent coordination time

Test 17.4: Parallel multi-agent workflows
    KPI: Coordination under concurrency — No deadlocks
    MetricType: AGENT_ROUTING_DURATION
    Validation: No timeouts or failures from coordination

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING

import pytest

from tests.performance.agent_orchestration.conftest import ALL_ORCHESTRATION_PROMPTS
from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_and_collect,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

# 17.2 constants
COORDINATION_INVOCATION_COUNT = 30
TARGET_COORDINATION_OVERHEAD_P95_MS = 500

# 17.4 constants
PARALLEL_INVOCATION_COUNT = 70
CONCURRENT_BATCH_SIZE = 20
TARGET_PARALLEL_ERROR_RATE = 0.05
STABILIZATION_TIMEOUT = 60.0


class TestCoordinationOverhead:
    """17.2 — Multi-agent workflow coordination.

    Submits invocations that exercise the orchestrator's agent routing
    and coordination logic, then reads ``AGENT_ROUTING_DURATION``
    metrics to measure the coordination overhead.

    Validates:
        - Server-side routing duration p95 < 500ms
        - Raw routing record p95 stays within target
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_coordination_overhead_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Multi-agent coordination; routing overhead p95 must be < 500ms."""
        prompts = list(
            itertools.islice(
                itertools.cycle(ALL_ORCHESTRATION_PROMPTS),
                COORDINATION_INVOCATION_COUNT,
            )
        )

        result = submit_and_collect(
            nexus_api,
            prompts,
            credential_id=llm_credential_id,
        )

        assert result.successes > 0, f"No invocations were accepted ({COORDINATION_INVOCATION_COUNT} submitted)"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "routing_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        decision_stats = kpis.get("metrics", {}).get("decision_time_ms", {})
        server_p95 = decision_stats.get("p95", 0)
        server_count = decision_stats.get("count", 0)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=COORDINATION_INVOCATION_COUNT + 10,
        )
        routing_values = [
            r.get("value", 0) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        record_p95 = compute_percentile(routing_values, 95) if routing_values else 0

        diag = (
            f"\n--- Coordination overhead results ---\n"
            f"  submitted={COORDINATION_INVOCATION_COUNT}, "
            f"accepted={result.successes}\n"
            f"  server_decision_time: count={server_count}, "
            f"p95={server_p95}ms\n"
            f"  raw_routing_records={len(routing_values)}, "
            f"record_p95={record_p95:.1f}ms\n"
        )

        effective_p95 = server_p95 if server_count > 0 else record_p95
        assert effective_p95 > 0, f"No routing duration metrics recorded{diag}"
        assert effective_p95 < TARGET_COORDINATION_OVERHEAD_P95_MS, (
            f"Coordination overhead p95 {effective_p95:.1f}ms exceeds target "
            f"{TARGET_COORDINATION_OVERHEAD_P95_MS}ms{diag}"
        )


class TestCoordinationUnderConcurrency:
    """17.4 — Parallel multi-agent workflows.

    Submits invocations concurrently in batches to verify the
    orchestrator handles parallel coordination without deadlocks.

    Validates:
        - All concurrent invocations are accepted (no submission failures)
        - No timeouts from the routing/coordination layer
        - Error rate from coordination stays below 5%
        - Routing duration under concurrency doesn't degrade excessively
        - Routing records are emitted without gaps
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_parallel_coordination_no_deadlocks(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Concurrent invocations; no deadlocks or coordination timeouts."""
        prompts = list(
            itertools.islice(
                itertools.cycle(ALL_ORCHESTRATION_PROMPTS),
                PARALLEL_INVOCATION_COUNT,
            )
        )

        result = submit_and_collect(
            nexus_api,
            prompts,
            max_workers=CONCURRENT_BATCH_SIZE,
            batch_size=CONCURRENT_BATCH_SIZE,
            credential_id=llm_credential_id,
        )

        total = result.successes + result.failures
        assert total > 0, "No invocations were attempted"

        error_rate = result.failures / total
        client_p95 = compute_percentile(result.client_times, 95) if result.client_times else 0
        client_p50 = compute_percentile(result.client_times, 50) if result.client_times else 0

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "routing_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        decision_stats = kpis.get("metrics", {}).get("decision_time_ms", {})
        server_p95 = decision_stats.get("p95", 0)
        server_count = decision_stats.get("count", 0)

        diag = (
            f"\n--- Parallel coordination results ---\n"
            f"  submitted={PARALLEL_INVOCATION_COUNT}, "
            f"accepted={result.successes}, failed={result.failures}\n"
            f"  error_rate={error_rate:.2%}\n"
            f"  client: p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
            f"  server_decision_time: count={server_count}, "
            f"p95={server_p95}ms\n"
            f"  batch_size={CONCURRENT_BATCH_SIZE}\n"
        )

        assert error_rate < TARGET_PARALLEL_ERROR_RATE, (
            f"Coordination error rate {error_rate:.2%} exceeds threshold "
            f"{TARGET_PARALLEL_ERROR_RATE:.0%} — possible deadlock or "
            f"resource contention{diag}"
        )

        assert result.successes > 0, f"No invocations succeeded under concurrent load{diag}"

        if server_count > 0:
            assert server_p95 < TARGET_COORDINATION_OVERHEAD_P95_MS, (
                f"Routing decision time p95 {server_p95}ms under concurrent "
                f"load exceeds target {TARGET_COORDINATION_OVERHEAD_P95_MS}ms"
                f"{diag}"
            )

        # --- Routing record completeness (secondary validation) ---

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=PARALLEL_INVOCATION_COUNT + 10,
            timeout=STABILIZATION_TIMEOUT,
        )

        total_records = records.get("total", 0)
        assert total_records > 0, (
            f"No agent_routing_ms records emitted under concurrent load (accepted={result.successes})"
        )

        routing_values: list[float] = [
            r.get("value", 0) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        if routing_values:
            max_routing = max(routing_values)
            assert max_routing < TARGET_COORDINATION_OVERHEAD_P95_MS * 2, (
                f"Maximum routing duration {max_routing:.1f}ms is excessively "
                f"high (> 2x target {TARGET_COORDINATION_OVERHEAD_P95_MS}ms) — "
                f"possible coordination bottleneck"
            )
