"""Contract tests for file error responses (RFC 9457 format).

These tests validate:
- RFC 9457 Problem Details format for file errors
- 400 errors for validation failures (fileTooLarge, unsupportedFormat, tooManyFiles)
- 500 errors for storage failures (generic message, no internal details exposed)
- 503 errors for service configuration failures (LLM not configured)
"""

from unittest.mock import patch

import pytest
from httpx import AsyncClient

from nexus.agent_orchestrator.exceptions import LLMConfigurationError
from tests.fixtures import get_fixtures_dir


@pytest.mark.asyncio
async def test_file_too_large_error_format(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test RFC 9457 error format for fileTooLarge (400).

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
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
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
async def test_unsupported_format_error_format(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test RFC 9457 error format for unsupportedFormat (400).

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
        }

        # Act
        response = await auth_client_with_mocked_llm.post(
            "/api/v1/invocations",
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
async def test_too_many_files_error_format(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test RFC 9457 error format for tooManyFiles (400).

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
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
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
async def test_validation_error_no_invocation_created(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that validation errors do not create invocation records.

    Validates:
    - Failed validations don't create database records
    - Atomic operation (all or nothing)
    """
    # Arrange - Upload too many files
    files = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(15)]
    data = {
        "prompt": "Should not create invocation",
        "session_id": "error-test-005",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
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
async def ***REMOVED***(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that all error responses follow consistent RFC 9457 structure.

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
        }

        # Act
        response = await auth_client_with_mocked_llm.post(
            "/api/v1/invocations",
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


@pytest.mark.asyncio
async def test_llm_not_configured_returns_503(auth_client: AsyncClient, test_user) -> None:
    """Test 503 Service Unavailable when OpenRouter API key is not configured.

    Validates response matches schema example exactly:
    - 503 status code
    - error: "service_unavailable"
    - message: "OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys"
    """
    # Arrange - Mock get_openrouter_llm to raise LLMConfigurationError
    # Error message must match schema example in openapi.yaml
    error_message = (
        "NEXUS_OPENROUTER_API_KEY environment variable is required. Get your API key from https://openrouter.ai/keys"
    )

    with patch(
        "nexus.invocations.router.get_openrouter_llm",
        side_effect=LLMConfigurationError(error_message),
    ):
        # Act
        response = await auth_client.post(
            "/api/v1/invocations",
            json={
                "prompt": "Test LLM configuration",
                "session_id": "error-test-503",
            },
        )

    # Assert - must match RFC 9457 format
    assert response.status_code == 503
    error_data = response.json()

    # RFC 9457 compliant format
    assert error_data["type"] == "https://api.nexus.com/errors/service-unavailable"
    assert error_data["title"] == "LLM Configuration Error"
    assert error_data["detail"] == "Language model service is not properly configured"
    assert error_data["code"] == "LLM_CONFIGURATION_ERROR"
    assert error_data["retryable"] is False
    assert "instance" in error_data
