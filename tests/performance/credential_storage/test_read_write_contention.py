"""Suite 22 — Credential Storage: Read/Write Contention KPI (22.9).

Test 22.9: Concurrent reads and writes — 20 writers creating +
    30 readers listing/getting simultaneously
    KPI: Read/Write Contention —
        No deadlocks; read p95 < 200ms, write p95 < 300ms
    MetricType: REQUEST_DURATION
    Validation:
        Parallel load; verify no 5xx errors from contention

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import random
import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
)
from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_NAMES,
    cleanup_credentials,
    create_credential,
    extract_credential_metric_latencies,
    get_credential_by_id,
    list_credentials,
    seed_credentials,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

WRITER_COUNT = 20
READER_COUNT = 30
SEED_COUNT = 50
WRITES_PER_WRITER = 5
READS_PER_READER = 5
TARGET_READ_P95_MS = 200
TARGET_WRITE_P95_MS = 300
CONTENTION_TIMEOUT_SECONDS = 120


@dataclass
class _WorkerStats:
    """Thread-safe accumulator for latencies and errors across workers."""

    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)
    read_latencies: list[float] = field(default_factory=list)
    write_latencies: list[float] = field(default_factory=list)
    read_failures: int = 0
    write_failures: int = 0
    server_errors: list[str] = field(default_factory=list)
    created_ids: list[str] = field(default_factory=list)

    def record_read(self, elapsed_ms: float, *, ok: bool, context: str = "") -> None:
        with self._lock:
            if ok:
                self.read_latencies.append(elapsed_ms)
            else:
                self.read_failures += 1
                if context:
                    self.server_errors.append(f"read: {context}")

    def record_write(
        self,
        elapsed_ms: float,
        *,
        ok: bool,
        cred_id: str | None = None,
        context: str = "",
    ) -> None:
        with self._lock:
            if ok:
                self.write_latencies.append(elapsed_ms)
                if cred_id:
                    self.created_ids.append(cred_id)
            else:
                self.write_failures += 1
                if context:
                    self.server_errors.append(f"write: {context}")


class TestReadWriteContention:
    """22.9 — Concurrent reads and writes under contention.

    Seeds 50 credentials, then launches 20 writer threads and 30 reader
    threads simultaneously:
        - Writers create new credentials (5 each = 100 total writes)
        - Readers alternate between list and single-GET (5 each = 150 reads)

    Validates:
        - No deadlocks (all threads complete within timeout)
        - Read p95 < 200ms
        - Write p95 < 300ms
        - No 5xx server errors
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_read_write_contention(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """20 writers + 30 readers; no deadlocks, read p95 < 200ms, write p95 < 300ms."""
        logger.info(
            "Starting read/write contention test",
            writers=WRITER_COUNT,
            readers=READER_COUNT,
            seed_count=SEED_COUNT,
            target_read_p95_ms=TARGET_READ_P95_MS,
            target_write_p95_ms=TARGET_WRITE_P95_MS,
        )

        seeded_ids = seed_credentials(
            nexus_api,
            credential_type_map=credential_type_map,
            project_id=perf_project_id,
            count=SEED_COUNT,
            name_prefix="perf-suite22-contention-seed",
        )

        assert len(seeded_ids) >= SEED_COUNT * 0.9, f"Seeding failed: only {len(seeded_ids)}/{SEED_COUNT} created"

        stats = _WorkerStats()
        all_created: list[str] = list(seeded_ids)

        try:
            wall_start = time.monotonic()

            with ThreadPoolExecutor(max_workers=WRITER_COUNT + READER_COUNT) as pool:
                futures: list[Future[None]] = []

                for _ in range(WRITER_COUNT):
                    futures.append(
                        pool.submit(
                            _writer_loop,
                            nexus_api,
                            credential_type_map,
                            perf_project_id,
                            stats,
                        )
                    )
                for _ in range(READER_COUNT):
                    futures.append(
                        pool.submit(
                            _reader_loop,
                            nexus_api,
                            seeded_ids,
                            stats,
                        )
                    )

                for future in as_completed(futures, timeout=CONTENTION_TIMEOUT_SECONDS):
                    future.result()

            wall_elapsed = time.monotonic() - wall_start

            all_created.extend(stats.created_ids)

            assert len(stats.read_latencies) > 0, "All read operations failed"
            assert len(stats.write_latencies) > 0, "All write operations failed"

            read_p95 = compute_percentile(stats.read_latencies, 95)
            read_p50 = compute_percentile(stats.read_latencies, 50)
            write_p95 = compute_percentile(stats.write_latencies, 95)
            write_p50 = compute_percentile(stats.write_latencies, 50)

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=1000,
                timeout=30.0,
            )
            server_read_lats = extract_credential_metric_latencies(
                records,
                method="GET",
            )
            server_read_single_lats = extract_credential_metric_latencies(
                records,
                method="GET",
                single_resource=True,
            )
            server_write_lats = extract_credential_metric_latencies(
                records,
                method="POST",
            )

            diag = _build_diagnostic(
                wall_elapsed=wall_elapsed,
                stats=stats,
                read_p50=read_p50,
                read_p95=read_p95,
                write_p50=write_p50,
                write_p95=write_p95,
                server_read_count=len(server_read_lats) + len(server_read_single_lats),
                server_write_count=len(server_write_lats),
            )

            five_xx = [e for e in stats.server_errors if "5xx" in e or "500" in e]
            assert not five_xx, f"Server 5xx errors detected under contention ({len(five_xx)} errors){diag}"

            assert read_p95 < TARGET_READ_P95_MS, (
                f"Read p95 {read_p95:.1f}ms exceeds target {TARGET_READ_P95_MS}ms under contention{diag}"
            )

            assert write_p95 < TARGET_WRITE_P95_MS, (
                f"Write p95 {write_p95:.1f}ms exceeds target {TARGET_WRITE_P95_MS}ms under contention{diag}"
            )

            logger.info(
                "Read/write contention test completed",
                wall_time_s=round(wall_elapsed, 2),
                read_p95_ms=round(read_p95, 1),
                write_p95_ms=round(write_p95, 1),
                read_successes=len(stats.read_latencies),
                write_successes=len(stats.write_latencies),
            )

        except TimeoutError as exc:
            all_created.extend(stats.created_ids)
            msg = f"Deadlock detected — threads did not complete within {CONTENTION_TIMEOUT_SECONDS}s"
            raise AssertionError(msg) from exc

        finally:
            cleanup_credentials(nexus_api, all_created)


# ---------------------------------------------------------------------------
# Worker loops
# ---------------------------------------------------------------------------


def _writer_loop(
    nexus_api: NexusApiRegistry,
    credential_type_map: dict[str, UUID],
    project_id: UUID,
    stats: _WorkerStats,
) -> None:
    """Single writer thread: creates WRITES_PER_WRITER credentials."""
    type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
    for _ in range(WRITES_PER_WRITER):
        type_name = next(type_cycle)
        type_id = credential_type_map[type_name]
        elapsed_ms, ok, cred_id = create_credential(
            nexus_api,
            credential_type_name=type_name,
            credential_type_id=type_id,
            project_id=project_id,
            name_prefix="perf-suite22-contention-write",
        )
        context = "" if ok else f"create failed ({elapsed_ms:.0f}ms)"
        stats.record_write(elapsed_ms, ok=ok, cred_id=cred_id, context=context)


def _reader_loop(
    nexus_api: NexusApiRegistry,
    seeded_ids: list[str],
    stats: _WorkerStats,
) -> None:
    """Single reader thread: alternates between list and single-GET."""
    for i in range(READS_PER_READER):
        if i % 2 == 0:
            elapsed_ms, ok, _ = list_credentials(nexus_api, limit=50)
            context = "" if ok else f"list failed ({elapsed_ms:.0f}ms)"
        else:
            target_id = random.choice(seeded_ids)  # noqa: S311
            elapsed_ms, ok, _ = get_credential_by_id(nexus_api, target_id)
            context = "" if ok else f"get {target_id} failed ({elapsed_ms:.0f}ms)"
        stats.record_read(elapsed_ms, ok=ok, context=context)


# ---------------------------------------------------------------------------
# Diagnostics
# ---------------------------------------------------------------------------


def _build_diagnostic(
    *,
    wall_elapsed: float,
    stats: _WorkerStats,
    read_p50: float,
    read_p95: float,
    write_p50: float,
    write_p95: float,
    server_read_count: int,
    server_write_count: int,
) -> str:
    """Build a diagnostic string for the contention test."""
    total_reads = len(stats.read_latencies) + stats.read_failures
    total_writes = len(stats.write_latencies) + stats.write_failures

    parts = [
        "\n--- Read/Write contention results (22.9) ---",
        f"  wall_time={wall_elapsed:.2f}s",
        f"  writers={WRITER_COUNT} ({WRITES_PER_WRITER} each), readers={READER_COUNT} ({READS_PER_READER} each)",
        f"  reads: total={total_reads}, successes={len(stats.read_latencies)}, failures={stats.read_failures}",
        f"  writes: total={total_writes}, successes={len(stats.write_latencies)}, failures={stats.write_failures}",
        f"  read latency: p50={read_p50:.1f}ms, p95={read_p95:.1f}ms (target p95 < {TARGET_READ_P95_MS}ms)",
        f"  write latency: p50={write_p50:.1f}ms, p95={write_p95:.1f}ms (target p95 < {TARGET_WRITE_P95_MS}ms)",
        f"  server metric records: reads={server_read_count}, writes={server_write_count}",
    ]
    if stats.server_errors:
        parts.append(f"  ERRORS ({len(stats.server_errors)}):")
        for err in stats.server_errors[:20]:
            parts.append(f"    {err}")
    return "\n".join(parts) + "\n"
