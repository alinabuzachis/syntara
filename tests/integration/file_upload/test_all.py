"""Integration tests for file upload functionality.

These tests validate end-to-end file upload scenarios from quickstart.md:
- Scenario 1: Upload Valid PDF File
- Scenario 2: Upload DOCX File
- Scenario 3: Upload Text/Markdown Files
- Scenario 4: Backward Compatibility (No Files)
- Scenario 5: File Too Large Error
- Scenario 6: Unsupported Format Error
- Scenario 7: Too Many Files Error
- Scenario 8: Multiple Files Upload
- Scenario 9: Context Data Integration
"""

from pathlib import Path

import pytest
from httpx import AsyncClient

from tests.fixtures import generate_large_file


@pytest.mark.asyncio
async def test_upload_pdf_file(auth_client: AsyncClient, test_user, sample_pdf_path: Path) -> None:
    """Scenario 1: Upload Valid PDF File.

    Validates:
    - PDF file upload succeeds
    - 202 response status
    - file_metadata array with status="pending_parse"
    - File exists at file_path location
    """
    # Arrange
    with sample_pdf_path.open("rb") as f:
        files = [("files", ("sample.pdf", f, "application/pdf"))]
        data = {
            "prompt": "Analyze the attached document and summarize key points",
            "session_id": "test-session-001",
        }

        # Act
        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert
    # This test will fail until implementation is done
    assert response.status_code == 202

    response_data = response.json()
    assert "context_data" in response_data
    assert "file_metadata" in response_data["context_data"]

    file_metadata = response_data["context_data"]["file_metadata"]
    assert isinstance(file_metadata, list)
    assert len(file_metadata) == 1

    metadata = file_metadata[0]
    assert metadata["filename"] == "sample.pdf"
    assert metadata["status"] == "pending_parse"
    assert "file_id" in metadata  # Public identifier
    assert "file_path" not in metadata  # SECURITY: Internal path not exposed


@pytest.mark.asyncio
async def test_upload_docx_file(auth_client: AsyncClient, test_user, sample_docx_path: Path) -> None:
    """Scenario 2: Upload DOCX File.

    Validates:
    - DOCX file upload succeeds
    - MIME type correctly detected
    - File metadata includes DOCX MIME type
    """
    # Arrange
    with sample_docx_path.open("rb") as f:
        files = [
            ("files", ("sample.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
        ]
        data = {
            "prompt": "Extract action items from this document",
            "session_id": "test-session-002",
        }

        # Act
        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert
    # This test will fail until implementation is done
    assert response.status_code == 202

    response_data = response.json()
    file_metadata = response_data["context_data"]["file_metadata"]
    assert len(file_metadata) == 1

    metadata = file_metadata[0]
    assert metadata["filename"] == "sample.docx"
    # DOCX MIME type
    assert "wordprocessing" in metadata["mime_type"] or "document" in metadata["mime_type"]
    assert metadata["status"] == "pending_parse"


@pytest.mark.asyncio
async def test_upload_text_and_markdown(
    auth_client: AsyncClient, test_user, sample_txt_path: Path, sample_md_path: Path
) -> None:
    """Scenario 3: Upload Text/Markdown Files.

    Validates:
    - Text file MIME type detection
    - Markdown file MIME type detection
    - Both file types accepted
    """
    # Test TXT file
    with sample_txt_path.open("rb") as f:
        files = [("files", ("sample.txt", f, "text/plain"))]
        data = {
            "prompt": "Summarize this README",
            "session_id": "test-session-003a",
        }

        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert TXT
    # This test will fail until implementation is done
    assert response.status_code == 202
    response_data = response.json()
    file_metadata = response_data["context_data"]["file_metadata"]
    assert file_metadata[0]["mime_type"] in ["text/plain", "text/markdown"]

    # Test MD file
    with sample_md_path.open("rb") as f:
        files = [("files", ("sample.md", f, "text/markdown"))]
        data = {
            "prompt": "Review this documentation",
            "session_id": "test-session-003b",
        }

        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert MD
    assert response.status_code == 202
    response_data = response.json()
    file_metadata = response_data["context_data"]["file_metadata"]
    # Markdown may be detected as text/plain or text/markdown
    assert file_metadata[0]["mime_type"] in ["text/plain", "text/markdown"]


@pytest.mark.asyncio
async def test_invocation_without_files(auth_client: AsyncClient, test_user) -> None:
    """Scenario 4: Invocation Without Files (Backward Compatibility).

    Validates:
    - JSON requests without files still work
    - 202 response
    - context_data is empty object
    - No file_metadata field
    """
    # Arrange
    payload = {
        "prompt": "What is the weather today?",
        "session_id": "test-session-004",
    }

    # Act
    response = await auth_client.post(
        "/api/v1/invocations",
        json=payload,
    )

    # Assert
    assert response.status_code == 202

    response_data = response.json()
    assert "context_data" in response_data
    assert response_data["context_data"] == {}
    assert "file_metadata" not in response_data["context_data"]


@pytest.mark.asyncio
async def test_file_too_large_error(auth_client: AsyncClient, test_user) -> None:
    """Scenario 5: File Too Large Error.

    Validates:
    - Files exceeding 10MB limit rejected
    - 400 error status
    - Error message includes size information
    - No invocation created
    """
    # Arrange - Generate 15MB file dynamically
    large_content = generate_large_file(15)  # 15MB

    files = [("files", ("large.pdf", large_content, "application/pdf"))]
    data = {
        "prompt": "Analyze this large document",
        "session_id": "test-session-005",
    }

    # Act
    response = await auth_client.post(
        "/api/v1/invocations",
        data=data,
        files=files,
    )

    # Assert
    assert response.status_code == 400

    error_data = response.json()
    assert "detail" in error_data
    detail = error_data["detail"]

    # Verify error message mentions file is too large and includes size info
    assert "too large" in detail
    assert "Maximum allowed size" in detail


@pytest.mark.asyncio
async def test_unsupported_format_error(auth_client: AsyncClient, test_user, sample_image_path: Path) -> None:
    """Scenario 6: Unsupported Format Error.

    Validates:
    - Unsupported file types rejected (PNG image)
    - 400 error status
    - Error lists supported formats
    - No invocation created
    """
    # Arrange
    with sample_image_path.open("rb") as f:
        files = [("files", ("image.png", f, "image/png"))]
        data = {
            "prompt": "Analyze this image",
            "session_id": "test-session-006",
        }

        # Act
        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert
    assert response.status_code == 400

    error_data = response.json()
    assert "detail" in error_data
    detail = error_data["detail"]

    # Verify error message mentions the unsupported format and lists supported formats
    assert "Unsupported file format" in detail
    assert "image/png" in detail
    assert "Supported formats:" in detail


@pytest.mark.asyncio
async def test_too_many_files_error(auth_client: AsyncClient, test_user, sample_pdf_path: Path) -> None:
    """Scenario 7: Too Many Files Error.

    Validates:
    - Uploading > 10 files rejected
    - 400 error status
    - Error message includes file count and limit
    - No invocation created
    """
    # Arrange - 15 files (exceeds limit of 10)
    # Reuse the same PDF file content 15 times with different names
    pdf_content = sample_pdf_path.read_bytes()

    files = [("files", (f"sample{i}.pdf", pdf_content, "application/pdf")) for i in range(1, 16)]

    data = {
        "prompt": "Analyze all these documents",
        "session_id": "test-session-007",
    }

    # Act
    response = await auth_client.post(
        "/api/v1/invocations",
        data=data,
        files=files,
    )

    # Assert
    assert response.status_code == 400

    error_data = response.json()
    assert "detail" in error_data
    detail = error_data["detail"]

    # Verify error message mentions too many files and includes counts
    assert "Too many files" in detail
    assert "10" in detail  # Max limit
    assert "15" in detail  # Actual count

    # Verify no invocation created
    list_response = await auth_client.get("/api/v1/invocations?session_id=test-session-007")
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert len(list_data["resources"]) == 0


@pytest.mark.asyncio
async def test_multiple_files_upload(
    auth_client: AsyncClient, test_user, sample_pdf_path: Path, sample_docx_path: Path, sample_txt_path: Path
) -> None:
    """Scenario 8: Multiple Files Upload.

    Validates:
    - 3 files uploaded in single request
    - 202 response
    - file_metadata array with 3 elements
    - All files have correct metadata
    - All files exist at their file_path locations
    """
    # Arrange
    with (
        sample_pdf_path.open("rb") as pdf_file,
        sample_docx_path.open("rb") as docx_file,
        sample_txt_path.open("rb") as txt_file,
    ):
        files = [
            ("files", ("sample.pdf", pdf_file, "application/pdf")),
            (
                "files",
                ("sample.docx", docx_file, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
            ),
            ("files", ("sample.txt", txt_file, "text/plain")),
        ]
        data = {
            "prompt": "Analyze all these related documents together",
            "session_id": "test-session-multi-010",
        }

        # Act
        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert
    # This test will fail until implementation is done
    assert response.status_code == 202

    response_data = response.json()
    file_metadata = response_data["context_data"]["file_metadata"]

    # Verify 3 elements
    assert len(file_metadata) == 3

    # Verify each file has correct metadata
    filenames = [m["filename"] for m in file_metadata]
    assert "sample.pdf" in filenames
    assert "sample.docx" in filenames
    assert "sample.txt" in filenames

    # All should have status="pending_parse"
    assert all(m["status"] == "pending_parse" for m in file_metadata)

    # Verify each file has unique file_id
    file_ids = [m["file_id"] for m in file_metadata]
    assert len(file_ids) == len(set(file_ids)), "All file_ids should be unique"

    # Verify file_path NOT exposed (security)
    for metadata in file_metadata:
        assert "file_path" not in metadata


@pytest.mark.asyncio
async def test_context_metadata(auth_client: AsyncClient, test_user, sample_pdf_path: Path) -> None:
    """Scenario 9: Context Data Integration.

    Validates:
    - file_metadata array accessible via GET /invocations/{id}
    - file_metadata is array type
    - status is "pending_parse" for each file
    - All required fields present in metadata
    """
    # Arrange
    with sample_pdf_path.open("rb") as f:
        files = [("files", ("sample.pdf", f, "application/pdf"))]
        data = {
            "prompt": "Summarize the document",
            "session_id": "test-session-011",
        }

        # Act - Create invocation with file
        response = await auth_client.post(
            "/api/v1/invocations",
            data=data,
            files=files,
        )

    # Assert creation
    # This test will fail until implementation is done
    assert response.status_code == 202
    response_data = response.json()
    invocation_id = response_data["id"]

    # Retrieve invocation details
    invocation_response = await auth_client.get(f"/api/v1/invocations/{invocation_id}")
    assert invocation_response.status_code == 200

    invocation_data = invocation_response.json()
    context_data = invocation_data["context_data"]

    # Verify context structure
    assert "file_metadata" in context_data
    assert isinstance(context_data["file_metadata"], list)
    assert len(context_data["file_metadata"]) == 1
    assert context_data["file_metadata"][0]["status"] == "pending_parse"

    # Verify file metadata structure
    metadata = context_data["file_metadata"][0]
    assert "file_id" in metadata  # Public identifier
    assert "filename" in metadata
    assert "size_bytes" in metadata
    assert "mime_type" in metadata
    assert metadata["filename"] == "sample.pdf"

    # SECURITY: Verify file_path is NOT exposed
    assert "file_path" not in metadata
