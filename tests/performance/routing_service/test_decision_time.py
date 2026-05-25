"""Suite 6 — Routing Service: Decision Time KPIs (6.1, 6.4).

Test 6.1: Submit 200 prompts requiring agent selection
    KPI: Decision Time < 100ms (p95)
    MetricType: AGENT_ROUTING_DURATION
    Validation: /_internal/metrics/kpis/routing_service → decision_time_ms.p95

Test 6.4: Submit prompts when semantic search is enabled
    KPI: Decision Time (advanced) < 500ms (p95)
    MetricType: AGENT_ROUTING_DURATION
    Validation: /_internal/metrics/records?metric_type=agent_routing_ms

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_and_collect,
)
from tests.performance.routing_service.conftest import (
    ALL_PROMPTS,
    ROUTING_SERVICE_COMPONENT,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATION_COUNT = 200
TARGET_DECISION_TIME_P95_MS = 100
TARGET_ADVANCED_DECISION_TIME_P95_MS = 500
CONCURRENT_BATCH_SIZE = 20
ADVANCED_INVOCATION_COUNT = 50


class TestDecisionTime:
    """6.1 — Submit 200 prompts requiring agent selection.

    Validates:
        - Client-measured invocation creation p95 is reasonable
        - Server-side KPI (routing_service → decision_time_ms.p95) < 100ms
        - AGENT_ROUTING_DURATION records are emitted with proper labels

    The routing decision time is measured server-side by the orchestrator
    agent.  Client-side latency includes network + API overhead and is
    recorded for diagnostics but the KPI assertion targets the server
    metric.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_routed_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_routing_decision_time_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit 200 invocations; routing decision time p95 must be < 100ms."""
        prompts = list(itertools.islice(itertools.cycle(ALL_PROMPTS), INVOCATION_COUNT))

        result = submit_and_collect(nexus_api, prompts)

        assert len(result.client_times) > 0, "No invocations were attempted"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )
        decision_stats = kpis.get("metrics", {}).get("decision_time_ms", {})
        server_p95 = decision_stats.get("p95", 0)
        server_count = decision_stats.get("count", 0)

        client_p95 = compute_percentile(result.client_times, 95)
        client_p50 = compute_percentile(result.client_times, 50)

        diag = (
            f"\n--- Decision time results ---\n"
            f"  total={INVOCATION_COUNT}, "
            f"successes={result.successes}, failures={result.failures}\n"
            f"  client: p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
            f"  server: count={server_count}, p95={server_p95}ms\n"
            f"  decision_time_stats={decision_stats}\n"
        )

        assert server_count > 0, f"No AGENT_ROUTING_DURATION records emitted{diag}"
        assert server_p95 < TARGET_DECISION_TIME_P95_MS, (
            f"Server-reported decision time p95 {server_p95}ms exceeds target {TARGET_DECISION_TIME_P95_MS}ms{diag}"
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=INVOCATION_COUNT + 10,
        )
        for record in records.get("records", []):
            labels = record.get("labels", {})
            assert "invocation_id" in labels or "target_agent" in labels, (
                f"Routing record missing expected labels: {labels}"
            )

    def test_concurrent_routing_decision_time(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit invocations concurrently in batches; p95 must be < 100ms."""
        prompts = list(itertools.islice(itertools.cycle(ALL_PROMPTS), INVOCATION_COUNT))

        result = submit_and_collect(
            nexus_api,
            prompts,
            max_workers=CONCURRENT_BATCH_SIZE,
            batch_size=CONCURRENT_BATCH_SIZE,
        )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )
        decision_stats = kpis.get("metrics", {}).get("decision_time_ms", {})
        server_p95 = decision_stats.get("p95", 0)
        server_count = decision_stats.get("count", 0)

        client_p95 = compute_percentile(result.client_times, 95)

        diag = (
            f"\n--- Concurrent decision time results ---\n"
            f"  total={INVOCATION_COUNT}, "
            f"successes={result.successes}, "
            f"batch_size={CONCURRENT_BATCH_SIZE}\n"
            f"  client_p95={client_p95:.1f}ms\n"
            f"  server: count={server_count}, p95={server_p95}ms\n"
        )

        assert server_count > 0, f"No AGENT_ROUTING_DURATION records emitted{diag}"
        assert server_p95 < TARGET_DECISION_TIME_P95_MS, (
            f"Concurrent routing decision time p95 {server_p95}ms exceeds target {TARGET_DECISION_TIME_P95_MS}ms{diag}"
        )


class TestAdvancedDecisionTime:
    """6.4 — Submit prompts when semantic search is enabled.

    Validates:
        - When advanced routing features (semantic search) are active,
          the decision time p95 remains under 500ms
        - AGENT_ROUTING_DURATION records reflect the additional overhead

    Note: This test submits invocations and measures routing decision
    time.  The actual semantic search overhead depends on the deployment
    configuration.  If semantic search is not enabled, the test still
    validates that decision time stays within the relaxed threshold.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_routed_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_advanced_routing_decision_time_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit invocations with varied prompts; decision time p95 must be < 500ms."""
        prompts = list(itertools.islice(itertools.cycle(ALL_PROMPTS), ADVANCED_INVOCATION_COUNT))

        result = submit_and_collect(nexus_api, prompts)

        assert len(result.client_times) > 0, "No invocations were attempted"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            ROUTING_SERVICE_COMPONENT,
        )
        decision_stats = kpis.get("metrics", {}).get("decision_time_ms", {})
        server_p95 = decision_stats.get("p95", 0)
        server_count = decision_stats.get("count", 0)

        client_p95 = compute_percentile(result.client_times, 95)

        diag = (
            f"\n--- Advanced decision time results ---\n"
            f"  total={ADVANCED_INVOCATION_COUNT}, successes={result.successes}\n"
            f"  client_p95={client_p95:.1f}ms\n"
            f"  server: count={server_count}, p95={server_p95}ms\n"
            f"  decision_time_stats={decision_stats}\n"
        )

        assert server_count > 0, f"No AGENT_ROUTING_DURATION records emitted{diag}"
        assert server_p95 < TARGET_ADVANCED_DECISION_TIME_P95_MS, (
            f"Advanced routing decision time p95 {server_p95}ms "
            f"exceeds target {TARGET_ADVANCED_DECISION_TIME_P95_MS}ms{diag}"
        )

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=ADVANCED_INVOCATION_COUNT + 10,
        )
        if records.get("total", 0) > 0:
            values = [r.get("value", 0) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))]
            if values:
                record_p95 = compute_percentile(values, 95)
                assert record_p95 < TARGET_ADVANCED_DECISION_TIME_P95_MS, (
                    f"Raw record decision time p95 {record_p95:.1f}ms "
                    f"exceeds target {TARGET_ADVANCED_DECISION_TIME_P95_MS}ms"
                )
