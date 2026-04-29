"""Suite 3 — Temporal Worker: Activity KPIs (3.2, 3.3).

Test 3.2: Execute 100 activities across various types
    KPI: Activity Success Rate — > 95%
    MetricType: ACTIVITY_DURATION, ACTIVITY_EXECUTION_SUCCESS_RATE
    Validation: /_internal/metrics/kpis/temporal_worker → activity_success_rate

Test 3.3: Execute script, approval, and tool activities
    KPI: Activity Duration p95 — < 5s
    MetricType: ACTIVITY_DURATION
    Validation: /_internal/metrics/kpis/temporal_worker → activity_duration_ms.p95

Run with:
    make test-performance
"""

from __future__ import annotations

import math
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import create_perf_test_workflow, submit_execution
from tests.performance.temporal_worker.conftest import (
    MULTI_ACTIVITY_WORKFLOW_DEFINITIONS,
    poll_until_activities_stabilize,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

# 3.2 constants
TARGET_ACTIVITY_SUCCESS_RATE = 0.95
TARGET_TOTAL_ACTIVITIES = 100
SUCCESS_RATE_EXECUTIONS_PER_DEFINITION = math.ceil(
    TARGET_TOTAL_ACTIVITIES / sum(len(d["nodes"]) for d in MULTI_ACTIVITY_WORKFLOW_DEFINITIONS)
)

# 3.3 constants
TARGET_P95_DURATION_MS = 5000
DURATION_EXECUTIONS_PER_WORKFLOW = 10

MAX_WORKERS = 10


def _expected_activity_count(
    definitions: list[dict[str, Any]],
    accepted_per_definition: int,
) -> int:
    """Compute expected activities from definitions and accepted execution count."""
    return sum(len(d["nodes"]) * accepted_per_definition for d in definitions)


def _submit_for_workflows(
    nexus_api: NexusApiRegistry,
    workflow_ids: list[str],
    executions_per_workflow: int,
) -> tuple[int, int]:
    """Submit executions for each workflow. Returns (submitted, accepted)."""
    total_submitted = 0
    total_accepted = 0

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        for wf_id in workflow_ids:
            for _ in range(executions_per_workflow):
                futures.append(executor.submit(submit_execution, nexus_api, wf_id))
                total_submitted += 1

        for future in as_completed(futures):
            _, ok = future.result()
            if ok:
                total_accepted += 1

    return total_submitted, total_accepted


def _build_mixed_activity_definitions(base_url: str) -> list[dict[str, Any]]:
    """Build workflow definitions exercising script, approval, and tool activities.

    The http_request (tool) activity targets the deployment's own /health
    endpoint so no external service is required.
    """
    return [
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "bash_task",
                    "name": "Bash Script",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'script activity'"},
                },
                {
                    "id": "python_task",
                    "name": "Python Script",
                    "type": "script",
                    "config": {"language": "python", "code": "print('python activity')"},
                },
            ],
            "edges": [
                {"from": "trigger_manual", "to": "bash_task"},
                {"from": "bash_task", "to": "python_task"},
            ],
        },
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "approval_task",
                    "name": "Approval Request",
                    "type": "approval",
                    "config": {"description": "Perf test approval", "timeout": 60},
                },
                {
                    "id": "post_approval_script",
                    "name": "Post Approval",
                    "type": "script",
                    "config": {"language": "bash", "code": "echo 'approved'"},
                },
            ],
            "edges": [
                {"from": "trigger_manual", "to": "approval_task"},
                {"from": "approval_task", "to": "post_approval_script"},
            ],
        },
        {
            "schema_version": "2.0.0",
            "triggers": [
                {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
            ],
            "nodes": [
                {
                    "id": "http_tool_task",
                    "name": "HTTP Tool Call",
                    "type": "http_request",
                    "config": {
                        "method": "GET",
                        "url": f"{base_url}/health",
                        "timeout": 10,
                    },
                },
                {
                    "id": "script_after_tool",
                    "name": "Process Tool Result",
                    "type": "script",
                    "config": {"language": "python", "code": "print('tool result processed')"},
                },
            ],
            "edges": [
                {"from": "trigger_manual", "to": "http_tool_task"},
                {"from": "http_tool_task", "to": "script_after_tool"},
            ],
        },
    ]


class TestActivitySuccessRate:
    """3.2 — Execute 100 activities across various types.

    Creates workflows with bash and python script activities (different
    activity types), submits enough executions to reach ~100 total
    activities, then reads ``activity_success_rate`` directly from
    the temporal worker KPI endpoint.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_activity_success_rate_above_target(
        self,
        nexus_api: NexusApiRegistry,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """Execute ~100 activities across various types; success rate must be > 95%."""
        workflow_ids: list[str] = []
        for i, definition in enumerate(MULTI_ACTIVITY_WORKFLOW_DEFINITIONS):
            wf_id = create_perf_test_workflow(
                nexus_api,
                f"perf-activity-{i}",
                definition,
            )
            assert wf_id is not None, f"Failed to create test workflow for definition {i}"
            workflow_ids.append(wf_id)

        cleanup_workflow_ids.extend(workflow_ids)

        total_submitted, total_accepted = _submit_for_workflows(
            nexus_api,
            workflow_ids,
            SUCCESS_RATE_EXECUTIONS_PER_DEFINITION,
        )

        assert total_accepted > 0, f"No executions were accepted ({total_submitted} submitted)"

        accepted_per_def = total_accepted // len(MULTI_ACTIVITY_WORKFLOW_DEFINITIONS)
        expected_activities = _expected_activity_count(
            MULTI_ACTIVITY_WORKFLOW_DEFINITIONS,
            accepted_per_def,
        )

        metrics = poll_until_activities_stabilize(nexus_api, expected_activities)
        activity_success_rate = metrics.get("activity_success_rate", 0)
        activity_duration = metrics.get("activity_duration_ms", {})
        activity_count = activity_duration.get("count", 0)

        assert activity_count > 0, (
            f"No ACTIVITY_DURATION records found in temporal_worker KPIs "
            f"(expected ~{expected_activities} from {total_accepted} executions)"
        )

        assert activity_success_rate >= TARGET_ACTIVITY_SUCCESS_RATE, (
            f"Activity success rate {activity_success_rate:.2%} is below "
            f"target {TARGET_ACTIVITY_SUCCESS_RATE:.0%}\n"
            f"  Executions accepted: {total_accepted}/{total_submitted}\n"
            f"  Expected activities: {expected_activities}\n"
            f"  Recorded activities: {activity_count}\n"
            f"  Activity duration stats: {activity_duration}"
        )


class TestActivityDuration:
    """3.3 — Execute script, approval, and tool activities.

    Creates workflows with three distinct activity types:
        - **Script** — bash and python script activities
        - **Approval** — approval request (placeholder, returns immediately)
        - **Tool** — HTTP request against the deployment's /health endpoint

    Reads ``activity_duration_ms.p95`` directly from the temporal worker
    KPI endpoint.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_activity_duration_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
        cleanup_workflow_ids: list[str],
    ) -> None:
        """Mixed activity types; p95 duration must be < 5s."""
        definitions = _build_mixed_activity_definitions(nexus_base_url)

        workflow_ids: list[str] = []
        for i, definition in enumerate(definitions):
            wf_id = create_perf_test_workflow(
                nexus_api,
                f"perf-duration-{i}",
                definition,
            )
            assert wf_id is not None, f"Failed to create test workflow for definition {i}"
            workflow_ids.append(wf_id)

        cleanup_workflow_ids.extend(workflow_ids)

        total_submitted, total_accepted = _submit_for_workflows(
            nexus_api,
            workflow_ids,
            DURATION_EXECUTIONS_PER_WORKFLOW,
        )

        assert total_accepted > 0, f"No executions were accepted ({total_submitted} submitted)"

        accepted_per_def = total_accepted // len(definitions)
        expected_activities = _expected_activity_count(definitions, accepted_per_def)
        metrics = poll_until_activities_stabilize(nexus_api, expected_activities)
        activity_duration = metrics.get("activity_duration_ms", {})
        activity_count = activity_duration.get("count", 0)

        assert activity_count > 0, (
            f"No ACTIVITY_DURATION records found in temporal_worker KPIs "
            f"(submitted {total_accepted} executions with mixed activity types)"
        )

        p95 = activity_duration.get("p95", 0)
        assert p95 < TARGET_P95_DURATION_MS, (
            f"Activity duration p95 {p95:.1f}ms exceeds target "
            f"{TARGET_P95_DURATION_MS}ms\n"
            f"  Executions accepted: {total_accepted}/{total_submitted}\n"
            f"  Activity count: {activity_count}\n"
            f"  Duration stats: {activity_duration}"
        )
