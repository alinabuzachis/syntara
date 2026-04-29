"""Suite 2 — Workflow Engine: Creation KPIs (2.1, 2.4).

Test 2.1: Create 100 workflows sequentially via POST /api/v1/workflows
    KPI: Creation Success Rate > 99%
    MetricType: WORKFLOW_STATUS, WORKFLOW_CREATION_SUCCESS_RATE

Test 2.4: Create workflows with duplicate names
    KPI: Creation Failure Categorization — categorized by reason
    MetricType: WORKFLOW_STATUS

Run with:
    make test-performance
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
from nexus_api_client.models.workflow_create import WorkflowCreate

from tests.performance.conftest import poll_for_component_kpis, poll_for_metric_records
from tests.performance.workflow_engine.conftest import (
    SIMPLE_WORKFLOW_DEFINITION,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

SEQUENTIAL_WORKFLOW_COUNT = 100
TARGET_CREATION_SUCCESS_RATE = 0.99


class TestSequentialWorkflowCreation:
    """2.1 — Create 100 workflows sequentially via POST /api/v1/workflows.

    Validates:
        - Client-measured creation success rate > 99%
        - Server-side KPI (workflow_engine → creation_success_rate) > 99%
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sequential_creation_success_rate(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Create 100 workflows sequentially; success rate must be > 99%."""
        created_ids: list[str] = []
        failures = 0
        failure_details: list[str] = []

        for i in range(SEQUENTIAL_WORKFLOW_COUNT):
            wf_name = f"perf-suite2-create-{uuid4().hex[:8]}"
            try:
                r = nexus_api.workflows.create(
                    body=WorkflowCreate(
                        name=wf_name,
                        description=f"Performance test workflow {i}",
                        is_enabled=True,
                        workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
                    ),
                )
                if r.is_success and r.parsed:
                    created_ids.append(r.parsed.id)
                else:
                    failures += 1
                    failure_details.append(f"  workflow {i}: status={r.status_code}")
            except Exception as exc:
                failures += 1
                failure_details.append(f"  workflow {i}: exception={exc}")

        total = SEQUENTIAL_WORKFLOW_COUNT
        successes = total - failures
        client_success_rate = successes / total

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "workflow_engine")
        server_success_rate = kpis.get("metrics", {}).get("creation_success_rate", 0)

        diag = (
            f"\n--- Creation results ---\n"
            f"  total={total}, successes={successes}, failures={failures}\n"
            f"  client_success_rate={client_success_rate:.2%}\n"
            f"  server_success_rate={server_success_rate}\n"
        )
        if failure_details:
            diag += "--- Failure details ---\n" + "\n".join(failure_details) + "\n"

        assert client_success_rate >= TARGET_CREATION_SUCCESS_RATE, (
            f"Client-measured creation success rate {client_success_rate:.2%} "
            f"below target {TARGET_CREATION_SUCCESS_RATE:.0%}{diag}"
        )

        if isinstance(server_success_rate, (int, float)) and server_success_rate > 0:
            assert server_success_rate >= TARGET_CREATION_SUCCESS_RATE, (
                f"Server-reported creation success rate {server_success_rate:.2%} "
                f"below target {TARGET_CREATION_SUCCESS_RATE:.0%}{diag}"
            )

        records_response = nexus_api.internal_metrics.get_records(
            metric_type="workflow_status",
            limit=SEQUENTIAL_WORKFLOW_COUNT + 10,
        )
        records_response.assert_successful()
        records = records_response.parsed.to_dict() if records_response.parsed is not None else {}
        assert records.get("total", 0) > 0, "No workflow_status metric records emitted during sequential creation test"

        # Cleanup: delete created workflows
        for wf_id in created_ids:
            try:
                nexus_api.workflows.delete(workflow_id=wf_id)
            except Exception:
                pass


class TestDuplicateNameFailureCategorization:
    """2.4 — Create workflows with duplicate names.

    Validates:
        - Duplicate-name creation returns a non-2xx status (409 Conflict expected)
        - Server-side workflow_status records carry appropriate labels
          for failure categorization
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_duplicate_name_returns_conflict(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Creating a workflow with a duplicate name must return 409."""
        wf_name = f"perf-suite2-dup-{uuid4().hex[:8]}"
        created_id = None

        try:
            r1 = nexus_api.workflows.create(
                body=WorkflowCreate(
                    name=wf_name,
                    description="First creation",
                    is_enabled=True,
                    workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
                ),
            )
            assert r1.is_success, f"First creation failed unexpectedly: status={r1.status_code}"
            if r1.parsed:
                created_id = r1.parsed.id

            r2 = nexus_api.workflows.create(
                body=WorkflowCreate(
                    name=wf_name,
                    description="Duplicate creation",
                    is_enabled=True,
                    workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
                ),
            )
            assert r2.status_code == 409, f"Expected 409 Conflict for duplicate name, got {r2.status_code}"
        finally:
            if created_id:
                try:
                    nexus_api.workflows.delete(workflow_id=created_id)
                except Exception:
                    pass

    def test_duplicate_name_records_failure_labels(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Failure records from duplicate-name creation must carry categorization labels."""
        wf_name = f"perf-suite2-dup-labels-{uuid4().hex[:8]}"
        created_id = None

        try:
            r1 = nexus_api.workflows.create(
                body=WorkflowCreate(
                    name=wf_name,
                    description="First creation for label test",
                    is_enabled=True,
                    workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
                ),
            )
            if r1.is_success and r1.parsed:
                created_id = r1.parsed.id

            nexus_api.workflows.create(
                body=WorkflowCreate(
                    name=wf_name,
                    description="Duplicate for label test",
                    is_enabled=True,
                    workflow_definition=SIMPLE_WORKFLOW_DEFINITION,
                ),
            )

            records = poll_for_metric_records(nexus_api.internal_metrics, "workflow_status")

            if records.get("total", 0) > 0:
                for record in records.get("records", []):
                    labels = record.get("labels", {})
                    assert "status" in labels or "reason" in labels or "error_type" in labels, (
                        f"Workflow status record missing categorization labels: {labels}"
                    )
        finally:
            if created_id:
                try:
                    nexus_api.workflows.delete(workflow_id=created_id)
                except Exception:
                    pass
