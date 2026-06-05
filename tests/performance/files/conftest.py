"""Suite-specific fixtures for Suite 20: File Upload & Document Conversion.

These tests run against a live Nexus deployment and validate upload
response-time KPIs from the Nexus Performance Test Plan.

Suite-wide fixtures (perf_test_mode_enabled) and helpers
(compute_percentile, poll_for_metric_records, poll_for_component_kpis)
are defined in ``tests/performance/conftest.py`` and inherited
automatically.  This file adds file-upload-specific test data and
helpers.

The ``POST /api/v1/files`` endpoint accepts multipart file uploads,
validates files, persists metadata, and enqueues background document
conversion.  The KPI target is the *pre-conversion* API response time,
not the end-to-end conversion duration.

Prerequisites:
    - APP_BASE_URL pointing to the Nexus deployment
    - metrics.perf_test_mode enabled on the target instance
    - Valid admin credentials (APP_ADMIN_PASSWORD_PATH or .secrets/admin-password)

Run with:
    make test-performance
"""

from __future__ import annotations

import io
import time
from typing import TYPE_CHECKING, Any

import pytest

from tests.performance.conftest import log_request_failure

if TYPE_CHECKING:
    from nexus_api_client.api import NexusApiRegistry

    from nexus.files.models import FileMetadata

# ---------------------------------------------------------------------------
# Synthetic file content generators
# ---------------------------------------------------------------------------

_TEXT_LINE = "Performance test content — lorem ipsum dolor sit amet. " * 4 + "\n"


def generate_text_content(size_kb: int = 64) -> bytes:
    """Generate plain-text content of approximately *size_kb* kilobytes."""
    target = size_kb * 1024
    buf = io.BytesIO()
    line = _TEXT_LINE.encode()
    while buf.tell() < target:
        buf.write(line)
    return buf.getvalue()[:target]


def generate_pdf_content(size_kb: int = 128) -> bytes:
    """Generate a minimal PDF structure of approximately *size_kb* kilobytes.

    The resulting bytes are a structurally-valid-enough PDF for the upload
    endpoint's MIME validation; actual rendering fidelity is irrelevant
    for upload response-time measurement.
    """
    target = size_kb * 1024
    header = b"%PDF-1.4\n"
    catalog = b"1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n"
    pages = b"2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n"
    page = b"3 0 obj\n<< /Type /Page /Parent 2 0 R /Contents 4 0 R >>\nendobj\n"

    fill = b"Performance test filler content for PDF payload. " * 20
    body_len = max(target - len(header) - len(catalog) - len(pages) - len(page) - 120, 64)
    stream_data = (fill * ((body_len // len(fill)) + 1))[:body_len]

    stream_obj = (
        b"4 0 obj\n<< /Length " + str(len(stream_data)).encode() + b" >>\n"
        b"stream\n" + stream_data + b"\nendstream\nendobj\n"
    )

    footer = b"xref\n0 5\ntrailer\n<< /Size 5 /Root 1 0 R >>\n%%EOF\n"
    return header + catalog + pages + page + stream_obj + footer


def generate_docx_content(size_kb: int = 64) -> bytes:
    """Generate a minimal .docx (ZIP-based OOXML) payload.

    The endpoint infers MIME type from the filename extension, so this
    only needs to be a valid ZIP archive containing the minimum OOXML
    structure that passes content-type sniffing.
    """
    import zipfile

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        zf.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
            'Target="word/document.xml"/>'
            "</Relationships>",
        )
        filler = ("Performance test paragraph content. " * 30 + "\n") * max(size_kb // 2, 1)
        zf.writestr(
            "word/document.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            "<w:body><w:p><w:r><w:t>" + filler + "</w:t></w:r></w:p></w:body>"
            "</w:document>",
        )
    return buf.getvalue()


# ---------------------------------------------------------------------------
# File mix definition
# ---------------------------------------------------------------------------

FILE_TYPE_PDF = "pdf"
FILE_TYPE_DOCX = "docx"
FILE_TYPE_TEXT = "txt"

MIME_TEXT = "text/plain"
MIME_PDF = "application/pdf"

FILE_MIX: list[dict[str, Any]] = [
    {"ext": FILE_TYPE_PDF, "mime": MIME_PDF, "size_kb": 128},
    {
        "ext": FILE_TYPE_DOCX,
        "mime": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "size_kb": 64,
    },
    {"ext": FILE_TYPE_TEXT, "mime": MIME_TEXT, "size_kb": 32},
]

UPLOAD_COUNT = 50


def build_file_sequence(count: int = UPLOAD_COUNT) -> list[dict[str, Any]]:
    """Return a list of *count* file descriptors cycling through the mix."""
    return [FILE_MIX[i % len(FILE_MIX)] for i in range(count)]


def make_file_payload(descriptor: dict[str, Any], index: int) -> tuple[str, io.BytesIO, str]:
    """Create an in-memory file payload from a file descriptor.

    Returns (filename, payload_stream, mime_type).
    """
    ext = descriptor["ext"]
    mime = descriptor["mime"]
    size_kb: int = descriptor["size_kb"]

    if ext == FILE_TYPE_PDF:
        data = generate_pdf_content(size_kb)
    elif ext == FILE_TYPE_DOCX:
        data = generate_docx_content(size_kb)
    else:
        data = generate_text_content(size_kb)

    filename = f"perf_test_{index:03d}.{ext}"
    return filename, io.BytesIO(data), mime


# ---------------------------------------------------------------------------
# Upload helper
# ---------------------------------------------------------------------------


def upload_single_file(
    nexus_api: NexusApiRegistry,
    descriptor: dict[str, Any],
    index: int,
) -> tuple[float, bool, int]:
    """Upload a single file via POST /api/v1/files and measure response time.

    Returns (elapsed_ms, success, status_code).
    """
    from nexus_api_client.models.upload_files_body import UploadFilesBody
    from nexus_api_client.types import File

    filename, payload, mime_type = make_file_payload(descriptor, index)
    body = UploadFilesBody(
        files=[File(payload=payload, file_name=filename, mime_type=mime_type)],
    )

    start = time.monotonic()
    try:
        r = nexus_api.files.upload(body=body)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success, r.status_code
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="upload_single_file")
        return elapsed_ms, False, 0


def upload_large_file(
    nexus_api: NexusApiRegistry,
    filename: str,
    data: bytes,
    mime_type: str,
) -> tuple[float, bool, int]:
    """Upload an already-generated large file and measure response time.

    Unlike ``upload_single_file`` this accepts raw bytes directly,
    avoiding the overhead of the descriptor/generator indirection for
    large payloads that have already been materialised.

    Returns (elapsed_ms, success, status_code).
    """
    from nexus_api_client.models.upload_files_body import UploadFilesBody
    from nexus_api_client.types import File

    body = UploadFilesBody(
        files=[File(payload=io.BytesIO(data), file_name=filename, mime_type=mime_type)],
    )

    start = time.monotonic()
    try:
        r = nexus_api.files.upload(body=body)
        elapsed_ms = (time.monotonic() - start) * 1000
        return elapsed_ms, r.is_success, r.status_code
    except Exception as exc:
        elapsed_ms = (time.monotonic() - start) * 1000
        log_request_failure(exc, context="upload_large_file")
        return elapsed_ms, False, 0


# ---------------------------------------------------------------------------
# Direct converter helpers (component-level, no network I/O)
# ---------------------------------------------------------------------------


def make_file_metadata(content: bytes, suffix: str = ".txt") -> FileMetadata:
    """Create a FileMetadata instance for direct converter testing.

    No disk I/O — converters receive file_content as bytes directly
    and only use FileMetadata for filename/mime/size information.
    """
    from nexus.files.models import FileMetadata, FileStatus

    mime_map = {
        ".txt": MIME_TEXT,
        ".pdf": MIME_PDF,
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    mime = mime_map.get(suffix, "application/octet-stream")

    return FileMetadata(
        filename=f"perf_test{suffix}",
        file_path=f"/tmp/perf_test{suffix}",  # noqa: S108
        mime_type=mime,
        size_bytes=len(content),
        status=FileStatus.PENDING_CONVERSION,
    )


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def file_upload_enabled(
    nexus_api: NexusApiRegistry,
    perf_test_mode_enabled: None,
) -> None:
    """Verify that POST /api/v1/files is reachable and accepts uploads.

    Sends a single probe upload (small text file) and skips the module if
    the endpoint is unavailable or returns an unexpected error.
    """
    from nexus_api_client.models.upload_files_body import UploadFilesBody
    from nexus_api_client.types import File

    probe_data = b"Probe file for Suite 20 file upload performance tests.\n"
    body = UploadFilesBody(
        files=[File(payload=io.BytesIO(probe_data), file_name="probe.txt", mime_type="text/plain")],
    )

    try:
        r = nexus_api.files.upload(body=body)
    except Exception as exc:
        pytest.skip(
            f"POST /api/v1/files is unreachable ({type(exc).__name__}). "
            "Suite 20 requires a working file upload endpoint."
        )

    if r.status_code in {401, 403}:
        pytest.skip(
            f"Authentication failure (HTTP {r.status_code}) on POST /api/v1/files. "
            "Check admin credentials for the target deployment."
        )

    if not r.is_success:
        pytest.skip(
            f"POST /api/v1/files returned HTTP {r.status_code}. Suite 20 requires a working file upload endpoint."
        )
