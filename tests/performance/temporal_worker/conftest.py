"""Suite-specific fixtures for Suite 3: Temporal Worker performance tests.

Shared fixtures (perf_test_mode_enabled) and helpers (compute_percentile,
scrape_prometheus_metric, submit_execution) live in
``tests/performance/conftest.py`` and are inherited automatically.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Temporal server reachable from the Nexus deployment
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

import pytest
from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_definition_nodes_item import (
    WorkflowDefinitionNodesItem,
)

from tests.performance.conftest import SIMPLE_WORKFLOW_DEFINITION, poll_until

if TYPE_CHECKING:
    from collections.abc import Generator

    from nexus_api_client.api import NexusApiRegistry

POLL_INTERVAL_SECONDS = 2
POLL_TIMEOUT_SECONDS = 60


@pytest.fixture
def cleanup_workflow_ids(
    nexus_api: NexusApiRegistry,
) -> Generator[list[str], None, None]:
    """Provide a list that tests can append workflow IDs to for automatic cleanup."""
    ids: list[str] = []
    yield ids
    for wf_id in ids:
        try:
            nexus_api.workflows.delete(workflow_id=wf_id)
        except Exception:
            pass


def get_temporal_worker_kpis(nexus_api: NexusApiRegistry) -> dict[str, Any]:
    """Fetch temporal_worker KPIs and return the metrics dict."""
    kpis_response = nexus_api.internal_metrics.get_component_kpis(
        component="temporal_worker",
    )
    kpis_response.assert_successful()
    kpis = kpis_response.parsed.to_dict() if kpis_response.parsed is not None else {}
    metrics: dict[str, Any] = kpis.get("metrics", {})
    return metrics


def poll_until_activities_stabilize(
    nexus_api: NexusApiRegistry,
    min_expected: int,
) -> dict[str, Any]:
    """Poll temporal_worker KPIs until the activity count stabilizes.

    Waits until ``activity_duration_ms.count`` stops increasing for two
    consecutive polls, or the timeout is reached.  Returns the final
    metrics dict.

    Args:
        nexus_api: Authenticated API client registry.
        min_expected: Minimum activity count before we start checking
            for stabilization (avoids returning too early).

    """
    prev_count: list[int] = [-1]

    def _ready(metrics: dict[str, Any]) -> bool:
        current: int = metrics.get("activity_duration_ms", {}).get("count", 0)
        stable = current >= min_expected and current == prev_count[0]
        prev_count[0] = current
        return stable

    return poll_until(
        lambda: get_temporal_worker_kpis(nexus_api),
        _ready,
        timeout=POLL_TIMEOUT_SECONDS,
        interval=POLL_INTERVAL_SECONDS,
    )


SLOW_WORKFLOW_DEFINITION: WorkflowDefinition = WorkflowDefinition(
    name=SIMPLE_WORKFLOW_DEFINITION.name,
    schema_version=SIMPLE_WORKFLOW_DEFINITION.schema_version,
    triggers=SIMPLE_WORKFLOW_DEFINITION.triggers,
    edges=SIMPLE_WORKFLOW_DEFINITION.edges,
    nodes=[
        WorkflowDefinitionNodesItem.from_dict(
            {
                "id": "script_task",
                "name": "Script Task",
                "type": "script",
                "config": {"language": "python", "code": "import time; time.sleep(0.5); print('done')"},
            }
        )
    ],
)

MULTI_ACTIVITY_WORKFLOW_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "bash-activities-workflow",
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "bash_echo",
                "name": "Bash Echo",
                "type": "script",
                "config": {"language": "bash", "code": "echo 'activity ok'"},
            },
            {
                "id": "bash_math",
                "name": "Bash Math",
                "type": "script",
                "config": {"language": "bash", "code": "echo $((21 * 2))"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "bash_echo"},
            {"from": "bash_echo", "to": "bash_math"},
        ],
    },
    {
        "name": "python-activities-workflow",
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "python_hello",
                "name": "Python Hello",
                "type": "script",
                "config": {"language": "python", "code": "print('hello from python')"},
            },
            {
                "id": "python_compute",
                "name": "Python Compute",
                "type": "script",
                "config": {"language": "python", "code": "result = sum(range(100)); print(result)"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "python_hello"},
            {"from": "python_hello", "to": "python_compute"},
        ],
    },
    {
        "name": "mixed-activities-workflow",
        "schema_version": "2.0.0",
        "triggers": [
            {"id": "trigger_manual", "type": "manual_trigger", "config": {"inputs": {}}},
        ],
        "nodes": [
            {
                "id": "bash_env",
                "name": "Bash Env Check",
                "type": "script",
                "config": {"language": "bash", "code": 'echo "PATH=$PATH"'},
            },
            {
                "id": "python_json",
                "name": "Python JSON",
                "type": "script",
                "config": {"language": "python", "code": "import json; print(json.dumps({'status': 'ok'}))"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "bash_env"},
            {"from": "bash_env", "to": "python_json"},
        ],
    },
]
