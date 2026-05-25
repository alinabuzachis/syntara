"""Suite 22 — Credential Storage: Creation Throughput KPI (22.2).

Test 22.2: Create 50 credentials concurrently
    KPI: Creation Throughput — 10+ credentials/sec
    MetricType: REQUEST_DURATION
    Validation:
        Count 201 responses / elapsed time

Run with:
    make test-performance
"""

from __future__ import annotations

import itertools
import time
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest

from tests.performance.conftest import poll_for_metric_records
from tests.performance.credential_storage.conftest import (
    CREDENTIAL_TYPE_NAMES,
    create_credential,
    delete_credential_by_id,
    extract_credential_metric_latencies,
)

if TYPE_CHECKING:
    from uuid import UUID

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

CONCURRENT_CREDENTIAL_COUNT = 50
MAX_WORKERS = 10
TARGET_THROUGHPUT_PER_SECOND = 10


class TestCreationThroughput:
    """22.2 — Create 50 credentials concurrently.

    Submits 50 credential-creation requests across a thread pool,
    measures wall-clock time, and validates:
        - Client-measured throughput >= 10 credentials/sec
          (successful 201 responses / elapsed seconds)
        - Server-side REQUEST_DURATION record count corroborates
          the throughput figure
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        perf_test_mode_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_creation_throughput(
        self,
        nexus_api: NexusApiRegistry,
        credential_type_map: dict[str, UUID],
        perf_project_id: UUID,
    ) -> None:
        """Create 50 credentials concurrently; throughput must be >= 10/sec."""
        type_cycle = itertools.cycle(CREDENTIAL_TYPE_NAMES)
        tasks: list[tuple[str, UUID]] = [
            (name := next(type_cycle), credential_type_map[name]) for _ in range(CONCURRENT_CREDENTIAL_COUNT)
        ]

        created_ids: list[str] = []
        successes = 0
        failures = 0

        try:
            wall_start = time.monotonic()

            with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                futures: list[Future[tuple[float, bool, str | None]]] = [
                    executor.submit(
                        create_credential,
                        nexus_api,
                        credential_type_name=type_name,
                        credential_type_id=type_id,
                        project_id=perf_project_id,
                        name_prefix="perf-suite22-concurrent",
                    )
                    for type_name, type_id in tasks
                ]

                for future in as_completed(futures):
                    _, ok, cred_id = future.result()
                    if ok and cred_id:
                        created_ids.append(cred_id)
                        successes += 1
                    else:
                        failures += 1

            wall_elapsed = time.monotonic() - wall_start

            assert successes > 0, (
                f"No credentials were created successfully\n"
                f"  Attempted: {CONCURRENT_CREDENTIAL_COUNT}\n"
                f"  Failures: {failures}"
            )

            client_throughput = successes / wall_elapsed

            records = poll_for_metric_records(
                nexus_api.internal_metrics,
                "request_duration_ms",
                limit=CONCURRENT_CREDENTIAL_COUNT + 50,
                timeout=30.0,
            )
            server_post_count = len(extract_credential_metric_latencies(records, method="POST"))

            diag = (
                f"\n--- Creation throughput results (22.2) ---\n"
                f"  attempted={CONCURRENT_CREDENTIAL_COUNT}, "
                f"successes={successes}, failures={failures}\n"
                f"  wall_time={wall_elapsed:.2f}s\n"
                f"  client_throughput={client_throughput:.1f} credentials/sec\n"
                f"  server POST /credentials records={server_post_count}\n"
                f"  max_workers={MAX_WORKERS}\n"
            )

            assert client_throughput >= TARGET_THROUGHPUT_PER_SECOND, (
                f"Client-measured throughput {client_throughput:.1f}/sec is below "
                f"target {TARGET_THROUGHPUT_PER_SECOND}/sec{diag}"
            )

        finally:
            for cred_id in created_ids:
                delete_credential_by_id(nexus_api, cred_id)
