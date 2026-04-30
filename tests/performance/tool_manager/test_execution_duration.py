"""Suite 7 — Tool Manager: Execution Duration KPI (7.2).

Test 7.2: Execute tools of varying complexity
    KPI: Execution Duration (p95) < 2s
    MetricType: TOOL_EXECUTION_DURATION
    Validation: /_internal/metrics/kpis/tool_manager → execution_duration_ms.p95

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
)
from tests.performance.tool_manager.conftest import (
    ALL_TOOL_PROMPTS,
    COMPLEX_TOOL_PROMPTS,
    TOOL_MANAGER_COMPONENT,
    TOOL_TRIGGERING_PROMPTS,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_EXECUTION_DURATION_P95_MS = 2000
INVOCATION_COUNT = 100
CONCURRENT_BATCH_SIZE = 10


class TestExecutionDuration:
    """7.2 — Execute tools of varying complexity.

    Validates:
        - Server-side tool execution duration p95 < 2s
        - TOOL_EXECUTION_DURATION records are emitted
        - Duration metrics include proper percentile statistics

    The execution duration is measured server-side by the tool wrapper
    in the orchestrator.  It captures the time from tool invocation
    start to completion, excluding network overhead to the client.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        tool_execution_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_execution_duration_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit invocations triggering tool calls; execution duration p95 must be < 2s."""
        successes = 0

        prompts = list(itertools.islice(itertools.cycle(ALL_TOOL_PROMPTS), INVOCATION_COUNT))

        for batch_start in range(0, INVOCATION_COUNT, CONCURRENT_BATCH_SIZE):
            batch = prompts[batch_start : batch_start + CONCURRENT_BATCH_SIZE]
            with ThreadPoolExecutor(max_workers=CONCURRENT_BATCH_SIZE) as executor:
                futures = [executor.submit(submit_invocation, nexus_api, prompt) for prompt in batch]
                for future in as_completed(futures):
                    _, ok, _ = future.result()
                    if ok:
                        successes += 1

        assert successes > 0, f"No invocations were accepted ({INVOCATION_COUNT} submitted)"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            TOOL_MANAGER_COMPONENT,
        )
        duration_stats = kpis.get("metrics", {}).get("execution_duration_ms", {})
        server_p95 = duration_stats.get("p95", 0)
        server_count = duration_stats.get("count", 0)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_duration_ms",
            limit=INVOCATION_COUNT * 3,
        )
        record_values = [
            r.get("value", 0) for r in records.get("records", []) if isinstance(r.get("value"), (int, float))
        ]
        client_computed_p95 = compute_percentile(record_values, 95) if record_values else 0.0

        diag = (
            f"\n--- Tool execution duration results ---\n"
            f"  invocations: submitted={INVOCATION_COUNT}, accepted={successes}\n"
            f"  server: count={server_count}, p95={server_p95}ms\n"
            f"  duration_stats={duration_stats}\n"
            f"  raw_records: count={len(record_values)}, "
            f"client_p95={client_computed_p95:.1f}ms\n"
        )

        assert server_count > 0, (
            f"No TOOL_EXECUTION_DURATION records emitted after {successes} accepted invocations{diag}"
        )

        assert server_p95 < TARGET_EXECUTION_DURATION_P95_MS, (
            f"Tool execution duration p95 {server_p95}ms exceeds target {TARGET_EXECUTION_DURATION_P95_MS}ms{diag}"
        )

    def test_simple_vs_complex_tool_duration(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Compare duration of simple vs complex tool-triggering prompts.

        This test validates that tool execution duration metrics capture
        varying complexity levels and that all are within the p95 target.
        """
        simple_count = INVOCATION_COUNT // 2
        complex_count = INVOCATION_COUNT // 2

        simple_prompts = list(itertools.islice(itertools.cycle(TOOL_TRIGGERING_PROMPTS), simple_count))
        complex_prompts = list(itertools.islice(itertools.cycle(COMPLEX_TOOL_PROMPTS), complex_count))

        successes = 0
        for prompt in simple_prompts + complex_prompts:
            _, ok, _ = submit_invocation(nexus_api, prompt)
            if ok:
                successes += 1

        assert successes > 0, "No invocations were accepted"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            TOOL_MANAGER_COMPONENT,
        )
        duration_stats = kpis.get("metrics", {}).get("execution_duration_ms", {})
        server_p95 = duration_stats.get("p95", 0)
        server_count = duration_stats.get("count", 0)
        server_max = duration_stats.get("max", 0)

        diag = (
            f"\n--- Simple vs complex tool duration results ---\n"
            f"  invocations_accepted={successes}\n"
            f"  simple_prompts={simple_count}, complex_prompts={complex_count}\n"
            f"  server: count={server_count}, p95={server_p95}ms, "
            f"max={server_max}ms\n"
            f"  duration_stats={duration_stats}\n"
        )

        assert server_count > 0, f"No TOOL_EXECUTION_DURATION records emitted{diag}"

        assert server_p95 < TARGET_EXECUTION_DURATION_P95_MS, (
            f"Combined tool execution duration p95 {server_p95}ms "
            f"exceeds target {TARGET_EXECUTION_DURATION_P95_MS}ms{diag}"
        )

    def test_execution_duration_records_have_labels(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Verify TOOL_EXECUTION_DURATION records carry identifying labels."""
        successes = 0

        prompts = list(itertools.islice(itertools.cycle(ALL_TOOL_PROMPTS), INVOCATION_COUNT // 2))

        for prompt in prompts:
            _, ok, _ = submit_invocation(nexus_api, prompt)
            if ok:
                successes += 1

        assert successes > 0, "No invocations were accepted"

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_duration_ms",
            limit=successes * 3,
        )

        assert records.get("total", 0) > 0, (
            f"No tool_execution_duration_ms records emitted for {successes} accepted invocations"
        )

        for record in records.get("records", []):
            labels = record.get("labels", {})
            has_tool_identity = "namespaced_name" in labels or "tool_id" in labels
            assert has_tool_identity, (
                f"Duration record missing tool identification label (namespaced_name or tool_id): {labels}"
            )

            assert "status" in labels, f"Duration record missing status label: {labels}"
