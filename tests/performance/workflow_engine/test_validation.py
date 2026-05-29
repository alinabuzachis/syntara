"""Suite 2 — Workflow Engine: Validation KPI (2.3).

Test 2.3: Create workflows with invalid definitions mixed in
    KPI: Validation Performance < 200ms p95
    MetricType: WORKFLOW_VALIDATION_DURATION

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import compute_percentile, poll_for_component_kpis
from tests.performance.workflow_engine.conftest import build_workflow_definition

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry
from nexus_api_client.models.workflow_definition import WorkflowDefinition

pytestmark = pytest.mark.performance

TARGET_VALIDATION_P95_MS = 200
TOTAL_WORKFLOWS = 50
INVALID_RATIO = 0.3

INVALID_DEFINITIONS: list[dict[str, Any]] = [
    {
        "schema_version": "2.0.0",
        "triggers": [],
        "nodes": [
            {
                "id": "orphan_node",
                "name": "Orphan",
                "type": "script",
                "config": {"language": "python", "code": "print('orphan')"},
            }
        ],
        "edges": [],
    },
    {
        "schema_version": "1.0.0",
        "triggers": [{"id": "t", "type": "manual_trigger", "config": {}}],
        "nodes": [],
        "edges": [],
    },
    {
        "schema_version": "2.0.0",
        "nodes": [
            {
                "id": "no_trigger",
                "name": "No Trigger",
                "type": "script",
                "config": {"language": "python", "code": "print('no trigger')"},
            }
        ],
        "edges": [],
    },
    {
        "schema_version": "2.0.0",
        "triggers": [{"id": "trigger_manual", "type": "manual_trigger", "config": {}}],
        "nodes": [
            {
                "id": "node_a",
                "name": "Node A",
                "type": "script",
                "config": {"language": "python", "code": "print('a')"},
            }
        ],
        "edges": [
            {"from": "trigger_manual", "to": "nonexistent_node"},
        ],
    },
    {
        "schema_version": "2.0.0",
        "triggers": [{"id": "trigger_manual", "type": "manual_trigger", "config": {}}],
        "nodes": [
            {
                "id": "node_a",
                "name": "Node A",
                "type": "script",
                "config": {"language": "python", "code": "print('a')"},
            },
            {
                "id": "node_b",
                "name": "Node B",
                "type": "script",
                "config": {"language": "python", "code": "print('b')"},
            },
        ],
        "edges": [
            {"from": "trigger_manual", "to": "node_a"},
        ],
    },
]


class TestValidationPerformance:
    """2.3 — Create workflows with invalid definitions mixed in.

    Validates:
        - Server-side validation_duration_ms.p95 < 200ms
        - Invalid definitions are rejected (non-2xx) and valid ones succeed
        - Validation speed is acceptable regardless of definition validity
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_validation_with_mixed_definitions_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Mixed valid/invalid workflow definitions; validation p95 must be < 200ms."""
        created_ids: list[str] = []
        client_times: list[float] = []
        valid_count = 0
        invalid_count = 0
        valid_successes = 0
        invalid_rejections = 0

        num_invalid = int(TOTAL_WORKFLOWS * INVALID_RATIO)
        num_valid = TOTAL_WORKFLOWS - num_invalid

        valid_complexities = [5, 10, 20, 30, 50]

        try:
            for i in range(num_valid):
                wf_name = f"perf-suite2-val-valid-{uuid4().hex[:6]}"
                complexity = valid_complexities[i % len(valid_complexities)]
                definition = build_workflow_definition(complexity)

                start = time.monotonic()
                r = nexus_api.workflows.create(
                    body=WorkflowCreate(
                        name=wf_name,
                        description=f"Validation test: valid {complexity} nodes",
                        workflow_definition=definition,
                    ),
                )
                elapsed_ms = (time.monotonic() - start) * 1000
                client_times.append(elapsed_ms)
                valid_count += 1

                if r.is_success and r.parsed:
                    valid_successes += 1
                    created_ids.append(r.parsed.id)

            for i in range(num_invalid):
                wf_name = f"perf-suite2-val-invalid-{uuid4().hex[:6]}"

                start = time.monotonic()
                r = nexus_api.workflows.create(
                    body=WorkflowCreate(
                        name=wf_name,
                        description="Validation test: invalid definition",
                        workflow_definition=WorkflowDefinition.from_dict(
                            INVALID_DEFINITIONS[i % len(INVALID_DEFINITIONS)]
                        ),
                    ),
                )
                elapsed_ms = (time.monotonic() - start) * 1000
                client_times.append(elapsed_ms)
                invalid_count += 1

                if not r.is_success:
                    invalid_rejections += 1

            kpis = poll_for_component_kpis(nexus_api.internal_metrics, "workflow_engine")
            server_validation = kpis.get("metrics", {}).get(
                "validation_duration_ms",
                {},
            )
            server_p95 = server_validation.get("p95", 0)
            server_count = server_validation.get("count", 0)

            client_p95 = compute_percentile(client_times, 95)

            diag = (
                f"\n--- Validation results ---\n"
                f"  valid: submitted={valid_count}, succeeded={valid_successes}\n"
                f"  invalid: submitted={invalid_count}, rejected={invalid_rejections}\n"
                f"  client_p95={client_p95:.1f}ms (includes network + full request)\n"
                f"  server: count={server_count}, p95={server_p95}ms\n"
            )

            assert server_p95 < TARGET_VALIDATION_P95_MS, (
                f"Server-reported validation p95 {server_p95}ms exceeds target {TARGET_VALIDATION_P95_MS}ms{diag}"
            )

            assert valid_successes == valid_count, (
                f"Expected all {valid_count} valid workflows to succeed, but only {valid_successes} did{diag}"
            )

            assert invalid_rejections > 0, f"Expected some invalid workflows to be rejected, but none were{diag}"
        finally:
            for wf_id in created_ids:
                try:
                    nexus_api.workflows.delete(workflow_id=wf_id)
                except Exception:
                    pass
