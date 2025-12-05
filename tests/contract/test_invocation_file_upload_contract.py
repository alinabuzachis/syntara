"""Contract tests for POST /invocations with multipart/form-data file uploads.

These tests validate contract compliance with the OpenAPI schema:
- Multipart/form-data request schema with files array
- Files parameter is optional (backward compatibility)
- Files array maxItems: 10 constraint
- Response includes file_metadata array in context_data
- Security: file_path is NOT exposed in API response

Contract matches schemas/agent_orchestrator/agent-orchestrator-api.yaml
"""

import pytest
from httpx import AsyncClient

from nexus.core.constants import CONTEXT_KEY, CONTEXT_KEY_FILE_METADATA


@pytest.mark.asyncio
async def test_files_parameter_is_optional(
    auth_client_with_mocked_llm: AsyncClient,
) -> None:
    """Test that files parameter is optional (backward compatibility).

    Validates:
    - Request without files succeeds
    - context_data is empty when no files uploaded
    """
    # Arrange
    data = {
        "prompt": "No files needed",
        "session_id": "contract-test-002",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        data=data,
    )

    # Assert
    assert response.status_code == 202
    response_data = response.json()
    assert response_data.get(CONTEXT_KEY, {}) == {CONTEXT_KEY_FILE_METADATA: []}


@pytest.mark.asyncio
async def test_files_array_max_items_constraint(
    auth_client_with_mocked_llm: AsyncClient,
) -> None:
    """Test that files array enforces maxItems: 10 constraint.

    Validates:
    - Accepts up to 10 files (202)
    - Rejects 11+ files (400)
    """
    # Arrange - 10 files (should succeed)
    files_10 = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(10)]
    data = {
        "prompt": "Process 10 files",
        "session_id": "contract-test-003",
    }

    # Act - 10 files
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        data=data,
        files=files_10,
    )

    # Assert - Should succeed (10 files is within the default limit)
    assert response.status_code == 202

    # Arrange - 11 files (should fail)
    files_11 = [("files", (f"file{i}.pdf", b"PDF content", "application/pdf")) for i in range(11)]

    # Act - 11 files
    response_11 = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        data=data,
        files=files_11,
    )

    # Assert - Should reject
    assert response_11.status_code == 400


@pytest.mark.asyncio
async def test_response_schema_file_metadata(
    auth_client_with_mocked_llm: AsyncClient,
) -> None:
    """Test file_metadata array schema in response.

    Validates:
    - file_metadata is array in context_data
    - Each element has required fields: file_id, filename, size_bytes, mime_type, status
    - status field is "pending_parse"
    - SECURITY: file_path is NOT exposed in API response
    - Multiple files each get metadata
    """
    # Arrange - Upload 2 files to validate array behavior
    files = [
        ("files", ("doc1.pdf", b"First document", "application/pdf")),
        ("files", ("doc2.txt", b"Second document", "text/plain")),
    ]
    data = {
        "prompt": "Upload test",
        "session_id": "contract-test-004",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        data=data,
        files=files,
    )

    # Assert - Response structure
    assert response.status_code == 202
    response_data = response.json()
    assert CONTEXT_KEY in response_data
    assert CONTEXT_KEY_FILE_METADATA in response_data[CONTEXT_KEY]

    file_metadata = response_data[CONTEXT_KEY][CONTEXT_KEY_FILE_METADATA]
    assert isinstance(file_metadata, list)
    assert len(file_metadata) == 2

    # Assert - Each file has required schema fields
    for metadata in file_metadata:
        assert "file_id" in metadata  # Public identifier
        assert "filename" in metadata
        assert "size_bytes" in metadata
        assert "mime_type" in metadata
        assert "status" in metadata
        assert metadata["status"] == "pending_parse"

        # SECURITY: Verify file_path is NOT exposed in API response
        assert "file_path" not in metadata, "file_path must not be exposed (security issue)"

    # Assert - Filenames match uploaded files
    filenames = {m["filename"] for m in file_metadata}
    assert filenames == {"doc1.pdf", "doc2.txt"}
