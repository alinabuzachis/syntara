"""Suite 11 — LLM Model (Nexus Overhead): Overhead KPIs (11.4 & 11.5).

Test 11.4: Compute overhead ratio
    KPI: System Overhead Ratio < 30%
    MetricType: REQUEST_DURATION, LLM_DURATION
    Validation: (total_duration - llm_duration) / llm_duration

Test 11.5: Overhead breakdown by component
    KPI: Routing < 100ms, Context prep < 50ms
    MetricType: AGENT_ROUTING_DURATION, CONTEXT_DURATION
    Endpoint: /_internal/metrics/records?metric_type=agent_routing_ms
              /_internal/metrics/records?metric_type=context_duration_ms

Run with:
    make test-performance
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    ALL_LLM_TEST_PROMPTS,
    API_SERVICE_COMPONENT,
    DEFAULT_FUTURE_TIMEOUT,
    DEFAULT_INVOCATION_TIMEOUT,
    LLM_COMPONENT,
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
    wait_for_invocations,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

# Nexus overhead should be < 30% of LLM time: (total - llm) / llm < 0.30
TARGET_OVERHEAD_RATIO = 0.30
MAX_ROUTING_MS = 100.0
MAX_CONTEXT_PREP_MS = 50.0


# Lower count to reduce test time while waiting for LLM completions (~100s total)
REQUEST_COUNT = 20
MAX_WORKERS = 10


class TestNexusOverhead:
    """11.4 & 11.5 — System overhead ratio and component breakdown.

    Validates:
        - 11.4: System overhead ratio = (total - llm) / llm < 30%
        - 11.5: Routing component < 100ms, Context prep < 50ms

    Submits invocations, waits for completion, then fetches duration
    metrics to compute overall and per-component overhead.
    """

    @pytest.fixture(autouse=True, scope="class")
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    @pytest.fixture(scope="class")
    def invocation_ids(
        self,
        _setup: None,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
        configured_model: str,
    ) -> list[str]:
        """Submit invocations in parallel and wait for terminal status."""
        model = configured_model

        futures: list[Future[tuple[float, bool, str | None]]] = []
        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            for i in range(REQUEST_COUNT):
                prompt = ALL_LLM_TEST_PROMPTS[i % len(ALL_LLM_TEST_PROMPTS)]
                futures.append(
                    executor.submit(
                        submit_invocation,
                        nexus_api,
                        prompt,
                        model=model,
                        credential_id=llm_credential_id,
                    ),
                )

        ids: list[str] = []
        for fut in as_completed(futures):
            _, ok, inv_id = fut.result(timeout=DEFAULT_FUTURE_TIMEOUT)
            if ok and inv_id:
                ids.append(inv_id)

        assert len(ids) > 0, "No invocations were created"

        wait_for_invocations(nexus_api, ids, timeout=DEFAULT_INVOCATION_TIMEOUT)

        return ids

    def test_overhead_ratio_below_target(
        self,
        nexus_api: NexusApiRegistry,
        invocation_ids: list[str],
    ) -> None:
        """11.4 — (total_duration - llm_duration) / llm_duration must be < 30%."""
        request_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
            limit=len(invocation_ids) * 2,
        )
        llm_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=len(invocation_ids) * 2,
        )

        request_values = [
            float(r["value"])
            for r in request_records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]
        llm_values = [
            float(r["value"])
            for r in llm_records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]

        api_kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            API_SERVICE_COMPONENT,
        )
        llm_kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            LLM_COMPONENT,
        )

        api_p95 = api_kpis.get("metrics", {}).get("response_time_ms", {}).get("p95", 0)
        llm_p95 = llm_kpis.get("metrics", {}).get("response_time_ms", {}).get("p95", 0)

        request_val, llm_val, metric_type = _compute_representative_values(
            request_values,
            llm_values,
            float(api_p95 or 0),
            float(llm_p95 or 0),
        )

        diag = (
            f"\n--- System overhead ratio results ---\n"
            f"  invocations={len(invocation_ids)}\n"
            f"  request_duration records={len(request_values)}, {metric_type}={request_val:.1f}ms\n"
            f"  llm_duration records={len(llm_values)}, {metric_type}={llm_val:.1f}ms\n"
            f"  server KPIs: api_service_p95={api_p95}ms, llm_p95={llm_p95}ms\n"
        )

        assert len(llm_values) > 0 or llm_p95 > 0, f"No LLM_DURATION metrics recorded — cannot compute overhead{diag}"
        assert llm_val > 0, (
            f"LLM duration is zero — cannot compute overhead ratio. This indicates a metrics collection failure.{diag}"
        )

        overhead_ratio = (request_val - llm_val) / llm_val

        diag_with_ratio = (
            f"{diag}"
            f"  overhead (total - llm)={request_val - llm_val:.1f}ms\n"
            f"  overhead_ratio={overhead_ratio * 100:.1f}%\n"
        )
        assert overhead_ratio < TARGET_OVERHEAD_RATIO, (
            f"System overhead ratio {overhead_ratio:.2%} exceeds target {TARGET_OVERHEAD_RATIO:.0%}{diag_with_ratio}"
        )

    def test_routing_overhead_below_threshold(
        self,
        nexus_api: NexusApiRegistry,
        invocation_ids: list[str],
    ) -> None:
        """11.5 — Routing component duration must stay below 100ms."""
        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=len(invocation_ids) * 2,
        )

        routing_values = [
            float(r["value"])
            for r in records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]

        assert len(routing_values) > 0, "No agent_routing_ms records found"

        p95 = compute_percentile(routing_values, 95)
        diag = (
            f"\n--- Routing component overhead ---\n"
            f"  samples={len(routing_values)}\n"
            f"  avg={sum(routing_values) / len(routing_values):.1f}ms, p95={p95:.1f}ms\n"
            f"  max={max(routing_values):.1f}ms\n"
        )

        assert p95 < MAX_ROUTING_MS, f"Routing p95 {p95:.1f}ms exceeds {MAX_ROUTING_MS}ms{diag}"

    def test_context_prep_overhead_below_threshold(
        self,
        nexus_api: NexusApiRegistry,
        invocation_ids: list[str],
    ) -> None:
        """11.5 — Context preparation duration must stay below 50ms."""
        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "context_duration_ms",
            limit=len(invocation_ids) * 2,
        )

        context_values = [
            float(r["value"])
            for r in records.get("records", [])
            if isinstance(r.get("value"), (int, float)) and r["value"] > 0
        ]

        assert len(context_values) > 0, "No context_duration_ms records found"

        p95 = compute_percentile(context_values, 95)
        diag = (
            f"\n--- Context preparation overhead ---\n"
            f"  samples={len(context_values)}\n"
            f"  avg={sum(context_values) / len(context_values):.1f}ms, p95={p95:.1f}ms\n"
            f"  max={max(context_values):.1f}ms\n"
        )

        assert p95 < MAX_CONTEXT_PREP_MS, f"Context prep p95 {p95:.1f}ms exceeds {MAX_CONTEXT_PREP_MS}ms{diag}"


def _compute_representative_values(
    request_values: list[float],
    llm_values: list[float],
    api_p95: float,
    llm_p95: float,
) -> tuple[float, float, str]:
    """Compute representative duration values, preferring averages over p95 fallback.

    Returns:
        Tuple of (request_value, llm_value, metric_type) where metric_type
        is "avg" when using averages, "p95" when using KPI fallback, or
        "none" when no metrics are available.

    """
    if request_values and llm_values:
        return (
            sum(request_values) / len(request_values),
            sum(llm_values) / len(llm_values),
            "avg",
        )
    if llm_p95 > 0:
        return api_p95, llm_p95, "p95"
    return 0.0, 0.0, "none"
