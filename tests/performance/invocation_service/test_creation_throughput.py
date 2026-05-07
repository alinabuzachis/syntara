"""Suite 5 — Invocation Service: Creation Throughput KPI (5.1).

Test 5.1: Create invocations at sustained rate for 60s
    KPI: Creation Throughput — 10+ /sec
    MetricType: AGENT_INVOCATION_DURATION

    Validation source:
        - /_internal/metrics/kpis/invocation_service → record count / elapsed
        - Client-side invocation creation rate measurement

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING
from uuid import uuid4

import pytest

from tests.performance.conftest import poll_for_component_kpis
from tests.performance.invocation_service.conftest import create_invocation

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

TARGET_THROUGHPUT_PER_SECOND = 10
SUSTAINED_DURATION_SECONDS = 60
MAX_WORKERS = 20
BATCH_SIZE = 10


def _run_sustained_load(
    nexus_api: NexusApiRegistry,
    session_id: str,
    prompt_prefix: str,
    *,
    duration_seconds: int = SUSTAINED_DURATION_SECONDS,
    max_workers: int = MAX_WORKERS,
    batch_size: int = BATCH_SIZE,
    credential_id: str | None = None,
) -> tuple[list[float], int, int, float]:
    """Run sustained invocation creation for the given duration.

    Args:
        nexus_api: Authenticated API client registry.
        session_id: Session identifier for grouping invocations.
        prompt_prefix: Prefix for auto-generated prompts.
        duration_seconds: How long to sustain the load.
        max_workers: Maximum concurrent threads.
        batch_size: Number of in-flight requests to maintain.
        credential_id: Optional LLM Provider credential ID.

    Returns:
        Tuple of (response_times, successes, failures, actual_elapsed_seconds).

    """
    response_times: list[float] = []
    successes = 0
    failures = 0

    wall_start = time.monotonic()
    end_time = wall_start + duration_seconds

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        pending: set[Future[tuple[float, bool]]] = set()

        while time.monotonic() < end_time or pending:
            while len(pending) < batch_size and time.monotonic() < end_time:
                future = executor.submit(
                    create_invocation,
                    nexus_api,
                    session_id,
                    f"{prompt_prefix} {len(response_times) + len(pending)}",
                    credential_id,
                )
                pending.add(future)

            done = set()
            for future in as_completed(pending, timeout=5.0):
                elapsed_ms, ok = future.result()
                response_times.append(elapsed_ms)
                if ok:
                    successes += 1
                else:
                    failures += 1
                done.add(future)

            pending -= done

            if time.monotonic() >= end_time:
                break

        for future in as_completed(pending):
            elapsed_ms, ok = future.result()
            response_times.append(elapsed_ms)
            if ok:
                successes += 1
            else:
                failures += 1

    actual_elapsed_seconds = time.monotonic() - wall_start
    return response_times, successes, failures, actual_elapsed_seconds


class TestCreationThroughput:
    """5.1 — Create invocations at sustained rate for 60s.

    Continuously creates invocations over a 60-second window using a
    thread pool to maintain concurrency, then verifies:
        - Client-measured throughput >= 10 invocations/sec
        - Server-side ``e2e_duration_ms.count`` reflects the sustained load
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        llm_invocation_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sustained_creation_throughput(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Create invocations for 60s; throughput must be >= 10/sec."""
        session_id = f"perf-suite5-throughput-{uuid4().hex[:8]}"
        response_times, successes, failures, actual_elapsed_seconds = _run_sustained_load(
            nexus_api,
            session_id,
            "Throughput test",
            credential_id=llm_credential_id,
        )

        assert len(response_times) > 0, (
            f"No invocations were created during the test\n"
            f"  Session: {session_id}\n"
            f"  Duration target: {SUSTAINED_DURATION_SECONDS}s"
        )

        client_throughput = successes / actual_elapsed_seconds
        error_rate = failures / len(response_times) if response_times else 1.0

        assert client_throughput >= TARGET_THROUGHPUT_PER_SECOND, (
            f"Client-measured throughput {client_throughput:.1f}/sec is below "
            f"target {TARGET_THROUGHPUT_PER_SECOND}/sec\n"
            f"  Total requests: {len(response_times)}\n"
            f"  Successes: {successes}\n"
            f"  Failures: {failures}\n"
            f"  Error rate: {error_rate:.2%}\n"
            f"  Wall time: {actual_elapsed_seconds:.1f}s"
        )

    def test_server_records_reflect_sustained_load(
        self,
        nexus_api: NexusApiRegistry,
        llm_credential_id: str | None,
    ) -> None:
        """Server-side record count must reflect sustained invocation creation."""
        session_id = f"perf-suite5-server-records-{uuid4().hex[:8]}"
        _, successes, _, actual_elapsed_seconds = _run_sustained_load(
            nexus_api,
            session_id,
            "Record count test",
            credential_id=llm_credential_id,
        )

        assert successes > 0, (
            f"No invocations were successfully created\n"
            f"  Session: {session_id}\n"
            f"  Duration target: {SUSTAINED_DURATION_SECONDS}s"
        )

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "invocation_service",
            timeout=90.0,
        )
        metrics = kpis.get("metrics", {})
        duration_stats = metrics.get("e2e_duration_ms", {})
        server_count = duration_stats.get("count", 0)

        server_throughput = server_count / actual_elapsed_seconds if actual_elapsed_seconds > 0 else 0

        assert server_count > 0, (
            f"No e2e_duration_ms records found in invocation_service KPIs "
            f"({successes} invocations were successfully created)"
        )

        assert server_throughput >= TARGET_THROUGHPUT_PER_SECOND, (
            f"Server-reported throughput {server_throughput:.1f}/sec is below "
            f"target {TARGET_THROUGHPUT_PER_SECOND}/sec\n"
            f"  Server record count: {server_count}\n"
            f"  Client-created: {successes}\n"
            f"  Wall time: {actual_elapsed_seconds:.1f}s\n"
            f"  Duration stats: {duration_stats}"
        )
