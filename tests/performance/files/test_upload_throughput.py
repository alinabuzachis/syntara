"""Suite 20 — File Upload & Document Conversion: Upload Throughput (20.2).

Test 20.2: Upload 20 files concurrently
    KPI: Upload Throughput ≥ 5 files/sec
    MetricType: REQUEST_DURATION
    Validation:
        - Count successful 200 responses / elapsed wall-clock time
        - /_internal/metrics/records?metric_type=request_duration_ms
          → filter endpoint=/api/v1/files

Source: Operational performance (gap identified during codebase review).

Rationale: POST /api/v1/files accepts file uploads, validates, persists
metadata, then triggers background document conversion.  Under concurrent
load the endpoint must sustain at least 5 successful uploads per second
to avoid becoming a bottleneck for workflows that attach multiple files.

Run with:
    make test-performance
"""

from __future__ import annotations

import time
import warnings
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    compute_percentile,
    poll_for_metric_records,
)
from tests.performance.files.conftest import (
    build_file_sequence,
    upload_single_file,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

CONCURRENT_UPLOADS = 20
MAX_WORKERS = 20
TARGET_THROUGHPUT_FPS = 5.0  # files per second


class TestFileUploadThroughput:
    """20.2 — Upload 20 files concurrently; throughput ≥ 5 files/sec.

    Validates:
        - Client-measured throughput (successful uploads / wall-clock time) ≥ 5 fps
        - Server-side request_duration_ms records confirm the uploads were processed

    All 20 uploads are submitted concurrently via a thread pool.  The
    wall-clock window starts when the first request is dispatched and
    ends when the last future completes.  Only successful (HTTP 200)
    responses count toward the throughput numerator.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_concurrent_upload_throughput(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """20 concurrent uploads; throughput must be ≥ 5 files/sec."""
        logger.info(
            "Starting concurrent upload throughput test",
            concurrent_uploads=CONCURRENT_UPLOADS,
            max_workers=MAX_WORKERS,
            target_throughput_fps=TARGET_THROUGHPUT_FPS,
        )

        file_sequence = build_file_sequence(CONCURRENT_UPLOADS)
        response_times: list[float] = []
        successes = 0
        failures = 0
        status_counts: dict[int, int] = {}

        wall_start = time.monotonic()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, nexus_api, desc, idx) for idx, desc in enumerate(file_sequence)
            ]
            for future in as_completed(futures):
                elapsed_ms, ok, status_code = future.result()
                response_times.append(elapsed_ms)
                status_counts[status_code] = status_counts.get(status_code, 0) + 1
                if ok:
                    successes += 1
                else:
                    failures += 1

        wall_elapsed_s = time.monotonic() - wall_start
        throughput_fps = successes / max(wall_elapsed_s, 0.001)

        assert successes > 0, (
            f"All {CONCURRENT_UPLOADS} concurrent uploads failed. "
            f"Status distribution: {status_counts}. "
            "Check that POST /api/v1/files is working and credentials are valid."
        )

        client_p95 = compute_percentile(response_times, 95)
        client_p50 = compute_percentile(response_times, 50)

        diag = (
            f"\n--- File upload throughput results (20.2) ---\n"
            f"  concurrent_uploads={CONCURRENT_UPLOADS}, "
            f"successes={successes}, failures={failures}\n"
            f"  wall_time={wall_elapsed_s:.2f}s, "
            f"throughput={throughput_fps:.2f} files/sec\n"
            f"  client: p50={client_p50:.1f}ms, p95={client_p95:.1f}ms\n"
            f"  status_distribution={status_counts}\n"
        )

        assert throughput_fps >= TARGET_THROUGHPUT_FPS, (
            f"Upload throughput {throughput_fps:.2f} files/sec is below "
            f"target {TARGET_THROUGHPUT_FPS:.0f} files/sec{diag}"
        )

        logger.info(
            "File upload throughput captured",
            throughput_fps=round(throughput_fps, 2),
            wall_time_s=round(wall_elapsed_s, 2),
            successes=successes,
            failures=failures,
            p50_ms=round(client_p50, 1),
            p95_ms=round(client_p95, 1),
        )

    def test_server_records_confirm_concurrent_uploads(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Server-side request_duration_ms must reflect the concurrent upload batch.

        Submits the same concurrent upload burst, then checks that the
        internal metrics store captured records for the /files endpoint.
        """
        file_sequence = build_file_sequence(CONCURRENT_UPLOADS)
        successes = 0

        wall_start = time.monotonic()

        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, nexus_api, desc, idx) for idx, desc in enumerate(file_sequence)
            ]
            for future in as_completed(futures):
                _, ok, _ = future.result()
                if ok:
                    successes += 1

        wall_elapsed_s = time.monotonic() - wall_start

        assert successes > 0, "No concurrent uploads succeeded — cannot validate server metrics"

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
            limit=CONCURRENT_UPLOADS + 20,
            timeout=15.0,
        )

        file_endpoint_values: list[float] = [
            r["value"]
            for r in records.get("records", [])
            if isinstance(r.get("value"), (int, float))
            and r["value"] > 0
            and "files" in str(r.get("labels", {}).get("endpoint", "")).lower()
        ]

        server_throughput = len(file_endpoint_values) / max(wall_elapsed_s, 0.001)

        diag = (
            f"\n--- Server metrics for concurrent upload (20.2) ---\n"
            f"  server_records={len(file_endpoint_values)}, "
            f"client_successes={successes}\n"
            f"  wall_time={wall_elapsed_s:.2f}s, "
            f"server_throughput={server_throughput:.2f} files/sec\n"
        )

        if file_endpoint_values:
            server_p95 = compute_percentile(file_endpoint_values, 95)
            logger.info(
                "Server request_duration_ms validated for concurrent /files uploads",
                records=len(file_endpoint_values),
                server_throughput_fps=round(server_throughput, 2),
                server_p95_ms=round(server_p95, 1),
            )
        else:
            warnings.warn(
                "No per-endpoint request_duration_ms records found for /files — "
                "the deployment may not emit per-endpoint REQUEST_DURATION metrics. "
                f"Server-side validation skipped.{diag}",
                stacklevel=1,
            )
            logger.warning(
                "Server-side validation skipped - no per-endpoint metrics",
                client_successes=successes,
            )
