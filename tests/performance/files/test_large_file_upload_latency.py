"""Suite 20 — File Upload & Document Conversion: Large File Upload Latency (20.3).

Tests NFR-002 (10 MB file size limit) enforcement and large file upload latency.

KPIs:
    - Large File Upload Latency: < 5s for 10 MB, < 15s for 50 MB
    - File Size Limit Enforcement (NFR-002): 11 MB rejected with HTTP 400 in < 3s
    MetricType: REQUEST_DURATION
    Validation: Client-side timing per upload

Rationale: POST /api/v1/files must handle large payloads without
timing out or blocking the event loop.  The endpoint validates, streams
the file to disk, persists metadata, and enqueues a background
conversion task.  For large files the I/O and validation cost is
proportionally higher, so an explicit latency budget per size tier
ensures the upload path scales predictably.

Note: The deployment may enforce a per-file size limit (commonly 10 MB).
If the 50 MB upload is rejected with HTTP 400, the test records the
rejection latency and verifies the server responds promptly rather than
hanging.

Run with:
    make test-performance
"""

from __future__ import annotations

import warnings
from typing import TYPE_CHECKING

import pytest
import structlog

from tests.performance.files.conftest import (
    generate_pdf_content,
    generate_text_content,
    make_file_metadata,
    upload_large_file,
)

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

pytestmark = pytest.mark.performance

logger = structlog.stdlib.get_logger(__name__)

# Size tiers (KB)
SIZE_10_MB_KB = 10 * 1024
SIZE_50_MB_KB = 50 * 1024

# KPI targets (milliseconds)
TARGET_10_MB_MS = 5_000
TARGET_50_MB_MS = 15_000

# Rejection-latency ceiling: even a 400 must come back fast
REJECTION_LATENCY_CEILING_MS = 3_000

REPETITIONS = 3


class TestLargeFileUploadLatency:
    """20.3 — Upload large files (10 MB, 50 MB); latency within budget.

    Validates:
        - 10 MB upload completes in < 5 s (client-measured)
        - 50 MB upload completes in < 15 s (client-measured)
        - If the server rejects 50 MB (HTTP 400 size-limit), the
          rejection itself arrives promptly (< 3 s)

    Each tier is uploaded multiple times; the *worst-case* latency
    across repetitions must satisfy the target.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    # ------------------------------------------------------------------ #
    # 10 MB tier
    # ------------------------------------------------------------------ #

    def test_10mb_pdf_upload_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """10 MB PDF upload must complete in < 5 s."""
        data = generate_pdf_content(SIZE_10_MB_KB)
        self._assert_upload_latency(
            nexus_api,
            filename="large_10mb.pdf",
            data=data,
            mime_type="application/pdf",
            target_ms=TARGET_10_MB_MS,
            label="10 MB PDF",
        )

    def test_10mb_text_upload_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """10 MB text upload must complete in < 5 s."""
        data = generate_text_content(SIZE_10_MB_KB)
        self._assert_upload_latency(
            nexus_api,
            filename="large_10mb.txt",
            data=data,
            mime_type="text/plain",
            target_ms=TARGET_10_MB_MS,
            label="10 MB text",
        )

    # ------------------------------------------------------------------ #
    # 50 MB tier
    # ------------------------------------------------------------------ #

    def test_50mb_pdf_upload_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """50 MB PDF upload must complete in < 15 s (or reject promptly)."""
        data = generate_pdf_content(SIZE_50_MB_KB)
        self._assert_upload_latency(
            nexus_api,
            filename="large_50mb.pdf",
            data=data,
            mime_type="application/pdf",
            target_ms=TARGET_50_MB_MS,
            label="50 MB PDF",
        )

    def test_50mb_text_upload_latency(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """50 MB text upload must complete in < 15 s (or reject promptly)."""
        data = generate_text_content(SIZE_50_MB_KB)
        self._assert_upload_latency(
            nexus_api,
            filename="large_50mb.txt",
            data=data,
            mime_type="text/plain",
            target_ms=TARGET_50_MB_MS,
            label="50 MB text",
        )

    # ------------------------------------------------------------------ #
    # Shared assertion logic
    # ------------------------------------------------------------------ #

    @staticmethod
    def _assert_upload_latency(
        nexus_api: NexusApiRegistry,
        *,
        filename: str,
        data: bytes,
        mime_type: str,
        target_ms: float,
        label: str,
    ) -> None:
        """Upload *data* ``REPETITIONS`` times and assert latency < *target_ms*.

        If every attempt is rejected with HTTP 400 (file-size limit), the
        test warns and instead validates that the rejection latency is
        below ``REJECTION_LATENCY_CEILING_MS``.
        """
        size_mb = len(data) / (1024 * 1024)

        logger.info(
            "Starting large file upload test",
            label=label,
            filename=filename,
            size_mb=round(size_mb, 1),
            target_ms=target_ms,
            repetitions=REPETITIONS,
        )

        latencies: list[float] = []
        successes = 0
        rejections = 0
        status_counts: dict[int, int] = {}

        for rep in range(REPETITIONS):
            elapsed_ms, ok, status_code = upload_large_file(
                nexus_api,
                filename,
                data,
                mime_type,
            )
            latencies.append(elapsed_ms)
            status_counts[status_code] = status_counts.get(status_code, 0) + 1

            logger.debug(
                "Large file upload attempt completed",
                label=label,
                repetition=rep + 1,
                total=REPETITIONS,
                elapsed_ms=round(elapsed_ms, 1),
                status_code=status_code,
                success=ok,
            )

            if ok:
                successes += 1
            elif status_code == 400:
                rejections += 1
                logger.warning(
                    "File rejected (size limit)",
                    label=label,
                    size_mb=round(size_mb, 1),
                    elapsed_ms=round(elapsed_ms, 1),
                )

        worst_ms = max(latencies)
        best_ms = min(latencies)
        avg_ms = sum(latencies) / len(latencies)

        diag = (
            f"\n--- Large file upload latency results ({label}) ---\n"
            f"  file={filename}, size={size_mb:.1f} MB, "
            f"repetitions={REPETITIONS}\n"
            f"  latencies: best={best_ms:.1f}ms, avg={avg_ms:.1f}ms, "
            f"worst={worst_ms:.1f}ms\n"
            f"  successes={successes}, rejections(400)={rejections}\n"
            f"  status_distribution={status_counts}\n"
        )

        if rejections == REPETITIONS:
            warnings.warn(
                f"All {REPETITIONS} uploads of {size_mb:.0f} MB file were "
                f"rejected (HTTP 400) — the deployment enforces a file-size "
                f"limit below {size_mb:.0f} MB.  Validating rejection latency "
                f"instead of upload latency.",
                stacklevel=2,
            )
            assert worst_ms < REJECTION_LATENCY_CEILING_MS, (
                f"Rejection latency for {label} ({worst_ms:.1f}ms) exceeds "
                f"ceiling {REJECTION_LATENCY_CEILING_MS}ms — the server took "
                f"too long to reject an oversized file{diag}"
            )
            logger.info(
                "Large file rejection latency captured",
                label=label,
                size_mb=round(size_mb, 1),
                worst_ms=round(worst_ms, 1),
                avg_ms=round(avg_ms, 1),
            )
            return

        assert successes > 0, f"No {label} uploads succeeded and failures were not size-limit rejections{diag}"

        assert worst_ms < target_ms, (
            f"Worst-case {label} upload latency {worst_ms:.1f}ms exceeds target {target_ms}ms{diag}"
        )

        logger.info(
            "Large file upload latency captured",
            label=label,
            size_mb=round(size_mb, 1),
            target_ms=target_ms,
            worst_ms=round(worst_ms, 1),
            avg_ms=round(avg_ms, 1),
            successes=successes,
        )


class TestFileSizeLimitEnforcement:
    """20.3 — Verify the 10 MB file-size limit is enforced promptly.

    Validates:
        - An 11 MB upload is rejected (HTTP 400) — not silently accepted
        - The rejection response arrives in < 3 s (fast fail)
        - A boundary (10 MB) text file is handled without crashing

    These complement the latency tests above by explicitly asserting
    the *correctness* of size-limit enforcement, not just its speed.
    """

    @pytest.fixture(autouse=True)
    def _setup(
        self,
        nexus_api: NexusApiRegistry,
        file_upload_enabled: None,
    ) -> None:
        nexus_api.internal_metrics.reset_store().assert_successful()

    def test_oversized_file_rejected(
        self,
        nexus_api: NexusApiRegistry,
    ) -> None:
        """11 MB file must be rejected with HTTP 400 in < 3 s."""
        data = generate_text_content(11 * 1024)

        elapsed_ms, ok, status_code = upload_large_file(
            nexus_api,
            "oversized_11mb.txt",
            data,
            "text/plain",
        )

        diag = (
            f"\n--- File size limit enforcement ---\n"
            f"  file_size=11 MB, status={status_code}, "
            f"elapsed={elapsed_ms:.1f}ms\n"
        )

        assert status_code == 400, f"Expected HTTP 400 for oversized file, got {status_code}{diag}"
        assert not ok, f"Oversized upload should not succeed{diag}"
        assert elapsed_ms < REJECTION_LATENCY_CEILING_MS, (
            f"Rejection took {elapsed_ms:.1f}ms, exceeds {REJECTION_LATENCY_CEILING_MS}ms ceiling{diag}"
        )

        logger.info(
            "Oversized file correctly rejected",
            status_code=status_code,
            elapsed_ms=round(elapsed_ms, 1),
        )

    @pytest.mark.asyncio
    async def test_boundary_10mb_text_handled(self) -> None:
        """10 MB text file must be processable by the converter without crashing."""
        from nexus.files.document_conversion.converters.text_converter import TextConverter

        data = generate_text_content(10 * 1024)
        metadata = make_file_metadata(data, suffix=".txt")

        converter = TextConverter()
        result = await converter.convert(data, metadata)

        assert result is not None, "Converter returned None for 10 MB file"
        assert result.success, "Text converter should handle 10 MB boundary file"

        logger.info(
            "Boundary 10 MB file handled successfully",
            size_mb=len(data) / (1024 * 1024),
        )
