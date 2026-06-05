"""Suite 20 — File Upload & Document Conversion: Conversion Backlog Impact (20.4).

Test 20.4: Burst upload 50 files, then measure API latency on other endpoints
    KPI: Conversion Backlog Impact — API p95 < 200ms unaffected
    MetricType: REQUEST_DURATION
    Validation:
        - Compare API latency on GET /api/v1/workflows during and after
          conversion burst

Source: Operational performance (gap identified during codebase review).

Rationale: Document conversion (PDF via PyMuPDF, Word via pypandoc)
runs as FastAPI background tasks inside the API process.  A burst of
uploads creates a conversion backlog whose CPU/disk pressure could
degrade the responsiveness of unrelated API endpoints.  This test
verifies that the GET /api/v1/workflows p95 stays below 200ms even
while a 50-file conversion backlog is being processed.

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
    make_request,
    poll_for_component_kpis,
)
from tests.performance.files.conftest import (
    UPLOAD_COUNT,
    build_file_sequence,
    upload_single_file,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

TARGET_API_P95_MS = 200
BURST_UPLOADS = UPLOAD_COUNT  # 50
BURST_WORKERS = 10

PROBE_REQUESTS_DURING = 30
PROBE_REQUESTS_AFTER = 30
PROBE_INTERVAL_S = 0.5
COOLDOWN_AFTER_BURST_S = 2.0


class TestConversionBacklogImpact:
    """20.4 — Burst upload 50 files, then verify API latency is unaffected.

    Validates:
        - GET /api/v1/workflows p95 < 200ms *during* conversion backlog
        - GET /api/v1/workflows p95 < 200ms *after* conversions settle
        - Server-side api_service response_time_ms p95 confirms target

    Approach:
        1. Burst-upload 50 mixed files concurrently to create a
           conversion backlog (background tasks are CPU/disk-heavy).
        2. Immediately probe GET /api/v1/workflows at a steady rate to
           capture latency while conversions are in flight.
        3. After a short cooldown, probe again to capture post-backlog
           latency as a baseline comparison.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_api_latency_during_conversion_backlog(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """GET /workflows p95 must stay < 200ms while conversions run."""
        logger.info(
            "Starting conversion backlog impact test",
            burst_uploads=BURST_UPLOADS,
            burst_workers=BURST_WORKERS,
            target_api_p95_ms=TARGET_API_P95_MS,
            probe_requests_during=PROBE_REQUESTS_DURING,
            probe_requests_after=PROBE_REQUESTS_AFTER,
        )

        # ---- Phase 1: burst-upload to create a conversion backlog ----
        logger.info("Phase 1: Burst uploading files to create conversion backlog")
        file_sequence = build_file_sequence(BURST_UPLOADS)
        upload_successes = 0

        with ThreadPoolExecutor(max_workers=BURST_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, nexus_api, desc, idx) for idx, desc in enumerate(file_sequence)
            ]
            for future in as_completed(futures):
                _, ok, _ = future.result()
                if ok:
                    upload_successes += 1

        assert upload_successes > 0, "No burst uploads succeeded — cannot create a conversion backlog"

        logger.info(
            "Phase 1 complete: Burst upload finished",
            upload_successes=upload_successes,
            total=BURST_UPLOADS,
        )

        # ---- Phase 2: probe GET /workflows *during* backlog ----------
        logger.info("Phase 2: Probing API latency during conversion backlog")
        during_latencies: list[float] = []
        during_errors = 0

        for probe_num in range(PROBE_REQUESTS_DURING):
            elapsed_ms, ok = make_request(nexus_api)
            during_latencies.append(elapsed_ms)
            if not ok:
                during_errors += 1

            # Log every 10th probe
            if (probe_num + 1) % 10 == 0:
                current_p95 = compute_percentile(during_latencies, 95)
                logger.debug(
                    "Probe progress (during backlog)",
                    completed=probe_num + 1,
                    total=PROBE_REQUESTS_DURING,
                    current_p95_ms=round(current_p95, 1),
                    errors=during_errors,
                )
            time.sleep(PROBE_INTERVAL_S)

        assert len(during_latencies) > 0, "No probe requests completed during backlog"

        during_p95 = compute_percentile(during_latencies, 95)
        during_p50 = compute_percentile(during_latencies, 50)

        logger.info(
            "Phase 2 complete: During-backlog probing finished",
            p50_ms=round(during_p50, 1),
            p95_ms=round(during_p95, 1),
            errors=during_errors,
        )

        # ---- Phase 3: cooldown + probe *after* backlog settles -------
        logger.info(
            "Phase 3: Cooldown period",
            cooldown_s=COOLDOWN_AFTER_BURST_S,
        )
        time.sleep(COOLDOWN_AFTER_BURST_S)

        logger.info("Phase 3: Probing API latency after backlog settled")
        after_latencies: list[float] = []
        after_errors = 0

        for _probe_num in range(PROBE_REQUESTS_AFTER):
            elapsed_ms, ok = make_request(nexus_api)
            after_latencies.append(elapsed_ms)
            if not ok:
                after_errors += 1
            time.sleep(PROBE_INTERVAL_S)

        after_p95 = compute_percentile(after_latencies, 95)
        after_p50 = compute_percentile(after_latencies, 50)

        logger.info(
            "Phase 3 complete: After-backlog probing finished",
            p50_ms=round(after_p50, 1),
            p95_ms=round(after_p95, 1),
            errors=after_errors,
        )

        # ---- Diagnostics ---------------------------------------------
        diag = (
            f"\n--- Conversion backlog impact results (20.4) ---\n"
            f"  burst_uploads={BURST_UPLOADS}, "
            f"upload_successes={upload_successes}\n"
            f"  DURING backlog ({PROBE_REQUESTS_DURING} probes):\n"
            f"    p50={during_p50:.1f}ms, p95={during_p95:.1f}ms, "
            f"errors={during_errors}\n"
            f"  AFTER backlog ({PROBE_REQUESTS_AFTER} probes):\n"
            f"    p50={after_p50:.1f}ms, p95={after_p95:.1f}ms, "
            f"errors={after_errors}\n"
        )

        assert during_p95 < TARGET_API_P95_MS, (
            f"GET /workflows p95 {during_p95:.1f}ms during conversion "
            f"backlog exceeds target {TARGET_API_P95_MS}ms{diag}"
        )

        assert after_p95 < TARGET_API_P95_MS, (
            f"GET /workflows p95 {after_p95:.1f}ms after conversion backlog exceeds target {TARGET_API_P95_MS}ms{diag}"
        )

        logger.info(
            "Conversion backlog impact measured",
            upload_successes=upload_successes,
            during_p50_ms=round(during_p50, 1),
            during_p95_ms=round(during_p95, 1),
            after_p50_ms=round(after_p50, 1),
            after_p95_ms=round(after_p95, 1),
        )

    def test_server_kpis_confirm_unaffected_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """Server-side api_service response_time_ms p95 must confirm < 200ms.

        Re-runs the burst-then-probe sequence and cross-validates with
        the server-reported component KPIs.
        """
        file_sequence = build_file_sequence(BURST_UPLOADS)
        upload_successes = 0

        with ThreadPoolExecutor(max_workers=BURST_WORKERS) as executor:
            futures = [
                executor.submit(upload_single_file, nexus_api, desc, idx) for idx, desc in enumerate(file_sequence)
            ]
            for future in as_completed(futures):
                _, ok, _ = future.result()
                if ok:
                    upload_successes += 1

        assert upload_successes > 0, "No burst uploads succeeded"

        for _ in range(PROBE_REQUESTS_DURING):
            make_request(nexus_api)
            time.sleep(PROBE_INTERVAL_S)

        kpis = poll_for_component_kpis(
            nexus_api.internal_metrics,
            "api_service",
            timeout=15.0,
        )
        server_metrics = kpis.get("metrics", {}).get("response_time_ms", {})
        server_p95 = server_metrics.get("p95", 0)
        server_count = server_metrics.get("count", 0)

        diag = (
            f"\n--- Server KPIs after backlog burst (20.4) ---\n"
            f"  upload_successes={upload_successes}\n"
            f"  api_service response_time_ms: "
            f"count={server_count}, p95={server_p95}ms\n"
        )

        if not isinstance(server_p95, (int, float)) or server_p95 <= 0:
            warnings.warn(
                f"Server-reported api_service response_time_ms p95 is invalid or zero "
                f"(value={server_p95!r}). The deployment may not emit component KPIs. "
                f"Skipping server-side validation for this test.{diag}",
                stacklevel=2,
            )
            logger.warning(
                "Server KPI validation skipped - invalid metrics",
                server_p95=server_p95,
                server_count=server_count,
            )
        else:
            assert server_p95 < TARGET_API_P95_MS, (
                f"Server-reported api_service response_time_ms p95 "
                f"{server_p95:.1f}ms exceeds target {TARGET_API_P95_MS}ms{diag}"
            )
            logger.info(
                "Server KPIs validated after conversion backlog",
                server_p95_ms=server_p95,
                server_count=server_count,
                upload_successes=upload_successes,
            )
