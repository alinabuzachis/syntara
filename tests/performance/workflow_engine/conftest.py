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

from typing import Any


def build_workflow_definition(num_nodes: int) -> dict[str, Any]:
    """Build a valid V2 workflow definition with the specified number of nodes.

    Creates a linear chain: trigger -> node_0 -> node_1 -> ... -> node_{n-1}.
    """
    nodes = [
        {
            "id": f"node_{i}",
            "name": f"Script Task {i}",
            "type": "script",
            "config": {"language": "python", "code": f"print('step {i}')"},
        }
        for i in range(num_nodes)
    ]

    edges: list[dict[str, str]] = [{"from": "trigger_manual", "to": "node_0"}]
    for i in range(num_nodes - 1):
        edges.append({"from": f"node_{i}", "to": f"node_{i + 1}"})

    return {
        "schema_version": "2.0.0",
        "triggers": [
            {
                "id": "trigger_manual",
                "type": "manual_trigger",
                "config": {"inputs": {}},
            }
        ],
        "nodes": nodes,
        "edges": edges,
    }


SIMPLE_WORKFLOW_DEFINITION: dict[str, Any] = build_workflow_definition(1)
