"""Suite 8 — Database: Transaction Rate KPI (8.3).

Test 8.3: Mixed read/write workload
    KPI: Transaction Rate (capacity planning metric)
    MetricType: DATABASE_TRANSACTION_RATE

Validation:
    /_internal/metrics/kpis/database → total_transactions

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING, Any
from uuid import UUID, uuid4

import pytest
from nexus_api_client.models.execution_create import ExecutionCreate
from nexus_api_client.models.workflow_update import WorkflowUpdate

from tests.performance.conftest import (
    _log_request_failure,
    make_request,
    poll_for_component_kpis,
    poll_for_metric_records,
)
from tests.performance.database.conftest import (
    cleanup_workflows,
    create_workflow_pool,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

WORKLOAD_DURATION_SECONDS = 60
READ_WRITE_RATIO = 3
WRITE_WORKERS = 10
READ_WORKERS = 30
SETUP_WORKFLOW_COUNT = 20


def _write_operation(nexus_api: NexusApiRegistry, workflow_ids: list[str]) -> tuple[float, bool]:
    """Perform a single write operation (create execution or update workflow).

    Args:
        nexus_api: Authenticated API client registry.
        workflow_ids: Pool of existing workflow IDs to operate on.

    Returns:
        Tuple of (elapsed_ms, success).

    """
    start = time.monotonic()
    try:
        if workflow_ids and uuid4().int % 2 == 0:
            wf_id = workflow_ids[uuid4().int % len(workflow_ids)]
            r = nexus_api.workflows.update(
                workflow_id=wf_id,
                body=WorkflowUpdate(
                    description=f"txn-rate-test-{uuid4().hex[:6]}",
                ),
            )
        else:
            wf_id = workflow_ids[uuid4().int % len(workflow_ids)] if workflow_ids else ""
            if not wf_id:
                return (time.monotonic() - start) * 1000, False
            r = nexus_api.executions.create(
                body=ExecutionCreate(workflow_id=UUID(wf_id)),
            )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success or r.status_code in (200, 201, 202)
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        _log_request_failure(exc, context="_write_operation")
        return elapsed_ms, False


class TestDatabaseTransactionRate:
    """8.3 — Mixed read/write workload for transaction rate capacity planning.

    Validates:
        - The system sustains a mixed read/write workload without degradation
        - Transaction rate (commits/sec) is recorded by the metrics system
        - DATABASE_TRANSACTION_RATE metric records are emitted
        - Server-side KPI (database → total_transactions) reflects the load
    """

    def _run_mixed_workload(
        self,
        nexus_api: NexusApiRegistry,
        workflow_ids: list[str],
    ) -> dict[str, Any]:
        """Run a mixed read/write workload for the configured duration.

        Args:
            nexus_api: Authenticated API client registry.
            workflow_ids: Pool of workflow IDs for write operations.

        Returns:
            Dict with workload statistics (reads, writes, errors, duration).

        """
        read_futures: list[Future[tuple[float, bool]]] = []
        write_futures: list[Future[tuple[float, bool]]] = []

        total_workers = READ_WORKERS + WRITE_WORKERS
        end_time = time.monotonic() + WORKLOAD_DURATION_SECONDS

        with ThreadPoolExecutor(max_workers=total_workers) as executor:
            while time.monotonic() < end_time:
                batch_start = time.monotonic()

                for _ in range(READ_WRITE_RATIO):
                    read_futures.append(executor.submit(make_request, nexus_api, limit=10))

                write_futures.append(executor.submit(_write_operation, nexus_api, workflow_ids))

                elapsed = time.monotonic() - batch_start
                target_interval = 1.0 / (READ_WORKERS + WRITE_WORKERS)
                sleep_for = target_interval - elapsed
                if sleep_for > 0:
                    time.sleep(sleep_for)

        read_completed = 0
        read_errors = 0
        for future in read_futures:
            try:
                _, success = future.result(timeout=30)
                read_completed += 1
                if not success:
                    read_errors += 1
            except Exception as exc:
                _log_request_failure(exc, context="_run_mixed_workload[read]")
                read_errors += 1

        write_completed = 0
        write_errors = 0
        for future in write_futures:
            try:
                _, success = future.result(timeout=30)
                write_completed += 1
                if not success:
                    write_errors += 1
            except Exception as exc:
                _log_request_failure(exc, context="_run_mixed_workload[write]")
                write_errors += 1

        return {
            "read_completed": read_completed,
            "read_errors": read_errors,
            "write_completed": write_completed,
            "write_errors": write_errors,
            "total_operations": read_completed + write_completed,
            "total_errors": read_errors + write_errors,
        }

    def test_transaction_rate_under_mixed_workload(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Mixed read/write workload must produce measurable transaction rate."""
        workflow_ids: list[str] = []

        try:
            workflow_ids = create_workflow_pool(nexus_api, "perf-suite8-txn", SETUP_WORKFLOW_COUNT)
            assert len(workflow_ids) > 0, "Failed to create any test workflows"

            stats = self._run_mixed_workload(nexus_api, workflow_ids)

            kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database")
            total_transactions = kpis.get("metrics", {}).get("total_transactions", 0)
            statement_dist = kpis.get("metrics", {}).get("query_by_statement_type", {})

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "database_transaction_rate_tps",
                limit=200,
            )

            operations_per_sec = (
                stats["total_operations"] / WORKLOAD_DURATION_SECONDS if stats["total_operations"] > 0 else 0
            )
            error_rate = stats["total_errors"] / stats["total_operations"] if stats["total_operations"] > 0 else 1.0

            diag = (
                f"\n--- Transaction rate results ---\n"
                f"  duration={WORKLOAD_DURATION_SECONDS}s\n"
                f"  reads={stats['read_completed']}, "
                f"writes={stats['write_completed']}\n"
                f"  read_errors={stats['read_errors']}, "
                f"write_errors={stats['write_errors']}\n"
                f"  operations_per_sec={operations_per_sec:.1f}\n"
                f"  error_rate={error_rate:.2%}\n"
                f"  server_total_transactions={total_transactions}\n"
                f"  statement_distribution={statement_dist}\n"
                f"  txn_metric_records={records.get('total', 0)}\n"
            )

            assert stats["total_operations"] > 0, f"No operations completed during mixed workload{diag}"

            assert stats["write_completed"] > 0, f"No write operations completed during mixed workload{diag}"

            assert error_rate < 0.20, f"Error rate {error_rate:.2%} exceeds 20% threshold during mixed workload{diag}"

            assert total_transactions > 0, (
                f"Server reported 0 total_transactions — DATABASE_TRANSACTION_RATE not recording commits{diag}"
            )

            if statement_dist:
                has_reads = statement_dist.get("SELECT", 0) > 0
                has_writes = statement_dist.get("INSERT", 0) > 0 or statement_dist.get("UPDATE", 0) > 0
                assert has_reads, f"Expected read statements (SELECT) in distribution, got {statement_dist}{diag}"
                assert has_writes, (
                    f"Expected write statements (INSERT/UPDATE) in distribution, got {statement_dist}{diag}"
                )
        finally:
            cleanup_workflows(nexus_api, workflow_ids)

    def test_transaction_rate_scales_with_load(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Transaction rate should increase proportionally with write load.

        Runs two phases at different write intensities and confirms the
        server-recorded transaction count reflects the increased load.
        """
        workflow_ids: list[str] = []

        try:
            workflow_ids = create_workflow_pool(nexus_api, "perf-suite8-txn", SETUP_WORKFLOW_COUNT)
            assert len(workflow_ids) > 0, "Failed to create any test workflows"

            nexus_api.internal_metrics.reset_store().assert_successful()

            phase1_writes = 0
            with ThreadPoolExecutor(max_workers=5) as executor:
                futures: list[Future[tuple[float, bool]]] = []
                for _ in range(20):
                    futures.append(executor.submit(_write_operation, nexus_api, workflow_ids))
                for future in as_completed(futures):
                    _, success = future.result(timeout=30)
                    if success:
                        phase1_writes += 1

            kpis_phase1 = poll_for_component_kpis(nexus_api.internal_metrics, "database")
            txn_phase1 = kpis_phase1.get("metrics", {}).get("total_transactions", 0)

            nexus_api.internal_metrics.reset_store().assert_successful()

            phase2_writes = 0
            with ThreadPoolExecutor(max_workers=10) as executor:
                futures = []
                for _ in range(50):
                    futures.append(executor.submit(_write_operation, nexus_api, workflow_ids))
                for future in as_completed(futures):
                    _, success = future.result(timeout=30)
                    if success:
                        phase2_writes += 1

            kpis_phase2 = poll_for_component_kpis(nexus_api.internal_metrics, "database")
            txn_phase2 = kpis_phase2.get("metrics", {}).get("total_transactions", 0)

            diag = (
                f"\n--- Transaction scaling results ---\n"
                f"  phase1: writes={phase1_writes}, transactions={txn_phase1}\n"
                f"  phase2: writes={phase2_writes}, transactions={txn_phase2}\n"
            )

            assert txn_phase1 > 0, f"Phase 1 recorded 0 transactions{diag}"
            assert txn_phase2 > 0, f"Phase 2 recorded 0 transactions{diag}"
            assert txn_phase2 > txn_phase1, f"Transaction count did not scale with increased load{diag}"
        finally:
            cleanup_workflows(nexus_api, workflow_ids)
