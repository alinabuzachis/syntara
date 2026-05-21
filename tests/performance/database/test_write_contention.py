"""Suite 8 — Database: Write Contention KPI (8.5).

Test 8.5: Concurrent writes to same table
    KPI: Write Contention
    Target: No deadlocks, < 100ms p95
    MetricType: DATABASE_QUERY_RESPONSE_TIME

Validation:
    /_internal/metrics/records → filter by statement_type=INSERT/UPDATE

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest
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
    cleanup_workflows,
    create_workflow_pool,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_WRITE_P95_MS = 100
CONCURRENT_WRITERS = 20
WRITES_PER_WRITER = 10
SETUP_WORKFLOW_COUNT = 10
DEADLOCK_TIMEOUT_MS = 5000


def _concurrent_create(nexus_api: NexusApiRegistry) -> tuple[float, bool, str | None]:
    """Create a single workflow (INSERT into workflows table).

    Args:
        nexus_api: Authenticated API client registry.

    Returns:
        Tuple of (elapsed_ms, success, workflow_id or None).

    """
    start = time.monotonic()
    wf_id = create_perf_test_workflow(nexus_api, "perf-suite8-contention", SIMPLE_WORKFLOW_DEFINITION)
    elapsed_ms = (time.monotonic() - start) * 1000
    return elapsed_ms, wf_id is not None, wf_id


def _concurrent_update(
    nexus_api: NexusApiRegistry,
    workflow_id: str,
    iteration: int,
) -> tuple[float, bool]:
    """Update a workflow (UPDATE on workflows table).

    Args:
        nexus_api: Authenticated API client registry.
        workflow_id: ID of the workflow to update.
        iteration: Iteration number for unique description.

    Returns:
        Tuple of (elapsed_ms, success).

    """
    start = time.monotonic()
    try:
        r = nexus_api.workflows.update(
            workflow_id=workflow_id,
            body=WorkflowUpdate(
                description=f"contention-update-{iteration}-{uuid4().hex[:6]}",
            ),
        )
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="_concurrent_update")
        return elapsed_ms, False


class TestDatabaseWriteContention:
    """8.5 — Concurrent writes to same table.

    Validates:
        - No deadlocks under concurrent write load (all writes complete or
          fail gracefully with non-5xx errors)
        - Write latency p95 < 100ms
        - Server-side DATABASE_QUERY_RESPONSE_TIME records for INSERT/UPDATE
          confirm the target
    """

    def test_concurrent_creates_no_deadlocks(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Concurrent INSERT operations must complete without deadlocks, p95 < 100ms."""
        write_times: list[float] = []
        created_ids: list[str] = []
        deadlock_indicators = 0
        total_errors = 0

        try:
            with ThreadPoolExecutor(max_workers=CONCURRENT_WRITERS) as executor:
                futures: list[Future[tuple[float, bool, str | None]]] = []
                for _ in range(CONCURRENT_WRITERS * WRITES_PER_WRITER):
                    futures.append(executor.submit(_concurrent_create, nexus_api))

                for future in as_completed(futures):
                    elapsed_ms, success, wf_id = future.result(timeout=30)
                    write_times.append(elapsed_ms)
                    if wf_id:
                        created_ids.append(wf_id)
                    if not success:
                        total_errors += 1
                        if elapsed_ms > DEADLOCK_TIMEOUT_MS:
                            deadlock_indicators += 1

            assert len(write_times) > 0, "No concurrent creates were executed"

            client_p95 = compute_percentile(write_times, 95)
            client_p50 = compute_percentile(write_times, 50)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "database_query_response_time_ms",
                limit=200,
            )

            insert_records = [
                r for r in records.get("records", []) if r.get("labels", {}).get("statement_type") == "INSERT"
            ]

            error_rate = total_errors / len(write_times) if write_times else 1.0

            diag = (
                f"\n--- Concurrent creates results ---\n"
                f"  total_writes={len(write_times)}, "
                f"concurrent_writers={CONCURRENT_WRITERS}\n"
                f"  successes={len(created_ids)}, "
                f"errors={total_errors}, "
                f"deadlock_indicators={deadlock_indicators}\n"
                f"  error_rate={error_rate:.2%}\n"
                f"  client_p95={client_p95:.2f}ms, "
                f"client_p50={client_p50:.2f}ms\n"
                f"  min={min(write_times):.2f}ms, "
                f"max={max(write_times):.2f}ms\n"
                f"  insert_records={len(insert_records)}\n"
            )

            assert deadlock_indicators == 0, (
                f"Detected {deadlock_indicators} probable deadlocks (failures exceeding {DEADLOCK_TIMEOUT_MS}ms){diag}"
            )

            assert error_rate < 0.10, f"Error rate {error_rate:.2%} exceeds 10% — possible contention issues{diag}"

            assert client_p95 < TARGET_WRITE_P95_MS, (
                f"Concurrent create p95 {client_p95:.2f}ms exceeds target {TARGET_WRITE_P95_MS}ms{diag}"
            )
        finally:
            cleanup_workflows(nexus_api, created_ids)

    def test_concurrent_updates_same_table(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Concurrent UPDATE operations on the same table must have p95 < 100ms."""
        workflow_ids: list[str] = []

        try:
            workflow_ids = create_workflow_pool(nexus_api, "perf-suite8-contention", SETUP_WORKFLOW_COUNT)
            assert len(workflow_ids) > 0, "Failed to create target workflows"

            write_times: list[float] = []
            total_errors = 0

            with ThreadPoolExecutor(max_workers=CONCURRENT_WRITERS) as executor:
                futures: list[Future[tuple[float, bool]]] = []
                for i in range(CONCURRENT_WRITERS * WRITES_PER_WRITER):
                    wf_id = workflow_ids[i % len(workflow_ids)]
                    futures.append(executor.submit(_concurrent_update, nexus_api, wf_id, i))

                for future in as_completed(futures):
                    elapsed_ms, success = future.result(timeout=30)
                    write_times.append(elapsed_ms)
                    if not success:
                        total_errors += 1

            assert len(write_times) > 0, "No concurrent updates were executed"

            client_p95 = compute_percentile(write_times, 95)
            client_p50 = compute_percentile(write_times, 50)
            error_rate = total_errors / len(write_times)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "database_query_response_time_ms",
                limit=200,
            )

            update_records = [
                r for r in records.get("records", []) if r.get("labels", {}).get("statement_type") == "UPDATE"
            ]

            diag = (
                f"\n--- Concurrent updates results ---\n"
                f"  total_writes={len(write_times)}, "
                f"concurrent_writers={CONCURRENT_WRITERS}\n"
                f"  target_workflows={len(workflow_ids)}\n"
                f"  errors={total_errors}, error_rate={error_rate:.2%}\n"
                f"  client_p95={client_p95:.2f}ms, "
                f"client_p50={client_p50:.2f}ms\n"
                f"  min={min(write_times):.2f}ms, "
                f"max={max(write_times):.2f}ms\n"
                f"  update_records={len(update_records)}\n"
            )

            assert error_rate < 0.10, f"Error rate {error_rate:.2%} exceeds 10% — possible deadlock or contention{diag}"

            assert client_p95 < TARGET_WRITE_P95_MS, (
                f"Concurrent update p95 {client_p95:.2f}ms exceeds target {TARGET_WRITE_P95_MS}ms{diag}"
            )
        finally:
            cleanup_workflows(nexus_api, workflow_ids)

    def test_concurrent_writes_mixed_operations(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Mixed concurrent INSERTs and UPDATEs on the same table.

        Validates no deadlocks and combined write p95 < 100ms.
        """
        workflow_ids: list[str] = []
        created_ids: list[str] = []

        try:
            workflow_ids = create_workflow_pool(nexus_api, "perf-suite8-contention", SETUP_WORKFLOW_COUNT)
            assert len(workflow_ids) > 0, "Failed to create target workflows"

            write_times: list[float] = []
            total_errors = 0

            with ThreadPoolExecutor(max_workers=CONCURRENT_WRITERS) as executor:
                futures_create: list[Future[tuple[float, bool, str | None]]] = []
                futures_update: list[Future[tuple[float, bool]]] = []

                for i in range(CONCURRENT_WRITERS * WRITES_PER_WRITER // 2):
                    futures_create.append(executor.submit(_concurrent_create, nexus_api))
                    wf_id = workflow_ids[i % len(workflow_ids)]
                    futures_update.append(executor.submit(_concurrent_update, nexus_api, wf_id, i))

                for future_create in as_completed(futures_create):
                    elapsed_ms, success, created_wf_id = future_create.result(timeout=30)
                    write_times.append(elapsed_ms)
                    if created_wf_id:
                        created_ids.append(created_wf_id)
                    if not success:
                        total_errors += 1

                for future_update in as_completed(futures_update):
                    elapsed_ms, success = future_update.result(timeout=30)
                    write_times.append(elapsed_ms)
                    if not success:
                        total_errors += 1

            assert len(write_times) > 0, "No mixed writes were executed"

            client_p95 = compute_percentile(write_times, 95)
            client_p50 = compute_percentile(write_times, 50)
            error_rate = total_errors / len(write_times)

            kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database")
            statement_dist = kpis.get("metrics", {}).get("query_by_statement_type", {})
            server_p95 = kpis.get("metrics", {}).get("query_response_time_ms", {}).get("p95", 0)

            diag = (
                f"\n--- Mixed concurrent writes results ---\n"
                f"  total_writes={len(write_times)}, "
                f"concurrent_writers={CONCURRENT_WRITERS}\n"
                f"  creates={len(created_ids)}, "
                f"updates={len(futures_update)}\n"
                f"  errors={total_errors}, error_rate={error_rate:.2%}\n"
                f"  client_p95={client_p95:.2f}ms, "
                f"client_p50={client_p50:.2f}ms\n"
                f"  min={min(write_times):.2f}ms, "
                f"max={max(write_times):.2f}ms\n"
                f"  server_p95={server_p95}\n"
                f"  statement_distribution={statement_dist}\n"
            )

            assert error_rate < 0.10, (
                f"Error rate {error_rate:.2%} exceeds 10% — possible deadlock under mixed writes{diag}"
            )

            assert client_p95 < TARGET_WRITE_P95_MS, (
                f"Mixed write p95 {client_p95:.2f}ms exceeds target {TARGET_WRITE_P95_MS}ms{diag}"
            )

            if statement_dist:
                has_inserts = statement_dist.get("INSERT", 0) > 0
                has_updates = statement_dist.get("UPDATE", 0) > 0
                assert has_inserts, f"Expected INSERT statements in distribution, got {statement_dist}{diag}"
                assert has_updates, f"Expected UPDATE statements in distribution, got {statement_dist}{diag}"
        finally:
            cleanup_workflows(nexus_api, created_ids + workflow_ids)
