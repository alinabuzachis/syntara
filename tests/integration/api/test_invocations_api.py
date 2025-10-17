"""Integration tests for invocation API endpoints.

NOTE: This file will need updates when PR #53 merges to support:
- Bracket notation for query parameters (e.g., /api/v1/invocations?status[eq]=running)
- Updated pagination conventions from shared resources
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_invoke_returns_202_accepted(base_client: AsyncClient) -> None:
    """Test that POST /api/v1/invocations returns 202 Accepted status."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app to production",
            "user_id": "user-123",
            "session_id": "session-001",
        },
    )

    assert response.status_code == 202


@pytest.mark.asyncio
async def test_invoke_response_schema(base_client: AsyncClient) -> None:
    """Test that response matches expected schema."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app to production",
            "user_id": "user-123",
            "session_id": "session-001",
        },
    )

    data = response.json()

    # Required fields
    assert "invocation_id" in data
    assert "status" in data
    assert "created_at" in data

    # Field types
    assert isinstance(data["invocation_id"], str)
    assert data["status"] == "running"
    assert isinstance(data["created_at"], str)


@pytest.mark.asyncio
async def test_invoke_with_context(base_client: AsyncClient) -> None:
    """Test invocation request with context and metadata."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "user_id": "user-123",
            "session_id": "session-001",
            "context": {"environment": "production"},
            "metadata": {"correlation_id": "corr-123"},
        },
    )

    assert response.status_code == 202


@pytest.mark.asyncio
async def test_invoke_validation_empty_prompt(base_client: AsyncClient) -> None:
    """Test validation error for empty prompt."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "",
            "user_id": "user-123",
            "session_id": "session-001",
        },
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_invoke_validation_missing_user_id(base_client: AsyncClient) -> None:
    """Test validation error for missing user_id."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
        },
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_invoke_validation_prompt_too_long(base_client: AsyncClient) -> None:
    """Test validation error for prompt exceeding max length."""
    long_prompt = "x" * 10001

    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": long_prompt,
            "user_id": "user-123",
            "session_id": "session-001",
        },
    )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_list_invocations_returns_200(base_client: AsyncClient) -> None:
    """Test that GET /api/v1/invocations returns 200 OK."""
    response = await base_client.get("/api/v1/invocations")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_invocations_response_schema(base_client: AsyncClient) -> None:
    """Test that list response matches expected schema."""
    response = await base_client.get("/api/v1/invocations")

    data = response.json()

    # Required fields
    assert "invocations" in data
    assert "total" in data

    # Field types
    assert isinstance(data["invocations"], list)
    assert isinstance(data["total"], int)


@pytest.mark.asyncio
async def ***REMOVED***(base_client: AsyncClient) -> None:
    """Test filtering invocations by status.

    NOTE: After PR #53 merges, this will change to:
    /api/v1/invocations?status[eq]=running
    """
    # First create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "user_id": "user-123",
            "session_id": "session-001",
        },
    )

    response = await base_client.get("/api/v1/invocations?status=running")

    assert response.status_code == 200

    data = response.json()
    assert "invocations" in data

    # All returned invocations should have status=running
    for invocation in data["invocations"]:
        assert invocation["status"] == "running"


@pytest.mark.asyncio
async def test_list_invocations_with_pagination(base_client: AsyncClient) -> None:
    """Test pagination parameters.

    NOTE: Pagination conventions may change per PR #53 shared resources.
    """
    response = await base_client.get("/api/v1/invocations?limit=10&offset=0")

    assert response.status_code == 200

    data = response.json()
    assert len(data["invocations"]) <= 10


@pytest.mark.asyncio
async def test_list_invocations_invalid_limit(base_client: AsyncClient) -> None:
    """Test validation error for invalid limit."""
    response = await base_client.get("/api/v1/invocations?limit=0")

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_list_invocations_limit_too_large(base_client: AsyncClient) -> None:
    """Test validation error for limit exceeding maximum."""
    response = await base_client.get("/api/v1/invocations?limit=2000")

    assert response.status_code == 422  # Validation error
