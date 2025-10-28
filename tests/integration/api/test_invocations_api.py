"""Integration tests for invocation API endpoints."""

from unittest.mock import AsyncMock, patch

import pytest
from httpx import AsyncClient
from langchain_core.messages import AIMessage


@pytest.mark.asyncio
async def test_invoke_returns_202_accepted(base_client: AsyncClient, test_user) -> None:
    """Test that POST /api/v1/invocations returns 202 Accepted status."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app to production",
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    assert response.status_code == 202


@pytest.mark.asyncio
async def test_invoke_response_schema(base_client: AsyncClient, test_user) -> None:
    """Test that response matches expected schema."""
    # Mock LangChain LLM response
    with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="App deployed to production successfully")
        mock_get_llm.return_value = mock_llm

        response = await base_client.post(
            "/api/v1/invocations",
            json={
                "prompt": "Deploy app to production",
                "created_by": str(test_user.id),
                "session_id": "session-001",
            },
        )

    data = response.json()

    # Required fields
    assert "id" in data
    assert "status" in data
    assert "created_at" in data
    assert "created_by" in data
    assert "prompt" in data
    assert "session_id" in data

    # Field types and values
    assert isinstance(data["id"], str)
    assert data["status"] in ["running", "completed"]  # Sync execution completes immediately
    assert isinstance(data["created_at"], str)
    assert data["created_by"] == str(test_user.id)
    assert data["prompt"] == "Deploy app to production"
    assert data["session_id"] == "session-001"


@pytest.mark.asyncio
async def test_invoke_with_context(base_client: AsyncClient, test_user) -> None:
    """Test invocation request with context data."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "created_by": str(test_user.id),
            "session_id": "session-001",
            "context_data": {"environment": "production", "region": "us-east-1"},
        },
    )

    assert response.status_code == 202
    data = response.json()
    assert data["context_data"] == {"environment": "production", "region": "us-east-1"}


@pytest.mark.asyncio
async def test_invoke_validation_missing_created_by(base_client: AsyncClient, test_user) -> None:
    """Test validation error for missing created_by."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "session_id": "session-001",
        },
    )

    assert response.status_code in (400, 422)  # Validation error


@pytest.mark.asyncio
async def test_invoke_validation_missing_session_id(base_client: AsyncClient, test_user) -> None:
    """Test validation error for missing session_id."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "created_by": str(test_user.id),
        },
    )

    assert response.status_code in (400, 422)  # Validation error


@pytest.mark.asyncio
async def test_list_invocations_returns_200(base_client: AsyncClient, test_user) -> None:
    """Test that GET /api/v1/invocations returns 200 OK."""
    response = await base_client.get("/api/v1/invocations")

    assert response.status_code == 200


@pytest.mark.asyncio
async def test_list_invocations_response_schema(base_client: AsyncClient, test_user) -> None:
    """Test that list response matches expected schema."""
    response = await base_client.get("/api/v1/invocations")

    data = response.json()

    # Required fields
    assert "resources" in data
    assert "total" in data

    # Field types
    assert isinstance(data["resources"], list)
    # total is None by default unless include_total=true
    assert data["total"] is None or isinstance(data["total"], int)


@pytest.mark.asyncio
async def ***REMOVED***(base_client: AsyncClient, test_user) -> None:
    """Test filtering invocations by status."""
    # First create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    response = await base_client.get("/api/v1/invocations?status=running")

    assert response.status_code == 200

    data = response.json()
    assert "resources" in data

    # All returned invocations should have status=running
    for invocation in data["resources"]:
        assert invocation["status"] == "running"


@pytest.mark.asyncio
async def test_list_invocations_with_pagination(base_client: AsyncClient, test_user) -> None:
    """Test pagination with limit parameter."""
    response = await base_client.get("/api/v1/invocations?limit=10")

    assert response.status_code == 200

    data = response.json()
    assert len(data["resources"]) <= 10


@pytest.mark.asyncio
async def test_list_invocations_invalid_limit(base_client: AsyncClient, test_user) -> None:
    """Test validation error for invalid limit."""
    response = await base_client.get("/api/v1/invocations?limit=0")

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_list_invocations_limit_too_large(base_client: AsyncClient, test_user) -> None:
    """Test validation error for limit exceeding maximum."""
    response = await base_client.get("/api/v1/invocations?limit=2000")

    assert response.status_code == 422  # Validation error


# New filtering capability tests


@pytest.mark.asyncio
async def test_list_invocations_filter_by_created_by(base_client: AsyncClient, test_user) -> None:
    """Test filtering invocations by creator UUID."""
    user_uuid = str(test_user.id)

    # Create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Test prompt",
            "created_by": user_uuid,
            "session_id": "session-001",
        },
    )

    # Filter by creator
    response = await base_client.get(f"/api/v1/invocations?created_by={user_uuid}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created by this user
    for invocation in data["resources"]:
        assert invocation["created_by"] == user_uuid


@pytest.mark.asyncio
async def test_list_invocations_filter_by_session_id(base_client: AsyncClient, test_user) -> None:
    """Test filtering invocations by session ID."""
    session_id = "test-session-123"

    # Create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Test prompt",
            "created_by": str(test_user.id),
            "session_id": session_id,
        },
    )

    # Filter by session ID
    response = await base_client.get(f"/api/v1/invocations?session_id={session_id}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have this session ID
    for invocation in data["resources"]:
        assert invocation["session_id"] == session_id


@pytest.mark.asyncio
async def test_list_invocations_with_sorting(base_client: AsyncClient, test_user) -> None:
    """Test sorting invocations by created_at descending."""
    response = await base_client.get("/api/v1/invocations?sort=-created_at&limit=5")

    assert response.status_code == 200
    data = response.json()

    # Verify results are sorted (if multiple results)
    if len(data["resources"]) > 1:
        # Should be in descending order by created_at
        for i in range(len(data["resources"]) - 1):
            current = data["resources"][i]["created_at"]
            next_item = data["resources"][i + 1]["created_at"]
            assert current >= next_item


@pytest.mark.asyncio
async def test_list_invocations_with_include_total(base_client: AsyncClient, test_user) -> None:
    """Test include_total parameter returns total count."""
    response = await base_client.get("/api/v1/invocations?include_total=true")

    assert response.status_code == 200
    data = response.json()

    # Should have total field
    assert "total" in data
    assert isinstance(data["total"], int)
    assert data["total"] >= 0


@pytest.mark.asyncio
async def test_list_invocations_pagination_metadata(base_client: AsyncClient, test_user) -> None:
    """Test pagination response includes next/prev cursors."""
    response = await base_client.get("/api/v1/invocations?limit=1")

    assert response.status_code == 200
    data = response.json()

    # Should have pagination metadata
    assert "next" in data
    assert "prev" in data
    # next may be None if only one result
    assert data["next"] is None or isinstance(data["next"], str)
    # prev should be None for first page
    assert data["prev"] is None or isinstance(data["prev"], str)


@pytest.mark.asyncio
async def test_list_invocations_with_multiple_filters(base_client: AsyncClient, test_user) -> None:
    """Test combining multiple filters."""
    user_uuid = str(test_user.id)
    session_id = "multi-filter-session"

    # Create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Multi-filter test",
            "created_by": user_uuid,
            "session_id": session_id,
        },
    )

    # Filter by multiple criteria
    response = await base_client.get(
        f"/api/v1/invocations?status=running&created_by={user_uuid}&session_id={session_id}"
    )

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should match all filters
    for invocation in data["resources"]:
        assert invocation["status"] == "running"
        assert invocation["created_by"] == user_uuid
        assert invocation["session_id"] == session_id


# POST validation tests


@pytest.mark.asyncio
async def test_invoke_validation_missing_prompt(base_client: AsyncClient, test_user) -> None:
    """Test validation error for missing prompt."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    assert response.status_code in (400, 422)  # Validation error


@pytest.mark.asyncio
async def test_invoke_validation_empty_prompt(base_client: AsyncClient, test_user) -> None:
    """Test validation error for empty prompt."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "",
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    assert response.status_code in (400, 422)  # Validation error


@pytest.mark.asyncio
async def test_invoke_validation_invalid_created_by_uuid(base_client: AsyncClient, test_user) -> None:
    """Test validation error for invalid created_by UUID."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy app",
            "created_by": "not-a-valid-uuid",
            "session_id": "session-001",
        },
    )

    assert response.status_code in (400, 422)  # Validation error


@pytest.mark.asyncio
async def test_invoke_with_very_long_prompt(base_client: AsyncClient, test_user) -> None:
    """Test invocation with very long prompt (near max length)."""
    # OpenAPI spec shows maxLength: 10000 for prompt
    long_prompt = "Deploy application " * 500  # ~9000 chars

    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": long_prompt,
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    assert response.status_code == 202
    data = response.json()
    assert data["prompt"] == long_prompt


@pytest.mark.asyncio
async def test_invoke_validation_prompt_exceeds_max_length(base_client: AsyncClient, test_user) -> None:
    """Test validation error for prompt exceeding max length (10000 chars)."""
    # Create a prompt that exceeds 10000 characters
    too_long_prompt = "a" * 10001

    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": too_long_prompt,
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

    assert response.status_code in (400, 422)  # Validation error


# Sorting tests


@pytest.mark.asyncio
async def test_list_invocations_sort_ascending(base_client: AsyncClient, test_user) -> None:
    """Test sorting invocations by created_at ascending."""
    response = await base_client.get("/api/v1/invocations?sort=created_at&limit=5")

    assert response.status_code == 200
    data = response.json()

    # Verify results are sorted ascending (if multiple results)
    if len(data["resources"]) > 1:
        for i in range(len(data["resources"]) - 1):
            current = data["resources"][i]["created_at"]
            next_item = data["resources"][i + 1]["created_at"]
            assert current <= next_item


@pytest.mark.asyncio
async def test_list_invocations_sort_by_updated_at(base_client: AsyncClient, test_user) -> None:
    """Test sorting by updated_at field."""
    response = await base_client.get("/api/v1/invocations?sort=-updated_at&limit=5")

    assert response.status_code == 200
    data = response.json()

    # Should return results sorted by updated_at
    if len(data["resources"]) > 1:
        for i in range(len(data["resources"]) - 1):
            current = data["resources"][i]["updated_at"]
            next_item = data["resources"][i + 1]["updated_at"]
            assert current >= next_item


@pytest.mark.asyncio
async def test_list_invocations_invalid_sort_field(base_client: AsyncClient, test_user) -> None:
    """Test that invalid sort field returns 400 error."""
    response = await base_client.get("/api/v1/invocations?sort=invalid_field")

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def test_list_invocations_sort_by_non_sortable_field(base_client: AsyncClient, test_user) -> None:
    """Test that sorting by non-sortable field (e.g., status) returns 400."""
    response = await base_client.get("/api/v1/invocations?sort=status")

    assert response.status_code == 400
    data = response.json()
    assert "detail" in data


@pytest.mark.asyncio
async def ***REMOVED***(base_client: AsyncClient, test_user) -> None:
    """Test that default sort order is -created_at (descending)."""
    # Create two invocations with slight delay to ensure different timestamps
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "First invocation",
            "created_by": str(test_user.id),
            "session_id": "default-sort-test",
        },
    )

    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Second invocation",
            "created_by": str(test_user.id),
            "session_id": "default-sort-test",
        },
    )

    # Get without explicit sort parameter
    response = await base_client.get("/api/v1/invocations?session_id=default-sort-test")

    assert response.status_code == 200
    data = response.json()

    # Should be sorted by created_at descending (newest first)
    if len(data["resources"]) >= 2:
        assert data["resources"][0]["prompt"] == "Second invocation"
        assert data["resources"][1]["prompt"] == "First invocation"


# Status filtering tests


@pytest.mark.asyncio
async def test_list_invocations_filter_by_completed_status(base_client: AsyncClient, test_user) -> None:
    """Test filtering by completed status."""
    response = await base_client.get("/api/v1/invocations?status=completed")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have status=completed
    for invocation in data["resources"]:
        assert invocation["status"] == "completed"


@pytest.mark.asyncio
async def test_list_invocations_filter_by_failed_status(base_client: AsyncClient, test_user) -> None:
    """Test filtering by failed status."""
    response = await base_client.get("/api/v1/invocations?status=failed")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have status=failed
    for invocation in data["resources"]:
        assert invocation["status"] == "failed"


@pytest.mark.asyncio
async def test_list_invocations_invalid_status(base_client: AsyncClient, test_user) -> None:
    """Test validation error for invalid status value."""
    response = await base_client.get("/api/v1/invocations?status=invalid_status")

    assert response.status_code == 422  # Validation error


# Response field completeness tests


@pytest.mark.asyncio
async def ***REMOVED***(base_client: AsyncClient, test_user) -> None:
    """Test that POST response includes all expected fields including inherited ones."""
    response = await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Complete field test",
            "created_by": str(test_user.id),
            "session_id": "session-001",
        },
    )

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
    assert "context_data" in data
    assert "result" in data
    assert "error_message" in data
    assert "checkpoint_data" in data


@pytest.mark.asyncio
async def test_list_response_includes_all_fields(base_client: AsyncClient, test_user) -> None:
    """Test that GET response resources include all fields."""
    # Create an invocation first
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Field test",
            "created_by": str(test_user.id),
            "session_id": "field-test",
        },
    )

    response = await base_client.get("/api/v1/invocations?session_id=field-test")

    assert response.status_code == 200
    data = response.json()

    if len(data["resources"]) > 0:
        invocation = data["resources"][0]

        # Verify all fields are present
        assert "id" in invocation
        assert "created_at" in invocation
        assert "updated_at" in invocation
        assert "labels" in invocation
        assert "created_by" in invocation
        assert "updated_by" in invocation
        assert "prompt" in invocation
        assert "session_id" in invocation
        assert "status" in invocation
        assert "context_data" in invocation


@pytest.mark.asyncio
async def test_invoke_null_fields_handling(base_client: AsyncClient, test_user) -> None:
    """Test that null/optional fields are properly returned as null."""
    # Mock LangChain LLM response
    with patch("nexus.agent_orchestrator.services.invocation_service.get_openrouter_llm") as mock_get_llm:
        mock_llm = AsyncMock()
        mock_llm.ainvoke.return_value = AIMessage(content="Null field test completed")
        mock_get_llm.return_value = mock_llm

        response = await base_client.post(
            "/api/v1/invocations",
            json={
                "prompt": "Null field test",
                "created_by": str(test_user.id),
                "session_id": "session-001",
            },
        )

        assert response.status_code == 202
        data = response.json()

        # Optional fields - execution is synchronous so started_at/completed_at are populated
        assert data["started_at"] is not None  # Synchronous execution starts immediately
        assert data["completed_at"] is not None  # Synchronous execution completes immediately

        # Result may be None if OpenRouter API key is not configured (in CI)
        # If configured, result should be present; if not, error_message should explain
        if data["result"] is None:
            # No OpenRouter API key - should have error message
            assert data["error_message"] is not None
            assert "OPENROUTER_API_KEY" in data["error_message"]
            assert data["status"] == "failed"
        else:
            # OpenRouter configured - should have successful result
            assert data["error_message"] is None
            assert data["status"] == "completed"

        assert data["checkpoint_data"] is None
        assert data["updated_by"] is None


# Pagination tests


@pytest.mark.asyncio
async def test_list_invocations_cursor_pagination(base_client: AsyncClient, test_user) -> None:
    """Test cursor-based pagination using next cursor."""
    # Get first page
    response1 = await base_client.get("/api/v1/invocations?limit=1")
    assert response1.status_code == 200
    data1 = response1.json()

    # If there's a next cursor, use it to get next page
    if data1["next"] is not None:
        response2 = await base_client.get(f"/api/v1/invocations?cursor={data1['next']}&limit=1")
        assert response2.status_code == 200
        data2 = response2.json()

        # Should have different resources (if there are multiple invocations)
        if len(data1["resources"]) > 0 and len(data2["resources"]) > 0:
            assert data1["resources"][0]["id"] != data2["resources"][0]["id"]


@pytest.mark.asyncio
async def test_list_invocations_cursor_with_filters(base_client: AsyncClient, test_user) -> None:
    """Test that cursor pagination works with filters."""
    # Get first page with filter
    response = await base_client.get("/api/v1/invocations?status=running&limit=1")

    assert response.status_code == 200
    data = response.json()

    # If there's a next cursor, it should maintain the filter
    if data["next"] is not None:
        response2 = await base_client.get(f"/api/v1/invocations?cursor={data['next']}&status=running&limit=1")
        assert response2.status_code == 200


# Edge case tests


@pytest.mark.asyncio
async def test_list_invocations_empty_results(base_client: AsyncClient, test_user) -> None:
    """Test list with filter that returns no results."""
    # Use a UUID that doesn't exist
    response = await base_client.get("/api/v1/invocations?created_by=00000000-0000-0000-0000-999999999999")

    assert response.status_code == 200
    data = response.json()

    assert data["resources"] == []
    assert data["next"] is None
    assert data["prev"] is None


@pytest.mark.asyncio
async def test_list_invocations_with_limit_one(base_client: AsyncClient, test_user) -> None:
    """Test pagination with minimum limit (1)."""
    response = await base_client.get("/api/v1/invocations?limit=1")

    assert response.status_code == 200
    data = response.json()

    assert len(data["resources"]) <= 1


# Advanced filtering tests


@pytest.mark.asyncio
async def test_list_invocations_filter_prompt_contains(base_client: AsyncClient, test_user) -> None:
    """Test filtering by prompt text with contains operator."""
    # Create invocations with different prompts
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy application to production",
            "created_by": str(test_user.id),
            "session_id": "prompt-filter-test",
        },
    )

    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Analyze system metrics",
            "created_by": str(test_user.id),
            "session_id": "prompt-filter-test",
        },
    )

    # Filter by prompt containing "Deploy"
    response = await base_client.get("/api/v1/invocations?prompt[contains]=Deploy")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should contain "Deploy" in prompt
    for invocation in data["resources"]:
        assert "Deploy" in invocation["prompt"]


@pytest.mark.asyncio
async def test_list_invocations_filter_prompt_starts_with(base_client: AsyncClient, test_user) -> None:
    """Test filtering by prompt text with starts_with operator."""
    # Create invocations
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Deploy application",
            "created_by": str(test_user.id),
            "session_id": "prompt-filter-test-2",
        },
    )

    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Analyze deployment logs",
            "created_by": str(test_user.id),
            "session_id": "prompt-filter-test-2",
        },
    )

    # Filter by prompts starting with "Deploy"
    response = await base_client.get("/api/v1/invocations?prompt[starts_with]=Deploy")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should start with "Deploy"
    for invocation in data["resources"]:
        assert invocation["prompt"].startswith("Deploy")


@pytest.mark.asyncio
async def test_list_invocations_filter_by_labels(base_client: AsyncClient, test_user) -> None:
    """Test filtering by label key-value pairs."""
    # Note: This test assumes labels can be set on POST, which may need implementation
    response = await base_client.get("/api/v1/invocations?labels[environment]=production")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have environment=production label
    for invocation in data["resources"]:
        if invocation.get("labels"):
            assert invocation["labels"].get("environment") == "production"


@pytest.mark.asyncio
async def test_list_invocations_filter_by_multiple_labels(base_client: AsyncClient, test_user) -> None:
    """Test filtering by multiple label key-value pairs."""
    response = await base_client.get("/api/v1/invocations?labels[environment]=production&labels[team]=platform")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have both labels
    for invocation in data["resources"]:
        if invocation.get("labels"):
            assert invocation["labels"].get("environment") == "production"
            assert invocation["labels"].get("team") == "platform"


@pytest.mark.asyncio
async def test_list_invocations_filter_created_at_gt(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_at greater than timestamp."""
    # Use ISO 8601 timestamp
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?created_at[gt]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created after the timestamp
    for invocation in data["resources"]:
        assert invocation["created_at"] > timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_created_at_gte(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_at greater than or equal to timestamp."""
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?created_at[gte]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created at or after the timestamp
    for invocation in data["resources"]:
        assert invocation["created_at"] >= timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_created_at_lt(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_at less than timestamp."""
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?created_at[lt]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created before the timestamp
    for invocation in data["resources"]:
        assert invocation["created_at"] < timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_created_at_lte(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_at less than or equal to timestamp."""
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?created_at[lte]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created at or before the timestamp
    for invocation in data["resources"]:
        assert invocation["created_at"] <= timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_created_at_range(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_at range using gte and lte."""
    start_time = "2025-10-21T09:00:00Z"
    end_time = "2025-10-21T11:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?created_at[gte]={start_time}&created_at[lte]={end_time}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be within the time range
    for invocation in data["resources"]:
        assert invocation["created_at"] >= start_time
        assert invocation["created_at"] <= end_time


@pytest.mark.asyncio
async def test_list_invocations_filter_updated_at_gt(base_client: AsyncClient, test_user) -> None:
    """Test filtering by updated_at greater than timestamp."""
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?updated_at[gt]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be updated after the timestamp
    for invocation in data["resources"]:
        assert invocation["updated_at"] > timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_updated_at_lte(base_client: AsyncClient, test_user) -> None:
    """Test filtering by updated_at less than or equal to timestamp."""
    timestamp = "2025-10-21T10:00:00Z"

    response = await base_client.get(f"/api/v1/invocations?updated_at[lte]={timestamp}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be updated at or before the timestamp
    for invocation in data["resources"]:
        assert invocation["updated_at"] <= timestamp


@pytest.mark.asyncio
async def test_list_invocations_filter_created_by_eq_operator(base_client: AsyncClient, test_user) -> None:
    """Test filtering by created_by with explicit eq operator."""
    user_uuid = str(test_user.id)

    # Create an invocation
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Test created_by operator",
            "created_by": user_uuid,
            "session_id": "created-by-op-test",
        },
    )

    # Filter using explicit eq operator (currently only simple param works)
    response = await base_client.get(f"/api/v1/invocations?created_by[eq]={user_uuid}")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should be created by this user
    for invocation in data["resources"]:
        assert invocation["created_by"] == user_uuid


@pytest.mark.asyncio
async def test_list_invocations_filter_session_id_eq_operator(base_client: AsyncClient, test_user) -> None:
    """Test filtering by session_id with explicit eq operator."""
    session_id = "test-session-eq"

    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Test session_id eq operator",
            "created_by": str(test_user.id),
            "session_id": session_id,
        },
    )

    # Filter using explicit eq operator
    response = await base_client.get(f"/api/v1/invocations?session_id[eq]={session_id}")

    assert response.status_code == 200
    data = response.json()

    for invocation in data["resources"]:
        assert invocation["session_id"] == session_id


@pytest.mark.asyncio
async def test_list_invocations_filter_session_id_contains(base_client: AsyncClient, test_user) -> None:
    """Test filtering by session_id with contains operator."""
    # Create invocations with different session IDs
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Session contains test 1",
            "created_by": str(test_user.id),
            "session_id": "prod-session-001",
        },
    )

    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Session contains test 2",
            "created_by": str(test_user.id),
            "session_id": "dev-session-002",
        },
    )

    # Filter by session_id containing "prod"
    response = await base_client.get("/api/v1/invocations?session_id[contains]=prod")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should have "prod" in session_id
    for invocation in data["resources"]:
        assert "prod" in invocation["session_id"]


@pytest.mark.asyncio
async def test_list_invocations_filter_session_id_starts_with(base_client: AsyncClient, test_user) -> None:
    """Test filtering by session_id with starts_with operator."""
    await base_client.post(
        "/api/v1/invocations",
        json={
            "prompt": "Session starts_with test",
            "created_by": str(test_user.id),
            "session_id": "prefix-session-123",
        },
    )

    # Filter by session_id starting with "prefix"
    response = await base_client.get("/api/v1/invocations?session_id[starts_with]=prefix")

    assert response.status_code == 200
    data = response.json()

    # All returned invocations should start with "prefix"
    for invocation in data["resources"]:
        assert invocation["session_id"].startswith("prefix")
