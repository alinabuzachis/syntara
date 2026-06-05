"""Shared fixtures for Suite 2: Workflow Engine performance tests.

These tests run against a live Nexus deployment (typically OpenShift) and
validate the Workflow Engine KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled, compute_percentile) are
defined in the parent tests/performance/conftest.py and inherited
automatically.  This file adds workflow-engine-specific helpers.

Run with:
    make test-performance
"""

from __future__ import annotations

from nexus_api_client.models.workflow_definition import WorkflowDefinition
from nexus_api_client.models.workflow_definition_edges_item import (
    WorkflowDefinitionEdgesItem,
)
from nexus_api_client.models.workflow_definition_nodes_item import (
    WorkflowDefinitionNodesItem,
)
from nexus_api_client.models.workflow_definition_triggers_item import (
    WorkflowDefinitionTriggersItem,
)


def build_workflow_definition(num_nodes: int) -> WorkflowDefinition:
    """Build a valid V2 workflow definition with the specified number of nodes.

    Creates a linear chain: trigger -> node_0 -> node_1 -> ... -> node_{n-1}.
    """
    nodes = [
        WorkflowDefinitionNodesItem.from_dict(
            {
                "id": f"node_{i}",
                "name": f"Script Task {i}",
                "type": "script",
                "config": {"language": "python", "code": f"print('step {i}')"},
            }
        )
        for i in range(num_nodes)
    ]

    edges = [WorkflowDefinitionEdgesItem.from_dict({"from": "trigger_manual", "to": "node_0"})]
    for i in range(num_nodes - 1):
        edges.append(WorkflowDefinitionEdgesItem.from_dict({"from": f"node_{i}", "to": f"node_{i + 1}"}))

    triggers = [
        WorkflowDefinitionTriggersItem.from_dict(
            {
                "id": "trigger_manual",
                "type": "manual_trigger",
                "config": {"inputs": {}},
            }
        )
    ]

    return WorkflowDefinition(
        name="perfomance",
        schema_version="2.0.0",
        triggers=triggers,
        nodes=nodes,
        edges=edges,
    )


SIMPLE_WORKFLOW_DEFINITION: WorkflowDefinition = build_workflow_definition(1)
