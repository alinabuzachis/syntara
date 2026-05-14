"""Suite 18 — E2E Agentic Workflows: E2E Latency & Component Breakdown (18.1, 18.4).

Test 18.1: Complete agentic workflow (prompt → agent → tools → response)
    KPI: E2E Latency (p95) < 60s
    MetricType: SYSTEM_E2E_LATENCY, AGENT_INVOCATION_DURATION
    Validation: /_internal/metrics/kpis/system_wide → e2e_latency_ms.p95

Test 18.4: E2E latency breakdown
    KPI: Component Contribution — Understand bottlenecks
    MetricType: AGENT_ROUTING_DURATION, LLM_DURATION, TOOL_EXECUTION_DURATION
    Validation: Breakdown: routing + LLM + tools

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest

from tests.performance.conftest import (
    TERMINAL_STATUSES,
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    poll_until_resources_terminal,
    submit_invocations_batch_with_ids,
)
from tests.performance.e2e_agentic.conftest import AGENTIC_PROMPTS

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATION_COUNT = 50
TARGET_E2E_LATENCY_P95_MS = 60_000
MAX_WORKERS = 10
STABILIZATION_TIMEOUT = 300.0


class TestE2EAgenticLatency:
    """18.1 + 18.4 — Complete agentic workflow E2E latency and breakdown.

    Submits agentic invocations (prompt → agent → tools → response),
    waits for completion, then validates:
        - Server-side E2E duration p95 < 60s
        - Component-level breakdown (routing, LLM, tools) is recorded
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_e2e_agentic_latency_below_target(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Agentic workflows E2E; p95 latency must be < 60s."""
        session_id = f"perf-suite18-e2e-latency-{uuid4().hex[:8]}"
        invocation_ids, creation_failures = submit_invocations_batch_with_ids(
            nexus_api,
            INVOCATION_COUNT,
            session_id,
            prompts=AGENTIC_PROMPTS,
            max_workers=MAX_WORKERS,
            credential_id=llm_credential_id,
        )

        assert len(invocation_ids) > 0, (
            f"No invocations were accepted "
            f"({creation_failures} creation failures out of "
            f"{INVOCATION_COUNT})\n"
            f"  Session: {session_id}"
        )

        status_counts = poll_until_resources_terminal(
            nexus_api,
            "invocation",
            invocation_ids,
            id_param="invocation_id",
            timeout=STABILIZATION_TIMEOUT,
        )

        terminal_count = sum(v for k, v in status_counts.items() if k in TERMINAL_STATUSES)
        assert terminal_count >= len(invocation_ids), (
            f"Only {terminal_count}/{len(invocation_ids)} invocations reached "
            f"terminal state within {STABILIZATION_TIMEOUT}s\n"
            f"  Status counts: {status_counts}\n"
            f"  Session: {session_id}"
        )

        # --- 18.1: E2E latency KPI ---

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "invocation_service",
            timeout=STABILIZATION_TIMEOUT,
        )
        metrics = kpis.get("metrics", {})
        duration_stats = metrics.get("e2e_duration_ms", {})
        server_count = duration_stats.get("count", 0)
        server_p95 = duration_stats.get("p95", 0)

        e2e_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_invocation_ms",
            limit=INVOCATION_COUNT + 10,
            timeout=STABILIZATION_TIMEOUT,
        )
        record_values = [
            r.get("value", 0) for r in e2e_records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        record_p95 = compute_percentile(record_values, 95) if record_values else 0

        effective_p95 = server_p95 if server_count > 0 else record_p95

        diag = (
            f"\n--- E2E agentic latency results ---\n"
            f"  submitted={INVOCATION_COUNT}, "
            f"accepted={len(invocation_ids)}\n"
            f"  status_counts={status_counts}\n"
            f"  server_e2e: count={server_count}, p95={server_p95}ms\n"
            f"  raw_records={len(record_values)}, "
            f"record_p95={record_p95:.1f}ms\n"
        )

        assert effective_p95 > 0, f"No E2E duration metrics recorded{diag}"
        assert effective_p95 < TARGET_E2E_LATENCY_P95_MS, (
            f"E2E agentic latency p95 {effective_p95:.0f}ms exceeds target "
            f"{TARGET_E2E_LATENCY_P95_MS}ms ({TARGET_E2E_LATENCY_P95_MS / 1000:.0f}s){diag}"
        )

        # --- 18.4: Component contribution breakdown ---

        breakdown: dict[str, dict[str, Any]] = {}

        routing_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "agent_routing_ms",
            limit=INVOCATION_COUNT + 10,
        )
        routing_values = [
            r.get("value", 0) for r in routing_records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        if routing_values:
            breakdown["routing"] = {
                "count": len(routing_values),
                "p50": compute_percentile(routing_values, 50),
                "p95": compute_percentile(routing_values, 95),
            }

        llm_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "llm_duration_ms",
            limit=INVOCATION_COUNT * 3,
        )
        llm_values = [
            r.get("value", 0) for r in llm_records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        if llm_values:
            breakdown["llm"] = {
                "count": len(llm_values),
                "p50": compute_percentile(llm_values, 50),
                "p95": compute_percentile(llm_values, 95),
            }

        tool_records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_duration_ms",
            limit=INVOCATION_COUNT * 5,
        )
        tool_values = [
            r.get("value", 0) for r in tool_records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        if tool_values:
            breakdown["tools"] = {
                "count": len(tool_values),
                "p50": compute_percentile(tool_values, 50),
                "p95": compute_percentile(tool_values, 95),
            }

        assert len(breakdown) > 0, (
            f"No component breakdown metrics recorded "
            f"(routing={routing_records.get('total', 0)}, "
            f"llm={llm_records.get('total', 0)}, "
            f"tools={tool_records.get('total', 0)})"
        )
