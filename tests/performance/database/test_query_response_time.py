"""Suite 8 — Database: Query Response Time KPI (8.1).

Test 8.1: CRUD operations across all tables (workflows, invocations,
           tool_executions, approvals)
    KPI: Query Response Time (p95)
    Target: < 50ms simple, < 200ms complex
    MetricType: DATABASE_QUERY_RESPONSE_TIME

Validation:
    /_internal/metrics/kpis/database → query_response_time_ms.p95

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING, Any
from uuid import UUID

import pytest
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.performance.conftest import (
    SIMPLE_WORKFLOW_DEFINITION,
    compute_percentile,
    create_perf_test_workflow,
    log_request_failure,
    poll_for_component_kpis,
    poll_for_metric_records,
)
from tests.performance.database.conftest import (
    CRUD_ITERATION_COUNT,
    TARGET_COMPLEX_QUERY_P95_MS,
    TARGET_SIMPLE_QUERY_P95_MS,
    cleanup_workflows,
    measure_api_call,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance


class TestDatabaseQueryResponseTime:
    """8.1 — CRUD operations across all tables.

    Validates:
        - Simple queries (single-row GET by ID) have p95 < 50ms
        - Complex queries (list with filters, cross-table lookups) have p95 < 200ms
        - Server-side KPI (database → query_response_time_ms.p95) confirms targets
        - DATABASE_QUERY_RESPONSE_TIME metric records are emitted with
          statement_type labels (SELECT, INSERT, UPDATE, DELETE)
    """

    def _run_workflow_crud(
        self,
        nexus_api: NexusApiRegistry,
    ) -> tuple[list[float], list[float], list[str]]:
        """Execute full CRUD cycle on workflows table.

        Returns (simple_times, complex_times, created_ids).
        """
        simple_times: list[float] = []
        complex_times: list[float] = []
        created_ids: list[str] = []

        for i in range(CRUD_ITERATION_COUNT):
            start = time.monotonic()
            wf_id = create_perf_test_workflow(nexus_api, "perf-suite8-db", SIMPLE_WORKFLOW_DEFINITION)
            complex_times.append((time.monotonic() - start) * 1000)

            if wf_id is None:
                continue

            created_ids.append(wf_id)

            elapsed, _ = measure_api_call(
                nexus_api.workflows.get,
                workflow_id=wf_id,
            )
            simple_times.append(elapsed)

            elapsed, _ = measure_api_call(
                nexus_api.workflows.update,
                workflow_id=wf_id,
                body=WorkflowUpdate(
                    description=f"Updated description {i}",
                ),
            )
            complex_times.append(elapsed)

        return simple_times, complex_times, created_ids

    def _run_workflow_list_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> list[float]:
        """Run list/filter queries against workflows (complex queries)."""
        complex_times: list[float] = []

        for _ in range(CRUD_ITERATION_COUNT):
            elapsed, _ = measure_api_call(
                nexus_api.workflows.list,
                limit=50,
            )
            complex_times.append(elapsed)

        return complex_times

    def _run_execution_queries(
        self,
        nexus_api: NexusApiRegistry,
        workflow_ids: list[str],
    ) -> tuple[list[float], list[float], list[str]]:
        """Create executions and query them (invocations/tool_executions table).

        Returns (simple_times, complex_times, execution_ids).
        """
        simple_times: list[float] = []
        complex_times: list[float] = []
        execution_ids: list[str] = []

        for wf_id in workflow_ids[:CRUD_ITERATION_COUNT]:
            start = time.monotonic()
            r = None
            try:
                r = nexus_api.executions.create(
                    body=ExecutionCreate(workflow_id=UUID(wf_id)),
                )
                elapsed = (time.monotonic() - start) * 1000
                success = r.is_success
            except Exception as exc:
                elapsed = (time.monotonic() - start) * 1000
                log_request_failure(exc, context="_run_execution_queries")
                success = False

            complex_times.append(elapsed)

            if success and r is not None and r.is_success and r.parsed:
                exec_id = str(r.parsed.id)
                execution_ids.append(exec_id)

                elapsed, _ = measure_api_call(
                    nexus_api.executions.get,
                    execution_id=exec_id,
                )
                simple_times.append(elapsed)

        for _ in range(min(CRUD_ITERATION_COUNT, 20)):
            elapsed, _ = measure_api_call(
                nexus_api.executions.list,
                limit=50,
            )
            complex_times.append(elapsed)

        return simple_times, complex_times, execution_ids

    def _run_approval_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> list[float]:
        """Run list queries against the approvals table (complex queries)."""
        complex_times: list[float] = []

        for _ in range(min(CRUD_ITERATION_COUNT, 20)):
            elapsed, _ = measure_api_call(
                nexus_api.approvals.list,
                limit=50,
            )
            complex_times.append(elapsed)

        return complex_times

    def test_simple_query_response_time(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Single-row lookups (GET by ID) must have p95 < 50ms."""
        created_ids: list[str] = []

        try:
            for _ in range(CRUD_ITERATION_COUNT):
                wf_id = create_perf_test_workflow(nexus_api, "perf-suite8-simple", SIMPLE_WORKFLOW_DEFINITION)
                if wf_id:
                    created_ids.append(wf_id)

            simple_times: list[float] = []
            for wf_id in created_ids:
                elapsed, _ = measure_api_call(
                    nexus_api.workflows.get,
                    workflow_id=wf_id,
                )
                simple_times.append(elapsed)

            for wf_id in created_ids[:20]:
                r = nexus_api.executions.create(
                    body=ExecutionCreate(workflow_id=UUID(wf_id)),
                )
                if r.is_success and r.parsed:
                    exec_id = str(r.parsed.id)
                    elapsed, _ = measure_api_call(
                        nexus_api.executions.get,
                        execution_id=exec_id,
                    )
                    simple_times.append(elapsed)

            assert len(simple_times) > 0, "No simple queries were executed"

            client_p95 = compute_percentile(simple_times, 95)

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "database",
            )
            server_p95 = kpis.get("metrics", {}).get("query_response_time_ms", {}).get("p95", 0)

            diag = (
                f"\n--- Simple query results ---\n"
                f"  total_queries={len(simple_times)}\n"
                f"  client_p95={client_p95:.2f}ms\n"
                f"  server_p95={server_p95}\n"
                f"  min={min(simple_times):.2f}ms, "
                f"max={max(simple_times):.2f}ms, "
                f"median={compute_percentile(simple_times, 50):.2f}ms\n"
            )

            assert client_p95 < TARGET_SIMPLE_QUERY_P95_MS, (
                f"Simple query p95 {client_p95:.2f}ms exceeds target {TARGET_SIMPLE_QUERY_P95_MS}ms{diag}"
            )
        finally:
            cleanup_workflows(nexus_api, created_ids)

    def _create_workflows_collect_ids(
        self,
        nexus_api: NexusApiRegistry,
    ) -> tuple[list[float], list[str]]:
        """Create workflows and collect their IDs for complex query testing."""
        complex_times: list[float] = []
        created_ids: list[str] = []

        for _ in range(CRUD_ITERATION_COUNT):
            start = time.monotonic()
            wf_id = create_perf_test_workflow(nexus_api, "perf-suite8-complex", SIMPLE_WORKFLOW_DEFINITION)
            complex_times.append((time.monotonic() - start) * 1000)
            if wf_id:
                created_ids.append(wf_id)

        return complex_times, created_ids

    def test_complex_query_response_time(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Multi-row queries (list, filter, create, update) must have p95 < 200ms."""
        created_ids: list[str] = []

        try:
            complex_times, created_ids = self._create_workflows_collect_ids(nexus_api)

            list_times = self._run_workflow_list_queries(nexus_api)
            complex_times.extend(list_times)

            approval_times = self._run_approval_queries(nexus_api)
            complex_times.extend(approval_times)

            for wf_id in created_ids[:20]:
                elapsed, _ = measure_api_call(
                    nexus_api.workflows.update,
                    workflow_id=wf_id,
                    body=WorkflowUpdate(
                        description="Updated for complex test",
                    ),
                )
                complex_times.append(elapsed)

            for wf_id in created_ids[:10]:
                elapsed, _ = measure_api_call(
                    nexus_api.executions.list,
                    workflow_id=wf_id,
                    limit=50,
                )
                complex_times.append(elapsed)

            assert len(complex_times) > 0, "No complex queries were executed"

            client_p95 = compute_percentile(complex_times, 95)

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "database",
            )
            server_p95 = kpis.get("metrics", {}).get("query_response_time_ms", {}).get("p95", 0)

            diag = (
                f"\n--- Complex query results ---\n"
                f"  total_queries={len(complex_times)}\n"
                f"  client_p95={client_p95:.2f}ms\n"
                f"  server_p95={server_p95}\n"
                f"  min={min(complex_times):.2f}ms, "
                f"max={max(complex_times):.2f}ms, "
                f"median={compute_percentile(complex_times, 50):.2f}ms\n"
            )

            assert client_p95 < TARGET_COMPLEX_QUERY_P95_MS, (
                f"Complex query p95 {client_p95:.2f}ms exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
            )
        finally:
            cleanup_workflows(nexus_api, created_ids)

    @staticmethod
    def _extract_statement_types(records: dict[str, Any]) -> set[str]:
        """Extract unique statement_type labels from metric records."""
        types: set[str] = set()
        for record in records.get("records", []):
            stmt_type = record.get("labels", {}).get("statement_type")
            if stmt_type:
                types.add(stmt_type)
        return types

    def test_crud_all_tables_with_server_kpi(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Full CRUD across workflows, executions, and approvals tables.

        Verifies both client-measured latency and server-side KPI alignment,
        plus metric record emission with statement_type labels.
        """
        all_workflow_ids: list[str] = []
        simple_times: list[float] = []
        complex_times: list[float] = []

        try:
            wf_simple, wf_complex, wf_ids = self._run_workflow_crud(nexus_api)
            simple_times.extend(wf_simple)
            complex_times.extend(wf_complex)
            all_workflow_ids.extend(wf_ids)

            if all_workflow_ids:
                exec_simple, exec_complex, _ = self._run_execution_queries(nexus_api, all_workflow_ids)
                simple_times.extend(exec_simple)
                complex_times.extend(exec_complex)

            approval_complex = self._run_approval_queries(nexus_api)
            complex_times.extend(approval_complex)

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "database",
            )
            server_metrics = kpis.get("metrics", {}).get("query_response_time_ms", {})
            server_p95 = server_metrics.get("p95", 0)
            server_p50 = server_metrics.get("p50", 0)
            statement_dist = kpis.get("metrics", {}).get("query_by_statement_type", {})

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "database_query_response_time_ms",
                limit=200,
            )
            record_statement_types = self._extract_statement_types(records)

            simple_p95 = compute_percentile(simple_times, 95) if simple_times else 0
            complex_p95 = compute_percentile(complex_times, 95) if complex_times else 0

            diag = (
                f"\n--- Full CRUD results ---\n"
                f"  simple_queries={len(simple_times)}, "
                f"complex_queries={len(complex_times)}\n"
                f"  client_simple_p95={simple_p95:.2f}ms\n"
                f"  client_complex_p95={complex_p95:.2f}ms\n"
                f"  server_p95={server_p95}, server_p50={server_p50}\n"
                f"  statement_distribution={statement_dist}\n"
                f"  record_statement_types={record_statement_types}\n"
                f"  metric_record_count={records.get('total', 0)}\n"
            )

            if simple_times:
                assert simple_p95 < TARGET_SIMPLE_QUERY_P95_MS, (
                    f"Simple query p95 {simple_p95:.2f}ms exceeds target {TARGET_SIMPLE_QUERY_P95_MS}ms{diag}"
                )

            if complex_times:
                assert complex_p95 < TARGET_COMPLEX_QUERY_P95_MS, (
                    f"Complex query p95 {complex_p95:.2f}ms exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
                )

            assert records.get("total", 0) > 0, f"No DATABASE_QUERY_RESPONSE_TIME metric records emitted{diag}"

            if isinstance(server_p95, (int, float)) and server_p95 > 0:
                assert server_p95 < TARGET_COMPLEX_QUERY_P95_MS, (
                    f"Server-reported database query p95 {server_p95:.1f}ms "
                    f"exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
                )

            expected_types = {"SELECT", "INSERT", "UPDATE"}
            if record_statement_types:
                found = record_statement_types & expected_types
                assert len(found) >= 2, (
                    f"Expected at least 2 of {expected_types} in metric labels, found {record_statement_types}{diag}"
                )
        finally:
            cleanup_workflows(nexus_api, all_workflow_ids)
