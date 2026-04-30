"""Suite 7 — Tool Manager: Execution Success Rate KPIs (7.1, 7.4).

Test 7.1: Execute 200 tool calls across providers
    KPI: Execution Success Rate > 95%
    MetricType: TOOL_EXECUTION_STATUS, TOOL_EXECUTION_SUCCESS_RATE
    Validation: /_internal/metrics/kpis/tool_manager → execution_success_rate

Test 7.4: Execute tools with intermittent provider failures
    KPI: Error Categorization — by provider_id, tool_id, error_code
    MetricType: TOOL_EXECUTION_STATUS, TOOL_ERROR_RATE
    Validation: /_internal/metrics/records?metric_type=tool_execution_status
        → verify labels

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import (
    poll_for_component_kpis,
    poll_for_metric_records,
    submit_invocation,
)
from tests.performance.tool_manager.conftest import (
    ALL_TOOL_PROMPTS,
    TOOL_MANAGER_COMPONENT,
    get_tool_execution_history,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

INVOCATION_COUNT = 200
TARGET_SUCCESS_RATE = 0.95
CONCURRENT_BATCH_SIZE = 20
INVOCATION_POLL_TIMEOUT = 120.0


class TestExecutionSuccessRate:
    """7.1 — Execute 200 tool calls across providers.

    Validates:
        - Tool execution success rate > 95%
        - TOOL_EXECUTION_STATUS records are emitted with proper labels
        - The tool_manager KPI endpoint reports execution_success_rate
        - Tool executions are recorded in the database-backed metrics

    Tool calls are triggered indirectly by submitting invocations with
    prompts that encourage the agent to use available tools.  The
    orchestrator's tool wrapper records ``TOOL_EXECUTION_STATUS`` and
    ``TOOL_EXECUTION_DURATION`` metrics for each tool call.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        tool_execution_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_execution_success_rate_above_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit 200 invocations triggering tool calls; success rate must be > 95%."""
        successes = 0
        failures = 0

        prompts = list(itertools.islice(itertools.cycle(ALL_TOOL_PROMPTS), INVOCATION_COUNT))

        for batch_start in range(0, INVOCATION_COUNT, CONCURRENT_BATCH_SIZE):
            batch = prompts[batch_start : batch_start + CONCURRENT_BATCH_SIZE]
            with ThreadPoolExecutor(max_workers=CONCURRENT_BATCH_SIZE) as executor:
                futures = [executor.submit(submit_invocation, nexus_api, prompt) for prompt in batch]
                for future in as_completed(futures):
                    _, ok, _ = future.result()
                    if ok:
                        successes += 1
                    else:
                        failures += 1

        assert successes > 0, f"No invocations were accepted ({INVOCATION_COUNT} submitted)"

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            TOOL_MANAGER_COMPONENT,
        )
        server_success_rate = kpis.get("metrics", {}).get("execution_success_rate", 0)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_status",
            limit=INVOCATION_COUNT * 3,
        )
        total_tool_executions = records.get("total", 0)

        diag = (
            f"\n--- Tool execution success rate results ---\n"
            f"  invocations: submitted={INVOCATION_COUNT}, "
            f"accepted={successes}, rejected={failures}\n"
            f"  server: success_rate={server_success_rate}, "
            f"tool_executions={total_tool_executions}\n"
            f"  kpi_metrics={kpis.get('metrics', {})}\n"
        )

        assert total_tool_executions > 0, (
            f"No TOOL_EXECUTION_STATUS records emitted after "
            f"{successes} accepted invocations — tools may not have "
            f"been called by the orchestrator{diag}"
        )

        assert server_success_rate >= TARGET_SUCCESS_RATE, (
            f"Tool execution success rate {server_success_rate:.2%} below target {TARGET_SUCCESS_RATE:.0%}{diag}"
        )

    def test_execution_status_records_have_labels(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit invocations and verify TOOL_EXECUTION_STATUS records carry proper labels."""
        successes = 0

        prompts = list(itertools.islice(itertools.cycle(ALL_TOOL_PROMPTS), INVOCATION_COUNT // 2))

        for batch_start in range(0, len(prompts), CONCURRENT_BATCH_SIZE):
            batch = prompts[batch_start : batch_start + CONCURRENT_BATCH_SIZE]
            with ThreadPoolExecutor(max_workers=CONCURRENT_BATCH_SIZE) as executor:
                futures = [executor.submit(submit_invocation, nexus_api, prompt) for prompt in batch]
                for future in as_completed(futures):
                    _, ok, _ = future.result()
                    if ok:
                        successes += 1

        assert successes > 0, "No invocations were accepted"

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_status",
            limit=successes * 3,
        )

        assert records.get("total", 0) > 0, (
            f"No tool_execution_status records emitted for {successes} accepted invocations"
        )

        for record in records.get("records", []):
            labels = record.get("labels", {})
            has_required_label = (
                "namespaced_name" in labels or "tool_id" in labels or "provider_id" in labels or "status" in labels
            )
            assert has_required_label, (
                f"Tool execution status record missing expected labels "
                f"(namespaced_name, tool_id, provider_id, or status): {labels}"
            )


class TestErrorCategorization:
    """7.4 — Execute tools with intermittent provider failures.

    Validates:
        - Error records carry categorization labels: provider_id,
          tool_id (via namespaced_name), error_code
        - Errors are distinguishable from successes via status labels
        - The tool execution DB endpoint records both success and error
          executions

    Note: This test does not deliberately cause failures — it validates
    that any errors occurring during the load test are properly
    categorized.  The categorization labels are set by the
    ``execution_failure_handler`` wrapper in the orchestrator.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        tool_execution_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_error_records_categorized(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Submit invocations and verify error records carry categorization labels."""
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

        assert successes > 0, "No invocations were accepted"

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "tool_execution_status",
            limit=INVOCATION_COUNT * 3,
        )

        assert records.get("total", 0) > 0, (
            f"No tool_execution_status records emitted for {successes} accepted invocations"
        )

        status_distribution = _extract_status_distribution(records)

        diag = (
            f"\n--- Error categorization results ---\n"
            f"  invocations_accepted={successes}\n"
            f"  tool_execution_records={records.get('total', 0)}\n"
            f"  status_distribution={status_distribution}\n"
        )

        for record in records.get("records", []):
            labels = record.get("labels", {})
            status = labels.get("status", "")
            if status in ("error", "timeout"):
                assert "error_code" in labels, f"Error record missing error_code label: {labels}{diag}"
                assert "namespaced_name" in labels or "provider_id" in labels, (
                    f"Error record missing provider/tool identification: {labels}{diag}"
                )

    def test_execution_history_in_database(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Verify tool executions are persisted to the database endpoint."""
        successes = 0

        prompts = list(itertools.islice(itertools.cycle(ALL_TOOL_PROMPTS), INVOCATION_COUNT // 4))

        for prompt in prompts:
            _, ok, _ = submit_invocation(nexus_api, prompt)
            if ok:
                successes += 1

        assert successes > 0, "No invocations were accepted"

        history = get_tool_execution_history(nexus_api, limit=200)
        executions = history.get("resources", [])

        diag = (
            f"\n--- Tool execution DB history ---\n"
            f"  invocations_accepted={successes}\n"
            f"  db_executions={len(executions)}\n"
        )

        assert len(executions) > 0, f"No tool executions found in database after {successes} accepted invocations{diag}"

        for execution in executions[:10]:
            assert "status" in execution, f"Execution record missing status: {execution}"


def _extract_status_distribution(records: dict[str, Any]) -> dict[str, int]:
    """Count executions per status from tool_execution_status records."""
    counts: dict[str, int] = {}
    for record in records.get("records", []):
        labels = record.get("labels", {})
        status = labels.get("status", "unknown")
        counts[status] = counts.get(status, 0) + 1
    return counts
