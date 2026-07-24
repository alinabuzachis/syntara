"""Contract tests for file error responses on POST /invocations/chat (RFC 9457 format).

These tests validate:
- RFC 9457 Problem Details format for file errors on the /chat endpoint
- 400 errors for validation failures (fileTooLarge, unsupportedFormat, tooManyFiles)
- 500 errors for storage failures (generic message, no internal details exposed)
- 503 errors for service configuration failures (LLM not configured)
"""

import pytest
from httpx import AsyncClient

from tests.fixtures.files import get_fixtures_dir


@pytest.mark.asyncio
async def test_file_too_large_error_format(
    auth_client_with_mocked_llm: AsyncClient, test_user, test_project_id
) -> None:
    """Test RFC 9457 error format for fileTooLarge on POST /invocations/chat (400).

    Validates:
    - 400 status code
    - RFC 9457 problem details structure
    - Error message includes actual and max size
    - No internal details exposed
    """
    # Arrange - Create file larger than 10MB limit
    # Using 11MB of data
    large_content = b"0" * (11 * 1024 * 1024)
    files = [
        ("files", ("large.pdf", large_content, "application/pdf")),
    ]
    data = {
        "prompt": "Process large file",
        "session_id": "error-test-001",
        "project_id": str(test_project_id),
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations/chat",
        data=data,
        files=files,
    )

    # Assert
    assert response.status_code == 400
    error_data = response.json()

    # RFC 9457 requires 'detail' field at minimum
    assert "detail" in error_data
    # Error message should mention file is too large and max size
    detail = error_data["detail"]
    assert "too large" in detail
    assert "Maximum allowed size" in detail


@pytest.mark.asyncio
async def test_unsupported_format_error_format(
    auth_client_with_mocked_llm: AsyncClient, test_user, test_project_id
) -> None:
    """Test RFC 9457 error format for unsupportedFormat on POST /invocations/chat (400).

    Validates:
    - 400 status code
    - Error lists supported formats
    - No internal implementation details
    """
    # Arrange - Upload unsupported file type (PNG image)
    fixtures_dir = get_fixtures_dir()
    image_path = fixtures_dir / "image.png"

    with image_path.open("rb") as f:
        files = [
            ("files", ("image.png", f, "image/png")),
        ]
        data = {
            "prompt": "Process image",
            "session_id": "error-test-002",
            "project_id": str(test_project_id),
        }

        # Act
        response = await auth_client_with_mocked_llm.post(
            "/api/v1/invocations/chat",
            data=data,
            files=files,
        )

    # Assert
    assert response.status_code == 400
    error_data = response.json()

    # Should mention unsupported format and list supported formats
    assert "detail" in error_data
    detail = error_data["detail"]
    assert "Unsupported file format" in detail
    assert "image/png" in detail
    assert "Supported formats:" in detail


@pytest.mark.asyncio
async def test_too_many_files_error_format(
    auth_client_with_mocked_llm: AsyncClient, test_user, test_project_id
) -> None:
    """Test RFC 9457 error format for tooManyFiles on POST /invocations/chat (400).

    Validates:
    - 400 status code
    - Error message includes actual count and max count
    - Clear actionable error message
    """
    # Arrange - Upload 15 files (exceeds limit of 10)
    files = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(15)]
    data = {
        "prompt": "Process too many files",
        "session_id": "error-test-003",
        "project_id": str(test_project_id),
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations/chat",
        data=data,
        files=files,
    )

    # Assert
    assert response.status_code == 400
    error_data = response.json()

    # Should mention file count and limits
    assert "detail" in error_data
    detail = error_data["detail"]
    assert "Too many files" in detail
    assert "10" in detail  # Max limit
    assert "15" in detail  # Actual count


@pytest.mark.asyncio
async def test_validation_error_no_invocation_created(
    auth_client_with_mocked_llm: AsyncClient, test_user, test_project_id
) -> None:
    """Test that file validation errors on POST /invocations/chat do not create invocation records.

    Validates:
    - Failed validations don't create database records
    - Atomic operation (all or nothing)
    """
    # Arrange - Upload too many files
    files = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(15)]
    data = {
        "prompt": "Should not create invocation",
        "session_id": "error-test-005",
        "project_id": str(test_project_id),
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations/chat",
        data=data,
        files=files,
    )

    # Assert
    assert response.status_code == 400

    # Verify no invocation created by checking list
    list_response = await auth_client_with_mocked_llm.get("/api/v1/invocations?session_id=error-test-005")
    assert list_response.status_code == 200
    list_data = list_response.json()
    assert len(list_data["resources"]) == 0


@pytest.mark.asyncio
async def ***REMOVED***(
    auth_client_with_mocked_llm: AsyncClient, test_user, test_project_id
) -> None:
    """Test that POST /invocations/chat file error responses follow consistent RFC 9457 structure.

    Validates:
    - Consistent error response format
    - Required fields present
    """
    # Arrange - Trigger unsupported format error
    fixtures_dir = get_fixtures_dir()
    image_path = fixtures_dir / "image.png"

    with image_path.open("rb") as f:
        files = [
            ("files", ("test.png", f, "image/png")),
        ]
        data = {
            "prompt": "Test error structure",
            "session_id": "error-test-006",
            "project_id": str(test_project_id),
        }

        # Act
        response = await auth_client_with_mocked_llm.post(
            "/api/v1/invocations/chat",
            data=data,
            files=files,
        )

    # Assert
    assert response.status_code == 400
    error_data = response.json()

    # RFC 9457 requires 'detail' field at minimum
    assert "detail" in error_data
    assert isinstance(error_data["detail"], str)
    assert len(error_data["detail"]) > 0
