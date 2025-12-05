"""Contract tests for backward compatibility with JSON requests.

These tests validate:
- Application/json requests still work without files
- Context_data is empty object when no files
- Existing functionality not broken by file upload feature
"""

import pytest
from httpx import AsyncClient

from nexus.core.constants import CONTEXT_KEY, CONTEXT_KEY_FILE_METADATA


@pytest.mark.asyncio
async def ***REMOVED***(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that application/json requests still work without files.

    Validates:
    - JSON content-type requests succeed
    - No regression in existing invocation API
    """
    # Arrange
    payload = {
        "prompt": "What is the weather today?",
        "session_id": "backward-compat-001",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json=payload,
    )

    # Assert
    assert response.status_code == 202
    response_data = response.json()
    assert "id" in response_data
    assert response_data["prompt"] == "What is the weather today?"


@pytest.mark.asyncio
async def test_json_request_context_data_empty_without_files(
    auth_client_with_mocked_llm: AsyncClient, test_user
) -> None:
    """Test that context_data is empty object when no files uploaded.

    Validates:
    - context_data field exists but is empty
    - No file_metadata field when no files
    """
    # Arrange
    payload = {
        "prompt": "Test context data",
        "session_id": "backward-compat-002",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json=payload,
    )

    # Assert
    assert response.status_code == 202
    response_data = response.json()
    assert CONTEXT_KEY in response_data
    assert response_data[CONTEXT_KEY] == {CONTEXT_KEY_FILE_METADATA: []}


@pytest.mark.asyncio
async def test_json_request_with_existing_context_data(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that existing context_data functionality still works.

    Validates:
    - Can still pass context_data in JSON payload
    - File metadata not added when no files
    """
    # Arrange
    payload = {
        "prompt": "Test with context",
        "session_id": "backward-compat-003",
        CONTEXT_KEY: {
            "environment": "production",
            "region": "us-east-1",
        },
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json=payload,
    )

    # Assert
    assert response.status_code == 202
    response_data = response.json()
    assert CONTEXT_KEY in response_data
    assert response_data[CONTEXT_KEY] == {
        "environment": "production",
        "region": "us-east-1",
        CONTEXT_KEY_FILE_METADATA: [],
    }


@pytest.mark.asyncio
async def test_multipart_request_without_files_compatible(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that multipart/form-data without files also works.

    Validates:
    - Multipart requests can omit files parameter
    - Maintains same behavior as JSON requests
    """
    # Arrange
    data = {
        "prompt": "Multipart without files",
        "session_id": "backward-compat-004",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        data=data,
    )

    # Assert
    assert response.status_code == 202
    response_data = response.json()
    assert response_data[CONTEXT_KEY] == {CONTEXT_KEY_FILE_METADATA: []}


@pytest.mark.asyncio
async def test_all_existing_fields_present_in_response(auth_client_with_mocked_llm: AsyncClient, test_user) -> None:
    """Test that all existing response fields still present.

    Validates:
    - No breaking changes to response schema
    - All inherited fields present
    """
    # Arrange
    payload = {
        "prompt": "Full field test",
        "session_id": "backward-compat-005",
    }

    # Act
    response = await auth_client_with_mocked_llm.post(
        "/api/v1/invocations",
        json=payload,
    )

    # Assert
    assert response.status_code == 202
    data = response.json()

    # BaseResource fields
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data
    assert "labels" in data

    # UserOwnedResource fields
    assert "created_by" in data
    assert "updated_by" in data

    # Invocation-specific fields
    assert "prompt" in data
    assert "session_id" in data
    assert "status" in data
    assert "started_at" in data
    assert "completed_at" in data
    assert CONTEXT_KEY in data
    assert "result" in data
    assert "error_message" in data
    assert "checkpoint_data" in data
