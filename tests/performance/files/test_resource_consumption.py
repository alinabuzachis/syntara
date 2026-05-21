"""Suite 20 — File Upload & Document Conversion: Resource Consumption (20.5).

Test 20.5: Upload and convert 100 files, monitor resource usage
    KPI: Resource Consumption — health endpoint stable, memory bounded
    Validation: Health endpoint probes during conversion; process-level
    memory monitoring via psutil

Run with:
    make test-performance
"""

from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.conftest import check_health
from tests.performance.files.conftest import (
    build_file_sequence,
    upload_single_file,
)

if TYPE_CHECKING:
    from collections.abc import Awaitable

    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.get_logger(__name__)

UPLOAD_COUNT = 100
BURST_WORKERS = 10

HEALTH_PROBE_INTERVAL_S = 2.0
HEALTH_PROBES_DURING = 15
HEALTH_PROBES_AFTER = 10
STABILISATION_WAIT_S = 10.0


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def _burst_upload(
    nexus_api: NexusApiRegistry,
    count: int,
) -> int:
    """Upload *count* mixed files concurrently and return the success count."""
    file_sequence = build_file_sequence(count)
    successes = 0
    with ThreadPoolExecutor(max_workers=BURST_WORKERS) as executor:
        futures = [executor.submit(upload_single_file, nexus_api, desc, idx) for idx, desc in enumerate(file_sequence)]
        for future in as_completed(futures):
            _, ok, _ = future.result()
            if ok:
                successes += 1
    return successes


def _probe_health(
    base_url: str,
    rounds: int,
    interval_s: float,
) -> tuple[int, int, list[float]]:
    """Send *rounds* health probes and return (ok, fail, latencies)."""
    ok = 0
    fail = 0
    latencies: list[float] = []
    for _ in range(rounds):
        elapsed_ms, healthy = check_health(base_url)
        latencies.append(elapsed_ms)
        if healthy:
            ok += 1
        else:
            fail += 1
        time.sleep(interval_s)
    return ok, fail, latencies


# ---------------------------------------------------------------------------
# Test class
# ---------------------------------------------------------------------------


class TestResourceConsumption:
    """20.5 — Upload 100 files and verify stability under load.

    Validates:
        - Health endpoint remains responsive during conversion burst
        - No 5xx or timeouts during/after the burst
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_health_endpoint_stable_during_conversion_burst(
        self,
        nexus_api: NexusApiRegistry,
        nexus_base_url: str,
    ) -> None:
        """Health endpoint must stay responsive during a 100-file conversion burst.

        Uses the /health endpoint as a proxy for pod stability.  If
        /health times out or returns 5xx during the conversion window
        the pod is likely under extreme resource pressure.
        """
        upload_successes = _burst_upload(nexus_api, UPLOAD_COUNT)
        assert upload_successes > 0, "No uploads succeeded"

        h_ok_during, h_fail_during, lat_during = _probe_health(
            nexus_base_url,
            HEALTH_PROBES_DURING,
            HEALTH_PROBE_INTERVAL_S,
        )

        time.sleep(STABILISATION_WAIT_S)

        h_ok_after, h_fail_after, lat_after = _probe_health(
            nexus_base_url,
            HEALTH_PROBES_AFTER,
            HEALTH_PROBE_INTERVAL_S,
        )

        health_ok = h_ok_during + h_ok_after
        health_fail = h_fail_during + h_fail_after
        all_latencies = lat_during + lat_after
        total_probes = health_ok + health_fail
        max_latency = max(all_latencies) if all_latencies else 0.0

        diag = (
            f"\n--- Health stability during conversion burst (20.5) ---\n"
            f"  uploads={UPLOAD_COUNT}, successes={upload_successes}\n"
            f"  health probes: ok={health_ok}, failed={health_fail}, "
            f"total={total_probes}\n"
            f"  max health latency: {max_latency:.1f}ms\n"
        )

        assert health_fail == 0, (
            f"Health endpoint failed {health_fail}/{total_probes} probes "
            f"during conversion burst — pod may be under resource pressure{diag}"
        )

        logger.info(
            "Health endpoint stable during conversion burst",
            upload_successes=upload_successes,
            health_ok=health_ok,
            max_latency_ms=round(max_latency, 1),
        )


# ---------------------------------------------------------------------------
# Process-level memory monitoring (no oc required)
# ---------------------------------------------------------------------------

MEMORY_THRESHOLD_MB = 100
MEMORY_SAMPLE_RATE_S = 0.1


async def _measure_peak_memory[T](
    coro: Awaitable[T],
) -> tuple[T, float]:
    """Run *coro* while sampling RSS and return (result, increase_mb).

    Uses ``psutil`` to track the peak RSS of the current process while
    the coroutine is executing.
    """
    import asyncio

    import psutil  # type: ignore[import-untyped]

    process = psutil.Process()
    baseline_mb = process.memory_info().rss / 1024 / 1024
    peak_mb = baseline_mb

    stop = asyncio.Event()

    async def _sample() -> None:
        nonlocal peak_mb
        while not stop.is_set():
            current = process.memory_info().rss / 1024 / 1024
            peak_mb = max(peak_mb, current)
            try:
                await asyncio.wait_for(stop.wait(), timeout=MEMORY_SAMPLE_RATE_S)
            except TimeoutError:
                pass

    task = asyncio.create_task(_sample())
    try:
        result = await coro
    finally:
        stop.set()
        await task

    return result, peak_mb - baseline_mb


class TestProcessMemoryDuringConversion:
    """20.5 — Process-level memory usage during document conversion.

    Uses ``psutil`` to monitor RSS of the current process while running
    converters directly.  This complements the pod-level monitoring above
    and works without ``oc`` or an OpenShift cluster.

    Validates:
        - Memory increase < 100 MB for 8 MB text conversion
        - Memory increase < 150 MB for 3 MB PDF conversion
        - Memory increase < 200 MB for 3 concurrent 2 MB text conversions
    """

    @pytest.mark.asyncio
    async def test_memory_during_large_text_conversion(self) -> None:
        """8 MB text conversion must not spike memory by > 100 MB."""
        from nexus.files.document_conversion.converters.text_converter import TextConverter
        from tests.performance.files.conftest import generate_text_content, make_file_metadata

        content = generate_text_content(8 * 1024)
        metadata = make_file_metadata(content, suffix=".txt")

        converter = TextConverter()
        result, increase_mb = await _measure_peak_memory(
            converter.convert(content, metadata),
        )

        logger.info(
            "Text conversion memory usage",
            size_mb=len(content) / (1024 * 1024),
            increase_mb=round(increase_mb, 1),
        )

        assert result.success, "Text conversion should succeed"
        assert increase_mb < MEMORY_THRESHOLD_MB, (
            f"Memory increased by {increase_mb:.1f} MB during 8 MB text "
            f"conversion, exceeding {MEMORY_THRESHOLD_MB} MB threshold"
        )

    @pytest.mark.asyncio
    async def test_memory_during_pdf_conversion(self) -> None:
        """3 MB PDF conversion must not spike memory by > 150 MB."""
        from nexus.files.document_conversion.converters.pdf_converter import PDFConverter
        from tests.performance.files.conftest import generate_pdf_content, make_file_metadata

        content = generate_pdf_content(3 * 1024)
        metadata = make_file_metadata(content, suffix=".pdf")
        pdf_threshold = MEMORY_THRESHOLD_MB * 1.5

        converter = PDFConverter()
        result, increase_mb = await _measure_peak_memory(
            converter.convert(content, metadata),
        )

        logger.info(
            "PDF conversion memory usage",
            size_mb=len(content) / (1024 * 1024),
            increase_mb=round(increase_mb, 1),
        )

        assert result is not None, "PDF converter returned None"
        assert increase_mb < pdf_threshold, (
            f"Memory increased by {increase_mb:.1f} MB during 3 MB PDF "
            f"conversion, exceeding {pdf_threshold:.0f} MB threshold"
        )

    @pytest.mark.asyncio
    async def test_memory_during_concurrent_conversions(self) -> None:
        """3 concurrent 2 MB text conversions must not spike memory by > 200 MB."""
        import asyncio

        from nexus.files.document_conversion.converters.text_converter import TextConverter
        from tests.performance.files.conftest import generate_text_content, make_file_metadata

        if TYPE_CHECKING:
            from nexus.files.models import FileMetadata

        concurrent_threshold = MEMORY_THRESHOLD_MB * 2
        file_pairs: list[tuple[bytes, FileMetadata]] = []
        for _ in range(3):
            content = generate_text_content(2 * 1024)
            metadata = make_file_metadata(content, suffix=".txt")
            file_pairs.append((content, metadata))

        converter = TextConverter()
        results, increase_mb = await _measure_peak_memory(
            asyncio.gather(*[converter.convert(c, m) for c, m in file_pairs]),
        )

        logger.info(
            "Concurrent conversion memory usage",
            file_count=len(file_pairs),
            size_mb_each=2.0,
            increase_mb=round(increase_mb, 1),
        )

        for result in results:
            assert result.success, "Concurrent text conversion should succeed"

        assert increase_mb < concurrent_threshold, (
            f"Memory increased by {increase_mb:.1f} MB during concurrent "
            f"conversions, exceeding {concurrent_threshold:.0f} MB threshold"
        )
