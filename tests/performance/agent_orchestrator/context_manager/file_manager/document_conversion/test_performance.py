"""Performance tests for document conversion component.

This module tests NFR-001 (30-second conversion time) and NFR-002 (10MB file size limit)
as well as memory usage during conversion operations.
"""

import asyncio
import io
import tempfile
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from pathlib import Path
from unittest.mock import patch

import psutil  # type: ignore[import-untyped]
import pytest
from httpx import AsyncClient

from nexus.agent_orchestrator.context_manager.file_manager import FileMetadata
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.converters.pdf_converter import (
    PDFConverter,
)
from nexus.agent_orchestrator.context_manager.file_manager.document_conversion.converters.text_converter import (
    TextConverter,
)
from tests.conftest import wait_for_invocation_execution

# Test fixtures directory
FIXTURES_DIR = Path(__file__).parent.parent.parent.parent.parent.parent / "fixtures" / "files"

# Memory monitoring constants
MEMORY_THRESHOLD_MB = 100  # 100MB memory threshold for conversion operations
SAMPLE_RATE_SECONDS = 0.1  # Sample memory usage every 100ms


class MemoryMonitor:
    """Monitor memory usage during operations."""

    def __init__(self) -> None:
        """Initialize the memory monitor."""
        self.process = psutil.Process()
        self.baseline_memory_mb = self.process.memory_info().rss / 1024 / 1024
        self.peak_memory_mb = self.baseline_memory_mb
        self.monitoring = False

    async def start_monitoring(self) -> None:
        """Start background memory monitoring."""
        self.monitoring = True
        self.peak_memory_mb = self.baseline_memory_mb

        async def monitor() -> None:
            while self.monitoring:
                current_memory_mb = self.process.memory_info().rss / 1024 / 1024
                self.peak_memory_mb = max(self.peak_memory_mb, current_memory_mb)
                await asyncio.sleep(SAMPLE_RATE_SECONDS)

        # Start monitoring task in background
        self.monitor_task = asyncio.create_task(monitor())

    async def stop_monitoring(self) -> float:
        """Stop monitoring and return peak memory usage increase in MB."""
        self.monitoring = False
        if hasattr(self, "monitor_task"):
            await self.monitor_task
        return float(self.peak_memory_mb - self.baseline_memory_mb)


@asynccontextmanager
async def memory_monitor() -> AsyncGenerator[MemoryMonitor, None]:
    """Context manager for memory monitoring."""
    monitor = MemoryMonitor()
    await monitor.start_monitoring()
    try:
        yield monitor
    finally:
        await monitor.stop_monitoring()


def create_large_pdf_content(size_mb: float) -> bytes:
    """Create a mock large PDF content for testing."""
    # PDF header
    pdf_content = b"%PDF-1.4\n"

    # Calculate how much content we need
    target_size = int(size_mb * 1024 * 1024)

    # Add a simple PDF structure with repeated content
    pdf_content += b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    pdf_content += b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    pdf_content += b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"
    pdf_content += b"4 0 obj\n<< /Length " + str(target_size - len(pdf_content) - 100).encode() + b" >>\nstream\n"

    # Fill with repetitive text content to reach target size
    fill_text = b"This is test content for performance testing. " * 1000
    remaining_size = target_size - len(pdf_content) - 50

    while len(pdf_content) < target_size - 50:
        chunk_size = min(len(fill_text), remaining_size)
        pdf_content += fill_text[:chunk_size]
        remaining_size -= chunk_size
        if remaining_size <= 0:
            break

    # PDF footer
    pdf_content += b"\nendstream\nendobj\n"
    pdf_content += b"xref\n0 5\n"
    pdf_content += b"trailer\n<< /Size 5 /Root 1 0 R >>\n"
    pdf_content += b"%%EOF\n"

    return pdf_content


def create_large_text_content(size_mb: float) -> bytes:
    """Create large text content for testing."""
    text_line = "This is a line of text for performance testing. " * 20 + "\n"
    target_size = int(size_mb * 1024 * 1024)

    content = b""
    while len(content) < target_size:
        remaining = target_size - len(content)
        chunk_size = min(len(text_line.encode()), remaining)
        content += text_line.encode()[:chunk_size]
        if len(content) >= target_size:
            break

    return content


class TestConversionTimePerformance:
    """Test conversion time performance requirements (NFR-001)."""

    @pytest.mark.asyncio
    async def test_pdf_conversion_under_30_seconds(self, auth_client: AsyncClient) -> None:
        """Test that PDF conversion completes within 30 seconds (NFR-001)."""
        # Create a reasonably-sized PDF for testing (2MB)
        pdf_content = create_large_pdf_content(2.0)

        start_time = time.time()

        with patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"):
            # Create multipart form data with document upload
            files = {"files": ("performance_test.pdf", io.BytesIO(pdf_content), "application/pdf")}
            data = {
                "prompt": "Analyze this document for performance testing.",
                "session_id": "performance-test-pdf",
            }

            # POST invocation with document
            response = await auth_client.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            assert response.status_code == 202
            invocation_data = response.json()
            invocation_id = invocation_data["id"]

            # Wait for conversion and execution with extended timeout for performance test
            async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=35.0):
                conversion_time = time.time() - start_time

                # Verify conversion completed within 30 seconds (NFR-001)
                assert conversion_time < 30.0, f"PDF conversion took {conversion_time:.2f}s, exceeding 30s limit"

    @pytest.mark.asyncio
    async def test_text_conversion_under_30_seconds(self, auth_client: AsyncClient) -> None:
        """Test that large text file conversion completes within 30 seconds (NFR-001)."""
        # Create a large text file (5MB)
        text_content = create_large_text_content(5.0)

        start_time = time.time()

        with patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"):
            # Create multipart form data with document upload
            files = {"files": ("performance_test.txt", io.BytesIO(text_content), "text/plain")}
            data = {
                "prompt": "Summarize this large text document.",
                "session_id": "performance-test-text",
            }

            # POST invocation with document
            response = await auth_client.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            assert response.status_code == 202
            invocation_data = response.json()
            invocation_id = invocation_data["id"]

            # Wait for conversion and execution
            async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=35.0):
                conversion_time = time.time() - start_time

                # Verify conversion completed within 30 seconds (NFR-001)
                assert conversion_time < 30.0, f"Text conversion took {conversion_time:.2f}s, exceeding 30s limit"

    @pytest.mark.asyncio
    async def test_service_level_conversion_performance(self) -> None:
        """Test direct service-level conversion performance."""
        # Create large content for testing
        large_content = create_large_text_content(1.0)

        # Use temporary file for secure testing
        with tempfile.NamedTemporaryFile(suffix=".txt") as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(large_content)
            temp_file.flush()

            # Create test file metadata
            file_metadata = FileMetadata(
                file_id="perf-test-123",
                filename="performance_test.txt",
                file_path=str(temp_path),
                mime_type="text/plain",
                size_bytes=1024 * 1024,  # 1MB
                status="pending_parse",
            )

            # Test direct converter performance (simpler than full service)
            converter = TextConverter()

            start_time = time.time()

            # This should complete quickly as it's a simple text conversion
            result = await converter.convert(large_content, file_metadata)

            conversion_time = time.time() - start_time

            # Text conversion should be very fast (under 5 seconds)
            assert conversion_time < 5.0, f"Service-level text conversion took {conversion_time:.2f}s"
            assert result.success, "Conversion should succeed"


class TestFileSizeLimitPerformance:
    """Test file size limit performance requirements (NFR-002)."""

    @pytest.mark.asyncio
    async def test_10mb_file_size_limit_enforcement(self, auth_client: AsyncClient) -> None:
        """Test that 10MB file size limit is enforced (NFR-002)."""
        # Create a file that exceeds 10MB
        oversized_content = create_large_text_content(11.0)  # 11MB file

        with patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"):
            # Try to upload oversized file
            files = {"files": ("oversized.txt", io.BytesIO(oversized_content), "text/plain")}
            data = {
                "prompt": "This should fail due to size limit.",
                "session_id": "size-limit-test",
            }

            # POST invocation with oversized document
            response = await auth_client.post(
                "/api/v1/invocations",
                data=data,
                files=files,
            )

            # File size limit should be enforced at the API level with 400 Bad Request
            assert response.status_code == 400, f"Expected 400 for oversized file, got {response.status_code}"

            # Verify error message indicates file size issue
            response_data = response.json()
            assert "size" in str(response_data).lower() or "large" in str(response_data).lower(), (
                "Error response should indicate file size issue"
            )

    @pytest.mark.asyncio
    async def test_max_file_size_boundary(self) -> None:
        """Test file size handling at the boundary (exactly 10MB)."""
        # Create exactly 10MB content
        boundary_content = create_large_text_content(10.0)

        # Use temporary file for secure testing
        with tempfile.NamedTemporaryFile(suffix=".txt") as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(boundary_content)
            temp_file.flush()

            file_metadata = FileMetadata(
                file_id="boundary-test-123",
                filename="boundary_test.txt",
                file_path=str(temp_path),
                mime_type="text/plain",
                size_bytes=len(boundary_content),
                status="pending_parse",
            )

            # Test with direct converter instead of service
            converter = TextConverter()

            # This should either succeed or fail gracefully based on file size
            result = await converter.convert(boundary_content, file_metadata)

            # Either way, it should not crash or hang
            assert result is not None
            # For text converter, large files should still work (it's simple processing)
            assert result.success, "Text converter should handle large files"


class TestMemoryUsagePerformance:
    """Test memory usage during conversion operations."""

    @pytest.mark.asyncio
    async def test_memory_usage_during_large_file_conversion(self) -> None:
        """Test memory usage remains reasonable during large file conversion."""
        # Create a large text file (8MB - within limits but substantial)
        large_content = create_large_text_content(8.0)

        # Use temporary file for secure testing
        with tempfile.NamedTemporaryFile(suffix=".txt") as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(large_content)
            temp_file.flush()

            file_metadata = FileMetadata(
                file_id="memory-test-123",
                filename="memory_test.txt",
                file_path=str(temp_path),
                mime_type="text/plain",
                size_bytes=len(large_content),
                status="pending_parse",
            )

            # Test with direct converter instead of full service
            converter = TextConverter()

            # Monitor memory usage during conversion
            async with memory_monitor() as monitor:
                result = await converter.convert(large_content, file_metadata)
                memory_increase_mb = await monitor.stop_monitoring()

            # Verify conversion succeeded
            assert result.success, "Large file conversion should succeed"

            # Memory increase should be reasonable (under 100MB for 8MB file)
            assert memory_increase_mb < MEMORY_THRESHOLD_MB, (
                f"Memory usage increased by {memory_increase_mb:.1f}MB, exceeding threshold of {MEMORY_THRESHOLD_MB}MB"
            )

    @pytest.mark.asyncio
    async def test_memory_usage_during_pdf_conversion(self) -> None:
        """Test memory usage during PDF conversion."""
        # Create a moderately-sized PDF (3MB)
        pdf_content = create_large_pdf_content(3.0)

        # Use temporary file for secure testing
        with tempfile.NamedTemporaryFile(suffix=".pdf") as temp_file:
            temp_path = Path(temp_file.name)
            temp_file.write(pdf_content)
            temp_file.flush()

            file_metadata = FileMetadata(
                file_id="pdf-memory-test-123",
                filename="pdf_memory_test.pdf",
                file_path=str(temp_path),
                mime_type="application/pdf",
                size_bytes=len(pdf_content),
                status="pending_parse",
            )

            # Test with PDF converter instead of full service
            converter = PDFConverter()

            # Monitor memory usage during PDF conversion
            async with memory_monitor() as monitor:
                result = await converter.convert(pdf_content, file_metadata)
                memory_increase_mb = await monitor.stop_monitoring()

            # Verify conversion result (may succeed or fail depending on PDF validity)
            assert result is not None, "PDF conversion should return a result"

            # PDF conversion might use more memory than text, but should still be reasonable
            assert memory_increase_mb < MEMORY_THRESHOLD_MB * 1.5, (
                f"PDF conversion memory usage increased by {memory_increase_mb:.1f}MB, "
                f"exceeding threshold of {MEMORY_THRESHOLD_MB * 1.5}MB"
            )

    @pytest.mark.asyncio
    async def test_concurrent_conversion_memory_usage(self) -> None:
        """Test memory usage when processing multiple files concurrently."""
        # Create multiple test files with temporary files
        file_metadatas = []
        file_contents = []
        temp_paths = []

        # Create temporary files using context managers
        with (
            tempfile.NamedTemporaryFile(suffix="_concurrent_0.txt") as temp_file_0,
            tempfile.NamedTemporaryFile(suffix="_concurrent_1.txt") as temp_file_1,
            tempfile.NamedTemporaryFile(suffix="_concurrent_2.txt") as temp_file_2,
        ):
            temp_files = [temp_file_0, temp_file_1, temp_file_2]

            for i in range(3):
                content = create_large_text_content(2.0)  # 3 x 2MB files = 6MB total
                file_contents.append(content)

                temp_file = temp_files[i]
                temp_path = Path(temp_file.name)
                temp_file.write(content)
                temp_file.flush()
                temp_paths.append(temp_path)

                file_metadata = FileMetadata(
                    file_id=f"concurrent-test-{i}",
                    filename=f"concurrent_test_{i}.txt",
                    file_path=str(temp_path),
                    mime_type="text/plain",
                    size_bytes=len(content),
                    status="pending_parse",
                )
                file_metadatas.append(file_metadata)

            # Test concurrent processing with direct converters instead of service
            converter = TextConverter()

            # Monitor memory usage during concurrent conversions
            async with memory_monitor() as monitor:
                # Process files concurrently with converters
                tasks = []
                for i, metadata in enumerate(file_metadatas):
                    tasks.append(converter.convert(file_contents[i], metadata))

                results = await asyncio.gather(*tasks)
                memory_increase_mb = await monitor.stop_monitoring()

            # Verify all conversions succeeded
            for result in results:
                assert result.success, "Concurrent conversion should succeed"

            # Concurrent processing should not cause excessive memory usage
            assert memory_increase_mb < MEMORY_THRESHOLD_MB * 2, (
                f"Concurrent conversion memory usage increased by {memory_increase_mb:.1f}MB, "
                f"exceeding threshold of {MEMORY_THRESHOLD_MB * 2}MB"
            )


class TestPerformanceBenchmarks:
    """Performance benchmarking tests for optimization tracking."""

    @pytest.mark.asyncio
    async def test_text_converter_benchmark(self) -> None:
        """Benchmark text converter performance for optimization tracking."""
        converter = TextConverter()

        # Test with various file sizes
        test_sizes_mb = [0.1, 0.5, 1.0, 2.0]
        benchmark_results = {}

        for size_mb in test_sizes_mb:
            content = create_large_text_content(size_mb)

            # Use temporary file for secure testing
            with tempfile.NamedTemporaryFile(suffix=f"_benchmark_{size_mb}mb.txt") as temp_file:
                temp_path = Path(temp_file.name)
                temp_file.write(content)
                temp_file.flush()

                file_metadata = FileMetadata(
                    file_id=f"benchmark-{size_mb}mb",
                    filename=f"benchmark_{size_mb}mb.txt",
                    file_path=str(temp_path),
                    mime_type="text/plain",
                    size_bytes=len(content),
                    status="pending_parse",
                )

                start_time = time.time()
                result = await converter.convert(content, file_metadata)
                conversion_time = time.time() - start_time

                benchmark_results[f"{size_mb}MB"] = {
                    "time_seconds": conversion_time,
                    "mb_per_second": size_mb / conversion_time if conversion_time > 0 else 0,
                    "success": result.success,
                }

                # Text conversion should be fast (> 10 MB/s)
                throughput = size_mb / conversion_time if conversion_time > 0 else 0
                assert throughput > 10.0, f"Text conversion throughput {throughput:.1f} MB/s too slow"

        # Note: benchmark results are captured for performance tracking

    @pytest.mark.asyncio
    async def test_end_to_end_performance_benchmark(self, auth_client: AsyncClient) -> None:
        """Benchmark end-to-end performance including API overhead."""
        test_files = [
            ("small.txt", create_large_text_content(0.5), "text/plain"),
            ("medium.txt", create_large_text_content(2.0), "text/plain"),
        ]

        benchmark_results = {}

        with patch("nexus.agent_orchestrator.executor.invocation_executor.get_openrouter_llm"):
            for filename, content, mime_type in test_files:
                start_time = time.time()

                # Create multipart form data with document upload
                files = {"files": (filename, io.BytesIO(content), mime_type)}
                data = {
                    "prompt": f"Process {filename} for benchmarking.",
                    "session_id": f"benchmark-{filename}",
                }

                # POST invocation with document
                response = await auth_client.post(
                    "/api/v1/invocations",
                    data=data,
                    files=files,
                )

                assert response.status_code == 202
                invocation_data = response.json()
                invocation_id = invocation_data["id"]

                # Wait for conversion and execution
                async with wait_for_invocation_execution(auth_client, invocation_id, max_wait_time=30.0) as final_data:
                    total_time = time.time() - start_time

                    file_size_mb = len(content) / (1024 * 1024)
                    benchmark_results[filename] = {
                        "total_time_seconds": total_time,
                        "file_size_mb": file_size_mb,
                        "throughput_mb_per_s": file_size_mb / total_time if total_time > 0 else 0,
                        "success": final_data is not None and final_data["status"] != "failed",
                    }

                    # End-to-end should complete within reasonable time
                    assert total_time < 30.0, f"End-to-end processing took {total_time:.2f}s"

        # Note: benchmark results are captured for performance tracking
