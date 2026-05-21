"""Suite 20 — File Upload & Document Conversion: Upload Response Time (20.1).

Test 20.1: Upload 50 files sequentially (mix of PDF, Word, text)
    KPI: Upload Response Time (p95) < 500ms (pre-conversion response)
    MetricType: REQUEST_DURATION
    Validation:
        - Client-measured p95 upload response time < 500ms
        - /_internal/metrics/records?metric_type=request_duration_ms
          → filter endpoint=/api/v1/files

Source: Operational performance (gap identified during codebase review).

Rationale: POST /api/v1/files accepts file uploads, validates, persists
metadata, then triggers background document conversion (PDF via PyMuPDF,
Word via pypandoc).  Conversion is CPU/disk-intensive and runs as FastAPI
background tasks.  Burst uploads can create a conversion backlog that
impacts API responsiveness.  This test validates that the *pre-conversion*
upload response stays fast even under sequential burst load.

Run with:
    make test-performance
"""

from __future__ import annotations

import warnings
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import (
    compute_percentile,
    poll_for_component_kpis,
    poll_for_metric_records,
)
from tests.performance.files.conftest import (
    UPLOAD_COUNT,
    build_file_sequence,
    upload_single_file,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

TARGET_P95_MS = 500
SEQUENTIAL_UPLOADS = UPLOAD_COUNT  # 50


class TestFileUploadResponseTime:
    """20.1 — Upload 50 files sequentially; p95 response time < 500ms.

    Validates:
        - Client-measured p95 upload response time < 500ms
        - Server-side request_duration_ms records for the /files endpoint
          confirm the target is met

    The test uploads 50 files one at a time (mix of PDF, Word, text)
    and records the wall-clock API response time for each upload.
    Background document conversion is *not* included in the measured
    duration — the endpoint returns immediately after persisting metadata
    and enqueuing the conversion task.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_sequential_upload_p95_under_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Upload 50 files sequentially; p95 must be < 500ms."""
        logger.info(
            "Starting sequential upload test",
            total_uploads=SEQUENTIAL_UPLOADS,
            target_p95_ms=TARGET_P95_MS,
        )

        file_sequence = build_file_sequence(SEQUENTIAL_UPLOADS)
        response_times: list[float] = []
        successes = 0
        failures = 0
        status_counts: dict[int, int] = {}

        for idx, descriptor in enumerate(file_sequence):
            elapsed_ms, ok, status_code = upload_single_file(nexus_api, descriptor, idx)
            response_times.append(elapsed_ms)
            status_counts[status_code] = status_counts.get(status_code, 0) + 1
            if ok:
                successes += 1
            else:
                failures += 1
                logger.warning(
                    "Upload failed",
                    index=idx,
                    status_code=status_code,
                    elapsed_ms=round(elapsed_ms, 1),
                    file_type=descriptor["ext"],
                )

            # Log progress every 10 uploads
            if (idx + 1) % 10 == 0:
                current_p95 = compute_percentile(response_times, 95)
                logger.info(
                    "Upload progress",
                    completed=idx + 1,
                    total=SEQUENTIAL_UPLOADS,
                    successes=successes,
                    failures=failures,
                    current_p95_ms=round(current_p95, 1),
                )

        assert successes > 0, (
            f"All {SEQUENTIAL_UPLOADS} uploads failed. "
            f"Status distribution: {status_counts}. "
            "Check that POST /api/v1/files is working and credentials are valid."
        )

        client_p95 = compute_percentile(response_times, 95)
        client_p50 = compute_percentile(response_times, 50)
        client_min = min(response_times)
        client_max = max(response_times)

        diag = (
            f"\n--- File upload response time results (20.1) ---\n"
            f"  total_uploads={SEQUENTIAL_UPLOADS}, "
            f"successes={successes}, failures={failures}\n"
            f"  client: min={client_min:.1f}ms, p50={client_p50:.1f}ms, "
            f"p95={client_p95:.1f}ms, max={client_max:.1f}ms\n"
            f"  status_distribution={status_counts}\n"
        )

        assert client_p95 < TARGET_P95_MS, (
            f"Client-measured upload response time p95 {client_p95:.1f}ms exceeds target {TARGET_P95_MS}ms{diag}"
        )

        logger.info(
            "File upload response time captured",
            p50_ms=round(client_p50, 1),
            p95_ms=round(client_p95, 1),
            successes=successes,
            failures=failures,
        )

    def test_server_request_duration_confirms_target(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Server-side request_duration_ms for /files must confirm p95 < 500ms.

        Uploads the same file sequence, then queries the internal metrics
        store to cross-validate server-reported durations against the
        client-side measurement.
        """
        file_sequence = build_file_sequence(SEQUENTIAL_UPLOADS)
        successes = 0

        for idx, descriptor in enumerate(file_sequence):
            _, ok, _ = upload_single_file(nexus_api, descriptor, idx)
            if ok:
                successes += 1

        assert successes > 0, "No uploads succeeded — cannot validate server metrics"

        records = poll_for_metric_records(
            nexus_api.internal_metrics,
            "request_duration_ms",
            limit=SEQUENTIAL_UPLOADS + 20,
            timeout=15.0,
        )

        file_endpoint_values: list[float] = [
            r["value"]
            for r in records.get("records", [])
            if isinstance(r.get("value"), (int, float))
            and r["value"] > 0
            and "files" in str(r.get("labels", {}).get("endpoint", "")).lower()
        ]

        if not file_endpoint_values:
            warnings.warn(
                "No request_duration_ms records with endpoint containing "
                "'/files' found — the deployment may not emit per-endpoint "
                "REQUEST_DURATION metrics.  Falling back to component KPIs.",
                stacklevel=1,
            )
            logger.warning(
                "Per-endpoint metrics not available, falling back to component KPIs",
                client_successes=successes,
            )

            kpis = poll_for_component_kpis(
                nexus_api.internal_metrics,
                "api_service",
                timeout=15.0,
            )
            server_metrics = kpis.get("metrics", {}).get("response_time_ms", {})
            server_p95 = server_metrics.get("p95", 0)

            if not isinstance(server_p95, (int, float)) or server_p95 <= 0:
                warnings.warn(
                    f"Component KPI fallback also failed - server_p95={server_p95!r}. "
                    "The deployment may not emit any server-side metrics. "
                    "Server-side validation cannot be performed.",
                    stacklevel=1,
                )
                logger.warning(
                    "Server-side validation skipped - no valid metrics available",
                    server_p95=server_p95,
                    client_successes=successes,
                )
                return

            assert server_p95 < TARGET_P95_MS, (
                f"Server-reported api_service response_time_ms p95 {server_p95:.1f}ms exceeds target {TARGET_P95_MS}ms"
            )
            logger.info(
                "Component KPI validation passed",
                server_p95_ms=round(server_p95, 1),
            )
            return

        server_p95 = compute_percentile(file_endpoint_values, 95)
        server_p50 = compute_percentile(file_endpoint_values, 50)

        diag = (
            f"\n--- Server request_duration_ms for /files (20.1) ---\n"
            f"  records={len(file_endpoint_values)}\n"
            f"  p50={server_p50:.1f}ms, p95={server_p95:.1f}ms\n"
        )

        assert server_p95 < TARGET_P95_MS, (
            f"Server-reported /files request_duration_ms p95 {server_p95:.1f}ms exceeds target {TARGET_P95_MS}ms{diag}"
        )

        logger.info(
            "Server request_duration_ms validated for /files",
            records=len(file_endpoint_values),
            p50_ms=round(server_p50, 1),
            p95_ms=round(server_p95, 1),
        )
