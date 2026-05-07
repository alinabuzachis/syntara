"""Suite 8 — Database: Complex Query Latency KPI (8.4).

Test 8.4: List queries with pagination on large datasets (10K+ rows)
    KPI: Complex Query Latency (p95)
    Target: < 200ms p95
    MetricType: DATABASE_QUERY_RESPONSE_TIME

Validation:
    /_internal/metrics/records?metric_type=database_query_response_time_ms
    → filter by statement_type

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    _log_request_failure,
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
)
from tests.performance.database.conftest import (
    TARGET_COMPLEX_QUERY_P95_MS,
    measure_list_api_call,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

PAGINATION_PAGE_SIZES = [10, 25, 50, 100]
PAGES_PER_SIZE = 20
DEEP_PAGE_STEPS = [2, 10, 20, 50]
DEEP_PAGE_SIZE = 50
QUERIES_PER_DEPTH = 5
LIST_ITERATION_COUNT = 50

logger = structlog.get_logger(__name__)


class TestComplexQueryLatency:
    """8.4 — List queries with pagination on large datasets (10K+ rows).

    Validates:
        - Paginated list queries maintain p95 < 200ms regardless of cursor depth
        - Different page sizes do not degrade beyond the target
        - Server-side DATABASE_QUERY_RESPONSE_TIME records confirm latency
        - SELECT statement records are emitted with appropriate values

    Note: This test assumes the target deployment already has a sufficiently
    large dataset (10K+ rows across tables). If the dataset is small, the
    test still validates pagination mechanics but latency may be lower than
    production expectations.
    """

    def _run_paginated_workflow_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> list[float]:
        """Run paginated list queries against workflows with varying page sizes.

        Args:
            nexus_api: Authenticated API client registry.

        Returns:
            List of response times in milliseconds.

        """
        response_times: list[float] = []

        for page_size in PAGINATION_PAGE_SIZES:
            for _ in range(PAGES_PER_SIZE):
                elapsed, _, _ = measure_list_api_call(
                    nexus_api.workflows.list,
                    limit=page_size,
                )
                response_times.append(elapsed)

        return response_times

    def _advance_cursor(
        self,
        nexus_api: NexusApiRegistry,
        pages: int,
    ) -> str | None:
        """Page forward through workflows to obtain a deep cursor.

        Args:
            nexus_api: Authenticated API client registry.
            pages: Number of pages to advance.

        Returns:
            The cursor string at the target depth, or None if exhausted.

        """
        cursor: str | None = None
        for _ in range(pages):
            try:
                r = nexus_api.workflows.list(limit=DEEP_PAGE_SIZE, cursor=cursor)
                if not r.is_success or not r.parsed:
                    break
                next_cursor = r.parsed.next_
                if isinstance(next_cursor, str):
                    cursor = next_cursor
                else:
                    break
            except Exception as exc:
                _log_request_failure(exc, context="_advance_cursor")
                break
        return cursor

    def _run_deep_pagination_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> tuple[list[float], dict[int, float]]:
        """Run list queries at increasing cursor depths to test deep pagination.

        Pages forward to various depths, then measures query latency at each
        depth using the obtained cursor.

        Args:
            nexus_api: Authenticated API client registry.

        Returns:
            Tuple of (all response times, per-depth p95 dict).

        """
        response_times: list[float] = []
        per_depth_times: dict[int, list[float]] = {}

        for page_depth in DEEP_PAGE_STEPS:
            cursor = self._advance_cursor(nexus_api, page_depth)
            if cursor is None:
                logger.info(
                    "Dataset exhausted before reaching target depth",
                    page_depth=page_depth,
                )
                break

            times: list[float] = []
            for _ in range(QUERIES_PER_DEPTH):
                start = time.monotonic()
                try:
                    r = nexus_api.workflows.list(limit=DEEP_PAGE_SIZE, cursor=cursor)
                    elapsed = (time.monotonic() - start) * 1000
                    if not r.is_success:
                        elapsed = (time.monotonic() - start) * 1000
                except Exception as exc:
                    elapsed = (time.monotonic() - start) * 1000
                    _log_request_failure(exc, context="_run_deep_pagination_queries")
                times.append(elapsed)

            per_depth_times[page_depth] = times
            response_times.extend(times)

        per_depth_p95 = {depth: compute_percentile(t, 95) for depth, t in per_depth_times.items()}
        return response_times, per_depth_p95

    def _run_execution_list_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> list[float]:
        """Run paginated list queries against the executions table.

        Args:
            nexus_api: Authenticated API client registry.

        Returns:
            List of response times in milliseconds.

        """
        response_times: list[float] = []

        for page_size in PAGINATION_PAGE_SIZES:
            for _ in range(PAGES_PER_SIZE // 2):
                elapsed, _, _ = measure_list_api_call(
                    nexus_api.executions.list,
                    limit=page_size,
                )
                response_times.append(elapsed)

        return response_times

    def _run_approval_list_queries(
        self,
        nexus_api: NexusApiRegistry,
    ) -> list[float]:
        """Run paginated list queries against the approvals table.

        Args:
            nexus_api: Authenticated API client registry.

        Returns:
            List of response times in milliseconds.

        """
        response_times: list[float] = []

        for page_size in PAGINATION_PAGE_SIZES:
            for _ in range(PAGES_PER_SIZE // 2):
                elapsed, _, _ = measure_list_api_call(
                    nexus_api.approvals.list,
                    limit=page_size,
                )
                response_times.append(elapsed)

        return response_times

    def test_paginated_list_queries_p95(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Paginated list queries across all tables must have p95 < 200ms."""
        workflow_times = self._run_paginated_workflow_queries(nexus_api)
        execution_times = self._run_execution_list_queries(nexus_api)
        approval_times = self._run_approval_list_queries(nexus_api)

        all_times = workflow_times + execution_times + approval_times
        assert len(all_times) > 0, "No paginated queries were executed"

        client_p95 = compute_percentile(all_times, 95)
        client_p50 = compute_percentile(all_times, 50)

        kpis = poll_for_component_kpis(nexus_api.internal_metrics, "database")
        server_p95 = kpis.get("metrics", {}).get("query_response_time_ms", {}).get("p95", 0)

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "database_query_response_time_ms",
            limit=200,
        )

        select_records = [
            r for r in records.get("records", []) if r.get("labels", {}).get("statement_type") == "SELECT"
        ]

        diag = (
            f"\n--- Paginated query results ---\n"
            f"  total_queries={len(all_times)}\n"
            f"  workflows={len(workflow_times)}, "
            f"executions={len(execution_times)}, "
            f"approvals={len(approval_times)}\n"
            f"  client_p95={client_p95:.2f}ms, "
            f"client_p50={client_p50:.2f}ms\n"
            f"  min={min(all_times):.2f}ms, "
            f"max={max(all_times):.2f}ms\n"
            f"  server_p95={server_p95}\n"
            f"  select_record_count={len(select_records)}\n"
            f"  total_metric_records={records.get('total', 0)}\n"
        )

        assert client_p95 < TARGET_COMPLEX_QUERY_P95_MS, (
            f"Paginated query p95 {client_p95:.2f}ms exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
        )

        assert records.get("total", 0) > 0, f"No DATABASE_QUERY_RESPONSE_TIME records emitted{diag}"

        assert len(select_records) > 0, f"No SELECT statement records found in metrics{diag}"

    def test_deep_pagination_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Queries at deep cursor positions must still meet p95 < 200ms target."""
        deep_times, per_depth_p95 = self._run_deep_pagination_queries(nexus_api)

        assert len(deep_times) > 0, "No deep pagination queries were executed"

        client_p95 = compute_percentile(deep_times, 95)
        client_p50 = compute_percentile(deep_times, 50)

        diag = (
            f"\n--- Deep pagination results ---\n"
            f"  total_queries={len(deep_times)}\n"
            f"  client_p95={client_p95:.2f}ms, "
            f"client_p50={client_p50:.2f}ms\n"
            f"  per_depth_p95={per_depth_p95}\n"
            f"  min={min(deep_times):.2f}ms, "
            f"max={max(deep_times):.2f}ms\n"
        )

        assert client_p95 < TARGET_COMPLEX_QUERY_P95_MS, (
            f"Deep pagination p95 {client_p95:.2f}ms exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
        )

    def test_page_size_does_not_degrade_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Increasing page size should not push p95 above the 200ms target."""
        per_size_times: dict[int, list[float]] = {}

        for page_size in PAGINATION_PAGE_SIZES:
            times: list[float] = []
            for _ in range(LIST_ITERATION_COUNT):
                elapsed, _, _ = measure_list_api_call(
                    nexus_api.workflows.list,
                    limit=page_size,
                )
                times.append(elapsed)
            per_size_times[page_size] = times

        per_size_p95: dict[int, float] = {}
        for page_size, times in per_size_times.items():
            per_size_p95[page_size] = compute_percentile(times, 95)

        all_times = [t for times in per_size_times.values() for t in times]
        overall_p95 = compute_percentile(all_times, 95)

        diag = (
            f"\n--- Page size latency results ---\n"
            f"  per_size_p95={per_size_p95}\n"
            f"  overall_p95={overall_p95:.2f}ms\n"
            f"  iterations_per_size={LIST_ITERATION_COUNT}\n"
        )

        for page_size, p95 in per_size_p95.items():
            assert p95 < TARGET_COMPLEX_QUERY_P95_MS, (
                f"Page size {page_size} p95 {p95:.2f}ms exceeds target {TARGET_COMPLEX_QUERY_P95_MS}ms{diag}"
            )
